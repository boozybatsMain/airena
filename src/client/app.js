/**
 * The shell: routes, chrome, session, one persistent battle layer.
 *
 * Hash routes: the product lives inside the GENEX iframe and a hash survives
 * both `src` substitution and missing rewrite rules. `?m=` and the bare
 * `/worker` path are accepted as aliases.
 *
 * The battle layer (#arena) is never unmounted. Screens cross-fade over it.
 */

export const marks = { t0: performance.now() };
export const mark = (k) => { marks[k] = Math.round(performance.now()); return marks[k]; };
if (typeof window !== 'undefined') window.__airenaMarks = marks;

import { post, track } from './lib/api.js';
import { $, h, mount, wait } from './lib/dom.js';
import { store, set, on, refreshSession, snapshotBefore } from './lib/store.js';
import { num, rank as rankStr, dhm, clock, latinOnly } from './lib/format.js';
import { icon } from './ui/icons.js';
import { mindInfo } from './ui/mind.js';
import { claimSilently, startPlatformIdentity } from './lib/platform.js';

import * as live from './screens/live.js';
import * as create from './screens/create.js';
import * as birth from './screens/birth.js';
import * as creature from './screens/creature.js';
/* NOT `history`: a module binding by that name shadows `window.history` for the
   whole file, and every `history.replaceState` / `history.back()` below then
   calls a method a namespace object does not have. It did: `?m=<id>`, the bare
   `/worker` path and the redirect into `#/birth/:id` all threw before the first
   render, and the app booted to a blank page. */
import * as historyScreen from './screens/history.js';
import * as ladder from './screens/ladder.js';
import * as worker from './screens/worker.js';
import * as fatal from './screens/fatal.js';

const SCREENS = { live, create, birth, creature, history: historyScreen, ladder, worker };

/**
 * WHAT THIS PAGE IS CALLED — in the tab, in a bookmark, and out loud.
 *
 * A hash router changes the page without changing the document, so the tab said
 * `AIRENA — living machines, endless battles` on all seven screens: a player
 * with the arena open beside their work had one indistinguishable tab, a
 * bookmark of their own creature came back named after the product, and a
 * screen reader was told nothing at all when the whole page under it was
 * replaced. The names are the ones the navigation uses, so the tab, the rail
 * and the announcement all say the same word.
 */
const TITLES = {
  live: 'Live', create: 'Create a creature', birth: 'Creating life',
  creature: 'Creature', history: 'History', ladder: 'Ladder', worker: 'Worker',
};

// ── routes ─────────────────────────────────────────────────────────────────

/** [pattern, resolver → { screen, nav, args, ground }] */
const ROUTES = [
  [/^\/live$/, () => ({ screen: 'live', nav: 'live', ground: 'none' })],
  [/^\/watch\/([\w-]+)$/, (m) => ({ screen: 'live', nav: null, args: { matchId: m[1] }, ground: 'none' })],
  /*
   * CREATE AND BIRTH LIGHT `LIVE`, NOT NOTHING.
   *
   * `nav` is where the player STANDS, and a stranger's first screen stood
   * nowhere: four dots, none of them filled, two of them dimmed, on the one
   * screen the shell sends a visitor to first. Both of these are the live
   * branch — the arena itself runs behind them (`ground: veil`), and while a
   * generation is queued or running `#/live` resolves to `#/birth/:id`, so on
   * Birth the lit dot is literally the page that rail item leads to.
   */
  [/^\/create$/, () => ({ screen: 'create', nav: 'live', ground: 'veil' })],
  [/^\/birth\/([\w-]+)$/, (m) => ({ screen: 'birth', nav: 'live', args: { jobId: m[1] }, ground: 'veil' })],
  [/^\/creature$/, () => ({ screen: 'creature', nav: 'creature', args: { id: 'me' }, ground: 'stage' })],
  [/^\/creature\/([\w-]+)$/, (m) => ({ screen: 'creature', nav: 'creature', args: { id: m[1] }, ground: 'stage' })],
  [/^\/history$/, () => ({ screen: 'history', nav: 'history', args: {}, ground: 'stage' })],
  [/^\/history\/([\w-]+)$/, (m) => ({ screen: 'history', nav: 'history', args: { matchId: m[1] }, ground: 'stage' })],
  [/^\/ladder$/, () => ({ screen: 'ladder', nav: 'ladder', args: { section: 'creatures' }, ground: 'stage' })],
  [/^\/ladder\/(minds|season|creatures)$/, (m) => ({ screen: 'ladder', nav: 'ladder', args: { section: m[1] }, ground: 'stage' })],
  [/^\/worker$/, () => ({ screen: 'worker', nav: null, ground: 'stage' })],
];

/** Old addresses keep working: bookmarks, share links, the worker doc. */
const ALIASES = [
  [/^\/arena$/, () => '/live'],
  [/^\/new$/, () => '/create'],
  [/^\/new\/([\w-]+)$/, (m) => `/birth/${m[1]}`],
  [/^\/tactics\/([\w-]+)$/, (m) => `/history/${m[1]}`],
  [/^\/creature\/me$/, () => '/creature'],
  [/^\/ladder\/models$/, () => '/ladder/minds'],
];

function defaultPath() {
  const s = store.session;
  return (s?.creature || s?.job) ? '/live' : '/create';
}

/** `#/live?ui=vs` → { path: '/live', ui: 'vs' } */
function parseHash() {
  let raw = location.hash.replace(/^#/, '');
  let ui = null;
  const q = raw.indexOf('?');
  if (q >= 0) { ui = new URLSearchParams(raw.slice(q + 1)).get('ui'); raw = raw.slice(0, q); }
  if (!raw || raw === '/') raw = defaultPath();
  for (const [re, fn] of ALIASES) { const m = raw.match(re); if (m) { raw = fn(m); break; } }
  for (const [re, fn] of ROUTES) {
    const m = raw.match(re);
    /* Once. The resolvers are pure today, and `fn(m)` twice is one impure
       resolver away from a route whose `args` belong to a different object
       than the rest of it. */
    if (m) { const r = fn(m); return { ...r, args: r.args || {}, path: raw, ui }; }
  }
  return { screen: 'live', nav: 'live', args: {}, path: '/live', ground: 'none', ui };
}

export function go(path, { replace = false } = {}) {
  const next = `#${path}`;
  if (location.hash === next) { render(); return; }
  /* `window.` is spelled out: this file also imports a screen module called
     history, and the two must never be confused again. */
  if (replace) { window.history.replaceState(null, '', next); render(); } else location.hash = next;
}

// ── render ─────────────────────────────────────────────────────────────────

let current = null;      // { screen, el, mod }
let rendering = null;
/**
 * THE LATEST NAVIGATION OWNS THE SHELL.
 *
 * The queue below is strictly serial, and it used to serialise only the
 * MOUNTING: `store.route`, `body[data-screen]`, `body[data-ground]`, the
 * viewer's `.doc` flag and the chrome were written by every render the moment
 * it was called, i.e. by all of them, in call order, while the first one was
 * still entering its screen. Three rail clicks inside one 620 ms cross-fade
 * therefore left `body[data-ground="none"]` — Live's ground — while ladder.js
 * was mounting, and `ui/base.css` hides `#hud` only for the stage and veil
 * grounds: the ladder's table drew over the raw 3D arena with both fighter
 * panels and the row of ability tiles showing through it, and the rail's lit
 * dot named a page that was not on screen.
 *
 * One counter fixes both halves. Every render takes a ticket, the writes move
 * inside the serialised body so they land in mounting order, and a render whose
 * ticket has been superseded while it waited drops out before it can touch
 * anything: the player asked for a different page, and this one is answering a
 * question nobody is still asking.
 */
let navSeq = 0;

async function render() {
  const r = parseHash();
  const seq = ++navSeq;
  /* debug state comes from the address, once per navigation. A local, because
     the redirect below reads it before the store is allowed to hear about it. */
  const debug = r.ui || new URLSearchParams(location.search).get('ui') || null;

  /* a running generation owns Live and Create */
  const job = store.session?.job;
  if (job && (job.state === 'queued' || job.state === 'running')
      && (r.screen === 'live' && !r.args.matchId || r.screen === 'create')
      && !debug) {
    go(`/birth/${job.id}`, { replace: true });
    return;
  }

  const scr = $('#screen');
  /**
   * WHAT IS ON SCREEN, SAID ONCE.
   *
   * Everything here describes the route the player is looking at, so it runs
   * where the screen is actually installed — inside the serialised body — and
   * on the sub-navigation path, which installs nothing.
   */
  const publish = () => {
    set({ debug });
    set({ route: r });
    document.body.dataset.screen = r.screen;
    document.body.dataset.ground = r.ground || 'none';
    /*
     * THE ARENA KEEPS DRAWING UNDER THE FADE.
     *
     * `.doc` is the viewer's own saving: `src/viewer/main.js` returns early
     * from its draw while it is set. Toggled here, in one frame, it froze the
     * fight on its last frame for the whole 600 ms cross-fade into a document
     * screen — and the way back was worse, because the class came off at frame
     * zero and the arena snapped from a seconds-stale still to the live
     * simulation while the backdrop was still fading out over it. So it is
     * dropped at once on the way TO the arena and added only in the `finally`,
     * once the document that hides the arena is opaque.
     */
    if (r.ground !== 'stage') scr.classList.remove('doc');
    paintChrome();
    announce(r);
  };

  /* Serialised, not "await whatever is in flight".
   *
   * `if (rendering) await rendering` re-checks nothing. A third render() that
   * awaited the same promise as the second resumes with the guard already
   * cleared for both, and two IIFEs then run at once: `prev.mod.leave()` fires
   * on the screen the other one has just installed as `current` while its
   * `enter()` is still pending, both append a `.screen` to `#screen`, and the
   * later `finally` removes the wrong element. Three rail clicks inside the
   * 620 ms cross-fade were enough to reach it. `while` re-reads the guard on
   * every resume, so the queue is strictly serial; the `catch` is there so one
   * render that somehow rejects cannot wedge the queue shut forever. */
  while (rendering) { try { await rendering; } catch { /* handled by its own render */ } }
  /* Superseded while it waited: the player has already asked for something
     else, and mounting this one would only be a page to tear down again. */
  if (seq !== navSeq) return;

  /*
   * SUB-NAVIGATION IS NOT A PAGE LOAD (§1.8).
   *
   * `#/history` → `#/history/:id` and `#/ladder` → `#/ladder/minds` are route
   * changes, and a route change meant `leave()`, a fresh `.screen` element and
   * `enter()`: opening one fight cross-dissolved the entire career for 600 ms,
   * re-dealt thirty rows, re-fetched the history past the cache's 30 s, and did
   * it all again on Esc — while the segmented control the player had just
   * pressed faded out under their pointer and the two titles ("Ladder" over
   * "Minds") superimposed mid-fade.
   *
   * A screen that can move between its own states says so by exporting
   * `update(args, ctx)`, and returns `false` when it cannot take a particular
   * one. `screens/history.js` was written against this hook and carried a
   * comment saying app.js might not have it yet. It does now.
   *
   * It is asked AFTER the queue, not before it: `current` is assigned the
   * moment a screen starts entering, so a check ahead of the gate could hand a
   * route to a module whose `enter()` has not finished building its state.
   */
  if (current && current.screen === r.screen && current.mod.update) {
    publish();
    let took = false;
    try { took = current.mod.update(r.args, ctx) !== false; } catch (e) { console.error(e); }
    if (took) { track('tab_view', { tab: r.screen }); return; }
  }

  rendering = (async () => {
    publish();
    const prev = current;
    /* The route is published FIRST: `screens/history.js` reads it in `leave()`
       to tell "the panel closed" from "the reader left the career". */
    if (prev && prev.mod.leave) { try { prev.mod.leave(); } catch (e) { console.error(e); } }

    const el = h('div.screen.entering', { dataset: { screen: r.screen } });
    $('#screen').appendChild(el);
    current = { screen: r.screen, el, mod: SCREENS[r.screen] };

    /*
     * THE CROSS-FADE STARTS WHEN THE SCREEN HAS SOMETHING TO SHOW.
     *
     * Both halves of it used to live in the `finally` below, i.e. after
     * `enter()` had RESOLVED — and `#screen > .screen.entering` is
     * `opacity: 0`. So every skeleton in the client was dead code: create.js
     * painted four mind placeholders, ladder.js a podium and ten rows, and
     * worker.js its "asking for a code" card into an element nobody could see.
     * The player watched the old screen for the whole request and then got the
     * new one complete — the `page → loading → page` cut §1.8 forbids, on
     * every navigation.
     *
     * The trigger is the screen's FIRST CHILD, not a fixed moment. A screen
     * that mounts a shell before its first `await` (ladder, create, worker) is
     * revealed two frames later with the shell on glass, which is the whole
     * point of having one. A screen that still fetches before it mounts
     * anything (creature.js, history.js) would otherwise be revealed EMPTY —
     * a blank arena where the old page was, which is worse than the cut — so
     * it is held until its first node arrives, and it starts behaving like the
     * others the day it grows a shell of its own. `finally` reveals whatever
     * is left, so a screen that mounts nothing at all still cannot get stuck
     * invisible.
     *
     * The outgoing screen leaves on the same signal: fading it out before its
     * replacement has drawn is the blank frame by another route.
     */
    let leaving = null;
    let shown = false;
    let watch = null;
    const reveal = () => {
      if (shown) return;
      shown = true;
      if (watch) { watch.disconnect(); watch = null; }
      /*
       * A FLUSH, NOT A FRAME.
       *
       * The class this drops is what makes the screen visible
       * (`#screen > .screen.entering { opacity: 0 }`), and it used to be
       * dropped inside a double `requestAnimationFrame` with nothing behind it.
       * Two frames were needed because a rAF callback runs BEFORE the style and
       * paint of its own frame — but a chain of frame callbacks is not a
       * promise: a throttled tab, a busy compositor or a headless browser can
       * simply stop advancing it, and four of the fifty-six captures recorded
       * `class="screen entering"` still on seconds after mount. They are
       * readable only because a debug override forces opacity on `?ui=` states;
       * in a player's browser the arena would have been there and every word,
       * orbit and card of the screen at zero.
       *
       * Reading `offsetWidth` flushes style and layout synchronously, which is
       * exactly what those two frames were for: `opacity: 0` becomes the
       * computed starting value, the class comes off in the same tick, and the
       * 600 ms transition runs with no dependence on a frame ever arriving. The
       * timer behind it is belt and braces for an environment that manages to
       * coalesce even that.
       */
      void el.offsetWidth;
      el.classList.remove('entering');
      setTimeout(() => el.classList.remove('entering'), 120);
      if (prev) {
        /* Visually the outgoing screen is gone at once; without `aria-hidden`
           a screen reader spends those 620 ms reading a document that is no
           longer the page. */
        prev.el.setAttribute('aria-hidden', 'true');
        prev.el.classList.add('leaving');
        /*
         * TEARDOWN IN TWO PHASES.
         *
         * `leave()` runs at frame zero and stops the screen's clocks; anything
         * the reader can still SEE has to outlive the fade. A screen that owns
         * three-dimensional bodies or a standing card says so by exporting
         * `dispose()`, and it is called here — after the 620 ms — so a portrait
         * is not deleted one frame into its own dissolve. The birth reveal was
         * the worst of them: the creature the player had just made vanished
         * before the card carrying it had begun to fade.
         */
        leaving = wait(620).then(() => {
          try { prev.mod.dispose?.(); } catch (e) { console.error(e); }
          prev.el.remove();
        });
      }
    };
    if (el.firstChild) reveal();
    else { watch = new MutationObserver(reveal); watch.observe(el, { childList: true }); }

    /* Whatever `enter()` does — succeed, fail, or bail out into the fatal card
       — the new screen has to become visible and the old one has to go. An
       early `return` here once left the incoming screen at opacity 0 and the
       outgoing one attached forever, so dismissing the fatal card revealed a
       frozen dead screen. Hence `finally`. */
    try {
      await current.mod.enter(el, r.args, ctx);
    } catch (e) {
      if (e?.code === 'offline') {
        fatal.show('offline');
      } else {
        console.error(e);
        mount(el, h('div.doc', h('div.doc-inner', h('div.empty',
          h('div.hd', 'This screen could not load'),
          h('div.t-small', latinOnly(e?.message) || 'The server did not answer.'),
          h('button.btn', { onclick: () => render() }, 'Try again')))));
        track('error_shown', { code: e?.code || 'render', screen: r.screen });
      }
    } finally {
      reveal();
      if (leaving) await leaving;
      /* The document is opaque now, so the arena may stop drawing behind it —
         and only if this route is still the one on screen. */
      if (store.route === r && r.ground === 'stage') scr.classList.add('doc');
    }
    /* The SCREEN, not the rail indicator: `nav` became a "where you stand"
       marker the day Create and Birth started lighting LIVE, and the funnel
       must keep counting create screens as create screens. */
    track('tab_view', { tab: r.screen });
  })();
  try { await rendering; } finally { rendering = null; }
}

const ctx = { go, store, refreshSession, set, on };

/**
 * The tab's name, and — once per screen, not once per route — the announcement.
 *
 * `#screen` is a `main` landmark whose entire contents are replaced without a
 * document load, and nothing told a screen reader it had happened. The polite
 * region in `index.html` does, in the same words the rail uses. Sub-navigation
 * inside one screen (a fight opening over the career, a ladder tab) is the
 * screen's own business and stays silent here: the panel takes focus itself,
 * and re-reading "History" over it would be noise on top of an answer.
 */
/* NOT `name`: a module-scope binding by that name shadows `window.name` for
   the whole file, which is the same trap the `history` import above documents. */
let saidScreen = null;
function announce(r) {
  const n = (r.screen === 'live' && r.args?.matchId) ? 'Replay' : (TITLES[r.screen] || 'Airena');
  const title = `${n} · AIRENA`;
  if (document.title !== title) document.title = title;
  if (saidScreen === r.screen) return;
  saidScreen = r.screen;
  const say = $('#say');
  if (say) say.textContent = n;
}

// ── chrome ─────────────────────────────────────────────────────────────────

const NAV = [
  ['live', 'Live', '/live'],
  ['creature', 'Creature', '/creature'],
  ['history', 'History', '/history'],
  ['ladder', 'Ladder', '/ladder'],
];

/** `▲24` / `▼21` — the same delta glyph the away card and the VS card use. */
const driftGlyph = (n) => `${n < 0 ? '▼' : '▲'}${num(Math.abs(Math.round(n)))}`;

/** SEASON 01 / 36 PLAYER CREATURES / 18D 04H 12M — §4.1, three lines. */
function seasonLines(s) {
  return {
    k: `Season ${String(s?.season?.n || 1).padStart(2, '0')}`,
    /* "36 creatures" sat 150 px above the ladder's own "62 CREATURES · 36 FROM
       PLAYERS": one word, two counts, one screen. This one counts players'. */
    v: s?.world?.creatures != null ? `${num(s.world.creatures)} player creatures` : '',
    t: s?.season?.endsAt ? dhm(s.season.endsAt - Date.now()) : '',
  };
}

/**
 * `?ui=empty` NAMES TWO DIFFERENT EMPTINESSES, AND THE SHELL BELIEVED ONE.
 *
 * On Creature it is a visitor with nothing — `No creature yet` — and the
 * corner's `CREATE A CREATURE →` is exactly right. On History it is the
 * OWNER's first hour: `screens/history.js` stands up a fresh creature
 * (CROCODILE, 1,200, no fights) for the capture and never patches the session,
 * so history-empty.png reads `CAREER / CROCODILE / 0 FIGHTS` under a corner
 * still offering to make the creature the page is about. A shell and a screen
 * disagreeing about whether the player owns anything is not the "plausible
 * data" §10 asks for. The same fresh creature, resolved once here so the
 * corner, the rail's dimmed items and `chromeShape()` all read it.
 */
const DEBUG_FRESH = { id: 'demo', name: 'CROCODILE', rating: 1200, rank: null };
const myCreature = (s = store.session, r = store.route) =>
  s?.creature || (store.debug === 'empty' && r?.screen === 'history' ? DEBUG_FRESH : null);

/**
 * `#782 · 1,214 RATING ▲24` — the middot is drawn by CSS, the delta is a span.
 *
 * ONE NOUN FOR ONE NUMBER (§9.1). This line said `MMR` while the creature page
 * two clicks away labelled the identical figure `RATING`, and the ladder wrote
 * `RATING` at the head of a column whose sticky footer said `MMR`. Two words
 * for one quantity is two products sharing a chrome; `RATING` is the kit's word
 * and now the only one.
 */
function meLines(s, c = myCreature(s)) {
  if (!c) return null;
  const drift = s?.since?.ratingDrift;
  return {
    n: c.name || '—',
    parts: [
      c.rank != null ? h('span', rankStr(c.rank)) : null,
      h('span', `${num(c.rating)} RATING`),
      drift ? h('span', { class: `d ${drift < 0 ? 'down' : ''}`.trim() }, driftGlyph(drift)) : null,
    ].filter(Boolean),
  };
}

/**
 * A FIRST CREATURE IS ON ITS WAY.
 *
 * The corner belongs to the player's own standing, and for the three to six
 * minutes of a first generation the player has none. The shell answered that
 * with `Create a creature →` — the very thing they had just done — over a
 * screen that says CREATING LIFE, and pressing it round-trips through the
 * redirect in `render()` straight back into the same wait. It reads as a
 * failed submit. So the corner says what is happening and keeps the clock the
 * birth screen keeps.
 *
 * ONE debug state photographs the wait, and only that one. `?ui=birth-wait`
 * freezes the same clock `screens/birth.js` freezes, so the capture is
 * deterministic and the corner agrees with the screen under it. The other
 * three do not: `birth-reveal` shows a finished, named creature and
 * `birth-failed`/`birth-failed-charged` say IT DID NOT TAKE SHAPE, and all
 * three shipped with `BEING BORN 01:38` in the corner because the guard was
 * `/^birth-/`. §10 asks a debug state to render plausible data; a chip
 * counting up towards a birth that has already happened, or already failed, is
 * the shell contradicting the screen.
 *
 * → { frozen } | { started } | null
 */
function bornClock(s) {
  if (String(store.debug || '') === 'birth-wait') return { frozen: birth.BIRTH_FREEZE_CLOCK };
  if (s?.creature) return null;
  const j = s?.job;
  if (j && (j.state === 'queued' || j.state === 'running')) return { started: j.createdAt || Date.now() };
  return null;
}

const bornText = (b) => (b?.frozen || clock(((Date.now() - (b?.started || Date.now())) / 1000)));

/**
 * The SHAPE of the chrome, as a string. Anything not in it is a string or a
 * class the repaint below can rewrite in place.
 *
 * The current tab is deliberately NOT part of it. It was, and the shape
 * therefore changed on every navigation — so the whole bar, four inline SVGs
 * included, was rebuilt four times a minute of ordinary browsing, which is the
 * churn the comment on `paintChrome()` says it exists to avoid. It also meant
 * the rail indicator could never animate: the `.dot::after` that grows into
 * the active item transitions only if the element it is on survives the click.
 */
function chromeShape(s, r) {
  const job = s?.job?.state;
  const c = myCreature(s, r);
  return [
    c ? c.id : '-',
    c?.icons?.[0] || '-',
    r?.screen === 'live' && r?.args?.matchId ? 'back' : '-',
    job === 'queued' || job === 'running' ? 'job' : '-',
    s?.season ? 'season' : '-',
    s?.since?.ratingDrift ? 'drift' : '-',
    /* The corner answers the route as well as the session: on Create the
       primary CTA is the screen the player is already reading, and it goes. */
    bornClock(s) ? 'born' : '-',
    r?.screen === 'create' ? 'create' : '-',
    /* Whether the arena's pulse EXISTS is a shape question — the chip is only
       built when there is a number to put in it — and it was not asked, so a
       stranger who opened Create in a quiet minute never saw the chip appear
       when the arena woke up. Only its presence lives here; the number itself
       is a string `tickChrome()` rewrites. */
    s?.world?.matchesToday ? 'today' : '-',
  ].join('|');
}

let chromeShapeNow = null;

/**
 * Rebuild only when the shape changed; otherwise repaint four strings.
 *
 * This used to `mount()` the whole bar — wordmark, four rail links with four
 * inline SVGs, both chips — on every `session` emit, and the session is
 * re-read every 20 s with the season clock on its own 60 s timer. Twice a
 * minute any focus ring on the `+` and any open hover state were destroyed,
 * and four SVGs were rebuilt to move a clock by one minute. ladder.js already
 * knew better: its `tick()` rewrites two strings. So does this.
 */
function paintChrome() {
  const root = $('#chrome');
  const s = store.session;
  const r = store.route;
  const shape = chromeShape(s, r);
  if (shape === chromeShapeNow && root.firstChild) { tickChrome(); return; }
  chromeShapeNow = shape;

  /* The staged arrival (`ui/chrome.css`, `.intro`) plays once, on the first
     build. The chrome is rebuilt again whenever its shape changes — a creature
     is born, a replay opens a back button — and a shell that re-introduces
     itself mid-session reads as a flicker. */
  const first = !root.dataset.lit;
  if (first) {
    root.dataset.lit = '1';
    root.classList.add('intro');
    setTimeout(() => root.classList.remove('intro'), 1400);
  }

  const c = myCreature(s, r);
  const has = !!c;
  const me = meLines(s, c);
  const sl = s?.season ? seasonLines(s) : null;
  const born = bornClock(s);
  /* A visitor standing ON Create does not need a button that opens Create. */
  const onCreate = r?.screen === 'create';
  const today = s?.world?.matchesToday || 0;

  mount(root,
    /* Six letters, six elements: both references print the mark with A, R and
       the last A at full ink and I, E, N stepped back, so the sign reads as a
       worn one and the eye finds ARENA inside AIRENA. Which letters and how far
       is a visual decision and lives in `ui/chrome.css`; `aria-label` above
       keeps the accessible name one word. */
    h('a.wordmark', { href: '#/live', 'aria-label': 'Airena' },
      h('div.mark', [...'AIRENA'].map((c) => h('span', c))),
      h('div.tag', 'Living machines', h('br'), 'Endless battles')),

    /* The dot is the desktop rail's indicator; the icon is what a phone shows.
       Both are rendered and CSS picks one — four identical empty rings in a tab
       bar name nothing. `aria-current` says which item is the current page,
       which a class alone never told a screen reader. */
    /* `tabindex="-1"` is where the skip link lands: focusable by script,
       never a tab stop of its own. */
    h('div.rail', { tabindex: '-1' }, NAV.map(([id, label, path]) => {
      const dim = (id === 'creature' || id === 'history') && !has;
      return h('a', {
        href: `#${path}`,
        /* `data-nav` is what `tickChrome()` matches the current route against,
           so the active item is a class the same element keeps across a
           navigation rather than a new element built on every click. */
        dataset: { nav: id },
        class: `${r?.nav === id ? 'on' : ''} ${dim ? 'dim' : ''}`.trim(),
        'aria-current': r?.nav === id ? 'page' : null,
        title: dim ? 'Empty until you create a creature' : null,
      }, icon(id, 18), h('span.dot'), h('span.lbl', label));
    })),

    sl ? h('div.season', h('div.k', sl.k), h('div.v', sl.v), h('div.v.t', sl.t)) : null,

    /*
     * THE CORNER, IN FOUR STATES — and it is the same 52 px chip in all of
     * them, so the shell does not change material as the player crosses the
     * first hour: the arena's pulse → the wait → their own creature.
     *
     *   a creature        the card: name, rank, rating, drift
     *   being born        BEING BORN over the elapsed clock (quiet glass)
     *   on Create         the arena's pulse — the one fact a stranger deciding
     *                     what to describe can use, and not a second CTA
     *   anywhere else     `Create a creature →`, which is the whole product
     */
    h('div.me',
      /* The wait comes FIRST: `bornClock()` answers only when the player has no
         creature yet (or a capture is photographing that hour), and the card
         below would otherwise win on a stand whose session owns one. */
      /* `role="status"` announces the chip once, when it appears; the clock is
         hidden from it, because a live region that rewrites itself every second
         reads the same two words to a screen reader for six minutes. */
      born ? h('div.card-me.born.glass', { role: 'status' },
        h('div.thumb', h('span.spark', { 'aria-hidden': 'true' })),
        h('div.lines', h('div.n', 'Being born'),
          h('div.s', h('span.t', { 'aria-hidden': 'true' }, bornText(born)))))
        : me ? h('a.card-me.glass', { href: '#/creature', title: 'Your creature' },
          h('div.thumb', c.icons?.[0] ? h('img', { src: c.icons[0], alt: '' }) : icon('creature', 22)),
          h('div.lines', h('div.n', me.n),
            h('div.s', { dataset: { v: me.parts.map((el) => el.textContent).join('|') } }, me.parts)))
        : onCreate ? (today ? h('div.card-me.pulse.glass',
          h('div.thumb', icon('live', 20)),
          h('div.lines', h('div.n', `${num(today)} fights`), h('div.s', h('span', 'in the arena today')))) : null)
        : h('a.btn.primary', { href: '#/create' }, 'Create a creature', icon('arrow-right')),
      /* The `+` opens Create too, so it goes with the button on Create — and
         it has nothing to add while a creature is still being made. */
      /* `s?.job`, not `s.job`: the creature can now come from the debug shim
         above while the session itself is still null on the first paint. */
      c && !onCreate && !born && !(s?.job && (s.job.state === 'queued' || s.job.state === 'running'))
        ? h('a.btn.icon.plus', { href: '#/create', title: 'Create a new creature', 'aria-label': 'Create a new creature' }, icon('plus'))
        : null),

    r?.args?.matchId && r.screen === 'live'
      ? h('button.btn.small.back', { type: 'button', onclick: () => (window.history.length > 1 ? window.history.back() : go('/history')) }, icon('arrow-left'), 'Back')
      : null,

    /* screen.png closes the left column with a credo under the rail and a
       version under that. Without them the column is a third of a page of
       navigation and two thirds of nothing, and the composition has only one
       edge. Three lines, as the reference breaks them: the single "A" is what
       gives the block its shape against the rail above it.
       The number is the product's own (`package.json`), and it is the last
       thing on the page for the same reason it is the last thing on the
       reference — it dates the arena rather than labelling it. */
    h('div.credo', { 'aria-hidden': 'true' },
      h('div.c', 'A', h('br'), 'new kind', h('br'), 'of life'),
      h('div.v', 'v0.1')));

  /* The corner is the one part of the shell that changes state while the
     player watches — the pulse becomes the wait, the wait becomes their
     creature — and a swap in one frame reads as a repaint. 320 ms of the same
     arrival the chrome uses on boot says it is the same object, changed. */
  if (!first) root.querySelector('.me')?.classList.add('swap');
}

/** The volatile half: the current tab, a clock, a population, a name, a rating line. */
function tickChrome() {
  const root = $('#chrome');
  const s = store.session;
  if (!root) return;

  /* Which of the four is the page. A class on an element that outlives the
     click, so the dot's fill grows into place over `--d-ui` instead of being
     replaced mid-transition by a freshly built anchor. */
  const nav = store.route?.nav || null;
  for (const a of root.querySelectorAll('.rail a')) {
    const on = a.dataset.nav === nav;
    a.classList.toggle('on', on);
    if (on) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }

  const season = root.querySelector('.season');
  if (season && s?.season) {
    const l = seasonLines(s);
    const k = season.querySelector('.k');
    const v = season.querySelector('.v:not(.t)');
    const t = season.querySelector('.v.t');
    if (k && k.textContent !== l.k) k.textContent = l.k;
    if (v && v.textContent !== l.v) v.textContent = l.v;
    if (t && t.textContent !== l.t) t.textContent = l.t;
  }

  /* One second, and only while the chip is on screen: the elapsed clock is the
     only moving number in the shell that is not the season's minute hand. */
  const bc = root.querySelector('.me .born .s .t');
  if (bc) {
    const b = bornClock(s);
    const t = b ? bornText(b) : null;
    if (t && bc.textContent !== t) bc.textContent = t;
  }

  /* The arena's pulse on Create — `N fights in the arena today`. `.pulse` is a
     `div`, so the `a.card-me` branch below never reached it and the number was
     frozen at whatever it was on the first paint of the screen: a chip that
     reports the arena is alive, reporting a minute that has passed. */
  const pulse = root.querySelector('.me .pulse .n');
  if (pulse) {
    const today = `${num(s?.world?.matchesToday || 0)} fights`;
    if (pulse.textContent !== today) pulse.textContent = today;
  }

  const me = meLines(s);
  /* `a.card-me`, not `.card-me`: the wait and the pulse wear the same chip
     class, and a plain `.card-me` here rewrote the BEING BORN chip's two lines
     with the creature's name and rating the moment the session ticked. Only
     the creature's card is a link, and only it carries these strings. */
  const card = root.querySelector('.me a.card-me');
  if (card && me) {
    const n = card.querySelector('.n');
    if (n && n.textContent !== me.n) n.textContent = me.n;
    const line = card.querySelector('.s');
    const next = me.parts.map((el) => el.textContent).join('|');
    if (line && line.dataset.v !== next) { mount(line, me.parts); line.dataset.v = next; }
  }
}

on('session', paintChrome);
/*
 * NOBODY IS LOOKING AT A BACKGROUNDED TAB.
 *
 * All three of the shell's clocks used to run whatever the page was doing, and
 * the 20 s one is not free on the server either: `/api/session` is the lazy
 * hook that nudges missing ability icons into generation (`src/server/api.js`),
 * so a tab left open behind another window kept asking a picture model for
 * pictures nobody would see for hours. The two chrome ticks are cheaper and
 * just as pointless — a clock nobody can read does not need to be right.
 *
 * Each one skips its own body while `document.hidden`, and the return to the
 * page pays the debt at once: one session read and one repaint, so the first
 * frame a player sees again is current rather than however old the tab is.
 */
const awake = (fn) => () => { if (!document.hidden) fn(); };
/* One minute is the resolution of the season clock's last term. */
setInterval(awake(() => { if (store.session?.season?.endsAt) tickChrome(); }), 60_000);
/* One second is the resolution of the birth clock — and it runs only while
   there is a birth clock to move, which is a few minutes once in a lifetime. */
setInterval(awake(() => { if ($('#chrome .me .born')) tickChrome(); }), 1000);
addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  tickChrome();
  refreshSession().catch(() => {});
});

// ── battle layer: one socket, one truth ────────────────────────────────────

addEventListener('airena:match', (e) => {
  if (!marks.firstMatch) mark('firstMatch');
  $('#boot')?.classList.add('off');
  $('#netstate')?.classList.remove('on');
  const m = e.detail;
  if (m.mine) snapshotBefore();
  /* The viewer writes the raw model id under each name; the product shows the mind's name.
     A microtask runs after the viewer's synchronous handler, so this wins. */
  queueMicrotask(() => {
    for (const [side, id] of [['blue', 'meta-oct'], ['orange', 'meta-gor']]) {
      const el = document.getElementById(id);
      if (el && el.querySelector('.mind') === null) el.textContent = mindInfo(m.meta?.[side]?.model).name;
    }
  });
  set({ live: { match: m, over: null, frame: null, idle: false, phase: 'fighting' } });
});
addEventListener('airena:frame', (e) => {
  if (!marks.firstFrame) mark('firstFrame');
  store.live.frame = e.detail.frame;   // 30 Hz: no subscribers fire; screens read it on their own tick
});
addEventListener('airena:over', (e) => {
  const o = e.detail;
  const mine = !!store.live.match?.mine;
  set({ live: { over: o, phase: mine ? 'result' : 'fighting' } });
  refreshSession().catch(() => {});
});
addEventListener('airena:idle', () => {
  $('#boot')?.classList.add('off');
  set({ live: { match: null, over: null, idle: true, phase: store.session?.creature ? 'searching' : 'idle' } });
});
addEventListener('airena:offline', () => { $('#netstate')?.classList.add('on'); });
addEventListener('airena:online', () => { $('#netstate')?.classList.remove('on'); });
addEventListener('airena:bodyfail', (e) => {
  const { side, ref, message } = e.detail || {};
  track('body_broken', { ref: String(ref || ''), side: String(side || ''), message: String(message || '').slice(0, 200) });
});

on('live', (l) => { document.body.dataset.phase = l.phase; });

/* the phase between fights depends on whether a creature exists */
on('session', (s) => {
  if (store.live.idle) set({ live: { phase: s?.creature ? 'searching' : 'idle' } });
});

/** Every 20 s the session is re-read: fights happen on the server whether the page looks or not. */
setInterval(awake(() => { refreshSession().catch(() => {}); }), 20_000);

/**
 * The heavy renderer is requested first: it is the long pole (modules,
 * WebGPU init, two bodies). Everything else is DOM microseconds and runs in
 * parallel. No `await`: if it dies, the shell still reaches the fatal screen.
 */
async function bootRenderer() {
  mark('rendererRequested');
  try {
    const v = window.__v ? `?v=${window.__v}` : '';
    await import(`/viewer/main.js${v}`);
    mark('rendererReady');
  } catch (e) {
    console.error(e);
    fatal.show('norender');
  }
}

// ── start ──────────────────────────────────────────────────────────────────

async function main() {
  const q = new URLSearchParams(location.search);
  if (!location.hash && q.get('m')) go(`/watch/${q.get('m')}`, { replace: true });
  if (!location.hash && /^\/worker\/?$/.test(location.pathname)) go('/worker', { replace: true });

  addEventListener('hashchange', render);

  /*
   * THE WAY PAST A HUNDRED ROWS.
   *
   * `#chrome` is the last layer in the document (§4.2 z-order), so the four
   * navigation links are the last tab stops on every page: on `#/ladder` after
   * SHOW MORE a keyboard reaches LIVE / CREATURE / HISTORY / LADDER through
   * about a hundred row buttons, and on a phone the rail is also the only route
   * to Create. The link is the first thing in the document and shows itself
   * only when it has focus.
   *
   * It moves focus rather than pointing at a fragment: the product's addresses
   * are hashes, and `href="#chrome"` would be read by the router as a route,
   * which resolves to nothing and lands the reader on `#/live`. Sequential
   * focus navigation continues from whatever holds focus, so the next Tab after
   * the jump is the first rail item.
   */
  $('.skip')?.addEventListener('click', () => $('#chrome .rail')?.focus());

  bootRenderer();
  /* The platform gives the game fifteen seconds to say hello; start now, never await. */
  startPlatformIdentity();

  /* The session is the first request the shell makes, and when it is the only
     one that fails nothing else has anything to say about it: `render()` falls
     through to `/create`, whose own fetch may well succeed, and the player gets
     a Create screen with no minds and no explanation. Only the offline code
     goes to the fatal card — a 4xx here is a session the server declines to
     open, and the screens below say that better than a full-page card. */
  try { await refreshSession(); } catch (e) { if (e?.code === 'offline') fatal.show('offline'); }
  claimSilently(post, refreshSession);
  track('session_start', {
    returning: store.session?.creature ? 1 : 0,
    awayMs: store.session?.since ? 1 : 0,
  });
  mark('shellReady');
  await render();
  mark('screenReady');
}

main();
