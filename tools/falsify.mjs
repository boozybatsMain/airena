#!/usr/bin/env node
/**
 * The two results that would kill the concept, tested directly.
 *
 *   node tools/falsify.mjs                       # the shipping population in brains/
 *   node tools/falsify.mjs --tags=j1,j2 --rounds=40
 *   node tools/falsify.mjs --controls           # the gate `npm test` runs
 *
 * Exits non-zero when a CONTROL fails. Not when a result is weak: a low
 * reactivity score is a finding, a broken identity control is a broken tool.
 *
 * `--controls` runs the two LOCKSTEP controls and nothing else — the identity
 * ablation and the self-versus-self disagreement — through the same assertion
 * code the full run uses. Both are exactly 0 when the rig is sound and
 * deterministic given brains/, so they can sit in `npm test` without ever
 * flaking. It exists because a check nobody runs is not a check: measured on
 * l1..l6 the gate is 2 s against 6 m 32 s for the full set.
 *
 * Two things it deliberately does NOT do. It does not assert the permutation
 * negative control — see the comment at that control for the measurement that
 * rules it out at this power — and it writes no artefact, because a gate-sized
 * stub landing in reports/falsify.json is exactly how docs/EXPERIMENT.md got
 * quietly downgraded in the first place.
 *
 * ── 1. are the brains actually REACTING? ────────────────────────────────────
 *
 * A brain can look busy and be an open loop — a fixed routine that happens to
 * be running next to an opponent. The naive test, "does its trajectory change
 * when the opponent moves", cannot separate that from chaos: two runs of a
 * reactive brain diverge after a second whatever you do, and two runs of a
 * blind one diverge too as soon as a collision differs.
 *
 * So the brain is run TWICE IN LOCKSTEP inside one match. Instance A perceives
 * the world and drives the fight. Instance B perceives an ABLATED copy of the
 * same world — one channel of information about the opponent removed — and its
 * orders are thrown away. The world is therefore identical for both, and the
 * only thing that can make them disagree is the ablated channel. The fraction
 * of thoughts on which they disagree is the brain's sensitivity to that
 * channel, with chaos held out by construction.
 *
 * The channels are ablated separately, because they fail differently and a
 * combined score would hide the most sophisticated shape available: a brain
 * that steers almost entirely off the event feed would look blind to a test
 * that only pinned `p.enemy`.
 *
 * That argument was made and then not followed through. `p.enemy` is itself two
 * channels fused — WHERE the opponent is and WHAT they are winding up — and
 * pinning it pinned both, so the published 57.9-89.9% established only that the
 * brains track a position. `posPinned` and `castingHidden` split it: position
 * alone is 57.6-89.9% and reproduces the fused number to within 4.2 points on
 * every brain, telegraph alone is 2.4-28.4%. The telegraph is the smaller and
 * the more interesting number — it is the one that says a brain dodges a cast
 * rather than a body, which is the whole spectacle claim.
 *
 * Disagreement is likewise reported per ORDER channel — move, face, use — for
 * the same reason. A single boolean scores "held its ground and re-aimed the
 * beam" identical to "did nothing", and re-aiming is the octopus brains' main
 * reactive channel.
 *
 * The identity ablation is the control. It must score ~0; if it does not, the
 * lockstep is broken and no other number here means anything — so it is
 * ASSERTED, not printed, and this tool exits non-zero when it trips.
 *
 * ── 2. is the SPREAD of win rates bigger than chance? ───────────────────────
 *
 * The cross-tournament shows a spread of win rates across same-fighter brains.
 * A spread is not evidence: five identical coins produce one too. So the null
 * that the six brain LABELS are exchangeable is tested directly, by permuting
 * those labels over the pooled match outcomes within each opponent column and
 * asking how often chance alone reproduces a spread this large.
 *
 * Rejecting that null says the programs differ in a way the match can see. It
 * does NOT say the difference is a mind: six programs identical but for one
 * constant would reject it just as hard. What licenses the stronger reading is
 * test 3 below, which shows the six programs disagree about what to do in an
 * identical situation roughly half the time.
 *
 * The negative control is the same test run on six labels that are all the same
 * program, on disjoint seed blocks. The null is true there by construction and
 * the test must fail to reject — otherwise "p < 5e-5" is only telling us the
 * permutation arithmetic runs.
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compileBrain } from '../src/brain/host.js';
import { createWorld, step, makeApi } from '../src/core/sim.js';
import { mulberry32 } from '../src/core/rng.js';
import { MATCH_SECONDS, TICK_HZ, THINK_EVERY } from '../src/core/config.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n, d) => {
  const h = process.argv.find((a) => a.startsWith(`--${n}=`));
  return h ? h.slice(n.length + 3) : d;
};

/**
 * The shipping population, discovered rather than hard-coded.
 *
 * The default used to name `w1..w6`, which was archived out from under it, so
 * the bare command in the README exited on its first `readFileSync`. A tool
 * whose no-argument form does not run is a tool nobody runs.
 *
 * Membership is the PROVENANCE RECORD, not the directory name. The name filter
 * this replaces ("not stub, not probe-*") let anything else in silently: a
 * reviewer's `brains/zz-reviewcheck`, made to test the forge lane, would have
 * joined the measured population of every falsify run in that window and shown
 * up in the write-up as a seventh mind. A hand-written brain has no
 * `<fighter>.json` beside it, so requiring the pair closes the whole class
 * rather than the two names someone remembered — and `promptHash` closes the
 * rest: two brains generated from different prompts are not one population, and
 * saying so out loud beats discovering it in a published table.
 */
function population() {
  const dirs = readdirSync(join(ROOT, 'brains'), { withFileTypes: true })
    .filter((d) => d.isDirectory()).map((d) => d.name).sort();
  const out = [];
  for (const n of dirs) {
    const files = ['octopus', 'gorilla'].map((f) => join(ROOT, 'brains', n, `${f}.json`));
    if (!files.every(existsSync)
      || !['octopus', 'gorilla'].every((f) => existsSync(join(ROOT, 'brains', n, `${f}.js`)))) continue;
    const rec = files.map((p) => JSON.parse(readFileSync(p, 'utf8')));
    out.push({
      tag: n,
      model: `${rec[0].model}/${rec[0].effort}`,
      prompts: rec.map((r) => r.promptHash).join('+'),
      generatedAt: rec.map((r) => r.generatedAt).sort()[0],
    });
  }
  return out;
}

const POPULATION = population();
const shippingTags = () => POPULATION.map((p) => p.tag);
const TAGS = String(arg('tags', shippingTags().join(','))).split(',').filter(Boolean);
const CONTROLS_ONLY = process.argv.includes('--controls');
const ROUNDS = Number(arg('rounds', CONTROLS_ONLY ? 2 : 40));
/**
 * Rounds for the reactivity section, separate from the permutation's.
 *
 * They buy different things: the permutation test needs matches per CELL and
 * section 1 needs distinct opponents per brain. Splitting them is what makes the
 * gate cheap: it needs every brain represented once, not every brain measured to
 * a publishable precision.
 */
const REACT_ROUNDS = Number(arg('react', CONTROLS_ONLY ? 1 : 6));
if (TAGS.length < 2) {
  console.error(`\nneed at least two tags; brains/ offered [${shippingTags().join(', ')}]\n`);
  process.exit(1);
}
if (!process.argv.some((a) => a.startsWith('--tags='))) {
  const seen = POPULATION.filter((p) => TAGS.includes(p.tag));
  const odd = seen.filter((p) => p.prompts !== seen[0].prompts);
  if (odd.length) {
    console.error(`\nbrains/ holds more than one prompt generation: ${
      seen.map((p) => `${p.tag}=${p.prompts.slice(0, 12)}`).join(' ')}`);
    console.error('  these are not one population. name the one you mean with --tags=\n');
    process.exit(1);
  }
}
/*
 * СТОРОНА → ФАЙЛ МОЗГА, и это единственное место, где они встречаются.
 *
 * Стороны арены зовутся `blue` и `orange`: это цвета и ровно ничего больше —
 * видов, за которые можно было бы держаться, у игры нет. А эталонная
 * популяция §16 лежит в `brains/<tag>/` под своими именами (`octopus.js`,
 * `gorilla.js`); их переименование сдвинуло бы весь опубликованный артефакт,
 * поэтому имена файлов остаются как есть.
 */
const BRAIN_FILE = { blue: 'octopus', orange: 'gorilla' };
const src = (side, tag) => {
  const p = join(ROOT, 'brains', tag, `${BRAIN_FILE[side]}.js`);
  if (!existsSync(p)) {
    console.error(`\nno ${side} brain for tag "${tag}" (looked in ${p})\n`);
    process.exit(1);
  }
  return readFileSync(p, 'utf8');
};

// ---------------------------------------------------------------------------
// 1. ablation
// ---------------------------------------------------------------------------

const clone = (v) => JSON.parse(JSON.stringify(v));

/**
 * The kinematic half of `p.enemy`: where the opponent is and which way they are
 * going. Everything `posPinned` freezes and `castingHidden` leaves alone.
 */
const POSITION_FIELDS = ['x', 'z', 'y', 'vx', 'vz', 'speed', 'heading', 'dist', 'visible'];

const ABLATIONS = {
  identity: (p) => p,
  /**
   * The opponent's BODY is where it was at the start; the wind-up is live.
   *
   * `enemyPinned` below freezes position and telegraph together, so its score
   * cannot separate "the brain reads where you are" from "the brain reads what
   * you are casting" — and the second is the spectacle claim, the thing the
   * WoW comparison in docs/EXPERIMENT.md rests on. Measured over l1..l6 at
   * --rounds=40 --react=6, posPinned reproduces enemyPinned to within 4.2 points
   * on all twelve brains (worst gorilla:l1, 69.8 vs 74.0; seven of the twelve
   * agree to 0.1), which is what says the combined number was carried by
   * position alone and was never evidence about the telegraph.
   */
  posPinned: (p, first) => {
    const q = clone(p);
    // Every one of them is a number or a boolean, so a plain copy is a copy.
    for (const f of POSITION_FIELDS) q.enemy[f] = first.enemy[f];
    return q;
  },
  /**
   * The opponent is visibly there, and nothing they are winding up is reported.
   *
   * This is the telegraph channel on its own: `casting` is the only field that
   * says a hit is coming, so a brain that scores 0 here is one that never
   * dodges a wind-up, only a position. Cheap to fake by accident — a brain that
   * merely mentions `casting` scores nothing unless the mention changes an
   * order — which is the property that makes it worth publishing. It is also
   * the smaller number by a long way: 2.4%-28.4% across the twelve, median
   * 10.0%, against 57.6%-89.9% for position. Small and real beats large and
   * fused.
   *
   * `p.enemy.busy` is deliberately left alone, and it is the reason this is a
   * LOWER bound. `busy` says the opponent is doing something; `casting` says
   * what, how far through, and whether the hit is still coming. The claim being
   * measured is the second one, so nulling `casting` alone is the ablation that
   * matches it — and a brain that gets some warning from `busy` is scored as
   * less telegraph-sensitive than it is, which is the direction to be wrong in.
   */
  castingHidden: (p) => {
    const q = clone(p);
    q.enemy.casting = null;
    return q;
  },
  /**
   * Position and telegraph pinned together — the combined channel the first
   * write-up published, kept measured rather than hand-copied so the footnote
   * demoting it cannot go stale.
   */
  enemyPinned: (p, first) => {
    const q = clone(p);
    q.enemy = { ...clone(first.enemy), skills: q.enemy.skills };
    return q;
  },
  /** Nothing the opponent did is reported. */
  opponentEvents: (p) => {
    const q = clone(p);
    const fromThem = new Set(['damaged', 'dealt', 'evaded', 'contact', 'knockback',
      'interrupted', 'interruptedEnemy', 'enemyStarted', 'enemyCommitted']);
    q.events = q.events.filter((e) => !fromThem.has(e.type));
    return q;
  },
  /** Nobody is hurt. */
  healthFrozen: (p) => {
    const q = clone(p);
    q.self.hp = q.self.maxHp;
    q.enemy.hp = q.enemy.maxHp;
    return q;
  },
};

/** A turn smaller than this is not a decision. One tolerance, both directions. */
const INTENT_TOLERANCE_RAD = (40 * Math.PI) / 180;
const CHANNELS = ['move', 'face', 'use', 'any'];

function moveDirOf(q, self) {
  if (!q.move) return null;
  if (q.move.kind === 'stop') return { x: 0, z: 0 };
  const mx = q.move.kind === 'dir' ? q.move.dx : q.move.x - self.x;
  const mz = q.move.kind === 'dir' ? q.move.dz : q.move.z - self.z;
  const l = Math.hypot(mx, mz);
  return l > 1e-6 ? { x: mx / l, z: mz / l } : { x: 0, z: 0 };
}

/**
 * Did two thoughts express the same intent, channel by channel?
 *
 * `face` was absent from this comparison for the whole first run of the
 * experiment, and its absence hid the octopus brains' primary reactive channel.
 * `resolveStrike` reads aim at the instant the beam fires, not at the instant
 * the order was given — sim.js says so in as many words — so re-aiming through
 * a wind-up is a real decision that moves real damage, and a metric watching
 * only `move` and `use` scored it as no decision at all.
 */
function intentDiff(a, b, self) {
  const da = moveDirOf(a, self), db = moveDirOf(b, self);
  const still = (d) => d.x === 0 && d.z === 0;
  let move;
  if (!da && !db) move = false;
  else if (!da || !db) move = true;
  /*
   * "Stand still" has to be compared as its own intent rather than as a
   * direction. `api.stop()` and a degenerate `moveTo` on the body's own
   * position both come out as the zero vector, and the dot product of two zero
   * vectors is 0, which fails a cosine test against every tolerance — so the
   * cosine form alone scored two identical stop orders as a disagreement. It
   * was worth 0.4% of the identity control on the gorilla brains that stop.
   */
  else if (still(da) || still(db)) move = still(da) !== still(db);
  else move = da.x * db.x + da.z * db.z <= Math.cos(INTENT_TOLERANCE_RAD);

  // `q.face` is a heading in radians, or null for "no facing order this thought".
  const fa = a.face === null || a.face === undefined ? null : a.face;
  const fb = b.face === null || b.face === undefined ? null : b.face;
  let face;
  if (fa === null && fb === null) face = false;
  else if (fa === null || fb === null) face = true;
  else {
    let d = (fa - fb) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d <= -Math.PI) d += Math.PI * 2;
    face = Math.abs(d) > INTENT_TOLERANCE_RAD;
  }

  const use = (a.use ? a.use.name : null) !== (b.use ? b.use.name : null);
  return { move, face, use, any: move || face || use };
}

const zeroChannels = () => ({ move: 0, face: 0, use: 0, any: 0 });

/**
 * The driver's api with `rand` tapped, so the shadows can be handed the same
 * numbers.
 *
 * `api.rand()` reads the fighter's one seeded stream. Left alone, the driver
 * takes draw n and the shadow queued behind it takes n+1, so a brain that picks
 * a strafe direction from a coin flip disagrees with an identical copy of
 * itself for no reason at all. Measured on j2's gorilla: a 36.2% identity
 * control from that alone, against 0.0% once the draws are replayed.
 */
function tapRand(api, draws) {
  return { ...api, rand: () => { const v = api.rand(); draws.push(v); return v; } };
}

/**
 * A scratch api for a shadow thought, and the undo for the things it can write
 * through.
 *
 * Orders queue and are discarded, which is the whole point of the rig — but two
 * verbs are not orders. `api.remember` writes straight into the fighter's
 * memory, so a shadow that remembered its own decision would leave it in the
 * `p.mem` the DRIVER perceives on the next tick; and `api.rand` advances the
 * match's entropy. Either one makes the fight being measured stop being the
 * fight that happens without the measurement.
 *
 * Memory is a whole bag, not an undo. Restoring `me.mem` afterwards was enough
 * for `remember` and silently wrong for `recall`: `makeApi` reads `me.mem` live
 * (sim.js:430), the snapshot was taken inside `world.observer` — i.e. AFTER the
 * driver's `remember` had already written through — so the shadow recalled the
 * driver's own conclusion and answered one thought ahead of the instance it is
 * compared against. It cost exactly the brains that read their memory back:
 * gorilla:l4 holds the population's only two `api.recall` calls and was the
 * only nonzero identity control anywhere — 6.7% in the shipped artefact, on the
 * `move` channel alone, since the value it recalls is a strafe sign. With the
 * bag sandboxed, every one of the twelve brains scores 0.0% on all four
 * channels. So `me.mem` is SWAPPED for a private copy of the memory as the
 * DRIVER perceived it — `seen.mem`, cloned before the driver's tick — and
 * swapped back afterwards.
 */
function shadowApi(world, id, draws, memSeen) {
  const me = world.fighters[id];
  const real = me.mem;
  // Null-prototype, because `api.remember`'s key cap is `Object.hasOwn` against
  // a bag with no chain and a plain `{}` would give `toString` a free pass.
  me.mem = Object.assign(Object.create(null), clone(memSeen ?? {}));
  const s = makeApi(world, id);
  let i = 0;
  /*
   * Past the end of the driver's draws — which only an ablated shadow reaches,
   * by taking a branch the driver did not — the numbers come from a local
   * stream rather than the fighter's. Deterministic, so the run stays
   * replayable, and invisible to the match.
   */
  const spare = mulberry32(0x5EED);
  return {
    api: { ...s.api, rand: () => (i < draws.length ? draws[i++] : spare()) },
    q: s.q,
    restore() { me.mem = real; },
  };
}

/**
 * Compiled brains, kept.
 *
 * Every `compileBrain` creates a `vm` context, and this tool wants thousands of
 * matches: the first version compiled per match and the process took a
 * segmentation fault part-way through the permutation test. Contexts are
 * expensive in a way ordinary objects are not. `reset()` gives the same clean
 * slate — `tools/test.mjs` asserts it is byte-identical to a fresh compile — so
 * one context per (fighter, tag) is enough for the whole run.
 */
const POOL = new Map();
function brainOf(who, tag, slot = 'main') {
  const key = `${who}|${tag}|${slot}`;
  let b = POOL.get(key);
  if (!b) { b = compileBrain(src(who, tag), key); POOL.set(key, b); }
  b.reset();
  return b;
}

function ablationRun(blueTag, orangeTag, seed, who) {
  const drive = {
    blue: brainOf('blue', blueTag, 'drive'),
    orange: brainOf('orange', orangeTag, 'drive'),
  };
  const shadow = {};
  for (const k of ABLATION_NAMES) shadow[k] = brainOf(who, who === 'blue' ? blueTag : orangeTag, `sh-${k}`);
  const disagree = Object.fromEntries(ABLATION_NAMES.map((k) => [k, zeroChannels()]));
  let thinks = 0;
  let first = null;
  let seen = null;
  const draws = [];

  const world = createWorld(seed);
  const think = (id, p, api) => {
    if (id !== who) return drive[id].tick(p, api);
    /*
     * The perception exactly as the DRIVER saw it, kept for the shadows.
     *
     * Not the copy the observer is handed a moment later: `p.mem` is a live
     * handle on the fighter's memory, so by then it already carries this very
     * thought's `api.remember` writes, and a shadow reading it would be one
     * tick ahead of the instance it is being compared against.
     */
    seen = clone(p);
    draws.length = 0;
    return drive[id].tick(p, tapRand(api, draws));
  };
  /*
   * The driver's real order queue, taken from the simulation.
   *
   * It used to be recovered by ticking the driver a SECOND time on a copy of
   * the perception, and that was a live defect rather than a slow path. A brain
   * keeps state beside `think` — a strafe sign, a phase counter, an estimate of
   * the enemy's cooldown — and a second tick advances all of it at double rate,
   * so the measurement changed the fight it was measuring. Measured across the
   * 72 runs this section makes: 39 of them ended differently from the same match
   * run unmeasured, winner flips included, and the identity control — which must
   * be ~0 for any other number here to mean anything — read as high as 32.4%.
   * Both are 0 through `world.observer`, which `step` populates with the true
   * queue for exactly this purpose.
   */
  world.observer = (id, _p, q) => {
    if (id !== who || !seen) return;
    if (!first) first = seen;
    thinks++;
    for (const name of ABLATION_NAMES) {
      const fn = ABLATIONS[name];
      const scratch = shadowApi(world, id, draws, seen.mem);
      const res = shadow[name].tick(fn(clone(seen), first), scratch.api);
      scratch.restore();
      if (res?.fault) { for (const c of CHANNELS) disagree[name][c]++; continue; }
      const d = intentDiff(q, scratch.q, seen.self);
      for (const c of CHANNELS) if (d[c]) disagree[name][c]++;
    }
  };

  while (!world.done && world.tick < MATCH_SECONDS * TICK_HZ) step(world, think);
  return { disagree, thinks };
}

/**
 * The controls, and what trips them.
 *
 * A control that is printed and not compared is worse than no control, because
 * the write-up quotes it as though it passed — `gorilla:l4` shipped a 6.7%
 * identity control in docs/EXPERIMENT.md, directly under a docstring saying a
 * nonzero one invalidates every other number in the row, and this tool exited
 * 0. So every control has a number to beat and a nonzero exit behind it.
 *
 * 0.5% for the two lockstep controls: they are the same program reading the
 * same world, so the honest expectation is exactly 0 and every value measured
 * after the `api.rand` and `mem` fixes is exactly 0 across all twelve brains
 * and both diversity controls. 0.5% is one thought in two hundred — wide enough
 * that a future brain finding some new host-side leak trips it rather than a
 * rounding edge, tight enough that the 3.1%-6.7% recall defect fails loudly.
 *
 * 0.01 for the permutation control: its null is true by construction, so its p
 * is roughly uniform and a threshold IS a false-alarm rate. 0.01 buys a 1-in-100
 * spurious failure against a headline that rejects at p <= 5e-5 — 200x the
 * evidence — so the gap is wide enough that the control failing means the
 * machinery is broken, not that the dice were unkind.
 *
 * That 1-in-100 is a per-POPULATION risk, not a per-run one, which is what makes
 * this safe to put in `npm test`. Match seeds and the permutation shuffle are
 * both fixed, so a given brains/ either passes forever or fails every time: no
 * flake, and nobody learns to re-run the suite until it goes green. Measured on
 * l1..l6 the gate returns p = 0.147 at --rounds=2 and 0.874 at --rounds=40.
 */
const IDENTITY_CONTROL_MAX = 0.005;
const NEGATIVE_CONTROL_MIN_P = 0.01;
const failures = [];

console.log(`\n═══ falsification set — ${TAGS.length} brains${CONTROLS_ONLY ? ' — CONTROLS ONLY' : ` x ${ROUNDS} rounds`}`);
console.log(`    population ${TAGS.map((t) => {
  const p = POPULATION.find((q) => q.tag === t);
  return p ? `${t}(${p.model} ${p.generatedAt.slice(0, 16)}Z)` : `${t}(no provenance)`;
}).join(' ')}\n`);
console.log('1. REACTIVITY — extra fraction of thoughts whose intent changes when a channel is removed,');
console.log('   over and above the identity control. A blind brain scores ~0 on everything.');
console.log('   move / face / use are the three order channels; "any" is the union.\n');

// `--controls` narrows what is COMPUTED and changes nothing about what is
// asserted, so the gate cannot pass a rig the full run would fail.
const ABLATION_NAMES = CONTROLS_ONLY ? ['identity'] : Object.keys(ABLATIONS);
const SHORT = { identity: 'identity', posPinned: 'posPinned', castingHidden: 'castHidden', enemyPinned: 'enemyPinned', opponentEvents: 'oppEvents', healthFrozen: 'hpFrozen' };
const OUT = {
  rounds: ROUNDS,
  reactRounds: REACT_ROUNDS,
  tags: TAGS,
  population: POPULATION.filter((p) => TAGS.includes(p.tag)),
  generatedAt: new Date().toISOString(),
  reactivity: {},
  permutation: {},
};
const reactivity = OUT.reactivity;
for (const who of ['blue', 'orange']) {
  console.log(`   ${who}`);
  console.log(`     ${'brain'.padEnd(7)}${'channel'.padEnd(9)}${ABLATION_NAMES.map((k) => (SHORT[k] || k).padStart(12)).join('')}`);
  for (const tag of TAGS) {
    const tot = Object.fromEntries(ABLATION_NAMES.map((k) => [k, zeroChannels()]));
    let n = 0;
    for (let r = 0; r < REACT_ROUNDS; r++) {
      const other = TAGS[(TAGS.indexOf(tag) + 1 + r) % TAGS.length];
      const o = who === 'blue' ? ablationRun(tag, other, 700 + r, who) : ablationRun(other, tag, 700 + r, who);
      for (const k of Object.keys(tot)) for (const c of CHANNELS) tot[k][c] += o.disagree[k][c];
      n += o.thinks;
    }
    /*
     * Reported net of the control. A brain that calls api.rand() makes the two
     * instances draw different numbers, so its identity column is not zero —
     * and reading its other columns raw would credit that noise as sensitivity.
     * Subtracting its own control is the only honest comparison.
     */
    const raw = (k, c) => tot[k][c] / Math.max(1, n);
    const net = (k, c) => Math.max(0, raw(k, c) - raw('identity', c));
    // The flat per-ablation keys are the union channel, kept flat because
    // tools/report.mjs reads `v.enemyPinned` and friends straight off this map.
    reactivity[`${who}:${tag}`] = {
      ...Object.fromEntries(ABLATION_NAMES.map((k) => [k, raw(k, 'any')])),
      thinks: n,
      channels: Object.fromEntries(ABLATION_NAMES.map((k) => [k,
        Object.fromEntries(CHANNELS.map((c) => [c, raw(k, c)]))])),
    };
    /*
     * Tripped on `any`, which is the union and therefore the strictest of the
     * four — a leak anywhere reaches it. The message names the worst ORDER
     * channel because that is the lead: the recall defect that motivated this
     * check showed up entirely on `move` (3.1% there, 0.0% on face and use),
     * and "it is the move channel" is what pointed at a strafe sign read back
     * out of memory rather than at anything to do with aiming.
     */
    const ORDERS = CHANNELS.filter((c) => c !== 'any');
    const worstC = ORDERS.reduce((a, c) => (raw('identity', c) > raw('identity', a) ? c : a), ORDERS[0]);
    if (raw('identity', 'any') > IDENTITY_CONTROL_MAX) {
      failures.push(`identity control ${who}:${tag} = ${(raw('identity', 'any') * 100).toFixed(1)}% of thoughts `
        + `(max ${(IDENTITY_CONTROL_MAX * 100).toFixed(1)}%), worst on ${worstC} at `
        + `${(raw('identity', worstC) * 100).toFixed(1)}% — the lockstep is broken, so every other figure `
        + 'in that row is measuring the rig rather than the brain');
    }
    const f = (v) => `${(v * 100).toFixed(1)}%`;
    for (const c of CHANNELS) {
      const lead = (c === CHANNELS[0] ? tag : '').padEnd(7);
      const cells = ABLATION_NAMES.map((k) => f(k === 'identity' ? raw(k, c) : net(k, c)).padStart(12)).join('');
      console.log(`     ${lead}${c.padEnd(9)}${cells}`);
    }
  }
}

// ---------------------------------------------------------------------------
// 2. permutation test
// ---------------------------------------------------------------------------

console.log('\n2. IS THE SPREAD BIGGER THAN CHANCE? — permuting the brain labels\n');
console.log('   Rejecting says the six labels are not exchangeable: the programs differ in a way');
console.log('   the match can see. It does not say by itself that a MIND is what differs — six');
console.log('   programs unlike in one constant would reject it too. Test 3 is what settles that.\n');

/**
 * One side's win-rate matrix. `labelTag` maps a label to the brain that plays
 * it, and `seedFor` maps a cell to its seed block, so the negative control can
 * bind every label to one program without every cell becoming the same match.
 */
function winMatrix(side, labelTag, seedFor) {
  /** outcomes[label][opponentLabel] = array of 1/0 (win for `side`) */
  const outcomes = {};
  for (let mi = 0; mi < TAGS.length; mi++) {
    outcomes[TAGS[mi]] = {};
    for (let oi = 0; oi < TAGS.length; oi++) {
      const res = [];
      for (let r = 0; r < ROUNDS; r++) {
        const mineTag = labelTag(TAGS[mi]);
        const theirsTag = labelTag(TAGS[oi]);
        const blueTag = side === 'blue' ? mineTag : theirsTag;
        const orangeTag = side === 'blue' ? theirsTag : mineTag;
        const brains = {
          blue: brainOf('blue', blueTag, 'perm'),
          orange: brainOf('orange', orangeTag, 'perm'),
        };
        const world = createWorld(seedFor(mi, oi, r));
        const think = (id, p, api) => brains[id].tick(p, api);
        while (!world.done && world.tick < (MATCH_SECONDS + 1) * TICK_HZ) step(world, think);
        res.push(world.winner === side ? 1 : 0);
      }
      outcomes[TAGS[mi]][TAGS[oi]] = res;
    }
  }
  return outcomes;
}

const TRIALS = 20000;

function permutationP(outcomes) {
  const meanOf = (t) => {
    const xs = TAGS.flatMap((op) => outcomes[t][op]);
    return xs.reduce((a, b) => a + b, 0) / xs.length;
  };
  const observed = TAGS.map(meanOf);
  const spread = Math.max(...observed) - Math.min(...observed);

  // permute brain labels WITHIN each opponent column: that holds the opponent
  // field fixed and destroys only the thing being tested
  let rngState = 12345;
  const rnd = () => {
    rngState = (rngState + 0x6d2b79f5) >>> 0;
    let x = rngState;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
  let atLeast = 0;
  for (let t = 0; t < TRIALS; t++) {
    const sums = TAGS.map(() => 0);
    let per = 0;
    for (const op of TAGS) {
      const pool = TAGS.flatMap((mine) => outcomes[mine][op]);
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        const s = pool[i]; pool[i] = pool[j]; pool[j] = s;
      }
      for (let b = 0; b < TAGS.length; b++) {
        for (let k = 0; k < ROUNDS; k++) sums[b] += pool[b * ROUNDS + k];
      }
      per += ROUNDS;
    }
    const means = sums.map((v) => v / per);
    if (Math.max(...means) - Math.min(...means) >= spread) atLeast++;
  }
  return { observed, spread, p: (atLeast + 1) / (TRIALS + 1) };
}

const showP = (p) => (p < 1 / TRIALS ? `< ${(1 / TRIALS).toExponential(1)}` : p.toFixed(5));

/*
 * The negative control: six labels, one program behind all of them. ONE run,
 * not one per fighter.
 *
 * Each cell gets its OWN seed block. Reusing the real test's shared seeds would
 * make all 36 cells the same match, the spread exactly 0 and p exactly 1 — a
 * control that passes because it has no variance is not a control. Disjoint
 * blocks make the six labels six honest draws from one distribution, which is
 * the null being true rather than the null being trivial.
 *
 * It used to be computed inside the per-side loop, and `winMatrix` ignores
 * `side` everywhere except the last line: with every label bound to TAGS[0]
 * both runs played the identical 720 matches and differed only in which
 * polarity of the same result was scored. The printed pair (spread 5.0 / 5.0
 * points, p 0.87436 / 0.87961 — the 0.5-point p gap is the draws, which are not
 * a win for either side) read as two controls agreeing and was one control
 * printed twice, for 720 matches of simulation that bought nothing.
 */
/*
 * And NOT run under `--controls`, which is the one place this file declines to
 * assert something.
 *
 * A threshold is a false-alarm rate only if the p behind it is informative, and
 * at gate power it is not: with 2 rounds a label's win rate moves in steps of
 * 1/12 and the permutation distribution is lumpy enough that the answer is
 * seed-block luck. Measured on l1..l6 at --rounds= 2, 4, 6, 8, 10 the control
 * returned p = 0.002, 0.257, 0.028, 0.204, 0.689 — one of those five fails a
 * 0.01 threshold and a second is within 3x of it, on data whose null is TRUE BY
 * CONSTRUCTION every time. Wiring that into `npm test` would trade a control
 * that cannot fail for a suite that fails at random, and a suite that fails at
 * random is one people learn to re-run until it goes green.
 *
 * It is asserted where it is informative — the full run, 240 matches per label,
 * p = 0.874 — and skipping that run does not dodge it: the artefact records
 * `controls.passed`, and tools/report.mjs refuses to publish a block without it.
 */
const control = CONTROLS_ONLY
  ? null
  : permutationP(winMatrix('blue', () => TAGS[0], (mi, oi, r) => 41000 + (mi * TAGS.length + oi) * ROUNDS + r));
if (control && control.p < NEGATIVE_CONTROL_MIN_P) {
  failures.push(`permutation negative control p = ${control.p.toFixed(5)} (min ${NEGATIVE_CONTROL_MIN_P}) — `
    + `${TAGS.length} labels on one program (${TAGS[0]}) rejected exchangeability, so the test rejects things `
    + 'that are true and the headline p means nothing');
}

for (const side of CONTROLS_ONLY ? [] : ['blue', 'orange']) {
  const real = permutationP(winMatrix(side, (t) => t, (mi, oi, r) => 9000 + r));
  OUT.permutation[side] = {
    winRates: Object.fromEntries(TAGS.map((t, i) => [t, real.observed[i]])),
    spread: real.spread,
    matchesPerBrain: TAGS.length * ROUNDS,
    p: real.p,
    trials: TRIALS,
    // Shared, and flagged as shared: it is one measurement, and report.mjs must
    // not print it twice as though the two sides corroborated each other.
    negativeControl: control && { brain: TAGS[0], spread: control.spread, p: control.p, sharedAcrossSides: true },
  };
  console.log(`   ${side}: win rates ${real.observed.map((v) => `${(v * 100).toFixed(0)}%`).join(' ')}`);
  console.log(`     observed spread ${(real.spread * 100).toFixed(1)} points over ${TAGS.length} brains x ${TAGS.length * ROUNDS} matches`);
  console.log(`     p(spread this large if the ${TAGS.length} labels were exchangeable) = ${showP(real.p)}\n`);
}
if (control) {
  console.log(`   negative control (one run, both sides) — all ${TAGS.length} labels bound to ${TAGS[0]}, disjoint seed blocks:`);
  console.log(`     spread ${(control.spread * 100).toFixed(1)} points, p = ${showP(control.p)} `
    + `— ${control.p < NEGATIVE_CONTROL_MIN_P ? `REJECTS at p < ${NEGATIVE_CONTROL_MIN_P}, which it must not` : `does not reject (needs p >= ${NEGATIVE_CONTROL_MIN_P})`}\n`);
} else {
  console.log('   --controls: the negative control is SKIPPED, not silently passed — at gate power its p is');
  console.log('   seed-block luck (0.002 to 0.689 over --rounds= 2..10, on data whose null is true every time).');
  console.log('   The full run asserts it, and tools/report.mjs will not publish a block without that pass.\n');
}

// ---------------------------------------------------------------------------
// 3. are the programs actually different from each other?
// ---------------------------------------------------------------------------

/*
 * The first falsification test: one model, one prompt, six samples — is that six
 * minds or one mind six times?
 *
 * The obvious measure is what verbs each brain reaches for, and it is nearly
 * useless: every competent fighter calls `faceAt`, `move`, `ready` and `ray` a
 * lot, so the cosine similarity of two verb histograms sits above 0.95 whatever
 * the brains are actually doing. That measures the API, not the mind.
 *
 * What separates two policies is whether they DECIDE differently. So each pair
 * is run in lockstep inside one match — exactly the rig the ablation uses, with
 * the ablation replaced by "a different brain of the same fighter". One drives,
 * the other perceives the same world and has its orders discarded, and the
 * disagreement rate is how often two programs handed an identical situation
 * want different things. Two copies of one program score 0.
 *
 * The source view stays as a second, cheaper angle: which api verbs and
 * perception fields each program mentions at all.
 */
console.log('3. ARE THEY DIFFERENT PROGRAMS? — same-fighter brains compared in lockstep\n');
if (CONTROLS_ONLY) console.log('   --controls: the pairwise comparisons are skipped; only the self-vs-self control runs.\n');

function disagreement(who, tagA, tagB, opponentTag, seed) {
  const drive = {
    blue: brainOf('blue', who === 'blue' ? tagA : opponentTag, 'dA'),
    orange: brainOf('orange', who === 'orange' ? tagA : opponentTag, 'dA'),
  };
  const rival = brainOf(who, tagB, 'dB');
  let thinks = 0, differ = 0;
  let seen = null;
  const draws = [];
  const world = createWorld(seed);
  const think = (id, p, api) => {
    if (id !== who) return drive[id].tick(p, api);
    seen = clone(p);
    draws.length = 0;
    return drive[id].tick(p, tapRand(api, draws));
  };
  // Same reason as the ablation rig: the driver is ticked once, and its real
  // order queue comes back from the simulation rather than from a second tick.
  world.observer = (id, _p, q) => {
    if (id !== who || !seen) return;
    thinks++;
    const scratch = shadowApi(world, id, draws, seen.mem);
    const res = rival.tick(clone(seen), scratch.api);
    scratch.restore();
    if (res?.fault || intentDiff(q, scratch.q, seen.self).any) differ++;
  };
  while (!world.done && world.tick < MATCH_SECONDS * TICK_HZ) step(world, think);
  return thinks ? differ / thinks : 0;
}

const TOKENS = ['V.lead', 'V.rot', 'V.perp', 'V.angleTo', 'V.fromHeading', 'p.events', 'p.mem',
  'casting', 'telegraph', 'enemyCommitted', 'enemyStarted', 'refused', 'burn', 'obstacles',
  'invulnerable', 'airborne', 'stunned', 'pathTo', 'timeLeft'];
const API_VERBS = ['move', 'moveTo', 'stop', 'face', 'faceAt', 'use', 'ready', 'cooldown',
  'los', 'ray', 'pathTo', 'rand', 'remember', 'recall', 'forget', 'say'];
const tokensOf = (text) => new Set(
  API_VERBS.filter((v) => new RegExp(`api\\.${v}\\b`).test(text)).map((v) => `api.${v}`)
    .concat(TOKENS.filter((t) => text.includes(t))),
);
const jaccard = (a, b) => {
  const inter = [...a].filter((x) => b.has(x)).length;
  const uni = new Set([...a, ...b]).size;
  return uni ? inter / uni : 1;
};

OUT.diversity = {};
for (const who of ['blue', 'orange']) {
  const opponent = TAGS[0];
  const sources = Object.fromEntries(TAGS.map((t) => [t, tokensOf(src(who, t))]));
  const pairs = [];
  for (let i = 0; CONTROLS_ONLY ? false : i < TAGS.length; i++) {
    for (let j = i + 1; j < TAGS.length; j++) {
      const d = [0, 1, 2].map((k) => disagreement(who, TAGS[i], TAGS[j], opponent, 6100 + k));
      pairs.push({
        a: TAGS[i], b: TAGS[j],
        policy: d.reduce((x, y) => x + y, 0) / d.length,
        vocabulary: jaccard(sources[TAGS[i]], sources[TAGS[j]]),
      });
    }
  }
  // A brain against itself must score 0, or the rig is measuring noise.
  const selfControl = disagreement(who, TAGS[0], TAGS[0], opponent, 6100);
  if (selfControl > IDENTITY_CONTROL_MAX) {
    failures.push(`diversity self-control ${who}:${TAGS[0]} = ${(selfControl * 100).toFixed(1)}% `
      + `(max ${(IDENTITY_CONTROL_MAX * 100).toFixed(1)}%) — one program disagrees with itself, so the `
      + 'pairwise disagreements below are the rig, not the policies');
  }
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  OUT.diversity[who] = {
    control: selfControl,
    pairs,
    policyMean: mean(pairs.map((p) => p.policy)),
    policyMin: Math.min(...pairs.map((p) => p.policy)),
    vocabularyMean: mean(pairs.map((p) => p.vocabulary)),
    vocabularyMax: Math.max(...pairs.map((p) => p.vocabulary)),
    sourceChars: Object.fromEntries(TAGS.map((t) => [t, src(who, t).length])),
  };
  const d = OUT.diversity[who];
  console.log(`   ${who}: a brain against itself disagrees ${(d.control * 100).toFixed(1)}% of the time (the control)`);
  if (!pairs.length) continue;
  console.log(`            different brains disagree ${(d.policyMean * 100).toFixed(1)}% on average, closest pair ${(d.policyMin * 100).toFixed(1)}%`);
  console.log(`            source-vocabulary overlap mean ${d.vocabularyMean.toFixed(3)}, worst pair ${d.vocabularyMax.toFixed(3)}`);
  console.log(`            source lengths ${TAGS.map((t) => d.sourceChars[t]).join(', ')} chars\n`);
}

OUT.controls = {
  identityMax: IDENTITY_CONTROL_MAX,
  negativeControlMinP: NEGATIVE_CONTROL_MIN_P,
  failures,
  passed: failures.length === 0,
};
if (CONTROLS_ONLY) {
  console.log('   --controls: no artefact written (a gate-sized run must never become the published one)\n');
} else {
  writeFileSync(new URL('../reports/falsify.json', import.meta.url), JSON.stringify(OUT, null, 2));
  console.log('   written to reports/falsify.json\n');
}

/*
 * The exit code is the whole point of the section above.
 *
 * `grep -n "process.exit" tools/falsify.mjs` used to return only the
 * missing-brains guard, which is to say: the tool that exists to falsify the
 * project's central claim could not fail. It printed a broken control and
 * exited 0, and docs/EXPERIMENT.md published the broken number. The result
 * flag is `passed` in the artefact so report.mjs can refuse to publish a run
 * whose controls did not hold, without re-deriving the thresholds.
 */
if (failures.length) {
  console.error('   CONTROLS FAILED — the numbers above do not support anything:\n');
  for (const f of failures) console.error(`     - ${f}`);
  console.error('');
  process.exit(1);
}
console.log(`   controls hold: identity <= ${(IDENTITY_CONTROL_MAX * 100).toFixed(1)}% of thoughts on every brain`
  + `${control ? `, permutation negative control p = ${control.p.toFixed(3)} >= ${NEGATIVE_CONTROL_MIN_P}` : ' (the permutation control was not run — see above)'}.\n`);
