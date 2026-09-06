/**
 * CREATE — one sentence and one mind (docs/REDESIGN.md §6.3).
 *
 * The screen is a single card over the arena, not a page: a fight is running
 * underneath while the player writes, and that is the whole argument for the
 * product. Two decisions are asked for and nothing else — the description and
 * the mind. Body, name, size and the three abilities all follow from the
 * sentence, so there is nothing to configure and no configuration is offered.
 *
 * What the player never sees here: model identifiers, tiers, money, or the
 * vendors' vocabulary for thinking. A mind has a name, a provider mark and a
 * measured wait; a mode is QUICK or DEEP.
 */

import { get, post, track } from '../lib/api.js';
import { h, mount, clear } from '../lib/dom.js';
import { latinOnly, num } from '../lib/format.js';
import { icon } from '../ui/icons.js';
import { mindMark } from '../ui/mind.js';
import { attachTooltip, hideTooltip } from '../ui/tooltip.js';
import {
  MODE_WORD, NO_REASON, defaultBundle, edgeFade, familiesOf, familyOf, featuredFamilies,
  normalizeBundles, openMindPicker, rememberMind, waitLabel,
} from '../ui/mindpicker.js';

const MAX = 280;
const DRAFT_KEY = 'airena.draft';

/**
 * Why a creature cannot be made right now — eight codes, eight honest
 * sentences. The server sends English (§9); this map is what the screen shows
 * when it only has the code, which is the case for `session.createBlocked`.
 */
const DENY_TEXT = {
  account_day: 'Today’s generations are used up. The next one opens at 00:00 UTC.',
  account_month: 'This month’s generations are used up.',
  budget_day: 'No more creatures today — the arena has spent its daily allowance. It opens again at 00:00 UTC.',
  concurrent: 'Too many creatures are being made right now. Try again in a minute.',
  request_cost: 'This mind is too heavy for one request. Choose another one.',
  not_free: 'Payments are not open yet, so this mind cannot be used.',
  guest: 'This account cannot create a creature.',
  free_used: 'This account already has its free creature.',
  short_prompt: 'Write one sentence — that is enough.',
  internal: 'The safety check did not answer. We do not start a generation we are not sure we can finish.',
  offline: 'The server is not answering. The fights run on it, so nothing is lost.',
  /* The ninth code, and the reason it is here: the server's own sentence for
     it read `This mind cannot be reached right now. Choose another one.` while
     the card directly above the button said the mind was resting and the
     picker's header counted it as resting. One condition, three wordings, all
     three in one frame. `NO_REASON` is the sentence the whole screen uses. */
  worker_offline: NO_REASON,
};

/**
 * THREE SENTENCES INSTEAD OF AN EMPTY FIELD.
 *
 * This is the highest-stakes input in the product and it was a blank box, a
 * grey placeholder and a dead button — the classic blank page, at the one
 * moment a stranger has decided nothing yet. A press is not a shortcut past
 * the writing: it fills the field with a real sentence the player can then
 * edit, which is how a first line usually gets written.
 *
 * The chip is two words and the sentence is on it (tooltip + the field itself
 * the moment it is pressed), because three full sentences as pills is three
 * wrapped lines of chrome under the one thing the player is meant to look at.
 * The arena's own starters replace these when the server has English ones
 * (see `loadStarters`); these are the floor, not the ceiling.
 */
const STARTERS = [
  { label: 'Glass spider', prompt: 'A glass spider that keeps its distance and strikes from the dark' },
  { label: 'Walking furnace', prompt: 'A walking furnace that burns whatever comes close to it' },
  { label: 'Stone titan', prompt: 'A patient stone titan that never retreats and hits harder the longer it stands' },
];

/**
 * The catalogue the capture stand draws (§10).
 *
 * The dev stand's own catalogue carries two mind families, so the flagship
 * CREATE screenshot showed two cards where the product shows a row of them and
 * the screen's dominant element was under-photographed. `?ui=create` and
 * `?ui=picker` both render this list instead: plausible, frozen, never stored.
 * The order is the composition — the fastest mind first so it is the one
 * selected and the one wearing the QUICK · DEEP toggle, and one unavailable
 * mind inside the row so the dimmed state is photographed too.
 */
const DEMO_BUNDLES = [
  { id: 'google/gemini-3.7-flash:plain', model: 'google/gemini-3.7-flash', name: 'Gemini 3.7 Flash', provider: 'Google', mode: 'quick', featured: true, waitSecs: 206, available: true, unavailableReason: null },
  { id: 'google/gemini-3.7-flash:think', model: 'google/gemini-3.7-flash', name: 'Gemini 3.7 Flash', provider: 'Google', mode: 'deep', featured: false, waitSecs: 425, available: true, unavailableReason: null },
  { id: 'z-ai/glm-5.3-flash:plain', model: 'z-ai/glm-5.3-flash', name: 'GLM 5.3 Flash', provider: 'Z.ai', mode: 'quick', featured: true, waitSecs: 268, available: true, unavailableReason: null },
  { id: 'z-ai/glm-5.3-flash:think', model: 'z-ai/glm-5.3-flash', name: 'GLM 5.3 Flash', provider: 'Z.ai', mode: 'deep', featured: false, waitSecs: 436, available: true, unavailableReason: null },
  /* `unavailableReason: null` on purpose. `dimReason()` (src/server/api.js)
     returns null for every account that is not on the worker list, precisely
     so the client supplies the player-facing half — so a fixture that carries
     an operator's sentence photographs a string no visitor will ever read.
     Null renders what ships: `reasonOf()` → `NO_REASON` (ui/mindpicker.js). */
  { id: 'sub:opus:think', model: 'sub:opus', name: 'Claude Opus', provider: 'Anthropic', mode: 'deep', featured: true, waitSecs: null, available: false, unavailableReason: null },
  { id: 'sub:fable:plain', model: 'sub:fable', name: 'Claude Fable', provider: 'Anthropic', mode: 'quick', featured: true, waitSecs: 214, available: true, unavailableReason: null },
  { id: 'z-ai/glm-5.3:plain', model: 'z-ai/glm-5.3', name: 'GLM 5.3', provider: 'Z.ai', mode: 'quick', featured: true, waitSecs: 312, available: true, unavailableReason: null },
  { id: 'kit-stub', model: 'kit-stub', name: 'Airena Reference', provider: 'Airena', mode: null, featured: false, waitSecs: 232, available: true, unavailableReason: null },
];

/** The record behind each mind on the capture stand — plausible, frozen (§10). */
const DEMO_RECORD = {
  'google/gemini-3.7-flash': { winrate: 58, creatures: 340, fights: 12904 },
  'z-ai/glm-5.3-flash': { winrate: 51, creatures: 212, fights: 8140 },
  'sub:fable': { winrate: 62, creatures: 96, fights: 3180 },
  'z-ai/glm-5.3': { winrate: 47, creatures: 154, fights: 5602 },
};

/** The two names under the card on the capture stand (§10). */
const DEMO_LIVE = { a: 'STONE GOLEM', b: 'NEEDLE-79' };

/**
 * The allowance the capture stand's owner has left (§10).
 *
 * `/api/session` sends `limits.perAccountPerDay` but not how many of them are
 * gone, so the live screen prints the rule until the server adds the count
 * (see `allowanceText`). The capture is the design being photographed, so it
 * carries the shape the line is for: two of three left, frozen.
 */
const DEMO_LIMITS = { perAccountPerDay: 3, usedToday: 1 };

/**
 * The sentence the capture stand's owner wrote the first time (§10).
 *
 * The returning player's screen opens on their own previous description, and a
 * screenshot of that has to be the same words every run — the live database
 * carries legacy rows in Russian, which `latinOnly` drops, so the owner state
 * would photograph as a blank field on some stands and a full one on others.
 */
const DEMO_PRIOR = 'A patient stone titan that never retreats and hits harder the longer it stands';

/** How many mind cards the row holds before the rest move into the picker. */
const ROW_MINDS = 4;

/**
 * How much fighting a mind has to have done before its record is quoted on a
 * card. A win rate over nine fights is noise printed as a fact, and this card
 * is where a stranger decides; the fallback (FRONTIER / the provider) says
 * less and is never wrong.
 */
const MIN_TAG_FIGHTS = 60;

let picker = null;
let draftTimer = null;
let flushDraft = null;
let offSession = null;
let offLive = null;
let offNarrow = null;
let offStrip = null;
/* Bumped on every enter/leave, so a catalogue that lands after the player has
   walked off paints into nothing instead of into the next screen. */
let visit = 0;

export async function enter(root, args, ctx) {
  const debug = ctx.store.debug;
  const session = ctx.store.session;
  const mine = ++visit;

  /* Two screens live in this one file: the stranger's and the owner's second
     generation. They differ by two lines of copy, and the capture stand claims
     a creature for the whole run (`tools/shots.mjs`), so the stranger's screen
     — the one a first-time player actually sees — could never be photographed.
     `?ui=create-visitor` renders it on demand and stores nothing (§10). */
  const visitor = debug === 'create-visitor' || !session?.creature;
  const staged = debug === 'picker' || debug === 'create' || debug === 'create-visitor';

  /*
   * THE STRANGER'S FIRST FRAME IS A PLACE, NOT A BLUR.
   *
   * The route table stands Create over the live arena behind a veil (§3), and
   * that is right for a player whose own creature is fighting underneath: the
   * blur is a fight they can identify. A visitor has no fight down there, the
   * arena is untextured geometry, and ten pixels of blur over a warm wash turn
   * it into a featureless beige field — the very first thing anyone ever sees
   * of this product, carrying no world at all. The backdrop (§2.4) is the same
   * bowl the creature and ladder screens stand on, and a stranger has no reason
   * to open either. `data-ground` is the shell's own attribute (§4.2) and the
   * router rewrites it on the next navigation, so this is a change of ground
   * for one screen and not a new state to unwind.
   *
   * The same argument answers the owner, and it is not about who they are: the
   * veil is earned by a fight, not by an account. An owner who opens Create
   * between two of their creature's fights — or on a cold load, before the
   * socket has said anything at all — is standing over the same empty geometry
   * a stranger is, and photographs the same beige. So the ground starts on the
   * place, and `settleGround` hands the veil over the moment there is genuinely
   * something under it to blur. One way only: a ground that came back on every
   * bell would be the arena flickering under a form.
   */
  if (visitor || !ctx.store.live?.match) document.body.dataset.ground = 'stage';

  function settleGround() {
    if (visitor || !ctx.store.live?.match) return;
    document.body.dataset.ground = 'veil';
  }

  /* The catalogue is a network call and the screen is not.
   *
   * The shell holds an incoming screen at `opacity: 0` until `enter()`
   * resolves (app.js), so awaiting `/api/catalog` up here left the previous
   * screen on the glass with nothing to say that the click had landed. The
   * card is built and mounted first with the mind row drawn as its own shape,
   * exactly as the ladder does with its rows; the minds arrive into it. */
  let bundles = [];
  let chosen = null;
  let starters = [];
  /* family model id → { winrate, creatures, fights } from /api/models */
  let record = new Map();

  /* The draft outlives a closed tab: it is the most expensive line the player
     types all session, and it is typed before anything is saved anywhere. */
  let draft = {};
  try { draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}') || {}; } catch { draft = {}; }

  const gen = Number(session?.creature?.generation || 0) + 1;

  /**
   * THE SECOND GENERATION IS AN EDIT, NOT A RESTART.
   *
   * The creature page says "Learn from its fights, then describe a sharper
   * one." and then handed the returning player the same blank box a stranger
   * gets — so improving a sentence meant remembering a sentence written days
   * ago. It arrives in the field instead, with one chip under it that says
   * where it came from and clears it in a press. Only when nothing was drafted:
   * a half-typed idea the player left behind outranks the description they have
   * already spent a creature on. Legacy rows are Russian and are dropped
   * (`latinOnly`, §7.6) rather than shown.
   */
  const priorGen = String(Number(session?.creature?.generation || 1)).padStart(2, '0');
  const prior = (visitor || draft.prompt)
    ? ''
    : (staged ? DEMO_PRIOR : latinOnly(String(session?.creature?.prompt || '')).trim().slice(0, MAX));

  /* True from the press until the route changes or the server refuses; the
     counter must not quietly re-enable the button under a live request. */
  let busy = false;

  /* The counter is the field's description, so it needs a name the field can
     point at. One screen, one field: a constant is enough and it keeps the
     markup readable. */
  const COUNT_ID = 'create-count';

  const field = h('textarea.field.create-field', {
    rows: 3,
    maxlength: MAX,
    'aria-label': 'Describe your creature',
    'aria-describedby': COUNT_ID,
    placeholder: 'A heavy mechanical crocodile that becomes more aggressive when wounded',
    value: draft.prompt || prior,
    oninput: () => { paintCount(); paintStarters(); keepDraft(); },
  });

  /*
   * The counter is read as well as seen.
   *
   * `0 / 280` is the kit's mark and stays exactly that on screen; a reader
   * hears "0 of 280 characters" instead, because a slash is announced as a
   * slash and the field silently stops accepting input at the limit. Two spans
   * rather than one: the live region announces its text, so the spoken form
   * has to BE text somewhere in it.
   */
  const countSeen = h('span', { 'aria-hidden': 'true' }, `0 / ${MAX}`);
  const countSaid = h('span.create-sr');
  const counter = h('div.create-count.t-label', { id: COUNT_ID, role: 'status' }, countSeen, countSaid);

  const startersRow = h('div.create-starters');
  const mindRow = h('div.mind-row-cards', { dataset: { n: '0' } });
  const modeNote = h('div.create-mode-note.t-small');
  const browseSlot = h('div.create-browse');
  const denyBox = h('div.create-deny');
  const liveLine = h('div.create-live');
  /*
   * THE PRICE IS STATED BEFORE IT IS CHARGED.
   *
   * The daily allowance was disclosed by a refusal — eleven DENY sentences and
   * the birth screen's "This attempt used one of today's generations." — so a
   * stranger learned the rule at the moment it cost them one. It is a caption
   * under the button instead, in the quietest type on the card, where it is
   * read on the way to the press and never argued with.
   */
  const allowBox = h('div.create-allow.t-label');
  const goBtn = h('button.btn.primary.big', { type: 'button', onclick: submit });
  paintButton(false);

  const browse = h('button.btn.ghost.small.browse', { type: 'button', onclick: openPicker },
    'Browse all minds', icon('chevron-down', 14));

  mount(root, h('div.create-wrap',
    h('div.create-card.glass.strong',
      h('div.create-head',
        h('div.t-title', 'Create a creature'),
        h('div.t-small', visitor
          ? 'Describe anything you can imagine. Body, name and abilities follow from the sentence.'
          : `Generation ${String(gen).padStart(2, '0')} · your current creature keeps its record`),
        /* The one thing a stranger cannot guess from a text field and a button:
           the sentence is the last instruction they will ever give. Everything
           else on this screen reads like a character creator, so the rule that
           makes the product what it is has to be said outright, once, before
           the first creature and never again. */
        visitor ? h('div.create-claim', 'You won’t control it. It fights on its own — you watch it climb.') : null),

      /* The chips and the counter share the line under the field: they are
         both about what is in it, and two separate bands would have pushed
         the mind row — and with it the button — further down the phone. */
      h('div.create-input', field, startersRow, counter),

      h('div.create-minds',
        h('div.create-minds-head',
          h('div.t-label.label-line', 'Choose its mind'),
          /* Wait time was the only visible difference between two minds, which
             makes the fastest one the rational choice and hides the second
             pillar of the product behind a number that reads as a cost. */
          h('div.t-small.create-minds-note',
            'The mind makes every decision in the fight. Different minds fight differently.')),
        mindRow,
        modeNote,
        browseSlot),

      denyBox,
      /* The footer carries both halves of the moment: a fight that is already
         running, and the button that puts a creature into it. Right-aligned
         alone it left five hundred pixels of empty glass beside the only
         action on the screen. */
      h('div.create-foot', liveLine, h('div.create-go', goBtn, allowBox)))));

  /* The live strip's SHAPE follows the width, not only the data: two names and
     a verb do not fit in 322 px, and it was rendering `STONE G… vs NEEDL…` —
     the one line on the screen whose whole job is to prove the arena is alive,
     printed as broken text. Below 600 px it drops to one name, which is the
     half that proves it. Declared before the first paint, because the first
     paint asks it which shape to draw. */
  const narrow = matchMedia('(max-width: 600px)');
  const onNarrow = () => paintLive();

  /* On a phone the mind row is a scroller, and a scroller that meets the
     viewport on a hard vertical reads as a broken layout rather than as
     content that continues. The fade is measured at both ends (`edgeFade`),
     so a row that fits is never drawn as if it did not. */
  const stripFade = edgeFade(mindRow);
  offStrip = stripFade.stop;

  paintCount();
  paintSkeleton();
  paintLive();
  paintAllowance();
  track('create_opened', {});
  if (session?.createBlocked) showDeny(session.createBlocked);

  /* A creature born in another tab, or a generation that just started, must
     take this screen off the player's hands. */
  offSession = ctx.on('session', (s) => {
    if (s?.job && (s.job.state === 'queued' || s.job.state === 'running') && !ctx.store.debug) {
      ctx.go(`/birth/${s.job.id}`);
    }
  });
  /* The line under the card — and the ground behind it — follow whatever the
     arena is doing. */
  offLive = ctx.on('live', () => { paintLive(); settleGround(); });
  narrow.addEventListener?.('change', onNarrow);
  offNarrow = () => narrow.removeEventListener?.('change', onNarrow);

  await load();

  /* ── what the screen is made of ─────────────────────────────────────────── */

  /**
   * Three requests, one wait, and none of them can take the screen down.
   *
   * The catalogue decides the mind row; the arena's starters decide the chips;
   * the standings decide the one fact a card can say about a mind besides how
   * long it takes. Only the first is load-bearing, so the other two are
   * settled rather than awaited into a failure.
   */
  async function load() {
    await Promise.all([loadMinds(), loadStarters(), loadRecord()]);
  }

  async function loadMinds() {
    if (staged) {
      bundles = normalizeBundles(DEMO_BUNDLES);
    } else {
      try {
        const cat = await get('/api/catalog');
        bundles = normalizeBundles(cat?.bundles);
      } catch (e) {
        /* No catalog is not a dead screen: the player can still write, and the
           mind falls back to whatever the server picks by default. */
        bundles = [];
        if (e?.code === 'offline') throw e;
      }
    }
    if (mine !== visit) return;                /* the player left while it loaded */

    chosen = bundles.find((b) => b.id === draft.bundle && b.available)?.id
      || defaultBundle(bundles)?.id
      || null;

    paintMinds();
    mount(browseSlot, bundles.length ? browse : null);
    if (debug === 'picker') openPicker();
  }

  /**
   * The example sentences, from the arena when it has any.
   *
   * `/api/starters` answers with creature cards, not with seed text, so what
   * is usable here is the pair (name, prompt) — and only when both are English
   * and the sentence is one. Legacy rows are Russian and are dropped by
   * `latinOnly`; a stand with nothing usable falls back to the three written
   * above rather than showing the player an empty strip.
   */
  async function loadStarters() {
    let live = [];
    if (!staged) {
      try {
        const rows = await get('/api/starters');
        live = (Array.isArray(rows) ? rows : [])
          .map((c) => ({ label: latinOnly(String(c?.name || '')).trim(), prompt: latinOnly(String(c?.prompt || '')).trim() }))
          .filter((s) => s.label && s.label.length <= 22 && s.prompt.length >= 24 && s.prompt.length <= 160);
      } catch { live = []; }
    }
    if (mine !== visit) return;
    starters = [...live, ...STARTERS].slice(0, 3);
    paintStarters();
  }

  /**
   * What each mind has actually done, so the card can say something other than
   * how long the player will wait. Small samples are dropped rather than
   * rounded: a percentage nobody can stand behind is worse than no percentage.
   */
  async function loadRecord() {
    let rows = [];
    if (staged) {
      rows = Object.entries(DEMO_RECORD).map(([model, r]) => ({ model, ...r }));
    } else {
      try {
        const t = await get('/api/models');
        rows = Array.isArray(t?.rows) ? t.rows : [];
      } catch { rows = []; }
    }
    if (mine !== visit) return;
    const next = new Map();
    for (const r of rows) {
      const key = familyOf(r);
      const fights = Number(r.fights || 0);
      const winrate = Number(r.winrate);
      if (!key || !Number.isFinite(winrate) || fights < MIN_TAG_FIGHTS) continue;
      const cur = next.get(key);
      /* One family, several bundles: the biggest sample wins the card. */
      if (!cur || fights > cur.fights) next.set(key, { winrate: Math.round(winrate), fights, creatures: Number(r.creatures || 0) });
    }
    record = next;
    if (bundles.length) paintMinds();
  }

  /* ── the minds ──────────────────────────────────────────────────────── */

  /**
   * Four cards — and the chosen mind is always one of them, even when it came
   * from the picker and is not featured. A selection the player cannot see is
   * the same as no selection.
   */
  function visibleFamilies() {
    const row = featuredFamilies(bundles, ROW_MINDS);
    const own = familiesOf(bundles).find((f) => f.bundles.some((b) => b.id === chosen));
    if (own && !row.some((f) => f.model === own.model)) return [own, ...row].slice(0, ROW_MINDS);
    return row;
  }

  /* The row keeps its shape while the catalogue is on the wire: four cards'
     worth of nothing, which is what the row is about to be. */
  function paintSkeleton() {
    mindRow.dataset.n = String(ROW_MINDS);
    mount(mindRow, [0, 1, 2, 3].map(() => h('div.skel.mind-skel')));
    stripFade.paint();
  }

  function paintMinds() {
    const families = visibleFamilies();
    mindRow.dataset.n = String(families.length);
    if (!families.length) {
      mindRow.dataset.n = '0';
      mount(mindRow, h('div.t-small.muted', 'The list of minds could not be read. The arena will choose one.'));
      mount(modeNote, null);
      stripFade.paint();
      return;
    }
    mount(mindRow, families.map((f, i) => mindCard(f, i)));
    stripFade.paint();
    paintModeNote(families);
    /* The cards rise once, on arrival. Re-selecting a mind repaints the row
       and must not replay it — a composition that re-enters on every click
       reads as a fault, not as motion. */
    if (!mindRow.dataset.settled) {
      mindRow.classList.add('in');
      mindRow.dataset.settled = '1';
      setTimeout(() => mindRow.classList.remove('in'), 800);
    }
  }

  /**
   * One mind, drawn on five bands, the same five on every card: mark, name,
   * record, meter, footer — and the footer is itself two fixed rows.
   *
   * THE ROW IS READ ACROSS BEFORE IT IS READ DOWN, and it only reads across if
   * every card carries the same facts in the same places. Three things used to
   * break that, and all three were one line landing at a different height on
   * each card.
   *
   * 1. The rule under the record was the footer's divider — tinted blue when
   *    the card was chosen, deleted altogether when the mind was resting.
   *    Sitting directly under `58% WINS` it read as a meter: a meter drawn at
   *    full width whatever the number above it said, and coloured by SELECTION
   *    rather than by value. It is a real meter now (`.mind-card-meter`): its
   *    width is the win rate, and the one thing colour can honestly carry here
   *    is whether that rate is above or below half. A mind with no record keeps
   *    the band and draws nothing in it, so the hairlines under all four stay
   *    on one line. Selection is said by the card's own rim and glow, which is
   *    the only thing that should be saying it.
   * 2. The record used to share the strip with the speed toggle, so CHOOSING a
   *    mind deleted its `58% WINS` — the number a stranger was comparing on,
   *    gone from the only card they had decided anything about. It is a caption
   *    on the name now, where it survives every state.
   * 3. The footer held one line of text on three cards and a two-line toggle on
   *    the fourth, and the toggle's own two waits were set at about 8.5 px, one
   *    of them in `--info` on white. It is two reserved rows on every card now:
   *    the control — a segmented toggle when this mind is chosen and has two
   *    speeds, otherwise the one word it is offering — and the wait under it,
   *    once, in `--t-label` and `--muted`. Every hairline and every wait lands
   *    on one line across the row however the player has chosen.
   *
   * The whole card is the target (the button's overlay covers it); only the
   * toggle sits above that overlay, because it is the one thing inside the
   * card that means something different from the card.
   */
  function mindCard(f, i) {
    const selected = f.bundles.some((b) => b.id === chosen);
    const current = f.bundles.find((b) => b.id === chosen) || f.pick;
    const modes = f.bundles.filter((b) => b.mode);
    const showSeg = selected && f.available && modes.length > 1;
    const stat = record.get(f.model) || null;

    const el = h('div.mind-card', {
      class: `${selected ? 'on' : ''} ${f.available ? '' : 'off'}`.trim(),
      dataset: { model: f.model },
    },
      /*
       * ENABLED, AND SAYING NO ANYWAY.
       *
       * A `disabled` button cannot be focused, so the reason a mind is out of
       * reach was unreachable from the keyboard entirely, and its full-card
       * overlay swallowed the tap that a phone would have used to raise the
       * tooltip. `aria-disabled` says the same thing to a reader while leaving
       * the card reachable; `choose()` is the one that actually refuses.
       */
      h('button.mind-card-hit', {
        type: 'button',
        'aria-disabled': f.available ? null : 'true',
        'aria-pressed': selected ? 'true' : 'false',
        onclick: () => choose(current),
      },
        h('span.mind-card-mark.circle', mindMark(f.pick.id, 20)),
        h('span.mind-card-name', f.name),
        h('span.mind-card-kind', kindOf(f, stat)),
        meterOf(stat)),
      h('div.mind-card-foot',
        h('div.mind-card-ctl',
          showSeg ? modeSeg(modes) : h('span.mind-card-read', readOf(f, current))),
        h('div.mind-card-wait.t-label', waitOf(f, current))));

    /* The stagger is computed from the index, not written out per position:
       §8.5 allows five featured minds and only four had a delay, so a fifth
       card arrived on the same frame as the first. */
    el.style.setProperty('--i', String(i));

    /* Every card can be asked what it is. A dimmed one has the most to say and
       used to be the only one saying nothing (§6.3). */
    attachTooltip(el, () => ({ title: f.name, body: cardTip(f, stat) }));
    return el;
  }

  /** What a card says when the player asks it, in one sentence. */
  function cardTip(f, stat) {
    if (!f.available) return f.pick.unavailableReason || NO_REASON;
    if (stat) return `${stat.winrate}% of fights won across ${num(stat.creatures)} creatures this season.`;
    return `From ${f.provider}. No season record yet — it has not fought enough.`;
  }

  /**
   * The win rate as a length, not as a rule.
   *
   * The band is drawn on every card whether or not there is a number for it,
   * because what keeps four cards readable across is that the line under the
   * record is always in the same place. `--v` is the width; the fill is the
   * only place on this card where colour carries a value, so it carries the
   * one comparison a win rate supports on sight — above half or below it.
   */
  function meterOf(stat) {
    const v = stat ? Math.max(0, Math.min(100, Math.round(stat.winrate))) : 0;
    const el = h('span.mind-card-meter', {
      class: stat ? (v >= 50 ? 'good' : 'low') : 'none',
      'aria-hidden': 'true',
    }, h('i'));
    /* `setProperty` and not `h`'s style object: `Object.assign(el.style, …)`
       cannot write a custom property — it lands as an expando on the style
       object and the meter draws at zero. */
    el.style.setProperty('--v', `${v}%`);
    return el;
  }

  /** The one word the footer's control row says when it is not a toggle. */
  function readOf(f, b) {
    if (!f.available) return 'Resting';
    if (b?.mode) return MODE_WORD[b.mode];
    return f.provider;
  }

  /** How long this mind takes, said once, under whatever the control row is. */
  function waitOf(f, b) {
    if (!f.available) return '';
    const w = waitLabel(b?.waitSecs);
    return w ? `${w} wait` : '';
  }

  /**
   * QUICK · DEEP — two equal cells in one track.
   *
   * The two speeds were not parallel: QUICK stood in a white pill with a
   * shadow while DEEP was bare text on the card's own ground with no hit area
   * of its own, so the choice read as one button and a caption. Both are cells
   * of the same size in a `--sand` track now, and the wait each of them buys
   * has left the cells for a single line under the whole control
   * (`.mind-card-wait`) — where it can be read at all.
   */
  function modeSeg(modes) {
    return h('div.seg.mind-modes', { role: 'group', 'aria-label': 'Speed' },
      modes.map((b) => h('button', {
        type: 'button',
        class: `${b.id === chosen ? 'on' : ''} ${b.available ? '' : 'off'}`.trim(),
        /* Same reason as the card: `disabled` hides the reason from everyone
           who is not holding a mouse, so the segment stays reachable and says
           no. */
        'aria-disabled': b.available ? null : 'true',
        'aria-pressed': b.id === chosen ? 'true' : 'false',
        'aria-label': b.available
          ? `${MODE_WORD[b.mode]} · ${waitLabel(b.waitSecs) || 'wait not measured yet'}`
          : `${MODE_WORD[b.mode]} · ${b.unavailableReason || NO_REASON}`,
        onclick: () => choose(b),
      }, MODE_WORD[b.mode])));
  }

  /**
   * What the two speeds are, said once and in words.
   *
   * The segment shows QUICK and DEEP with two wait estimates under them, which
   * reads as "pay more time for nothing". The line appears only while a mind
   * that has both is chosen, and it says what the extra minutes buy without
   * borrowing the vendors' vocabulary for it (§6.3).
   */
  function paintModeNote(families) {
    const own = families.find((f) => f.bundles.some((b) => b.id === chosen));
    const two = own && own.available && own.bundles.filter((b) => b.mode).length > 1;
    mount(modeNote, two
      ? 'Deep is slower, and written with more deliberation.'
      : null);
  }

  /**
   * The caption under the name: the one fact this mind has earned.
   *
   * It is not conditioned on availability any more. A mind that is resting has
   * still won the fights it won, and blanking the record on the dimmed card was
   * the screen forgetting a true thing in order to repeat a state the card is
   * already grey to say.
   */
  function kindOf(f, stat) {
    /* `WINS` is a count everywhere else in the product — `5,385 WINS` in the
       career header, `11 WINS` in the away recap — and this is a percentage.
       The ladder's column, the podium cards and the creature page's record
       tile all call the same number a win rate; so does this. */
    if (stat) return `${stat.winrate}% win rate`;
    return f.featured ? 'Frontier' : f.provider;
  }

  function choose(b) {
    if (!b || !b.available) return;
    chosen = b.id;
    rememberMind(b.id);
    hideTooltip();
    paintMinds();
    keepDraft();
  }

  /* `onClose` and not just the returned handle: the picker closes itself the
     moment a mind is chosen, and a handle to a closed modal is a second
     `close()` waiting for `leave()` to fire it at a screen on its way out. */
  function openPicker() {
    picker?.close();
    picker = openMindPicker({
      bundles, selected: chosen, onPick: choose, onClose: () => { picker = null; },
    });
  }

  /* ── the sentence ───────────────────────────────────────────────────── */

  /**
   * Three ways in, for the player who has not decided what to describe.
   *
   * A chip is a label; the sentence behind it goes into the field, so the
   * player reads what they are about to send in the place they will edit it.
   * The chip that matches what is in the field is marked, because a press that
   * leaves no trace reads as a press that did nothing.
   */
  function paintStarters() {
    const now = field.value.trim();
    /* While the box still holds the previous generation's sentence, the line
       under it is about THAT, not about examples: where the words came from,
       and one press to be rid of them. The examples come back the moment the
       player clears or edits it. */
    if (prior && now === prior) {
      mount(startersRow, h('button.chip.create-from', {
        type: 'button',
        'aria-label': `Clear the description from generation ${priorGen}`,
        onclick: clearPrior,
      }, `From generation ${priorGen}`, h('i', '·'), h('b', 'Clear')));
      return;
    }
    if (!starters.length) { clear(startersRow); return; }
    mount(startersRow,
      h('span.t-label.create-try', 'Try one'),
      h('div.create-chips', starters.map((s) => {
        const chip = h('button.chip.create-chip', {
          type: 'button',
          class: now === s.prompt ? 'on' : '',
          'aria-pressed': now === s.prompt ? 'true' : 'false',
          onclick: () => useStarter(s),
        }, s.label);
        attachTooltip(chip, () => ({ title: s.label, body: s.prompt }));
        return chip;
      })));
  }

  function clearPrior() {
    field.value = '';
    paintCount();
    paintStarters();
    keepDraft();
    hideTooltip();
    field.focus();
    track('create_cleared', {});
  }

  function useStarter(s) {
    field.value = s.prompt.slice(0, MAX);
    paintCount();
    paintStarters();
    keepDraft();
    hideTooltip();
    field.focus();
    try { field.setSelectionRange(field.value.length, field.value.length); } catch { /* not a text field on some engines */ }
    track('create_starter', { promptChars: field.value.length });
  }

  /* ── what a press costs ─────────────────────────────────────────────── */

  /**
   * How many generations are left, in the fewest words that are true.
   *
   * `/api/session` sends the RULE (`limits.perAccountPerDay`) but not how much
   * of it is spent, so the exact count is printed only when the server offers
   * one (`limits.usedToday`, or `limits.leftToday`). Until then the line says
   * the rule, which is still the thing a stranger does not know — an invented
   * count would be worse than none, because the number under a button is read
   * as a promise. The capture stand carries `DEMO_LIMITS`, so the design is
   * photographed in the shape it is for.
   */
  function allowanceText() {
    const lim = staged ? DEMO_LIMITS : (session?.limits || null);
    const per = Number(lim?.perAccountPerDay);
    if (!Number.isFinite(per) || per <= 0) return '';
    const made = staged
      ? (visitor ? 0 : 1)
      : Number(session?.creatures?.length ?? (session?.creature ? 1 : 0));
    if (!made) return 'Your first creature is free';
    const left = Number.isFinite(Number(lim.leftToday))
      ? Number(lim.leftToday)
      : (Number.isFinite(Number(lim.usedToday)) ? per - Number(lim.usedToday) : null);
    if (left === null) return `${per} generations a day`;
    const n = Math.max(0, Math.min(per, left));
    return `${n} of ${per} generations left today`;
  }

  /* A refusal already names the allowance in a whole sentence, so the caption
     stands down while one is on the screen rather than saying it twice. */
  function paintAllowance(hidden = false) {
    mount(allowBox, hidden ? null : (allowanceText() || null));
  }

  function paintCount() {
    const n = field.value.trim().length;
    if (!busy) goBtn.disabled = n < 3;
    countSeen.textContent = `${field.value.length} / ${MAX}`;
    countSaid.textContent = `${field.value.length} of ${MAX} characters`;
    counter.classList.toggle('full', field.value.length >= MAX);
  }

  /* ── the fight underneath ───────────────────────────────────────────── */

  /**
   * One line that says the arena is not a screenshot.
   *
   * The card stands over a live fight and the veil makes that fight a texture,
   * which is the right call for a form and the wrong one for the argument the
   * screen is making. The names are the argument: two creatures nobody in this
   * session made are fighting right now, and the way in is one press.
   */
  function paintLive() {
    const names = liveNames();
    if (!names) { clear(liveLine); return; }
    if (narrow.matches) {
      /*
       * THE PAIR SURVIVES THE PHONE.
       *
       * It used to drop to one name, and the name it kept was `names.a` — the
       * blue side, which is whichever creature the arena happened to seat
       * there. So the line could print the OPPONENT under `LIVE NOW`, and with
       * one name it read as a state ("live now: stone golem") rather than as a
       * fight in progress, which is the only thing it is here to prove.
       *
       * Both names stay, the whole line is the link, and the names give up
       * letters before the sentence gives up its verb: each is `min-width: 0`
       * with an ellipsis of its own, so a very long pair degrades to
       * `STONE GOL… vs NEEDLE-7…` and still says what it is.
       */
      mount(liveLine,
        h('span.dot'),
        h('span.t-label.create-live-what', 'Live now'),
        h('a.create-live-go.t-label.solo', { href: '#/live', 'aria-label': `Watch ${names.a} against ${names.b}` },
          h('b', names.a), h('i', 'vs'), h('b', names.b), icon('arrow-right', 13)));
      return;
    }
    mount(liveLine,
      h('span.dot'),
      h('span.t-label.create-live-what', 'Live now'),
      h('span.create-live-who', h('b', names.a), h('i', 'vs'), h('b', names.b)),
      h('a.create-live-go.t-label', { href: '#/live' }, 'Watch it', icon('arrow-right', 13)));
  }

  function liveNames() {
    if (staged) return DEMO_LIVE;
    const m = ctx.store.live?.match;
    const a = latinOnly(String(m?.names?.blue || '')).trim();
    const b = latinOnly(String(m?.names?.orange || '')).trim();
    return (a && b) ? { a: a.toUpperCase(), b: b.toUpperCase() } : null;
  }

  /* ── the button ─────────────────────────────────────────────────────── */

  /**
   * The button says what it is doing.
   *
   * A greyed button is what a refusal looks like, so using it for "working"
   * makes a slow POST read as a dead click — the player presses again, or
   * leaves. No spinner and no percentage (§1.5): the verb in the present
   * continuous is the whole acknowledgement, and it stands until the route
   * changes to `/birth/…` or the server refuses.
   */
  function paintButton(on) {
    busy = on;
    goBtn.disabled = on || field.value.trim().length < 3;
    goBtn.classList.toggle('busy', on);
    mount(goBtn, on ? 'Creating…' : ['Create', icon('arrow-right')]);
  }

  function keepDraft() {
    clearTimeout(draftTimer);
    draftTimer = setTimeout(writeDraft, 500);
  }

  function writeDraft() {
    if (ctx.store.debug) return;               /* debug states persist nothing */
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ prompt: field.value.trim(), bundle: chosen }));
    } catch { /* private mode: the draft simply is not kept */ }
  }

  /* Navigating away used to cancel the pending write, so the last half second
     of typing — the half second right before the player pressed something —
     was the half second that got dropped. `leave()` flushes through this. */
  flushDraft = () => {
    if (ctx.store.debug) return;
    if (!field.value.trim()) return;
    writeDraft();
  };

  /**
   * A refusal is shown as a sentence, not as a dead button.
   *
   * Only the codes that will still refuse a second later keep the button
   * down; everything else — a queue, a dropped connection, a mind that is too
   * heavy — leaves it pressable, because pressing it again is exactly the
   * right move and a grey button says the opposite.
   */
  const HARD = new Set(['account_day', 'account_month', 'budget_day', 'not_free', 'guest', 'free_used']);

  function showDeny(code, message) {
    /* A legacy server answer may still be Russian; the product shows English
       only, so an untranslated sentence is dropped rather than displayed. */
    const text = DENY_TEXT[code] || latinOnly(String(message || '')) || 'It did not go through. Try again.';
    mount(denyBox, h('div.note.accent', text));
    paintAllowance(true);
    goBtn.disabled = HARD.has(code);
  }

  async function submit() {
    const prompt = field.value.trim();
    if (busy) return;
    if (prompt.length < 3) return;
    paintButton(true);
    clear(denyBox);
    paintAllowance();
    track('create_submitted', { bundle: chosen || '', promptChars: prompt.length });
    try {
      const job = await post('/api/creature', { prompt, bundle: chosen });
      try { localStorage.setItem('airena.job', job.id); } catch { /* private mode */ }
      ctx.go(`/birth/${job.id}`);
    } catch (e) {
      /* The label goes back to the verb before the reason appears: a refusal
         under a button still saying "Creating…" reads as two contradictions. */
      paintButton(false);
      showDeny(e?.code, e?.message);
    }
  }
}

export function leave() {
  visit++;
  clearTimeout(draftTimer);
  flushDraft?.();
  flushDraft = null;
  picker?.close();
  picker = null;
  offSession?.();
  offSession = null;
  offLive?.();
  offLive = null;
  offNarrow?.();
  offNarrow = null;
  offStrip?.();
  offStrip = null;
  hideTooltip();
}
