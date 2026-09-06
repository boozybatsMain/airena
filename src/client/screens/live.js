/**
 * LIVE — my creature, right now (docs/REDESIGN.md §5, §6.1, §6.2).
 *
 * The battle is drawn by `src/viewer/main.js` into `#arena`, and that layer is
 * never unmounted. This screen owns everything AROUND the fight:
 *
 *   - the phase word over the arena (FIGHTING / SEARCHING FOR OPPONENT / …),
 *   - the few HUD attributes CSS cannot compute for itself: the formatted
 *     clock, the ability tiles' icons and names, the side of a feed line,
 *   - the cards that interrupt: VS, result, the away recap, replay over.
 *
 * WHY ATTRIBUTES AND NOT TEXT. The viewer rewrites `.name`, `.hp > b` and the
 * cooldown chips' text on every frame — thirty times a second. Anything this
 * screen wrote into those nodes would be gone before it was painted. So the
 * shell writes what the viewer never touches (`data-clock`, `data-label`,
 * `data-cd`, `data-side`) and `ui/hud.css` renders it with `content: attr(…)`.
 *
 * ONE EXCEPTION, AND WHY IT IS SYNCHRONOUS. `#meta-*` is written once per
 * match — by the viewer (the raw model id) and then by `app.js` (the mind's
 * name). Both happen inside the `airena:match` handler. If this screen only
 * re-dressed on its own 110 ms tick, the raw id would be on screen for a beat
 * at the start of every fight (§1.1). So it also listens to `airena:match` and
 * re-dresses in a microtask queued after `app.js`'s — same task, no paint in
 * between, nothing raw is ever visible.
 */
import { $, $$, h, mount, clear, svg } from '../lib/dom.js';
import { get } from '../lib/api.js';
import { store } from '../lib/store.js';
import { num, signed, rank as rankOf, clock as clockOf, countdown, latinOnly } from '../lib/format.js';
import { icon } from '../ui/icons.js';
import { mindBadge, mindMark, mindInfo } from '../ui/mind.js';
import { orbit } from '../ui/orbit.js';
import { attachTooltip, hideTooltip } from '../ui/tooltip.js';
import { abilityFallbackSvg, abilitiesOf, reframeIcon, DELIVERY_WORD, ELEMENT_WORD } from '../ui/ability.js';

const FEED_KEY = 'airena.feed';
const AWAY_KEY = 'airena.away.seen';
/* The two colours the viewer paints a side with, as the browser reports them. */
/*
 * WHICH SIDE A VIEWER-WRITTEN NODE BELONGS TO — AND WHY IT IS NOT A STRING
 * COMPARISON ANY MORE.
 *
 * `src/viewer/main.js` marks a feed name, a nameplate, a say-bubble and a
 * damage pill by writing an inline `color` on them, and the shell reads that
 * colour back to set `data-side`, which is what `ui/hud.css` paints from. It
 * did so by comparing against two exact literals — the viewer's old cyan and
 * orange. The moment the viewer's palette moves the comparison silently
 * returns `none`: measured on `live-fighting-w.png`, both of SEAM-70's feed
 * lines came out with a grey dot and a grey name while the seeded line beside
 * them (whose side `seedFeed()` writes directly) was blue.
 *
 * And the addendum makes the palette move by design: the viewer now tints by
 * OWNERSHIP, so a literal that matched last week matches the wrong creature
 * this week. Two things fix it for good.
 *
 *   · The NAME is read first. `match.names` holds both creatures and the
 *     viewer writes the name into the span, so the slot is known without any
 *     colour at all — and a name cannot be re-toned.
 *   · The colour is only the fallback, classified by hue rather than by
 *     equality (blue is the channel where b > r; coral is where r > b), which
 *     survives any re-tone inside those two families. Under the addendum a hue
 *     names the OWNER rather than the slot, so it is mapped back through
 *     `match.mine` — and with no owner the two readings coincide.
 */
const HUE_SIDE = (css) => {
  const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i.exec(String(css || ''));
  if (!m) return null;
  const r = +m[1]; const g = +m[2]; const b = +m[3];
  /* a grey (nothing marked) is neither: the channels have to actually differ */
  if (Math.max(r, g, b) - Math.min(r, g, b) < 24) return null;
  return b > r ? 'own' : 'foe';
};
/** `own`/`foe` → the arena slot, which is what `data-side` carries. */
const slotOf = (role) => {
  if (!role) return 'none';
  const mine = document.body.dataset.mine || store.live.match?.mine || null;
  if (!mine) return role === 'own' ? 'blue' : 'orange';
  return role === 'own' ? mine : other(mine);
};
/** The slot a creature's name belongs to, or null when the name is not in this match. */
function sideOfName(text) {
  const names = store.live.match?.names || null;
  if (!names || !text) return null;
  const want = String(text).trim().toUpperCase();
  if (!want) return null;
  for (const side of ['blue', 'orange']) {
    const n = String(names[side] || '').trim().toUpperCase();
    if (n && n === want) return side;
  }
  return null;
}
const VS_MS = 2400;
const RESULT_MS = 6000;
const TICK_MS = 110;

/*
 * THE TWO REFERENCE CREATURES SPEAK THE SAME LANGUAGE AS EVERYONE ELSE.
 *
 * A creature born from the grammar carries its axes in the match message and
 * its abilities are named from them (§8.3). The two hand-written reference
 * fighters have no grammar entry at all: the viewer labels their chips from a
 * table of bare verbs, so one HUD row read `KINETIC FAN · KINETIC LUNGE` on the
 * left and `SMASH · CHARGE · LEAP` on the right — two vocabularies for one
 * thing, on the one screen a player reads a fight from. Their four shapes are
 * facts about the shapes, not about the balance table, so naming them from the
 * same two axes costs nothing and makes the row one language again.
 */
const REFERENCE_ATOMS = {
  laser: { delivery: 'beam', element: 'laser' },
  blink: { delivery: 'blink', element: 'kinetic' },
  smash: { delivery: 'cone', element: 'kinetic' },
  charge: { delivery: 'dash', element: 'kinetic' },
  jump: { delivery: 'jump', element: 'kinetic' },
};

/*
 * Damage numbers land where the hit landed, and two hits on one body land on
 * one pixel: `−35` drawn twice over itself is a smudge that reads as a single
 * unreadable number. The ring fans simultaneous plates apart without moving
 * any of them far enough to point at the wrong fighter.
 */
const DMG_FAN = [[0, 0], [46, -22], [-44, -16], [24, 26], [-26, 24], [58, 8]];

/*
 * THE LIVE FEED SPEAKS THE PRODUCT'S LANGUAGE, NOT THE SOCKET'S.
 *
 * The viewer writes telemetry: `STONE GOLEM · lunge · 26`, `NEEDLE-79 · beam ·
 * out of range`. That is a machine log standing in the one panel a spectator
 * actually reads, and the fixture the whole redesign was reviewed against
 * (`FEED_FX`) shows sentences. So the line is REBUILT here, from the same two
 * axes the tiles and the History detail already name an ability from — the verb
 * table below is `screens/history.js`'s, deliberately, so the fight reads the
 * same whether it is being watched or remembered (§1.1, §5.2).
 */
const DELIVERY_VERB = {
  beam: 'burns', fan: 'sweeps', bolt: 'throws', mortar: 'lobs', field: 'drops',
  lunge: 'drives', blink: 'strikes with', aura: 'flares', leap: 'comes down with',
  laser: 'burns', smash: 'brings down', charge: 'runs in with',
};
/** The word the viewer prints for a shape, back to the shape (`main.js` SKILL_RU). */
const VIEWER_WORD = {
  laser: 'laser', blink: 'blink', smash: 'smash', charge: 'charge', jump: 'leap',
  beam: 'beam', cone: 'fan', bolt: 'bolt', lob: 'mortar', zone: 'field', dash: 'lunge',
};
/** What the viewer says went wrong, as the end of a sentence. */
const MISS_PHRASE = {
  'passed under the leap': 'under a leap',
  'blocked by cover': 'into cover',
  'out of range': 'short',
  missed: 'wide',
};
const aOrAn = (s) => (/^[aeiou]/i.test(String(s)) ? 'an ' : 'a ');
/* Shapes that carry the fighter rather than something the fighter throws. */
const MOVES_ITSELF = new Set(['lunge', 'leap', 'blink', 'charge', 'jump']);

const CALM = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

let C = null;                 /* the shell's ctx */
let ROOT = null;
let ARGS = {};
let alive = false;
let raf = 0;
let last = 0;
let subs = [];
let els = {};
let ovRoot = null;
let ovKind = null;
let ovTimer = 0;
let outTimer = 0;             /* the exit animation's own clock (§18, §20) */
let dismissing = null;        /* a card already animating out; §23 — one timer, not four */
let resEls = null;
let resHold = false;          /* the result card is under the pointer: do not take it away */
let orb = null;
let midDying = null;          /* the orbit playing its own ending before removal */
let midTimer = 0;
let bootOrb = null;
let feedObs = null;
let dressed = '';
let saidWords = '';
let wordStem = '';
let swapTimer = 0;
let vsSeen = null;
let cards = new Map();        /* creatureId → { rating, rank } — one fetch per fight */
let cardStamp = 0;
let replayTimers = [];
let sim = null;
let fakeRoot = null;
let onMatchNow = null;
let dmgSeq = 0;                /* fans simultaneous damage plates apart */
let plateFloor = 210;          /* px from the top the viewer's plates may not cross */
let onResize = null;
/*
 * The cast plate over a fighter's head is written by the viewer, and what it
 * writes is the socket's composite key (`Lunge·Damage+Stun`) — a debug string
 * on the most visible pixel of the product. The shell cannot stop the viewer
 * writing it, but it knows the product name for the same ability, so it keeps
 * the translation and `ui/hud.css` renders that instead (`data-cast`).
 */
let castNames = { blue: new Map(), orange: new Map() };
/* The same table again, keyed by the word the viewer prints in a FEED line. */
let feedNames = { blue: new Map(), orange: new Map() };
/*
 * WHAT ELSE HAPPENED IN THE ARENA WHILE YOU WERE HERE.
 *
 * The feed only ever held lines the client personally witnessed, so arriving
 * mid-fight — the most common way anyone ever sees this screen — gave an empty
 * column, and between fights it gave nothing at all. Every match that finishes
 * under this tab is a real world event; they are remembered here (never
 * invented) and re-seeded under the two join lines at the start of each fight.
 */
let worldLog = [];
/* Two defeats in a row change what the loss card should offer (§6.2). */
let lossRun = 0;
/* The wait needs a subject, and the last thing that happened to the creature is
   the truest one there is: `STONE GOLEM · LAST: WON +24` under the countdown. */
let lastResult = null;
/* The two portraits the VS card mounts, so they are disposed with the card. */
let vsPortraits = [];
/* The two rating lines on the VS card, rewritten when their fetch lands (§22). */
let vsRates = [];
let vsStamp = -1;
let waitEl = null;
/*
 * The away recap is shown once. `sessionStorage` is the memory that survives a
 * reload — and it is also the one that silently does nothing inside a
 * third-party iframe with site data blocked, which is where this product
 * ships. A module-level flag is what actually closes the card (§24).
 */
let awaySeen = false;
/* the card waiting for the standing one to finish leaving (§42) */
let pending = null;
/* when the phase word may stand down, so the arena gets the top band back (§21) */
let restAt = 0;
/* `--hp` is written from the same mutation that writes the number (§46, §53) */
let hpObs = null;
/* the creatures the wait is actually scanning, and which one is showing (§12) */
let scanPool = null;
let scanAt = 0;
let scanIx = 0;
let scanEl = null;

/* ── small helpers ───────────────────────────────────────────────────────── */

/** localStorage is a getter that throws in private mode; never let it matter. */
function ls(key, value) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value);
  } catch { /* the preference simply is not remembered */ }
  return null;
}
function ss(key, value) {
  try {
    if (value === undefined) return sessionStorage.getItem(key);
    sessionStorage.setItem(key, value);
  } catch { /* same */ }
  return null;
}

const isReplay = () => !!ARGS.matchId;
const phaseNow = () => (sim ? sim.phase : store.live.phase);
const other = (side) => (side === 'blue' ? 'orange' : (side === 'orange' ? 'blue' : null));

/* ── the screenshot fixtures (§10) ───────────────────────────────────────── */

/*
 * The fixtures are ATOMS, not sentences. A screenshot state that invented its
 * own ability names would show a vocabulary the grammar cannot produce, and a
 * reviewer comparing the capture to a real fight would be comparing two
 * different products. `abilitiesOf()` is the same function the real tiles use —
 * the WHOLE list at once, so the fixture is disambiguated exactly as a real kit
 * would be — and the two axes also pick the fallback glyph, so the six tiles
 * draw six different marks instead of six copies of the default (§5.3).
 */
const FX_ATOMS = {
  /* two lunges on one side on purpose: the tie-breaker under the tile
     (`LUNGE·KNOCK` beside `LUNGE·STUN`) is the thing a fight is read from, and
     a capture that never shows it never shows whether it works */
  own: [
    { delivery: 'dash', element: 'kinetic', effects: ['damage', 'knock'] },
    { delivery: 'self', element: 'acid', effects: ['boost'] },
    { delivery: 'dash', element: 'kinetic', effects: ['damage', 'stun'] },
  ],
  foe: [
    { delivery: 'beam', element: 'laser', effects: ['damage'] },
    { delivery: 'lob', element: 'radiation', effects: ['damage', 'burn'] },
    { delivery: 'zone', element: 'acid', effects: ['burn', 'root'] },
  ],
};

const FX = {
  own: {
    name: 'CROCODILE', rank: 782, rating: 1214, hp: [83, 180],
    model: 'google/gemini-3.7-flash',
    wins: 19, losses: 11,
    cd: ['', '3.2', ''],
    abilities: abilitiesOf(FX_ATOMS.own),
  },
  foe: {
    name: 'NEEDLE-79', rank: 819, rating: 1197, hp: [95, 180],
    model: 'z-ai/glm-5.3-flash:plain',
    wins: 27, losses: 14,
    cd: ['1.4', '', ''],
    abilities: abilitiesOf(FX_ATOMS.foe),
  },
};

/*
 * THE PANEL LABELLED LIVE FEED ANSWERS THE FIGHT ON SCREEN.
 *
 * The fixture used to be six lobby lines — `SPIKE reached #100`, `KRAKEN is on
 * a win streak` — under the word FIGHTING, so the one deterministic capture of
 * a battle had nothing in it about the battle. The current match comes first,
 * under its own sub-head, and the world's news follows under a second one
 * (§5.2): two groups, one hairline, and the fight always on top.
 */
/*
 * `data-side` IS THE ARENA SLOT, AND THE FIXTURE HAS TO MEAN IT.
 *
 * `ui/hud.css` paints a feed dot and a feed name from the SLOT, and looks the
 * slot's colour up through ownership (`--slot-*`): with the player on orange,
 * blue is the opponent's colour. The fixture wrote its own creature's lines as
 * `blue` regardless, so a state whose player owns the orange slot printed the
 * player coral and the opponent blue — the exact inversion the whole rule
 * exists to remove. `mine` is the slot the fixture's own creature holds.
 */
const FEED_FX = (me, mine = 'blue') => {
  const foe = mine === 'blue' ? 'orange' : 'blue';
  return [
    ['head', null, 'This fight', ''],
    [mine, me, 'drives a kinetic lunge', '0:22'],
    [foe, FX.foe.name, 'sends a laser beam wide', '0:19'],
    [mine, me, 'flares an acid aura', '0:16'],
    /* "Match found" is the matchmaking EVENT and stays (§9.1); the bout that
       follows it is a fight, and every line that carries its number says so. */
    ['none', 'Match found', `· ${FX.foe.name}`, '0:00'],
    ['head', null, 'The arena', ''],
    /* the world's own results are other people's fights: they keep the slot
       colours, because neither creature in them is the reader's */
    ['orange', 'VOID-12', 'defeated HAMMER-3', '2m'],
    ['blue', 'SPIKE', 'reached #100', '4m'],
    ['orange', 'KRAKEN', 'is on a five-fight win streak', '6m'],
  ];
};

/*
 * WHOSE CREATURE IS IN THE PICTURE.
 *
 * A `?ui=` state draws its own fighters, but the chrome around it does not: the
 * my-chip renders `session.creature`. The captures said CROCODILE · GEMINI in
 * the card and STONE GOLEM · GLM in the chip one inch away — two creatures on
 * one screen, and a reviewer reading the frame has no way to know which is the
 * product. So the fixture wears the session's creature when there is one and
 * falls back to the invented one only for a visitor (§41, §27).
 */
let FIX = { own: FX.own, foe: FX.foe };

function fixtures() {
  const c = store.session?.creature || null;
  const name = (latinOnly(c?.name || '') || '').toUpperCase();
  if (!name) return { own: FX.own, foe: FX.foe };
  return {
    own: {
      ...FX.own,
      name,
      model: c?.model || FX.own.model,
      rank: c?.rank ?? FX.own.rank,
      rating: c?.rating ?? FX.own.rating,
    },
    foe: FX.foe,
  };
}

/**
 * The screenshot states (§10), resolved against the session so a capture never
 * contradicts the chrome standing over it.
 */
function simState(id) {
  const me = FIX.own;
  const T = {
    /* The wait has a subject: how wide the search is, and whose it is (§20). */
    searching: {
      phase: 'searching', hud: false, card: null, word: 'Next fight in 8',
      line: scanLine() || 'Scanning 62 creatures near rating 1,586',
      note: me.name, mind: me.model,
      /* the wait's subject, bottom centre, under the creature itself (§20) */
      status: `${me.name} · last fight won +24`,
      /* and the last fight's payoff, in the result card's own type (§12, §18) */
      last: { outcome: 'win', delta: 24, before: 1536, after: 1560, matchId: '16013462' },
    },
    /* the card is the introduction; a 60 px word announcing the fight while the
       fighters are still being introduced collapses two beats into one (§20) */
    vs: { phase: 'vs', hud: true, card: 'vs', word: '', line: 'Arena · fight #16013462' },
    /* the HUD of §5.2 in its own phase, with no card over the middle of it */
    /*
     * AND THIS ONE'S PLAYER OWNS THE ORANGE SLOT — DELIBERATELY.
     *
     * The addendum's first rule is that blue is the player's creature whatever
     * slot the server handed out, and a capture set in which every fixture
     * owns the blue slot can never photograph the half of the rule that does
     * the work. `?ui=fighting` is the one HUD state with both panels in it, so
     * it takes the orange slot: if the mirror holds, `live-hud.png` is
     * indistinguishable from the blue-owned case — the player on the left, in
     * blue, with YOU — and if it ever breaks, this is the picture that says so.
     */
    fighting: { phase: 'fighting', hud: true, card: null, word: 'Fighting', line: 'Arena · fight #16013462', mine: 'orange' },
    /* The result card owns the countdown and the match id; the big word behind
       it would only say the same sentence twice (§14). */
    'result-win': { phase: 'result', hud: true, card: 'win', word: '', line: '' },
    /* THE FIRST HOUR (§3, §6.2): a creature that has never fought, and its first result. */
    'searching-first': {
      phase: 'searching', hud: false, card: null, word: 'Your first fight is coming',
      line: 'Finding a sparring partner near rating 1,200',
      note: me.name, mind: me.model,
      status: `${me.name} · no fights yet`,
      last: null,
    },
    'result-first': { phase: 'result', hud: true, card: 'win', word: '', line: '', first: true },
    'result-loss': { phase: 'result', hud: true, card: 'loss', word: '', line: '' },
    /* The recap IS the moment; the 60 px word behind it was the defect the card
       was rewritten to remove, and it was still being drawn (§19, §29). */
    away: { phase: 'searching', hud: false, card: 'away', word: '', line: '' },
  };
  return T[id] || null;
}

/* ── enter / leave ───────────────────────────────────────────────────────── */

export async function enter(root, args, ctx) {
  C = ctx; ROOT = root; ARGS = args || {};
  alive = true; dressed = ''; saidWords = ''; wordStem = ''; vsSeen = null; cards = new Map(); cardStamp = 0;
  resHold = false; dismissing = null;
  dmgSeq = 0; castNames = { blue: new Map(), orange: new Map() };
  feedNames = { blue: new Map(), orange: new Map() };
  lossRun = 0;
  FIX = fixtures();
  sim = simState(store.debug);

  els = {
    /*
     * Everything on LIVE happens without the player acting, so everything on
     * LIVE has to be able to say so: the phase word and its line are one polite
     * live region, announced when they change and not while they are being
     * typed (§28, §30).
     */
    /* an `h1`: LIVE is the default route and a screen-reader user's first
       heading-navigation press on the product found nothing (§27, §29) */
    word: h('h1.live-word.t-state'),
    line: h('div.live-line'),
    note: h('div.live-note'),
    mid: h('div.live-mid.passthrough'),
    /* not `.passthrough`: the strip carries a link, and `base.css` kills
       pointer events on every descendant of a passthrough node (§12, §18) */
    status: h('div.live-status'),
    cta: h('div.live-cta'),
  };
  /* NO VEIL. The picture is the renderer's: the shell mounts no full-viewport
     wash over the arena under any beat (`ui/screens/live.css`). */
  mount(root,
    h('div.live-top.passthrough', { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' },
      els.word, els.line, els.note),
    els.mid,
    els.status,
    els.cta);

  ovRoot = h('div.live-ov');
  mountOverlay();

  /* the connection dropping is news, and it was told to nobody (§30) */
  const net = $('#netstate');
  if (net) { net.setAttribute('role', 'status'); net.setAttribute('aria-live', 'polite'); }

  /*
   * A replay has no phase of its own — `app.js` sets `fighting` from the same
   * `match` message a live fight sends — so the two things the recorded fight
   * needs (its supporting veils, and sub-lines strong enough for the bright
   * floor a replay is usually shot on) travel on a class instead (§5, §25).
   */
  $('#hud')?.classList.toggle('replay', isReplay());

  wireFeed();
  wireBoot();
  wireHp();
  if (!sim) seedArena();
  measure();
  onResize = () => measure();
  addEventListener('resize', onResize);

  if (sim) {
    startSim();
  } else {
    subs.push(C.on('live', onLive));
    subs.push(C.on('session', () => { dressed = ''; }));
    /* after app.js's own microtask, before the frame is painted */
    /* the viewer empties `#feed` inside the same socket message; a microtask
       runs after that, which is the only moment a seed survives (§5.2) */
    onMatchNow = (e) => queueMicrotask(() => {
      if (!alive) return;
      const m = e?.detail || store.live.match;
      /*
       * BOTH FIGHTERS' CARDS ARE ASKED FOR HERE, NOT WHEN A CARD IS DRAWN.
       *
       * `cardOf()` returns null on its first call and only then fires the
       * request; the VS card is built at `atSecond < 1.5`, which is inside that
       * round trip. Starting both fetches from the match message gives them the
       * whole VS beat to land in, and `syncVsCard()` rewrites the two lines
       * whenever one does (§19, §22).
       */
      cardOf(m?.ids?.blue); cardOf(m?.ids?.orange);
      dressed = ''; dressHud(); seedFeed(m); wireHp();
    });
    addEventListener('airena:match', onMatchNow);
    if (isReplay()) startReplay();
  }

  paint();
  raf = requestAnimationFrame(tick);
}

/**
 * `#overlay` HAS ONE OWNER AT A TIME, AND FATAL OUTRANKS EVERYTHING.
 *
 * `screens/fatal.js` mounts its full-screen ground into `#overlay` (§6.8), and
 * `mount()` clears the node — so whichever of the two ran last won, and the
 * order is decided by the network. Captured: `THE ARENA IS UNREACHABLE` and its
 * paragraph printed straight through a VS card's `STONE GOLEM · VS ·
 * NEEDLE-42`, both legible at once, which §12 forbids outright.
 *
 * This closes the direction the DOM cannot: LIVE never mounts its overlay layer
 * — nor raises a card into one already mounted — while a fatal ground is up.
 * (The other direction is `ui/screens/worker.css`'s to close; see the notes.)
 */
const fatalUp = () => !!$('#overlay .fatal');

function mountOverlay() {
  if (!ovRoot || fatalUp()) return false;
  if (!ovRoot.isConnected) $('#overlay')?.appendChild(ovRoot);
  return ovRoot.isConnected;
}

export function leave() {
  alive = false;
  cancelAnimationFrame(raf); raf = 0;
  clearTimeout(swapTimer); swapTimer = 0;
  clearTimeout(midTimer); midTimer = 0;
  clearTimeout(outTimer); outTimer = 0;
  for (const off of subs) { try { off(); } catch { /* already gone */ } }
  subs = [];
  if (onMatchNow) { removeEventListener('airena:match', onMatchNow); onMatchNow = null; }
  if (onResize) { removeEventListener('resize', onResize); onResize = null; }
  for (const t of replayTimers) clearTimeout(t);
  replayTimers = [];
  /*
   * AN OVERLAY CARD LEAVES; IT DOES NOT POP OUT OF EXISTENCE.
   *
   * `#overlay` is a sibling layer of `#screen` and never fades with it, so
   * clicking LADDER while a VICTORY card was up deleted the card in one frame
   * and then cross-faded the empty LIVE screen behind it for 620 ms. The module
   * already owns a 320 ms exit (`ov-out`) and simply was not using it here. The
   * state is torn down at once — nothing may still be counted or fetched for a
   * screen that has gone — and only the NODE outlives the call, detached from
   * every reference this module holds (§40).
   */
  clearTimeout(ovTimer); ovTimer = 0;
  ovKind = null; resEls = null; dismissing = null; resHold = false; pending = null;
  markVs(false);
  ROOT?.classList.remove('has-card');
  const dying = ovRoot; ovRoot = null;
  const leaving = dying?.firstElementChild || null;
  if (leaving && !CALM()) {
    leaving.classList.add('out');
    /*
     * THE FACES GO WITH THE CARD, NOT BEFORE IT.
     *
     * `dropPortraits()` destroys the VS card's two rendered fighters, and it
     * ran three lines above the `.out` that starts the card's 620 ms exit — so
     * navigating away while a VS card was up animated out a card with two empty
     * holes in it. The renderers are torn down where the node is (§38).
     */
    setTimeout(() => { dying.remove(); dropPortraits(); }, 620);
  } else { dying?.remove(); dropPortraits(); }
  if (orb) { orb.stop(); orb = null; }
  if (midDying) { try { midDying.stop(); } catch { /* already stopped */ } midDying = null; }
  if (bootOrb) { bootOrb.stop(); bootOrb = null; }
  feedObs?.disconnect(); feedObs = null;
  hpObs?.disconnect(); hpObs = null;
  hideTooltip();

  const hud = $('#hud');
  if (hud) { hud.classList.remove('sim', 'under-vs', 'under-card', 'replay'); delete hud.dataset.mine; }
  /* the screen is going: whatever it asked the camera for, it takes back (§37) */
  aimCamera('auto'); restCamera();
  ROOT?.classList.remove('has-card', 'under-vs');
  /* the attributes this screen writes on `body` (§4.2) leave with it */
  delete document.body.dataset.card;
  delete document.body.dataset.cardSide;
  delete document.body.dataset.sim;
  delete document.body.dataset.mine;
  const wrap = $('#feedwrap');
  if (wrap) {
    wrap.classList.remove('sim', 'empty', 'replay');
    const title = wrap.querySelector('.feed-title');
    if (title) title.textContent = 'Live feed';
    wrap.querySelector('.feed-sim')?.remove();
    wrap.querySelector('.feed-wait')?.remove();
    const btn = wrap.querySelector('.feed-toggle');
    if (btn) btn.onclick = null;
    const head = wrap.querySelector('.feed-head');
    if (head) { delete head.dataset.latest; delete head.dataset.latestNm; delete head.dataset.side; }
  }
  waitEl = null;
  fakeRoot = null;
  /* the card's presence is state now, and the nodes it was built into are
     going: the next mount decides again from nothing */
  ctaUp = null;
  els = {};
}

/* ── the loop ────────────────────────────────────────────────────────────── */

/**
 * The one layout number the shell has to know in JS.
 *
 * `ui/hud.css` owns where the phase word, the clock and the foe's strip sit,
 * and the viewer's floating plates have to stay under all three. The stylesheet
 * publishes the floor as a custom property so there is still exactly one place
 * that decides it; this reads it on entry and on resize, never per frame.
 */
function measure() {
  /* the width that decides whether the feed opens folded is a resize away from
     changing, and this is the one place the screen already listens (§12) */
  foldFeed();
  const hud = $('#hud');
  if (!hud) return;
  const v = parseFloat(getComputedStyle(hud).getPropertyValue('--plate-floor'));
  if (Number.isFinite(v) && v > 0) plateFloor = v;
}

function tick(now) {
  /*
   * The guard comes FIRST. Scheduling the next frame before asking whether the
   * screen is still alive left the loop running purely because `leave()`
   * happened to cancel it while no tick was executing — one synchronous
   * `C.go()` from inside `syncOverlay()` away from a rAF that runs for the life
   * of the tab (§29).
   */
  if (!alive) return;
  raf = requestAnimationFrame(tick);
  /* every frame, because the viewer moves these every frame — and health is
     the one number a fight is read from, so it is not left to the 110 ms tick */
  floaters();
  syncHp();
  if (now - last < TICK_MS) return;
  last = now;
  syncCd();
  syncClock();
  syncDead();
  dressHud();
  syncMid();
  syncFeedState();
  /* before the words, not after: `words()` asks which card is up, and running
     it first showed the phase word for one 110 ms tick behind a card that had
     just been raised to replace it */
  syncOverlay();
  syncVsCard();
  paintWords();
  syncWordRest();
  paintStatus();
  if (bootOrb) {
    const b = $('#boot');
    if (!b || !b.isConnected || b.classList.contains('off')) { bootOrb.stop(); bootOrb = null; }
  }
}

function onLive() {
  noteOver();
  paint();
}

/** Structural repaint: the parts that only change with the phase. */
function paint() {
  paintWords();
  paintStatus();
  paintCta();
  syncMid();
}

/* ── the phase word ──────────────────────────────────────────────────────── */

function matchLine() {
  const m = store.live.match;
  return m && m.seed != null ? `Arena · fight #${m.seed}` : '';
}

function nextIn() {
  const at = store.session?.nextFightAt;
  return at ? at - Date.now() : null;
}

/** The creature's own name and mind, for the states that have no fight in them. */
function selfNote(text) {
  const c = store.session?.creature;
  const name = latinOnly(c?.name || '');
  if (!name) return { note: text ? `Your creature ${text}` : '', mind: null };
  return { note: `${name} ${text}`.trim(), mind: c?.model || null };
}

/**
 * WHAT THE SEARCH IS ACTUALLY DOING, IN ONE LINE.
 *
 * `NEXT FIGHT IN 8` over an empty arena is a countdown to nothing in
 * particular: it names a moment and no subject. The pool being searched and the
 * rating it is being searched around are both already in the session, and both
 * are true — so the wait gets the same `--t-label` second line every other
 * phase has (`ARENA · FIGHT #…`), rather than a lone sentence in body type.
 */
function scanLine() {
  const s = store.session;
  const n = s?.world?.creatures ?? null;
  const r = s?.creature?.rating ?? null;
  if (!(n > 0) || r == null) return '';
  return `Scanning ${num(n)} ${n === 1 ? 'creature' : 'creatures'} near rating ${num(r)}`;
}

function words() {
  /* The away recap owns the screen it interrupts. Its own code comment says the
     60 px phase word behind it was the defect being removed; it was still being
     drawn, because only the `result` case had been given this branch (§19). */
  if (ovKind === 'away') return { word: '', line: '', note: '', mind: null };
  if (sim) return { word: sim.word, line: sim.line, note: sim.note || '', mind: sim.mind || null };
  if (isReplay()) return { word: 'Watching replay', line: matchLine(), note: '', mind: null };

  const s = store.session;
  const m = store.live.match;
  const left = nextIn();

  switch (store.live.phase) {
    case 'connecting': {
      const b = $('#boot');
      const showing = b && b.isConnected && !b.classList.contains('off');
      return { word: showing ? '' : 'Connecting to the arena', line: '', note: '', mind: null };
    }
    case 'idle':
      return { word: 'Arena · live', line: '', note: '', mind: null };
    case 'searching': {
      /*
       * A giant countdown over an empty arena has no subject. Two lines answer
       * it and they answer different halves: the tracked `--t-label` line says
       * what the arena is doing (`SCANNING 62 CREATURES NEAR 1,586 MMR`), the
       * note under it says whose wait this is and which mind is doing the
       * waiting. When the word itself already says "searching", the note stops
       * repeating it and shrinks to the name (§20, §39).
       */
      const bare = selfNote('');
      const line = scanLine();
      if (s?.noOpponent) return { word: 'No opponent free — looking again', line, ...bare };
      if (left != null && left > 0) return { word: `Next fight in ${countdown(left)}`, line, ...bare };
      return { word: 'Searching for opponent', line, ...bare };
    }
    case 'vs':
      /* The card is introducing the two fighters; a 60 px FIGHTING behind it
         has already announced what the card is building up to, and the two
         beats collapse into one. The word arrives with the fight (§20). */
      if (m?.mine) return { word: '', line: matchLine(), note: '', mind: null };
      return { word: 'Arena · live', line: matchLine(), ...restingNote() };
    case 'fighting':
      if (m?.mine) return { word: 'Fighting', line: matchLine(), note: '', mind: null };
      return { word: 'Arena · live', line: matchLine(), ...restingNote() };
    case 'result':
      /* The card says NEXT FIGHT IN 8 and carries the match id in its own
         footer; a 60 px word behind it saying the same thing is noise, and the
         subtitle left standing alone under an empty band is worse (§12, §21). */
      return { word: '', line: '', note: '', mind: null };
    default:
      return { word: '', line: '', note: '', mind: null };
  }
}

function restingNote() {
  const s = store.session;
  if (!s?.creature) return { note: '', mind: null };
  if (s.fightingNow) return { note: '', mind: null };
  const left = nextIn();
  return left != null && left > 0
    ? selfNote(`is resting · next fight in ${countdown(left)}`)
    : selfNote('is waiting for an opponent');
}

/** The word without its digits: `NEXT FIGHT IN 8` and `… IN 7` are one state. */
const stemOf = (s) => String(s || '').replace(/\d+/g, '').trim();

function writeWord(w) {
  els.word.textContent = w.word;
  /*
   * CSS cannot count characters, and the difference between FIGHTING and
   * SEARCHING FOR OPPONENT at 60 px is the difference between one line and two
   * under the season chip (§6). The count that matters is not the same on both
   * devices: at 360 px a fifteen-character phrase already overflows the block
   * and is clipped at both edges, so the step down comes earlier there (§36).
   */
  els.word.classList.toggle('long', w.word.length > (innerWidth < 900 ? 12 : 16));
  els.line.textContent = w.line;
  /*
   * ON A PHONE THE WORD AND ITS FIGHT ARE ONE LINE.
   *
   * `FIGHTING` over `ARENA · FIGHT #16013462` is two bands of the top of a
   * 844 px screen before the battle has any room at all. CSS cannot shorten a
   * sentence, so the short form travels as an attribute and `ui/screens/live.css`
   * swaps to it below 900 px: `FIGHTING · #16013462`, one line (§10, §13).
   */
  const id = /#\s*(\d+)/.exec(w.line || '');
  if (id) els.line.dataset.short = `· #${id[1]}`; else delete els.line.dataset.short;
  if (w.note && w.mind) mount(els.note, h('span', w.note), mindBadge(w.mind, { mode: false }));
  else { clear(els.note); els.note.textContent = w.note; }
}

/**
 * ONE CHOREOGRAPHY FOR THE PHASE CHANGE, NOT FOUR CLOCKS.
 *
 * searching → VS → fighting → result → searching is the loop a player watches
 * dozens of times a session, and the 60 px word at the top of it changed by
 * assignment: an instant swap dead centre. A crossfade on every write would be
 * worse — the countdown rewrites itself once a second and would strobe. So the
 * NON-NUMERIC STEM decides: a new state fades out, is rewritten 160 ms later
 * and fades back; a tick of the same countdown is simply written (§45, §48).
 */
function paintWords() {
  if (!els.word) return;
  const w = words();
  const key = `${w.word}|${w.line}|${w.note}|${w.mind || ''}`;
  if (key === saidWords) return;
  const stem = `${stemOf(w.word)}|${stemOf(w.line)}`;
  const swap = saidWords !== '' && stem !== wordStem && !CALM();
  saidWords = key; wordStem = stem;
  if (!swap) { writeWord(w); return; }
  els.word.classList.add('swap');
  els.line.classList.add('swap');
  clearTimeout(swapTimer);
  swapTimer = setTimeout(() => {
    if (!alive || !els.word) return;
    writeWord(w);
    els.word.classList.remove('swap');
    els.line.classList.remove('swap');
    /* the word is full size again whenever the state changes; three seconds
       into a fight `syncWordRest()` stands it down (§21) */
    els.word.classList.remove('rest');
  }, 220);
}

/**
 * THE WORD ANSWERS ITS QUESTION AND THEN GETS OUT OF THE WAY.
 *
 * At second 28 of a fight the largest element on the screen was `FIGHTING` — a
 * question the two health bars, the clock and the two moving creatures had
 * already answered — while the fight itself had roughly 800 × 420 px between a
 * 175 px top band, 300 px of fighter panels and the feed. Three seconds is long
 * enough to read a word; after that the arena gets the band back, and any
 * change of state (`writeWord`) brings the word straight back to full (§21).
 */
function syncWordRest() {
  if (!els.word) return;
  const on = !CALM() && !ovKind && !sim && phaseNow() === 'fighting' && !!els.word.textContent;
  if (!on) {
    restAt = 0;
    if (els.word.classList.contains('rest')) els.word.classList.remove('rest');
    return;
  }
  if (!restAt) { restAt = performance.now() + 3000; return; }
  if (performance.now() >= restAt) els.word.classList.add('rest');
}

/**
 * THE WAIT HAS A SUBJECT.
 *
 * `NEXT FIGHT IN 8` over an empty floor names a moment and no one it happens
 * to. The creature is already in the picture — the orbit now sits on it — and
 * this line under it says whose wait this is and how the last one went, which
 * is the fact a player between fights actually wants (§19, §22).
 */
function statusText() {
  if (sim) return sim.status || '';
  const ph = phaseNow();
  if (isReplay() || (ph !== 'searching' && ph !== 'idle')) return '';
  const c = store.session?.creature;
  const name = latinOnly(c?.name || '').toUpperCase();
  if (!name) return '';
  if (lastResult) {
    const { outcome, delta } = lastResult;
    const said = outcome === 'win' ? 'won' : (outcome === 'loss' ? 'lost' : 'drew');
    return delta == null ? `${name} · last fight ${said}` : `${name} · last fight ${said} ${signed(delta)}`;
  }
  if (c?.fights > 0) return `${name} · ${num(c.wins || 0)}–${num(c.losses || 0)}`;
  return `${name} · waiting for its first fight`;
}

/**
 * THE LAST FIGHT'S PAYOFF, IN THE RESULT CARD'S OWN TYPOGRAPHY.
 *
 * Between fights is the largest share of a returning session and the only
 * reward on screen was `STONE GOLEM · LAST FIGHT WON +24` in ~10 px grey at the
 * bottom edge, under 60 px of NEXT FIGHT IN 8 and an empty floor — the fight
 * that had just delivered +24 left no visible trace and no way back into it.
 * Same outcome word, same signed delta, same rating move as the card that
 * reported it, plus the door back in (§12, §18).
 */
function lastStrip() {
  const r = lastResult;
  if (!r) return null;
  const kind = r.outcome === 'win' ? 'win' : (r.outcome === 'loss' ? 'loss' : 'draw');
  const move = r.before != null && r.after != null && r.before !== r.after
    ? `${num(r.before)} → ${num(r.after)}` : '';
  return h('div.live-last',
    h(`div.ll-w.${kind}`, WORD[kind]),
    r.delta != null ? h(`div.ll-d.${kind}`, `${signed(r.delta)} RATING`) : null,
    move ? h('div.ll-m', move) : null,
    r.matchId ? h('a.ll-a', { href: `#/watch/${r.matchId}` }, 'Watch it again', icon('arrow-right')) : null);
}

function paintStatus() {
  if (!els.status) return;
  const ph = phaseNow();
  const resting = !isReplay() && (ph === 'searching' || ph === 'idle');
  const r = resting ? lastResult : null;
  const key = r
    ? `strip|${r.outcome}|${r.delta}|${r.before}|${r.after}|${r.matchId || ''}`
    : `line|${statusText()}`;
  /* the node is rebuilt only when what it says changes: this runs at 110 ms */
  if (els.status.dataset.said === key) return;
  els.status.dataset.said = key;
  if (r) { mount(els.status, lastStrip()); return; }
  const t = statusText();
  if (!t) { clear(els.status); return; }
  mount(els.status, h('span.ll-line', t));
}

/* ── the middle and the bottom card ──────────────────────────────────────── */

/**
 * WHERE THE PLAYER'S CREATURE IS STANDING, IN SCREEN PIXELS.
 *
 * The viewer already projects every fighter once a frame — it has to, to hang a
 * nameplate over its head — and it writes the answer into the plate's own
 * inline `left`/`top`. Reading it back costs nothing, needs no camera maths and
 * cannot drift from what is drawn, which is the whole reason the orbit can
 * stand ON the creature rather than on the middle of an empty floor (§19, §22).
 */
function bodyPoint() {
  const hud = $('#hud');
  if (!hud) return null;
  const mine = hud.dataset.mine || store.live.match?.mine || null;
  const plates = [...hud.querySelectorAll('.plate')];
  const pick = plates.find((p) => p.dataset.side === mine) || plates[0] || null;
  if (!pick) return null;
  const x = px(pick.style.left);
  const y = px(pick.style.top);
  if (x == null || y == null || !(x > 0) || !(y > 0)) return null;
  /*
   * A STALE PROJECTION IS NOT A PLACE.
   *
   * The plate keeps whatever `left`/`top` the viewer last wrote it, so a
   * finished fight, a camera that has not moved, or a body that has left the
   * frame all leave a point that marks nothing. The searching capture put the
   * ring at (340, 680) — low and left of BOTH visible bodies, on empty floor,
   * where it reads as a smudge on the ground rather than as a search. The ring
   * claims a body only while the point is moving and inside the frame;
   * otherwise the wait is centred, which is what §6.1 asks for (§5, §9).
   */
  const now = performance.now();
  const at = `${Math.round(x)},${Math.round(y)}`;
  if (pick.dataset.pt !== at) { pick.dataset.pt = at; pick.dataset.ptms = String(now); }
  if (now - (Number(pick.dataset.ptms) || 0) > 900) return null;
  /* never behind the feed, never under the phase block: outside those bounds
     the point is not clamped into them, it is simply not used */
  const wide = innerWidth >= 900;
  const left = wide ? 200 : 60;
  const right = wide ? innerWidth - 360 : innerWidth - 60;
  if (x < left || x > right) return null;
  if (y < 240 || y > innerHeight - 260) return null;
  return { x, y: Math.min(innerHeight - 220, y + 46) };
}

/**
 * THE CREATURES THE WAIT IS ACTUALLY LOOKING AT.
 *
 * The sub-line already claims `SCANNING 36 CREATURES NEAR 1,555 MMR` and the
 * ring under it drew nothing but rings. These are the real rows of the ladder
 * nearest my own rating — nothing is invented, and one request serves the tab's
 * whole life (§12).
 */
let scanList = [];
function scanCandidates() {
  if (scanPool) return;
  scanPool = 1;
  get('/api/ladder?top=100')
    .then((r) => {
      const mineId = store.session?.creature?.id || null;
      const mineRate = store.session?.creature?.rating ?? null;
      const rows = (r?.top || [])
        .filter((c) => c?.id && c.id !== mineId && latinOnly(c?.name || ''));
      if (mineRate != null) {
        rows.sort((a, b) => Math.abs((a.rating ?? 0) - mineRate) - Math.abs((b.rating ?? 0) - mineRate));
      }
      scanList = rows.slice(0, 12).map((c) => ({
        name: latinOnly(c.name).toUpperCase(), rating: c.rating ?? null,
      }));
    })
    .catch(() => { /* the ring is a complete answer on its own */ });
}

function syncScan() {
  if (!els.mid || !orb) { scanEl = null; return; }
  if (els.mid.dataset.at === 'body') return;      /* the ring is a marker there */
  if (!scanList.length) { scanCandidates(); return; }
  const now = performance.now();
  if (scanEl && scanEl.isConnected && now - scanAt < 700) return;
  scanAt = now;
  const c = scanList[scanIx++ % scanList.length];
  const next = h('div.live-scan',
    h('span.sn', c.name),
    c.rating != null ? h('span.sr', `${num(c.rating)} rating`) : null);
  const old = els.mid.querySelector('.live-scan');
  if (old) old.replaceWith(next); else els.mid.appendChild(next);
  scanEl = next;
}

function placeMid() {
  if (!els.mid) return;
  const at = bodyPoint();
  if (at) {
    els.mid.style.setProperty('--mid-x', `${Math.round(at.x)}px`);
    els.mid.style.setProperty('--mid-y', `${Math.round(at.y)}px`);
    els.mid.dataset.at = 'body';
  } else if (els.mid.dataset.at) {
    els.mid.style.removeProperty('--mid-x');
    els.mid.style.removeProperty('--mid-y');
    delete els.mid.dataset.at;
  }
}

/**
 * The orbit ARRIVES and LEAVES; it does not blink.
 *
 * `mount`/`clear` at the searching↔fighting boundary popped a 140 px animation
 * and its sky disc in and out several times a minute, on the one screen that is
 * never navigated away from. It now mounts at zero and is raised on the second
 * frame, and on the way out it collapses (the animation's own ending) under a
 * 320 ms fade before the canvas is removed (§45, §48).
 */
function syncMid() {
  if (!els.mid) return;
  const want = !isReplay() && (phaseNow() === 'searching' || phaseNow() === 'connecting');
  if (want) placeMid();
  if (want && !orb) {
    clearTimeout(midTimer); midTimer = 0;
    if (midDying) { try { midDying.stop(); } catch { /* already stopped */ } midDying = null; }
    const cv = h('canvas.live-orbit', { width: 280, height: 280 });
    mount(els.mid, cv);
    els.mid.classList.remove('out');
    /*
     * THE ONE COLD OBJECT IN A WARM WORLD, AND IT WAS THE ONE ON SCREEN.
     *
     * `#2E2E33` is the interface's ink — b* ≈ 0 — and the waiting orbit is the
     * only thing standing in front of a pale, warm plaza. Measured on
     * `live-searching.png`: the rings bottomed out at L 19 with 700 pixels
     * under L 45 in the middle of the frame, over a floor at #EBE2D9. The
     * brief caps every non-fighter at `--sand` and forbids a second accent, so
     * a schematic in UI ink pasted onto the arena is the one thing this state
     * may not be. `#8D7F73` is the boot orbit's own value two hundred lines
     * below and the darkest ink the brief allows anything that is not a
     * fighter — the same drawing, in the arena's palette.
     */
    orb = orbit(cv, { mode: 'search', color: '#8D7F73' });
    scanEl = null;
    /*
     * A FLUSH, NOT A PROMISE.
     *
     * `requestAnimationFrame(() => requestAnimationFrame(…))` is the pattern
     * `app.js`'s `reveal()` names as the reason four of fifty-six captures came
     * back with `.entering` still applied: on a page also driving a WebGPU
     * arena the second frame is not guaranteed, and a chain that stalls leaves
     * the orbit mounted and running at opacity 0 for the whole wait. Reading
     * `offsetWidth` forces the layout the transition needs; the timeout is the
     * belt under it (§44).
     */
    void els.mid.offsetWidth;
    els.mid.classList.add('in');
    setTimeout(() => els.mid?.classList.add('in'), 120);
  } else if (!want && orb && !midTimer) {
    try { orb.collapse(); } catch { /* the animation has no ending to play */ }
    els.mid.classList.remove('in');
    els.mid.classList.add('out');
    midDying = orb;
    orb = null;
    midTimer = setTimeout(() => {
      midTimer = 0;
      try { midDying?.stop(); } catch { /* already stopped */ }
      midDying = null;
      if (!els.mid) return;
      clear(els.mid);
      scanEl = null;
      els.mid.classList.remove('out', 'in');
    }, CALM() ? 0 : 700);
  }
  syncScan();
}

/*
 * THE CARD IS BUILT WHEN IT ARRIVES, NOT ON EVERY TICK — AND ITS ARRIVAL MOVES
 * THE FLOOR.
 *
 * Re-mounting the same two nodes several times a second restarted the card's
 * own 520 ms entrance animation on a screen where nothing had changed. Worse,
 * the card is the lowest thing docked at the top of a PHONE (`ui/hud.css`
 * raises `--plate-floor` while it is up), and `measure()` is read on entry and
 * on resize — neither of which is when a stranger's session resolves. So the
 * presence is state, and the one frame it changes on is the frame the floor is
 * re-read.
 */
let ctaUp = null;
function paintCta() {
  if (!els.cta) return;
  const s = store.session;
  const visitor = !s?.creature && !s?.job;
  const want = !sim && visitor && !isReplay();
  if (ctaUp === want) return;
  ctaUp = want;
  if (want) {
    mount(els.cta, h('div.live-card',
      h('div.hd', 'You are watching the arena.'),
      h('a.btn.primary', { href: '#/create' }, 'Create a creature', icon('arrow-right'))));
  } else {
    clear(els.cta);
  }
  measure();
}

/* ── the HUD the viewer owns ─────────────────────────────────────────────── */

/**
 * The cooldown seconds as an attribute, and the sweep as a fraction.
 *
 * `src/viewer/main.js` sets `el.dataset.cd` itself (§5.3). Until that hook is
 * in, the number is read back out of the chip's own text — the same number,
 * one tick later — so the tiles are never blank in the meantime.
 *
 * §5.3 also allows the tile a conic ring "if `--cd-frac` is provided", and the
 * fraction needs a denominator the socket never sends. It does not have to:
 * the first value seen after a tile goes cool IS the ability's full cooldown,
 * so the tile calibrates itself from its own first tick and the ring is honest
 * from the second use onward. The number carries the value, the ring carries
 * the timing — which is the whole reason the digits stopped being the only
 * thing on the tile.
 */
function syncCd() {
  for (const el of $$('#hud .cds > .cd')) {
    /*
     * THE FALLBACK UN-LATCHES.
     *
     * `data-cdown` used to mean "keep reading the number out of the chip's own
     * text, forever": any tile the 110 ms tick caught between construction and
     * the viewer's first frame kept the flag for the element's life, after
     * which the shell overwrote the viewer's authoritative value with a regex
     * over its own text — one tick stale, permanently, for that tile. The flag
     * now means only "the last value here was mine", and the instant the
     * viewer writes anything else the shell stands down (§24).
     */
    if (el.dataset.cd === undefined || (el.dataset.cdown && el.dataset.cd === el.dataset.cdmine)) {
      el.dataset.cdown = '1';
      const m = (el.textContent || '').match(/(\d+\.\d)\s*$/);
      const v = el.classList.contains('cool') && m ? m[1] : '';
      if (el.dataset.cd !== v) el.dataset.cd = v;
      el.dataset.cdmine = v;
    } else if (el.dataset.cdown) { delete el.dataset.cdown; delete el.dataset.cdmine; }
    const n = parseFloat(el.dataset.cd || '');
    if (!Number.isFinite(n) || n <= 0) {
      if (el.dataset.cdmax) { delete el.dataset.cdmax; el.style.removeProperty('--cd-frac'); }
      continue;
    }
    /*
     * A COOLDOWN IS LEGIBLE FROM ITS FIRST FRAME.
     *
     * `--cd-frac` is a registered property with `initial-value: 0` and a 130 ms
     * transition, and the seconds badge fades in from `scale(.72)` over 220 ms
     * — so a tile that had just fired showed an almost-empty ring and a badge
     * measured at 1.4:1, in exactly the seconds a player is reading the row to
     * find out what is on cooldown. On the first frame of a cooldown both are
     * WRITTEN rather than animated; `ui/hud.css` reads this attribute (§44, §50).
     */
    if (!el.dataset.cdmax) {
      el.dataset.cdnew = '1';
      requestAnimationFrame(() => requestAnimationFrame(() => { delete el.dataset.cdnew; }));
    }
    const max = Math.max(Number(el.dataset.cdmax) || 0, n);
    el.dataset.cdmax = String(max);
    el.style.setProperty('--cd-frac', (n / max).toFixed(3));
  }
}

/**
 * THE BAR AND THE NUMBER UNDER IT SAY THE SAME THING.
 *
 * Measured on the live capture: both fills painted their full 420 px under the
 * numbers `41 / 180` and `23 / 180` — an unbroken `#BAD6FF → #6EA8FF` gradient
 * from one end of the track to the other at 23 % health. A health bar that
 * reads FULL while the fighter is nearly dead is not a cosmetic defect; it is
 * the screen lying about the only stake the fight has, on the screen the
 * product is named after.
 *
 * `main.js` writes `width` on that `<i>` itself, thirty times a second, through
 * a reference it resolved once at load — so trying to correct the same property
 * is a race the shell loses nine times out of ten. It does not need to win a
 * race: the stylesheet gives the fill `width: var(--hp) !important` and the
 * shell owns `--hp`. The value is derived from the very text the viewer printed
 * beside the bar (`.hp > b`), so the fill and the numbers cannot disagree —
 * whatever left the inline width behind, this is the one number both read.
 */
/**
 * THE FILL FOLLOWS THE NUMBER IN THE SAME FRAME, NOT ONE FRAME LATER.
 *
 * `syncHp()` polls, and a poll is by construction at least one paint behind the
 * write it is chasing: `live-replay.png` caught a bar painted 100 % of its
 * 334 px track directly above its own label `153 / 180`, with a `−27` pill
 * floating over that very fighter. A MutationObserver on the `.hp > b` text
 * runs as a microtask on the mutation itself, so the fill and the number are
 * written into the same frame and cannot disagree. The per-frame poll stays as
 * the belt: it is two elements and a regex (§46, §53).
 */
function wireHp() {
  hpObs?.disconnect();
  hpObs = new MutationObserver(() => syncHp());
  for (const b of $$('#hud .bar-wrap .hp > b')) {
    hpObs.observe(b, { childList: true, characterData: true, subtree: true });
  }
  syncHp();
}

function syncHp() {
  for (const bar of $$('#hud .bar-wrap .hp')) {
    const b = bar.querySelector('b');
    const i = bar.querySelector('i');
    if (!b || !i) continue;
    const m = (b.textContent || '').match(/(-?[\d.]+)\s*\/\s*([\d.]+)/);
    if (!m) continue;
    const max = Number(m[2]);
    if (!(max > 0)) continue;
    const want = `${Math.max(0, Math.min(100, (Number(m[1]) / max) * 100)).toFixed(1)}%`;
    if (i.dataset.hp !== want) {
      /*
       * THE FIRST WRITE IS A SNAP, NOT A SWEEP.
       *
       * `.hp > i` carries `transition: width 140ms linear`, and the fill's
       * unwritten value is full — so joining a fight already in progress swept
       * the bar down from 100 % to the truth, and every capture taken inside
       * that 140 ms measured a bar that disagreed with its own number: 60 %
       * under `45 / 180`, 95 % under `102 / 180`. The transition is suppressed
       * for the first value an element ever receives and restored on the next
       * frame, so a bar arrives at the truth and only animates from there
       * (§43, §49).
       */
      if (!i.dataset.hp) {
        i.dataset.snap = '1';
        requestAnimationFrame(() => requestAnimationFrame(() => { delete i.dataset.snap; }));
      }
      i.dataset.hp = want; i.style.setProperty('--hp', want);
    }
  }
}

/**
 * `28.4` → `00:28`, and the clock stops being a stopwatch with no target.
 *
 * A number counting up says nothing about how far into a fight a spectator has
 * arrived: `00:24` is either nearly over or barely begun and the screen would
 * not say which. The arena's own deadline is already in the client
 * (`cfg.suddenDeathAt` — from that second it starts burning both fighters), so
 * the clock carries it: a hairline rule filling towards the deadline, and the
 * time left under it. Past the deadline the rule is full and the line names
 * what is now happening instead (§57, §67).
 */
function burnAt() {
  try {
    const v = Number(window.airena?.cfg?.suddenDeathAt);
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch { return null; }
}

function syncClock() {
  const c = $('#clock');
  if (!c) return;
  const t = parseFloat(c.querySelector('.t')?.textContent || '0') || 0;
  const v = clockOf(t);
  if (c.dataset.clock !== v) c.dataset.clock = v;
  const at = burnAt();
  const tEl = c.querySelector('.t');
  /*
   * THE FIGHT'S CLOCK STOPS WITH THE FIGHT.
   *
   * `VS / 00:28 / 01:02 LEFT` was still counting under the VICTORY card on
   * every result capture — a live-looking countdown on a bout that had already
   * been scored, beside a card counting down to the NEXT one. Two clocks in
   * one frame, one of them lying. `ui/hud.css` also stands the whole block down
   * during `result`; this is the belt for the paths that phase cannot reach
   * (a replay's own ending, a socket that resolves late) (§45, §53).
   */
  const done = !!store.live.over;
  if (tEl) {
    let left = '';
    if (done) left = `Final ${clockOf(t)}`;
    else if (at != null) left = t >= at ? 'Sudden death' : clockOf(at - t);
    if (tEl.dataset.left !== left) tEl.dataset.left = left;
    /*
     * THE FALLBACK, NOT A SECOND CLOCK.
     *
     * `ELAPSED 00:28` used to stand permanently under the hero number, so the
     * block stated one time twice and the only labelled reading was the one
     * nobody wants (`00:28` over `ELAPSED 00:01` in the replay capture). The
     * elapsed value is still published — a replay has no `suddenDeathAt` and
     * therefore no `data-left`, and `ui/hud.css` promotes this into the hero
     * slot rather than letting the whole block collapse (§8, §10, §17, §63).
     */
    if (tEl.dataset.elapsed !== v) tEl.dataset.elapsed = v;
  }
  const frac = done || at == null ? null : Math.max(0, Math.min(1, t / at));
  if (frac == null) { if (c.dataset.burn) { delete c.dataset.burn; c.style.removeProperty('--burn'); } }
  else {
    c.style.setProperty('--burn', frac.toFixed(3));
    const near = frac >= 1 ? 'on' : (frac >= 0.75 ? 'near' : 'off');
    if (c.dataset.burn !== near) c.dataset.burn = near;
  }
  const s = c.querySelector('.s');
  const text = (s?.textContent || '').trim();
  /*
   * The status line carries the arena's own news (sudden death) and nothing
   * else. The bout's number is already in the phase sub-line above and on the
   * result card; printed here as well it grew the pill a third row, which the
   * feed panel then sliced through the middle of its glyphs (§46, §51).
   */
  const keep = !!text && !!latinOnly(text) && !/(?:match|fight)\s*#/i.test(text);
  c.classList.toggle('mute', !keep);
}

/**
 * A KNOCKOUT IS A MARK, NOT A FADE.
 *
 * `main.js` puts `.dead` on the losing panel and stops its chips; the panel was
 * then washed to half opacity, which made the name, the rating and the three
 * tiles the palest things on the screen at the single most important instant of
 * the fight. The dimming now belongs to the type alone (`ui/hud.css`) and the
 * fact gets said out loud, in the slot that already carries YOU (§60, §70).
 */
function syncDead() {
  /* the ability row stands down with the fight, focus order included (§30) */
  const resting = phaseNow() === 'result';
  for (const el of $$('#hud .cds > .cd')) {
    const want = resting ? -1 : 0;
    if (el.tabIndex !== want) el.tabIndex = want;
    if (resting) el.setAttribute('aria-hidden', 'true'); else el.removeAttribute('aria-hidden');
  }
  for (const wrap of $$('#hud .bar-wrap')) {
    const tag = wrap.querySelector('.sidetag');
    if (!tag) continue;
    /*
     * THE MARKER MOVES HOUSE ONCE, AND NEVER AGAIN.
     *
     * §5.1 fixes the viewer's DOM: `.sidetag` is the last child of `.col`,
     * after the ability tiles. Left there it is a sibling of `.namerow` in a
     * wrapping row, and the moment a name grew two letters the pill went to
     * line two — which on the mirrored panel is a screen-width from the name it
     * marks (`live-replay.png`). Moved INSIDE `.namerow` it is a cell of that
     * row's grid and cannot leave it. The node is the viewer's, it keeps its
     * id-free `[data-side]` hook, and nothing that queries it cares which
     * parent it hangs from (§48, §59).
     */
    const row = wrap.querySelector('.namerow');
    if (row && tag.parentNode !== row) row.appendChild(tag);
    const down = wrap.classList.contains('dead');
    if (down) {
      /*
       * DOWN JOINS YOU; IT DOES NOT REPLACE IT.
       *
       * The pill was overwritten, so on a phone — where the player's own panel
       * is simply the lower of two identical strips — the one marker saying
       * which creature is theirs vanished at the exact instant the fight turned
       * on it. Both facts fit in one pill: the base word stays and `ui/hud.css`
       * writes `· DOWN` after it (§60).
       */
      if (!tag.dataset.down) { tag.dataset.base = tag.textContent || ''; tag.dataset.down = '1'; }
      const want = tag.dataset.base || 'Down';
      if (tag.textContent !== want) tag.textContent = want;
      /* nothing to append to: the pill is the word on its own */
      tag.toggleAttribute('data-solo', !tag.dataset.base);
    } else if (tag.dataset.down) {
      tag.textContent = tag.dataset.base || '';
      delete tag.dataset.down;
      delete tag.dataset.base;
      tag.removeAttribute('data-solo');
    }
  }
}

const sideOf = (el) => sideOfName(el.querySelector?.('.nm')?.textContent || el.textContent)
  || slotOf(HUE_SIDE(el.style.color));

const px = (s) => { const n = parseFloat(s); return Number.isFinite(n) ? n : null; };

/**
 * The socket's composite key, made readable, for a wind-up nobody has named.
 *
 * `Lunge·Damage+Stun` is a debug string on the most looked-at pixel in the
 * product, so only its head is kept and its separators become spaces; the
 * stylesheet upper-cases and ellipsises whatever comes out. Empty in, empty
 * out — an empty `data-cast` never matches `[data-cast]` and the bar stays
 * bare rather than growing a blank line.
 */
const castWord = (raw) => latinOnly(String(raw || '').split(/[·|]/)[0] || '')
  .replace(/[._\-+]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 22);

/**
 * The three things the viewer floats over the fight, kept civil.
 *
 * The viewer positions all three from the creature's projected screen point and
 * nothing else, which is right for a debug renderer and wrong for a product:
 * a fighter near the top of the frame speaks over the phase word, a fighter at
 * the edge speaks off-screen entirely, and two hits in one tick print two
 * numbers on one pixel. None of that can be fixed where it is drawn (§1.2), so
 * it is corrected here — always through custom properties and never by writing
 * `left`/`top`, which the viewer owns and rewrites on the next frame.
 */
function floaters() {
  const hud = $('#hud');
  if (!hud) return;

  for (const el of hud.querySelectorAll('.dmg')) {
    /*
     * A MISSED SIDE IS RETRIED, NOT REMEMBERED.
     *
     * `sideOf()` matches the inline colour the viewer sets, and it sets it on
     * the frame the pill is created — so a pill read one frame early cached
     * `none` for its whole life, which falls back to `--ink-2`. One frame of
     * three showed a damage number that did not say whose hit it was (§59).
     */
    if (el.dataset.side !== 'blue' && el.dataset.side !== 'orange') {
      const side = sideOf(el);
      if (side === 'none') delete el.dataset.side; else el.dataset.side = side;
    }
    /*
     * ONE TYPOGRAPHIC SYSTEM FOR EVERY NUMBER THE PRODUCT SIGNS.
     *
     * The viewer prints `-19.5` — a fraction the simulation happens to carry,
     * and a hyphen where §2.2 mandates a real minus. The result card's `−18
     * MMR` is right beside it. Damage is rounded and re-signed here, on the one
     * channel the viewer does not rewrite after creation.
     */
    if (el.dataset.num !== el.textContent) {
      const m = /^\s*([-−+])\s*(\d+(?:\.\d+)?)\s*$/.exec(el.textContent);
      if (m) {
        const want = `${m[1] === '+' ? '+' : '−'}${Math.round(Number(m[2]))}`;
        if (el.textContent !== want) el.textContent = want;
        /* a hit is the only event the fight has, and every one of them was
           announced by the same 13 px pill whatever it cost (§51) */
        el.toggleAttribute('data-big', Math.round(Number(m[2])) >= 20);
      }
      el.dataset.num = el.textContent;
    }
    if (el.dataset.fan) continue;
    el.dataset.fan = '1';
    const [dx, dy] = DMG_FAN[dmgSeq++ % DMG_FAN.length];
    /*
     * MEASURED BEFORE IT IS WRITTEN TO, ONCE, FOR THE PILL'S WHOLE LIFE.
     *
     * `offsetWidth` after `setProperty` is a read-after-write, and a
     * read-after-write is a forced style+layout flush — on the beat where the
     * frame budget is tightest and with several pills alive at a time. The
     * fan offsets do not change the pill's width (they are transform inputs),
     * so the measurement can simply come first; the `data-fan` guard already
     * keeps the whole block to one pass per pill. The say-bubble loop below
     * caches the same way behind a text-change guard (§23).
     */
    const w = el.offsetWidth || 46;
    el.style.setProperty('--dx', `${dx}px`);
    el.style.setProperty('--dy', `${dy}px`);
    /*
     * A pill fanned outwards from a fighter standing at the edge of a 390 px
     * screen is fanned OFF it: the phone capture showed the leftmost of three
     * numbers clipped to a single digit. Same clamp the say-bubble already
     * gets, applied once — the viewer moves damage numbers by animation, not by
     * rewriting `left` (§55, §62).
     */
    const left = px(el.style.left);
    if (left == null) continue;
    const half = w / 2 + Math.abs(dx);
    const min = 8 + half;
    const max = Math.max(min, innerWidth - 8 - half);
    const shift = Math.round(Math.min(max, Math.max(min, left)) - left);
    if (shift) el.style.setProperty('--sx', `${shift}px`);
  }

  for (const el of hud.querySelectorAll('.plate')) {
    if (!el.dataset.side) el.dataset.side = sideOf(el);
    /* the cast name, in the product's own vocabulary rather than the socket's */
    const lab = el.firstElementChild;
    const raw = lab ? lab.textContent : '';
    if (raw !== el.dataset.raw) {
      el.dataset.raw = raw;
      /*
       * A WIND-UP ALWAYS SAYS WHAT IT IS.
       *
       * The lookup misses whenever the socket's composite key is not one this
       * screen has seen — a body whose abilities arrived late, a replay of an
       * older creature, a compound key the compiler spells differently — and
       * the miss used to `delete data-cast`, so `hud.css`'s label never fired
       * and the telegraph came out as a nameless dash floating 40 px above a
       * fighter's head (`live-fighting-w.png`: rows 225–240 uniform L 91). The
       * product's own name is better than the socket's, but the socket's is far
       * better than nothing — it is the only thing on screen that says a hit is
       * COMING, which is the brief's whole telegraph promise (§8).
       */
      const named = castNames[el.dataset.side]?.get(raw) || castWord(raw);
      if (named) el.dataset.cast = named; else delete el.dataset.cast;
    }
    /* out of the phase word's band: a nameplate riding a fighter's head into
       the top of the frame reads as debris under a 60 px word */
    const top = px(el.style.top);
    const lift = top != null && top < plateFloor ? plateFloor - top : 0;
    const want = lift ? `${Math.round(lift)}px` : '';
    if (el.dataset.lift !== want) {
      el.dataset.lift = want;
      el.style.setProperty('--lift', want || '0px');
    }
  }

  for (const el of hud.querySelectorAll('.saybubble')) {
    if (!el.dataset.side) el.dataset.side = sideOf(el);
    /* the size only changes with the words, and reading it is a layout flush */
    if (el.dataset.said !== el.textContent) {
      el.dataset.said = el.textContent;
      el.dataset.w = String(el.offsetWidth || 0);
      el.dataset.h = String(el.offsetHeight || 0);
    }
    const w = Number(el.dataset.w) || 0;
    const left = px(el.style.left);
    if (left == null || !w) continue;
    const half = w / 2;
    const min = 10 + half;
    const max = Math.max(min, innerWidth - 10 - half);
    const shift = Math.round(Math.min(max, Math.max(min, left)) - left);
    const want = `${shift}px`;
    if (el.dataset.sx !== want) { el.dataset.sx = want; el.style.setProperty('--sx', want); }
    /*
     * AND A QUIP OBEYS THE SAME CEILING THE NAMEPLATE DOES.
     *
     * The plate is lifted out of the phase word's band a few lines above; the
     * bubble was not, and it stands 34 px HIGHER than the plate it belongs to
     * — so a fighter that walked under the camera put a quip above the floor
     * every plate is held under. The capture gate caught it as
     * `fists beat photo × Create a creatur` on `live-visitor-m`: the bubble on
     * the visitor's invitation, which on a phone is docked at the top of the
     * frame. Its top edge is `top − height − 34`, and that is the edge that
     * has to clear the floor.
     */
    const hgt = Number(el.dataset.h) || 0;
    const top = px(el.style.top);
    const head = top == null ? null : top - hgt - 34;
    const lift = head != null && head < plateFloor ? Math.round(plateFloor - head) : 0;
    const ly = lift ? `${lift}px` : '0px';
    if (el.dataset.ly !== ly) { el.dataset.ly = ly; el.style.setProperty('--ly', ly); }
  }
}

/**
 * WHICH ARENA SLOT THE PLAYER OWNS — PUBLISHED ON `body`, FOR THE WHOLE PAGE.
 *
 * The founder's addendum (`reports/arena/ARENA-AAA.md` §1) supersedes
 * REDESIGN §2.1: blue is the PLAYER's creature and orange the OPPONENT's, on
 * every surface, whatever slot the server handed out. Everything that has to
 * mirror for that — the two fighter panels' positions and colours, the feed
 * dots, the cast plates, the say-bubbles, the damage pills, the VS and result
 * cards — is CSS, and CSS cannot ask a socket a question. So the answer is one
 * attribute on `body`, written from the one place that holds it
 * (`store.live.match.mine`, computed on the server against this socket's own
 * creature).
 *
 * `src/viewer/main.js` writes the same attribute from the same message this
 * round. Two writers, one value, one source — the viewer keeps it in step with
 * the floor telegraphs it tints, and this keeps it in step with the HUD when a
 * `?ui=` state has no socket at all.
 *
 * `#hud` still carries a copy, and it is now ONLY a copy. The phone stack in
 * `ui/hud.css` used to select on `#hud:not([data-mine])` while the desktop
 * block selected on `body[data-mine]` — one layout decision read from two
 * attributes written by two writers on two clocks, and in the window between
 * them (a spectator match arriving, which deletes `body`'s) the panels could
 * be swapped by one rule set and not the other. Every rule in that file reads
 * `body` now; this attribute is left for the few queries in this module that
 * ask the HUD directly, and nothing lays out from it (§22).
 */
function markMine() {
  const b = document.body;
  const side = sim ? (sim.hud ? (sim.mine || 'blue') : null) : (store.live.match?.mine || null);
  /*
   * AND IT IS STICKY ACROSS THE GAP BETWEEN TWO FIGHTS.
   *
   * `app.js` sets `live.match` to null the moment the arena goes idle, and the
   * eight seconds that follow still show the fight that just ended: the result
   * card, the last-fight strip and a feed still narrating it. Clearing the
   * attribute there would flip every one of those names and dots to the other
   * colour for the length of the wait. So an answer is written and a NON-answer
   * is not: the value is cleared by `leave()` when the screen goes, and by the
   * viewer's own `applySides()` when a new match arrives with no owner (a
   * guest, someone else's fight) — which is the one event that actually means
   * "nobody here is yours". A `?ui=` fixture speaks for itself either way.
   */
  if (side) { if (b.dataset.mine !== side) b.dataset.mine = side; } else if (sim) delete b.dataset.mine;
  /* `#hud` keeps a copy because the phone stack is keyed on it; it is a mirror
     of `body`'s and never a second opinion. */
  const hud = $('#hud');
  if (hud) {
    const v = b.dataset.mine || '';
    if (v) { if (hud.dataset.mine !== v) hud.dataset.mine = v; } else delete hud.dataset.mine;
  }
}

function dressHud() {
  markMine();
  if (sim) return;
  const m = store.live.match;
  /* the tiles' own labels are part of the key: the viewer fills them in a frame
     or two after it rebuilds the chips, and that is a reason to dress again */
  const n = $$('#hud .cds > .cd').map((e) => e.dataset.label || '').join('|');
  const key = m ? `${m.matchId}|${m.mine || '-'}|${n}|${cardStamp}` : `none|${n}`;
  if (key === dressed) return;
  dressed = key;
  /* which side is mine decides which panel takes the lower slot on a phone —
     and, since the addendum, which one takes the LEFT slot on a desktop and
     which colour each of them wears (`markMine()`, above) */
  dressSide('blue', m);
  dressSide('orange', m);
}

function dressSide(side, m) {
  const wrap = $(side === 'blue' ? '#bar-oct' : '#bar-gor');
  if (!wrap) return;
  const mine = m?.mine === side;
  wrap.classList.toggle('mine', mine);
  const tag = wrap.querySelector('.sidetag');
  const say = mine ? 'You' : (m?.following === side ? 'Watching' : '');
  /* a downed fighter's slot belongs to `syncDead()` until it stands again */
  if (tag) { if (tag.dataset.down) tag.dataset.base = say; else tag.textContent = say; }
  const sub = wrap.querySelector('.sub');
  if (sub) mount(sub, subLine(side, m, mine));
  dressTiles(wrap, side, m);
}

/**
 * `#782 · 1,214 MMR` — §5.2, and nothing else.
 *
 * No mind badge: it is already on the VS card, and repeating it here made the
 * line longer than the name above it. No rating drift either — that number is
 * the change since the player's last VISIT, and sitting one line under a
 * result card reading DEFEAT −18 it read as this fight's delta and contradicted
 * it (§11, §15). The drift belongs to the chrome's my-chip and the away recap.
 *
 * Ratings are not in the `match` message. Mine comes from the session; the
 * opponent's is worth one request per fight, cached for the page's life.
 */
function subLine(side, m, mine) {
  const out = [];
  let rating = null; let rk = null;

  /*
   * THE MIND COMES FIRST, BECAUSE IT IS THE PRODUCT'S WHOLE CLAIM.
   *
   * §5.1 says the shell re-renders `#meta-*` as a mind badge; it did not, and
   * the model the viewer writes there was simply discarded — so for a stranger
   * "an AI model is this creature's mind" was on screen for the 2.4 s of the VS
   * card and nowhere at all during the ninety seconds they actually watch. On a
   * phone the mark alone carries it; there is no room for the name and the
   * rating both (§66, §68).
   */
  const model = m?.meta?.[side]?.model || (mine ? store.session?.creature?.model : null) || null;
  const mind = model
    ? h('span.mind', mindMark(model, 14), innerWidth >= 900 ? h('span.mind-name', mindInfo(model).name) : null)
    : null;

  /* Not under `#/watch/:id`: a fight from last week is not the place to print
     the rating the creature holds today, and the History detail for that same
     match reports the other number (§28). */
  if (mine && !isReplay() && store.session?.creature) {
    rating = store.session.creature.rating ?? null;
    rk = store.session.creature.rank ?? null;
  } else if (m?.ids?.[side]) {
    const c = cardOf(m.ids[side]);
    if (c) { rating = c.rating; rk = c.rank; }
  }

  if (rk != null) out.push(h('span', rankOf(rk)));
  if (rating != null) {
    if (out.length) out.push(h('span.sep', '·'));
    out.push(h('span', `${num(rating)} rating`));
  }
  /* the separator is only ever BETWEEN two things: a mind with no rating behind
     it used to leave a middot hanging off the end of the line */
  if (mind) return out.length ? [mind, h('span.sep', '·'), ...out] : [mind];
  return out.length ? out : [h('span', '—')];
}

/**
 * Cached, one in flight per creature; a resolved card forces one repaint.
 * The record comes back in the same payload and the VS card needs it, so it is
 * kept rather than thrown away and fetched a second time (§47).
 */
function cardOf(id) {
  if (!id) return null;
  if (cards.has(id)) return cards.get(id);
  cards.set(id, null);
  get(`/api/creature/${id}`)
    .then((r) => {
      const c = r?.creature || null;
      cards.set(id, {
        rating: c?.rating ?? null,
        rank: r?.rank ?? null,
        wins: c?.wins ?? null,
        losses: c?.losses ?? null,
        fights: c?.fights ?? null,
      });
      cardStamp++;
    })
    .catch(() => { /* the line simply stays blank */ });
  return null;
}

/**
 * AN ABILITY HAS ONE NAME, AND THE FIGHT USES IT.
 *
 * The tile used to drop the element word for width — the reveal taught EMBER
 * BEAM, the creature page said EMBER BEAM, the tooltip said EMBER BEAM, and the
 * fight said BEAM. Three names at birth and none of them again during the one
 * event they exist for is not a space saving; it is the vocabulary §5.3's
 * labels are there to teach, thrown away at the moment it would pay off (§11,
 * §15, §24).
 *
 * The name fits because it STACKS. `EMBER` over `BEAM` is two words under a
 * circle — which is exactly what `BLOOD SCENT` is in the reference — and the
 * stylesheet already renders the break (`white-space: pre-line`). The
 * tie-breaker a kit with two lunges needs (`· KNOCK` beside `· STUN`) takes a
 * third, quieter line rather than being crushed onto the second.
 */
function hudWords(ab) {
  const full = String(ab?.name || '').trim();
  const cut = full.indexOf(' · ');
  const base = cut < 0 ? full : full.slice(0, cut);
  const mark = cut < 0 ? '' : full.slice(cut + 3).trim();
  const shape = String(DELIVERY_WORD[ab?.delivery] || base.split(/\s+/).pop() || '').toUpperCase();
  const elem = String(ELEMENT_WORD[ab?.element] || '').toUpperCase()
    || base.split(/\s+/).slice(0, -1).join(' ').toUpperCase();
  if (!shape) return { label: full.toUpperCase(), short: '' };
  const stack = [elem, shape].filter(Boolean).join('\n');
  return {
    label: full.toUpperCase(),
    short: mark ? `${stack}\n· ${mark}` : stack,
    /* the cast plate is 88 px of nowrap type over a fighter's head: the name
       without its tie-breaker is the longest thing that fits there */
    cast: base.toUpperCase() || full.toUpperCase(),
  };
}

/**
 * Icons, names and tooltips on the viewer's cooldown chips.
 *
 * THREE SOURCES, ONE VOCABULARY. The server's `abilities` field is the
 * description; when it is missing (an old match) the raw atoms are described
 * HERE — the WHOLE kit at once, with the very function the server uses, so the
 * uniqueness pass runs and two lunges do not arrive as two identical tiles
 * (§8.3). A reference creature has no atoms at all and gets them from
 * `REFERENCE_ATOMS`, so its row speaks the same language as the row opposite.
 * The composite `Fan·Damage+Knock` label the socket carries is not a name and
 * is never shown — but it IS what the viewer prints on the cast plate, so the
 * translation is kept here for `floaters()` to apply.
 */
/**
 * The tile's artwork, as two custom properties `ui/hud.css` composes with.
 *
 * `--glyph` is one or two `url()` layers (the generated icon, then the
 * procedural mark it falls back to) and `--glyph-size` the matching sizes.
 * 72 %, not 58: at 58 the drawn mark came out 23 px inside a 48 px disc and
 * read as a speck rather than as the ability's sign.
 */
/*
 * THE GENERATED ICON IS RE-KEYED BEFORE IT IS SHOWN — THE CALL `ui/ability.js`
 * HAS BEEN WAITING FOR.
 *
 * The generator draws pure black monoline strokes on a white sheet at 512 px.
 * Pointed at straight from CSS and squeezed into a 40 px disc, a three-pixel
 * stroke is a fifth of a pixel: full ink averages down to a grey hairline, and
 * that is arithmetic, not something `background-blend-mode` can fix. Measured
 * across the six tiles of `live-fighting.png`, darkest glyph pixel against the
 * tile face: 1.62, 1.40, 1.40, 1.98, 1.94, 2.92 : 1 — five of six under 3:1,
 * three of them blank white discs. And it was decided by the picture: the same
 * three icons re-sampled to 40 px bottom out at 166, 108 and 52, so a tile's
 * legibility was whatever weight the model happened to draw with.
 *
 * `reframeIcon` is exported for exactly this, and its own comment says the call
 * "has not been made yet". It does the three things a downscale destroys:
 * re-frames the drawing to one optical size, keys DARKNESS TO OPACITY against
 * a nailed-down ramp so every stroke lands on full ink whatever grey it
 * arrived in, and thickens the coverage by two cells of a 256 grid so what
 * survives the squeeze is a pixel and a half. The white sheet goes with it, so
 * a generated tile and a drawn one finally sit on the same glass.
 *
 * The drawn mark is what is on screen until the picture comes back, and it is
 * what stays if `judge()` refuses the picture (a blank sheet, a black bar) or
 * the canvas will not paint. Read once per icon and cached: six pictures per
 * match, none of them read twice.
 */
const inkedIcons = new Map();   /* icon url → the re-keyed data URI, or '' */
function inkedIcon(url) {
  const had = inkedIcons.get(url);
  if (had !== undefined) return had;
  inkedIcons.set(url, null);    /* in flight: asked for, not yet answered */
  const img = new Image();
  const done = (src) => {
    inkedIcons.set(url, src || '');
    /* eight matches' worth of pictures. The live screen is never navigated away
       from, so a cache with no ceiling is a data URI per icon per fight held
       for the length of a session; the oldest go, and a fight that comes round
       again simply reads its six pictures a second time (§2). */
    while (inkedIcons.size > 48) inkedIcons.delete(inkedIcons.keys().next().value);
    /* the row is dressed again rather than patched: `dressTiles` is the only
       thing that knows which element carries which slot, and it is idempotent */
    for (const el of $$('.cds > .cd')) if (el.dataset.glyphsrc === url) applyGlyph(el);
  };
  img.onload = () => { try { const { ok, src } = reframeIcon(img); done(ok ? src : ''); } catch { done(''); } };
  img.onerror = () => done('');
  img.src = url;
  return null;
}

/** Put whatever the tile's two sources currently amount to onto the element. */
function applyGlyph(el) {
  const url = el.dataset.glyphsrc || '';
  const fb = el.dataset.glyphfb || '';
  const inked = url ? inkedIcons.get(url) : '';
  const one = `url("${inked || fb}")`;
  /*
   * THE SAME PICTURE THREE TIMES, WHICH IS HOW A HAIRLINE SURVIVES 34 PIXELS.
   *
   * `reframeIcon` thickens coverage by two cells of a 256 grid — calibrated,
   * its own comment says, for a 52 px glyph box. The battle tile's box is 34,
   * so a stroke the generator drew as a hairline still arrives at about two
   * thirds of a pixel: measured on the re-keyed capture, five of six tiles at
   * 4.2–6.1 : 1 and one bare vertical bar at 1.85. Compositing the layer over
   * itself takes a coverage `a` to `1 − (1 − a)³` — an opaque stroke stays
   * exactly where it was, and the antialiased hairline that carries the whole
   * of a thin glyph goes from a third of the ink to two thirds of it. It is
   * the same operation `thicken()` performs, done by the compositor at the
   * size the picture is actually seen at (§6).
   */
  const img = `${one}, ${one}, ${one}`;
  if (el.dataset.glyph === img) return;
  el.dataset.glyph = img;
  el.style.setProperty('--glyph', img);
  /* 86 %, not 72: at 72 the drawn mark came out about 10 px of ink inside a
     48 px disc and read as a smudge rather than as the ability's sign (§63).
     One size for both sources now — the re-framed picture carries the same
     12 % margin in its own square that the drawing builds into its viewBox. */
  el.style.setProperty('--glyph-size', '86%, 86%, 86%');
}

function setGlyph(el, ab, cid, slot) {
  const fb = abilityFallbackSvg(ab || {}, 48);
  const url = cid ? `/api/creature/${cid}/icon/${slot}` : '';
  if (el.dataset.glyphfb !== fb) el.dataset.glyphfb = fb;
  if (el.dataset.glyphsrc !== url) el.dataset.glyphsrc = url;
  if (url) inkedIcon(url);
  applyGlyph(el);
}

function dressTiles(wrap, side, m) {
  const list = [...wrap.querySelectorAll('.cds > .cd')];
  const kit = m?.kits?.[side] || null;
  const keys = kit ? Object.keys(kit) : [];
  /* one pass over the whole kit, not one call per tile: names are only unique
     against each other, and a per-slot describe skips that comparison */
  const own = kit ? abilitiesOf(keys.map((k) => kit[k])) : null;
  const abil = m?.abilities?.[side] || null;
  const cid = m?.ids?.[side] || null;
  const casts = new Map();
  const feeds = new Map();

  list.forEach((el, i) => {
    const ref = REFERENCE_ATOMS[el.dataset.skill] || null;
    const ab = (abil && abil[i]) || (own && own[i]) || (ref ? abilitiesOf([ref])[0] : null);
    const full = latinOnly(String((ab && ab.name) || el.dataset.label || '')
      .replace(/\s+\d+(\.\d+)?$/, '').trim()).toUpperCase();
    const w = ab ? hudWords(ab) : { label: full, short: '' };
    /* never clobber with nothing: until the description arrives the viewer's
       own label is all there is, and a blank tile is worse than a plain word */
    if (w.label) el.dataset.label = w.label;
    /* absent, not empty: the label then falls back to whatever `label` holds */
    if (w.short) el.dataset.short = w.short; else delete el.dataset.short;
    /* `data-tiny` (the delivery word alone, `BEAM` / `MORTAR` / `FIELD`) is
       gone: §9.1 forbids dropping the element word, and the phone captures
       labelled two different abilities `FAN` and `FAN` (§7, §9, §32, §60) */
    delete el.dataset.tiny;

    /* the socket's composite key for this slot → the name the product uses */
    const rawKey = keys[i] && kit[keys[i]] ? String(kit[keys[i]].ru || '') : '';
    const plate = w.cast || w.label;
    if (rawKey && full) casts.set(rawKey, plate);
    if (el.dataset.skill && full) casts.set(el.dataset.skill, plate);

    /*
     * The same two facts again, keyed by the word the VIEWER prints in a feed
     * line: it lower-cases the composite key for a grammar creature and picks
     * from its own small table for a reference one, so both spellings are
     * registered and `dressFeedLine()` can turn either back into a sentence.
     */
    if (full) {
      const say = { name: full.split(' · ')[0].toLowerCase(), delivery: ab?.delivery || '' };
      if (rawKey) feeds.set(rawKey.toLowerCase(), say);
      if (el.dataset.skill) {
        const k = String(el.dataset.skill).toLowerCase();
        feeds.set(k, say);
        if (VIEWER_WORD[k]) feeds.set(VIEWER_WORD[k], say);
      }
    }

    /*
     * THE GLYPH TRAVELS AS A CUSTOM PROPERTY, NOT AS `background-image`.
     *
     * A cooling tile draws four things in one background stack — a wash over
     * the glyph, the glyph, an opaque interior, and the conic sweep under it —
     * and only the stylesheet can compose that. Written to `background-image`
     * from here, the glyph WAS the whole stack and the ring had nowhere to go,
     * which is why the seconds ended up printed on top of the artwork (§1, §5.3).
     */
    setGlyph(el, ab, cid, i);

    el.dataset.ttl = full || el.dataset.label || 'Ability';
    el.dataset.tbody = latinOnly(String((ab && ab.blurb) || ''));
    /* The only place a creature's rules are written during a fight. A div with
       `font-size: 0` says none of it to a keyboard or a screen reader (§26). */
    /*
     * FOCUSABLE AND LABELLED, BUT NOT A BUTTON.
     *
     * The tile announced itself as `role="button"` and nothing handled Enter
     * or Space on it — an ARIA contract violation (WCAG 4.1.2) on the one
     * control that carries a creature's rules during a fight. What it actually
     * is, is a labelled thing whose description opens on focus, and that is now
     * what it says it is (§23).
     */
    /* during the result card the row is washed back: a control whose label is
       under the 3:1 floor may not also be a focus stop (§30) */
    el.tabIndex = phaseNow() === 'result' ? -1 : 0;
    el.removeAttribute('role');
    el.setAttribute('aria-label', el.dataset.tbody ? `${el.dataset.ttl}. ${el.dataset.tbody}` : el.dataset.ttl);
    /* `attachTooltip` is idempotent and keeps its own flag; a second one here
       under a different name is how four listeners per tile happen (§26) */
    attachTooltip(el, () => ({ title: el.dataset.ttl, body: el.dataset.tbody }));
  });

  castNames[side] = casts;
  feedNames[side] = feeds;
}

/* ── the feed ────────────────────────────────────────────────────────────── */

/**
 * FOLDED UNDER 1280, NOT ONLY ON A PHONE.
 *
 * The panel is docked top-right under the account chip (`ui/hud.css`), and at
 * 1440 the corner it stands in is spare. At 1280 it is not: the camera solver
 * is allowed to place a fighter out to 88 % of the half-width, and the capture
 * that proved it (`live-fighting-w.png`) has a body under the panel's
 * bottom-left corner. So below 1280 the feed opens as its own head — one row
 * that says LIVE FEED and a chevron — and the fight keeps the width.
 *
 * A stored preference always wins: this is the DEFAULT, not a lock, and a
 * player who opened the feed at 1200 px keeps it open. Read on entry and on
 * resize, never per frame.
 */
function foldFeed(wrap = $('#feedwrap')) {
  if (!wrap) return;
  const pref = ls(FEED_KEY);
  if (pref === 'off') { wrap.classList.add('off'); return; }
  if (pref === 'on') { wrap.classList.remove('off'); return; }
  wrap.classList.toggle('off', matchMedia('(max-width: 1279px)').matches);
}

function wireFeed() {
  const wrap = $('#feedwrap');
  if (!wrap) return;
  /*
   * NOTHING IN A REPLAY IS LIVE, AND NOTHING IN IT HAPPENED "NOW".
   *
   * The panel kept the title LIVE FEED under the state word WATCHING REPLAY,
   * with `now` stamped on every line of a recording. It is the one place the
   * interface stated something the player could see was untrue (§17, §40, §43).
   */
  const title = wrap.querySelector('.feed-title');
  if (title) title.textContent = isReplay() ? 'Fight log' : 'Live feed';
  wrap.classList.toggle('replay', isReplay());
  foldFeed(wrap);
  const btn = wrap.querySelector('.feed-toggle');
  if (btn) {
    clear(btn);
    btn.appendChild(icon('chevron-down', 14));
    /* the state is read from the panel, not assumed: the button said "collapse
       the feed" on a phone where the feed had just been folded for you (§32) */
    const say = () => {
      const off = wrap.classList.contains('off');
      btn.setAttribute('aria-expanded', off ? 'false' : 'true');
      btn.setAttribute('aria-label', off ? 'Expand the feed' : 'Collapse the feed');
    };
    say();
    btn.setAttribute('aria-controls', 'feed');
    btn.onclick = () => {
      const off = wrap.classList.toggle('off');
      /* `null` used to mean "no preference", which at 1200 px is the same as
         "folded" — so opening the feed there was undone by the next resize.
         Both answers are now recorded, and `foldFeed` only guesses when there
         is genuinely nothing stored. */
      ls(FEED_KEY, off ? 'off' : 'on');
      say();
    };
  }
  /*
   * A column that empties is not the same thing as a column that is not there.
   * The panel used to be removed the moment `#feed` ran dry — which is exactly
   * the first second of every fight and the whole of every wait — so the right
   * third of the screen blinked in and out. It keeps its place and says what it
   * is doing instead (§7, §19).
   */
  if (!wrap.querySelector('.feed-wait')) {
    waitEl = h('div.feed-wait', 'Watching…');
    wrap.appendChild(waitEl);
  } else waitEl = wrap.querySelector('.feed-wait');

  const feed = $('#feed');
  if (!feed) return;
  /*
   * The fight narrates itself and the narration was told to nobody: LIVE is the
   * default route, every line on it arrives without the player acting, and a
   * log is exactly what this is — additions only, politely (§28, §30).
   */
  feed.setAttribute('role', 'log');
  feed.setAttribute('aria-live', 'polite');
  feed.setAttribute('aria-relevant', 'additions');
  feed.setAttribute('aria-label', isReplay() ? 'Fight log' : 'Live feed');
  for (const el of feed.children) dressFeedLine(el);
  feedObs = new MutationObserver((recs) => {
    for (const r of recs) {
      if (r.target === feed) { for (const n of r.addedNodes) dressFeedLine(n); }
      else dressFeedLine(r.target);
    }
  });
  feedObs.observe(feed, { childList: true, subtree: true });
}

/**
 * A LINE OF THE FIGHT, REWRITTEN AS A SENTENCE.
 *
 * A feed line arrives as markup with the side's colour inline and the socket's
 * vocabulary in the text: `STONE GOLEM · lunge · 26`. The side is worth keeping
 * — the colour itself belongs to the palette, not to the renderer — and the
 * rest is telemetry standing where the running commentary of the product ought
 * to be. So the side becomes an attribute, the inline colour goes, and the tail
 * is rebuilt from the names the tiles already resolved for this very fight.
 *
 * Nothing is invented: when the ability behind a word is not known (the
 * description has not arrived yet, or the line is a quip), the viewer's own
 * text is kept and only the colour is lifted off it.
 */
function dressFeedLine(el) {
  if (!el || el.nodeType !== 1 || el.parentNode?.id !== 'feed') return;
  /*
   * A NEW LINE ARRIVES; IT DOES NOT APPEAR.
   *
   * The feed is the most frequently changing block in the product and it was
   * the only one that changed without any transition: a line snapped in at the
   * top and the five under it jumped down. 220 ms and six pixels is the whole
   * fix (§46, §53).
   */
  if (!el.dataset.in) { el.dataset.in = '1'; if (!CALM()) el.classList.add('feed-in'); }
  /*
   * THE FIGHT STAYS UNDER ITS OWN SUB-HEAD — EVERY LINE, NOT THE FIRST ONE.
   *
   * The viewer prepends each new line to the very top of `#feed`, above the
   * `THIS FIGHT` label it belongs to. The repair used to be a single hop that
   * only fired while the new node was `firstElementChild` AND its next sibling
   * carried `data-head` — true for exactly one line, and a fight prepends
   * several per burst. The capture showed four narration lines floating above
   * their own heading with the two seeded rows below it.
   *
   * So placement is unconditional and happens ONCE per line: every line lands
   * immediately under the head, which keeps the newest first inside its own
   * group and can never be defeated by batching (§56, §63).
   */
  if (!el.dataset.placed) {
    el.dataset.placed = '1';
    const head = fightHead(el.parentNode);
    if (head && el !== head && el.previousElementSibling !== head) {
      el.parentNode.insertBefore(el, head.nextSibling);
    }
  }
  if (el.dataset.seed) return;
  /* our own rewrite mutates the node the observer is watching: the signature
     stops the second pass from parsing what the first pass wrote */
  const raw = el.textContent;
  if (el.dataset.raw === raw) return;
  el.dataset.raw = raw;

  /* the viewer stamps raw seconds (`12.4`); the fixture, the feed's world lines
     and every other clock in the product read `0:12` (§5.2) */
  const ft = el.querySelector('.ft');
  if (ft && /^\s*\d+(\.\d+)?\s*$/.test(ft.textContent)) {
    ft.textContent = clockOf(parseFloat(ft.textContent)).replace(/^00:/, '0:');
  }

  const span = el.querySelector('span[style*="color"]');
  if (!span) { if (!el.dataset.side) el.dataset.side = 'none'; return; }
  const side = sideOfName(span.textContent) || slotOf(HUE_SIDE(span.style.color));
  el.dataset.side = side;
  span.style.color = '';
  span.classList.add('nm');

  const out = feedSentence(el, span, side);
  if (!out) { el.dataset.raw = el.textContent; return; }
  const stamp = el.querySelector('.ft');
  /* the noun clause, for the phone's one-line ticker (§34) */
  el.dataset.clause = `${span.textContent} · ${out.clause}`;
  mount(el, stamp || null, out.amount ? h('span.fd', out.amount) : null, span, out.said);
  el.dataset.raw = el.textContent;
}

/**
 * The tail of one feed line as a verb phrase, or `null` to leave it alone.
 *
 * Four shapes come out of `main.js`: a hit (`· lunge · 26`), a miss
 * (`· beam · out of range`), a repeat marker (`x3`) and a quip (`· “…”`).
 */
function feedSentence(el, nameSpan, side) {
  let after = false;
  let amount = null; let repeat = ''; let quip = false;
  const tail = [];
  for (const n of el.childNodes) {
    if (n === nameSpan) { after = true; continue; }
    if (!after) continue;
    if (n.nodeType !== 1) { tail.push(n.textContent); continue; }
    const tag = n.tagName;
    if (tag === 'B') { amount = n.textContent.trim(); continue; }
    if (tag === 'I') { quip = true; continue; }
    if (/^x\d+$/i.test(n.textContent.trim())) { repeat = n.textContent.trim(); continue; }
    tail.push(n.textContent);
  }
  if (quip) return null;                       /* a quip is already a sentence */

  const text = tail.join('').replace(/^\s*·\s*/, '').replace(/\s*·\s*$/, '').trim();
  if (!text) return null;

  const known = feedNames[side] || null;
  let key = '';
  if (known) for (const k of known.keys()) { if (k && text.startsWith(k) && k.length > key.length) key = k; }
  const ab = key ? known.get(key) : null;
  const name = ab?.name || (key ? key : text.split('·')[0].trim());
  if (!name) return null;
  const rest = (key ? text.slice(key.length) : text.slice(name.length)).replace(/^\s*·\s*/, '').trim();

  const shape = String(ab?.delivery ? VIEWER_WORD[ab.delivery] || '' : '')
    || name.split(/\s+/).pop().toLowerCase();
  const verb = DELIVERY_VERB[shape] || 'lands';
  /*
   * ONE WRITER FOR THE FIGHT AND FOR THE RETELLING OF IT.
   *
   * `screens/history.js` writes `drives a kinetic lunge` and moved the damage
   * into a column of its own on purpose — a bare number hanging off a middot
   * has no unit and reads as telemetry. The running commentary said `drives a
   * KINETIC LUNGE · 26`: the same sentence shouted mid-word with the same
   * number bolted back on. The damage is already on screen, in the pills the
   * viewer floats over the bodies; the feed keeps the sentence (§39, §42).
   */
  const said = name.toLowerCase();
  const art = aOrAn(said);
  const tick = repeat ? ` ${repeat}` : '';
  /*
   * THE AMOUNT COMES BACK — IN A COLUMN, NOT BOLTED ONTO THE SENTENCE.
   *
   * It was dropped because `drives a KINETIC LUNGE · 26` reads as telemetry
   * with the number hanging off a middot. A right-aligned tabular column is
   * what §6.6's History rows already do with the same quantity, and it is the
   * only lasting trace a hit leaves: the pill over the body lives 1.1 s (§51).
   */
  /* the simulation carries fractions and the viewer prints them (`33.15`);
     §2.2 says a number the player reads is whole, with a real minus */
  const hitN = amount == null ? null : Number(String(amount).replace(/[−–]/g, '-'));
  const hit = Number.isFinite(hitN)
    ? `${hitN < 0 ? '−' : ''}${Math.abs(Math.round(hitN))}`
    : (amount != null ? String(amount).replace(/^-/, '−') : null);

  if (amount != null) return { said: ` ${verb} ${art}${said}${tick}`, clause: said, amount: hit };
  const miss = MISS_PHRASE[rest.toLowerCase()];
  if (miss === 'into cover') return { said: ` hits cover with ${art}${said}${tick}`, clause: said, amount: null };
  /*
   * A LUNGE IS NOT SENT ANYWHERE.
   *
   * `sends a kinetic lunge wide` is right for a beam and wrong for a body
   * moving under its own power: a leap that misses is a leap that missed, not
   * a projectile that went past. The shapes that MOVE the fighter say so; the
   * shapes that THROW something keep `sends … wide/short` (§9.1).
   */
  if (miss) {
    return {
      said: MOVES_ITSELF.has(shape)
        ? ` misses with ${art}${said}${tick}`
        : ` sends ${art}${said} ${miss}${tick}`,
      clause: said, amount: null,
    };
  }
  if (rest) return { said: ` ${verb} ${art}${said} · ${rest}${tick}`, clause: said, amount: null };
  return { said: ` ${verb} ${art}${said}${tick}`, clause: said, amount: null };
}

/** One seeded line: the shell's own, never re-parsed by `dressFeedLine`. */
function feedLine(side, name, text, when) {
  const el = h('div', { dataset: { side: side || 'none', seed: '1', placed: '1' } },
    when ? h('span.ft', when) : null,
    name ? h('span.nm', name) : null,
    name ? ` ${text}` : text);
  return el;
}

/** The standings, as the world group's floor. One request per tab (§16). */
let arenaRows = [];
let arenaAsked = false;
function seedArena() {
  if (arenaAsked || isReplay()) return;
  arenaAsked = true;
  get('/api/ladder?top=5')
    .then((r) => {
      if (!alive) return;
      arenaRows = (r?.top || [])
        .filter((c) => latinOnly(c?.name || ''))
        .slice(0, 3)
        .map((c, i) => ({
          name: latinOnly(c.name).toUpperCase(),
          text: i === 0 ? 'leads the arena' : `holds ${rankOf(i + 1)}`,
          when: c.rating != null ? num(c.rating) : '',
        }));
      paintArena();
    })
    .catch(() => { /* the panel simply carries what it witnessed */ });
}

/** The fetch can land after the match message; the group is added then. */
function paintArena() {
  const feed = $('#feed');
  if (!feed || !arenaRows.length || !feed.firstElementChild) return;
  if (feed.querySelector('[data-head="world"]')) return;
  feed.appendChild(feedHead('The arena', 'world'));
  for (const w of arenaRows) feed.appendChild(feedLine('none', w.name, w.text, w.when));
}

const agoShort = (at) => {
  const m = Math.floor((Date.now() - at) / 60000);
  return m < 1 ? 'now' : `${m}m`;
};

/**
 * EVERY FIGHT THAT ENDS UNDER THIS TAB IS A WORLD EVENT.
 *
 * The feed only ever held lines this client personally witnessed, so the most
 * common way anyone reaches LIVE — arriving while a fight is already running —
 * showed an empty column, and the wait between fights showed nothing at all.
 * These lines are remembered rather than invented: they are the results of
 * matches this session actually watched.
 */
function noteOver() {
  const o = store.live.over;
  const m = store.live.match;
  /* a recording is not news: its result is already in the world log from the
     day it happened, and re-seeding it spoils the replay's own ending (§72) */
  if (isReplay()) return;
  if (!o || !m?.matchId || worldLog[0]?.id === m.matchId) return;
  const names = m.names || {};
  const up = (s) => latinOnly(String(s || '')).toUpperCase();
  const w = o.winner || null;
  let row = null;
  if (w) {
    const win = up(names[w]); const lose = up(names[other(w)]);
    /*
     * WHAT IS REMEMBERED IS WHOSE CREATURE WON, NOT WHICH SLOT IT STOOD IN.
     *
     * `side: w` stored an arena SLOT, and `ui/hud.css` resolves a slot through
     * the CURRENT `body[data-mine]` — so a line about a fight that is over got
     * re-coloured by the ownership of the fight now on screen. Two failures in
     * one, both measured on `live-fighting-w.png`: `STONE GOLEM defeated
     * GRAVEDIGGER`, with STONE GOLEM being this session's own creature, printed
     * with a #FF7A5C dot and #A83A22 ink — the OPPONENT's pair — and the
     * identical stored row would have come out blue in the next fight and coral
     * in the one after, for reasons that have nothing to do with the row.
     *
     * Ownership is a fact about the moment the result was seen, so it is
     * recorded then; `seedFeed` maps it back to whatever slot carries it in the
     * fight the reader is looking at. A result between two creatures that are
     * neither of them the player's keeps no side at all, which is what the
     * seeded ladder rows already do (§4).
     */
    if (win && lose) row = { role: m.mine ? (w === m.mine ? 'own' : 'foe') : 'none', name: win, text: `defeated ${lose}` };
  } else {
    const a = up(names.blue); const b = up(names.orange);
    if (a && b) row = { role: 'none', name: a, text: `drew with ${b}` };
  }
  if (!row) return;
  worldLog.unshift({ ...row, id: m.matchId, at: Date.now() });
  worldLog.length = Math.min(worldLog.length, 5);
}

/**
 * THE PANEL IS NEVER EMPTY AT THE START OF A FIGHT.
 *
 * Two of these lines are facts the shell already has the moment the match
 * message lands — who joined and who the opponent is — and the rest are the
 * results this session has already watched. The viewer's own narration then
 * accumulates on top of them.
 */
/**
 * The sub-head that splits the fight on screen from the world around it.
 *
 * `head` carries the group's ROLE (`fight` / `world`), not a flag: the fight's
 * head is renamed to `Last fight` the moment the bout it labels ends, so the
 * lookup and the invariant check cannot be written against its text (§19, §24).
 */
const feedHead = (text, kind) => h('div.feed-group',
  { dataset: { seed: '1', head: kind, placed: '1' } }, text);

/**
 * The `THIS FIGHT` head, at the top of the panel, whatever order things arrived
 * in. `seedFeed` puts it there when a match message lands; the viewer can beat
 * that message with its first narration line, so the head is also created on
 * demand — a group label that arrives after its own group is the defect this
 * exists to make impossible. A replay has no second group and needs no head.
 */
function fightHead(feed) {
  if (!feed || isReplay()) return null;
  for (const el of feed.children) {
    if (el.dataset?.head === 'fight') return el;
  }
  const head = feedHead(headWord(), 'fight');
  feed.insertBefore(head, feed.firstChild);
  return head;
}

/**
 * `THIS FIGHT` over four beats of a bout that has already ended, while the
 * phase word says NEXT FIGHT IN 8, is the panel contradicting the screen it
 * stands on. The head is written once and revised whenever the fight it labels
 * stops being the current one (§19, §24).
 */
function headWord() {
  const ph = phaseNow();
  return (ph === 'searching' || ph === 'idle' || (!sim && store.live.over)) ? 'Last fight' : 'This fight';
}

function seedFeed(m) {
  const feed = $('#feed');
  if (!feed || !m) return;
  const up = (s) => latinOnly(String(s || '')).toUpperCase();
  const mine = m.mine || null;
  const foeSide = mine ? other(mine) : 'orange';
  const rows = [];
  /*
   * A REPLAY DOES NOT SPOIL ITSELF.
   *
   * The recorded fight opened at `00:00` with both bars full and the panel
   * already reading `ICEBREAKER defeated STONE GOLEM` — this session's own
   * world log, seeded under a match that has not been played yet. A replay
   * starts empty and the viewer fills it as the fight runs (§25, §72).
   */
  if (isReplay()) { clear(feed); return; }

  /*
   * ONE CLOCK PER GROUP. The seeds used to be stamped `now` while every line
   * the viewer adds above them reads `0:06` — two time formats inside one
   * group, with the older rows carrying the vaguer stamp. Both of these
   * happened at the top of this fight, and the fight's own clock says so.
   */
  if (mine) {
    const me = up(m.names?.[mine]);
    if (me) rows.push(feedLine(mine, me, 'entered the arena', '0:00'));
    /*
     * AND THE OPPONENT ARRIVES THE SAME WAY THE PLAYER DOES.
     *
     * The opponent's row used to be side-LESS — `feedLine('none', 'Match
     * found', `· ${foe}`)` — so the name that mattered rode a clause instead of
     * being the actor, took plain ink and a warm-grey dot, and the two rows
     * that open EVERY fight taught the reader the player's colour and withheld
     * the opponent's. Measured on `live-fighting.png`: row 1 dot #6EA8FF and
     * name #2957B4 against `Match found · MINE HEDGEHOG` at dot #8D7F73 (S .10)
     * and name #303033 (S .03). On the one panel whose whole job is to say who
     * did what, that is the first thing it says and it is wrong.
     *
     * Symmetry costs nothing: the same clause, the foe as its actor, its slot
     * on the row — so `ui/hud.css` paints the dot `--slot-*` and the name
     * `--slot-*-ink`, and the pair reads as two creatures rather than one
     * creature and one announcement. The spectator branch below stays 'none'
     * on purpose: it names both (§3).
     */
    const foe = up(m.names?.[foeSide]);
    if (foe) rows.push(feedLine(foeSide, foe, 'entered the arena', '0:00'));
  } else {
    const a = up(m.names?.blue); const b = up(m.names?.orange);
    if (a && b) rows.push(feedLine('none', 'Now watching', `· ${a} vs ${b}`, '0:00'));
  }
  /*
   * TWO GROUPS, ONE HAIRLINE. Everything the viewer says about the fight on
   * screen is prepended above these rows, so the fight is always the top group;
   * the world's results follow under a sub-head of their own, and the panel
   * labelled LIVE FEED stops answering only questions nobody asked (§56, §63).
   */
  const world = [];
  for (const w of worldLog) {
    if (w.id === m.matchId) continue;
    /* `role` is the ownership recorded when the result was seen (`noteOver`),
       and it is turned back into the slot that carries it in THE FIGHT BEING
       SEEDED — `mine`/`foeSide` above, not the document's attribute, which is
       written on the same microtask and would make the reading depend on the
       order of two calls. A fight between two creatures that were neither of
       them the player's, and any row at all when the player has no creature in
       this one, keeps no side (§4). */
    const role = mine ? w.role : 'none';
    world.push(feedLine(role === 'own' ? mine : (role === 'foe' ? foeSide : 'none'),
      w.name, w.text, agoShort(w.at)));
  }
  /*
   * A STRANGER ARRIVES INTO A WORLD, NOT INTO A ROOM WITH TWO ROBOTS IN IT.
   *
   * `worldLog` only holds fights this tab personally watched, so a visitor's
   * first minute had a single line in it — `Now watching · A vs B` — and the
   * panel headed LIVE FEED said nothing about the arena being populated at all.
   * These are the real top rows of the ladder: facts, fetched once, never
   * invented, and they step aside the instant a genuine result arrives (§16).
   */
  if (!world.length) {
    for (const w of arenaRows) world.push(feedLine('none', w.name, w.text, w.when));
  }
  if (!rows.length && !world.length) return;
  /*
   * THE HEAD IS PUT AT THE TOP, NOT AFTER WHATEVER IS ALREADY THERE.
   *
   * `appendChild` put `THIS FIGHT` below every line the viewer had already
   * narrated, and the one-hop repair only ever fired for lines that arrived
   * AFTER a head existed — so the label ended up in the middle of its own
   * group. The head is inserted first, at the top; the seeds follow it in
   * order; the world's results go under their own head at the end (§56, §63).
   */
  const head = fightHead(feed);
  if (head) head.textContent = 'This fight';
  let at = head ? head.nextSibling : feed.firstChild;
  for (const row of rows) { feed.insertBefore(row, at); at = row.nextSibling; }
  if (world.length) {
    feed.appendChild(feedHead('The arena', 'world'));
    for (const row of world) feed.appendChild(row);
  }
}

/**
 * The panel keeps its place; the wait line stands in when there is nothing yet.
 */
function syncFeedState() {
  const wrap = $('#feedwrap');
  if (!wrap) return;
  /*
   * THE INVARIANT, RESTATED ONCE A TICK.
   *
   * A group head stands ABOVE the group it labels. `dressFeedLine` already
   * places every line under the head, but the head is the one node the viewer
   * can also outrun — so the rule is checked rather than assumed, and nothing
   * can leave a label stranded in the middle of its own group for longer than
   * one 110 ms tick (§56, §63).
   */
  const feed = $('#feed');
  const first = feed?.firstElementChild;
  if (feed && first && !first.dataset.head) {
    for (const el of feed.children) {
      if (el.dataset?.head === 'fight') { feed.insertBefore(el, first); break; }
    }
  }
  /*
   * A COLLAPSED FEED IS NOT A MUTE ONE.
   *
   * The fold is right on a phone — the fight needs the room — but it put the
   * whole play-by-play behind a chevron on the device most spectators watch on.
   * The newest line rides the pill as a one-line ticker instead (§68).
   */
  const list = wrap.classList.contains('sim') ? wrap.querySelector('.feed-sim') : feed;
  /*
   * `THIS FIGHT` STOPS BEING TRUE THE SECOND THE FIGHT ENDS.
   *
   * `live-searching.png` headed four beats of a finished bout `THIS FIGHT`
   * while the phase word above it read NEXT FIGHT IN 8. Nothing renamed it:
   * the string was written once by `fightHead()` and only ever re-ordered
   * (§19, §24).
   */
  const fh = list?.querySelector('[data-head="fight"]');
  if (fh) {
    const want = headWord();
    if (fh.textContent !== want) fh.textContent = want;
  }
  const head = wrap.querySelector('.feed-head');
  if (head) {
    let row = list?.firstElementChild || null;
    while (row && row.dataset.head) row = row.nextElementSibling;
    /*
     * ONE LINE, CUT AT A PHRASE AND NOT MID-WORD.
     *
     * `STONE GOLEM drives a kinetic l…` ends on a fragment of the word that
     * carries the meaning. Every rewritten line keeps its noun clause — the
     * actor and the ability — and the pill prints that instead of truncating a
     * sentence at 64 characters (§34).
     */
    let said = row?.dataset?.clause || '';
    if (!said) {
      for (const n of row?.childNodes || []) {
        if (n.nodeType === 1 && n.classList?.contains('ft')) continue;   /* not the stamp */
        if (n.nodeType === 1 && n.classList?.contains('fd')) continue;   /* nor the damage */
        said += n.textContent;
      }
    }
    const latest = said.replace(/\s+/g, ' ').trim().slice(0, 64);
    /*
     * AND THE TICKER SAYS WHOSE LINE IT IS.
     *
     * The collapsed pill is the ONLY feed a phone has, and it printed the
     * whole clause as one neutral run of type — the addendum's "feed name
     * colours" rule unmet at the size where the arena is smallest. The row it
     * copies already carries `data-side`, and `data-clause` is written as
     * `NAME · what happened`, so the actor is separable without re-parsing
     * anything: the name goes up on its own attribute and `ui/hud.css` inks it
     * and dots it from `--slot-*`, exactly as the expanded rows do (§5).
     */
    const nmEl = row?.querySelector ? row.querySelector('.nm') : null;
    let nm = nmEl ? (nmEl.textContent || '').trim() : '';
    let rest = latest;
    if (nm && latest.startsWith(nm)) {
      rest = latest.slice(nm.length).replace(/^[\s·]+/, '');
    } else {
      /* a seeded row has no `.nm` and no clause; the middot is the only seam */
      nm = '';
      const cut = latest.indexOf(' · ');
      if (cut > 0) { nm = latest.slice(0, cut); rest = latest.slice(cut + 3); }
    }
    const side = row?.dataset?.side || '';
    if (head.dataset.latest !== rest) head.dataset.latest = rest;
    if (nm) { if (head.dataset.latestNm !== nm) head.dataset.latestNm = nm; }
    else if ('latestNm' in head.dataset) delete head.dataset.latestNm;
    if (side && side !== 'none') { if (head.dataset.side !== side) head.dataset.side = side; }
    else if ('side' in head.dataset) delete head.dataset.side;
  }
  if (wrap.classList.contains('sim')) return;
  const empty = !$('#feed')?.firstElementChild;
  wrap.classList.toggle('empty', empty);
  if (empty && waitEl) {
    const want = phaseNow() === 'searching' ? 'Waiting for the next fight…' : 'Watching…';
    if (waitEl.textContent !== want) waitEl.textContent = want;
  }
}

/* ── the boot card ───────────────────────────────────────────────────────── */

function wireBoot() {
  const cv = $('#boot .boot-orbit');
  if (cv && !bootOrb) bootOrb = orbit(cv, { mode: 'boot', color: '#8D7F73' });
}

/* ── overlays ────────────────────────────────────────────────────────────── */

/**
 * The VS card is an introduction, and an introduction needs the stage to
 * itself: the bottom HUD says the same two names, the same two ratings and the
 * same two minds one inch lower, and on a phone the feed lands inside the card
 * (§19, §27). They come back with the fight, which is when they mean something.
 */
/**
 * WHICH HALF OF THE FRAME THE RESULT CARD STANDS IN.
 *
 * The result is the one beat where a card and a creature want the same pixels:
 * the card says VICTORY and the arena is holding the creature that won it, and
 * a card in the middle of the frame is a card on top of the answer. The viewer
 * already re-aims for whatever region this card leaves (`clearAim` in
 * `src/viewer/main.js`), but a centred card leaves two equal halves and the
 * solver picks between them on a tiebreak — so which half the winner appears in
 * changes from fight to fight for no reason a reader can follow.
 *
 * So the shell commits. If the viewer has published the winner's screen side
 * (`window.__airenaBeat`) the card takes the OTHER side and the question is
 * settled by the picture itself. If it has not — and today it has not — there
 * is still one thing that is true at every width and in every slot: the
 * player's own panel is the LEFT one (`ui/hud.css`, the ownership mirror). The
 * card takes the right, the winner keeps the left, and the half the player
 * already reads as theirs is the half the payoff happens in.
 *
 * Only the result: the VS card rides the top band instead (`ui/screens/live.css`),
 * and a phone docks both to the bottom, where there is no side strip to take.
 */
function cardSide(kind) {
  if (kind !== 'result') return null;
  const beat = typeof window !== 'undefined' ? window.__airenaBeat : null;
  const won = beat && (beat.winnerSide || beat.side || null);
  if (won === 'left') return 'right';
  if (won === 'right') return 'left';
  return 'right';
}

function markVs(on, kind = null) {
  /* The away recap is the one card §6.1 designates as an interruption: it is
     shown once, and the world's running commentary beside it would be a second
     thing asking to be read at the moment meant to be felt. */
  $('#hud')?.classList.toggle('under-card', kind === 'away');
  $('#hud')?.classList.toggle('under-vs', on);
  fakeRoot?.classList.toggle('under-vs', on);
  /*
   * WHICH CARD IS UP IS A FACT ABOUT THE DOCUMENT, NOT A CLASS ON A NODE.
   *
   * The hand-off used to be `fakeRoot?.classList` — a reference to a node built
   * elsewhere in the lifecycle, which on the desktop VS capture was simply not
   * there yet: `#hud` faded, `.hud-fake` did not, and both fighters' names,
   * ratings, health and three ability tiles each appeared TWICE, once crisply
   * in the card and once ghosted an inch below. §4.2 already says CSS keys on
   * `body` attributes; this is one of them, so the rule reaches every surface
   * that exists now or later (§18, §20, §50).
   */
  if (kind) document.body.dataset.card = kind; else delete document.body.dataset.card;
  const side = cardSide(kind);
  if (side) document.body.dataset.cardSide = side; else delete document.body.dataset.cardSide;
  /* The phase word and its sub-line are ONE block (§5.2). Fading only the word
     left `ARENA · FIGHT #16013462` dangling under an empty slot for the 2.4 s
     the card owns the screen, which is a label with nothing above it (§14). */
  ROOT?.classList.toggle('under-vs', on);
  aimCamera(kind === 'vs' || kind === 'result' ? 'stand' : 'auto');
}

/**
 * THE CARD BEATS GET AN ESTABLISHING SHOT.
 *
 * The fight camera lives at melee distance because that is what a fight is to
 * watch; the VS and result beats are not a fight. The captures show what that
 * costs: `live-vs.png` puts a golem's head across the top of a card that is
 * introducing the golem, and `live-result-win.png` frames a metre of floor
 * behind VICTORY. Both are moments where the arena should be the arena — the
 * plaza, its walls, its light — because the card is already carrying every
 * fact and the picture only has to be worth looking at.
 *
 * The viewer publishes the request as `window.__airenaCam(mode)` and owns what
 * a mode means, where the camera travels from and how long it takes. This side
 * only says WHEN, and it says it with optional chaining: a viewer that has not
 * shipped the hook (or a `.hud-fake` screenshot state with no viewer at all)
 * is not an error, it is simply a screen with no camera to ask.
 *
 * A REQUEST NOBODY HEARD IS NOT A REQUEST THAT WAS MADE.
 *
 * The hook is installed at the END of the viewer's boot, after two top-level
 * awaits (`/api/config`, `/api/brains`), and the capture marks put that at
 * 3.7 s against a screen that is ready at 0.35 s — a three-and-a-half second
 * window in which `?.()` is a silent no-op. The old guard latched the mode
 * anyway (`if (camWant === mode) return`), so the FIRST card of every fresh
 * load asked an absent viewer and every later attempt was then refused as a
 * repeat: the VS beat survived only because the viewer self-detects it from
 * the HUD band, and the result beat, which has no self-detection, never got
 * its establishing shot at all.
 *
 * So what is latched is what was DELIVERED, not what was wanted. Until the
 * hook exists the wish is kept and re-offered on the animation frame, and it
 * is also published as `window.__airenaCamWant` for the viewer to read once
 * where it installs the hook — a belt for the case where this document is in
 * a background tab and its frames are throttled to nothing.
 */
let camWant = '';   /* what the screen wants */
let camSent = '';   /* what the viewer has actually been told */
let camPoll = 0;    /* the retry's frame handle, while there is no viewer */
let camTries = 0;
function aimCamera(mode) {
  camWant = mode;
  try { globalThis.__airenaCamWant = mode; } catch { /* a frozen global is not our problem */ }
  pushCamera();
}
function pushCamera() {
  const ask = globalThis.__airenaCam;
  if (typeof ask !== 'function') { waitForCamera(); return; }
  if (camSent === camWant) return;
  camSent = camWant;
  try { ask(camWant); } catch { camSent = ''; /* the viewer's own business */ }
}
function waitForCamera() {
  if (camPoll) return;
  camTries = 0;
  const step = () => {
    camPoll = 0;
    if (typeof globalThis.__airenaCam === 'function') { pushCamera(); return; }
    /* ~20 s of frames: past that the page has no viewer at all (a `?ui=` state,
       a machine with no WebGPU and no WebGL2) and there is nothing to ask */
    if (++camTries > 1200) return;
    camPoll = requestAnimationFrame(step);
  };
  camPoll = requestAnimationFrame(step);
}
function restCamera() {
  if (camPoll) cancelAnimationFrame(camPoll);
  camPoll = 0; camTries = 0;
  camWant = ''; camSent = '';
  try { delete globalThis.__airenaCamWant; } catch { /* a frozen global is not our problem */ }
}

/**
 * A FACTORY, NOT A NODE — and the whole result card depends on it.
 *
 * `showOverlay('result', resultCard(), ms)` evaluates `resultCard()` FIRST:
 * the card is built, it records the three nodes it will keep up to date in
 * `resEls`, and only then does `showOverlay` run — whose first line is
 * `clearOverlay()`, which sets `resEls` back to null. Every later tick then
 * returned from `updateResult()` on its first line, so `1,214 → 1,238`,
 * `#782 → #739` and the countdown were frozen for the card's whole six
 * seconds: the two lines §6.2 exists for never arrived, because the session
 * answers a second after the socket does. Taking the factory instead of the
 * node puts the teardown before the build, where it belongs.
 */
/**
 * A CARD ALREADY ON SCREEN LEAVES BEFORE THE NEXT ONE ARRIVES.
 *
 * `showOverlay()` opened with `clearOverlay()` and `syncOverlay()` ended with a
 * bare one: a result card still up when the next fight's `match` landed, and
 * every phase change out of `result` that did not go through `dismiss()`, was
 * yanked off the arena in a single frame. The 320 ms exit existed and was
 * simply not on those two paths. The replacement waits in `pending` and is
 * raised by `dismiss()`'s own callback (§42).
 */
function raiseOverlay(kind, make, ms) {
  if (ovKind && ovKind !== 'none' && ovRoot?.firstElementChild) {
    pending = { kind, make, ms };
    dismiss(ovKind);
    return;
  }
  showOverlay(kind, make, ms);
}

function showOverlay(kind, make, ms) {
  pending = null;
  clearOverlay();
  /* the dead-arena ground owns `#overlay` alone (§6.8, §12) */
  if (!mountOverlay()) return;
  ovKind = kind;
  markVs(kind === 'vs', kind);
  const node = typeof make === 'function' ? make() : make;
  if (!node) { ovKind = null; return; }
  /* a card that arrives on its own has to announce itself (§28, §30) */
  if (!node.getAttribute('role')) {
    node.setAttribute('role', 'status');
    node.setAttribute('aria-live', 'polite');
  }
  ovRoot.appendChild(node);
  ROOT?.classList.add('has-card');
  if (ms) ovTimer = setTimeout(() => { if (ovKind === kind) dismiss(kind); }, ms);
}

function clearOverlay() {
  clearTimeout(ovTimer); ovTimer = 0;
  ovKind = null; resEls = null; dismissing = null; resHold = false;
  dropPortraits();
  markVs(false);
  ROOT?.classList.remove('has-card');
  if (ovRoot) clear(ovRoot);
}

function dismiss(kind) {
  /* `syncOverlay` runs every 110 ms and the condition that asks for a dismiss
     stays true for the whole 300 ms of the animation. Without this the timers
     stack three deep and outlive `clearOverlay()` (§23). */
  if (dismissing === kind) return;
  dismissing = kind;
  const card = ovRoot?.firstElementChild;
  if (card) card.classList.add('out');
  /*
   * 340, NOT 300. `ov-out` runs for 320 ms, so the old timer cut the last
   * 20 ms off every exit. Worse, the branch where the card had already been
   * replaced returned WITHOUT removing anything — leaving a node at opacity 0
   * with `pointer-events: auto` swallowing clicks over the middle of the arena
   * until the next card was raised. Now it always leaves (§46, §51).
   */
  clearTimeout(outTimer);
  outTimer = setTimeout(() => {
    outTimer = 0;
    /*
     * A DEAD SCREEN DOES NOT REWRITE THE SHARED PHASE.
     *
     * This was the one timer `leave()` did not track. Navigating away from LIVE
     * while a card was animating out let the callback run 340 ms later on a
     * torn-down screen: `clearOverlay()` touched `#hud`, deleted
     * `body.dataset.card` and called `ROOT.classList.remove` on a detached
     * node, and then `C.set({ live: { phase } })` rewrote the SHARED live phase
     * — which `app.js` immediately stamps onto `body[data-phase]` while History
     * or Ladder is the screen on show (§18, §20).
     */
    if (!alive) return;
    if (ovKind !== kind) {
      if (dismissing === kind) dismissing = null;
      /* something else already took the stage; the queued card is stale */
      pending = null;
      card?.remove();
      return;
    }
    clearOverlay();
    if (kind === 'vs') C?.set({ live: { phase: 'fighting' } });
    if (kind === 'result') C?.set({ live: { phase: 'searching' } });
    /* whatever was waiting for the stage now has it (§42) */
    const next = pending; pending = null;
    if (next) showOverlay(next.kind, next.make, next.ms);
  }, 340);
}

function syncOverlay() {
  if (sim) { syncSimOverlay(); return; }

  /* the away recap comes before anything else, once per session */
  const sn = store.session?.since;
  if (sn && sn.fights > 0 && !awaySeen && !ss(AWAY_KEY) && !isReplay()) {
    if (ovKind !== 'away') raiseOverlay('away', () => awayCard(sn), 0);
    return;
  }

  const m = store.live.match;
  const over = store.live.over;

  if (isReplay()) {
    if (over && ovKind !== 'replay' && ovKind !== 'lost') raiseOverlay('replay', () => replayCard());
    return;
  }

  /* VS: only my own fight, only when it is starting */
  if (m?.mine && (m.atSecond ?? 0) < 1.5 && vsSeen !== m.matchId && !over) {
    vsSeen = m.matchId;
    C?.set({ live: { phase: 'vs' } });
    raiseOverlay('vs', () => vsCard(m), VS_MS);
    return;
  }
  /* the introduction belongs to its own phase and to no other: a VS card still
     standing over a fight is two beats collapsed into one (§4, §20) */
  if (ovKind === 'vs' && store.live.phase !== 'vs') { dismiss('vs'); return; }

  if (store.live.phase === 'result' && over) {
    if (ovKind !== 'result') raiseOverlay('result', () => resultCard(), RESULT_MS);
    else updateResult();
    const left = nextIn();
    if (!resHold && left != null && left <= 0) dismiss('result');
    return;
  }
  /* the card leaves; it is not deleted out from under the player (§42) */
  if (ovKind === 'result' && store.live.phase !== 'result') dismiss('result');
}

/* ── VS card ─────────────────────────────────────────────────────────────── */

/**
 * A FACE ON EACH SIDE OF THE WORD — AND IT IS THE CREATURE'S, NOT A MOVE'S.
 *
 * This is the product's only pre-fight drama beat, and it was a strip of text.
 * The uikit's MATCHUP card puts the two fighters either side of VS, so the card
 * needs a picture of each fighter. It used the generated icon of the creature's
 * FIRST ABILITY — and that same glyph reappears one inch lower in the HUD
 * labelled LUNGE, so the card introduced a creature with a picture of a move
 * and taught the player that one drawing means two different things.
 *
 * The mark is the creature's, built from its id: a body, a head, a tail, legs
 * and a spine, each dimension picked from a different byte of the hash. It is
 * the same mark the ladder rows draw, so one creature wears one face wherever
 * it appears, and the ability icon stays where it belongs — on the tiles.
 */
const MARKS = new Map();

function markShape(id) {
  const key = String(id || '');
  const hit = MARKS.get(key);
  if (hit) return hit;

  let hsh = 2166136261;
  for (let i = 0; i < key.length; i++) {
    hsh ^= key.charCodeAt(i);
    hsh = Math.imul(hsh, 16777619);
  }
  const pick = (shift, span, min = 0) => min + ((hsh >>> shift) % span);
  const f = (n) => n.toFixed(1);

  /*
   * FOUR BUILDS, NOT ONE ANIMAL.
   *
   * Every id used to come out of here as the same wide-bodied quadruped, so the
   * VS capture introduced two different fighters with two copies of one shape.
   * The build is drawn from the hash first and every other dimension is read
   * INSIDE that build, so a strider and a crawler are different silhouettes
   * rather than one silhouette at two sizes.
   */
  const build = pick(1, 4);            /* 0 crawler · 1 strider · 2 hulk · 3 serpent */
  const legs = [4 + pick(3, 3), 2, 4, 0][build];
  const ry = [6 + pick(6, 3), 7 + pick(6, 3), 11 + pick(6, 4), 4 + pick(6, 3)][build];
  const rx = [15 + pick(9, 5), 9 + pick(9, 4), 13 + pick(9, 4), 19 + pick(9, 5)][build];
  const headR = [5 + pick(13, 3), 5 + pick(13, 3), 8 + pick(13, 3), 4 + pick(13, 3)][build];
  const neck = [2 + pick(17, 4), 9 + pick(17, 7), 3 + pick(17, 4), 1 + pick(17, 3)][build];
  const tail = Math.min([10, 4, 5, 16][build] + pick(21, 9), 28 - rx);
  const fins = [pick(25, 4), pick(25, 2), pick(25, 3) + 1, pick(25, 5) + 2][build];
  const lean = (pick(29, 9) - 4) / 2;

  const hx = Math.min(30 + rx + headR - 4, 55 - headR);
  const hy = 34 - neck;

  const feet = [];
  for (let i = 0; i < legs; i++) {
    const t = legs === 1 ? 0.5 : i / (legs - 1);
    const x = 30 - rx * 0.55 + t * rx * 1.12;
    const knee = x + (i % 2 ? 1.6 : -1.6);
    const foot = x + (i % 2 ? 2.6 : -2.6);
    feet.push(`M${f(x)} ${f(34 + ry * 0.5)} L${f(knee)} 45 L${f(foot)} 52.5`);
  }

  const spine = [];
  for (let i = 0; i < fins; i++) {
    const x = 30 - rx * 0.45 + (i * rx * 0.42);
    const top = 34 - ry + 1.5;
    spine.push(`M${f(x - 3.4)} ${f(top + 1)} L${f(x)} ${f(top - 5)} L${f(x + 3.4)} ${f(top + 1)} Z`);
  }

  /*
   * ONE FILLED MASS, NOT A LINE DRAWING.
   *
   * The monoline version put a rendered 3D body on one half of the VS card and
   * "a circle with a beak and stick legs" on the other — two fighters
   * introduced as two different kinds of object, which is the one thing a
   * matchup card may not do. A silhouette does not compete with a render: every
   * part is painted in the SAME ink with no outline of its own, the limbs are
   * capsules rather than strokes, and the whole group sits at 12 % so it reads
   * as the watermark it is. The shapes overlap freely — group opacity
   * rasterises before it composites, so a union of same-coloured parts is one
   * even mass (§3, §71).
   */
  const markup = `<svg viewBox="0 0 64 64" width="100%" height="100%"
      preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">
    <g transform="rotate(${f(lean)} 32 36)" fill="currentColor" stroke="currentColor"
       stroke-linecap="round" stroke-linejoin="round">
      <path d="${feet.join(' ')}" fill="none" stroke-width="5"/>
      <path d="M${f(30 - rx)} 33 Q${f(30 - rx - tail)} ${f(30 - tail * 0.5)} ${f(30 - rx - tail * 0.7)} 41"
        fill="none" stroke-width="5.4"/>
      ${spine.length ? `<path d="${spine.join(' ')}" stroke="none"/>` : ''}
      <path d="M${f(30 + rx * 0.5)} ${f(34 - ry * 0.45)} L${f(hx)} ${f(hy)}"
        fill="none" stroke-width="${f(Math.max(5, headR * 1.1))}"/>
      <ellipse cx="30" cy="34" rx="${f(rx)}" ry="${f(ry)}" stroke="none"/>
      <circle cx="${f(hx)}" cy="${f(hy)}" r="${f(headR)}" stroke="none"/>
      <path d="M${f(hx + headR - 2)} ${f(hy - 3.2)} L${f(hx + headR + 6)} ${f(hy + 0.6)} L${f(hx + headR - 2)} ${f(hy + 4.2)} Z"
        stroke="none"/>
    </g>
  </svg>`;

  MARKS.set(key, markup);
  /*
   * A BOUNDED CACHE. One entry per creature id ever shown on a VS card, kept
   * for the life of the tab: small each, unbounded over a long session — the
   * same shape `src/server/forge/icons.js` prunes for. Sixty-four is more
   * fighters than one sitting can watch (§25).
   */
  if (MARKS.size > 64) MARKS.delete(MARKS.keys().next().value);
  return markup;
}

/**
 * THE FACE ON THE VS CARD IS THE CREATURE, NOT A DRAWING OF ONE.
 *
 * This is the product's only pre-fight beat and the only moment the player is
 * introduced to the two bodies about to fight — and it showed a procedural
 * silhouette, which the id varies but which is still a line drawing of a
 * generic animal. The arena is already rendering both bodies one inch behind
 * the card; `ui/portrait.js` poses the same source in a warm rig, and that is
 * what belongs in the circle.
 *
 * The silhouette is drawn FIRST and stays until the portrait is ready, so the
 * card is never a hole waiting for three.js and a body fetch; a body that
 * cannot be built simply leaves the mark standing. The module is imported
 * lazily so a player who never sees a VS card never pays for a second renderer
 * (§2, §3).
 */
function vsPortrait(cid, real = true, seedKey = null) {
  const seed = seedKey || (typeof cid === 'string' ? cid : 'unknown');
  /*
   * THE FALLBACK IS A WATERMARK, NOT A DRAWING — AND IT IS NEVER HALF THE CARD.
   *
   * `live-vs.png` paired a rendered 3D body on one side with a grey line
   * drawing on the other: two fighters introduced as two different kinds of
   * object, which is the one thing a matchup card may not do. The mark holds
   * the space so the end of the card is never a hole waiting for a body fetch —
   * but the faces are now raised TOGETHER or not at all (`settleFaces()`), so
   * the two halves of the card are always the same kind of picture (§3, §71).
   */
  /*
   * THE RENDERER IS SIZED BY THE PICTURE, NOT BY THE HOLE IT LOOKS THROUGH.
   *
   * `ui/portrait.js` measures the box it is given and renders exactly that many
   * pixels; the stylesheet then used to blow the canvas up — `scale(1.25)` here
   * and `scale(1.75)` on the result card — to get past the fit algorithm's
   * generous margin. A 72 px render enlarged to 126 is a thumbnail scaled up,
   * and on `live-result-win.png` that is the first thing the eye lands on at
   * the moment of victory. So the enlargement moves OFF the canvas and onto
   * the box: `.portrait-fit` is the same crop, laid out at the size it is seen
   * at, and the renderer draws every one of those pixels (§9.1).
   */
  const fit = h('div.portrait-fit');
  const orb = h('div.vs-bleed', { 'aria-hidden': 'true' }, svg(markShape(seed)), fit);
  const slot = { node: orb, destroy: null, ok: false, promise: null };
  vsPortraits.push(slot);
  if (!real || !cid) return orb;
  slot.promise = Promise.resolve(cid)
    .then((id) => (id
      ? import('../ui/portrait.js').then(({ portrait }) => portrait(fit, { creatureId: id, size: 0.62 }, { turn: true }))
      : null))
    .then((p) => {
      if (!p) return;
      if (!p?.ok) { if (p?.destroy) p.destroy(); return; }
      if (!alive || !orb.isConnected || !vsPortraits.includes(slot)) { p.destroy(); return; }
      slot.destroy = p.destroy;
      slot.ok = true;
    })
    .catch(() => { /* the watermark is a complete answer on its own */ });
  return orb;
}

/**
 * BOTH FACES, OR NEITHER.
 *
 * One rendered body beside one watermark reads as a broken image, not as a
 * different creature — and it is the first thing a stranger sees of the fight.
 * The card waits for both bodies and shows them together; if either cannot be
 * built, both sides keep the mark and the card is symmetric either way (§3).
 */
function settleFaces() {
  const slots = vsPortraits.slice();
  if (!slots.length) return;
  Promise.all(slots.map((s) => s.promise || Promise.resolve()))
    .then(() => {
      if (!alive || slots.some((s) => !vsPortraits.includes(s) || !s.node.isConnected)) return;
      if (slots.every((s) => s.ok)) {
        for (const s of slots) s.node.classList.add('has-face');
        return;
      }
      for (const s of slots) {
        try { s.destroy?.(); } catch { /* already gone */ }
        s.destroy = null; s.ok = false;
        s.node.classList.remove('has-face');
      }
    })
    .catch(() => { /* the marks stand */ });
}

/**
 * ONE FACE, IN A CIRCLE — THE RESULT CARD'S OWN SUBJECT.
 *
 * `.res-card` was placed "beside the winner" by a fixed left margin while
 * nothing consulted where the winner was: on `live-result-win.png` the arena
 * behind it was empty and on `live-result-loss.png` the card's right half
 * landed on the winner. Centred and carrying the winner's own portrait, the
 * moment has a subject wherever the camera came to rest (§22, §64).
 */
function mountFace(node, cid) {
  /* the crop is a box the renderer fills, not a canvas the compositor
     enlarges — see `vsPortrait` above (§9.1) */
  const fit = h('div.portrait-fit');
  node.appendChild(fit);
  const slot = { node, destroy: null, ok: false, promise: null };
  vsPortraits.push(slot);
  slot.promise = Promise.resolve(cid)
    .then((id) => (id
      ? import('../ui/portrait.js').then(({ portrait }) => portrait(fit, { creatureId: id, size: 0.62 }, { turn: true }))
      : null))
    .then((p) => {
      if (!p) return;
      if (!p?.ok) { if (p?.destroy) p.destroy(); return; }
      if (!alive || !node.isConnected || !vsPortraits.includes(slot)) { p.destroy(); return; }
      slot.destroy = p.destroy; slot.ok = true;
      node.classList.add('has-face');
    })
    .catch(() => { /* the mark is the complete answer */ });
  return node;
}

/**
 * A REAL SECOND BODY FOR THE SCREENSHOT STATE.
 *
 * `?ui=vs` invents its opponent's name, rating and mind — §10 asks for
 * plausible fakes — but a card whose whole subject is two fighters cannot
 * introduce one of them with a line drawing while the other is a rendered body.
 * The arena's own live match supplies the id when there is one; otherwise the
 * ladder's top row does, which is a creature that genuinely exists on this
 * stand. One request, once, and never on the real path.
 */
let foePick = null;
function someFoeId(mineId) {
  if (foePick) return foePick;
  foePick = get('/api/ladder?top=6')
    .then((r) => (r?.top || []).find((c) => c?.id && c.id !== mineId)?.id || null)
    .catch(() => null);
  return foePick;
}

function dropPortraits() {
  for (const p of vsPortraits) { try { p.destroy?.(); } catch { /* already gone */ } }
  vsPortraits = [];
  vsRates = [];
  vsStamp = -1;
}

/**
 * THE PLAYER ON THE LEFT, IN BLUE. ALWAYS.
 *
 * This card used to be ordered by arena SLOT — blue column left, orange right,
 * the dots and the edge rules keyed off the slot — on the reading that side
 * colour belongs to the floor and never moves (REDESIGN §2.1). The founder's
 * addendum reverses it (`reports/arena/ARENA-AAA.md` §1): blue is the player's
 * creature and orange the opponent's on every surface, so a fight where the
 * server handed the player the orange slot no longer spends its one pre-fight
 * beat introducing them in the colour the OTHER fighter is painted in, two
 * seconds before the floor, the rings and the HUD all say the opposite.
 *
 * `s-blue` / `s-orange` therefore name the COLUMN — left and right, own and
 * foe — while the slot they read their name, rating and portrait from is
 * whatever the match says. A spectator has no `mine`, so the columns fall back
 * to the slots and the card is blue-left/orange-right as before.
 */
function vsCard(m) {
  const mine = m.mine || null;
  const left = mine || 'blue';
  const card = h('div.ov-card.vs-card.strong',
    h('div.vs-row',
      vsSide(m, left, !!mine, 'blue'),
      h('div.vs-mid', h('div.vs-word', 'VS')),
      vsSide(m, other(left), false, 'orange')));
  settleFaces();
  return card;
}

/**
 * FOUR ROWS, ALWAYS, ON BOTH SIDES.
 *
 * The YOU pill used to be a fourth child on one side and nothing on the other,
 * and the two columns were centred independently — so the two names sat 15 px
 * apart and the VS glyph landed on a third baseline. Introducing two fighters
 * on three different lines is the one thing this card must not do. So both
 * sides render the same rows and the pill occupies a reserved one, empty or not.
 *
 * `side` is the arena slot the facts come from; `col` is the column it stands
 * in — `blue` on the left, `orange` on the right — which the caller assigns
 * from ownership and not from the slot (§1 of the addendum).
 */
function vsSide(m, side, mine, col) {
  const model = m?.meta?.[side]?.model || null;
  const rate = h('div.vs-rate');
  const note = h('div.vs-note');
  /* the two lines the fetch fills in when it lands (§19, §22) */
  vsRates.push({ side, id: m?.ids?.[side] || null, mine, rate, note });
  fillRate(vsRates[vsRates.length - 1]);
  return h(`div.vs-side.s-${col}.${mine ? 'own' : 'foe'}`,
    vsPortrait(m?.ids?.[side] || null),
    h('div.vs-col',
      /* the biggest text on the pre-fight card, and it was the one name in the
         product that never passed the §1.1 guard (§30) */
      h('div.vs-name', latinOnly(m?.names?.[side] || '') || '—'),
      rate,
      note,
      h('div.vs-mind', model ? mindBadge(model, { mode: false }) : null),
      mine ? h('span.vs-you', 'You') : h('span.vs-you.ghost', { 'aria-hidden': 'true' }, 'You')));
}

/**
 * THE OPPONENT'S RATING ARRIVES LATE, AND THE CARD REWRITES ITSELF FOR IT.
 *
 * `cardOf()` returns null on its first call and only then fires the request,
 * and the card is built at `atSecond < 1.5` — so on the real path the product's
 * only pre-fight beat showed `#3 · 1,590 MMR` on one side and an empty line on
 * the other, for the whole 2.4 s, every fight. The fetch is now started from
 * the `airena:match` handler and these two nodes are rewritten whenever a card
 * lands, exactly the way `updateResult()` rewrites the result card (§19, §22).
 */
function fillRate(slot) {
  if (!slot) return;
  let c = null;
  if (slot.mine && !isReplay() && store.session?.creature) c = store.session.creature;
  else if (slot.id) c = cardOf(slot.id);
  if (!c) return;
  const line = [c.rank != null ? rankOf(c.rank) : null, c.rating != null ? `${num(c.rating)} rating` : null]
    .filter(Boolean).join(' · ');
  if (slot.rate.textContent !== line) slot.rate.textContent = line;
  /* the record is the other half of "who is this": a rating with no fights
     behind it says nothing about whether the number can be trusted */
  const w = c.wins ?? null; const l = c.losses ?? null; const f = c.fights ?? null;
  let said = '';
  if (w != null && l != null) {
    said = `${num(w)} – ${num(l)}`;
    if (f > 0) said += ` · ${Math.round((w / f) * 100)}% win rate`;
  }
  if (slot.note.textContent !== said) slot.note.textContent = said;
}

function syncVsCard() {
  if (ovKind !== 'vs' || vsStamp === cardStamp) return;
  vsStamp = cardStamp;
  for (const slot of vsRates) fillRate(slot);
}

/* ── result card (§6.2) ──────────────────────────────────────────────────── */

const WORD = { win: 'Victory', loss: 'Defeat', draw: 'Draw' };
const AGAINST = { win: 'over', loss: 'to', draw: 'with' };
/*
 * WHY THE FIGHT ENDED — THE ONE FACT THE CARD NEVER CARRIED.
 *
 * `over.reason` is sent by the server and mapped by the viewer, and the only
 * place it was ever shown is `#banner`, which this redesign hides outright. So
 * `knocked out` existed nowhere on LIVE and a player had to open History to
 * learn how their own fight finished. §9.1 pins these four strings character
 * for character with `screens/history.js`; the two copies are deliberate.
 */
const REASON = {
  kill: 'knocked out',
  timeout: 'time ran out, more health left',
  'timeout-draw': 'time ran out, health even',
  'double-ko': 'both went down at once',
};

function resultData() {
  const o = store.live.over || {};
  const m = store.live.match;
  const s = store.session;
  const mine = m?.mine || null;
  const outcome = o.winner == null ? 'draw' : (o.winner === mine ? 'win' : 'loss');
  const myId = (mine && m?.ids?.[mine]) || s?.creature?.id || null;
  const raw = o.deltas && myId != null ? o.deltas[myId] : null;
  const delta = raw == null ? null : Math.round(raw);
  const after = s?.creature?.rating ?? null;
  /*
   * THE PROGRESSION IS DERIVED, NOT DROPPED.
   *
   * `1,214 → 1,238` is the whole point of this card, and on the real live path
   * it never appeared: `snapshotBefore()` returns early while `store.session`
   * is still null, which is exactly a cold open — the socket's `match` beats
   * the first `/api/session` — so `store.before` was empty for the fight the
   * player actually landed on. Half of a pair of known numbers is enough: the
   * delta and the rating after it give the rating before it. The rank stays
   * omitted when it is genuinely unknown, as §6.2 allows (§10, §13).
   */
  const snapped = store.before?.rating ?? null;
  const before = snapped ?? (after != null && delta != null ? after - delta : null);
  const foeSide = other(mine);
  return {
    outcome, delta, before,
    after: after ?? (before != null && delta != null ? before + delta : null),
    rankBefore: store.before?.rank ?? null,
    rankAfter: s?.creature?.rank ?? null,
    training: !!o.training,
    faulted: Array.isArray(o.faulted) && o.faulted.length > 0,
    foe: (foeSide && latinOnly(m?.names?.[foeSide] || '')) || null,
    reason: REASON[o.reason] || null,
    matchId: m?.matchId ?? null,
    /* the number a player can read; `matchId` is a database row key and stays
       where it belongs — in the `#/watch/` address (§8, §41, §58, §66) */
    seed: m?.seed ?? null,
    first: (s?.creature?.fights ?? 0) === 1,
  };
}

function nextText() {
  const left = nextIn();
  return left != null && left > 0 ? `Next fight in ${countdown(left)}` : 'Searching for opponent';
}

/**
 * A sparring win used to read `VICTORY / 0 RATING / 1,612 → 1,612 / #3 → #3`:
 * a hero number that is a zero and two arrows that point at themselves. An
 * unrated fight has no progression to show, so it does not pretend to (§16, §29).
 */
const isRated = (d) => !d.training && !d.faulted && d.delta != null;
const hasMove = (d) => isRated(d) && d.before != null && d.after != null && d.before !== d.after;
const hasRank = (d) => isRated(d) && d.rankBefore != null && d.rankAfter != null && d.rankBefore !== d.rankAfter;
const moveText = (d) => (hasMove(d) ? `${num(d.before)} → ${num(d.after)}` : '');
const rankText = (d) => (hasRank(d) ? `${rankOf(d.rankBefore)} → ${rankOf(d.rankAfter)}` : '');
/* Reaching the top of the ladder is not the same event as any other row change. */
const isBest = (d) => isRated(d) && d.rankAfter != null && d.rankAfter <= 3
  && d.rankBefore != null && d.rankAfter < d.rankBefore;

/**
 * The hero number ARRIVES; it does not simply exist.
 *
 * §6.2's four lines were all correct and all present at once, which is a
 * receipt rather than a result. Counting the delta up and letting the two
 * progression lines follow it is the whole difference between "here is what
 * happened" and "watch what it did to you" — and it is the product's designed
 * climax, so it is worth 700 ms. Under `prefers-reduced-motion` the number is
 * simply written.
 */
function countTo(el, to, unit, ms = 700) {
  if (!Number.isFinite(to)) return;
  const say = (v) => { el.textContent = `${signed(v)} ${unit}`; };
  if (CALM() || to === 0) { say(to); return; }
  const t0 = performance.now();
  say(0);
  const step = (now) => {
    if (!el.isConnected) return;
    const p = Math.min(1, (now - t0) / ms);
    say(Math.round(to * (1 - (1 - p) ** 3)));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  /*
   * THE NUMBER IS NEVER LEFT AT ZERO.
   *
   * A count-up is a nicety; the value is the card's whole point. A frame loop
   * that is throttled, backgrounded or simply never scheduled would leave
   * `+24 MMR` reading `0 MMR` — the flagship capture caught exactly that. The
   * timer is the floor under the animation, not a second animation.
   */
  setTimeout(() => { if (el.isConnected) say(to); }, ms + 90);
}

/**
 * One reveal, at its beat, and never twice (the session answers late).
 *
 * THE VISIBLE STATE IS THE DEFAULT. The line starts veiled and the veil is
 * taken away on a timer; a delayed `animation: … both` does the opposite, and
 * any frame in which that animation does not run is a frame with `1,214 →
 * 1,238` missing from the card it is the subject of (§6.2).
 */
function revealOnce(el, delay) {
  if (!el || el.dataset.shown) return;
  el.dataset.shown = '1';
  if (CALM()) return;
  el.classList.add('veiled');
  setTimeout(() => el.classList.remove('veiled'), Math.max(16, delay));
  /*
   * THE RESTING STATE NEVER DEPENDS ON A TRANSITION HAVING RUN.
   *
   * `.veiled` is opacity 0 with a 420 ms transition out, and the loss capture
   * caught it mid-flight: `1,587 → 1,569` measured 1.33:1 and `#3 → #32`
   * 1.22:1 on a card whose whole subject those two lines are, while the win
   * card showed the same lines at 5.24:1. A throttled tab, a backgrounded
   * paint or a capture taken on a wall clock is enough to leave a number
   * invisible. So the end state is also WRITTEN, unconditionally, once the
   * animation has had its time (§6.2).
   */
  setTimeout(() => {
    if (!el.isConnected) return;
    el.classList.remove('veiled');
    el.style.opacity = '';
    el.style.transform = '';
  }, Math.max(16, delay) + 600);
}

function resultCard(fixed = null) {
  const d = fixed || resultData();
  const kind = d.outcome;
  const rated = isRated(d);

  /* the run of defeats decides what the loss card's counterweight can say, so
     it is counted before the card is built rather than after it */
  if (!fixed) {
    if (kind === 'loss') lossRun += 1; else lossRun = 0;
    lastResult = {
      outcome: kind,
      delta: rated ? d.delta : null,
      before: rated ? d.before : null,
      after: rated ? d.after : null,
      matchId: d.matchId || null,
    };
  }

  /*
   * THE WORD IS SAID ONCE.
   *
   * The big slot used to print `SPARRING` and the flag ten pixels under it
   * printed `SPARRING · NOT RATED` — one fact, twice, in one card, in two
   * sizes. §6.2 gives the flag that job, so the slot steps aside whenever a
   * flag will be there, and keeps `NOT RATED` only for the case no flag
   * covers: a match that came back without a delta at all.
   */
  const flagged = d.training || d.faulted;
  const delta = rated
    ? h(`div.res-delta.${kind}`, `${signed(d.delta)} RATING`)
    : (flagged ? null : h('div.res-delta.flat', 'Not rated'));
  /* `null`, not `''`: `h()` turns an empty string into an empty TEXT NODE, and
     an element with one of those is not `:empty` — so `.res-move:empty` never
     matched and an unrated card carried fifty pixels of invisible band where
     its progression would have been */
  const move = h('div.res-move', moveText(d) || null);
  const rank = h('div.res-rank', rankText(d) || null);
  const mile = milestone(d);
  const best = h(`div.res-best.${mile.tone || 'up'}`, mile.text || null);
  /*
   * ONE DELTA ROW, NOT THREE STACKED LINES.
   *
   * `1,585 → 1,609`, `#4 → #1` and `NEW BEST · TOP 3` are three statements
   * about one event, and printed as three centred lines they read as a form.
   * Side by side with a hairline dot between them they read as a single
   * sentence, and the milestone becomes what it always was: a chip (§6.2).
   */
  /* §6.2 gives the rating move and the rank move a line each: side by side
     they read as one long string of digits and arrows (§2) */
  const moves = h('div.res-moves', move, h('div.res-rankrow', rank, best));
  const next = h('div.res-next-t', fixed ? 'Next fight in 8' : nextText());
  const reason = h('div.res-reason', d.reason || null);
  resEls = fixed ? null : { move, rank, next, best, moves, reason, card: null };
  /* the top-centre loses its word here, and the subtitle left standing under an
     empty band is an orphan: the fight number moves into the card's own footer,
     beside the one other thing that footer says (§12, §21, §9.1) */
  /*
   * ONE FOOTER, TWO EDGES.
   *
   * `NEXT FIGHT IN 8 / FIGHT #16013462` was a space-between row and the two
   * doors were a centred row under it — two alignment systems in one card. One
   * grid: the countdown over YOUR CREATURE on a shared left edge, the fight's
   * number over LADDER on a shared right edge (§2).
   */
  const foot = h('div.res-foot',
    next,
    h('span.res-id', d.seed != null ? `Fight #${d.seed}` : null),
    h('a.res-door', { href: '#/creature' }, 'Your creature', icon('arrow-right')),
    h('a.res-door', { href: '#/ladder' }, 'Ladder', icon('arrow-right')));

  /*
   * A DEFEAT NEEDS A DOOR THAT IS NOT THE SAME FIGHT AGAIN.
   *
   * The loop is Create → … → Learn → Improve → Climb, and a loss is the moment
   * the player most wants to act. The card offered `WATCH IT AGAIN` and a
   * countdown. So the loss carries a second, ghost action into the step the
   * player is already reaching for: the fight detail, which already holds the
   * beats and the reason — and after two defeats running, the other step.
   */
  const again = d.matchId
    ? h('a.res-again', { href: `#/watch/${d.matchId}` }, 'Watch it again', icon('arrow-right'))
    : null;
  const run = d.run ?? lossRun;
  const learn = kind !== 'loss' ? null : (run >= 2
    ? h('a.res-more', { href: '#/create' }, 'Try a new generation', icon('arrow-right'))
    : (d.matchId ? h('a.res-more', { href: `#/history/${d.matchId}` }, 'What went wrong', icon('arrow-right')) : null));

  /*
   * THE WINNER, AT THE TOP OF THE CARD THAT REPORTS IT.
   *
   * A draw has no winner and my own creature is the subject then; a defeat's
   * subject is the fighter that took it. The id-seeded mass stands until the
   * body renders, so the circle is never a hole (§22).
   */
  const mm = store.live.match;
  const oo = store.live.over || {};
  const mineId = store.session?.creature?.id || null;
  const winSide = fixed ? null : (oo.winner || mm?.mine || null);
  /*
   * AND A FIXTURE'S WINNER IS A BODY, NOT A DRAWING.
   *
   * `?ui=result-win` puts the player's own creature in the circle and rendered
   * it; `?ui=result-loss` has to go and find a second creature and reached for
   * the ladder's top row, which on this stand has no built body — so the two
   * halves of the same beat were photographed as two different kinds of
   * object, a rendered fighter beside a flat id-seeded mark. `simVsCard()`
   * already solved this: the arena is running a real fight BEHIND the card, so
   * one of its two ids is a creature the viewer is demonstrably drawing this
   * second. Take that one first and keep the ladder as the fallback (§3, §71).
   */
  const liveFoeId = fixed
    ? (Object.values(mm?.ids || {}).find((v) => v && v !== mineId) || null)
    : null;
  const faceId = fixed
    ? (kind === 'loss' ? (liveFoeId || someFoeId(mineId)) : mineId)
    : ((winSide && mm?.ids?.[winSide]) || mineId);
  const faceSeed = String(
    (fixed ? (kind === 'loss' ? d.foe : store.session?.creature?.name) : (winSide && mm?.names?.[winSide]))
    || mineId || 'winner');
  const face = mountFace(h('div.res-face', { 'aria-hidden': 'true' }, svg(markShape(faceSeed))), faceId);

  const card = h(`div.ov-card.res-card.${kind}`,
    face,
    /* the first result a player ever sees says so, and says the one thing a
       stranger cannot know: that nothing is asked of them (§74) */
    d.first ? h('div.res-first', 'Your first fight') : null,
    h(`div.res-word.t-state.${kind}`, WORD[kind]),
    d.foe ? h('div.res-foe', `${AGAINST[kind]} ${d.foe}`) : null,
    /* how it ended, in §9.1's own four words, under the name it happened to */
    reason,
    delta,
    moves,
    d.training ? h('div.res-flag', 'Sparring · not rated') : null,
    d.faulted ? h('div.res-flag', 'A mind went silent · not rated') : null,
    /* the one moment the player is paying most attention is the one moment
       there was nothing to click (§21) */
    again || learn ? h('div.res-acts', again, learn) : null,
    foot,
    d.first ? h('div.res-calm', 'Fights keep running on their own. Nothing to press.') : null);

  if (resEls) resEls.card = card;
  if (rated) countTo(delta, d.delta, 'RATING');
  /* one beat for the whole row: the rank move used to arrive 200 ms after the
     rating move and 29 places is the most consequential number on a defeat —
     it was the last and faintest thing on the card (§6.2) */
  if (moveText(d) || rankText(d)) revealOnce(moves, 220);
  if (mile.text) { card.classList.add('milestone'); revealOnce(best, 420); }

  if (!fixed) {
    card.addEventListener('pointerenter', () => {
      resHold = true;
      clearTimeout(ovTimer); ovTimer = 0;
    });
    card.addEventListener('pointerleave', () => {
      resHold = false;
      if (ovKind === 'result' && !ovTimer) {
        ovTimer = setTimeout(() => { if (ovKind === 'result') dismiss('result'); }, 1600);
      }
    });
  }
  return card;
}

/**
 * THE CARD SAYS SOMETHING TRUE, NOT ONLY SOMETHING SMALLER.
 *
 * A win that reaches the top three gets `NEW BEST · TOP 3`. A defeat used to
 * get nothing at all — the whole beat was a number shrinking — so the loss
 * side reads the same two session fields for the counterweight it is owed:
 * where the creature still stands, or how long the run has been. Both are
 * facts; neither is consolation.
 */
function milestone(d) {
  if (!isRated(d)) return { text: '', tone: '' };
  if (d.outcome !== 'loss') return isBest(d) ? { text: 'New best · top 3', tone: 'up' } : { text: '', tone: '' };
  const pool = store.session?.world?.creatures ?? null;
  if (d.rankAfter != null && pool > 0 && d.rankAfter <= Math.max(1, Math.round(pool * 0.1))) {
    return { text: 'Still top 10%', tone: 'up' };
  }
  const run = d.run ?? lossRun;
  return run >= 2 ? { text: `Lost ${num(run)} in a row`, tone: 'down' } : { text: '', tone: '' };
}

/** The session answers a second later than the socket; the card catches up. */
function updateResult() {
  if (!resEls) return;
  const d = resultData();
  const move = moveText(d);
  const rank = rankText(d);
  if (resEls.move.textContent !== move) {
    resEls.move.textContent = move;
    /* the beat, whenever the row actually arrives — the session answers a
       second after the socket and the reveal has to wait for it */
    if (move) revealOnce(resEls.moves, 0);
  }
  if (resEls.rank.textContent !== rank) {
    resEls.rank.textContent = rank;
    if (rank) revealOnce(resEls.moves, 0);
  }
  const mile = milestone(d);
  if (resEls.best.textContent !== (mile.text || '')) {
    resEls.best.textContent = mile.text || '';
    resEls.best.className = `res-best ${mile.tone || 'up'}`;
    if (mile.text) { resEls.card?.classList.add('milestone'); revealOnce(resEls.best, 0); }
  }
  if (resEls.reason && resEls.reason.textContent !== (d.reason || '')) {
    resEls.reason.textContent = d.reason || '';
  }
  const next = nextText();
  if (resEls.next.textContent !== next) resEls.next.textContent = next;
}

/* ── away recap (§6.1) ───────────────────────────────────────────────────── */

/**
 * ONE NUMBER, NOT A TABLE.
 *
 * The recap was three label/value rows under a heading, with the phase word
 * SEARCHING FOR OPPONENT rendered twice its size behind it: two dominant things
 * at the one moment the returning player is meant to feel a climb. A player
 * coming back after eighteen fights wants one fact first — how far the creature
 * moved — and the rest as a footnote.
 *
 * Which fact that is depends on what the server can actually answer. Places
 * climbed is the best of them; MMR gained is the honest second when the rank
 * at the last visit is not known (it is not sent yet — see the notes); wins are
 * the floor, and there is always at least that.
 *
 * The unit is MMR and never "rating". A rating is the number a creature HAS
 * (`1,214 RATING` on the specimen, `RATING` in the ladder column); MMR is what
 * a fight MOVES it by, and that is the one word the result card (`+24 MMR`)
 * and the career line (`+241 MMR`) already use for this very quantity.
 */
function awayHero(d) {
  if (d.rankBefore != null && d.rankAfter != null && d.rankBefore !== d.rankAfter) {
    const up = d.rankAfter < d.rankBefore;
    /* `391 PLACES CLIMBED` over `#782 → #391` put the same three digits in one
       card carrying two unrelated meanings; the sign says which is which (§70) */
    return {
      value: signed(up ? Math.abs(d.rankBefore - d.rankAfter) : -Math.abs(d.rankBefore - d.rankAfter)),
      label: up ? 'Places climbed' : 'Places lost',
      tone: up ? 'up' : 'down',
    };
  }
  if (d.drift) {
    return { value: signed(d.drift), label: d.drift > 0 ? 'Rating gained' : 'Rating lost', tone: d.drift > 0 ? 'up' : 'down' };
  }
  return { value: num(d.wins || 0), label: d.wins === 1 ? 'Win' : 'Wins', tone: 'flat' };
}

/**
 * One glyph system for the whole product: a signed number. The triangle is the
 * chrome chip's, and two notations for one idea in adjacent lines (`+133` over
 * `▲391`) made the second one look like a different kind of number (§6, §40).
 */
/** The recap is shown once, however the player leaves it (§20). */
function seeAway() { awaySeen = true; ss(AWAY_KEY, '1'); }

function awayBody(d, onContinue) {
  const hero = awayHero(d);
  /*
   * WHERE THE CREATURE NOW STANDS, NOT ONLY HOW FAR IT MOVED.
   *
   * §6.1 pairs `1,214 → 1,347 MMR` with `#782 → #391`, and the card carried
   * only the rank pair and a `+133` delta: two statements of the same
   * MOVEMENT and no statement of the POSITION. A player coming back after
   * eighteen fights is owed both — where it went, and where it is. The delta
   * then stops being said twice and leaves the summary line.
   */
  const rate = d.before != null && d.after != null ? `${num(d.before)} → ${num(d.after)} rating` : '';
  const rankMove = d.rankBefore != null && d.rankAfter != null
    ? `${rankOf(d.rankBefore)} → ${rankOf(d.rankAfter)}` : '';
  /*
   * ONE NOUN PER THING (§9.1), IN §6.1'S OWN CASE.
   *
   * The case is §6.1's — two label-cased facts either side of a middot — and
   * the NOUNS are §9.1's, which is the later and binding section: a bout is a
   * *fight* and a fight won is a *win*. `18 BATTLES · 11 VICTORIES` sat three
   * lines above `THE FIGHT THAT MOVED IT MOST` and `SEE THE FIGHTS`, which is
   * three words for one thing inside 120 px of one card.
   */
  const summary = [
    h('span.d-n', num(d.fights)),
    h('span.d-l', d.fights === 1 ? 'Fight' : 'Fights'),
    h('span.dot', '·'),
    h('span.d-n', num(d.wins)),
    h('span.d-l', d.wins === 1 ? 'Win' : 'Wins'),
    !rate && d.drift ? h('span.dot', '·') : null,
    !rate && d.drift ? h('span', { class: d.drift > 0 ? 'd up' : 'd down' }, `${signed(d.drift)} RATING`) : null,
  ];

  return h('div.ov-card.away-card',
    h('div.away-hd', 'While you were away'),
    h(`div.away-big.${hero.tone}`, hero.value),
    h('div.away-cap', hero.label),
    h('div.away-line', summary),
    rate ? h('div.away-move', rate) : null,
    rankMove ? h('div.away-rank', `${rankOf(d.rankBefore)} → `, h('span.r-now', rankOf(d.rankAfter))) : null,
    /* eighteen fights and no single moment worth opening: the server already
       picks the one whose rating moved most, and it was going unused (§78) */
    d.highlight
      ? h('a.away-pick', {
        href: `#/history/${d.highlight}`,
        /* every exit closes the recap, not only CONTINUE: leaving through one
           of its own links left it armed to open a second time (§20) */
        onclick: seeAway,
      }, h('span.away-pick-l', 'The fight that moved it most'), icon('arrow-right'))
      : null,
    h('div.away-acts',
      h('button.btn.primary', {
        type: 'button',
        /* a screenshot state remembers nothing (§10) */
        onclick: () => { if (!onContinue) return; seeAway(); onContinue(); },
      }, 'Continue', icon('arrow-right')),
      /* eighteen fights just happened and the card was the only door out of
         them, opening onto nothing (§19) */
      h('a.away-more', { href: '#/history', onclick: seeAway }, 'See the fights', icon('arrow-right'))));
}

function awayCard(sn) {
  const c = store.session?.creature || null;
  const after = c?.rating ?? null;
  const drift = sn.ratingDrift != null ? Math.round(sn.ratingDrift) : null;
  const before = after != null && drift != null ? after - drift : null;
  /* rank at the last visit → rank now; the server field is optional, and the
     line falls back to the rating move until it ships (see notes) */
  return awayBody({
    fights: sn.fights || 0,
    wins: sn.wins || 0,
    drift,
    before,
    after,
    rankBefore: sn.rankBefore ?? null,
    rankAfter: c?.rank ?? null,
    highlight: sn.highlightMatchId ?? null,
  }, () => dismiss('away'));
}

/* ── replay (#/watch/:id) ────────────────────────────────────────────────── */

function startReplay() {
  const ask = () => {
    if (!alive) return;
    if (store.live.match?.matchId === ARGS.matchId) return;
    try { window.__airenaSend?.({ cmd: 'replay', matchId: ARGS.matchId }); } catch { /* no socket yet */ }
  };
  for (const ms of [300, 1400, 3000]) replayTimers.push(setTimeout(ask, ms));
  /* Three unanswered asks and then silence left the player watching whatever
     fight happened to be live, under the words WATCHING REPLAY (§22). */
  replayTimers.push(setTimeout(() => {
    if (!alive || ovKind) return;
    if (store.live.match?.matchId === ARGS.matchId) return;
    showOverlay('lost', () => lostCard(), 0);
  }, 4600));
}

function replayCard() {
  return h('div.ov-card.replay-card',
    h('div.res-word.t-state.draw', 'Replay over'),
    h('div.acts',
      h('button.btn.primary', {
        type: 'button',
        onclick: () => { clearOverlay(); try { window.__airenaSend?.({ cmd: 'replay', matchId: ARGS.matchId }); } catch { /* no socket */ } },
      }, 'Watch it again'),
      h('button.btn', { type: 'button', onclick: () => C?.go('/history') }, 'Back')));
}

function lostCard() {
  return h('div.ov-card.replay-card',
    h('div.res-word.t-state.draw', 'Not found'),
    h('div.res-note', 'This replay could not be loaded.'),
    h('div.acts',
      h('button.btn.primary', { type: 'button', onclick: () => C?.go('/history') }, 'Back to history')));
}

/* ── the screenshot states (§10) ─────────────────────────────────────────── */

function startSim() {
  const want = sim.phase;
  /*
   * A CAPTURE HAS TO BE THE SAME PICTURE EVERY TIME.
   *
   * The desktop VS capture measured at roughly half the opacity the card
   * specifies, and the flagship result capture at a third: both were caught
   * mid-entrance, because the shot is taken on a wall-clock delay that knows
   * nothing about when a card was raised. A `?ui=` state is a photograph of a
   * design, not of a transition, so under this attribute the cards simply are
   * (see `ui/screens/live.css`) (§65).
   */
  document.body.dataset.sim = store.debug || '1';
  if (sim.last) lastResult = sim.last;
  /* the VS fixture's two faces are real bodies, and a body is a module import,
     a renderer and a fetch: started with the state rather than with the card,
     they are on screen by the time anything photographs it (§10, §65) */
  /*
   * AND THE RESULT CARD'S ONE FACE IS A BODY TOO.
   *
   * The preload was scoped to `vs`, so `?ui=result-win` (whose face is the
   * player's own creature, already in the session) came back as a rendered
   * body while `?ui=result-loss` (whose face is the WINNER, i.e. an opponent
   * the fixture has to go and find) came back as the flat id-seeded mark —
   * the same beat photographed twice as two different kinds of object. Both
   * states now start the module and the lookup with the state rather than
   * with the card.
   */
  if (sim.card === 'vs' || sim.card === 'win' || sim.card === 'loss') {
    import('../ui/portrait.js').catch(() => { /* the mark stands in */ });
    someFoeId(store.session?.creature?.id || null);
  }
  C.set({ live: { phase: want } });
  subs.push(C.on('live', (l) => { if (l.phase !== want) C.set({ live: { phase: want } }); }));

  const hud = $('#hud');
  if (hud) hud.classList.add('sim');
  /* the ownership mirror is CSS keyed on `body[data-mine]`, and a `?ui=` state
     has no socket to learn ownership from: the fixture states its own */
  markMine();
  simFeed();
  if (sim.hud) { fakeRoot = fakeHud(); ROOT.appendChild(fakeRoot); }
}

function syncSimOverlay() {
  if (ovKind) return;
  if (sim.card === 'vs') showOverlay('vs', () => simVsCard(), 0);
  else if (sim.card === 'win' || sim.card === 'loss') showOverlay('result', () => simResultCard(sim.card), 0);
  else if (sim.card === 'away') showOverlay('away', () => simAwayCard(), 0);
  else ovKind = 'none';
}

function simVsCard() {
  /*
   * A FIXTURE WITH REAL FACES.
   *
   * The names, ratings and minds are §10's plausible fakes, but the two
   * PORTRAITS have to be real or the capture proves nothing about the card the
   * player sees. Mine comes from the session; the opponent's is whichever
   * creature the arena is actually showing behind the card, which is the only
   * second body this state can honestly reach. Neither is required — the
   * id-seeded mark stands in when there is nothing to draw.
   */
  const mineId = store.session?.creature?.id || null;
  const ids = store.live.match?.ids || null;
  const foeId = (ids ? Object.values(ids).find((v) => v && v !== mineId) || null : null)
    || someFoeId(mineId);
  const side = (f, arena, mine) => h(`div.vs-side.s-${arena}.${mine ? 'own' : 'foe'}`,
    vsPortrait(mine ? (mineId || f.name) : foeId, mine ? !!mineId : true, f.name),
    h('div.vs-col',
      h('div.vs-name', latinOnly(f.name) || '—'),
      h('div.vs-rate', `${rankOf(f.rank)} · ${num(f.rating)} rating`),
      h('div.vs-note', `${num(f.wins)} – ${num(f.losses)} · ${Math.round((f.wins / (f.wins + f.losses)) * 100)}% win rate`),
      h('div.vs-mind', mindBadge(f.model, { mode: false })),
      mine ? h('span.vs-you', 'You') : h('span.vs-you.ghost', { 'aria-hidden': 'true' }, 'You')));
  /* the player left and blue, the opponent right and orange — the addendum's
     rule, and the same columns `vsCard()` builds from a real match */
  const card = h('div.ov-card.vs-card.strong',
    h('div.vs-row',
      side(FIX.own, 'blue', true),
      h('div.vs-mid', h('div.vs-word', 'VS')),
      side(FIX.foe, 'orange', false)));
  settleFaces();
  return card;
}

function simResultCard(kind) {
  const win = kind === 'win';
  const before = FIX.own.rating;
  const rank = FIX.own.rank;
  return resultCard({
    outcome: win ? 'win' : 'loss',
    delta: win ? 24 : -18,
    before,
    after: before + (win ? 24 : -18),
    rankBefore: rank,
    /* a win climbs, a loss slips — and never past the top of the ladder */
    rankAfter: win ? Math.max(1, rank - 43) : rank + 29,
    training: false,
    faulted: false,
    foe: FIX.foe.name,
    /* the fixture states the fact the card is built to carry (§9.1) */
    reason: win ? 'knocked out' : 'time ran out, more health left',
    run: win ? 0 : 3,
    matchId: '16013462',
    seed: '16013462',
    /* the first-fight fixture asks the card for its first-time wording (§6.2) */
    first: store.debug === 'result-first',
  });
}

function simAwayCard() {
  return awayBody({
    fights: 18, wins: 11, drift: 133, before: 1214, after: 1347, rankBefore: 782, rankAfter: 391,
    highlight: 'demo',
  }, null);
}

function simFeed() {
  const wrap = $('#feedwrap');
  if (!wrap) return;
  wrap.classList.add('sim');
  wrap.classList.remove('empty');
  wrap.querySelector('.feed-sim')?.remove();
  let heads = 0;
  wrap.appendChild(h('div.feed-sim', FEED_FX(FIX.own.name, sim?.mine || 'blue').map(([side, who, what, when]) => (side === 'head'
    ? h('div.feed-group', { dataset: { head: heads++ === 0 ? 'fight' : 'world' } }, what)
    : h('div', { dataset: { side } },
      when ? h('span.ft', when) : null, h('span.nm', who), ` ${what}`)))));
}

function fakeHud() {
  /* the clock is not a stopwatch: it carries the arena's own deadline (§57) */
  const clock = h('div.clock-sim.mute', { dataset: { clock: '00:28', burn: 'off' } },
    h('div.t', { dataset: { left: '01:02', elapsed: '00:28' } }, '28.0'), h('div.s'));
  clock.style.setProperty('--burn', '.31');
  /*
   * THE FIXTURE OWNS A SLOT, AND SAYS WHICH.
   *
   * `.s-blue` / `.s-orange` are the simulated copies of the viewer's two panel
   * ids, and the ownership mirror in `ui/hud.css` keys on them — so a fixture
   * that always put the player's creature on the blue slot could never
   * photograph the other half of the rule. It takes its slot from the state
   * (`markMine()` publishes the same value on `body[data-mine]`), and the
   * stylesheet does the rest: the player's panel is on the left and blue
   * either way, which is exactly what a capture of this has to prove.
   */
  const mine = sim?.mine || 'blue';
  return h('div.hud-fake.passthrough',
    fakeBar(mine, FIX.own, true),
    fakeBar(other(mine), FIX.foe, false),
    clock);
}

function fakeBar(side, f, mine) {
  const cls = side === 'blue' ? 's-blue' : 's-orange';
  const tiles = f.abilities.map((a, i) => {
    const w = hudWords(a);
    const el = h(`div.cd.${f.cd[i] ? 'cool' : 'ready'}`, {
      dataset: { label: w.label, short: w.short || w.label, cd: f.cd[i] || '' },
    });
    setGlyph(el, a, null, i);
    /* the cooling tile's ring, so a capture shows the state and not just a
       number (§5.3); the fraction is invented only where the fight is */
    if (f.cd[i]) el.style.setProperty('--cd-frac', i === 1 ? '.62' : '.28');
    return el;
  });
  const wide = innerWidth >= 900;
  return h(`div.bar-wrap.${cls}`, mine ? { class: 'mine' } : null,
    h('div.col',
      /* the pill lives on the name line, the way `syncDead()` places it on the
         real HUD — a fixture that differs in structure proves nothing (§59) */
      h('div.namerow',
        h('div.name', f.name),
        h('div.sidetag', mine ? 'You' : ''),
        h('div.sub',
          h('span.mind', mindMark(f.model, 14), wide ? h('span.mind-name', mindInfo(f.model).name) : null),
          h('span.sep', '·'),
          h('span', rankOf(f.rank)), h('span.sep', '·'), h('span', `${num(f.rating)} rating`))),
      h('div.hprow', h('div.hp',
        h('i', { style: { width: `${Math.round((f.hp[0] / f.hp[1]) * 100)}%` } }),
        h('b', `${f.hp[0]} / ${f.hp[1]}`))),
      h('div.cds', tiles)));
}
