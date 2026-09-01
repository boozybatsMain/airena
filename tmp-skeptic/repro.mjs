/**
 * End-to-end: real sim (grammar kit) -> real snapshot -> the viewer's OWN
 * telegraph code, sliced out of src/viewer/main.js.
 */
import { readFileSync } from 'node:fs';
import * as c from '../src/core/config.js';
import { createWorld, step, snapshot } from '../src/core/sim.js';
import { compileKit } from '../src/skills/compile.js';
import { kitOf } from '../src/server/arena-loop.js';
import { DELIVERIES, EFFECTS } from '../src/skills/registry.js';
import { buildTelegraph } from './tele.mjs';

const cfg = JSON.parse(JSON.stringify({
  arena: { half: c.ARENA_HALF, wallHeight: c.WALL_HEIGHT, obstacles: c.OBSTACLES },
  fighters: c.FIGHTERS, skills: c.SKILLS, tickHz: c.TICK_HZ, thinkHz: c.THINK_HZ,
  matchSeconds: c.MATCH_SECONDS, suddenDeathAt: c.SUDDEN_DEATH_AT, suddenDeathRamp: c.SUDDEN_DEATH_RAMP,
}));
const V = buildTelegraph(cfg);

// ---- the server's own kit-label builder, sliced out of src/server/live.js ----
const LIVE = readFileSync(new URL('../src/server/live.js', import.meta.url), 'utf8');
const a = LIVE.indexOf('function kitLabels(c) {');
const b = LIVE.indexOf("import { TICK_HZ }");
if (a < 0 || b < 0 || b < a) throw new Error('live.js kitLabels anchors moved');
const serverKitLabels = new Function('kitOf', 'DELIVERIES', 'EFFECTS',
  `${LIVE.slice(a, b)}\nreturn kitLabels;`)(kitOf, DELIVERIES, EFFECTS);

export function run({ kit, useName, oct, gor, ticks = 90, label }) {
  const compiled = compileKit(kit);
  if (compiled.problems.length) throw new Error(`kit rejected: ${JSON.stringify(compiled.problems)}`);
  const world = createWorld(7, { kits: { octopus: compiled.defs } });
  const labels = serverKitLabels({ kit_active: 1, kit_json: JSON.stringify(kit) });
  V.kitLabels.octopus = labels;

  const pin = () => {
    const o = world.fighters.octopus, g = world.fighters.gorilla;
    o.x = oct.x; o.z = oct.z; o.heading = oct.h; o.vx = 0; o.vz = 0; o.y = 0;
    g.x = gor.x; g.z = gor.z; g.heading = gor.h ?? Math.PI; g.vx = 0; g.vz = 0; g.y = 0;
  };
  pin();
  const hp0 = world.fighters.gorilla.hp;
  let fired = false;
  const lanes = [];
  const log = [];
  for (let i = 0; i < ticks; i++) {
    pin();
    step(world, (id, snap, api) => {
      if (id === 'octopus' && !fired) { api.use(useName); fired = true; }
      return {};
    });
    pin();
    const s = snapshot(world);
    const v = s.octopus;
    if (v.act === useName && v.actPhase === 'windup') {
      V.updateTelegraph('octopus', v);
      const t = V.tele.octopus;
      lanes.push({
        t: s.t, laneVisible: t.lane.visible, coneVisible: t.cone.visible,
        drawn: +(t.lane.scale.y * t.laneLen).toFixed(3), opacity: +t.lane.material.opacity.toFixed(3),
      });
    }
    for (const e of s.fx) if (e.kind === 'impact' || e.kind === 'zone') log.push({ t: s.t, kind: e.kind, x: e.x, z: e.z, blocked: !!e.blocked });
  }
  const g = world.fighters.gorilla;
  const misses = world.log.filter((e) => e.type === 'miss');
  return {
    label, hp0, hp1: g.hp, dmg: +(hp0 - g.hp).toFixed(2),
    lanes, misses, log,
    range: compiled.defs[useName].range, kind: compiled.defs[useName].kind,
    dist: +Math.hypot(gor.x - oct.x, gor.z - oct.z).toFixed(2),
  };
}
