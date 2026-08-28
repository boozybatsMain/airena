#!/usr/bin/env node
/**
 * The invariants. `node tools/test.mjs`
 *
 * Not a coverage exercise — every case here is one that has either already gone
 * wrong in this repo or is invisible while it goes wrong. The runaway-brain
 * case is the clearest of the second kind: a 200-round sweep that silently
 * hangs on round 137 costs more than every other check combined, and nothing
 * about watching a fight would reveal it.
 */

import { readFileSync } from 'node:fs';

import { compileBrain } from '../src/brain/host.js';
import {
  ARENA_HALF, FIGHTERS, OBSTACLES, SKILLS, SPAWN_RADIUS, SUDDEN_DEATH_AT, DT,
} from '../src/core/config.js';
import { dist2, hasLos, inCone, segBox } from '../src/core/geom.js';
import { createNav } from '../src/core/nav.js';
import { runMatch } from '../src/core/match.js';
import { createWorld, perceive, snapshot, step, SOLIDS, burnRate } from '../src/core/sim.js';

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ok    ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n          ${detail}` : ''}`); }
};
const group = (n) => console.log(`\n${n}`);

const stub = (id) => compileBrain(readFileSync(new URL(`../brains/stub/${id}.js`, import.meta.url), 'utf8'), id);
const stubs = () => ({ octopus: stub('octopus'), gorilla: stub('gorilla') });

// ---------------------------------------------------------------------------
group('arena');

{
  const key = (o) => `${o.x.toFixed(3)}|${o.z.toFixed(3)}|${o.hx}|${o.hz}`;
  const set = new Set(OBSTACLES.map(key));
  const asym = OBSTACLES.filter((o) => !set.has(key({ x: -o.x, z: -o.z, hx: o.hx, hz: o.hz })));
  ok('layout is symmetric under a 180 degree rotation', asym.length === 0, `asymmetric: ${asym.map((o) => o.id)}`);
}
{
  // every spawn angle the seeded picker can choose must be legal for both bodies
  let bad = 0;
  for (let s = 1; s <= 200; s++) {
    const w = createWorld(s);
    for (const id of ['octopus', 'gorilla']) {
      const f = w.fighters[id], r = f.def.radius;
      if (Math.abs(f.x) > ARENA_HALF - r || Math.abs(f.z) > ARENA_HALF - r) bad++;
      for (const o of OBSTACLES) {
        if (Math.abs(f.x - o.x) < o.hx + r && Math.abs(f.z - o.z) < o.hz + r) bad++;
      }
    }
    const a = w.fighters.octopus, b = w.fighters.gorilla;
    if (Math.abs(dist2(a.x, a.z, b.x, b.z) - SPAWN_RADIUS * 2) > 0.01) bad++;
    // and they must be looking at each other
    const toB = Math.atan2(b.x - a.x, b.z - a.z);
    const toA = Math.atan2(a.x - b.x, a.z - b.z);
    if (Math.abs(((a.heading - toB + Math.PI * 3) % (Math.PI * 2)) - Math.PI) > 0.01) bad++;
    if (Math.abs(((b.heading - toA + Math.PI * 3) % (Math.PI * 2)) - Math.PI) > 0.01) bad++;
  }
  ok('200 seeded spawn pairs are legal, diametric and face each other', bad === 0, `${bad} violations`);
}
{
  const nav = createNav(SOLIDS, ARENA_HALF, FIGHTERS.gorilla.radius);
  let unreachable = 0, tested = 0;
  for (let i = 0; i < 400; i++) {
    const rand = (n) => ((Math.sin(i * 12.9898 + n * 78.233) * 43758.5453) % 1 + 1) % 1;
    const p = (n) => (rand(n) * 2 - 1) * (ARENA_HALF - 2);
    const a = { x: p(1), z: p(2) }, b = { x: p(3), z: p(4) };
    const inside = (q) => OBSTACLES.some((o) => Math.abs(q.x - o.x) < o.hx + 2 && Math.abs(q.z - o.z) < o.hz + 2);
    if (inside(a) || inside(b)) continue;
    tested++;
    if (!nav.path(a.x, a.z, b.x, b.z)) unreachable++;
  }
  ok(`navigation connects every free pair (${tested} sampled)`, unreachable === 0, `${unreachable} unreachable`);
}
{
  let bad = 0;
  for (let i = 0; i < 300; i++) {
    const r = (n) => ((Math.sin(i * 3.1 + n) * 12345.678) % 1 + 1) % 1;
    const a = { x: (r(1) * 2 - 1) * ARENA_HALF, z: (r(2) * 2 - 1) * ARENA_HALF };
    const b = { x: (r(3) * 2 - 1) * ARENA_HALF, z: (r(4) * 2 - 1) * ARENA_HALF };
    if (hasLos(a.x, a.z, b.x, b.z, SOLIDS) !== hasLos(b.x, b.z, a.x, a.z, SOLIDS)) bad++;
  }
  ok('line of sight is symmetric', bad === 0, `${bad} asymmetric pairs`);
}

// ---------------------------------------------------------------------------
group('simulation');

{
  const a = runMatch(stubs(), { seed: 4242 });
  const b = runMatch(stubs(), { seed: 4242 });
  ok('a match is reproducible from its seed', JSON.stringify(a.result.log) === JSON.stringify(b.result.log));
  const c = runMatch(stubs(), { seed: 4243 });
  ok('a different seed is a different match', JSON.stringify(a.result.log) !== JSON.stringify(c.result.log));
}
{
  let overlaps = 0, outside = 0, insideBlock = 0;
  const brains = stubs();
  const world = createWorld(99);
  const think = (id, p, api) => brains[id].tick(p, api);
  while (!world.done && world.tick < 2400) {
    step(world, think);
    const o = world.fighters.octopus, g = world.fighters.gorilla;
    if (dist2(o.x, o.z, g.x, g.z) < o.def.radius + g.def.radius - 0.02) overlaps++;
    for (const f of [o, g]) {
      if (Math.abs(f.x) > ARENA_HALF - f.def.radius + 0.02) outside++;
      if (Math.abs(f.z) > ARENA_HALF - f.def.radius + 0.02) outside++;
      for (const b of OBSTACLES) {
        const qx = Math.max(b.x - b.hx, Math.min(f.x, b.x + b.hx));
        const qz = Math.max(b.z - b.hz, Math.min(f.z, b.z + b.hz));
        if (dist2(f.x, f.z, qx, qz) < f.def.radius - 0.03) insideBlock++;
      }
    }
  }
  ok('bodies never overlap each other', overlaps === 0, `${overlaps} ticks overlapping`);
  ok('bodies never leave the arena', outside === 0, `${outside} ticks outside`);
  ok('bodies never enter a block', insideBlock === 0, `${insideBlock} ticks inside`);
}
{
  // The dash must report the velocity it is actually travelling at. It used to
  // report zero, which made the viewer play a standing pose at 15 m/s and told
  // the opposing brain a charging gorilla was stationary.
  const world = createWorld(7);
  let sawDash = false, reportedZero = false, maxReported = 0;
  const think = (id, p, api) => {
    if (id === 'gorilla') { api.faceAt(p.enemy.x, p.enemy.z); api.use('charge'); }
    else api.move(0, 0);
    return null;
  };
  for (let i = 0; i < 300 && !world.done; i++) {
    step(world, think);
    const g = world.fighters.gorilla;
    if (g.act && g.act.phase === 'dash') {
      sawDash = true;
      const rv = Math.hypot(g.rvx, g.rvz);
      maxReported = Math.max(maxReported, rv);
      if (rv < 1) reportedZero = true;
    }
  }
  ok('a charge actually dashes', sawDash);
  ok('the dash reports its true speed', sawDash && !reportedZero && maxReported > 12,
    `max reported ${maxReported.toFixed(1)} m/s, expected ~${SKILLS.charge.dashSpeed}`);
}
{
  // the reach a document can state and the reach the code applies must be one number
  const rA = FIGHTERS.gorilla.radius, rB = FIGHTERS.octopus.radius;
  const reach = SKILLS.smash.range + rA;
  let bad = 0;
  for (let d = 1.0; d < 8.0; d += 0.05) {
    const connects = inCone(0, 0, 0, SKILLS.smash.halfAngle, reach, 0, d, rB);
    const expected = d <= reach + rB + 1e-9;
    if (connects !== expected) bad++;
  }
  ok('smash connects exactly when dist <= range + both radii (dead ahead)', bad === 0, `${bad} boundary mismatches`);
}
{
  const t0 = burnRate(SUDDEN_DEATH_AT - 0.1), t1 = burnRate(SUDDEN_DEATH_AT + 10);
  ok('nothing burns before sudden death', t0 === 0);
  ok('the burn rises after it', t1 > 0);
  // and a pair that refuses to fight must still be resolved
  const passive = { tick: () => null };
  const { result } = runMatch({ octopus: passive, gorilla: passive }, { seed: 3 });
  ok('two fighters who do nothing are still killed by the arena',
    result.reason === 'kill' || result.reason === 'double-ko', `reason was ${result.reason} at ${result.seconds}s`);
  ok('and it happens well before the backstop clock', result.seconds < 62, `${result.seconds}s`);
}
{
  const world = createWorld(11);
  let bad = 0;
  const think = (id, p, api) => {
    if (id === 'octopus') { api.use('blink', Math.cos(p.t * 3), Math.sin(p.t * 5)); api.move(1, 0); }
    return null;
  };
  for (let i = 0; i < 900 && !world.done; i++) {
    step(world, think);
    const f = world.fighters.octopus;
    if (Math.abs(f.x) > ARENA_HALF - f.def.radius + 0.02) bad++;
    for (const b of OBSTACLES) {
      const qx = Math.max(b.x - b.hx, Math.min(f.x, b.x + b.hx));
      const qz = Math.max(b.z - b.hz, Math.min(f.z, b.z + b.hz));
      if (dist2(f.x, f.z, qx, qz) < f.def.radius - 0.05) bad++;
    }
  }
  ok('a blink never lands inside a block or outside the arena', bad === 0, `${bad} bad landings`);
}

// ---------------------------------------------------------------------------
group('sandbox');

{
  const runaway = compileBrain('function think(p, api) { while (true) {} }', 'runaway');
  const t0 = Date.now();
  const { result } = runMatch({ octopus: runaway, gorilla: stub('gorilla') }, { seed: 5 });
  const wall = Date.now() - t0;
  ok('a brain in an infinite loop does not hang the match', result.seconds > 0 && wall < 30000, `${wall} ms`);
  ok('and its faults are counted', result.octopus.faults > 0, `${result.octopus.faults} faults`);
  ok('and the other fighter still wins', result.winner === 'gorilla', `winner ${result.winner}`);
}
{
  const thrower = compileBrain('function think(p, api) { null.x; }', 'thrower');
  const { result } = runMatch({ octopus: thrower, gorilla: stub('gorilla') }, { seed: 5 });
  ok('a brain that throws is switched off, not crashed through', result.octopus.faults >= 1 && result.seconds > 0);
}
{
  const greedy = compileBrain('function think(p, api) { for (let i = 0; i < 5000; i++) api.ray(1, 0, 5); }', 'greedy');
  const { result } = runMatch({ octopus: greedy, gorilla: stub('gorilla') }, { seed: 5 });
  const first = result.log.find((e) => e.type === 'fault' && e.who === 'octopus');
  ok('exhausting the perception budget raises rather than lying',
    !!first && /perception calls/.test(String(first.error)), first ? first.error : 'no fault raised');
}
{
  const w = createWorld(1);
  const p = perceive(w, 'octopus');
  const required = ['t', 'dt', 'tick', 'timeLeft', 'burn', 'burnStartsIn', 'self', 'enemy', 'arena', 'events', 'mem'];
  const missing = required.filter((k) => !(k in p));
  ok('perception carries every field the prompt documents', missing.length === 0, `missing: ${missing}`);
  const selfReq = ['x', 'z', 'y', 'vx', 'vz', 'speed', 'heading', 'hp', 'maxHp', 'radius', 'maxSpeed',
    'turnRate', 'alive', 'airborne', 'stunned', 'invulnerable', 'busy', 'casting', 'cooldowns', 'skills'];
  ok('and every documented self field', selfReq.every((k) => k in p.self),
    `missing: ${selfReq.filter((k) => !(k in p.self))}`);
  ok('and enemy.visible is the same test the beam performs',
    typeof p.enemy.visible === 'boolean' && p.enemy.visible === hasLos(p.self.x, p.self.z, p.enemy.x, p.enemy.z, SOLIDS));
}
{
  // `reset()` is what the sweep tooling uses instead of recompiling. If it left
  // one byte of state behind, every balance number in the project would be
  // measured on matches that depend on the ones before them.
  const so = readFileSync(new URL('../brains/stub/octopus.js', import.meta.url), 'utf8');
  const sg = readFileSync(new URL('../brains/stub/gorilla.js', import.meta.url), 'utf8');
  const fresh = [];
  for (let r = 0; r < 6; r++) {
    fresh.push(JSON.stringify(runMatch({ octopus: compileBrain(so, 'o'), gorilla: compileBrain(sg, 'g') }, { seed: 3000 + r }).result.log));
  }
  const reused = { octopus: compileBrain(so, 'o'), gorilla: compileBrain(sg, 'g') };
  const recycled = [];
  for (let r = 0; r < 6; r++) {
    reused.octopus.reset(); reused.gorilla.reset();
    recycled.push(JSON.stringify(runMatch(reused, { seed: 3000 + r }).result.log));
  }
  ok('reset() is indistinguishable from a fresh compile',
    fresh.every((v, i) => v === recycled[i]),
    `${fresh.filter((v, i) => v !== recycled[i]).length} of 6 matches differed`);
}
{
  // memory must not survive a fresh compile, or 200 seeded rounds stop being 200 samples
  const counter = compileBrain('let n = 0;\nfunction think(p, api) { n++; api.say(String(n)); }', 'counter');
  const a = runMatch({ octopus: counter, gorilla: stub('gorilla') }, { seed: 8 });
  const b = runMatch({ octopus: compileBrain('let n = 0;\nfunction think(p, api) { n++; api.say(String(n)); }', 'counter'), gorilla: stub('gorilla') }, { seed: 8 });
  ok('a freshly compiled brain starts from a clean slate',
    JSON.stringify(a.result.log) === JSON.stringify(b.result.log));
}

// ---------------------------------------------------------------------------
group('wire');

{
  const w = createWorld(2);
  const s = snapshot(w);
  const need = ['t', 'tick', 'over', 'winner', 'octopus', 'gorilla', 'fx'];
  ok('a snapshot carries what the viewer reads', need.every((k) => k in s), `missing: ${need.filter((k) => !(k in s))}`);
  const fn = ['x', 'y', 'z', 'vx', 'vz', 'h', 'hp', 'maxHp', 'alive', 'act', 'phase', 'actPhase', 'inv', 'stun', 'say', 'cd'];
  ok('and every per-fighter field', fn.every((k) => k in s.octopus), `missing: ${fn.filter((k) => !(k in s.octopus))}`);
  ok('and it is JSON-safe', JSON.parse(JSON.stringify(s)).tick === s.tick);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
