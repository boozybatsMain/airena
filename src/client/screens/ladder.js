/**
 * LADDER — creatures · minds · season (docs/REDESIGN.md §6.7).
 *
 * Three sections behind one segmented control and three routes. The screen is
 * built from the player outwards: the podium says who is ahead, the table says
 * who is around, and the sticky footer answers "where am I" without scrolling.
 *
 * The footer never leaves: on a ladder of two hundred rows the one number the
 * player came for is their own, and a number that scrolls away is a number
 * they have to hunt for.
 *
 * WHAT SITS AT THE HEAD OF EVERY ROW.
 *
 * THE LEADERS SHOW THE REAL BODY. The three podium discs (and the player's own
 * row, wherever it stands) mount `ui/portrait.js` — the same scene the specimen
 * page draws, the same body the arena fights with. The ladder is the product's
 * status object, and the one thing a status object may not be made of is stock
 * clip-art: a stranger who reads it should meet the machines, not a pictogram
 * standing in for them.
 *
 * EVERY OTHER ROW KEEPS THE DRAWING. A hundred rows would be a hundred WebGL
 * contexts for the sixteen a browser hands out, so rows below the podium carry
 * `ui/silhouette.js`: a kilobyte of path that picks a FAMILY first — quadruped,
 * serpentine, many-legged, winged, biped, wheeled — so six rows read as six
 * different machines rather than one drawing with its dials turned. It is the
 * placeholder the render replaces, drawn from the same id, so a disc that has
 * not resolved yet never sits empty.
 *
 * The MONOGRAM behind both is the last fallback: a row whose id has not
 * arrived still shows the creature's initials rather than an empty disc.
 *
 * THE MEDAL IS A GEM, AND IT IS NOT WORN ON THE FACE. The kit draws its rank
 * badges as faceted stones; the podium wears one at the card's top-left, clear
 * of the portrait ring it used to slice in half.
 */
import { h, mount, empty, svg } from '../lib/dom.js';
import { get } from '../lib/api.js';
import { num, pct, dhm, rank as rankNum, plural, latinOnly } from '../lib/format.js';
import { mindBadge, mindInfo } from '../ui/mind.js';
import { attachTooltip } from '../ui/tooltip.js';
import { icon } from '../ui/icons.js';
import { markShape } from '../ui/silhouette.js';
import { portrait } from '../ui/portrait.js';

const SECTIONS = [
  ['creatures', 'Creatures', '/ladder'],
  ['minds', 'Minds', '/ladder/minds'],
  ['season', 'Season', '/ladder/season'],
];
const SECTION_IDS = SECTIONS.map(([id]) => id);

/**
 * The create screen's draft (`screens/create.js`), by its key.
 *
 * THE MINDS TABLE PROMISES A CREATURE, AND THE PROMISE HAS TO ARRIVE.
 *
 * A row here says "Pick a row to describe a new creature with that mind" and
 * navigates to `/create?mind=<bundle>` — but `app.js`'s `parseHash()` keeps
 * only the `ui` key of a query and throws the rest away, so the player landed
 * on Create with the default mind selected and no sign their choice had
 * registered. The query is still sent (it is the right address, and the shell
 * will read it), and the choice also travels the way Create already restores a
 * choice: through its own draft, which it reads on mount and matches against
 * the catalogue by bundle id. `/api/models` rows are bundle ids — `<model>:
 * <mode>` — which is exactly what `/api/catalog` calls `id`.
 */
const DRAFT_KEY = 'airena.draft';

/** How many rows the ladder shows before and after SHOW MORE. */
const TOP_SMALL = 12;
const TOP_ALL = 100;

/** House rows are explained once, wherever the chip appears (§6.7). */
const HOUSE_TIP = {
  title: 'House creature',
  body: 'Built by the arena, not by a player. It keeps a set rating and stands in the table for scale — it takes no prize.',
};

/**
 * The same sentence as a line of type, for the readers hover cannot reach.
 *
 * A term of art explained only by a tooltip is explained only to a mouse. The
 * chip is just as visible on a phone, so the legend stands under the standings
 * header wherever a house row is in the list.
 */
const HOUSE_LEGEND = 'Built by the arena, for scale. Takes no prize.';

/**
 * The reference is not one of the minds it is ranked against.
 *
 * `Airena Reference` sits at the top of this table winning 64 % of its fights,
 * one row above Gemini and two above Claude, with nothing to say it is a
 * hand-written baseline rather than a mind a player can choose and expect to
 * behave like the others. A stranger who reaches the ladder after their first
 * fight reads that the house's own stand-in beats every real mind — the exact
 * opposite of what the create card told them half an hour earlier.
 *
 * So the row says what it is, where it is read.
 */
const BASELINE_TIP = {
  title: 'The arena’s baseline',
  body: 'Hand-written by the arena, not a mind. It fights so every real mind has something fixed to be measured against.',
};

/**
 * The two ranks this screen holds, each labelled and each carrying its own
 * reason where it is read. The prize board counts player creatures alone, the
 * footer counts every creature in the arena, and a player looking at `#3` on
 * one and `#4` on the other needs the difference at the point of the conflict
 * — not in a footnote the footer itself covers.
 */
const SEASON_RANK_TIP = {
  title: 'Season rank',
  body: 'Prize places are counted among player creatures alone, so this can sit above the arena rank in the bar below.',
};
const ARENA_RANK_TIP = {
  title: 'Arena rank',
  body: 'Your place among every creature in the arena, house creatures included.',
};

/**
 * The rank the player saw last time. Written on every visit, read before it is
 * overwritten, so the footer can show "you climbed 37 places since last time"
 * instead of a bare number that means nothing on its own.
 */
const RANK_KEY = 'airena.rank.last';

function readLastRank() {
  try {
    const v = JSON.parse(localStorage.getItem(RANK_KEY) || 'null');
    return v && Number.isFinite(v.rank) ? v : null;
  } catch { return null; }
}

function writeLastRank(r) {
  try { localStorage.setItem(RANK_KEY, JSON.stringify({ rank: r, at: Date.now() })); } catch { /* private mode */ }
}

/* ── module state (one screen at a time) ─────────────────────────────────── */

let ctxRef = null;
let rootRef = null;
let section = 'creatures';
let board = null;        // GET /api/ladder
let minds = null;        // GET /api/models
let expanded = false;    // SHOW MORE was pressed
let rankDelta = null;    // places gained since the last visit, or null
let ticker = null;       // season countdown
let offSession = null;
let loadError = null;    // the board itself did not come
let mindsError = null;   // the minds table did not come
let moreError = null;    // SHOW MORE did not come; the top of the list still stands
/** Each section's built body, so a tab press moves a node instead of rebuilding
    one — the podium's three renderers survive the round trip. Cleared by every
    repaint, which is the only thing that can make one of them stale. */
const bodyEls = new Map();
/** Bumped on every enter/leave: an answer that arrives after the screen is
    gone must not paint into a root that belongs to another screen. */
let visit = 0;

/* ── small helpers ───────────────────────────────────────────────────────── */

/** Legacy rows may carry non-latin names; the product shows English only. */
const nameOf = (c) => latinOnly(c?.name) || 'Unnamed';

const record = (c) => `${num(c.wins)} – ${num(c.losses)}`;

/**
 * Library rows keep a set rating for calibration — say so, quietly.
 *
 * The chip used to read REFERENCE, one row above `AIRENA REFERENCE` the *mind*
 * and two above `STORM · AIRENA REFERENCE`. One word, two unrelated meanings,
 * on one screen: a player could not tell whether the chip meant "built by the
 * house" or "runs the Airena Reference mind". The house's own creatures are
 * now HOUSE, and `reference` is left to the mind alone.
 *
 * The word is still a term of art, so it carries its own explanation: the
 * sentence used to live only under the SEASON table, two tabs away from the
 * chip that needed it.
 */
const isHouse = (c) => !!(c?.calibration || c?.isLibrary);

const houseChip = (c) => (isHouse(c)
  ? attachTooltip(h('span.chip.lad-ref', {
    /* The chip lives inside a row that is itself a button (and, on the
       podium, a link). A focusable element nested in one is invalid, so the
       sentence reaches a screen reader as part of the row's own name instead
       of as a second tab stop — and a pointer that lands on the chip is
       swallowed here rather than navigating to the creature behind it. */
    'aria-label': `House creature. ${HOUSE_TIP.body}`,
    onclick: (e) => { e.preventDefault(); e.stopPropagation(); },
  }, 'House'), HOUSE_TIP)
  : null);

const youChip = (mine) => (mine ? h('span.chip.lad-you', 'You') : null);

/**
 * The reference's own label, on the row where it is compared to real minds.
 *
 * Same shape as the HOUSE chip and for the same reason: it lives inside a row
 * that is itself a button, so it is not a second tab stop and a pointer that
 * lands on it is swallowed rather than starting a creature.
 */
const baselineChip = () => attachTooltip(h('span.chip.lad-base', {
  'aria-label': `Baseline. ${BASELINE_TIP.body}`,
  onclick: (e) => { e.preventDefault(); e.stopPropagation(); },
}, 'Baseline'), BASELINE_TIP);

/**
 * THE RANK GEM — the kit's faceted stone, in the kit's three metals.
 *
 * The podium used to wear a `#1` pill pinned to the top-left of the portrait
 * disc, where it cut the gold ring in half and, on a phone, sat across the
 * creature's own face. A medal that damages the thing it decorates is worse
 * than no medal. The kit already draws the badge the product needed — a cut
 * stone, four flat facets and a hairline — so the podium wears that, at the
 * card's corner, with nothing behind it.
 *
 * Flat facets, not gradients: a gem reads as cut because its planes catch
 * different light, and four solid tones say that at 22 px where a gradient
 * only says "shiny". The gem is decorative — the rank beside it carries the
 * meaning — so it is hidden from a screen reader.
 */
const GEM = {
  1: { hi: '#F8E7AC', mid: '#E2BC57', lo: '#BE912C', line: 'rgba(74, 58, 16, .42)' },
  2: { hi: '#F1F3F6', mid: '#C6CBD3', lo: '#98A0AB', line: 'rgba(44, 49, 56, .34)' },
  3: { hi: '#EAC5A3', mid: '#C88B5E', lo: '#A2653A', line: 'rgba(64, 35, 20, .40)' },
};

function rankGem(place, size = 22) {
  const g = GEM[place];
  if (!g) return null;
  return svg(`<svg class="gem" width="${size}" height="${Math.round(size * 1.25)}" viewBox="0 0 24 30"
    aria-hidden="true" focusable="false">
    <path d="M12 1.4 2.7 11.2h9.3z" fill="${g.hi}"/>
    <path d="M12 1.4 21.3 11.2H12z" fill="${g.mid}"/>
    <path d="M2.7 11.2 12 28.6V11.2z" fill="${g.mid}"/>
    <path d="M21.3 11.2 12 28.6V11.2z" fill="${g.lo}"/>
    <path d="M12 1.4 21.3 11.2 12 28.6 2.7 11.2z" fill="none" stroke="${g.line}" stroke-width="1.1" stroke-linejoin="round"/>
    <path d="M2.7 11.2h18.6" stroke="${g.line}" stroke-width=".8" opacity=".5"/>
  </svg>`);
}

/**
 * Frozen numbers for a deterministic capture (docs/REDESIGN.md §10):
 *   ?ui=season   — a season that actually ends, so ENDS IN has something to say
 *   ?ui=rank-up  — the footer's "climbed since last visit" arrow
 * Debug states never write anything.
 */
const debugIs = (name) => String(ctxRef?.store?.debug || '') === name;

/**
 * The season block: whichever of the two shapes the server sent.
 *
 * ONE CLOCK, ONE END DATE. The `?ui=season` fixture used to invent its own
 * `endsAt`, and one frame then carried three different figures for the same
 * deadline: the chrome chip counting down from the real season (`17D 19H 56M`),
 * the subhead counting down from the fixture (`18D 04H 12M`) and the tile
 * printing the fixture again at a coarser precision (`18D 04H`). The fixture
 * now borrows the session's own end date, so the chip and the screen cannot
 * disagree; only the prize figures are frozen, because those are what the
 * capture is of.
 */
function seasonMeta() {
  const meta = board?.seasonMeta || ctxRef?.store?.session?.season || null;
  if (debugIs('season')) {
    return {
      n: meta?.n || 1,
      /* A stand with no season at all still has to produce a board worth
         looking at, so the fallback is a real deadline rather than none. */
      endsAt: meta?.endsAt || (Date.now() + 18 * 864e5 + 4 * 36e5 + 12 * 6e4),
      prizeCoins: 4500,
      prizes: [1500, 1000, 600, 200, 200, 200, 200, 200, 200, 200],
    };
  }
  return meta;
}

/** Milliseconds left in the season, or null when no end is scheduled. */
function seasonLeft() {
  const meta = seasonMeta();
  if (!meta?.endsAt) return null;
  return Math.max(0, meta.endsAt - Date.now());
}

/* ── the specimen mark ───────────────────────────────────────────────────── */

/**
 * A creature's initials — the fallback under the silhouette.
 *
 * Two words give their first letters (STONE GOLEM → SG), one word gives its
 * first two (ICEBREAKER → IC). Digits count as letters, so MARK-92 is MA and
 * not M9 — the reader is matching a shape to a name they can see two
 * centimetres to the right, and the letters that start the name are the ones
 * that do it. Anything with no letters at all falls back to a neutral dash
 * rather than an empty disc.
 */
function initials(name) {
  const words = String(name || '').trim().split(/\s+/).filter(Boolean);
  const letters = (w) => w.replace(/[^\p{L}\p{N}]/gu, '');
  if (words.length > 1) {
    const a = letters(words[0])[0] || '';
    const b = letters(words[1])[0] || '';
    if (a && b) return (a + b).toUpperCase();
  }
  const one = letters(words.join(''));
  return one ? one.slice(0, 2).toUpperCase() : '—';
}

/**
 * The creature's own face on its disc. `extra` carries the size modifier.
 *
 * The silhouette is drawn from the id, so it is the same drawing on the row,
 * on the podium card and on the VS card. A row that arrives without an id (the
 * server's `around` window has been known to) keeps the initials rather than an
 * empty circle — that is the only case the monogram is for.
 */
function mark(c, extra = '', { body = false } = {}) {
  const id = c?.id || '';
  return h('div.lad-mark', {
    class: `${extra} ${id ? 'has-shape' : ''}`.trim(),
    'aria-hidden': 'true',
    /* `showBodies()` reads this after the paint: the drawing is what stands
       there until (and unless) the render arrives. */
    ...(body && id ? { dataset: { body: id, name: nameOf(c) } } : {}),
  }, id ? svg(markShape(id)) : h('span.lad-mono', initials(nameOf(c))));
}

/* ── the real body, on the discs that are big enough to hold one ─────────── */

/**
 * The leaders' portraits: `ui/portrait.js`, the same scene the specimen page
 * draws.
 *
 * WHY NOT EVERY ROW. A hundred rows is a hundred WebGL contexts and a browser
 * hands out sixteen. Four discs earn one each — the three on the podium, which
 * are the screen's subject, and the player's own row, which is the reason they
 * opened the screen at all. Everything else keeps the drawing.
 *
 * WHY THE MEASUREMENT AND NOT A MEDIA QUERY. A body rendered into a forty-pixel
 * phone disc is a grey smudge that costs a renderer; the silhouette is honestly
 * better at that size. The disc itself is asked how big it is, so the rule
 * follows the layout instead of restating it.
 */
let bodies = [];      // live portraits, so a repaint and leave() can put them down
let bodyToken = 0;    // a render that arrives after its paint must not attach

function stopBodies() {
  bodyToken++;
  for (const p of bodies) { try { p.destroy(); } catch { /* already gone */ } }
  bodies = [];
}

async function showBody(el, token) {
  const id = el.dataset.body;
  /*
   * WHERE THE BODY LIVES IS NOT IN THE LADDER'S ROW.
   *
   * A creature the pipeline sculpted has its own source at `/api/body/:id`;
   * one that borrowed a stock shape (`bodyRef: 'gorilla'`) has none — that
   * address answers 404 and the source is served from `/bodies/`. The ladder's
   * rows carry neither field, so two of the three leaders rendered nothing at
   * all until the card was asked. One read per disc, and the answer is cached
   * by the browser for the next visit.
   */
  let card = null;
  try { card = (await get(`/api/creature/${id}`))?.creature || null; }
  catch { /* the body may still be the creature's own */ }
  if (token !== bodyToken || !el.isConnected) return;

  const p = await portrait(el, {
    creatureId: id,
    bodyRef: card?.bodyRef || null,
    size: card?.size || 1,
    label: el.dataset.name || 'The creature',
  });
  if (!p?.ok) return;                             // the drawing is the answer
  if (token !== bodyToken || !el.isConnected) { try { p.destroy(); } catch { /* never started */ } return; }
  bodies.push(p);
  el.classList.add('has-body');
}

function showBodies() {
  if (!rootRef) return;
  const token = bodyToken;
  for (const el of rootRef.querySelectorAll('.lad-mark[data-body]')) {
    /* A disc that came back from the section cache is already carrying its
       creature; asking twice would stand a second renderer on top of the
       first and leak the context under it. */
    if (el.classList.contains('has-body') || el.querySelector('canvas')) continue;
    /* 48 px is the standings disc on a desktop and 40 px is the phone's. The
       line runs between them: at forty the body is a smudge that costs a
       renderer, and the drawing — a filled silhouette, not a shrunken
       render — is honestly the better picture. */
    if (el.getBoundingClientRect().width < 44) continue;
    showBody(el, token).catch(() => { /* the drawing is the answer */ });
  }
}

/* ── screen ──────────────────────────────────────────────────────────────── */

export async function enter(root, args, ctx) {
  ctxRef = ctx;
  rootRef = root;
  section = SECTION_IDS.includes(args?.section) ? args.section : 'creatures';
  expanded = false;
  bodyEls.clear();
  board = null;
  minds = null;
  rankDelta = null;
  loadError = null;
  mindsError = null;
  moreError = null;
  const mine = ++visit;

  /* A fresh mount starts at the top, so the dock starts hidden — `syncDockSeen`
     (below, "THE DOCK EARNS THE FLOOR BY BEING SCROLLED TO") only ever turns
     it on, in response to a real scroll. */
  root.classList.remove('dock-seen');
  root.addEventListener('scroll', syncDockSeen, { passive: true });

  mount(root, h('div.doc.lad', h('div.doc-inner', skeleton())));

  await load();
  if (mine !== visit) return;

  /* Read the remembered place BEFORE overwriting it: the delta is the whole
     point of remembering. */
  const me = board?.me || null;
  if (me?.rank != null) {
    const last = readLastRank();
    if (last && last.rank !== me.rank) rankDelta = last.rank - me.rank;
    /* A `?ui=` capture is not a visit. Writing here would hand the next real
       visit a delta measured against a screenshot (docs/REDESIGN.md §10). */
    if (!ctxRef?.store?.debug) writeLastRank(me.rank);
  }
  if (debugIs('rank-up')) rankDelta = 37;

  paint();

  offSession = ctx.on('session', tick);
  if (seasonLeft() != null && !debugIs('season')) ticker = setInterval(tick, 60_000);
}

/**
 * SUB-NAVIGATION IS NOT A PAGE LOAD (§1.8).
 *
 * CREATURES · MINDS · SEASON are three routes, and a route change used to mean
 * `leave()`, a fresh `.screen` element and `enter()`: the control the player
 * had just pressed cross-dissolved under their own pointer for 620 ms, the
 * podium's three renderers were torn down and rebuilt, `/api/ladder` was
 * fetched again on every press and on every press back, and the twenty-six
 * millisecond row stagger replayed from the top. `app.js` provides this hook
 * for exactly these two addresses and names the ladder in its own comment.
 *
 * What moves: the title, the meta line, the segmented control's pressed state,
 * the body, and the footer's season line. What does not: the board, the minds
 * table, the rank delta, the scroll position of the header, and — because the
 * body of each section is kept rather than rebuilt — the three portraits, so a
 * CREATURES → MINDS → CREATURES round trip costs no WebGL context at all.
 *
 * Returns `false` for anything it cannot serve, and the shell falls back to the
 * full mount: an unknown section, a root that is no longer on the page, or a
 * screen whose `enter()` never got a board to work with.
 */
export function update(args, ctx) {
  if (!rootRef?.isConnected) return false;
  if (ctx) ctxRef = ctx;
  const next = SECTION_IDS.includes(args?.section) ? args.section : 'creatures';
  /* No board: `enter()` either failed or has not finished. Handing the screen
     back to the shell is the right answer to both — a full mount re-runs the
     request the failure came from, which is the one thing a reader pressing a
     tab after an error actually wants. */
  if (!board) return false;
  const wrap = rootRef.querySelector('.lad-wrap');
  if (!wrap) return false;
  if (next === section) return true;

  section = next;
  /* The one piece of state that belongs to a section rather than to the
     screen: a failed SHOW MORE has nothing to say over the minds table. */
  moreError = null;

  const title = wrap.querySelector('.lad-title');
  if (title) title.textContent = titleText();
  const sub = wrap.querySelector('.lad-sub');
  if (sub) sub.textContent = subLine();
  for (const b of wrap.querySelectorAll('.lad-seg > button')) {
    const on = b.dataset.section === section;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  }

  swapBody(wrap);
  /* The footer reconciles the two ranks only on SEASON, so it is rebuilt with
     the section rather than left saying the wrong one of them. */
  const dock = wrap.querySelector('.lad-dock');
  const nextDock = footer();
  if (dock && nextDock) dock.replaceWith(nextDock);
  rootRef.scrollTop = 0;
  /* A tab press hands the reader a fresh top of a different table, and the
     dock has not earned this one's floor yet either. */
  syncDockSeen();
  showBodies();

  /* The minds table is fetched the first time it is asked for, and only then:
     a player who never presses MINDS never pays for it. */
  if (section === 'minds' && !minds && !mindsError) loadMinds();
  return true;
}

/** Put the section's body on screen, keeping the one it replaces. */
function swapBody(wrap) {
  const cur = wrap.querySelector('.lad-body');
  let el = bodyEls.get(section);
  if (!el) { el = bodyFor(section); bodyEls.set(section, el); }
  if (cur === el) return;
  if (cur) cur.replaceWith(el);
  else wrap.insertBefore(el, wrap.querySelector('.lad-dock'));
}

export function leave() {
  visit++;
  disposeAt = visit;
  /* THE PODIUM OUTLIVES THE FADE. `leave()` runs at frame zero of a 620 ms
     cross-dissolve and the reader is still looking at these three discs;
     destroying the renderers here blanked them before the page had begun to
     go. All that happens now is that anything still building is abandoned —
     `dispose()` below is what app.js calls once the fade is over. */
  bodyToken++;
  if (ticker) clearInterval(ticker);
  ticker = null;
  if (offSession) offSession();
  offSession = null;
  if (rootRef) rootRef.removeEventListener('scroll', syncDockSeen);
  ctxRef = null;
  rootRef = null;
  board = null;
  minds = null;
}

/**
 * After the cross-fade (app.js): the discs are off screen, put them down.
 *
 * Unless the reader came back inside those 620 ms. `dispose()` is a timer that
 * app.js starts when the ladder begins to fade, and a player who presses LADDER
 * again before it lands would otherwise have their new podium destroyed by the
 * old one's teardown — `bodies` is one list for the module. The visit it was
 * scheduled for is the only visit it may put down; the new `enter()`'s own
 * `paint()` has already stopped everything that came before it.
 */
let disposeAt = -1;

export function dispose() {
  if (visit !== disposeAt) return;
  bodyEls.clear();
  stopBodies();
}

/**
 * Fetch what this section needs.
 *
 * Every other screen has a bespoke empty state for a server that will not
 * answer; the ladder used to let the rejection fall through `enter()` into the
 * shell's generic card. A table is exactly the screen where "try again" is
 * cheap and worth offering, so the failure is caught and named here — and the
 * minds table is caught separately, because "nothing measured yet" is a lie to
 * tell about a request that never arrived.
 */
async function load() {
  loadError = null;
  mindsError = null;
  moreError = null;
  try {
    board = await get(`/api/ladder?top=${TOP_SMALL}`);
  } catch (e) {
    board = null;
    expanded = false;
    loadError = e;
  }
  if (section === 'minds') await fetchMinds();
}

/** The minds table's own request, so `update()` can make it on its own. */
async function fetchMinds() {
  try {
    minds = await get('/api/models');
    mindsError = null;
  } catch (e) {
    minds = null;
    mindsError = e;
  }
}

/**
 * MINDS, FETCHED WHEN IT IS ASKED FOR — AND THE TABLE ARRIVES IN PLACE.
 *
 * The section is already on screen with its own skeleton when this starts, so
 * what lands is a table replacing the shape of a table: no page, no loading,
 * no page (§1.8).
 */
async function loadMinds() {
  const mine = visit;
  await fetchMinds();
  if (mine !== visit || !rootRef?.isConnected || section !== 'minds') return;
  bodyEls.delete('minds');
  const wrap = rootRef.querySelector('.lad-wrap');
  if (!wrap) return;
  swapBody(wrap);
  const sub = wrap.querySelector('.lad-sub');
  if (sub) sub.textContent = subLine();
}

async function retry() {
  const inner = rootRef?.querySelector('.doc-inner');
  if (inner) mount(inner, skeleton());
  const mine = visit;
  await load();
  if (mine !== visit) return;
  paint();
}

/**
 * The shape of the screen, drawn before its numbers arrive.
 *
 * Per section, because a skeleton that promises a podium to a reader who
 * pressed MINDS is a shape that has to be taken back a moment later.
 */
function skelRows(n) {
  return h('div.rows', Array.from({ length: n }, () => h('div.skel.lad-skel-row')));
}

function skeleton() {
  return h('div.lad-wrap',
    h('div.lad-top', h('div.lad-titles', h('div.skel.lad-skel-title'), h('div.skel.lad-skel-sub')),
      h('div.skel.lad-skel-seg')),
    section === 'creatures'
      ? h('div.podium', [0, 1, 2].map(() => h('div.skel.lad-skel-pod')))
      : null,
    section === 'season' ? h('div.tiles.lad-tiles', [0, 1, 2].map(() => h('div.skel.lad-skel-tile'))) : null,
    /* MINDS opens with a sentence, not a label: a section head reading MINDS
       over a column head reading MIND is a stutter, and the line that says the
       rows are doors is worth more than the repetition. */
    section === 'minds'
      ? h('div.skel.lad-skel-hint')
      : h('div.label-line.lad-label', h('span.t-label', section === 'season' ? 'Prize board' : 'Standings')),
    skelRows(section === 'creatures' ? 6 : 7));
}

/** The shape of the minds table while its numbers are on the way. */
function mindsSkeleton() {
  return h('div.lad-body',
    h('div.skel.lad-skel-hint'),
    skelRows(7));
}

/** Whichever body this section owns, built from what has arrived so far. */
function bodyFor(sec) {
  if (loadError) return h('div.lad-body', errorCard(loadError, 'The ladder could not load'));
  if (sec === 'creatures') return creatures();
  if (sec === 'season') return seasonBoard();
  if (!minds && !mindsError) return mindsSkeleton();
  return mindsTable();
}

function paint() {
  if (!rootRef) return;
  const inner = rootRef.querySelector('.doc-inner');
  if (!inner) return;
  /* The screen root is the scroller. A repaint that forgets the offset throws
     a reader who is forty rows down back to the podium. */
  const at = rootRef.scrollTop;
  /* Every disc in the old tree is about to be thrown away; a renderer left
     running against a detached canvas is a context the browser never gets
     back. */
  stopBodies();
  bodyEls.clear();
  const body = bodyFor(section);
  bodyEls.set(section, body);
  mount(inner,
    h('div.lad-wrap', { class: board?.me ? 'has-foot' : '' },
      header(),
      body,
      footer()));
  rootRef.scrollTop = at;
  showBodies();
}

/** A board is missing: name it, and offer the one useful move. */
function errorCard(err, title) {
  return h('div.empty.lad-error',
    h('div.hd', title),
    h('div.t-small', latinOnly(err?.message) || 'The server did not answer. The fights carry on without the table.'),
    h('button.btn', { type: 'button', onclick: retry }, 'Try again'));
}

/**
 * A session refresh (every 20 s) and a passing minute change exactly two
 * strings on this screen: the meta line and the season clock. Rebuilding a
 * hundred rows, a badge SVG each, to move a clock is the kind of repaint that
 * loses the scroll offset and orphans an open tooltip — so the tick writes the
 * two strings and touches nothing else.
 */
function tick() {
  if (!rootRef?.isConnected) return;
  const sub = rootRef.querySelector('.lad-sub');
  if (sub) sub.textContent = subLine();
  const clock = rootRef.querySelector('.lad-clock');
  if (clock) clock.textContent = clockText();
  /* The one change a string swap cannot carry: a season that gained (or lost)
     an end date changes the tile's label too. */
  if (section === 'season' && (seasonLeft() != null) !== !!clock) paint();
}

/**
 * How long the season has left.
 *
 * ONE PRECISION. The subhead printed `ENDS IN 18D 04H 12M` and the tile under
 * it `18D 04H` — the same deadline, two roundings, forty pixels apart, which
 * reads as two clocks that do not agree rather than as one written twice.
 */
function clockText() {
  const left = seasonLeft();
  return left != null ? dhm(left) : '—';
}

/* ── header ──────────────────────────────────────────────────────────────── */

/** The meta line under the title — the one line a tick rewrites in place. */
function subLine() {
  const meta = seasonMeta();
  const left = seasonLeft();
  let sub;
  if (section === 'creatures') {
    sub = [
      board?.total != null ? plural(board.total, 'creature') : null,
      /* ONE NOUN FOR ONE THING (§9.1). The chrome's season chip renders the
         identical figure a hundred and fifty pixels above this line; it said
         `36 PLAYER CREATURES` while this said `36 FROM PLAYERS`, which is the
         exact phrase the glossary lists under Never. */
      board?.players != null ? `${num(board.players)} player creatures` : null,
      meta?.n ? `Season ${String(meta.n).padStart(2, '0')}` : null,
    ];
  } else if (section === 'minds') {
    sub = [
      minds?.rows?.length ? plural(minds.rows.length, 'mind') : null,
      minds?.have != null ? `${plural(minds.have, 'creature')} measured` : null,
    ];
  } else {
    sub = [left != null ? `Ends in ${dhm(left)}` : 'No end scheduled'];
  }
  return sub.filter(Boolean).join(' · ') || 'The arena, in order';
}

/** The state word at the head of the screen, per section. */
function titleText() {
  if (section === 'season') return `Season ${String(seasonMeta()?.n || 1).padStart(2, '0')}`;
  return section === 'minds' ? 'Minds' : 'Ladder';
}

function header() {
  return h('div.lad-top',
    h('div.lad-titles',
      h('h1.t-state.lad-title', titleText()),
      h('div.t-label.lad-sub', subLine())),
    h('div.seg.lad-seg', SECTIONS.map(([id, label, path]) => h('button', {
      type: 'button',
      class: id === section ? 'on' : '',
      /* `update()` finds its own buttons by this, so the pressed state moves
         without the control being rebuilt under the pointer that pressed it. */
      dataset: { section: id },
      'aria-pressed': id === section ? 'true' : 'false',
      onclick: () => ctxRef.go(path),
    }, label))));
}

/* ── creatures ───────────────────────────────────────────────────────────── */

function creatures() {
  const top = board?.top || [];
  if (!top.length) {
    /* An empty state names the reason and the next step. The next step from an
       empty ladder is the only one there is: be the first row on it. */
    return h('div.lad-body', empty(
      'The ladder is empty',
      'No creature has entered the arena in this season yet.',
      h('a.btn.primary', { href: '#/create' }, 'Create a creature', icon('arrow-right'))));
  }

  const podium = top.slice(0, 3);
  const rest = top.slice(3);
  const me = board?.me || null;
  const shownIds = new Set(top.map((r) => r.id));
  /* The window around my row is only worth its space when my row is not
     already on screen. */
  const around = me && !shownIds.has(me.id) ? (board?.around || []) : [];
  const canExpand = !expanded && board?.total != null && top.length < Math.min(board.total, TOP_ALL);

  /* HOUSE is a term of art, and a term of art explained only by a tooltip is
     explained only to a mouse. Where the chip is in the list, so is its line. */
  const hasHouse = [...rest, ...around].some(isHouse);

  return h('div.lad-body',
    h('div.podium', podium.map((c, i) => step(podiumCard(c, i + 1, me), i))),
    rest.length ? h('div.label-line.lad-label', h('span.t-label', 'Standings')) : null,
    rest.length && hasHouse ? houseLegend() : null,
    rest.length ? h('div.lad-table',
      headRow(),
      h('div.rows', rest.map((c, i) => step(creatureRow(c, me), i)))) : null,
    canExpand ? h('div.lad-more',
      h('button.btn.ghost.lad-more-btn', { type: 'button', onclick: showMore }, 'Show more', icon('chevron-down', 15))) : null,
    moreError ? h('div.t-small.lad-more-note', moreError) : null,
    around.length ? h('div.label-line.lad-label', h('span.t-label', 'Around you')) : null,
    around.length ? h('div.lad-table',
      headRow(),
      h('div.rows', around.map((c, i) => step(creatureRow(c, me), i)))) : null);
}

/** The chip, and what it means, on one quiet line under the header. */
function houseLegend() {
  return h('div.lad-legend',
    h('span.chip.lad-ref.is-legend', 'House'),
    h('span', HOUSE_LEGEND));
}

/*
 * THERE IS NO SECOND RANKING SIGNAL IN THE RATING COLUMN.
 *
 * A thirty-pixel bar used to sit under every rating, drawn on a scale that ran
 * from the lowest figure on the screen to the highest. Nothing named it and
 * nothing gave it an axis, so a reader met an unlabelled length under a labelled
 * number in a table whose rows are already sorted by that number — a graphic
 * saying, less precisely, exactly what the column above it says. The ladder is
 * a document, and a document keeps one grid: rank, name, mind, three figures,
 * each under its own head. The bar with a reason to exist is the minds table's,
 * which measures a win rate against fifty and prints the notch to say so.
 */

/**
 * The entrance beat of one row. A table that appears all at once appears as a
 * block; twenty-six milliseconds apart it appears as a list being read. The
 * stagger is capped so row ninety does not wait two and a half seconds, and
 * `prefers-reduced-motion` flattens it in `ui/base.css`.
 */
function step(el, i) {
  el.style.setProperty('--i', String(Math.min(i, 14)));
  return el;
}

async function showMore(ev) {
  const btn = ev?.currentTarget || null;
  if (btn) { btn.disabled = true; btn.classList.add('is-busy'); }
  moreError = null;
  /* Every other async path in this file carries the guard; this one did not,
     and a player who pressed SHOW MORE, left and came back had the previous
     visit's hundred rows assigned over the fresh screen. */
  const mine = visit;
  let next;
  try {
    next = await get(`/api/ladder?top=${TOP_ALL}`);
  } catch (e) {
    if (mine !== visit) return;
    /* The top of the ladder is still on screen and still true, so this is not
       an empty state — it is one line under a button that comes back. */
    expanded = false;
    moreError = latinOnly(e?.message) || 'The rest of the ladder did not load. Try again.';
    if (btn?.isConnected) { btn.disabled = false; btn.classList.remove('is-busy'); }
    paint();
    return;
  }
  if (mine !== visit) return;
  expanded = true;
  board = next;
  paint();
}

/**
 * One podium card.
 *
 * THE PODIUM HAS A STEP. Three cards of one size, one weight and one type size
 * are a list of three, and a list does not say that the creature on the left
 * is the best in the arena. First place is wider, taller and set in the hero
 * size, wears a 28 px stone and a bigger disc, and stands on its own step:
 * second and third are pushed down so their tops sit below its shoulder and
 * their feet on its line. The metal is still only on the ring and the stone.
 *
 * THE NAME SITS ON ONE LINE WITHIN EACH STEP. The identity block (name, chips,
 * mind) is its own box with a floor height and its content pinned to the top,
 * so a YOU chip on the third card cannot push that card's name half a line
 * above its neighbour's.
 *
 * THE CREST IS A ROW OF ITS OWN. The medal used to be pinned to the disc's
 * top-left corner, where a 44 px pill cut through the metal ring and covered
 * the shoulder of whatever stood inside it. It now opens the card on its own
 * line — gem, then rank — and the portrait below it is whole.
 */
function podiumCard(c, place, me) {
  /* The gem is the podium position; the number is the creature's own rank, so
     the podium and the standings can never quote two different places for one
     creature. */
  const r = Number.isFinite(c?.rank) ? c.rank : place;
  const mine = !!(me && c.id === me.id);
  return h(`a.pod.glass.p${place}`, { href: `#/creature/${c.id}`, class: mine ? 'is-me' : '' },
    h('div.pod-crest',
      /* The leader's stone is bigger, like everything else on its card: a
         podium whose three steps are the same height is a list. */
      rankGem(place, place === 1 ? 28 : 22),
      h('span.pod-place.num', rankNum(r))),
    h('div.lad-id.pod-id', mark(c, 'pod-mark', { body: true })),
    h('div.pod-ident',
      h('div.pod-line',
        h('span.pod-name', nameOf(c)),
        youChip(mine),
        houseChip(c)),
      h('div.pod-mind', mindBadge(c.model)),
      /* The line the phone reads instead of the three tiles below. */
      metaLine(c, pct(c.winrate), 'pod-meta')),
    h('div.pod-stats',
      h('div.pod-stat', h('div.v.num', num(c.rating)), h('div.k', 'Rating')),
      h('div.pod-stat', h('div.v.num', record(c)), h('div.k', 'Record')),
      h('div.pod-stat', h('div.v.num', pct(c.winrate)), h('div.k', 'Win rate'))));
}

/**
 * The narrow-screen meta line: the mind, then the numbers.
 *
 * TWO GROUPS, NOT FIVE ITEMS. The mind used to share one nowrap line with the
 * record and the win rate, and a phone cut it to `AIRENA …`, `GLM 5…`,
 * `CLAU…` — the ladder never said which mind any creature carried, on the
 * screen where the mind is the whole point of the comparison. Grouped, the
 * line wraps between the mind and the numbers instead of inside the name, and
 * nothing is ever clipped mid-word.
 */
function metaLine(c, tail, extra = '', tailCap = 'win rate') {
  return h('div.lad-meta', { class: extra },
    h('span.lad-meta-mind', mindBadge(c.model, { mode: false })),
    h('span.lad-meta-stats',
      /* The phone drops the column headers with the columns, and a bare
         `2,451 – 745 · 75%` names none of its three numbers. Each keeps its own
         caption at 8.5px — the smallest type in the product, and the only thing
         standing between a first-time reader and four unlabelled figures. */
      h('span.num', record(c), h('i.lad-cap', 'record')),
      h('span.lad-dot'),
      h('span.num', tail, h('i.lad-cap', tailCap))));
}

function headRow() {
  return h('div.lad-grid.lad-head',
    h('div.k', 'Rank'),
    h('div.k', 'Creature'),
    h('div.k.lad-mind', 'Mind'),
    h('div.k.r.lad-rating', 'Rating'),
    h('div.k.r.lad-record', 'Record'),
    h('div.k.r.lad-wr', 'Win rate'),
    h('div.lad-go'));
}

function creatureRow(c, me) {
  const mine = !!(me && c.id === me.id);
  return h('button.row.lad-grid.lad-row', {
    type: 'button',
    class: mine ? 'is-me' : '',
    onclick: () => ctxRef.go(`/creature/${c.id}`),
  },
  /* My own row is the reason the screen was opened, so it gets the fourth and
     last renderer: the one creature in the table whose face the player already
     knows is the one that shows it. */
  h('div.lad-id',
    h('span.lad-rank.num', rankNum(c.rank)),
    mark(c, '', { body: mine })),
  h('div.lad-who',
    h('div.lad-line', h('span.name', nameOf(c)), youChip(mine), houseChip(c)),
    metaLine(c, pct(c.winrate))),
  h('div.lad-mind', mindBadge(c.model, { mode: false })),
  h('div.v.r.lad-rating', h('span.num', num(c.rating))),
  h('div.v.r.lad-record', record(c)),
  h('div.v.r.lad-wr', pct(c.winrate)),
  h('div.lad-go', icon('chevron-right', 15)));
}

/* ── minds ───────────────────────────────────────────────────────────────── */

function mindsTable() {
  if (mindsError) return h('div.lad-body', errorCard(mindsError, 'The minds could not load'));
  const rows = minds?.rows || [];
  if (!rows.length) {
    return h('div.lad-body', empty(
      'Nothing measured yet',
      'Minds appear here once their creatures have fought.',
      h('a.btn.primary', { href: '#/create' }, 'Create a creature', icon('arrow-right'))));
  }
  return h('div.lad-body',
    /* The kit draws a caution as a card the width of a card, not as a rule
       across the page: one sentence stretched to 1,180 px reads as a system
       banner, and this is a footnote about how much has been measured. */
    minds?.smallSample
      ? h('div.lad-alert.glass',
        h('span.lad-alert-dot', { 'aria-hidden': 'true' }),
        h('div.lad-alert-text',
          h('div.hd', 'Small sample'),
          /* A sentence, not a telegram. `Needs 200 creatures, has 36.` has no
             subject in a product that writes `The arena pairs your creature on
             its own.` everywhere else. */
          h('div.sub', `These numbers need ${plural(minds.need, 'creature')} to mean anything. There are ${num(minds.have)}.`)))
      : null,
    /*
     * THE OFFER, IN TYPE, ABOVE THE TABLE.
     *
     * The hover label reaches a mouse and the chevron reaches a reader who
     * already knows what a chevron promises. The sentence reaches everyone,
     * and it stands where the section would otherwise carry a head reading
     * MINDS above a column head reading MIND.
     */
    h('div.lad-legend.lad-hint', h('span', 'Pick a row to describe a new creature with that mind.')),
    h('div.lad-table',
      h('div.mind-grid.lad-head',
        h('div.k', 'Mind'),
        h('div.k.r.mind-count', 'Creatures'),
        h('div.k.r.mind-fights', 'Fights'),
        h('div.k.r', 'Win rate'),
        /* Not AVG RATING: the footnote under the table already says the number
           is an average, and this was the only abbreviation in the product. */
        h('div.k.r', 'Rating'),
        h('div.lad-go')),
      h('div.rows', rows.map((r, i) => step(h('button.row.mind-grid.mind-row', {
        /*
         * THE IMPROVE ARROW HAS TO POINT AT SOMETHING.
         *
         * The loop is Create → … → Learn → Improve → Climb, and this table is
         * where Learn happens: the player finds out that one mind wins 64 % of
         * its fights and another 38 %. Until now the finding had nowhere to
         * go — seven rows of numbers with no onclick, on the one screen whose
         * job is to change what the player does next. Each row is the door to
         * the creature it argues for.
         */
        type: 'button',
        onclick: () => pickMind(r.model),
      },
      h('div.mind-cell',
        h('span.mind-line',
          /* The mode is rendered here rather than inside the badge: the
             badge writes it as `· QUICK`, and on a phone that line drops
             under the name, where the separator arrives at the head of a
             line with nothing to separate. Same word, its own element, and
             the middot is a CSS decoration that the phone can drop. */
          mindBadge(r.model, { mode: false }),
          modeWord(r.model),
          /* The hand-written reference is not one of the minds it is being
             compared with, and the row that ranks it first has to say so. */
          mindInfo(r.model)?.key === 'airena' ? baselineChip() : null,
          /* The action, in the dead space at the end of the line the name
             already occupies: it costs the row no height, so nothing moves
             when it appears under the pointer. */
          h('span.mind-cta',
            h('span', 'Create with this mind'),
            icon('arrow-right', 13))),
        /* The one question this table exists to answer is "is this mind
           winning", and the answer is a percentage against fifty. A bar with
           an even-split notch says it without arithmetic. */
        Number.isFinite(r.winrate)
          ? h('div.mind-bar', { class: r.winrate >= 50 ? 'up' : '' },
            h('i', { style: { width: `${Math.max(0, Math.min(100, r.winrate)).toFixed(1)}%` } }))
          : null,
        /* A phone drops the two count columns for width. The sample size is
           what makes a win rate mean anything, so it folds under the name
           instead of disappearing — and it wraps rather than truncating, so
           `88,972 FIGHTS` never arrives as `88,972 FIGH…`. */
        h('div.mind-sample',
          h('span', `${plural(r.creatures, 'creature')} ·`),
          h('span', plural(r.fights, 'fight')))),
      h('div.v.r.mind-count', num(r.creatures)),
      h('div.v.r.mind-fights', num(r.fights)),
      h('div.v.r', pct(r.winrate)),
      h('div.v.r.mind-avg', num(r.avgRating)),
      /* The same chevron the creature rows carry, because these rows do the
         same thing: they go somewhere. */
      h('div.lad-go', icon('chevron-right', 15))), i)))),
    h('div.lad-foot-note',
      h('div', 'Rating is the average across every creature that carries this mind.'),
      h('div', 'The notch on each bar marks 50%.')));
}

/**
 * THE CLICK LANDS ON THE MIND IT PROMISED.
 *
 * The address carries the choice (`/create?mind=<bundle>`) and so does the
 * draft Create restores on mount, because today only one of the two survives:
 * `app.js`'s `parseHash()` reads the `ui` key out of a query and discards the
 * rest, so a player who pressed a row arrived at Create with the default mind
 * selected and nothing to show their choice had been heard. The draft is
 * merged, never replaced — a sentence already written is the most expensive
 * thing on that screen and this press must not cost it.
 *
 * A `?ui=` capture writes nothing (§10).
 */
function pickMind(model) {
  if (!ctxRef?.store?.debug) {
    try {
      const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}') || {};
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...draft, bundle: model }));
    } catch { /* private mode: the address is the only carrier left */ }
  }
  ctxRef.go(`/create?mind=${encodeURIComponent(model)}`);
}

/** QUICK or DEEP, as a word of its own. Nothing when the mind has one speed. */
function modeWord(id) {
  const mode = mindInfo(id)?.mode;
  return mode ? h('span.lad-mode', mode) : null;
}

/* ── season ──────────────────────────────────────────────────────────────── */

function seasonBoard() {
  const meta = seasonMeta();
  const left = seasonLeft();
  const prizes = meta?.prizes || [];
  const rows = board?.prizeBoard || [];

  return h('div.lad-body',
    h('div.tiles.lad-tiles',
      h('div.tile', h('div.v', num(meta?.prizeCoins ?? prizes.reduce((s, p) => s + p, 0))), h('div.k', 'Coins in the pool')),
      /* The glossary's word, the same one the subhead and the season chip use
         for this figure (§9.1): *from players* is listed under Never. */
      h('div.tile', h('div.v', num(board?.players)), h('div.k', 'Player creatures')),
      h('div.tile', h('div.v', { class: left != null ? 'lad-clock' : '' }, clockText()), h('div.k', left != null ? 'Left in the season' : 'No end scheduled'))),

    h('div.label-line.lad-label', h('span.t-label', 'Prize board')),
    /*
     * WHAT THE BOARD RANKS, AND WHAT IT PAYS.
     *
     * Two things stood on this screen with nothing to read them by. The rank in
     * the first column counts player creatures alone and the bar at the foot of
     * the same frame counts every creature in the arena, so one creature had two
     * places six rows apart and the only explanation was a hover tooltip. And a
     * currency arrived fully formed — a pool, three prize rows, a unit — with
     * nothing anywhere in the product saying what one of them is for. Both
     * sentences stand here, once, above the table they belong to.
     */
    h('div.lad-legend.lad-note',
      h('span', 'Season rank counts player creatures only.'),
      h('span', 'Coins buy extra generations when the season ends.')),
    rows.length
      ? h('div.lad-table',
        h('div.prize-grid.lad-head',
          /* SEASON RANK, spelled out: the footer under this table says ARENA
             RANK and quotes a different number for the same creature. Two
             labelled ranks are two facts; two bare ones are a contradiction. */
          h('div.k', 'Season rank'),
          h('div.k', 'Creature'),
          h('div.k.lad-mind', 'Mind'),
          /* The same columns the standings use, in the same order: a reader
             switching segments should not have to relearn the table, and the
             record is the fact the prize board was leaving a four-hundred-
             pixel gap in the middle of the row to avoid saying. */
          h('div.k.r.lad-record', 'Record'),
          h('div.k.r.lad-rating', 'Rating'),
          h('div.k.r', 'Prize')),
        h('div.rows', rows.map((c, i) => step(prizeRow(c, i, prizes[i]), i))))
      : empty('No prize places yet', 'The board fills as player creatures collect their first ratings.'),
    /* Two short lines, not two hundred characters of qualification. The reason
       the two ranks differ now rides on the season rank badge itself and on the
       footer's own word, where the conflict is actually read. */
    h('div.lad-foot-note',
      h('div', 'Only player creatures take prizes.'),
      h('div', 'House creatures hold a set rating and are shown for scale.')));
}

function prizeRow(c, i, prize) {
  /* One notation for ranks across the whole product: a rank is written with a
     `#`, here as in the standings, the chrome chip and the footer. The two
     numbers this screen holds are told apart by their labels — RANK over this
     column, ARENA RANK in the footer — and by the footnote under the table. */
  const place = c.rank || i + 1;
  const me = board?.me || null;
  const mine = !!(me && c.id === me.id);
  return h('button.row.prize-grid.prize-row', {
    type: 'button',
    class: mine ? 'is-me' : '',
    onclick: () => ctxRef.go(`/creature/${c.id}`),
  },
  h('div.lad-id.prize-id',
    mark(c, '', { body: mine }),
    /* The badge carries its own reason: this is where a reader meets `#3` on
       the board and `#4` in the bar below, so this is where the sentence that
       reconciles them has to be reachable. Focus is not taken — the row is
       already the tab stop — so the sentence reaches a screen reader as part
       of the row's name instead.

       The top three wear the podium's gem, so a reader switching segments
       meets the same three metals for the same three places. */
    attachTooltip(h('span.rank-badge', {
      class: place <= 3 ? `has-gem r${place}` : 'plain',
      'aria-label': `Season rank ${place}. ${SEASON_RANK_TIP.body}`,
      onclick: (e) => { e.preventDefault(); e.stopPropagation(); },
    }, rankGem(place, 14), rankNum(place)), SEASON_RANK_TIP)),
  h('div.lad-who',
    h('div.lad-line', h('span.name', nameOf(c)), youChip(mine), houseChip(c)),
    /* The phone hides the rating column, so the meta line carries it — the
       prize is already at the right of the row and does not want saying
       twice. */
    metaLine(c, num(c.rating), '', 'rating')),
  h('div.lad-mind', mindBadge(c.model, { mode: false })),
  h('div.v.r.lad-record', record(c)),
  h('div.v.r.lad-rating', num(c.rating)),
  h('div.v.r.prize-coins', prize != null ? `${num(prize)} coins` : '—'));
}

/* ── sticky footer: where am I ───────────────────────────────────────────── */

/*
 * THE DOCK EARNS THE FLOOR BY BEING SCROLLED TO, NOT BY BEING LOADED.
 *
 * `.lad-dock` stays pinned to the screen's bottom edge for as long as there is
 * more table below the fold (`ui/screens/ladder.css`), which is what lets it
 * answer "where am I" without the reader hunting for it — but on a laptop
 * (720 px) or a phone (844 px) the podium alone already reaches far enough
 * down the first frame that the pin's own footprint lands on the FIRST
 * standings row before the reader has touched the page. That is not a case of
 * the header needing to be a fixed number of pixels shorter: the table is
 * dozens of rows long at every width this screen supports, the pin is exactly
 * as tall as one row, and a table longer than the screen ALWAYS has some row
 * sitting at the bottom edge — trimming the header only changes which row
 * that is, never removes it. `dock-seen` is the flag that answers the
 * question the layout actually turns on: has this reader scrolled past the
 * podium at all. It lives on the screen root, which survives every repaint
 * and every CREATURES ↔ MINDS ↔ SEASON swap, so the fade never has to be
 * re-armed by hand — only re-armed to OFF when a swap hands the reader a
 * fresh top of a different table.
 */
function syncDockSeen() {
  if (!rootRef) return;
  rootRef.classList.toggle('dock-seen', rootRef.scrollTop > 16);
}

/** My place on the prize board, which counts player creatures alone. */
function seasonRankOfMe(me) {
  const rows = board?.prizeBoard || [];
  const i = rows.findIndex((c) => c.id === me.id);
  return i < 0 ? null : (rows[i].rank || i + 1);
}

function footer() {
  const me = board?.me || null;
  if (!me) return null;
  const pctile = board?.percentile;
  /* THE TWO RANKS, RECONCILED WHERE THEY COLLIDE. On SEASON the board above
     shows `#5` and this bar shows `#8` for one creature, six rows apart. Both
     are true and each counts a different field, so on that segment the bar
     says both — labelled — instead of leaving the contradiction to a tooltip. */
  const seasonRank = section === 'season' ? seasonRankOfMe(me) : null;

  let delta;
  if (seasonRank != null && seasonRank !== me.rank) {
    delta = h('div.f-delta.f-scope',
      h('span.num', rankNum(seasonRank)),
      h('span.f-word', 'among player creatures'));
  } else if (rankDelta != null && rankDelta !== 0) {
    delta = h('div.f-delta', { class: rankDelta > 0 ? 'up' : 'down' },
      icon(rankDelta > 0 ? 'arrow-up' : 'arrow-down', 14),
      h('span.num', String(Math.abs(rankDelta))),
      h('span.f-word', rankDelta > 0 ? 'up since last visit' : 'down since last visit'));
  } else {
    /* ONE PERCENTILE, ONE SENTENCE. The creature page's rank tile writes
       `Top 17%` for this figure; this bar wrote `Stronger than 83%` — the
       complement of the same number, one screen away. The long sentence still
       lives in the rank tooltip, where there is room for it. */
    delta = h('div.f-delta', pctile != null
      ? `Top ${Math.max(1, 100 - Math.round(pctile))}%`
      : 'Your place in the arena');
  }

  const rankWord = seasonRank != null && seasonRank !== me.rank && board?.total != null
    ? `among all ${num(board.total)}`
    : 'arena rank';

  /* THE DOCK IS WHAT TOUCHES THE BOTTOM OF THE SCREEN, not the pill.
     A pill stuck 32 px up left a sliver of the next row showing underneath it
     on desktop and a whole legible row in the gap above the tab bar on a
     phone. The dock is the sticky box: its bottom edge is the viewport's (or
     the tab bar's), its lower band is opaque, and the pill floats inside it. */
  return h('div.lad-dock',
    h('div.lad-foot.glass.strong',
      delta,
      /* ARENA RANK, spelled out and explained — and where the prize board
         beside it quotes a different place for the same creature, the word
         says which field this one counts, in numbers the reader can see. Two
         labelled numbers are two facts; two bare ones are a contradiction. */
      h('div.f-rank.num', me.rank != null ? rankNum(me.rank) : '—',
        attachTooltip(h('span.f-word.f-why', {
          tabindex: '0',
          'aria-label': `Arena rank. ${ARENA_RANK_TIP.body}`,
        }, rankWord), ARENA_RANK_TIP)),
      h('div.f-name', nameOf(me)),
      /* `mmr` beside the number, not `rating`: the chrome chip on this same
         screen writes `1,564 MMR` for the identical figure, and one number
         cannot carry two units eight hundred pixels apart. */
      h('div.f-rating.num', num(me.rating), h('span.f-word', 'mmr')),
      h('a.btn.small.f-view', { href: '#/creature' }, 'View')));
}
