/**
 * Every screen state, captured, with numbers beside the picture.
 *
 *   node tools/shots.mjs --base=http://localhost:8787 --out=reports/screens/ui
 *   node tools/shots.mjs --only=live-vs,create --no-mobile --no-laptop
 *   node tools/shots.mjs --only=first-hour            (a whole chapter)
 *   node tools/shots.mjs --list                       (what would be captured)
 *   node tools/shots.mjs --db=data/airena.db --wait=3000
 *
 * The list of states is docs/REDESIGN.md §10 plus nineteen this file adds, held
 * in the order a player lives them — the first hour, making a creature, the
 * fights, the record, the edges — and each one is opened at all three of the
 * widths §12 accepts the product at:
 *
 *     1440×900   `<state>.png`     the reference's own width (screen.png)
 *     1280×720   `<state>-w.png`   unless `--no-laptop`
 *      390×844   `<state>-m.png`   unless `--no-mobile`
 *
 * What each addition is for is written beside it in `STATES`.
 *
 * ── WHY THE MIDDLE WIDTH IS NOT AN AFTERTHOUGHT ────────────────────────────
 *
 * §12 asks for no overlapping text at three widths and the set carried two.
 * That is not a rounding error: 1280×720 is the width where this interface
 * breaks, and it is the width nobody looks at. The HUD is three absolutely
 * positioned blocks that do not know about each other, so "it fits" is a
 * property of the window and not of the stylesheet — at 1440 nothing touches,
 * at 390 the layout has already collapsed into its phone arrangement, and the
 * collision lives in the band between them, which is also the commonest laptop
 * a player owns. `tools/checklayout.mjs` was written for exactly that band and
 * then had nothing to read: it needed a probe result a person was supposed to
 * paste in by hand, so it FAILED on every run and the middle width went
 * unevidenced through three review rounds. It now reads the JSON this tool
 * writes — `node tools/checklayout.mjs --shots=reports/screens/ui` — so the
 * third width is measured by the same headless run that photographs it.
 *
 * ── WHY A JSON BESIDE EVERY PNG ────────────────────────────────────────────
 *
 * A screenshot is evidence of how it looks and evidence of nothing else. Two
 * of the three acceptance criteria in §12 are not visible in a picture at all:
 * "no console errors" is invisible by construction, and "no overlapping text"
 * is invisible at exactly the sizes where it happens — a caption lying two
 * pixels over a number reads as kerning until someone measures it. So every
 * capture writes `<state>.json` next to it with `{ url, errors, overlaps }`,
 * where `overlaps` comes from the same probe `tools/checklayout.mjs` exports:
 * it walks every leaf text node in `#hud` and `#screen` and reports the pairs
 * whose rectangles intersect. Reviewers get numbers, not only pictures.
 *
 * ── AND WHY THAT WAS HALF A TEST ───────────────────────────────────────────
 *
 * Two rectangles intersecting is one way text collides. The other — the one a
 * 390 px screen actually produces — is a PANEL landing on top of a line: glass
 * at .74 alpha with an 18 px blur behind it, which does not intersect a single
 * text box and hides the words completely. `live-fighting-m.json` shipped
 * `overlaps: []` for a frame whose result card sat across the fighter's name,
 * and `live-fighting-m.png` shows the clipped word. A green gate over a picture
 * of the defect is worse than no gate: it is a signed statement that the defect
 * is not there.
 *
 * So every capture runs a SECOND probe (`COVER`) and writes `covered` beside
 * `overlaps`: every text node in the four text-bearing layers of §4.2 — `#hud`,
 * `#screen`, `#overlay`, `#chrome` — is hit-tested at its centre and at both
 * ends, the stack the browser hands back is walked down to the word, and a
 * finding is written for the first SOLID element standing above it. Both
 * numbers are in the JSON, both are in the wall at the end of the run, and both
 * make the run exit non-zero.
 *
 * ── WHY THE TOOL WRITES TO THE DATABASE ────────────────────────────────────
 *
 * Half the states are empty without a creature: Creature, History and the
 * ladder's own row have nothing to draw for a visitor, and a capture of an
 * empty state proves nothing about the screen that state replaces. The page
 * raises its own guest session on first load, so the tool asks the page who it
 * became (`/api/session` → `accountId`) and hands that account one creature by
 * pointing an existing row at it:
 *
 *     UPDATE creature SET owner_id = <accountId> WHERE id = 'c_18e20e72-6bb'
 *
 * That is STONE GOLEM on the development stand — a real creature with real
 * fights behind it, so History and the ladder show real rows. It happens once,
 * before any capture, straight through `node:sqlite` on the same file the
 * server has open (WAL, so a second writer is fine). `--db=` says which file;
 * the default is `data/airena.db`. On a database where that id does not exist
 * the tool says so and carries on — the states that need no creature are still
 * worth having.
 *
 * ── WHY SIX STATES ASK FOR THE SESSION BACK ────────────────────────────────
 *
 * The claim above is what makes most of the run worth looking at, and it is
 * precisely what hides the first hour of the product. A player arrives with no
 * creature: the Create screen greets them with the two lines that are the only
 * teaching this product does — "Describe anything you can imagine…" and "You
 * won't control it. It fights on its own — you watch it climb." — the chrome
 * offers CREATE A CREATURE where the rating chip goes, and Creature and
 * History are empty pages pointing back at Create. Round one reviewed none of
 * it: every capture carried STONE GOLEM and its fights behind it, so
 * `create.png` was the returning owner's "Generation 02" variant and the
 * first-run copy — the most important screen in the product's first minute —
 * was in the code and in no picture.
 *
 * So the whole first chapter carries `session: 'guest'` (see `reseed`), which
 * drops the token AND the cookie for that one capture. `?ui=` alone does not do
 * it: the Create screen's visitor copy would sit under an owner's chrome, and
 * `history.js` stands in its demo career only when the session has no rows of
 * its own — `?ui=empty` on the claimed account quietly photographs a full
 * list, which is the opposite of the state's name. `live-visitor` needs it
 * most of all: `session.creature` is what decides between the HUD of a player
 * with a creature and the one card a stranger is shown over a stranger's
 * fight, and no `?ui=` forces that field.
 *
 * ── WHY A LOST SESSION IS A FAILED RUN ────────────────────────────────────
 *
 * The paragraph above was true and the code under it was not. `reseed` wrote
 * the token, waited twice twelve times for `/api/session` to agree, and then —
 * when it never did — returned `true` and let the capture proceed. Round one
 * paid the whole price: `creature.png` and `creature-m.png` photographed the
 * "NO CREATURE YET" card, `create.png` photographed the visitor's copy, and
 * `ladder.png` photographed a table with nobody's row highlighted. The screen
 * §1.6 calls "the specimen" — the one screen the product is built around — went
 * through an entire review round with no picture of a creature in it.
 *
 * A capture is evidence. Evidence that quietly photographs the wrong identity
 * is worse than no evidence, because it is indistinguishable from the real
 * thing at a glance. So the session is now ASSERTED, not hoped for:
 *
 *   · every state says whose it is, and the page is asked `/api/session` back
 *     before the shot — `hasCreature` must be what the state asked for;
 *   · a state that wants the owner and finds a visitor re-writes the token AND
 *     re-runs the claim (a second capture run on the same stand steals the row),
 *     three attempts, and only then gives up;
 *   · giving up stamps a red bar across the picture, writes the reason into the
 *     state's JSON, prints the state id in red, and makes the run exit non-zero.
 *
 * A failed claim at boot does the same for every non-guest state at once. A run
 * that could not become the owner is a failed run, and it says so in the shell.
 *
 * ── AND THE RUN SAYS WHAT IT WAS A RUN OF ──────────────────────────────────
 *
 * `run.json` is written beside the pictures on every run, green or red: the
 * commit, whether the tree was dirty, the database the claim and the replay
 * came out of with its size and mtime, the node, the window the run occupied,
 * and one row per capture. Two of those lines are printed at the top of the run
 * as well. Round two shipped a `gates.log` with one red line in it that nobody
 * could attribute to either the code or the stand; a directory of evidence that
 * cannot be dated is a directory of assertions. See `provenance`.
 *
 * This is a development-stand tool. It is not wired into `npm test`: it needs
 * a running server and a real browser, and `npm test` has to work on a bare
 * machine.
 */

import { mkdirSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChrome, closeChrome, Cdp, openPage, sleep } from './vfxchrome.mjs';
import { PROBE } from './checklayout.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const arg = (n, d = null) => {
  const hit = process.argv.find((a) => a === `--${n}` || a.startsWith(`--${n}=`));
  if (!hit) return d;
  return hit.includes('=') ? hit.slice(n.length + 3) : true;
};
const flagOff = (n) => process.argv.includes(`--no-${n}`) || arg(n) === '0' || arg(n) === 'false';

const BASE = String(arg('base', 'http://localhost:8787')).replace(/\/+$/, '');
const OUT = resolve(ROOT, String(arg('out', 'reports/screens/ui')));
const DB = resolve(ROOT, String(arg('db', 'data/airena.db')));
const ONLY = arg('only') ? String(arg('only')).split(',').map((s) => s.trim()).filter(Boolean) : null;
const MOBILE = !flagOff('mobile');
const LAPTOP_ON = !flagOff('laptop');
const WAIT = Number(arg('wait', 0)) || 0;
const LIST = arg('list') === true;
/** `--dpr=2` photographs a Retina page: `devicePixelRatio` 2, four times the pixels (`--out=` elsewhere, or it overwrites the DPR-1 set). */
const DPR = Number(arg('dpr', 1)) || 1;
/** `--novsync` (see `main`): the frame rate is a cost, and the capture waits for the page's own meter. */
const NOVSYNC = process.argv.includes('--novsync');

/**
 * `--only=` takes state ids and chapter names alike (`--only=first-hour`), so
 * whoever is working on one screen can re-photograph its chapter without
 * naming five states or capturing fifty-six pictures to see one.
 */
const slug = (s) => String(s || '').toLowerCase().replace(/^the /, '').replace(/[^a-z0-9]+/g, '-');

/** The creature handed to the page's session so the document screens have data. */
const CLAIM_ID = 'c_18e20e72-6bb';

/**
 * The fight `live-replay` opens. A replay needs a match the server can still
 * run — `src/server/app.js` refuses one recorded on other constants — so this
 * takes the newest match on the CURRENT constants and prefers one the claimed
 * creature fought, so the replay and the History rows are one career. With no
 * database it stays `demo`, and the state photographs the "not found" card,
 * which is the honest answer for a fight that does not exist.
 */
const REPLAY = { id: 'demo' };

/** The page's own session token, so a capture can put it back (see `reseed`). */
let claimed = null;
/** The account the page raised for itself, so the claim can be re-run mid-run. */
let account = null;
/**
 * Which identity the shared browser profile is holding: `owner` after the
 * claim, `guest` after a `session: 'guest'` state cleared it, `unknown` once a
 * repair has failed and nothing may be assumed any more.
 */
let profile = 'owner';
/** Why the boot claim did not land, if it did not. Set → every owner state fails. */
let claimFailure = null;

const RED = (s) => `\x1b[31m${s}\x1b[0m`;
const DIM = (s) => `\x1b[2m${s}\x1b[0m`;

/**
 * §12's three widths, in the order the run walks them.
 *
 * The suffixes are the file names a reviewer sorts by, so they are one
 * character each and the reference width carries none: `creature.png`,
 * `creature-w.png`, `creature-m.png` sit together in a directory listing with
 * the widest first. `ALL_SIZES` is deliberately separate from the sizes a
 * given run captures — a `--no-laptop` run must still recognise the `-w` files
 * a full run left behind, or it would report every one of them as an orphan
 * (see the end of `main`).
 */
const DESKTOP = { w: 1440, h: 900, suffix: '' };
const LAPTOP = { w: 1280, h: 720, suffix: '-w' };
const PHONE = { w: 390, h: 844, suffix: '-m' };
const ALL_SIZES = [DESKTOP, LAPTOP, PHONE];
const SIZES = ALL_SIZES.filter((z) => (z === LAPTOP ? LAPTOP_ON : z === PHONE ? MOBILE : true));

/**
 * THE ONE SCREEN THE STAND CANNOT PRODUCE ON REQUEST.
 *
 * Every other state is either what the stand is really doing or a `?ui=`
 * fixture the screen draws for itself. A FAILED generation is neither: the
 * only honest way to reach `paintFailure` is a job row whose `state` is
 * `failed`, and manufacturing one means either writing a poisoned row into the
 * stand's database (which the next player to open Birth would then inherit) or
 * teaching `birth.js` a debug branch that stands beside the real one and drifts
 * from it.
 *
 * So the state answers the screen's own network call instead. `stub` is a table
 * of `substring → JSON body`; a state that carries one has `window.fetch`
 * wrapped before its first document runs (see `openFor`), and `birth.js` polls
 * `GET /api/job/demo` into this object. Nothing else about the screen is
 * simulated: the real poll, the real `job.state === 'failed'` branch, the real
 * `FAIL_TEXT` lookup and the real `OUR_FAULT` judgement all run, which is the
 * whole point — a fixture that renders the failure card by hand would prove
 * only that the fixture is well written.
 *
 * The shape is `jobView` in `src/server/api.js`, field for field.
 */
const FAILED_JOB = (code) => ({
  id: 'demo', kind: 'create', state: 'failed', stage: null, stageCode: null,
  progress: 0, creatureId: null, error: code, errorMessage: null,
  attempts: 1, createdAt: 1757088000000,
});

/**
 * THE WAIT THAT HAS RUN LONG, WHICH IS A DATE AND NOTHING ELSE.
 *
 * §6.4 gives the waiting screen two sentences it only ever says to a player
 * who has been there a while — `Taking longer than usual — still working.`
 * after four minutes, and `First attempt failed — trying again (free).` on a
 * second attempt — and neither had a picture. `?ui=birth-wait` cannot produce
 * them: that fixture freezes the clock at 01:38 and returns before the poll,
 * which is the whole point of it.
 *
 * Both lines are decided by `paint()` from two fields of the job row, so the
 * honest way to reach them is to hand the screen a job row that is genuinely
 * six minutes old and let the real poll, the real `stageLabel` and the real
 * four-minute comparison run. That is this: `state: 'running'`, dated
 * backwards from the moment the capture opens.
 *
 * The date is a marker and not a number, so that it is resolved when the page
 * asks and re-resolved on every poll — see `STUB`. That is what holds the
 * clock at 06:12 instead of at however long the run has been going.
 */
const BIRTH_LONG_MS = 372_000;                                    /* 06:12 */
const RUNNING_JOB = {
  id: 'demo', kind: 'create', state: 'running',
  stage: 'the body did not come out the first time, drawing with another mind',
  stageCode: 'body_retry',
  progress: 0.4, creatureId: null, error: null, errorMessage: null,
  /* Two attempts, because a generation that has run past four minutes is
     usually a generation on its second try — and it puts §6.4's other unseen
     line in the same frame. */
  attempts: 2, createdAt: `@ago:${BIRTH_LONG_MS}`,
};

/**
 * The wrapper itself, installed on every new document of the page (so it
 * survives `reseed`'s reload). Anything the table does not name goes to the
 * real network untouched — the page still boots, still raises its session,
 * still loads the renderer.
 */
/**
 * ── A FIXTURE THAT IS A DATE HAS TO BE READ AS ONE ────────────────────────
 *
 * `'@ago:372000'` anywhere in a stubbed body becomes `Date.now() - 372000` at
 * the moment the page is answered, not at the moment this file was read. Two
 * things follow, and both are the difference between a picture of a state and
 * a picture of how long the run has been going.
 *
 * A run is ten minutes long, so a timestamp baked in at module load has the
 * birth screen counting sixteen minutes by the time its turn comes. Measured:
 * a job dated 06:12 back photographed at 06:59, and the number in the picture
 * was the settling time of the capture rig.
 *
 * And because the screen polls, the marker is resolved on EVERY answer — so
 * the elapsed clock is not merely close to 06:12, it stands there. A screen
 * that re-reads `createdAt` every 1.5 s from a body that is always the same
 * age has a frozen clock, which is what §10 asks a debug state for and what
 * `?ui=birth-wait`'s own literal gives the state beside it.
 */
const STUB = (table) => `(() => {
  const table = ${JSON.stringify(table)};
  const real = window.fetch.bind(window);
  const dated = (v) => JSON.parse(JSON.stringify(v), (k, x) => (typeof x === 'string'
    && x.slice(0, 5) === '@ago:' ? Date.now() - Number(x.slice(5)) : x));
  window.fetch = (input, init) => {
    const url = String(typeof input === 'string' ? input : (input && input.url) || '');
    for (const key of Object.keys(table)) {
      if (!url.includes(key)) continue;
      return Promise.resolve(new Response(JSON.stringify(dated(table[key])), {
        status: 200, headers: { 'content-type': 'application/json' },
      }));
    }
    return real(input, init);
  };
})()`;

/**
 * Open the page for one state.
 *
 * A state with no `stub` is opened straight at its URL, exactly as before. A
 * state WITH one cannot be: `openPage` returns on `Page.navigate`, and by the
 * time a script could be evaluated the screen may already have made the call
 * the stub exists to answer — `birth.js` polls `/api/job/:id` in `enter()`, and
 * a 404 there sends the player to `/live` before anything is photographed. So
 * those states open on `about:blank`, take the wrapper as a
 * `Page.addScriptToEvaluateOnNewDocument` (which fires before the document's
 * own first script, on this navigation and on every reload after it), and only
 * then navigate.
 */
async function openFor(cdp, state, url, size) {
  const size2 = { w: size.w, h: size.h, dpr: DPR };
  if (!state.stub) return openPage(cdp, url, size2);
  const page = await openPage(cdp, 'about:blank', size2);
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: STUB(state.stub) }, page.sessionId);
  await cdp.send('Page.navigate', { url }, page.sessionId);
  return page;
}

/**
 * The journey, in the order a player lives it.
 *
 * §10 of the redesign names sixteen of these; the other twelve are marked
 * `extra` and each says beside itself what it is for. A state nobody
 * photographed is a state nobody reviewed, so the rule this list follows is
 * that a screen's states earn a picture each — and the states a player meets
 * before their first creature come first, because they are the ones the claim
 * above would otherwise cover over.
 *
 * `wait` is the settling time in milliseconds; `ready` is an expression polled
 * inside the page until it answers truthy, after which the shot still waits a
 * beat for the last transition to land. Only the two states fed by a real
 * socket get one: their content arrives from a renderer that has to boot
 * WebGPU first, and six seconds is sometimes not enough.
 *
 * `session: 'guest'` photographs the state as a stranger sees it (see the head
 * of this file); `group` is the heading the run prints above it.
 */
const STATES = [
  /*
   * THE FIRST HOUR — the screens that exist only before the first creature
   * does, in the order a stranger meets them.
   *
   * `live-visitor` is first because LIVE is: the nav rail's top item, the
   * link people are sent, and — measured against nothing but the shape of the
   * product — the second-most-likely first screen after Create. What a
   * stranger gets there is ONE card over somebody else's fight ("You are
   * watching the arena." + CREATE A CREATURE), and until now it had never been
   * photographed over the running HUD it floats on. `?ui=` cannot make it: the
   * card is chosen by `session.creature` being null, which is what
   * `session: 'guest'` is for.
   *
   * Create is the one that matters most: its visitor copy is the whole tutorial
   * this product has, and round one photographed the owner's screen in its
   * place.
   *
   * `birth-failed` is the worst thing that can happen in that first hour — the
   * generation that does not come together — and §6.4 gives it a state word,
   * a reason, a line about the day's allowance and two ways out. None of it
   * was in a picture. It is photographed TWICE because the fourth line has two
   * readings and they say opposite things about what the failure cost: an
   * `OUR_FAULT` code (`internal`) says the allowance is untouched, anything
   * else (`rejected`) says a generation was spent. See `FAILED_JOB` and `stub`.
   *
   * Creature and History are the two empty pages that send a stranger back to
   * Create, and an empty state is a designed state — it carries the sentence
   * that decides whether the visit continues.
   */
  { id: 'live-visitor', group: 'THE FIRST HOUR', route: '/live?ui=live-visitor', session: 'guest', extra: true,
    wait: 12000, ready: '!!(window.__airenaMarks && window.__airenaMarks.firstFrame)' },
  { id: 'create-visitor', group: 'THE FIRST HOUR', route: '/create?ui=create-visitor', session: 'guest', extra: true },
  {
    id: 'birth-failed', group: 'THE FIRST HOUR', route: '/birth/demo?ui=birth-failed',
    session: 'guest', extra: true, note: 'the generation broke on our side',
    stub: { '/api/job/': FAILED_JOB('internal') },
  },
  {
    id: 'birth-failed-charged', group: 'THE FIRST HOUR', route: '/birth/demo?ui=birth-failed',
    session: 'guest', extra: true, note: 'the mind failed its trial fights — a generation spent',
    stub: { '/api/job/': FAILED_JOB('rejected') },
  },
  /*
   * AND THEN THE TWO STATES THE WHOLE PRODUCT IS EXPLAINED IN.
   *
   * §6.1 says the first battle gets no tutorial: the phase words and the
   * result card do the teaching. Both of them say something to a player with
   * no fights behind them that they never say again — the wait reads
   * `CROCODILE · waiting for its first fight` instead of a last result, and
   * the card opens `Your first fight` and then states the loop in one line,
   * `Fights keep running on their own. Nothing to press.` That sentence is the
   * only place this product explains itself, and it existed in the code and in
   * no picture: `live-searching` photographs a settled career (`#4 · 1,555
   * MMR`, `LAST FIGHT WON +24`) and `simResultCard()` hard-codes `first:
   * false`.
   *
   * They carry `requires` (see `capture`) because neither fixture is in
   * `live.js` yet: until `simState()` answers to these two ids the capture
   * would photograph the ordinary live screen and file it under the name of
   * the state it is missing, which is the one failure this whole file exists
   * to prevent. `body[data-sim]` is written by `startSim()` only when
   * `simState()` recognised the id, so it is the cheapest true answer to "does
   * the fixture exist" — and it does not go stale when the copy is rewritten.
   */
  {
    id: 'live-searching-first', group: 'THE FIRST HOUR', route: '/live?ui=searching-first', extra: true,
    note: 'no fights yet — the wait before the very first one',
    requires: { is: "document.body.dataset.sim === 'searching-first'",
      why: 'live.js has no ?ui=searching-first fixture — simState() needs the fights: 0 creature (§6.1)' },
  },
  {
    id: 'live-result-first', group: 'THE FIRST HOUR', route: '/live?ui=result-first', extra: true,
    note: 'the first result card — the only place the loop is taught',
    requires: { is: "document.body.dataset.sim === 'result-first'",
      why: 'live.js has no ?ui=result-first fixture — simResultCard() hard-codes first: false (§6.2)' },
  },

  { id: 'creature-empty', group: 'THE FIRST HOUR', route: '/creature?ui=empty', session: 'guest', extra: true },
  { id: 'history-empty', group: 'THE FIRST HOUR', route: '/history?ui=empty', session: 'guest', extra: true },

  /*
   * MAKING ONE — the returning owner's Create (§6.3, the "Generation 02"
   * variant), the picker over it, and the two halves of Birth (§6.4).
   *
   * Create carries `?ui=create` and not the bare route. The dev stand's own
   * catalogue holds two mind families, so the bare route photographs a row of
   * two cards where the product shows a row of them — the dominant element of
   * the screen, under-photographed — and `create.js` keeps a frozen catalogue
   * of eight for exactly this capture, one of them unavailable so the dimmed
   * card is in the picture too. It changes the minds and nothing else: the
   * session is still the owner's, so the "Generation 02" line stands.
   */
  { id: 'create', group: 'MAKING ONE', route: '/create?ui=create' },
  { id: 'create-picker', group: 'MAKING ONE', route: '/create?ui=picker' },
  { id: 'birth-wait', group: 'MAKING ONE', route: '/birth/demo?ui=birth-wait' },
  /*
   * THE WAY OUT OF THE WAIT THAT IS NOT LEAVING (§6.4, `setPeek`).
   *
   * The one thing there is to press during three to six minutes of nothing:
   * the veil lifts, the real fight behind it comes forward and the birth
   * column folds into a bar at the bottom. No fixture can produce it, because
   * it is not a state of the data — it is a class on a wrapper, put there by a
   * click. So the capture clicks it, which is also the only way to prove the
   * button still does what it says.
   *
   * It waits for a first frame like the other arena states: peeking at an
   * arena that has not booted photographs the veil over an empty stage, which
   * is the picture this state exists to disprove.
   */
  {
    id: 'birth-peek', group: 'MAKING ONE', route: '/birth/demo?ui=birth-wait', extra: true,
    note: 'the arena, watched from inside the wait',
    wait: 12000, ready: '!!(window.__airenaMarks && window.__airenaMarks.firstFrame)',
    act: "(document.querySelector('.birth-peek-btn'))?.click(), 1", actWait: 1400,
  },
  /*
   * SIX MINUTES IN. See `RUNNING_JOB` for why this is a stub and not a `?ui=`
   * fixture: both of §6.4's long-wait sentences are decided by `paint()` from
   * two fields of the job row, so the state hands the screen a row that is
   * really six minutes old and really on its second attempt, and every word in
   * the picture is then the product's own.
   *
   * `?ui=` is still carried — `birth.js` reads it for the demo prompt and the
   * demo mind (nothing else answers to `birth-wait-long`), so the column is
   * the one a player sees rather than one missing its two middle lines.
   */
  {
    id: 'birth-wait-long', group: 'MAKING ONE', route: '/birth/demo?ui=birth-wait-long', extra: true,
    note: 'past four minutes, and on its second attempt',
    stub: { '/api/job/': RUNNING_JOB },
    requires: { is: "/taking longer/i.test(document.querySelector('.birth-notes')?.textContent || '')",
      why: 'the four-minute line never appeared — the poll or the stub did not land (§6.4)' },
  },
  { id: 'birth-reveal', group: 'MAKING ONE', route: '/birth/demo?ui=birth-reveal' },

  /*
   * THE FIGHT — the phases of §6.1.
   *
   * `live-fighting` opens whatever the stand is really doing. That is the
   * honest picture and an unreliable one: on an idle stand it photographs a
   * creature at rest, and the HUD of §5.2 — the composition of screen.png, the
   * densest screen in the product — is then in no picture at all. `live-hud`
   * is the same HUD on the screen's own fixtures, so the flagship state is in
   * the set on every run, at both widths, with no fight required.
   *
   * The replay points at a REAL match resolved from the database below;
   * `/watch/demo` only ever photographs the "not found" card.
   */
  { id: 'live-searching', group: 'THE FIGHT', route: '/live?ui=searching' },
  { id: 'live-vs', group: 'THE FIGHT', route: '/live?ui=vs' },
  { id: 'live-hud', group: 'THE FIGHT', route: '/live?ui=fighting', extra: true },
  /*
   * A FIRST FRAME IS NOT A FIGHT.
   *
   * This state waited for `__airenaMarks.firstFrame` and shot whatever stood
   * there — and the arena's own cycle is searching → VS card (2.4 s) → the
   * fight → the result card (6 s) → searching, so a first frame is at least as
   * likely to land on a card as on the composition of §5.2. The set shipped
   * `live-fighting.png` with the VS card across the middle of it, under the
   * name of the state that is supposed to be the flagship of the HUD.
   *
   * So the shot now waits for the phase itself AND for the overlay to be gone:
   * `body[data-phase]` is written by `app.js` from `store.live.phase`, and
   * `body[data-card]` by `showOverlay()` for as long as a card is raised. The
   * window is generous because the wait for one is: a fight is up to a minute
   * and the gap between two is eight seconds.
   *
   * It is a WAIT and not an assertion. An idle stand has no fight to
   * photograph, and this state's honest answer there is a creature at rest —
   * which is why `live-hud` exists beside it on the screen's own fixtures.
   * Whether the gate was met is written into the JSON either way (`signals.ready`).
   */
  {
    id: 'live-fighting', group: 'THE FIGHT', route: '/live', wait: 24000, dwell: 3500,
    ready: "!!(window.__airenaMarks && window.__airenaMarks.firstFrame)"
      + " && document.body.dataset.phase === 'fighting' && !document.body.dataset.card",
  },
  { id: 'live-result-win', group: 'THE FIGHT', route: '/live?ui=result-win' },
  { id: 'live-result-loss', group: 'THE FIGHT', route: '/live?ui=result-loss' },
  { id: 'live-away', group: 'THE FIGHT', route: '/live?ui=away' },
  {
    id: 'live-replay', group: 'THE FIGHT', route: () => `/watch/${REPLAY.id}?ui=replay`, extra: true,
    wait: 14000, ready: '!!(window.__airenaMarks && window.__airenaMarks.firstFrame)',
  },

  /*
   * THE RECORD — §6.5 to §6.7.
   *
   * `ladder-rank-up` is the sticky footer's other half: the arrow it draws for
   * a player who has climbed since their last visit. The plain `ladder`
   * capture cannot show it, because a capture has no last visit and the screen
   * refuses to invent one (`ladder.js` writes no rank under `?ui=`).
   *
   * SEASON carries `?ui=season` as well as its route, because the segment is
   * only worth a picture when the season has an end to count down to.
   */
  { id: 'creature', group: 'THE RECORD', route: '/creature' },
  /*
   * The specimen with one ability open. §6.5 gives every tile a tooltip, and
   * the tooltip is where the ability's name meets its sentence — the only place
   * a player reads what the thing they made actually does. It was photographed
   * once, by hand, in the morning of the review; by evening the naming in
   * `describe.js` had changed under it and the picture was arguing for a bug
   * that no longer existed. A state that regenerates every run cannot go stale.
   * `attachTooltip` opens on focus (`ui/tooltip.js`), so no pointer is needed.
   */
  {
    id: 'creature-tooltip', group: 'THE RECORD', route: '/creature', extra: true,
    act: "(document.querySelectorAll('#screen .ability')[1] || document.querySelector('#screen .ability'))?.focus(), 1",
  },
  { id: 'history', group: 'THE RECORD', route: '/history' },
  { id: 'history-detail', group: 'THE RECORD', route: '/history?ui=detail' },
  { id: 'ladder', group: 'THE RECORD', route: '/ladder' },
  { id: 'ladder-rank-up', group: 'THE RECORD', route: '/ladder?ui=rank-up', extra: true },
  { id: 'ladder-minds', group: 'THE RECORD', route: '/ladder/minds' },
  { id: 'ladder-season', group: 'THE RECORD', route: '/ladder/season?ui=season', extra: true },

  /* THE EDGES — the worker screen's two answers that carry content, and the
     two dead ends, which have no route of their own and arm from `?ui=`. The
     worker card answers to three more (`?ui=worker-stale`, `worker-guest`,
     `worker-error`); they are that card with another sentence in it, so they
     stay out of the run and are opened by hand when that screen is worked on. */
  { id: 'worker', group: 'THE EDGES', route: '/worker' },
  { id: 'worker-code', group: 'THE EDGES', route: '/worker?ui=worker-code', extra: true },
  { id: 'worker-denied', group: 'THE EDGES', route: '/worker?ui=worker-denied', extra: true },
  { id: 'fatal-offline', group: 'THE EDGES', route: '/live?ui=fatal-offline', extra: true },
  { id: 'fatal-norender', group: 'THE EDGES', route: '/live?ui=fatal-norender', extra: true },
];

const DEFAULT_WAIT = 6000;

// ── the page's session gets a creature ──────────────────────────────────────

/**
 * Ask the page who it is. The client keeps its session under
 * `airena.session` in localStorage and sends it as a bearer header; the raw
 * `fetch` below repeats that, because a request without the header would raise
 * a SECOND guest and hand the creature to an account nobody is looking at.
 *
 * ── AND IT DID RAISE ONE ───────────────────────────────────────────────────
 *
 * The header was conditional, so a call that arrived before the client had
 * stored its token did the exact thing the paragraph above forbids: it asked
 * with no header, the server raised a fresh guest, and that guest's id came
 * back as the answer to "who is this page". The claim then pointed STONE GOLEM
 * at an account no tab was looking at, the verification below re-asked with the
 * token the client had meanwhile stored — a DIFFERENT account — and got
 * `hasCreature: false` three times running. Measured on a cold `devrestart`,
 * where the first `/api/session` is slower than the 2500ms sleep before this
 * runs: eighteen of twenty-one states stamped "another capture run may be
 * holding it" when no other run existed.
 *
 * So the token is a PRECONDITION, not a nicety. With no token there is no
 * question worth asking: return `null` and let the caller's retry loop wait for
 * the client to boot. Waiting is the whole fix — the loop already allows six
 * seconds, and the page needs about one and a half.
 */
const WHOAMI = `(async () => {
  const t = localStorage.getItem('airena.session');
  /* No session yet — the client is still booting. Asking anyway would raise a
     second guest and claim the creature to it. */
  if (!t) return { accountId: null, hasCreature: false, pending: true };
  const r = await fetch('/api/session', { headers: { authorization: 'Bearer ' + t } });
  const j = await r.json();
  return { accountId: j.accountId || null, hasCreature: !!j.creature };
})()`;

/**
 * ── AND THE WRITER IS NOT THE ONLY WRITER ──────────────────────────────────
 *
 * The claim goes through the same file the server has open, and the server is
 * playing fights into it the whole time. SQLite in WAL mode allows a second
 * writer and does not allow two AT ONCE: a `SQLITE_BUSY` arrives whenever the
 * arena loop happens to be committing a match in the same instant. This threw,
 * and the throw was not caught anywhere — `shots.mjs died: database is locked`,
 * before a single picture, with the Chrome lock a dozen agents were queued
 * behind released on the way out.
 *
 * A capture run is not entitled to the database's undivided attention. It waits
 * for it: `busy_timeout` hands the wait to SQLite itself (which retries on the
 * right side of the lock), and the outer retry covers the case where the
 * server's write is longer than the timeout. A claim that still cannot land is
 * a claim FAILURE — the loud, already-handled kind that stamps every owner
 * state — and never an exception that ends the run.
 */
async function openDb() {
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(DB);
  /* Five seconds of waiting on the arena loop's commit, rather than a throw on
     the first contended millisecond. */
  try { db.exec('PRAGMA busy_timeout = 5000'); } catch { /* an older node:sqlite */ }
  return db;
}

/** `{ ok, note }` — `ok: false` means no owner state in this run can be real. */
async function giveCreature(accountId) {
  if (!existsSync(DB)) return { ok: false, note: `no database at ${DB}` };
  let last = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await sleep(1200);
    let db = null;
    try {
      db = await openDb();
      const row = db.prepare('SELECT id, name, is_library FROM creature WHERE id = ?').get(CLAIM_ID);
      if (!row) return { ok: false, note: `${CLAIM_ID} is not in ${DB}` };
      if (row.is_library) return { ok: false, note: `${CLAIM_ID} is a library creature — not claiming it` };
      db.prepare('UPDATE creature SET owner_id = ?, updated_at = ? WHERE id = ?')
        .run(accountId, Date.now(), CLAIM_ID);
      return { ok: true, note: `${row.name} (${CLAIM_ID}) → ${accountId}` };
    } catch (e) {
      last = e.message;
    } finally { try { db?.close(); } catch { /* already gone */ } }
  }
  return { ok: false, note: `${DB} would not take the claim — ${last}` };
}

async function findReplay() {
  if (!existsSync(DB)) return `no database at ${DB} — the replay state will show the not-found card`;
  let db = null;
  try {
    db = await openDb();
    const latest = db.prepare('SELECT constants_version AS v FROM match ORDER BY started_at DESC LIMIT 1').get();
    if (!latest) return 'no fights in the database — the replay state will show the not-found card';
    const pick = db.prepare(`SELECT id FROM match WHERE constants_version = ?
      ORDER BY (a_id = ? OR b_id = ?) DESC, started_at DESC LIMIT 1`)
      .get(latest.v, CLAIM_ID, CLAIM_ID);
    if (!pick) return `no fight on the current constants (${latest.v}) — the replay state will show the not-found card`;
    REPLAY.id = pick.id;
    return `${pick.id} on constants ${latest.v}`;
  } catch (e) {
    /* The replay is one state out of thirty-five; losing it to a busy database
       is a line in the log, not the end of a run. */
    return `${DB} would not answer — ${e.message}; the replay state will show the not-found card`;
  } finally { try { db?.close(); } catch { /* already gone */ } }
}

/**
 * ── WHOSE TREE, WHOSE DATABASE, WHICH HOUR ─────────────────────────────────
 *
 * A directory of pictures says what a screen looked like and says nothing
 * about what it was a picture OF. That gap cost a whole review round: the
 * evidence shipped beside this one carried `FAIL checkbody` in `gates.log`,
 * the gate ran green on the same tree an hour later, and there was no way to
 * tell from the file whether the code had been broken or the stand's database
 * had. A reviewer had to guess, and guessing about evidence is how a real
 * failure gets waved through next time.
 *
 * So every run stamps itself. `run.json` sits beside the pictures with the
 * commit the tree was on, whether that tree was dirty, the database file the
 * claim and the replay came out of (with its size and mtime — a stand rebuilt
 * mid-review changes both), the node and Chrome that drew them, the wall-clock
 * window the run occupied, and the outcome of every state. Two of those lines
 * are printed at the top of the run as well, because the thing a reviewer
 * needs most is the one nobody thinks to write down.
 */
function provenance() {
  const git = (...a) => {
    try { return execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
    catch { return null; }
  };
  let db = { path: DB, exists: existsSync(DB), bytes: null, modified: null };
  if (db.exists) {
    try {
      const st = statSync(DB);
      db = { ...db, bytes: st.size, modified: new Date(st.mtimeMs).toISOString() };
    } catch { /* raced with the server's own writer; the path is the point */ }
  }
  const dirty = git('status', '--porcelain');
  return {
    at: new Date().toISOString(),
    base: BASE,
    out: OUT,
    db,
    commit: git('rev-parse', 'HEAD'),
    branch: git('rev-parse', '--abbrev-ref', 'HEAD'),
    /* A capture of a dirty tree is the normal case mid-round and not a fault —
       but it is the difference between "this is commit abc" and "this is commit
       abc plus 41 files nobody can reconstruct", and a reviewer must be told. */
    dirtyFiles: dirty === null ? null : dirty.split('\n').filter(Boolean).length,
    node: process.version,
  };
}

// ── capture ────────────────────────────────────────────────────────────────

/**
 * Hand the page the session this state wants.
 *
 * Every capture shares one browser profile, so a single `localStorage` key
 * decides who each page is. `session: 'guest'` drops the token and reloads:
 * the client raises a fresh visitor with no creature, which is the only way to
 * photograph an empty state that the claim above exists to prevent. The state
 * after it puts the claimed token back, because the guest wrote its own over
 * it.
 *
 * THE COOKIE HAS TO GO TOO. `lib/api.js` sends `credentials: 'include'`, and
 * the server keeps a session cookie as the second path to an identity (D22).
 * Clearing only the token left that cookie standing, the server recognised the
 * same account, and `creature-empty` photographed a creature — the exact state
 * it exists to disprove. Caught by looking at the picture.
 */
async function reseed(cdp, page, state) {
  const guest = state.session === 'guest';
  const want = guest ? 'guest' : 'owner';
  /* Nothing was ever claimed, so the owner states are lost anyway and there is
     no token to put back — say it once, here, rather than at every state. */
  if (!guest && claimFailure) return { ok: false, error: `session: no creature claimed — ${claimFailure}` };
  /*
   * AND THEN IT WAITS UNTIL THE PAGE AGREES.
   *
   * The write goes into a document that is still loading — `openPage` returns
   * on `Page.navigate`, not on the load event — so a write can land in the
   * outgoing context and be gone by the time the new one asks who it is. That
   * used to be survivable: the guest states sat late in the run, and the only
   * captures after them were the worker card and the two dead ends, which look
   * identical to an owner and to a stranger. In journey order the states that
   * follow are Create, Creature, History and the ladder — the four that say
   * whose they are on every line — so a silently lost token would photograph a
   * visitor four times and call it the owner's product.
   *
   * So the reload is followed until `/api/session` comes back as the identity
   * this state asked for. It also means the state's own settling time starts on
   * the reloaded page instead of overlapping the reload.
   *
   * AND THE CLAIM IS RE-RUN, not only the token. Two capture runs on one stand
   * take the creature from each other — the claim points ONE row at whichever
   * page booted last — so a page that comes back as a visitor with the right
   * token in it has lost the row, not the session, and re-writing the token
   * forever would never bring it back.
   */
  const wantCreature = !guest;
  /* The profile is already this identity: verify, do not rebuild. Everything
     else falls straight through to the repair below. */
  if (profile === want && await agrees(page, wantCreature, 12)) return { ok: true };
  for (let attempt = 0; attempt < 3; attempt++) {
    if (guest) {
      await cdp.send('Network.enable', {}, page.sessionId).catch(() => {});
      await cdp.send('Network.clearBrowserCookies', {}, page.sessionId).catch(() => {});
      await page.evaluate('try { localStorage.clear(); } catch (e) { /* blocked */ } 1').catch(() => {});
    } else {
      await page.evaluate(`try { localStorage.setItem('airena.session', ${JSON.stringify(claimed)}); } catch (e) { /* blocked */ } 1`).catch(() => {});
      if (attempt > 0 && account) await giveCreature(account);
    }
    await cdp.send('Page.reload', {}, page.sessionId).catch(() => {});
    if (await agrees(page, wantCreature, 12)) { profile = want; return { ok: true }; }
  }
  /* Neither identity is on the page now, and the next state may not assume one. */
  profile = 'unknown';
  return { ok: false, error: `session: wanted ${want}, page is ${guest ? 'the owner' : 'a visitor'}` };
}

/** Poll `/api/session` until it reports the identity this state asked for. */
async function agrees(page, wantCreature, tries) {
  for (let i = 0; i < tries; i++) {
    await sleep(350);
    const who = await page.evaluate(WHOAMI).catch(() => null);
    if (who?.accountId && !!who.hasCreature === wantCreature) return true;
  }
  return false;
}

/**
 * A picture that photographed the wrong identity carries the reason across its
 * top. The run says so in the shell and in the JSON as well, but only the
 * stamp survives being opened months later in an image viewer, and a review set
 * must never hold a file that quietly says something false.
 */
const STAMP = (text) => `(() => {
  const d = document.createElement('div');
  d.id = 'shots-stamp';
  d.textContent = ${JSON.stringify('CAPTURE FAILED · ')} + ${JSON.stringify(text)};
  d.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:2147483647;background:#B3261E;'
    + 'color:#fff;padding:9px 16px;text-align:center;text-transform:uppercase;'
    + 'font:600 12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.08em;';
  document.documentElement.appendChild(d);
  return 1;
})()`;

/**
 * WHAT THE PICTURE CANNOT SAY ABOUT ITSELF.
 *
 * §1.8 asks for one uninterrupted experience with no `page → loading → page`
 * cuts, and a still frame of a cross-fade looks exactly like a design decision:
 * `creature.png` came back with the whole specimen at 15 % opacity and the
 * backdrop reading through it, and nothing in the file said so. The same run
 * wrote a `create.png` with an empty `#screen` and called it clean.
 *
 * So each capture asks the page what it is: which screen and phase the body is
 * carrying, how opaque `#screen` is, how many nodes are in it, and how many
 * skeletons are still standing. A screen caught fading is a failed capture, not
 * a soft picture, and the JSON carries the numbers either way.
 */
const SIGNALS = `(() => {
  /* The opacity that matters is on the screen ELEMENT, not on the #screen
     layer that holds it: app.js mounts div.screen.entering at opacity 0 and
     drops the class two frames later (see §4.2 and ui/base.css). */
  const all = document.querySelectorAll('#screen > .screen');
  const scr = all[all.length - 1] || null;
  return {
    screen: document.body.dataset.screen || null,
    phase: document.body.dataset.phase || null,
    opacity: scr ? Number(getComputedStyle(scr).opacity) : null,
    classes: scr ? scr.className : null,
    mounted: all.length,
    nodes: scr ? scr.querySelectorAll('*').length : 0,
    waiting: document.querySelectorAll('.is-waiting').length,
    /* The viewer's own numbers, so a capture carries the frame rate and the
       tier it was photographed at: the quality auto-select can lower the
       tier on a slow machine, and a picture of 'medium' is not evidence about
       'high'. */
    fps: window.__airenaFps ? { last: window.__airenaFps.last, min: window.__airenaFps.min, ticks: window.__airenaFps.frames, since: Math.round(window.__airenaFps.since) } : null,
    /* frames drawn so far, when the first one started and what it cost */
    drawn: window.__airenaDrawn ? { ...window.__airenaDrawn } : null,
    backend: window.__airenaBackend || null,
    quality: window.__airenaQuality || null,
    /* the quality governor's rolling mean frame cost (null until 160 frames) */
    msPerFrame: window.__airenaGov ? window.__airenaGov.msPerFrame : null,
    /* The shell's own clock (app.js marks, no backticks here — this is a
       template literal): ms from page start to the renderer's request, its
       module, and the first frame on the canvas — so a capture says how long
       the arena took to appear, not only whether it had by the shot. */
    marks: window.__airenaMarks ? { ...window.__airenaMarks } : null,
  };
})()`;

/**
 * ── TEXT UNDER A PANEL ─────────────────────────────────────────────────────
 *
 * `PROBE` compares text boxes to each other. That finds two captions sharing a
 * pixel and misses the collision this product actually ships: an opaque surface
 * — the result card, the collapsed LIVE FEED pill, the detail panel — landing
 * on a line that is still there, still measured, still 100 % opaque and
 * completely unreadable. No pair of text rectangles intersects, so the pairwise
 * test signs the frame off. `live-fighting-m.json` did exactly that.
 *
 * This probe asks the browser instead of arithmetic: for every text node it
 * hit-tests three points — the centre and both ends of the line — and reports
 * the ones where what comes back is neither the node's own element nor
 * something inside it. Three points and not one, because a panel that clips a
 * line from the right (which is what a 390 px column does) leaves its centre
 * clear.
 *
 * ── IT READS THE WHOLE STACK, NOT THE TOP OF IT ────────────────────────────
 *
 * `elementFromPoint` answers with ONE element: the topmost. This interface's
 * topmost element at almost any point is a full-bleed transparent wrapper —
 * `#overlay`, `#chrome`, `#screen > .screen` — and a wrapper is not a coverer,
 * so a probe that stopped at the first answer forgave the panel sitting one
 * layer under it. `elementsFromPoint` hands back the whole stack in paint
 * order, and the probe walks it downwards until it reaches the text's own
 * element: the first SOLID thing above the word is the coverer, wherever in
 * the stack it stands. The same walk is what makes `skipCover` honest — a
 * tooltip on top no longer hides the panel beneath it from the test.
 *
 * ── AND IT MEASURES THE LAYERS THAT DO THE COVERING, TOO ───────────────────
 *
 * The victims used to be the text in `#hud` and `#screen`. But §4.2's stack
 * has four text-bearing layers, and the two that were missing hold the words a
 * player reads at the loudest moments: `#overlay` is the VS card, the result
 * card and the away recap; `#chrome` is the wordmark, the rail, the season
 * chip and the rating chip — the four things that are on screen on every
 * screen. Nothing was checking whether the phone's tab bar stands on the
 * ladder's own footer, or whether the collapsed feed pill clips the rating
 * chip. All four are walked now.
 *
 * `PROBE` deliberately does NOT gain those roots. Two text boxes in different
 * layers intersecting is not a defect — it is what a layer IS: the result card
 * is supposed to lie across the fight it reports on. Intersection is only
 * meaningful inside one plane; occlusion is only meaningful across planes.
 * That is the whole difference between the two probes, and it is why one is
 * pairwise arithmetic and the other asks the compositor.
 *
 * TWO THINGS MAKE THAT HONEST, AND BOTH ARE THE DIFFERENCE BETWEEN A USEFUL
 * FINDING AND A HUNDRED FALSE ONES.
 *
 * `elementsFromPoint` obeys `pointer-events`, and this interface is built out of
 * layers that switch it off: `#hud`, `#screen`, `#overlay` and `#chrome` are
 * all `pointer-events: none` with their contents switched back on one rule at a
 * time (`ui/base.css`, `ui/hud.css`). `#feedwrap` — the panel in the reported
 * defect — never switches back on, so a plain hit test looks straight THROUGH
 * the thing doing the covering. So the probe makes every element in those four
 * layers hittable for its own duration and puts each one back exactly as it
 * found it. `pointer-events` paints nothing: the screenshot taken afterwards is
 * the same image either way.
 *
 * And with everything hittable, the full-bleed transparent wrappers those same
 * layers are made of would answer for every point on the screen. So a hit only
 * counts when it is SOLID: a background colour at half alpha or more, a
 * background image, or a backdrop filter GRADED BY ITS BLUR RADIUS — all
 * multiplied by the opacity it and its ancestors actually carry. The grading is
 * the difference between a surface and a scrim, and it was learnt the
 * expensive way: counting any backdrop filter as opaque reported eighty-three
 * findings in one state, every one of them `.detail-veil` — a 2 px blur at .22
 * alpha over the career list the detail panel is deliberately pushing back.
 * The tree draws the line itself, every scrim in it blurring by 2–4 px and
 * every surface by 10–18. That is the line between `.ov-card` at
 * `rgba(255,255,255,.94)` with a 16 px blur, which hides what is under it, and
 * `.live-veil` at .38, which is the design. A faded-out panel (`opacity: 0`)
 * is not a coverer either, which matters here: half the HUD's panels rest at
 * zero between phases.
 *
 * Two more exclusions, both named: text nobody can read (`font-size: 0`, the
 * cooldown labels the viewer writes into the ability tiles, transparent ink, or
 * a panel resting at `opacity: 0` between phases — see the note on the same
 * filter in `tools/checklayout.mjs`) is not worth protecting, and the transient
 * floats — a tooltip, a damage number, a say-bubble — are SUPPOSED to be on top
 * of things.
 *
 * A probe nobody has watched fire is the thing this one was written to
 * replace, so it was made to fire: a glass panel — .86 alpha, an 18 px blur, the
 * shape of the collapsed feed pill — was laid over one line of `#/creature`
 * through a state's `act` hook. The run answered `“STONE GOLEM” under div at
 * left+centre+right` and reported nothing else on a screen made of eleven glass
 * surfaces, three stat tiles and a lit portrait. That is both halves of the
 * claim: it sees the collision, and it does not see the design.
 */
const COVER = `(() => {
  const skipText = ['.dmg', '.who'];
  /* \`#shots-stamp\` is this tool's own red bar across a failed capture (see
     \`STAMP\`). It is not part of the product and reporting the wordmark under it
     turns one finding into ten — the failure is already named in the JSON. */
  const skipCover = ['#tip', '.dmg', '.who', '.plate', '.saybubble', '#shots-stamp'];
  const layers = ['#arena', '#stage', '#screen', '#overlay', '#chrome'];
  /* The four text-bearing layers of §4.2. \`#hud\` and not \`#arena\`: the canvas
     holds no text and its \`#devsockets\` fixtures are not on screen. */
  const roots = ['#hud', '#screen', '#overlay', '#chrome'];

  /* A backslash inside this template literal would be eaten before the page
     ever saw it, so the colour is taken apart with indexOf and not a regex.
     Chrome serialises a computed colour as \`rgb(a, b, c)\` or
     \`rgba(a, b, c, d)\`; anything else is treated as fully opaque, which is
     the safe direction — it can only ask for a second look. */
  const alpha = (c) => {
    const t = String(c || '');
    if (!t || t === 'transparent' || t === 'none') return 0;
    const i = t.indexOf('(');
    const j = t.lastIndexOf(')');
    if (i < 0 || j < 0) return 1;
    const p = t.slice(i + 1, j).split(',').map((x) => parseFloat(x));
    return p.length > 3 && Number.isFinite(p[3]) ? p[3] : 1;
  };
  const carried = (el) => {
    let o = 1;
    for (let x = el; x && x.nodeType === 1; x = x.parentElement) o *= Number(getComputedStyle(x).opacity);
    return o;
  };
  /*
   * A BACKDROP FILTER GRADED BY ITS RADIUS, BECAUSE A SCRIM IS NOT A SURFACE.
   *
   * Treating any \`backdrop-filter\` as fully opaque cost eighty-three findings
   * in one state: \`.detail-veil\` is \`rgba(46,46,51,.22)\` with \`blur(2px)\` over
   * the whole career list, and the panel it dims for is the design of §6.6.
   * The same reading condemns \`.modal-veil\` (.28 and \`blur(4px)\`) and the
   * live screen's own veil. A gate that reports the design eighty-three times
   * is a gate somebody switches off.
   *
   * The radius is the difference and the tree draws the line itself: every
   * scrim in it blurs by 2–4 px, and every surface a player cannot read
   * through — the glass of §2.3, the feed, the HUD panels — blurs by 10–18.
   * So the blur counts for radius/12, clamped: 18 px is opaque, 4 px is a
   * softening. A filter with no blur at all (\`saturate(.88)\`, the stage's) is
   * given half, since it tints without hiding.
   */
  const blurred = (st) => {
    const f = st.backdropFilter || st.webkitBackdropFilter || 'none';
    if (f === 'none') return 0;
    /* Taken apart with indexOf, not a regex: a backslash in this template
       literal is eaten before the page ever sees it (see the note on \`alpha\`
       above), and a pattern that loses its escapes is a syntax error the whole
       probe dies of. */
    const i = f.indexOf('blur(');
    if (i < 0) return 0.5;
    const px = parseFloat(f.slice(i + 5));
    return Number.isFinite(px) ? Math.min(1, px / 12) : 0.5;
  };
  const walk = (n, out = []) => {
    for (const c of (n ? n.childNodes : [])) {
      if (c.nodeType === 3 && c.textContent.trim()) {
        const e = c.parentElement;
        const r = e.getBoundingClientRect();
        const st = getComputedStyle(e);
        if (r.width > 4 && r.height > 4 && e.offsetParent !== null && st.visibility !== 'hidden'
          && parseFloat(st.fontSize) >= 4 && alpha(st.color) > 0.05 && carried(e) > 0.05
          && e.closest('[hidden], #devsockets') === null) out.push({ s: c.textContent.trim().slice(0, 22), r, e });
      } else if (c.nodeType === 1) walk(c, out);
    }
    return out;
  };
  const nodes = roots.flatMap((sel) => walk(document.querySelector(sel)))
    .filter((x) => !skipText.some((k) => x.e.closest(k)));

  const touched = [];
  for (const sel of layers) {
    const root = document.querySelector(sel);
    if (!root) continue;
    for (const el of [root, ...root.querySelectorAll('*')]) {
      touched.push([el, el.style.getPropertyValue('pointer-events'), el.style.getPropertyPriority('pointer-events')]);
      el.style.setProperty('pointer-events', 'auto', 'important');
    }
  }

  /* How little of what is behind THIS ONE element survives it, 0…1. Ancestors
     are not walked any more: every one of them stands in the same stack that
     \`elementsFromPoint\` returns, so each is judged on its own terms and the
     walk stops the moment it reaches the text. Walking upwards from the
     topmost hit used to be the only way to see a solid ancestor, and it paid
     for that by never seeing a solid SIBLING one layer down. */
  const solid = (el) => {
    const st = getComputedStyle(el);
    return Math.max(blurred(st), alpha(st.backgroundColor), st.backgroundImage !== 'none' ? 0.45 : 0) * carried(el);
  };
  const name = (el) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '')
    + (el.classList[0] ? '.' + el.classList[0] : '');

  const found = [];
  try {
    for (const node of nodes) {
      const r = node.r;
      const y = Math.round(r.top + r.height / 2);
      const at = [];
      let by = null;
      for (const [where, x] of [['left', Math.round(r.left) + 2],
        ['centre', Math.round(r.left + r.width / 2)], ['right', Math.round(r.right) - 2]]) {
        if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue;
        /* Down the stack until the text itself: the first solid thing above it
           is what a reader would have to see through. Reaching the node — or
           anything inside it, or any ancestor of it — means there was nothing. */
        let over = null;
        for (const hit of document.elementsFromPoint(x, y)) {
          if (hit === node.e || node.e.contains(hit) || hit.contains(node.e)) break;
          if (skipCover.some((k) => hit.closest(k))) continue;
          if (solid(hit) < 0.6) continue;
          over = hit; break;
        }
        if (!over) continue;
        at.push(where);
        by = by || over;
      }
      if (by) found.push('“' + node.s + '” under ' + name(by) + ' at ' + at.join('+'));
    }
  } finally {
    for (const [el, value, priority] of touched) {
      if (value) el.style.setProperty('pointer-events', value, priority);
      else el.style.removeProperty('pointer-events');
    }
  }
  return found;
})()`;

const pageTargets = async (cdp) => new Set(
  (await cdp.send('Target.getTargets')).targetInfos.filter((t) => t.type === 'page').map((t) => t.targetId),
);
/**
 * Close a page target and wait until it is GONE. `Target.closeTarget` returns
 * before the window has been torn down, and the window that is created while
 * that teardown completes is the one born hidden (see `capture`): a spare
 * blank opened too early absorbed nothing, and the state's page took the hit.
 */
async function closeTarget(cdp, id) {
  await cdp.send('Target.closeTarget', { targetId: id }).catch(() => {});
  for (let i = 0; i < 60; i++) {
    if (!(await pageTargets(cdp)).has(id)) return;
    await sleep(50);
  }
}

/**
 * A CROSS-FADE THE BROWSER STOPPED ADVANCING.
 *
 * The reveal in `app.js` hangs off a double `requestAnimationFrame`, and the
 * transition it starts is run by the compositor. Neither is guaranteed in a
 * headless window that nobody is looking at: measured on this stand, the screen
 * came back at opacity .987 once and at 0 with `.entering` still on it another
 * time, with fifteen nodes of specimen inside it. Three captures earlier in the
 * evening were photographs of the backdrop with a ghost of the product on top,
 * and nothing in the files said why.
 *
 * That is the capture rig, not the product — a browser with a person in front
 * of it always fires those frames. So the tool finishes what the environment
 * would not: after the screen has had its own two seconds to arrive, whatever
 * is left mounted is put on its target style, and the JSON records that it had
 * to be. Nothing is forced onto a screen that has drawn nothing, and a screen
 * that is STILL ghosted after this fails the capture — that would be a real
 * defect and not a missing frame.
 */
const REVEAL = `(() => {
  let n = 0;
  for (const el of document.querySelectorAll('#screen > .screen')) {
    if (el.classList.contains('leaving')) { el.remove(); continue; }
    if (!el.firstChild) continue;
    if (!el.classList.contains('entering') && Number(getComputedStyle(el).opacity) >= 0.99) continue;
    el.classList.remove('entering');
    el.style.transition = 'none';
    el.style.opacity = '1';
    el.style.transform = 'none';
    n++;
  }
  return n;
})()`;

/**
 * Wait for the page to settle. Without a `ready` expression this is a flat
 * sleep on purpose: a heuristic that guesses when a screen is "done" is a
 * heuristic that captures the moment before the last fade on the one machine
 * where it matters.
 */
async function settle(page, state) {
  const { wait, ready } = state;
  const ms = WAIT || wait || DEFAULT_WAIT;
  /*
   * FIRST, THE SCREEN HAS TO HAVE ARRIVED.
   *
   * `app.js` mounts the screen at opacity 0 and cross-fades it in when its
   * first node appears (§1.8) — a screen that fetches before it draws starts
   * that fade seconds after the page loads. A settling time that begins on
   * navigation therefore does not begin on the screen, and the picture shows
   * the specimen at a tenth of its opacity with the backdrop reading through
   * it. So the state's own time starts once the screen is mounted and opaque,
   * or after ten seconds of it not being.
   */
  const arrived = Date.now() + 10000;
  let forced = 0;
  while (Date.now() < arrived) {
    const s = await page.evaluate(SIGNALS).catch(() => null);
    if (s && s.nodes > 0 && (s.opacity === null || s.opacity >= 0.99)) break;
    /* Two seconds of the real cross-fade first — it is 600 ms of the product's
       own motion and worth photographing — and only then `REVEAL`. */
    if (s && s.nodes > 0 && Date.now() > arrived - 8000) forced += await page.evaluate(REVEAL).catch(() => 0);
    await sleep(250);
  }
  if (!ready) { await sleep(ms); return { forced, ready: null }; }
  /*
   * AND WHETHER THE GATE WAS EVER MET IS PART OF THE EVIDENCE.
   *
   * The loop used to fall out of its window and shoot anyway with nothing
   * saying so, which is how `live-fighting` came back mid-transition three
   * rounds running. Timing out is still not a failure — an idle stand has no
   * fight to wait for — but a reviewer holding a picture of a resting arena is
   * entitled to know it is a picture of the timeout and not of the phase.
   */
  let met = false;
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (await page.evaluate(ready).catch(() => false)) { met = true; break; }
    await sleep(250);
  }
  /* `dwell`: how long after the gate a state is left to settle before the
     picture — the fighting frame is worth a camera that has finished its
     move, not the second after the VS card dropped. */
  await sleep(state.dwell || 1200);
  return { forced, ready: met };
}

/**
 * DRIVE THE LOOP BEFORE THE SHOT.
 *
 * The page's animation loop is the viewer's: `window.__airenaDrawn.n` counts
 * frames drawn. A capture that shoots the moment the screen is ready shoots
 * the screenshot's own BeginFrame — the frame in which the socket buffer's
 * last impact replays and every camera ease converges in one step, which is
 * how three of six states came back mid hit-flash and every JSON said fps 0.
 * So the page is asked for real frames first: one `requestAnimationFrame`
 * from inside the page per round trip (with a timeout, so a paused loop
 * cannot hang the run), until the counter has advanced by `want` frames.
 * With `--novsync` that is 170 — the governor's 40 warm-up plus its 120-frame
 * window — so `msPerFrame` beside the picture is the page's own number.
 */
async function driveFrames(page, want) {
  const read = 'window.__airenaDrawn ? window.__airenaDrawn.n : -1';
  const start = await page.evaluate(read).catch(() => -1);
  if (start < 0) return { want, ticked: 0, ok: false, ms: 0 };
  const t0 = Date.now();
  const until = t0 + (want > 60 ? 20000 : 6000);
  let n = start;
  while (Date.now() < until && n - start < want) {
    n = await page.evaluate('new Promise((r) => { let done = false;'
      + ' requestAnimationFrame(() => { done = true; r(window.__airenaDrawn ? window.__airenaDrawn.n : -1); });'
      + ' setTimeout(() => { if (!done) r(window.__airenaDrawn ? window.__airenaDrawn.n : -1); }, 250); })').catch(() => n);
  }
  const vis = await page.evaluate('document.visibilityState').catch(() => null);
  return { want, ticked: n - start, ok: n - start >= want, ms: Date.now() - t0, vis };
}

async function capture(cdp, state, size) {
  const url = `${BASE}/#${typeof state.route === 'function' ? state.route() : state.route}`;
  const before = await pageTargets(cdp);
  /*
   * A WINDOW OPENED RIGHT AFTER A CLOSE IS BORN HIDDEN.
   *
   * In headless Chrome the first window created after any
   * `Target.closeTarget` comes up with `document.visibilityState` 'hidden'
   * and its `requestAnimationFrame` never fires — whatever is waited for,
   * activated or brought to the front afterwards. Each state closes the
   * previous state's page, so every page this run opened was that window:
   * the arena's loop never ran, the only frame in every picture was the
   * screenshot's own BeginFrame, every JSON said fps 0 / drawn 0, and three
   * of six states were shot mid hit-flash. Measured on this stand: close →
   * open = hidden, 0 frames in 8 s; close → a blank → open = visible, and a
   * page navigated in place stays visible. So every close is waited out
   * (`closeTarget` above) and a throwaway blank takes that fate before the
   * state's page is opened; the blank is never closed (a close would poison
   * the next state's page the same way), and the eighteen a run leaves are
   * windows on nothing that die with the browser.
   */
  const { targetId: spare } = await cdp.send('Target.createTarget', { url: 'about:blank', newWindow: true });
  await sleep(150);
  before.add(spare);
  const page = await openFor(cdp, state, url, size);
  let overlaps = [];
  let covered = [];
  let failure = null;
  let session = null;
  let signals = null;
  let unfinished = null;
  let missing = null;
  let stalled = null;
  let loop = null;
  try {
    const seed = await reseed(cdp, page, state);
    if (!seed.ok) session = seed.error;
    const settled = await settle(page, state);
    /* `act` is the state's own last gesture — focusing a tile to open its
       tooltip, clicking the button that lifts the birth screen's veil. It runs
       after the screen has settled and before the probe, and its own beat is
       the length of the motion it starts: 180 ms for a tooltip's fade, longer
       for a layout that rearranges (`actWait`). */
    if (state.act) { await page.evaluate(state.act).catch(() => {}); await sleep(state.actWait || 600); }
    /* The arena states carry a picture of the renderer: it has to have drawn
       real frames first (see `driveFrames`). A loop that never ticked is a
       flaw on the capture, not a soft picture. */
    if (/^live-/.test(state.id)) {
      loop = await driveFrames(page, NOVSYNC ? 170 : 24);
      if (!loop.ok) stalled = `loop: ticked ${loop.ticked} of ${loop.want} frames in ${loop.ms} ms (page ${loop.vis}) — the arena did not draw for the capture`;
    }
    /*
     * ── AND THE STATE SAYS WHAT WOULD MAKE IT ITSELF ─────────────────────
     *
     * A `?ui=` id a screen does not recognise is not an error: the screen
     * renders its ordinary self, the page is clean, both probes are green, and
     * the file is written under the name of the state that is missing. That is
     * the exact shape of the failure this whole file was written against — a
     * picture that is indistinguishable from evidence at a glance — and it is
     * how the two first-fight states could have been "added" without existing.
     *
     * So a state may name the one thing that proves the screen understood it.
     * The expression is cheap and structural, never a copy string: what it
     * must survive is somebody rewriting the sentence in the picture.
     */
    if (state.requires) {
      const ok = await page.evaluate(state.requires.is).catch(() => false);
      if (!ok) missing = `fixture: ${state.requires.why}`;
    }
    /*
     * A screen still arriving is given one more second before it is called a
     * failure: a cross-fade is 600 ms and a settling time that ends inside one
     * is bad luck, not a defect. Two readings a second apart also say WHICH it
     * is — a screen that is still fading on the second look is a screen that
     * never finished.
     */
    signals = await page.evaluate(SIGNALS).catch(() => null);
    if (signals) { signals.forced = settled.forced; signals.ready = settled.ready; signals.loop = loop; signals.dpr = DPR; }
    if (signals && signals.opacity !== null && signals.opacity < 0.99) {
      await sleep(1100);
      signals = await page.evaluate(SIGNALS).catch(() => signals);
    }
    /*
     * The threshold is a tenth, not a hundredth. A screen at .99 and a screen
     * at 1 are the same picture; a screen at .1 is the backdrop with a ghost on
     * it, which is what three captures came back as. The number is in the JSON
     * either way — only the ruined ones are called failures.
     */
    if (signals && signals.opacity !== null && signals.opacity < 0.9) {
      unfinished = `screen: still arriving — .${(signals.classes || 'screen').split(' ').join('.')}`
        + ` at opacity ${signals.opacity.toFixed(2)}, ${signals.mounted} mounted`;
    }
    const stamped = session || missing || unfinished || stalled;
    if (stamped) await page.evaluate(STAMP(stamped)).catch(() => {});
    overlaps = await page.evaluate(PROBE).catch((e) => [`probe failed: ${e.message}`]);
    /* Both probes run BEFORE the shot and neither leaves a mark on the page:
       `PROBE` only measures, `COVER` puts every style it borrowed back. */
    covered = await page.evaluate(COVER).catch((e) => [`cover probe failed: ${e.message}`]);
    await page.shot(join(OUT, `${state.id}${size.suffix}.png`));
  } catch (e) {
    failure = e.message;
  }
  /* The viewer's framing diagnostics (`camera lost …`) are console.error by design and not UI defects. */
  const errors = [...new Set(page.errors.map((e) => String(e).split('\n')[0].slice(0, 200)))].filter((e) => !/^camera lost/.test(e));
  const flaw = session || missing || unfinished || stalled;
  if (flaw) errors.unshift(flaw);
  if (failure) errors.push(`capture failed: ${failure}`);
  writeFileSync(join(OUT, `${state.id}${size.suffix}.json`),
    `${JSON.stringify({ state: state.id, group: state.group || null, url, size: `${size.w}x${size.h}`, session: flaw, signals, errors, overlaps, covered }, null, 2)}\n`);
  /* Each state gets a fresh page and the old one is closed: twenty WebGPU
     contexts alive at once is a different measurement than one. */
  const after = await pageTargets(cdp);
  for (const id of after) if (!before.has(id)) await closeTarget(cdp, id);
  return { errors, overlaps, covered, flaw, signals };
}

// ── the run ────────────────────────────────────────────────────────────────

const pad = (s, n) => String(s).padEnd(n);


/*
 * ONE CHROME AT A TIME, MACHINE-WIDE.
 *
 * Many agents may ask for captures at once; a headless Chrome with WebGPU is
 * the one expensive thing in this repository, and eight of them once took the
 * machine down. The lock is a directory (mkdir is atomic); a pid file inside
 * lets a crashed holder be reclaimed. Waiting callers poll for up to 20 min.
 */
import { rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
const LOCK = join(tmpdir(), 'airena-shots.lock');
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
async function acquireLock() {
  const started = Date.now();
  for (;;) {
    try { mkdirSync(LOCK); writeFileSync(join(LOCK, 'pid'), String(process.pid)); return; } catch { /* held */ }
    let pid = 0;
    try { pid = Number(readFileSync(join(LOCK, 'pid'), 'utf8')); } catch { /* being written */ }
    if (pid && !alive(pid)) { try { rmSync(LOCK, { recursive: true, force: true }); } catch { /* raced */ } continue; }
    if (Date.now() - started > 20 * 60e3) throw new Error('another capture has held the Chrome lock for 20 minutes');
    await new Promise((r) => setTimeout(r, 2000));
  }
}
function releaseLock() { try { rmSync(LOCK, { recursive: true, force: true }); } catch { /* already gone */ } }
process.on('exit', releaseLock);

async function main() {
  const chapters = [...new Set(STATES.map((s) => slug(s.group)).filter(Boolean))];
  const states = STATES.filter((s) => !ONLY || ONLY.includes(s.id) || ONLY.map(slug).includes(slug(s.group)));
  if (!states.length) {
    console.log(`\n  no state matches --only=${ONLY.join(',')}`);
    console.log(`  states:   ${STATES.map((s) => s.id).join(' ')}`);
    console.log(`  chapters: ${chapters.join(' ')}\n`);
    process.exit(1);
  }
  /* `--list` answers "what would this capture?" without opening a browser. */
  if (LIST) {
    let seen = null;
    console.log('');
    for (const s of states) {
      if (s.group !== seen) { seen = s.group; console.log(`  ${s.group}`); }
      const route = typeof s.route === 'function' ? s.route() : s.route;
      const who = s.session === 'guest' ? '(as a stranger)' : '';
      console.log(`    ${pad(s.id, 20)} #${pad(route, 34)}${pad(who, 16)}${s.note || ''}`.trimEnd());
    }
    console.log(`\n  ${states.length} states, ${states.length * SIZES.length} pictures\n`);
    process.exit(0);
  }
  mkdirSync(OUT, { recursive: true });

  const stamp = provenance();
  const shortDb = stamp.db.exists
    ? `${stamp.db.path}  ${(stamp.db.bytes / 1e6).toFixed(1)} MB, modified ${stamp.db.modified?.slice(0, 16).replace('T', ' ')}`
    : `${stamp.db.path}  MISSING — the owner states will be stamped`;
  console.log(`\n  SCREEN STATES\n\n  base   ${BASE}\n  out    ${OUT}`
    + `\n  sizes  ${SIZES.map((z) => `${z.w}×${z.h}`).join('  ')}`
    + `\n  tree   ${stamp.commit ? `${stamp.commit.slice(0, 10)} on ${stamp.branch}` : 'not a git checkout'}`
    + `${stamp.dirtyFiles ? DIM(` + ${stamp.dirtyFiles} uncommitted files`) : ''}`
    + `\n  db     ${shortDb}\n`);
  const startedAt = Date.now();

  await acquireLock();
  /* A browser that fails to come up is worth one more try before a run of
     fifty-six pictures is thrown away: the machine is at its busiest exactly
     when several agents are queued behind this lock. */
  let browser = null;
  for (let attempt = 0; attempt < 2 && !browser; attempt++) {
    /* `--novsync`: no frame-rate limit and no vsync, as `arenashot.mjs` runs —
       for a frame-rate reading rather than a picture. Under vsync the loop's
       fps is the cap, not the cost. Off by default: captures are pictures. */
    const extraFlags = process.argv.includes('--novsync') ? ['--disable-frame-rate-limit', '--disable-gpu-vsync'] : [];
    try { browser = await launchChrome({ w: DESKTOP.w, h: DESKTOP.h, extraFlags }); } catch (e) {
      if (attempt) throw e;
      console.log(DIM(`  chrome did not come up (${e.message}) — one more try`));
      await sleep(3000);
    }
  }
  const cdp = new Cdp(browser.ws);
  const rows = [];
  try {
    /*
     * THE LAUNCH'S OWN WINDOW IS NEVER CLOSED (see `capture` for the rule it
     * is part of): the boot page is closed below, the `about:blank` Chrome
     * was launched with is not.
     */
    const launchIds = await pageTargets(cdp);
    /* One page first, only to raise the session and hand it a creature. */
    const boot = await openPage(cdp, `${BASE}/#/live`, DESKTOP);
    await sleep(2500);
    let who = null;
    for (let i = 0; i < 12 && !who?.accountId; i++) {
      who = await boot.evaluate(WHOAMI).catch(() => null);
      if (!who?.accountId) await sleep(500);
    }
    account = who?.accountId || null;
    if (account) {
      const claim = await giveCreature(account);
      console.log(`  claim  ${claim.note}`);
      if (!claim.ok) claimFailure = claim.note;
    } else {
      claimFailure = `the page never reported an account — ${boot.errors[0] || 'no session'}`;
      console.log(`  claim  ${claimFailure}`);
    }
    /*
     * And check that the page actually got it. Two capture runs on one stand
     * steal the creature from each other — the claim points ONE row at
     * whichever guest booted last — and the loser photographs a visitor's
     * ladder and calls it evidence. Measured: half a run came back with the
     * "CREATE A CREATURE" chip because a second run booted mid-flight.
     */
    if (account && !claimFailure) {
      let bound = false;
      for (let i = 0; i < 3 && !bound; i++) {
        const now = await boot.evaluate(WHOAMI).catch(() => null);
        if (now?.hasCreature) { bound = true; break; }
        await sleep(700);
        await giveCreature(account);
      }
      if (!bound) claimFailure = 'the page still reports no creature — another capture run may be holding it';
    }
    claimed = await boot.evaluate("localStorage.getItem('airena.session')").catch(() => null);
    if (!claimed) claimFailure = claimFailure || 'no session token in the page';
    /*
     * A run that never became the owner cannot photograph the owner's product,
     * and §10's Create, Creature, History and Ladder are exactly that. It is
     * said once here, loudly, and again on every state it costs.
     */
    if (claimFailure) {
      console.log(RED(`  claim  FAILED: ${claimFailure}`));
      console.log(RED('         every state that needs the owner will be stamped and the run will exit non-zero'));
    }
    console.log(`  replay ${await findReplay()}\n`);
    const bootIds = await pageTargets(cdp);
    for (const id of bootIds) if (!launchIds.has(id)) await closeTarget(cdp, id);

    /* The run reads as the journey it captures: one heading per chapter, so a
       missing chapter is visible in the log and not only in the directory. */
    let heading = null;
    for (const state of states) {
      if (state.group && state.group !== heading) { heading = state.group; console.log(`\n  ${heading}`); }
      for (const size of SIZES) {
        const r = await capture(cdp, state, size);
        rows.push({ id: state.id + size.suffix, group: state.group || null, ...r });
        const line = `    ${pad(state.id + size.suffix, 20)} ${pad(`${r.errors.length} err`, 8)}`
          + ` ${pad(`${r.overlaps.length} overlap`, 12)} ${r.covered.length} covered`;
        console.log(r.flaw ? RED(`${line}   ${r.flaw}`) : line);
      }
    }
  } finally {
    await closeChrome(browser);
    releaseLock();
  }

  const wrong = rows.filter((r) => r.flaw);
  const bad = rows.filter((r) => r.errors.length && !r.flaw);
  const lapped = rows.filter((r) => r.overlaps.length);
  const buried = rows.filter((r) => r.covered.length);

  console.log(`\n  ${'STATE'.padEnd(22)} ${'ERRORS'.padEnd(8)} ${'OVERLAPS'.padEnd(9)} COVERED`);
  console.log(`  ${'─'.repeat(22)} ${'─'.repeat(8)} ${'─'.repeat(9)} ${'─'.repeat(8)}`);
  let head = null;
  for (const r of rows) {
    if (r.group && r.group !== head) { head = r.group; console.log(`  ${head}`); }
    const line = `  ${pad(r.id, 22)} ${pad(r.errors.length, 8)} ${pad(r.overlaps.length, 9)} ${r.covered.length}`;
    console.log(r.flaw ? RED(`${line}   ${r.flaw.split(':')[0]}`) : line);
  }

  if (wrong.length) {
    console.log(RED('\n  stamped, and not evidence of anything but themselves:'));
    for (const r of wrong) console.log(RED(`    ${pad(r.id, 22)} ${r.flaw}`));
  }
  if (bad.length) {
    console.log('\n  console errors:');
    for (const r of bad) for (const e of r.errors.slice(0, 3)) console.log(`    ${r.id}: ${e}`);
  }
  if (lapped.length) {
    console.log(RED('\n  overlapping text:'));
    for (const r of lapped) for (const o of r.overlaps.slice(0, 3)) console.log(RED(`    ${r.id}: ${o}`));
  }
  if (buried.length) {
    console.log(RED('\n  text under a panel:'));
    for (const r of buried) for (const o of r.covered.slice(0, 3)) console.log(RED(`    ${r.id}: ${o}`));
  }

  /*
   * AND WHAT IS IN THAT DIRECTORY THAT NOTHING PRODUCES.
   *
   * `creature-tooltip.png` lay here through a whole review round: taken by hand
   * in the morning, nine hours older than the build it was read as evidence of,
   * arguing for two defects that had been fixed by lunchtime. A file no state
   * writes has no date a reviewer can see, so the run names them. It does not
   * delete them — a picture may be someone's working note — it only refuses to
   * let one pass as part of the set.
   */
  const known = new Set(['run.json',
    ...STATES.flatMap((s) => ALL_SIZES.flatMap((z) => [`${s.id}${z.suffix}.png`, `${s.id}${z.suffix}.json`]))]);
  const orphans = readdirSync(OUT).filter((f) => /\.(png|json)$/.test(f) && !known.has(f));
  if (orphans.length) {
    console.log('\n  in this directory but produced by no state — an older build, or taken by hand:');
    for (const f of orphans) console.log(`    ${f}`);
  }

  console.log(`\n  ${rows.length} captures in ${OUT}`);
  /*
   * §12 ASKS FOR THREE THINGS AND THE RUN NOW ANSWERS FOR THREE.
   *
   * "No console errors" and "the right session" already failed the run.
   * "No overlapping text at 1440×900 / 1280×720 / 390×844" was measured, printed
   * and then forgiven — a number under a heading nobody has to act on. Both
   * kinds of collision now cost the same exit code as an error does: a picture
   * of two lines sharing a pixel, or of a panel standing on a line, is not
   * evidence that the screen is finished.
   */
  const collided = [...new Set([...lapped, ...buried])];
  const failures = wrong.length + bad.length + collided.length;

  /* The stamp (see `provenance`), written whatever the outcome — a failed run
     is the one a reviewer most needs to date. `--only` is recorded because a
     partial run beside a full one is otherwise indistinguishable from a run
     that lost half its states. */
  writeFileSync(join(OUT, 'run.json'), `${JSON.stringify({
    ...stamp,
    finishedAt: new Date().toISOString(),
    seconds: Math.round((Date.now() - startedAt) / 1000),
    only: ONLY,
    partial: !!ONLY,
    claim: claimFailure ? { ok: false, why: claimFailure } : { ok: true, creature: CLAIM_ID, account },
    replay: REPLAY.id,
    captures: rows.length,
    failures,
    states: rows.map((r) => ({
      id: r.id,
      errors: r.errors.length,
      overlaps: r.overlaps.length,
      covered: r.covered.length,
      flaw: r.flaw || null,
    })),
  }, null, 2)}\n`);

  if (wrong.length) console.log(RED(`\n  FAILED: ${wrong.length} of ${rows.length} photographed the wrong session or a screen still arriving`));
  if (bad.length) console.log(`${wrong.length ? '' : '\n'}  FAILED: ${bad.length} of ${rows.length} had console errors`);
  if (collided.length) console.log(RED(`${wrong.length || bad.length ? '' : '\n'}  FAILED: ${collided.length} of ${rows.length} have text on text or text under a panel (§12)`));
  console.log(failures ? '' : '\n  CLEAN\n');
  if (failures) console.log(DIM(`  repeat:  node tools/shots.mjs --base=${BASE} --out=${OUT} --only=${[...new Set([...wrong, ...bad, ...collided].map((r) => r.id.replace(/-[mw]$/, '')))].join(',')}\n`));
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(`\n  shots.mjs died: ${e.stack || e.message}\n`); process.exit(1); });
