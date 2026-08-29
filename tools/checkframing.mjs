#!/usr/bin/env node
/**
 * The camera, asserted — the viewer's own framing solve, on a headless replay.
 *
 *   node tools/checkframing.mjs
 *   node tools/checkframing.mjs --seeds=101,202,808 --aspect=16:9 --fps=23 --verbose
 *   node tools/checkframing.mjs --pop=brains --pairs=probe-corner/probe-jumpspam
 *
 * `npm test` never touched the viewer, so a camera regression was invisible to
 * everything except a person watching a fight — and the one that matters is
 * invisible to them too until it happens: the shot stays composed and a FIGHTER
 * leaves the picture. It has been fixed twice and come back twice. This is the
 * check that was missing.
 *
 * ── what this runs, and therefore what it proves ────────────────────────────
 *
 * It runs THE VIEWER'S SOURCE. Not a port of it, not a model of it: this file
 * reads `src/viewer/main.js` off disk at startup, cuts ten named slices out of
 * it — the arena solids, the occlusion test, the body loader, the fx drain, the
 * snapshot interpolator, the whole camera section from `camModes` to the end of
 * `checkFraming`, and the head of the render loop itself — and evaluates that
 * text in one function scope. `updateCamera`, `checkFraming`, `holds`,
 * `hiddenCount`, `segSolid`, `FRAME_EDGE` and every constant they read are the
 * bytes that are in main.js right now. There is no second copy of the solve in
 * this repo to drift out of step with the first, and the anchors that locate
 * the slices must each match exactly once or this throws by name.
 *
 * The three.js is the same three.js, not an equivalent one: the browser's
 * importmap points `three` at `/vendor/three.webgpu.js`, which
 * `src/server/index.js` mounts from `node_modules/three/build` — the exact file
 * `import * as THREE from 'three/webgpu'` resolves to here. `PerspectiveCamera`,
 * `project`, `Vector3`, `MathUtils` and `Box3` are shared, not reimplemented.
 *
 * ── why this and not the real browser ───────────────────────────────────────
 *
 * Option (a) — driving the real page over the playwright MCP tools — IS the
 * stronger evidence, and it was run (below). It is not what ships, for two
 * measured reasons. `playwright` is not a dependency of this project
 * (`node_modules` holds `three` and `ws`), so `npm test` cannot import it. And
 * the server streams a match in REAL TIME at 30 Hz: the 18 matches below are
 * 447 s of fight plus 18 banners, about 8.2 minutes of wall clock in a browser,
 * against 2.4 s here. A suite that takes eight minutes and needs a browser is a
 * suite that gets commented out, and this check's whole purpose is to be in the
 * one command people actually run.
 *
 * So the browser was used as a CALIBRATION, once, and the numbers are recorded
 * here rather than the method being shipped.
 *
 * What this therefore proves: that the framing rule in main.js holds over the
 * matches replayed here, for everything the camera reads — both fighters'
 * interpolated positions, the arena solids, the measured body heights, the hit
 * shake, `decided`, and the aspect ratio. What it does NOT prove: that a real
 * GPU frame draws where the projection says it does, that the resize handler is
 * right, or that anything DOM-side feeds back into the eye. Those need a
 * browser, and the run below is what stands in for them.
 *
 * ── the glue that is NOT the viewer's, listed honestly ──────────────────────
 *
 * Four things here are mine and could be wrong independently of main.js:
 *
 *  1. `arrive()` and `startMatch()` — the socket's 'frame' branch, and the
 *     non-DOM half of its 'match' branch. Four lines and three.
 *  2. The frame ARRIVAL model: snapshot `t` arrives at wall-clock `t`, which is
 *     what `src/server/index.js` does at speed 1 (`setInterval(1000/TICK_HZ)`).
 *  3. A fixed render step. A browser's is jittery; `--fps` at least lets the
 *     rate be moved, and the servo is the one rate-dependent part of the solve.
 *  4. `playFx`, reduced to the single line of it that moves the eye.
 *
 * Paraphrasing more than that was tried and was wrong within the hour: a
 * hand-written copy of the render loop's head kept reading the socket's `over`
 * message after a concurrent pass moved the kill push-in onto the frame's own
 * `decided` flag, and the replay quietly held the eye at 13 m through every
 * death for 2.6 s. Slicing the loop instead of describing it caught that on the
 * next run. Where a thing can be cut out of main.js, it is cut out.
 *
 * ── the browser cross-check (playwright MCP, 2026-08-26) ────────────────────
 *
 * `npm run serve`, then the real viewer in headless Chromium at 1600x900 on the
 * WebGPU backend, probe-corner vs probe-jumpspam at seed 101, speed 1x, with
 * `window.airena` sampled every rendered frame for the whole 14.3 s match: 325
 * live frames at a median dt of 44.3 ms (22.2 fps). Against this harness on the
 * same pairing, seed and aspect at `--fps=23`, over 15 checkpoints spread
 * across the match:
 *
 *   camState.dist    mean |Δ| 0.072 m   worst 0.863 m
 *   camState.height  mean |Δ| 0.057 m   worst 0.499 m
 *   camState.az      mean |Δ| 0.0120 rad worst 0.0454 rad
 *   worst |ndc|      browser 0.6422     here 0.6430
 *   bodies.height    octopus 1.1272240730286684, gorilla 2.0790089545814134
 *                    — identical to the last digit, both sides
 *
 * Both worst-case rows are the FIRST checkpoint, 0.09 s in, where the browser's
 * own first frame took 118 ms against a flat 43.5 here; by the second
 * checkpoint dist agrees to 0.004 m. Everything in the solve is an exponential
 * ease on `dt`, so that is the render-step model (item 3), not the solve. The
 * viewer's own red box stayed empty and this harness said HOLDS.
 *
 * ── what it found on its first run ──────────────────────────────────────────
 *
 * A fighter off the picture at t=0.0 s in 14 of 36 replays, worst |ndc| 1.389 —
 * not during a fight but on the opening frame of one. `camState` survives a
 * match, so match two opens on the framing match one's corpse ended in, ~9.5 m
 * out, and has to reach the ~28 m a 31 m spawn needs.
 *
 * Driving two back-to-back matches in the real browser reproduced it exactly:
 * camState.dist 9.516 m carried over, then
 *   `camera lost octopus at t=0.0s — ndc (-1.29, -0.14), body at (15.5, 0.2),
 *    eye 14.4 m out`
 * in the viewer's own error box. main.js has since exempted the snap from the
 * 26 m/s dolly cap, and all 36 replays are clean. The opening still gets its
 * own reported line — it is a distinct failure mode with its own history — but
 * it is judged by exactly the same rule as any other frame.
 *
 * ── the pairings, the seeds, and the two windows ────────────────────────────
 *
 * The six pairings and the seeds are the ones main.js's own camera comments
 * were measured on (l1/l3, l1/l4, l3/l1, l1/l6, l2/l5, l4/l2 at 101 and 202,
 * plus 808 — the seed that caught the one-step distance servo at |ndc| 0.96),
 * so the numbers this prints can be read straight against those comments. The
 * 18 matches run back-to-back through ONE viewer, exactly as a viewer with
 * `loop` ticked does, which is what makes the hand-over between matches
 * reachable at all: measured, the eye starts a match between 9.5 m and 24.5 m
 * out across those 17 hand-overs.
 *
 * Two windows, because `camera.aspect` is `innerWidth / innerHeight` and the
 * distance solve sizes the shot to the HORIZONTAL field of view, so a narrower
 * window is a strictly tighter frame and a browser only ever tests the shape it
 * happens to be open at. 16:9 lands at worst |ndc| 0.875 and 4:3 at 0.877,
 * against FRAME_EDGE 0.92 — 0.045 of margin. That margin is thin on purpose:
 * `FRAME_TARGET` is 0.88 and the servo solves to it, so anything much under
 * 0.88 would mean the servo was not being exercised at all.
 *
 * Negative controls, so "it passes" means something: at `--aspect=1:2` all 18
 * matches fail at |ndc| 1.579 with the eye pinned at the servo's 44 m cap, and
 * at `--fps=10` the check still holds at 0.876. So it fails when the framing
 * genuinely cannot hold, and does not fail merely because a client is slow.
 */

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as THREE from 'three/webgpu';
import * as TSL from 'three/tsl';

import {
  ARENA_HALF, FIGHTERS, MATCH_SECONDS, OBSTACLES, SKILLS, SUDDEN_DEATH_AT,
  SUDDEN_DEATH_RAMP, THINK_HZ, TICK_HZ, WALL_HEIGHT,
} from '../src/core/config.js';
import { compileBrain } from '../src/brain/host.js';
import { createWorld, snapshot, step } from '../src/core/sim.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function arg(name, dflt) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (hit) return hit.slice(name.length + 3);
  return process.argv.includes(`--${name}`) ? true : dflt;
}

const VERBOSE = Boolean(arg('verbose', false));
const SEEDS = String(arg('seeds', '101,202,808')).split(',').map(Number).filter(Number.isFinite);
/**
 * The viewer's window, and one narrower one.
 *
 * See the header for why two: a narrower window is a strictly tighter frame.
 * 16:9 is what a maximised laptop gives; 4:3 is the narrowest shape a real
 * window takes, and adding it costs 0.25 s (1.75 s -> 2.00 s for the run).
 */
const ASPECTS = String(arg('aspect', '16:9,4:3')).split(',').map((s) => {
  const [w, h] = s.split(':').map(Number);
  return { label: s, w: w * 100, h: h * 100 };
});

/** The curtain the live server opens every match with. */
const CURTAIN = 2.6;
/** How long the viewer keeps rendering a finished match before it may loop. */
const AFTER_OVER = CURTAIN;
/**
 * The render rate to replay at.
 *
 * 60 is what a browser on a desktop gives, and it is the SOFTER of the two
 * cases: almost everything in the solve is an exponential ease on `dt` and
 * therefore rate-independent, but the framing servo is not — it steps the
 * distance by up to 8% four times PER FRAME, so a client drawing half as often
 * gets half as much rescue per second. The headless browser this was
 * cross-checked against ran at 23 fps, which is why `--fps` exists.
 */
const RENDER_DT = 1 / Number(arg('fps', 60));
/** Where to write the per-frame camera trail, for reproducing the header. */
const DUMP = arg('dump', null);

// ---------------------------------------------------------------------------
// the viewer's own source, cut out and made runnable
// ---------------------------------------------------------------------------

const MAIN = join(ROOT, 'src', 'viewer', 'main.js');
const SRC = readFileSync(MAIN, 'utf8');

/**
 * One slice of main.js, by the text that starts it and the text that ends it.
 *
 * Both anchors must appear EXACTLY ONCE. That is the drift alarm: if someone
 * renames `updateCamera`, splits the camera section, or writes a second
 * `const SOLIDS = []`, this throws with the anchor's name instead of quietly
 * asserting against a stale copy — which is the whole failure mode this file
 * exists to close, one level up.
 */
function cut(from, to) {
  const at = (needle) => {
    const i = SRC.indexOf(needle);
    if (i < 0) throw new Error(`src/viewer/main.js no longer contains ${JSON.stringify(needle)} — `
      + 'the camera section moved, and this check is asserting against nothing until its anchors are updated');
    if (SRC.indexOf(needle, i + 1) >= 0) throw new Error(`${JSON.stringify(needle)} appears twice in `
      + 'src/viewer/main.js — the slice is ambiguous, pick a longer anchor');
    return i;
  };
  const a = at(from), b = at(to);
  if (b <= a) throw new Error(`slice ${JSON.stringify(from)} … ${JSON.stringify(to)} runs backwards`);
  return SRC.slice(a, b);
}

const SLICES = [
  // HALF
  ['const HALF = cfg.arena.half;', 'const scene = new THREE.Scene();'],
  // scene, and the real camera with its real fov and clip planes
  ['const scene = new THREE.Scene();', 'const forceWebGL = new URLSearchParams('],
  // the walls and blocks the occlusion test sees, built by the code that builds them
  ['const SOLIDS = [];', 'function segSolid(eye, px, py, pz, o) {'],
  // segSolid, SAMPLE_HEIGHTS, hiddenCount, loadBody
  ['function segSolid(eye, px, py, pz, o) {', 'const _span = { min: 0, max: 0 };'],
  // the scratch vector checkFraming projects through
  ['const _p = new THREE.Vector3();', 'function project(x, y, z) {'],
  // the fx queue drain, because a hit is what puts shake on the lens
  ['/** Fire every queued effect the render clock has now caught up with. */', 'function updateFx(now) {'],
  // frames, pendingFx, renderClock, over, decided, SNAP_DT, DELAY
  ['let frames = [];', 'let ws;'],
  // THE CAMERA: camModes … camState … updateCamera … FRAME_EDGE … checkFraming
  ["const camModes = ['auto', 'wide', 'top'];", 'function poseAction(f, id, now) {'],
  // shortAngle, interpolate, lerp, and the render loop's own `last` and `dt`
  ['const shortAngle = (a, b, t) => {', "if (params.get('shots')) {"],
  /*
   * THE LOOP, down to where it stops being about the camera.
   *
   * `frame()` is cut at the body-posing loop and closed by the epilogue with the
   * three calls that follow it in main.js. Everything between the cut and those
   * calls poses bodies and writes HUD: it reads `view`, never writes it, and
   * `updateCamera` takes `view` and `bodies[id].height` as its only inputs from
   * that stretch. Taking the head of the loop rather than paraphrasing it is
   * what caught `decided` — a concurrent pass moved the kill push-in off the
   * socket's `over` message and onto the frame's own flag, and a paraphrase of
   * this loop written an hour earlier silently kept the old behaviour.
   */
  ['function frame() {', "    for (const id of ['octopus', 'gorilla']) {\n      const body = bodies[id];"],
];

/**
 * What the browser hands main.js that Node does not.
 *
 * `$`, `boot` and `fail` are the only DOM the slices touch: the camera button's
 * click handler, the boot overlay's removal, and the one line in `checkFraming`
 * that reports. `performance` is shadowed on purpose — the eye's shake and the
 * loop's own `dt` read it, and a wall clock would make this non-deterministic.
 *
 * `playFx` is the exception worth naming. The real one spawns meshes, floats
 * damage numbers and writes the feed; exactly one line of it moves the eye, and
 * that line is copied here verbatim. `playFxUpTo`, which decides WHEN it fires,
 * is sliced from main.js like everything else.
 */
const PRELUDE = `
const failures = [];
const fail = (m) => { failures.push({ msg: m, rc: renderClock }); };
const $ = () => ({ classList: { add() {}, remove() {}, toggle() {} }, style: {}, textContent: '' });
const boot = { remove() {} };
const performance = { now: () => clock.t * 1000 };
const innerWidth = viewport.w, innerHeight = viewport.h;
const playFx = (e) => {
  // main.js, playFx: "A knock on the lens, scaled to the hit."
  if (e.kind === 'hit') camState.shake = Math.min(0.55, camState.shake + e.amount / 90);
};
/*
 * The effects layer, stubbed to its clock.
 *
 * The render loop advances the particle pool's time on every frame, and that
 * loop is sliced out of main.js whole — so the name has to exist here.
 * Stubbing it is honest rather than convenient: the pool has no effect on the
 * camera at all. It integrates motion analytically in the vertex shader and
 * never reads or writes view, camState or bodies; what moves the eye is the
 * one line copied from playFx above, and that line is here in full.
 *
 * (No backticks in this comment on purpose: it lives inside a template
 * literal, and one would end the PRELUDE early.)
 */
const vfx = { update() {}, play() {} };
`;

/**
 * The three lines main.js's loop runs next, and the harness around it.
 *
 * The last slice ends `frame()` mid-body, at the point where the loop stops
 * being about the camera; these close it with the calls that really follow —
 * copied from main.js, `updateOcclusion` dropped because it runs AFTER the
 * camera and only sets material opacities. `measure` is inserted between the
 * solve and the assertion so the margin is recorded on the same eye the
 * assertion grades.
 */
const EPILOGUE = `
    updateCamera(view.octopus, view.gorilla, dt);
    measure(view, fr.a.t);
    checkFraming(view, fr.a.t);
  }
}

const bodies = {};
for (const id of ['octopus', 'gorilla']) bodies[id] = await loadBody(id);

/**
 * The 'match' branch of the socket handler, minus its DOM half.
 *
 * \`last = clock.t\` is the one line that is not the viewer's. The browser's loop
 * never stops, so its first frame after a match starts has an ordinary \`dt\`;
 * this clock restarts at 0 per match, and without the reset the first \`dt\`
 * would be the whole previous match — which \`Math.min(0.1, ...)\` would cap into
 * a 100 ms frame nobody ever draws.
 */
function startMatch() {
  frames = []; pendingFx = []; renderClock = 0; over = null; decided = false; framingLost = false;
  camState.snap = true;
  last = clock.t;
  failures.length = 0;
  trail.length = 0;
  // Per match, like the two above it. One viewer is reused across every replay,
  // so a counter that does not reset here is summed again on every subsequent
  // match — which is how the line this feeds came to report 19 samples per
  // rendered frame in a world with two fighters.
  graded = 0;
}

/** The 'frame' branch of the socket handler, whole — it has no DOM half. */
function arrive(f) {
  frames.push(f);
  if (frames.length === 1) renderClock = f.t - DELAY;
  if (frames.length > 240) frames.splice(0, frames.length - 240);
  if (f.fx.length) pendingFx.push({ t: f.t, fx: f.fx });
}

/*
 * How far out the worse-placed fighter sat, EVERY frame, by the rule
 * \`checkFraming\` uses. \`checkFraming\` is the assertion and stops at its first
 * failure; this is the margin, so a run can report how much room it had left
 * and where it ran out rather than only a verdict. Policy — which part of a
 * match a number belongs to — is applied in Node, over this.
 */
const trail = [];
let graded = 0;
function measure(view, t) {
  camera.updateMatrixWorld();
  let worst = 0, who = null;
  for (const id of ['octopus', 'gorilla']) {
    const v = view[id];
    if (!v || (!v.alive && !decided)) continue;
    graded++;
    _p.set(v.x, v.y + (bodies[id]?.height ?? 2) * 0.5, v.z).project(camera);
    const n = Math.max(Math.abs(_p.x), Math.abs(_p.y));
    if (n > worst) { worst = n; who = id; }
  }
  if (who) trail.push({ rc: renderClock, t, ndc: worst, id: who, dist: camState.dist, height: camState.height, az: camState.az });
}

return {
  startMatch, arrive, render: frame, camState, FRAME_EDGE,
  /* Nothing downstream of the socket reads \`over\` any more — a concurrent pass
     moved the camera onto the frame's own \`decided\` flag — but the socket still
     sets it, so the replay still sets it. The day it matters again it is here. */
  setOver: (v) => { over = v; },
  report: () => ({ failures: failures.slice(), trail: trail.slice(), graded }),
};
`;

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

/** Exactly what `src/server/index.js` answers `/api/config` with. */
const CONFIG = {
  arena: { half: ARENA_HALF, wallHeight: WALL_HEIGHT, obstacles: OBSTACLES },
  fighters: FIGHTERS,
  skills: SKILLS,
  tickHz: TICK_HZ,
  thinkHz: THINK_HZ,
  matchSeconds: MATCH_SECONDS,
  suddenDeathAt: SUDDEN_DEATH_AT,
  suddenDeathRamp: SUDDEN_DEATH_RAMP,
};

/** `loadBody` fetches `/bodies/<name>.js`; here that is a file on disk. */
const fetchShim = async (url) => ({
  text: async () => readFileSync(join(ROOT, url.replace(/^\//, '')), 'utf8'),
  json: async () => JSON.parse(readFileSync(join(ROOT, url.replace(/^\//, '')), 'utf8')),
});

async function buildViewer(viewport, clock) {
  const body = [PRELUDE, ...SLICES.map(([a, b]) => cut(a, b)), EPILOGUE].join('\n');
  const make = new AsyncFunction('THREE', 'TSL', 'cfg', 'viewport', 'clock', 'fetch', body);
  return make(THREE, TSL, CONFIG, viewport, clock, fetchShim);
}

// ---------------------------------------------------------------------------
// the matches
// ---------------------------------------------------------------------------

/**
 * A population to fly the camera over, discovered rather than named.
 *
 * `reports/brains-l` first, because every measurement quoted in main.js's
 * camera comments was taken on it and this check is meant to be readable
 * against them. Any other archived population is a fine substitute if it is
 * gone — the camera does not care which brains it is following, only that they
 * chase, kite, corner and blink like real ones. `brains/` is deliberately LAST:
 * it is the shared tree a `brainforge` run writes into, and a test that reads a
 * directory being written half-way through is a test that fails for a reason
 * that is not about the camera.
 */
function findPopulation() {
  const candidates = [];
  const named = arg('pop', null);
  if (named) candidates.push(String(named));
  const reports = join(ROOT, 'reports');
  if (existsSync(reports)) {
    const dirs = readdirSync(reports).filter((d) => /^brains-[a-z]+$/.test(d)).sort();
    if (dirs.includes('brains-l')) candidates.push(join('reports', 'brains-l'));
    for (const d of dirs.reverse()) if (d !== 'brains-l') candidates.push(join('reports', d));
  }
  candidates.push('brains');
  for (const rel of candidates) {
    const dir = join(ROOT, rel);
    if (!existsSync(dir)) continue;
    const tags = readdirSync(dir)
      .filter((d) => statSync(join(dir, d)).isDirectory() && d !== 'stub' && !d.startsWith('_')
        && (named ? true : !d.startsWith('probe-')))
      .filter((d) => existsSync(join(dir, d, 'octopus.js')) && existsSync(join(dir, d, 'gorilla.js')))
      .sort();
    if (tags.length >= (named ? 1 : 6)) return { rel, dir, tags };
  }
  return null;
}

const pop = findPopulation();
if (!pop) {
  console.error('\nno population of six or more brains found in reports/brains-* or brains/ —');
  console.error('the camera needs real chases to follow. Generate one:\n');
  console.error('  node tools/brainforge.mjs --all --tag=v1\n');
  process.exit(1);
}

/**
 * The six pairings main.js's comments were measured on, by position.
 *
 * l1/l3, l1/l4, l3/l1, l1/l6, l2/l5, l4/l2 — a chaser against a kiter, the same
 * pair reversed, and the long matches that reach sudden death. Written as
 * indices so a different population substitutes cleanly.
 *
 * `--pairs=a/b,c/d` names them outright, which is how the browser cross-check
 * in the header was run against the same fights the browser could serve.
 */
const PAIR_INDICES = [[0, 2], [0, 3], [2, 0], [0, 5], [1, 4], [3, 1]];
const NAMED_PAIRS = arg('pairs', null);
const PAIRINGS = NAMED_PAIRS
  ? String(NAMED_PAIRS).split(',').map((p) => p.split('/'))
  : PAIR_INDICES.map(([i, j]) => [pop.tags[i], pop.tags[j]]);

const brainCache = new Map();
function brain(tag, id) {
  const key = `${tag}/${id}`;
  if (!brainCache.has(key)) {
    const p = join(pop.dir, tag, `${id}.js`);
    brainCache.set(key, compileBrain(readFileSync(p, 'utf8'), id));
  }
  return brainCache.get(key);
}

/** The server's own loop: one snapshot before the first step, then one a tick. */
function simulate(octTag, gorTag, seed) {
  const world = createWorld(seed, { curtainSeconds: CURTAIN });
  const brains = { octopus: brain(octTag, 'octopus'), gorilla: brain(gorTag, 'gorilla') };
  const think = (id, p, api) => brains[id].tick(p, api);
  const snaps = [snapshot(world)];
  const maxTicks = (MATCH_SECONDS + CURTAIN) * TICK_HZ + 8;
  let guard = 0;
  while (!world.done && guard++ < maxTicks) {
    step(world, think);
    snaps.push(snapshot(world));
  }
  return { snaps, winner: world.winner, reason: world.reason };
}

/**
 * One match, replayed through the viewer's loop at the rate the socket feeds it.
 *
 * The server steps the world on a `setInterval` at `1000 / TICK_HZ`, so a
 * snapshot stamped `t` reaches the page at wall-clock `t` and `over` lands one
 * tick after the last one. Rendering continues for another 2.6 s afterwards
 * because that is how long the viewer holds a finished match before it may
 * loop, and the framing rule CHANGES there: the loser stops being skipped and
 * the shot pushes in to `need * 0.75`. Stopping at the last frame would skip
 * the "banner over empty floor" failure entirely.
 */
function replay(viewer, clock, snaps) {
  clock.t = 0;
  viewer.startMatch();
  viewer.arrive(snaps[0]);
  let next = 1;
  const last = snaps[snaps.length - 1].t;
  let overSent = false;
  while (clock.t < last + 1 / TICK_HZ + AFTER_OVER) {
    clock.t += RENDER_DT;
    while (next < snaps.length && snaps[next].t <= clock.t) viewer.arrive(snaps[next++]);
    if (!overSent && next >= snaps.length && clock.t >= last + 1 / TICK_HZ) {
      viewer.setOver({ type: 'over' });
      overSent = true;
    }
    /* No `dt` argument: the sliced loop computes its own from the clock this
       function drives, cap and all, exactly as the browser's does. */
    viewer.render();
  }
  return viewer.report();
}

// ---------------------------------------------------------------------------

const started = Date.now();
console.log(`\n═══ the framing check — ${MAIN.replace(`${ROOT}/`, '')}'s own camera, headless\n`);
console.log(`  population  ${pop.rel}  (${PAIRINGS.map(([o, g]) => `${o}/${g}`).join(' ')})`);
console.log(`  seeds       ${SEEDS.join(', ')}`);

/* The sim is a pure function of (seed, brains) and the camera is downstream of
   it, so the fights are run once and flown over at every aspect. */
const matches = [];
for (const [octTag, gorTag] of PAIRINGS) {
  for (const seed of SEEDS) matches.push({ octTag, gorTag, seed, ...simulate(octTag, gorTag, seed) });
}
const simDone = Date.now();

/**
 * The opening frames, reported separately — but judged by the same rule.
 *
 * `camState` survives a match: the viewer only sets `camState.snap`, so match
 * two of a session opens on whatever framing match one ended in and has to get
 * to the ~28 m a fresh 31 m spawn needs. That is the frame this check found
 * broken on its first run — 14 of 36 replays put a fighter to |ndc| 1.39 on the
 * opening frame, reproduced in the real browser (see the header) and since
 * fixed in main.js by exempting the snap from the dolly cap. It is called out
 * on its own line because it is a distinct failure mode with its own history,
 * not because it is forgiven: a frame at renderClock 0 fails exactly like a
 * frame at renderClock 20. 0.25 s is the window, five times the 0.049 s the
 * broken version took to recover at 23 fps.
 *
 * The matches run back-to-back through ONE viewer, which is what makes this
 * reachable at all — a viewer with `loop` ticked does the same thing. The
 * hand-over range is printed with the result, so a run that never exercised a
 * tight carry-over says so instead of quietly passing.
 */
const OPENING = 0.25;

const edge = (await buildViewer(ASPECTS[0], { t: 0 })).FRAME_EDGE;
const dump = [];
let lost = 0, graded = 0, rendered = 0;
const rows = [];
for (const viewport of ASPECTS) {
  const clock = { t: 0 };
  const viewer = await buildViewer(viewport, clock);
  const row = { viewport, worst: 0, where: '', openWorst: 0, openWhere: '', handover: [] };
  for (const m of matches) {
    row.handover.push(viewer.camState.dist);
    const r = replay(viewer, clock, m.snaps);
    graded += r.graded;
    rendered += r.trail.length;
    if (DUMP) dump.push({ viewport: viewport.label, ...m, snaps: undefined, trail: r.trail });

    const where = (p) => `${m.octTag}/${m.gorTag} seed ${m.seed}, ${p.id} at t=${p.t.toFixed(1)}s, eye ${p.dist.toFixed(1)} m out`;
    for (const p of r.trail) {
      if (p.ndc > row.worst) { row.worst = p.ndc; row.where = where(p); }
      if (p.rc < OPENING && p.ndc > row.openWorst) { row.openWorst = p.ndc; row.openWhere = where(p); }
    }
    /* The viewer's OWN assertion, not a re-derivation of it — whatever it said
       out loud is what a watcher would have seen in the red box. */
    for (const f of r.failures) {
      lost++;
      console.log(`\n  LOST  ${viewport.label}  ${m.octTag}/${m.gorTag} seed ${m.seed}`
        + `${f.rc < OPENING ? '  (on the opening cut)' : ''}`);
      console.log(`        ${f.msg}`);
    }
    if (VERBOSE) {
      const open = r.trail.filter((p) => p.rc < OPENING);
      console.log(`  ${viewport.label.padEnd(4)} ${(`${m.octTag}/${m.gorTag}`).padEnd(28)} seed ${String(m.seed).padStart(4)}  `
        + `worst |ndc| ${Math.max(...r.trail.map((p) => p.ndc)).toFixed(3)}  `
        + `opening ${(open.length ? Math.max(...open.map((p) => p.ndc)) : 0).toFixed(3)}  `
        + `${m.winner || 'draw'} (${m.reason})`);
    }
  }
  rows.push(row);
}

if (DUMP) writeFileSync(DUMP, JSON.stringify(dump));

/*
 * Counted, not multiplied out.
 *
 * This line used to print `frames * ASPECTS.length * 2` where `frames` had
 * already been summed across every aspect, so it grew with the SQUARE of the
 * aspect count — 26,934 at one aspect, 107,736 at two — and it counted 30 Hz
 * sim snapshots rather than the rendered frames the camera is actually graded
 * on. `graded` is now incremented once per fighter per rendered frame, inside
 * the only function that knows whether a fighter was gradeable at all.
 */
console.log(`\n  ${matches.length} matches, ${ASPECTS.length} aspect ratios, ${(1 / RENDER_DT).toFixed(0)} fps, `
  + `${rendered.toLocaleString()} rendered frames, ${graded.toLocaleString()} live fighter-samples, `
  + `${((Date.now() - started) / 1000).toFixed(1)}s (${((simDone - started) / 1000).toFixed(1)}s of it sim)\n`);
for (const r of rows) {
  const hand = r.handover.slice(1);
  console.log(`  ${r.viewport.label.padEnd(5)} worst |ndc| ${r.worst.toFixed(3)}  `
    + `(${r.worst <= edge ? 'inside' : 'OUTSIDE'} FRAME_EDGE ${edge} by ${Math.abs(edge - r.worst).toFixed(3)})  ${r.where}`);
  console.log(`  ${' '.repeat(5)} opening ${r.openWorst.toFixed(3)}${r.openWorst ? `  ${r.openWhere}` : ''}`);
  console.log(`  ${' '.repeat(5)} handed over to the next match at ${Math.min(...hand).toFixed(1)}–${Math.max(...hand).toFixed(1)} m out`);
}

if (lost) {
  console.log(`\n  BROKEN — the camera lost a fighter in ${lost} replay${lost === 1 ? '' : 's'}.`);
  console.log('  Watch it: npm run serve, then open that seed and press Fight.\n');
  process.exit(1);
}
/*
 * A check that passes on nothing is worse than no check.
 *
 * `--seeds=abc` parses to an empty seed list, which replayed zero matches and
 * still printed HOLDS with exit 0 — a green that means "I looked at nothing".
 * Any invariant of the form "no frame did X" is vacuously true over no frames,
 * so the floor is part of the assertion, not a sanity extra.
 */
if (!matches.length || !graded) {
  console.error(`\n  NOTHING MEASURED — ${matches.length} matches and ${graded} fighter-samples.`);
  console.error('  Check --seeds / --pairs / --pop actually select something.\n');
  process.exit(1);
}
console.log(`\n  HOLDS — no live fighter passed |ndc| ${edge} in any frame of any of them\n`);
