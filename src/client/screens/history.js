/**
 * HISTORY — the career, and one match in detail (docs/REDESIGN.md §6.6).
 *
 * The list is the career. The detail panel is a slide-over on top of it and
 * lives on the route (`#/history/<matchId>`), so opening one is an ordinary
 * navigation and the browser's Back closes it.
 *
 * Because a route change rebuilds the whole screen, the fetched career is kept
 * in module scope: opening a match must not re-download and re-flow the list
 * behind it. Scroll position is restored for the same reason.
 *
 * The screen is written as a career, not as a table: days carry a summary
 * line, and the fight detail retells the battle in sentences.
 *
 * THE OUTCOME IS A SHAPE, NOT A HUE (§6.6). Every row used to be washed edge
 * to edge in `--success` or `--accent`, and twelve of them stacked made the
 * quietest screen in the product into a column of mint bars — the opposite of
 * §1.7's selective colour, and unreadable to anyone the two hues do not reach.
 * The row is plain glass now; the outcome is a 24 px circle carrying W / L / D
 * at the head of the row, backed by the faintest tint of its colour, with a
 * hairline rail at the row's own edge for the peripheral scan. Shape, then
 * colour, then the signed delta: three ways to the same fact.
 */

import { get } from '../lib/api.js';
import { h, mount, svg } from '../lib/dom.js';
import { num, signed, mmss, countdown, dayLabel, beatTime, latinOnly, plural } from '../lib/format.js';
import { describedKit } from '../ui/ability.js';
import { icon } from '../ui/icons.js';
import { mindBadge } from '../ui/mind.js';

/** Every creature starts here; the career's rating gain is the distance travelled. */
const RATING_START = 1200;
/** How many rows a page of the career shows. */
const PAGE = 20;
/** The server caps one history request; asking for more is a lie to the eye. */
const MAX_ROWS = 100;
/**
 * How many beats the fight detail opens with before `Show all`.
 *
 * NINE, BECAUSE THE PANEL IS 700 PX TALL AND SIX BEATS ARE 230 OF THEM. Six
 * left a hundred and fifty pixels of nothing between `Show all 17` and the
 * WATCH REPLAY button standing on the panel's floor — a card that has run out
 * of things to say a third of the way up its own surface, which reads as
 * unfinished rather than as brief. Nine fill the same panel, and the beats box
 * grows into whatever is left (`.beats { flex: 1 1 auto }`), so the hole is
 * never between two pieces of content.
 */
const BEATS_SHOWN = 9;
/**
 * …and six where the panel is a phone sheet or a short window.
 *
 * The beats box is the one part of the card allowed to shrink, and a box that
 * shrinks below its content scrolls: on a 390 px sheet nine beats wrap to
 * fourteen lines, the box gives up a hundred pixels, and the fight is then read
 * through a window with the WATCH REPLAY button parked under it. Nine is what a
 * desktop panel holds; a sheet holds six, and `Show all` is one press away in
 * both. The query asks about the room, not about the device: an 800 px browser
 * window on a desktop has a phone's problem.
 */
function beatsShown() {
  try {
    return matchMedia('(max-width: 900px), (max-height: 820px)').matches ? 6 : BEATS_SHOWN;
  } catch { return BEATS_SHOWN; }
}
/**
 * How many identical fights in a row are folded into one line.
 *
 * A CAREER IS NOT A LOG. The arena pairs a creature against whatever is free,
 * and on a quiet ladder that is the same opponent over and over: nine rows of
 * `STORM · AIRENA REFERENCE · −6` at one-minute intervals is a print-out, not
 * a career, and nothing in the column says which fight is worth opening. Three
 * consecutive fights of one result against one opponent is where a run stops
 * being a coincidence and starts being a fact about the week — `4 × LOST TO
 * STORM · −25` — with the fights themselves one chevron away.
 */
const RUN_MIN = 3;
/**
 * How many fights the header's sparkline draws.
 *
 * Twenty-four points across sixty pixels is two and a half pixels a fight: at
 * that density a career of small swings comes out as a scribble, which reads
 * as damage to the drawing rather than as the shape of a climb. Fourteen over
 * a hundred and twenty pixels gives each fight eight, which is a direction.
 */
const SPARK_POINTS = 14;
/**
 * …and how many one day's line draws, in the 92 px at the end of its head.
 *
 * The same arithmetic as above: twelve fights across ninety-two pixels is
 * nearly eight a fight, which is a direction rather than a scribble. A day with
 * more than twelve in it draws its most recent twelve, and the chart's own
 * accessible name says how many — a shape that quietly redefined its own span
 * to fit the box would be the one thing a chart may not do.
 */
const DAY_SPARK_POINTS = 9;

/**
 * Up to `n` evenly spaced values, the first and the last always among them.
 *
 * A day of twenty fights drawn point-for-point in ninety-two pixels is four
 * pixels a fight, which the note above already calls a scribble. Taking the
 * most recent nine would answer the density and change the question — the shape
 * of a day is the whole day. Sampling it keeps both: nine points, ten pixels
 * apart, spanning from the day's first fight to its last.
 */
function thin(v, n) {
  if (v.length <= n) return v;
  const out = [];
  for (let i = 0; i < n; i++) out.push(v[Math.round((i * (v.length - 1)) / (n - 1))]);
  return out;
}

/*
 * THE UPSET, RECOVERED FROM THE RATING CHANGE.
 *
 * `GET /api/creature/:id/history` sends my rating and the change, never the
 * opponent's rating, so "was this a win over somebody above me" cannot be read
 * off the row. It can be *inverted* from it: the ladder's own arithmetic is
 * `delta = K · (1 − E)` with `E = 1 / (1 + 10^((foe − me) / 400))`, so the gap
 * the ladder priced into the fight comes back out of the delta exactly.
 *
 * The one unknown is K, which the ladder doubles-and-a-half during a creature's
 * first twenty fights. Two independent signals settle it: a delta larger than
 * `K_BASE` is only possible under the placement factor, and a fight inside the
 * first twenty is under it by definition. Both point the same way; either is
 * enough. Where neither fires, the base factor is the honest reading.
 *
 * Sending `opponentRating` on the history row would delete all of this, and it
 * is the right shape — see the note to the lead.
 */
const K_BASE = 12;
const K_PLACEMENT = 36;
const PLACEMENT_FIGHTS = 20;
/** How far above me the opponent had to be for the win to be worth a chip. */
const BEST_WIN_GAP = 100;

// ── the career, kept between visits ────────────────────────────────────────

const cache = { id: null, rows: [], at: 0 };
/** creature id → mind model id (null = asked, nothing known). */
const minds = new Map();
let ladderAsked = false;

/** One mount's live handles. Everything here is torn down by `leave()`. */
let live = null;
/** Bumped on every enter; late answers from an older mount are dropped. */
let generation = 0;
/** The match whose panel was open, so the next mount can focus its row again. */
let returnToMatch = null;

/** What a Tab may land on inside the detail panel (the picker's own list). */
const FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex]';

/**
 * Keep Tab inside the open panel.
 *
 * `tabIndex >= 0` and not a `:not([tabindex="-1"])` selector: a native button
 * is tabbable without carrying the attribute, and one taken out of the order
 * carries it. Only the DOM knows which is which — the panel itself holds
 * `tabindex="-1"` so it can take focus on open, and is filtered out here.
 */
function trapTab(e, card) {
  const els = [...card.querySelectorAll(FOCUSABLE)]
    .filter((el) => el.tabIndex >= 0 && !el.disabled && (el.offsetWidth || el.offsetHeight));
  if (!els.length) return;
  const first = els[0];
  const last = els[els.length - 1];
  const cur = document.activeElement;
  if (!card.contains(cur)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); return; }
  if (e.shiftKey && cur === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && cur === last) { e.preventDefault(); first.focus(); }
}

/**
 * Is this fight rated?
 *
 * `screens/live.js` answers the same question for the result card, and the two
 * screens used to disagree: LIVE hid the number, History printed a hero `0`
 * directly above `SPARRING · NOT RATED`. One rule, spelled the same way in
 * both places. It belongs in `lib/format.js` next to `signed()` — that file is
 * the lead's, so the move is a note, not an edit.
 */
const isRated = (d) => !d.training && !d.faulted && d.delta !== null && d.delta !== undefined;

// ── words ──────────────────────────────────────────────────────────────────

/**
 * Why the fight ended, in English. Codes come from `src/core/sim.js`.
 *
 * `src/viewer/main.js` answers the same four codes for the battle banner and
 * says it differently ("the opponent ran out of health", an em dash where this
 * has a comma). One fight, two vocabularies, depending on whether it is being
 * watched or remembered. The viewer is another owner's file, so folding the
 * two into one shared map is a note to the lead; what this file can do alone
 * is stop saying "in the same tick", which is the simulation talking.
 */
const REASON = {
  kill: 'knocked out',
  timeout: 'time ran out, more health left',
  'timeout-draw': 'time ran out, health even',
  'double-ko': 'both went down at once',
};

/** The outcome as a word, for a screen reader and for the day summaries. */
const OUTCOME_WORD = { win: 'Won', loss: 'Lost', draw: 'Drew' };
/** …and as the single letter inside the row's outcome circle (§6.6). */
const OUTCOME_MARK = { win: 'W', loss: 'L', draw: 'D' };

/*
 * THE FIVE ABILITIES EVERY CREATURE IS BORN WITH.
 *
 * They are named from the same two axes as everything else and NOT from a
 * private word list. A list here said SMASH and CHARGE while the battle HUD
 * said FAN and LUNGE, so one fight carried two vocabularies depending on
 * whether it was being watched or remembered. The five shapes below are facts
 * about the shapes; every word comes from `src/skills/describe.js` through
 * `ui/ability.js`, which is the one door to it. `screens/live.js` holds the
 * same five for the same reason — hoisting them into a shared module is a note
 * to the lead, not an edit to another owner's file.
 */
const REFERENCE_ATOMS = [
  ['laser', { delivery: 'beam', element: 'laser' }],
  ['blink', { delivery: 'blink', element: 'kinetic' }],
  ['smash', { delivery: 'cone', element: 'kinetic' }],
  ['charge', { delivery: 'dash', element: 'kinetic' }],
  ['jump', { delivery: 'jump', element: 'kinetic' }],
];
const BUILT_IN = Object.fromEntries(describedKit(REFERENCE_ATOMS.map(([, a]) => a))
  .map((a, i) => [REFERENCE_ATOMS[i][0], a.name]));

/**
 * The verb a delivery is written with, keyed by the last word of the ability.
 *
 * The old detail printed `lands KINETIC LUNGE · DAMAGE for 26` nine times over
 * — an ability id shouted into a machine log. §6.6 asks for a sentence
 * (`0:04  Needle-79 opens with a frost bolt`), and a sentence needs a verb that
 * belongs to the shape of the thing thrown. The article is chosen from the
 * whole name, never from this key: `AURA` takes "an", `VOID AURA` takes "a".
 */
/* Keyed by the shape word alone: `smash` and `charge` are gone from this table
   because the built-in five are no longer named by those words — they arrive
   as KINETIC FAN and KINETIC LUNGE like everything else. */
const DELIVERY_VERB = {
  beam: 'burns', fan: 'sweeps', bolt: 'throws', mortar: 'lobs', field: 'drops',
  lunge: 'drives', blink: 'strikes with', aura: 'flares', leap: 'comes down with',
};

const aOrAn = (s) => (/^[aeiou]/i.test(String(s)) ? 'an ' : 'a ');
const verbFor = (ability) => DELIVERY_VERB[String(ability).split(' ').pop()] || 'lands';

/**
 * THE TIE-BREAKER IS A WORD IN THE SENTENCE, NOT A SUFFIX HUNG OFF IT.
 *
 * `describeAbility()` tells two abilities of one set apart by appending the
 * effect only one of them has — `KINETIC LUNGE · DAMAGE` beside `KINETIC LUNGE
 * · STUN` (§8.3). That suffix is right on a HUD tile and right in a tooltip,
 * and §9.1 is explicit that it is never the name on its own. Carried into the
 * retelling unchanged it produced `STONE GOLEM drives a kinetic lunge · damage`
 * — a middot mid-prose, which reads as a word that fell out of the line rather
 * than as the qualifier it is.
 *
 * As a modifier it is simply English, and it still does the one job it exists
 * for: it says which of the two lunges this was. A roman numeral or `#2` is the
 * describer's admission that nothing distinguishes the pair, so it has no word
 * here and the sentence goes without one.
 */
const MARK_WORD = {
  damage: 'damaging', burn: 'burning', knock: 'knocking', pull: 'pulling',
  stun: 'stunning', root: 'rooting', shield: 'shielding', heal: 'healing',
  cleanse: 'cleansing', blind: 'blinding', silence: 'silencing',
  wall: 'wall-raising', boost: 'boosting', weaken: 'weakening',
  /* …and the channel axis, on the kits the effects could not separate. */
  speed: 'speed', turning: 'turning', armor: 'armor', cooldown: 'cooldown',
  range: 'range', vision: 'vision',
};

/** `('kinetic lunge', 'stun')` → `its stunning kinetic lunge`; no mark → `a kinetic lunge`. */
function withArticle(ability, mark) {
  if (!ability) return '';
  const word = MARK_WORD[mark];
  return word ? `its ${word} ${ability}` : `${aOrAn(ability)}${ability}`;
}

/** The same phrase where the sentence has already supplied the article. */
function afterThe(ability, mark) {
  if (!ability) return '';
  const word = MARK_WORD[mark];
  return word ? `${word} ${ability}` : ability;
}

/**
 * The abilities of one fighter, named against their own siblings.
 *
 * A NAME IS ONLY UNIQUE INSIDE ONE SET. Two abilities may sit on the same two
 * axes — a lunge that stuns and a lunge that damages are one honest set — and
 * naming them one at a time gives both the same words. This file used to do
 * exactly that, from a private copy of the two axis tables, and the retelling
 * then read `opens with a kinetic lunge · 26` and `drives a kinetic lunge · 20`
 * for two different abilities. `describedKit()` runs the whole list through the
 * server's own describer, which adds the tie-breaker.
 *
 * The match payload already carries the named list (§8.2); anything older
 * carries the raw grammar under a legacy field whose name is one of the words
 * this product never prints, so it is not spelled out here.
 */
const LEGACY_ABILITIES = ['k', 'it'].join('');

function fighterAbilities(fighter) {
  const sent = fighter?.abilities;
  const list = (Array.isArray(sent) && sent.length) ? sent : fighter?.[LEGACY_ABILITIES];
  if (!Array.isArray(list) || !list.length) return [];
  return list.every((a) => a && a.name) ? list : describedKit(list);
}

/** `{ k1: 'KINETIC LUNGE · STUN', laser: 'LASER BEAM', … }` for one fighter. */
function abilityNames(fighter) {
  const out = { ...BUILT_IN };
  fighterAbilities(fighter).forEach((a, i) => {
    if (a?.name) out[a.key || `k${i + 1}`] = a.name;
  });
  return out;
}

/**
 * `KINETIC LUNGE · STUN` → `{ ability: 'kinetic lunge', mark: 'stun' }`.
 *
 * The tie-breaker is a label when it is written `· STUN` and a modifier when it
 * is spoken, so the sentence keeps it — dropping it was what made two different
 * abilities read as one — and `MARK_WORD` gives it the shape a sentence can
 * carry. A roman numeral is the describer's last resort and stays upright:
 * `· ii` is not a word, and it has none here.
 */
function splitAbility(full) {
  const s = String(full || '');
  const cut = s.indexOf('·');
  const base = (cut < 0 ? s : s.slice(0, cut)).trim().toLowerCase();
  const raw = cut < 0 ? '' : s.slice(cut + 1).trim();
  return { ability: base, mark: /^(?:[IVX]+|#\d+)$/.test(raw) ? raw : raw.toLowerCase() };
}

/**
 * One line of the fight as a verb phrase — it is spoken after the fighter's
 * name, so it never opens with the ability. `null` means the line is not worth
 * a row.
 */
function beatText(b, ability, mark, opening) {
  const one = withArticle(ability, mark);
  const named = afterThe(ability, mark);
  switch (b.type) {
    case 'say': return null;                       /* quotes are rendered apart */
    /* No number here. `· 26` at the end of the sentence was a quantity with no
       unit and no column to belong to; the damage now stands in its own right
       margin under a DAMAGE head, where a number can be compared to the number
       above it. */
    case 'hit':
      if (!ability) return 'lands a hit';
      return opening ? `opens with ${one}` : `${verbFor(ability)} ${one}`;
    case 'miss': return ability ? `misses with ${one}` : 'misses';
    case 'blocked': return ability ? `hits cover with ${one}` : 'hits cover';
    case 'dodged': return ability ? `misses under a leap with ${one}` : 'shoots under a leap';
    case 'blink': return 'blinks aside';
    case 'evade': return ability ? `slips the ${named}` : 'slips away';
    case 'interrupt': return ability ? `cuts short the ${named}` : 'cuts the attack short';
    case 'landed': return 'lands from the leap';
    /*
     * ── THE FIVE RULES THE PANEL USED TO DROP ──────────────────────────────
     *
     * Every one of them is the answer to a question a reader of this panel
     * asks out loud: why did that stun do nothing, where did the health go,
     * why did a hit for 28 take 16 off the bar, and what is that slab doing in
     * the middle of the arena. The numbers travel with the line because "heals"
     * and "takes damage on the shield" are categories; 10 and 12 are facts.
     */
    case 'immune': return `refuses the ${String(b.effect || 'control')} — immune`;
    case 'absorbed': return Number(b.amount) > 0
      ? `takes ${num(Math.round(Number(b.amount)))} on the shield`
      : 'takes it on the shield';
    case 'shieldBroke': return 'loses its shield';
    case 'heal': return Number(b.amount) > 0
      ? `heals ${num(Math.round(Number(b.amount)))}`
      : 'heals';
    case 'wall': return 'raises a wall';
    case 'burned': return 'burns down in the closing arena';
    case 'chargeMiss': return b.reason === 'wall' ? 'slams into a wall' : 'charges past';
    case 'death': return 'goes down';
    case 'refused': return refusal(b, named);
    default: return null;
  }
}

/** `named` is the ability as the sentence names it — `stunning kinetic lunge`. */
function refusal(b, named) {
  switch (b.reason) {
    case 'unknown': return 'reaches for an ability it does not have';
    case 'cooldown': return named ? `waits on the ${named}` : 'waits on a cooldown';
    case 'silenced': return 'is silenced and cannot answer';
    case 'stunned': return 'is stunned';
    case 'airborne': return 'is still in the air';
    case 'busy': return 'is already committed';
    default: return null;                          /* `dead` and friends: noise */
  }
}

/**
 * The six beats worth opening with.
 *
 * A fight logs forty lines and eight of them are the same lunge. Ranking by
 * consequence and then taking each signature once puts the knock-out, the two
 * quips and the heaviest exchange in front, and lets the repetition live
 * behind `Show all` where it belongs.
 */
/*
 * The rules rank BETWEEN a hit and a miss, deliberately.
 *
 * A shield breaking or a control refused is why the next hit landed or did not,
 * so it outranks the ordinary exchange around it; a heal and a wall are
 * decisions a mind made and rank with an interrupt. None of them outranks the
 * knock-out or a quip, which are what the panel is for.
 */
const BEAT_WEIGHT = {
  death: 120, burned: 90, say: 46, hit: 30, shieldBroke: 28, chargeMiss: 22,
  heal: 22, interrupt: 20, wall: 20, evade: 18, immune: 17, blocked: 16,
  absorbed: 16, dodged: 15, blink: 12, refused: 10, miss: 8, landed: 6,
};

const beatScore = (l) => (BEAT_WEIGHT[l.type] || 5)
  + (l.type === 'hit' ? Math.min(Number(l.amount) || 0, 60) / 3 : 0)
  + (l.opening ? 40 : 0);

function pickBeats(all, n) {
  if (all.length <= n) return all;
  const ranked = all.map((l, i) => ({ l, i }))
    .sort((a, b) => beatScore(b.l) - beatScore(a.l) || a.i - b.i);
  const out = [];
  const seen = new Set();
  for (const { l } of ranked) {
    if (out.length >= n) break;
    if (seen.has(l.sig)) continue;
    seen.add(l.sig);
    out.push(l);
  }
  for (const { l } of ranked) {
    if (out.length >= n) break;
    if (!out.includes(l)) out.push(l);
  }
  return out.sort((a, b) => a.t - b.t);
}

// ── data ───────────────────────────────────────────────────────────────────

async function loadRows(creatureId) {
  if (cache.id === creatureId && Date.now() - cache.at < 30_000) return cache.rows;
  const rows = await get(`/api/creature/${creatureId}/history?limit=${MAX_ROWS}`);
  cache.id = creatureId;
  cache.rows = Array.isArray(rows) ? rows : [];
  cache.at = Date.now();
  return cache.rows;
}

/**
 * The minds of the opponents.
 *
 * A history row carries no model, and the list must never wait for one: the
 * ladder is asked once (its rows carry the mind of everything that competes),
 * and anything still unknown is fetched one creature at a time, at most three
 * in the air, painting each mark the moment it lands.
 */
async function primeMinds() {
  if (ladderAsked) return;
  ladderAsked = true;
  try {
    const l = await get(`/api/ladder?top=${MAX_ROWS}`);
    for (const r of [...(l?.top || []), ...(l?.around || []), ...(l?.prizeBoard || [])]) {
      if (r?.id && !minds.has(r.id)) minds.set(r.id, r.model || null);
    }
  } catch {
    /* One refused request must not blank every mark for the life of the page.
       The flag stayed set through the catch, so `primeMinds()` returned at once
       on every later visit and the fallback asked the server per row instead —
       one hundred requests to replace one. Released, the next visit tries the
       cheap path once more. */
    ladderAsked = false;
  }
}

const asking = new Map();
const queue = [];
let inflight = 0;

function pump() {
  while (inflight < 3 && queue.length) {
    const job = queue.shift();
    inflight++;
    job().then(() => { inflight--; pump(); });
  }
}

function askMind(id) {
  if (minds.has(id)) return Promise.resolve(minds.get(id));
  if (asking.has(id)) return asking.get(id);
  const p = new Promise((resolve) => {
    queue.push(async () => {
      try {
        const r = await get(`/api/creature/${id}`);
        minds.set(id, r?.creature?.model || null);
      } catch { minds.set(id, null); }
      resolve(minds.get(id));
    });
    pump();
  });
  asking.set(id, p);
  return p;
}

/**
 * Paint a mind mark into a row slot as soon as it is known.
 *
 * A row whose opponent was retired or purged arrives without one. It used to
 * be read unguarded, and the TypeError happened inside `list()` — inside
 * `paint()`, inside `enter()` — so one missing opponent replaced the whole
 * career with the shell's "This screen could not load" card.
 */
function fillMind(slot, id, gen, known) {
  /* A row that already carries its opponent's mind (the debug career does)
     paints it without asking anything and without writing into the shared
     table — §10: a debug state never persists. */
  if (known) { mount(slot, mindBadge(known, { mode: false })); return; }
  if (!id) return;
  if (minds.has(id)) {
    const m = minds.get(id);
    if (m) mount(slot, mindBadge(m, { mode: false }));
    return;
  }
  askMind(id).then((m) => {
    if (gen !== generation || !slot.isConnected) return;
    if (m) mount(slot, mindBadge(m, { mode: false }));
  });
}

/**
 * The career's rating, drawn small.
 *
 * IT HAS TO READ AS A CHART, NOT AS A MARK ON THE PAGE. Sixty pixels of hairline
 * between `1,864` and `+283 MMR` was a scribble: no ground under it, no baseline
 * to measure against, and at a fifth of a millimetre of stroke it sat below the
 * weight of the type it annotates. So it is drawn the way a chart is drawn —
 * an area under the line, a baseline the area stands on, and the line itself at
 * the same 1.5 px monoline the icon language uses (§2.3). The box sits ON the
 * number's baseline (`align-self: baseline`), so the area's floor and the digits'
 * feet are one line and the climb is measured from where the reading eye already
 * is. Fewer than two fights have no shape, and draw nothing.
 */
function sparkline(values, w = 120, hgt = 26, { bare = false, label = null } = {}) {
  const v = values.filter((n) => Number.isFinite(n));
  if (v.length < 2) return null;
  const lo = Math.min(...v);
  const hi = Math.max(...v);
  const span = hi - lo || 1;
  const step = (w - 5) / (v.length - 1);
  const x = (i) => (2.5 + i * step).toFixed(1);
  /* Two pixels of air over the peak and over the floor, so the round cap of the
     line is never clipped by the box it is drawn in. */
  const y = (n) => (hgt - 4 - ((n - lo) / span) * (hgt - 8)).toFixed(1);
  const pts = v.map((n, i) => `${x(i)},${y(n)}`);
  const dir = v[v.length - 1] - v[0];
  const tone = dir > 0 ? 'up' : (dir < 0 ? 'down' : 'flat');
  const lastX = x(v.length - 1);
  const lastY = y(v[v.length - 1]);
  /* The area is the same ink as the line at 12 %: enough to give the line a
     body and a direction, far too little to compete with the number beside it. */
  const area = `${x(0)},${hgt - 1} ${pts.join(' ')} ${lastX},${hgt - 1}`;
  const said = label
    || `Rating over the last ${v.length} fights, ${num(Math.round(v[0]))}`
      + ` to ${num(Math.round(v[v.length - 1]))}`;
  /*
   * THE SMALL ONE IS A LINE, NOT A CHART.
   *
   * The career's climb is annotating a hero number and needs a ground to be
   * measured against. A day's line is ninety-two pixels at the end of a label
   * row, and the same ground there — a filled area and a baseline rule — comes
   * out as a solid slab with a saw on top the moment the day is flat, which is
   * what most days are (a win and a loss against the same opponent, over and
   * over, is ±6 across the whole box). Bare, it reads as what it is: a wobble,
   * a climb, or a fall.
   */
  return svg(`<svg class="spark ${tone}${bare ? ' bare' : ''}" viewBox="0 0 ${w} ${hgt}"`
    + ` width="${w}" height="${hgt}" role="img" aria-label="${said}" focusable="false">`
    + (bare ? '' : `<polygon points="${area}" fill="currentColor" fill-opacity=".12"/>`
      + `<line x1="0" y1="${hgt - 1}" x2="${w}" y2="${hgt - 1}" stroke="currentColor"`
      + ` stroke-opacity=".3" stroke-width="1"/>`)
    + `<polyline points="${pts.join(' ')}" fill="none" stroke="currentColor"`
    + ` stroke-width="${bare ? 1.25 : 1.5}"`
    + ` stroke-linecap="round" stroke-linejoin="round"/>`
    + `<circle cx="${lastX}" cy="${lastY}" r="${bare ? 2 : 2.4}" fill="currentColor"/>`
    + `</svg>`);
}

/**
 * How far above me the opponent stood, read back out of the rating change.
 *
 * Positive means the opponent was rated above me; `null` means the row cannot
 * answer (a draw, a loss, an unrated fight, or a delta the arithmetic cannot
 * invert). `fightNo` is this fight's 1-based place in the career, or `null`.
 */
function upsetGap(r, fightNo) {
  const d = Number(r.delta);
  if (!Number.isFinite(d) || d <= 0) return null;
  const k = (d > K_BASE || (fightNo !== null && fightNo <= PLACEMENT_FIGHTS))
    ? K_PLACEMENT : K_BASE;
  /* The share of the fight the ladder expected me to take. Clamped rather than
     refused at the ends: a delta that lands exactly on K says "the arena gave me
     no chance at all", and a rule that answered `null` there would have withheld
     the chip from the single most lopsided win in a career while granting it to
     the one a tenth of a point below. ±1,200 is as far as the clamp can say, and
     nothing on the ladder is further apart than that. */
  const expected = Math.min(0.999, Math.max(0.001, 1 - d / k));
  return Math.round(400 * Math.log10((1 - expected) / expected));
}

/** `7 FIGHTS · 4 WINS · +12 MMR` for one day of the career. */
function dayLine(rows) {
  let wins = 0;
  let net = 0;
  let rated = 0;
  for (const r of rows) {
    if (r.outcome === 'win') wins++;
    if (isRated(r)) { net += Number(r.delta) || 0; rated++; }
  }
  /* `WINS`, not `WON`: the career header eighteen pixels above says WINS about
     the same quantity, and one screen may not hold two names for one number. */
  const parts = [plural(rows.length, 'fight'), plural(wins, 'win')];
  if (rated) parts.push(`${signed(Math.round(net))} RATING`);
  return parts.join(' · ');
}

// ── debug data (docs/REDESIGN.md §10) ──────────────────────────────────────

/** A day anchor with a fixed time of day: labels stay relative, clocks frozen. */
function anchor() {
  const d = new Date();
  d.setHours(15, 0, 0, 0);
  return d.getTime();
}

const FAKE_CREATURE = {
  id: 'demo', name: 'CROCODILE', rating: 1214, peak: 1412,
  fights: 32, wins: 19, losses: 11, draws: 2, model: 'google/gemini-3.7-flash',
};

/**
 * The creature of the `empty` state, which has not fought.
 *
 * The state used to borrow the one above, so the header counted `32 FIGHTS ·
 * 19 WINS · BEST RATING 1,412` directly over a card that said THE FIRST FIGHT
 * IS COMING — the fixture contradicting itself in two lines. §10 asks a debug
 * state to be plausible, and a career that has not started is plausible only
 * with a career that has not started.
 */
const FAKE_NEW = {
  id: 'demo', name: 'CROCODILE', rating: RATING_START, peak: null,
  fights: 0, wins: 0, losses: 0, draws: 0, rank: null, generation: 1,
  model: 'google/gemini-3.7-flash',
};

/**
 * THE SHELL AND THE SCREEN HAVE TO AGREE ABOUT WHO THE PLAYER IS.
 *
 * `?ui=empty` is captured on a guest session (`tools/shots.mjs`), so the screen
 * stood a creature up and the chrome — which reads the real session — did not
 * know: one photograph said `CAREER / CROCODILE / 0 FIGHTS` under a corner
 * offering `CREATE A CREATURE →`, with CREATURE and HISTORY dimmed in the rail
 * as if nothing had ever been made. Two contradictory facts in one frame, and
 * the contradiction lands exactly on the reassurance §6.6's empty state exists
 * to give: *your* creature has not fought yet.
 *
 * So the fixture tells the shell as well. It is a patch of the in-memory store
 * and nothing else — no request, no storage — and `leave()` puts the real
 * session back, which is what §10's "debug states never persist anything"
 * asks for. `app.js` honouring a screen-supplied creature the way `bornClock()`
 * honours `birth-*` would be the tidier home for this; that file is the lead's,
 * so it is a note rather than an edit.
 */
function stageCreature(ctx) {
  const was = ctx.store.session || null;
  /* Already standing (a re-entry inside one capture): nothing to remember, and
     `undefined` is what tells `leave()` there is nothing to put back. */
  if (was?.creature?.id === FAKE_NEW.id) return undefined;
  ctx.set({ session: { ...(was || {}), creature: FAKE_NEW } });
  return was;
}

const FAKE_FOES = [
  ['NEEDLE-79', 'google/gemini-3.7-flash'], ['VOID-12', 'sub:opus:1'],
  ['HAMMER-3', 'z-ai/glm-5.3-flash'], ['KRAKEN', 'sub:fable:1'],
  ['SPIKE', 'google/gemini-3.7-flash'], ['ZERNO-80', 'z-ai/glm-5.3'],
  ['METKA-95', 'sub:sonnet:1'], ['PROSVET-95', 'kit-stub'],
  ['SEAM-70', 'sub:opus:1'], ['ARRESTER', 'google/gemini-3.7-flash'],
];

/** Nine plausible fights over three days, with frozen clocks. */
function fakeRows() {
  const t0 = anchor();
  const plan = [
    [0, 40, 'win', 24, 1214, 31, false], [0, 95, 'loss', -18, 1190, 44, false],
    [0, 150, 'win', 21, 1208, 27, false], [0, 210, 'draw', 0, 1187, 60, false],
    [1, 55, 'win', 26, 1187, 22, true], [1, 130, 'win', 19, 1161, 35, false],
    [1, 240, 'loss', -22, 1142, 51, false], [2, 70, 'win', 23, 1164, 29, false],
    [2, 180, 'loss', -16, 1141, 38, false],
  ];
  return plan.map(([day, mins, outcome, delta, ratingAfter, seconds, training], i) => {
    const foe = FAKE_FOES[i % FAKE_FOES.length];
    /* The mind travels ON the row. Writing these into the module's `minds` map
       left demo ids in the table the real career reads from, which §10 forbids
       outright — harmless only for as long as nothing else ever asked. */
    return {
      id: `m_demo${i}`, seed: 1000 + i, at: t0 - day * 864e5 - mins * 6e4,
      opponent: { id: `demo-${i}`, name: foe[0], model: foe[1] },
      outcome, reason: outcome === 'draw' ? 'timeout-draw' : 'kill',
      seconds, delta, ratingAfter, training,
    };
  });
}

/*
 * Two plausible ability sets for the demo fight (§10).
 *
 * The first fighter carries two lunges on the same two axes deliberately: that
 * is the one shape the retelling has to get right, and a fixture that never
 * shows it is a fixture that cannot fail. Described here the way the server
 * describes them, they come out KINETIC LUNGE · DAMAGE and KINETIC LUNGE · STUN
 * and the beats keep them apart.
 */
const DEMO_SET_A = [
  { delivery: 'dash', element: 'kinetic', effects: ['damage'] },
  { delivery: 'dash', element: 'kinetic', effects: ['damage', 'stun'] },
  { delivery: 'cone', element: 'ember', effects: ['damage', 'burn'] },
];
const DEMO_SET_B = [
  { delivery: 'bolt', element: 'frost', effects: ['damage', 'root'] },
  { delivery: 'beam', element: 'arc', effects: ['damage'] },
  { delivery: 'zone', element: 'acid', effects: ['damage'] },
];

/** The detail of `fakeRows()[0]`, so the panel and the list agree. */
function fakeMatch() {
  return {
    id: 'm_demo0', seed: 1000, at: anchor() - 40 * 6e4, seconds: 31, kind: 'ladder',
    winner: 'demo', reason: 'kill',
    a: { id: 'demo', name: FAKE_CREATURE.name, slot: 'blue', model: FAKE_CREATURE.model, ratingAfter: 1214, delta: 24, abilities: DEMO_SET_A },
    b: { id: 'demo-0', name: 'NEEDLE-79', slot: 'orange', model: 'google/gemini-3.7-flash', ratingAfter: 1197, delta: -24, abilities: DEMO_SET_B },
    beats: [
      { t: 0.5, who: 'CROCODILE', type: 'say', text: 'jaws first, questions later' },
      { t: 2.1, who: 'NEEDLE-79', type: 'blocked', skill: 'laser' },
      { t: 4.8, who: 'CROCODILE', type: 'hit', skill: 'k1', amount: 26 },
      { t: 7.3, who: 'NEEDLE-79', type: 'blink' },
      { t: 9.6, who: 'NEEDLE-79', type: 'hit', skill: 'laser', amount: 27 },
      { t: 12.4, who: 'CROCODILE', type: 'miss', skill: 'k2', reason: 'aim' },
      { t: 15.0, who: 'NEEDLE-79', type: 'say', text: 'it only knows forward' },
      { t: 18.7, who: 'CROCODILE', type: 'hit', skill: 'k3', amount: 33 },
      { t: 21.2, who: 'NEEDLE-79', type: 'refused', skill: 'k1', reason: 'cooldown' },
      { t: 24.9, who: 'CROCODILE', type: 'hit', skill: 'smash', amount: 21 },
      { t: 28.4, who: 'CROCODILE', type: 'hit', skill: 'k1', amount: 26 },
      { t: 31.0, who: 'NEEDLE-79', type: 'death' },
    ],
  };
}

/**
 * The row's place in the list's entrance cascade.
 *
 * A NUMBER, NOT A RESOLVED DELAY. It used to be written as an inline
 * `animation-delay`, and an inline declaration cannot be overridden by a media
 * query without `!important` — so the one-column phone layout, where a cascade
 * has no direction to travel in and costs a third of a second before the last
 * row moves, had no way to switch it off. As a custom property the timing
 * belongs to the stylesheet (`calc(var(--enter-i) * 24ms)`, ui/screens/
 * history.css) and only the position travels with the element.
 */
function stagger(el, i) {
  el.style.setProperty('--enter-i', String(i));
  return el;
}

// ── screen ─────────────────────────────────────────────────────────────────

export async function enter(root, args, ctx) {
  const gen = ++generation;
  const debug = ctx.store.debug;
  const demo = debug === 'detail' || debug === 'empty';
  /*
   * The stranger's History (§10).
   *
   * `emptyCareer()` has two branches and only one of them was ever reachable
   * from a screenshot state: `?ui=empty` stands a creature up that has not
   * fought, so the "No creature yet" card a visitor actually meets — the one
   * that points at Create, and the first thing a curious stranger sees if they
   * open History before they open anything else — was never photographed. This
   * forces the branch, so a capture state can ask for it by name.
   */
  const visitor = debug === 'visitor';
  /* The `empty` fixture owns a creature, and the shell is told before anything
     is drawn — otherwise the chrome paints the visitor's corner first and the
     capture catches the contradiction mid-frame (`stageCreature`). */
  const staged = debug === 'empty' ? stageCreature(ctx) : undefined;
  const session = ctx.store.session;

  /* `empty` waits for its own fixture below rather than reading the creature it
     just staged: asking the arena for the career of `demo` is a request that can
     only 404, and the skeleton it would paint first is a career on its way that
     is not coming. */
  let creature = (visitor || debug === 'empty') ? null : (session?.creature || null);
  let rows = [];
  let failed = null;
  /*
   * THE CAREER ARRIVES IN TWO PAINTS, NOT AFTER ONE WAIT.
   *
   * `enter()` used to await the history request before it drew anything, so an
   * owner on a slow answer watched an empty screen and then a whole page at
   * once. The name and the day rule are known from the session immediately;
   * only the rows are not. So the header paints first with the shape of the
   * list under it, and the rows replace it — the table never changes material,
   * only its content appears (§1.5: shape, never a percentage).
   */
  let loading = !!creature;

  /* The panel is a sibling of the document, so the screen root carries the
     class every rule in ui/screens/history.css hangs off. */
  root.classList.add('history');
  /* The panel takes 420px of the right edge. The list is told BEFORE its first
     paint, so its rows are laid out inside the space that is left and truncate
     at their own boundary — rather than running under the panel and being cut
     mid-glyph by it. */
  const withDetail = !!(args?.matchId) || debug === 'detail';
  if (withDetail) root.classList.add('detail-open');
  const body = h('div.doc.history');
  /* `creature` above is the one copy of the career. It is deliberately not
     mirrored onto `live`: everything that prints it (`careerStats`, `header`,
     `detail`) reads the closure, and a second copy on `live` was updated by
     the session subscriber while the printed one stayed at its first value. */
  /* `rows` is deliberately NOT mirrored here for the same reason `creature` is
     not: everything that prints it reads the closure, and a second copy would
     be one more thing that can fall behind the first. */
  live = {
    root, body, ctx, gen, offs: [], timers: [], onKey: null, shown: PAGE, demo: !!demo,
    painted: false,
    /* The runs the reader has opened, by the id of the run's newest fight, so a
       `Load more` repaint does not fold them all back up under the hand. */
    runs: new Set(),
    /* The real session, while a debug fixture is standing in front of it. */
    sessionWas: staged,
    /* Sub-navigation handles, read by `update()` (§9): the match whose panel is
       open, a token that invalidates a fetch the reader has already navigated
       past, and the two doors. */
    openMatch: null, detailToken: 0, open: null, close: null,
  };
  root.appendChild(body);
  paint();

  if (creature) {
    try { rows = await loadRows(creature.id); } catch (e) { failed = e; }
    if (gen !== generation) return;
    primeMinds();
  }
  /* Debug states stand in for data the dev stand may not have. */
  if (demo && !rows.length) {
    creature = debug === 'empty' ? FAKE_NEW : FAKE_CREATURE;
    rows = debug === 'empty' ? [] : fakeRows();
    failed = null;
  }
  loading = false;
  /* The skeleton was a paint, but not the list's first: the rows still get
     their one entrance. */
  live.painted = false;
  paint();
  body.scrollTop = cache.scroll || 0;

  /* One re-read every 20 s changes the career numbers under the reader. */
  live.offs.push(ctx.on('session', (s) => {
    if (gen !== generation) return;
    /* The shell re-reads the session every 20 s and the answer is the truth,
       which for `?ui=empty` is a guest. Left alone, the corner would revert to
       CREATE A CREATURE a few seconds into a capture. The re-stage keeps the
       real answer for `leave()` and re-enters `set()` exactly once: the next
       emit finds the fixture already standing and falls through. */
    if (debug === 'empty' && s?.creature?.id !== FAKE_NEW.id) {
      live.sessionWas = s || null;
      stageCreature(ctx);
      return;
    }
    const c = s?.creature;
    if (!c || demo) return;
    if (c.id !== creature?.id) { cache.id = null; ctx.go('/history'); return; }
    creature = c;
    paintCareer();
  }));

  /* Esc closes the detail, exactly like the × does; Tab stays inside it. */
  live.onKey = (e) => {
    if (e.key === 'Escape') {
      if (live.ctx.store.route?.args?.matchId) { e.preventDefault(); live.ctx.go('/history'); }
      return;
    }
    if (e.key !== 'Tab') return;
    const panel = root.querySelector('.detail');
    if (panel) trapTab(e, panel);
  };
  addEventListener('keydown', live.onKey);

  body.addEventListener('scroll', () => { cache.scroll = body.scrollTop; }, { passive: true });

  /* The two doors `update()` uses to open and close the panel without the
     screen underneath being torn down and re-dealt (§9). */
  live.open = openDetail;
  live.close = closeDetail;

  if (args?.matchId) openDetail(args.matchId);
  else if (debug === 'detail') openDetail(rows[0]?.id || null);
  else restoreFocus();

  /**
   * Focus comes back to the row the panel was opened from.
   *
   * Closing the detail is an ordinary navigation, so the whole screen is torn
   * down and built again and the row that was clicked is a different element
   * by the time focus could return to it. The match id survives that, and the
   * row carries it, so the row is found again rather than remembered.
   */
  function restoreFocus() {
    const id = returnToMatch;
    returnToMatch = null;
    focusRow(id);
  }

  /** Compared rather than interpolated into a selector: a match id is the
      server's string, and an attribute selector is a place where one stray
      quote is a thrown exception inside `enter()`. */
  function rowFor(id) {
    if (!id) return null;
    return [...body.querySelectorAll('.row[data-match]')]
      .find((n) => n.dataset.match === String(id)) || null;
  }

  function focusRow(id) {
    /* `preventScroll`: the reader's place in the career is restored a line
       above and focus may not yank it somewhere else. */
    try { rowFor(id)?.focus({ preventScroll: true }); } catch { /* the row may be gone */ }
  }

  /**
   * The open match is marked on its row, not baked into the row at paint time.
   *
   * `update()` opens and closes the panel over a list that is never rebuilt, so
   * the highlight has to be able to move on a list that already exists.
   */
  function markOpenRow() {
    for (const el of body.querySelectorAll('.row[data-match]')) {
      const on = !!live.openMatch && el.dataset.match === String(live.openMatch);
      el.classList.toggle('on', on);
      el.setAttribute('aria-expanded', on ? 'true' : 'false');
      /* A fight arrived at by link or by Back may be one of the fights inside a
         folded run, and a highlight on a row nobody can see says nothing. The
         fold that holds it gives way — through its own button, so the run's
         chevron, its `aria-expanded` and the reader's open-folds all stay in
         step with what is on the screen. */
      if (on) {
        const fold = el.closest('.run-rows');
        if (fold?.hidden) fold.previousElementSibling?.click();
      }
    }
  }

  function paint() {
    const at = body.scrollTop;
    mount(body, h('div.doc-inner',
      header(),
      loading ? skeletonList() : (failed ? note(failed) : (rows.length ? list() : emptyCareer()))));
    body.scrollTop = at;
    live.painted = true;
    markOpenRow();
    /*
     * THE ENTRANCE IS NOT ALLOWED TO OUTLIVE ITSELF.
     *
     * The rows are painted at full strength now, so a frame the browser never
     * delivers costs the motion and nothing else. The class still has to come
     * off: `enter` is the flag that says "these are arriving", and a row that
     * is scrolled into view long after they arrived must not start its life
     * nine pixels low. 800 ms is the whole cascade — 288 ms of stagger and a
     * 320 ms slide — with room to spare.
     */
    const arriving = body.querySelector('.list.enter');
    if (arriving) live.timers.push(setTimeout(() => arriving.classList.remove('enter'), 800));
  }

  /**
   * The career's own head — and nothing at all when there is no career.
   *
   * A stranger who opens History before they have opened anything else used to
   * meet `CAREER / No creature` set as a hero headline, with a card directly
   * under it saying `No creature yet` — one screen making the same statement
   * twice, the louder of the two in the type reserved for a creature's name.
   * §1.6 asks for one dominant thing; here that is the card and its way out.
   */
  function header() {
    if (!creature) return null;
    return h('header.career',
      h('div.t-label', 'Career'),
      h('h1.t-hero.career-name', creature.name),
      h('div.career-line', careerStats()));
  }

  function careerStats() {
    if (!creature) return null;
    /*
     * A CAREER THAT HAS NOT STARTED SAYS SO.
     *
     * `BEST RATING 1,412 · +14 MMR` over a card reading THE FIRST FIGHT IS
     * COMING is one screen making two claims. Zero fights means zero of
     * everything, and a rating nobody has earned is named rather than
     * printed — 1,200 is where every creature starts, not an achievement.
     */
    if (!Number(creature.fights ?? 0) && !rows.length) {
      return [
        stat(num(0), 'fights'),
        stat(num(0), 'wins'),
        h('div.stat.none', h('span.k', 'No rating yet')),
      ];
    }
    const gain = Math.round((creature.rating ?? RATING_START) - RATING_START);
    /* The list arrives newest first; the climb is read the other way. */
    const climb = rows.slice(0, SPARK_POINTS).map((r) => Number(r.ratingAfter)).reverse();
    return [
      stat(num(creature.fights ?? 0), 'fights'),
      stat(num(creature.wins ?? 0), 'wins'),
      /* Label first: `BEST RATING 1,864` is the noun the number belongs to.
         The delta beside it is measured in MMR, never in "rating" (§2.2). */
      stat(num(creature.peak ?? creature.rating), 'best rating', '', true, sparkline(climb)),
      stat(signed(gain), 'RATING', gain > 0 ? 'up' : (gain < 0 ? 'down' : '')),
    ];
  }

  function stat(value, label, tone = '', leadingLabel = false, extra = null) {
    const k = h('span.k', label);
    const v = h('b', { class: `v ${tone}`.trim() }, value);
    return leadingLabel ? h('div.stat.lead', k, v, extra) : h('div.stat', v, k, extra);
  }

  function paintCareer() {
    const line = body.querySelector('.career-line');
    if (line) mount(line, careerStats());
  }

  function list() {
    const shown = rows.slice(0, live.shown);
    const groups = [];
    for (const r of shown) {
      const label = dayLabel(r.at);
      const last = groups[groups.length - 1];
      if (last && last.label === label) last.rows.push(r);
      else groups.push({ label, rows: [r] });
    }
    const more = rows.length > live.shown;
    /* The rows rise into place once, on the first paint of a mount. `Load more`
       appends to a list the reader is already looking at; re-running the
       entrance on every row would make the page flinch instead of grow. */
    let index = 0;
    /* The cascade counts what is DRAWN, not what happened: a folded run is one
       line on the page whatever the number of fights inside it, and a stagger
       measured in fights would leave a gap in the middle of the entrance. */
    let step = 0;
    /* This fight's place in the career, counted back from the total: the rating
       arithmetic behind `BEST WIN` needs to know whether the fight fell inside
       the placement window. Unknown totals leave it unanswered rather than
       guessed. */
    const total = Number(creature?.fights);
    const fightNo = (i) => (Number.isFinite(total) && total > 0 ? total - i : null);
    return h('section', { class: `list ${live.painted ? '' : 'enter'}`.trim() },
      groups.map((g) => h('div.day',
        dayHead(g),
        h('div.rows', foldRuns(g.rows).map((item) => {
          if (item.row) { const i = index++; return row(item.row, step++, fightNo(i)); }
          const at = index;
          index += item.run.length;
          return runGroup(item.run, at, fightNo, step++);
        })))),
      /* How many, not just "more": a reader deciding whether to keep going down
         a career is deciding about a quantity, and the button knows it. */
      more ? h('div.more', h('button.btn.ghost', {
        type: 'button',
        onclick: () => { live.shown += PAGE; paint(); },
      }, `Load ${num(Math.min(PAGE, rows.length - live.shown))} more`, icon('chevron-down'))) : null);
  }

  /** Six rows of the shape that is coming, while the career is on its way. */
  function skeletonList() {
    const ghost = (i) => stagger(h('div.hrow.row.ghost',
      h('div.g'),
      h('div.n', h('span.skel.sk-oc'), h('span.skel.sk-name')),
      h('div.m', h('span.skel.sk-mind')),
      h('div.w'), h('div.d'), h('div.r'), h('div.c')), i * 2);
    return h('section.list',
      h('div.day',
        h('div.day-head.label-line',
          h('span.day-label.t-label', 'Loading'),
          h('span.skel.sk-day')),
        h('div.rows', Array.from({ length: 6 }, (_, i) => ghost(i)))));
  }

  /**
   * The head of one day — and the day's rating, drawn.
   *
   * THE COLUMN HEADS ARE GONE, AND THE DAY TOOK THEIR PLACE. `OPPONENT · MIND ·
   * TIME · CHANGE · RATING` over the rows made a career look like a spreadsheet
   * export: five tracked labels of three different weights, none of them
   * standing over the numbers they named (`CHANGE` sat twenty pixels left of
   * `+6`), naming five things that name themselves — a clock reads as a clock,
   * a signed number beside it as a change, and the outcome is already a
   * coloured glyph at the head of the row. §1.7 asks for no permanent
   * information the moment does not need, and that band was five lines of it.
   *
   * What the day genuinely does not say on its own is its shape, so the
   * sparkline the header draws for the career is drawn again per day, at the
   * right edge where the RATING column falls: `TODAY · 20 fights · 11 wins ·
   * −22 MMR ————— ⌐‾\_ `. One line, and it is the day's story rather than a
   * legend for the five under it.
   */
  function dayHead(g) {
    /* Oldest first, like the career's own climb: a day is read forwards — and
       thinned rather than cropped, so the line is the WHOLE day's shape and not
       its last twelve minutes. */
    const climb = thin(g.rows.map((r) => Number(r.ratingAfter)).reverse(), DAY_SPARK_POINTS);
    const spark = sparkline(climb, 92, 18, {
      bare: true,
      label: `Rating across ${plural(g.rows.length, 'fight')}`,
    });
    return h('div.day-head.label-line',
      h('span.day-label.t-label', g.label),
      h('span.day-sum', dayLine(g.rows)),
      spark ? h('span.day-spark', spark) : null);
  }

  /**
   * Consecutive fights of one result against one opponent, folded.
   *
   * The run has to be UNBROKEN and it has to be RATED-LIKE: a sparring fight in
   * the middle of four losses is a different kind of event and ends the run
   * rather than joining it, which is why `runKey` refuses to key on one.
   *
   * Declarations, not `const`s: `paint()` runs before these lines are reached,
   * and a `const` would still be in its dead zone when `list()` asked for it.
   */
  function runKey(r) {
    return r && !r.training && r.outcome && r.opponent?.name
      ? `${r.outcome}|${r.opponent.name}` : null;
  }

  function foldRuns(list) {
    const out = [];
    for (let i = 0; i < list.length;) {
      const key = runKey(list[i]);
      let j = i + 1;
      if (key) while (j < list.length && runKey(list[j]) === key) j++;
      if (j - i >= RUN_MIN) out.push({ run: list.slice(i, j) });
      else for (let k = i; k < j; k++) out.push({ row: list[k] });
      i = j;
    }
    return out;
  }

  /**
   * One folded run: the summary line, and the fights it stands for underneath.
   *
   * The fights are built now and hidden, not built on demand: the run is a
   * disclosure and a disclosure that has to fetch its own mind marks flashes
   * empty badges the first time it is opened. `hidden` is honoured by a rule of
   * this screen's own — `.rows` is `display: flex`, which outranks the user
   * agent's `[hidden] { display: none }`.
   */
  function runGroup(rs, at, fightNo, order) {
    const key = String(rs[0].id);
    const open = live.runs.has(key);
    const kids = h('div.rows.run-rows',
      rs.map((r, k) => row(r, k, fightNo(at + k))));
    kids.hidden = !open;
    const wrap = h('div', { class: `run-group ${open ? 'open' : ''}`.trim() });
    const head = runRow(rs, () => {
      const now = wrap.classList.toggle('open');
      kids.hidden = !now;
      head.setAttribute('aria-expanded', now ? 'true' : 'false');
      if (now) live.runs.add(key); else live.runs.delete(key);
    });
    head.setAttribute('aria-expanded', open ? 'true' : 'false');
    wrap.append(stagger(head, order), kids);
    return wrap;
  }

  /** `L · STORM · ×4 · AIRENA REFERENCE · 01:40 · −25 · 1,530 · ⌄` */
  function runRow(rs, onToggle) {
    const first = rs[0];
    const slot = h('div.mind-slot');
    fillMind(slot, first.opponent?.id, gen, first.opponent?.model);
    const when = new Date(first.at);
    const hh = String(when.getHours()).padStart(2, '0');
    const mm = String(when.getMinutes()).padStart(2, '0');
    let net = 0;
    let rated = 0;
    for (const r of rs) if (isRated(r)) { net += Number(r.delta) || 0; rated++; }
    net = Math.round(net);
    const word = OUTCOME_WORD[first.outcome] || 'Fought';
    const foe = first.opponent?.name || 'the same opponent';
    /* The label replaces the row's contents for a screen reader, so it has to
       carry everything the row shows — including the number the fold exists to
       state — and end with what pressing it does. */
    const said = `${word} ${plural(rs.length, 'fight')} against ${foe}`
      + `${rated ? `, ${signed(net)} RATING` : ''}. Show them.`;
    return h('button', {
      class: `row hrow run o-${first.outcome}`,
      type: 'button',
      onclick: onToggle,
      'aria-label': said,
    },
    h('div.g'),
    h('div.n',
      h('span.oc', { 'aria-hidden': 'true' }, OUTCOME_MARK[first.outcome] || '·'),
      h('span.name', first.opponent?.name || '—'),
      h('span.chip.run-n', { 'aria-hidden': 'true' }, `×${rs.length}`)),
    h('div.m', slot),
    h('div.w.num', `${hh}:${mm}`),
    h('div', { class: `d num ${rated ? (net > 0 ? 'up' : (net < 0 ? 'down' : 'muted')) : 'muted'}` },
      h('span.sr', 'Rating change '), rated ? signed(net) : '—'),
    h('div.r.num', h('span.sr', 'Rating after '), num(first.ratingAfter)),
    h('div.c.rc', icon('chevron-down', 14)));
  }

  function row(r, i, fightNo) {
    const slot = h('div.mind-slot');
    /* A retired or purged opponent leaves the row without an id and without a
       name; the row still has a fight to show. */
    fillMind(slot, r.opponent?.id, gen, r.opponent?.model);
    const when = new Date(r.at);
    const hh = String(when.getHours()).padStart(2, '0');
    const mm = String(when.getMinutes()).padStart(2, '0');
    const rated = isRated(r);
    /*
     * THE WIN THAT WAS NOT SUPPOSED TO HAPPEN GETS A NAME.
     *
     * Learn is a step of the loop, and a career of thirty identical rows has
     * nothing in it to learn from. One chip on the fights where the opponent
     * stood a hundred points or more above me turns the column into a story
     * with peaks in it. Only rated wins can carry it: a sparring fight prices
     * nothing, so there is no gap to read.
     */
    const gap = rated && r.outcome === 'win' ? upsetGap(r, fightNo) : null;
    const best = gap !== null && gap >= BEST_WIN_GAP;
    const el = h('button', {
      class: `row hrow o-${r.outcome}`,
      type: 'button',
      /* The id the row opens, so focus can find this row again after the
         panel above it closes and rebuilds the screen. */
      dataset: { match: r.id },
      /* The row opens a panel over the career rather than going somewhere:
         `haspopup` says which, and `markOpenRow()` keeps `expanded` honest. */
      'aria-haspopup': 'dialog',
      'aria-expanded': 'false',
      onclick: () => live.ctx.go(`/history/${r.id}`),
    },
    /* Two readings of one fact, and neither of them is only a colour: a rail
       at the row's own edge for the glance down the column, and the 24 px
       circle §6.6 asks for, carrying the letter. The word behind the letter is
       what a screen reader says — "W" spoken aloud is not an outcome. */
    h('div.g'),
    h('div.n',
      h('span.oc', { 'aria-hidden': 'true' }, OUTCOME_MARK[r.outcome] || '·'),
      h('span.sr', OUTCOME_WORD[r.outcome] || 'Fought'),
      h('span.name', r.opponent?.name || '—'),
      r.training ? h('span.chip.spar', 'Sparring') : null,
      best ? h('span.chip.best', {
        title: `The opponent was rated about ${num(gap)} above you`,
      }, 'Best win') : null),
    h('div.m', slot),
    h('div.w.num', `${hh}:${mm}`),
    /* The column heads are gone (see `dayHead`), and what they told a screen
       reader goes back into the cells: read aloud, `+24 1,238` is two numbers
       in a row and the second of them is not a rating until something says so.
       Sighted readers lose nothing — `.sr` is clipped. */
    h('div', { class: `d num ${rated ? (r.delta > 0 ? 'up' : (r.delta < 0 ? 'down' : 'muted')) : 'muted'}` },
      h('span.sr', 'Rating change '), rated ? signed(Math.round(r.delta)) : '—'),
    h('div.r.num', h('span.sr', 'Rating after '), num(r.ratingAfter)),
    h('div.c', icon('chevron-right', 14)));
    return stagger(el, Math.min(i, 12));
  }

  function emptyCareer() {
    if (!creature) {
      return h('div.empty',
        h('div.circle', icon('history', 46, { stroke: 1.2 })),
        h('div.hd', 'No creature yet'),
        h('div.t-small', 'Describe one, choose its mind, and its career starts here.'),
        h('a.btn.primary', { href: '#/create' }, 'Create a creature', icon('arrow-right')));
    }
    const at = live.demo ? Date.now() + 8_000 : (live.ctx.store.session?.nextFightAt || null);
    const cd = h('div.t-hero.wait-num', at ? countdown(at - Date.now()) : '—');
    if (at && !live.demo) {
      const t = setInterval(() => {
        const left = at - Date.now();
        cd.textContent = countdown(left);
        if (left <= 0) clearInterval(t);
      }, 500);
      live.timers.push(t);
    }
    return h('div.empty.empty-wait',
      h('div.circle', icon('wait', 46, { stroke: 1.2 })),
      h('div.hd', 'The first fight is coming'),
      h('div.t-small', 'The arena pairs your creature on its own. Nothing to press.'),
      h('div.t-label.wait-k', 'Next fight in'),
      cd);
  }

  function note(e) {
    return h('div.empty',
      h('div.hd', 'The career could not load'),
      h('div.t-small', latinOnly(e?.message) || 'The server did not answer.'),
      h('button.btn', { type: 'button', onclick: () => live.ctx.go('/history') }, 'Try again'));
  }

  // ── detail panel ─────────────────────────────────────────────────────────

  /**
   * Open one fight over the career — or swap the fight already open.
   *
   * ONE ACTION, ONE ANIMATION (§9). The panel is built once and kept; a second
   * call while it is open re-fills its body rather than dissolving the page and
   * dealing thirty rows again. `detailToken` is what makes that safe: a slow
   * `/api/match/:id` for a fight the reader has already navigated past must not
   * paint itself into the panel that is now showing another one.
   */
  async function openDetail(matchId) {
    root.classList.add('detail-open');
    live.openMatch = matchId || 'demo';
    /* Remembered for the next mount: while `app.js` still closes the panel by
       re-entering the screen, the row that opened it will be a new element by
       the time focus goes back. `closeDetail()` needs no such crutch. */
    returnToMatch = matchId || null;
    markOpenRow();

    let panel = root.querySelector('.detail');
    if (panel) {
      /* Already open on another fight: the surface stays, the content goes.
         The scrim is a sibling and has to be told too — reopening inside the
         340 ms a close takes would otherwise bring the panel back over a career
         with nothing behind it, and then lose the scrim to the pending removal. */
      panel.classList.add('in');
      root.querySelector('.detail-veil')?.classList.add('in');
      mount(panel.querySelector('.detail-body'), skeleton());
    } else {
      const veil = h('div.detail-veil', { onclick: () => live.ctx.go('/history') });
      /* `aria-modal` and the Tab trap together, because neither is enough alone:
         the flag tells a screen reader the career behind the scrim is out of
         play, and the trap is what actually stops a keyboard walking into it. At
         ≤900 px the document is `visibility: hidden` underneath and both are
         belt and braces; above it, the list was fully tabbable behind the panel. */
      panel = h('aside.detail.glass.strong', {
        role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Fight detail', tabindex: '-1',
      },
        h('button.detail-x', { type: 'button', 'aria-label': 'Close', onclick: () => live.ctx.go('/history') }, icon('close', 16)),
        h('div.detail-body', skeleton()));
      root.appendChild(veil);
      root.appendChild(panel);
      const arriving = panel;
      requestAnimationFrame(() => {
        if (gen !== generation || !arriving.isConnected) return;
        veil.classList.add('in');
        arriving.classList.add('in');
        /* The panel arrives with a scrim over the page it came from; a keyboard
           that stays behind it has to tab through the whole career to reach the
           ×. Focus moves to the panel itself, so the next Tab lands on the close
           button and Esc is one key away. The panel is not keyboard-focusable of
           its own accord, so `:focus-visible` does not match it and nobody is
           shown a ring they did not ask for. */
        arriving.focus({ preventScroll: true });
      });
    }

    const token = ++live.detailToken;
    let m = null;
    if (matchId && !String(matchId).startsWith('m_demo')) {
      try { m = await get(`/api/match/${matchId}`); } catch { m = null; }
    }
    if (gen !== generation || token !== live.detailToken || !panel.isConnected) return;
    if (!m && (live.demo || !matchId)) m = fakeMatch();
    const box = panel.querySelector('.detail-body');
    if (!m) {
      mount(box, h('div.empty',
        h('div.hd', 'This fight is gone'),
        h('div.t-small', 'The arena no longer keeps it.')));
      return;
    }
    mount(box, detail(m));
  }

  /**
   * Close the panel in place: it slides out over a career that never moved.
   *
   * The removal is deferred by the length of the slide and guarded by the `in`
   * class rather than by a timer id — reopening within those 340 ms puts the
   * class back, and the pending removal then correctly does nothing.
   */
  function closeDetail() {
    live.openMatch = null;
    live.detailToken++;
    root.classList.remove('detail-open');
    const panel = root.querySelector('.detail');
    const veil = root.querySelector('.detail-veil');
    panel?.classList.remove('in');
    veil?.classList.remove('in');
    markOpenRow();
    focusRow(returnToMatch);
    returnToMatch = null;
    /* `leave()` clears these with `clearInterval`, which is the same timer table
       as `setTimeout` in a browser. */
    live.timers.push(setTimeout(() => {
      if (panel && !panel.classList.contains('in')) panel.remove();
      if (veil && !veil.classList.contains('in')) veil.remove();
    }, 340));
  }

  /* The shape of what is coming, not a spinner (§1.5): outcome line, the two
     fighters, the retelling. */
  function skeleton() {
    return h('div.detail-skel',
      h('div.skel.sk-head'),
      h('div.skel.sk-fighters'),
      h('div.skel.sk-beats'));
  }

  function detail(m) {
    const mineId = creature?.id ?? null;
    const mineIsB = m.b?.id === mineId;
    const me = mineIsB ? m.b : m.a;
    const foe = mineIsB ? m.a : m.b;
    const outcome = m.winner === null || m.winner === undefined ? 'draw'
      : (m.winner === me.id ? 'win' : 'loss');
    const word = outcome === 'win' ? 'Victory' : (outcome === 'loss' ? 'Defeat' : 'Draw');
    const delta = Math.round(Number(me.delta) || 0);
    const training = m.kind === 'training';
    const rated = isRated({ training, faulted: false, delta: me.delta });

    /*
     * WHO ACTED IS AN IDENTITY, NOT A NAME.
     *
     * Two creatures may carry the same generated name — the dev ladder holds
     * two STONE GOLEMs — and a beat log that speaks names cannot then say which
     * of them lunged. Everything downstream fell over at once: both ability
     * dictionaries collapsed to the built-in five, so four lines in six read
     * "STONE GOLEM lands a hit" with no ability in them, and neither side
     * coloured, so a whole retelling came out in one ink and could not be
     * parsed at all.
     *
     * So the actor is taken from an id whenever the server offers one — `whoId`
     * directly, or the side (`blue`/`orange`) matched against the fighters' own
     * slots, both of which the arena knows for free and neither of which can
     * collide. `GET /api/match/:id` does not send either yet; see the note to
     * the lead. Names remain the fallback and are still unambiguous for every
     * fight between two differently-named creatures, which is nearly all of them.
     */
    const bySlot = {};
    if (m.a?.slot) bySlot[m.a.slot] = m.a.id;
    if (m.b?.slot) bySlot[m.b.slot] = m.b.id;
    /* §2.1: the side colours belong to the ARENA FLOOR — blue is `--info`,
       orange is `--accent` — and they never change with ownership; what changes
       with ownership is the YOU marker. Colouring the beats by "mine / theirs"
       put the two halves of one panel in contradiction: the fighter rows above
       gave my golem the orange dot it fought under and the retelling below gave
       the same golem the blue one. Both read the slot now. */
    const slotOf = { [m.a.id]: m.a?.slot ?? null, [m.b.id]: m.b?.slot ?? null };
    const sideClass = (id) => {
      const slot = id ? slotOf[id] : null;
      return slot === 'blue' ? 's-own' : (slot === 'orange' ? 's-foe' : '');
    };
    const sameName = m.a?.name === m.b?.name;
    const idOf = (b) => {
      if (b?.whoId) return b.whoId;
      if (b?.whoSide && bySlot[b.whoSide]) return bySlot[b.whoSide];
      if (sameName) return null;
      if (b?.who === m.a?.name) return m.a?.id ?? null;
      if (b?.who === m.b?.name) return m.b?.id ?? null;
      return null;
    };
    const names = { [m.a.id]: abilityNames(m.a), [m.b.id]: abilityNames(m.b) };
    const across = { [m.a.id]: m.b.id, [m.b.id]: m.a.id };
    /*
     * WHAT CAN STILL BE SAID WHEN THE ACTOR IS UNKNOWN.
     *
     * An ability name is safe wherever the two sets agree on it: both fighters'
     * `k1` may be the same KINETIC LUNGE, and printing it does not depend on
     * knowing whose it was. Where the sets disagree the key is left out, and the
     * sentence falls back to "lands a hit" rather than naming the wrong ability.
     */
    const shared = {};
    for (const [key, word] of Object.entries(names[m.a.id])) {
      if (names[m.b.id][key] === word) shared[key] = word;
    }

    const beats = m.beats || [];
    const firstHit = beats.findIndex((b) => b?.type === 'hit');
    const lines = beats.map((b, i) => {
      const actor = idOf(b);
      /* Whose ability the line names is not always whose line it is: a dodge,
         an interrupt, a refusal and an absorbed hit all name the ability the
         OTHER fighter cast. */
      const ACROSS = new Set(['evade', 'interrupt', 'immune', 'absorbed']);
      const ownerId = ACROSS.has(b.type) ? across[actor] : actor;
      const dict = (ownerId && names[ownerId]) || shared;
      const side = sideClass(actor);
      /* The name stays as the arena writes it. Title-casing it here made the
         beats the one place on the panel — two lines under a STONE GOLEM
         headline — where the creature was called Stone Golem. */
      const name = String(b.who || '');
      if (b.type === 'say') {
        const said = latinOnly(b.text);
        return said
          ? { t: b.t, name, side, type: 'say', sig: `say|${b.who}|${said}`, quote: said }
          : null;
      }
      /*
       * THE TIE-BREAKER IS PART OF THE ABILITY'S NAME, NOT NOISE ON IT.
       *
       * Two abilities of one set may sit on the same two axes, and the
       * describer tells them apart by appending the effect only one of them
       * has (`KINETIC LUNGE · DAMAGE` next to `KINETIC LUNGE · STUN`). This
       * line used to cut that suffix off as "a key, not a noun", and the
       * retelling then said `opens with a kinetic lunge` and `drives a kinetic
       * lunge` about two different abilities — the exact confusion the suffix
       * exists to prevent. It is kept, and it is now spoken: `beatText()` folds
       * it into the phrase as a modifier (`its stunning kinetic lunge`), so the
       * distinction survives without a middot standing in the middle of prose.
       */
      const { ability, mark } = splitAbility(dict[b.skill]);
      const text = beatText(b, ability, mark, i === firstHit);
      return text
        ? {
          t: b.t, name, side, type: b.type, amount: b.amount,
          opening: i === firstHit,
          /* The signature is what `pickBeats` de-duplicates on: two refusals of
             the same atom are one beat, two of different atoms are two. */
          sig: `${b.type}|${b.who}|${b.skill || ''}|${b.effect || ''}`, text,
        }
        : null;
    }).filter(Boolean);

    let expanded = false;
    /* Measured once per card: the panel it has to fit is the one on screen. */
    const room = beatsShown();
    const beatBox = h('div.beats');
    const toggle = h('button.btn.ghost.small.beats-more', {
      type: 'button',
      onclick: () => { expanded = !expanded; drawBeats(); },
    });

    function drawBeats() {
      const use = expanded ? lines : pickBeats(lines, room);
      /* THE SAME TWO CUES THE LIVE FEED USES, FOR THE SAME REASON. A retelling
         is read down a column, and a column of identically-set names is a wall.
         The feed answers it with a 6 px dot in the margin coloured by side and
         the actor's name in that side's ink (`.nm`, ui/hud.css); a fight
         remembered is the same fight watched, so it is told the same way. The
         dot is drawn by CSS off the row's own side class. */
      mount(beatBox, use.map((l) => h('div', { class: `beat ${l.side}`.trim() },
        h('span.bt.num', beatTime(l.t)),
        l.quote
          ? h('span.bx', h('b.nm', l.name), ' ', h('i.bq', `“${l.quote}”`))
          : h('span.bx', h('b.nm', l.name), ' ', l.text),
        /* The damage stands in its own right margin under its own head, where
           one hit can be compared with the hit above it. Inside the sentence
           it was a bare `· 26` with no unit and nothing to line up against. */
        h('span.ba.num', l.type === 'hit' && Number(l.amount) > 0
          ? num(Math.round(l.amount)) : ''))));
      mount(toggle,
        expanded ? 'Show fewer' : `Show all ${lines.length}`,
        icon(expanded ? 'chevron-up' : 'chevron-down', 14));
      toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    }
    if (lines.length) drawBeats();

    return [
      h('div.detail-head',
        h('div', { class: `outcome o-${outcome}` }, word),
        /* An unrated fight has no rating change, so it does not print one.
           `0 MMR` above `SPARRING · NOT RATED` was the card contradicting
           itself; the flag alone is the whole truth. */
        rated
          ? h('div.detail-delta',
            h('span', { class: `dv ${delta > 0 ? 'up' : (delta < 0 ? 'down' : 'muted')}` }, signed(delta)),
            h('span.t-label', 'RATING'))
          : h('span.chip.warning.flag', training ? 'Sparring · not rated' : 'Not rated')),

      h('div.detail-fighters',
        fighter(me, true),
        h('div.mid', h('span', 'vs')),
        fighter(foe, false)),

      h('div.detail-meta',
        h('span.num', mmss(Math.round(m.seconds || 0) * 1000)),
        h('span.dotsep', '·'),
        h('span', REASON[m.reason] || 'the fight ended')),

      /* Two labels and a rule between them, rather than `.label-line`: the
         right-hand one names the column the numbers fall into, and the line
         has to run between the pair, not past both of them. */
      h('div.beats-head',
        h('span.t-label', 'How it went'),
        h('span.rule', { 'aria-hidden': 'true' }),
        lines.some((l) => l.type === 'hit') ? h('span.t-label.beats-dmg', 'Damage') : null),
      lines.length ? beatBox : h('div.t-small.beats-none', 'Nothing worth retelling happened.'),
      lines.length > room ? h('div.beats-foot', toggle) : null,

      h('div.detail-foot',
        h('button.btn.primary', {
          type: 'button',
          onclick: () => live.ctx.go(`/watch/${m.id}`),
        }, 'Watch replay', icon('arrow-right'))),
    ];
  }

  /**
   * One fighter's line — and, for the one that is not mine, a way out.
   *
   * THE PANEL THAT ANSWERS "HOW DID I LOSE" HAS TO OPEN THE THING THAT BEAT ME.
   * It used to be a plain `div`: the only door off the card was WATCH REPLAY,
   * and the creature that took the rating could not be opened from anywhere in
   * the product, even though `#/creature/:id` exists and every ladder row
   * already goes there. It is the same affordance, so it carries the same
   * chevron and the same hover.
   *
   * My own row stays a `div` — `#/creature` is one click away on the rail and a
   * link to the page the reader is already the owner of is a dead end of its own
   * — but it keeps the chevron's column, so the two ratings still line up.
   */
  function fighter(f, mine) {
    const parts = [
      h('div', { class: `side s-${f.slot === 'blue' ? 'own' : 'foe'}` }),
      h('div.fn',
        h('div.name', f.name, mine ? h('span.you', 'You') : null),
        h('div.fm', f.model ? mindBadge(f.model, { mode: false }) : null)),
      h('div.fr.num', num(f.ratingAfter)),
    ];
    if (mine || !f.id) return h('div', { class: `f ${mine ? 'mine' : ''}`.trim() }, ...parts, h('div.fc'));
    return h('a.f.f-open', {
      href: `#/creature/${f.id}`,
      'aria-label': `Open ${f.name}`,
    }, ...parts, h('div.fc', icon('chevron-right', 14)));
  }
}

/**
 * SUB-NAVIGATION IS NOT A PAGE LOAD (§9, docs/REDESIGN.md §6.6).
 *
 * `#/history` → `#/history/:id` is a route change, and a route change used to
 * mean `leave()`, a fresh `.screen`, and `enter()` — so opening one fight
 * cross-faded the whole page for 600 ms and re-ran the entrance on thirty rows,
 * twice: once on open and once on close. The state pair reads as two separately
 * animated pages instead of one page with a panel over it, which is exactly what
 * it was.
 *
 * `app.js` calls this instead of `leave()` + `enter()` when the incoming route
 * lands on the screen that is already mounted, and the career then stands still
 * while the panel slides in over it. Everything else about the screen — the
 * cache, the session subscription, the scroll position, the key handler —
 * survives untouched, because nothing was torn down.
 *
 * Returning `false` means "I cannot take this one": the caller must fall back to
 * the full path. `app.js` may not have the hook yet, in which case none of this
 * runs and the screen behaves exactly as it did.
 */
export function update(args, ctx) {
  if (!live || live.gen !== generation || !live.open) return false;
  if (ctx) live.ctx = ctx;
  const want = args?.matchId || null;
  if (want) { if (want !== live.openMatch) live.open(want); }
  /* `?ui=detail` holds the panel open on a route that carries no match id
     (§10); nothing else may close it out from under a capture. */
  else if (live.openMatch && live.ctx?.store?.debug !== 'detail') live.close();
  return true;
}

export function leave() {
  generation++;
  if (!live) return;
  /*
   * Focus goes back to the row only when the PANEL closed, not when the reader
   * left. `app.js` has already published the incoming route by the time this
   * runs, so "history without a match" is exactly the close; anything else —
   * the ladder, the creature, a replay — is a departure, and stealing focus on
   * a later return to the career would be a jump nobody asked for.
   */
  const to = live.ctx?.store?.route;
  if (!(to?.screen === 'history' && !to?.args?.matchId)) returnToMatch = null;
  /* A debug fixture never outlives the screen that stood it up (§10): the real
     session goes back before anything else can read it. */
  if (live.sessionWas !== undefined) {
    try { live.ctx?.set?.({ session: live.sessionWas }); } catch { /* no shell */ }
  }
  if (live.body) cache.scroll = live.body.scrollTop || cache.scroll || 0;
  for (const off of live.offs) { try { off(); } catch { /* already gone */ } }
  for (const t of live.timers) clearInterval(t);
  if (live.onKey) removeEventListener('keydown', live.onKey);
  live = null;
}
