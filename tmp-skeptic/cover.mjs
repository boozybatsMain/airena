import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as c from '../src/core/config.js';
import { runMatch } from '../src/core/match.js';
import { compileBrain } from '../src/brain/host.js';
import { compileKit } from '../src/skills/compile.js';
import { KIT_PRESETS } from '../src/server/forge/pipeline.js';
import { kitOf } from '../src/server/arena-loop.js';
import { DELIVERIES, EFFECTS } from '../src/skills/registry.js';
import { buildTelegraph } from './tele.mjs';

const ROOT = '/Users/boozybats/Public/Repos/work/Airena';
const cfg = JSON.parse(JSON.stringify({
  arena: { half: c.ARENA_HALF, wallHeight: c.WALL_HEIGHT, obstacles: c.OBSTACLES },
  fighters: c.FIGHTERS, skills: c.SKILLS, tickHz: c.TICK_HZ, thinkHz: c.THINK_HZ,
  matchSeconds: c.MATCH_SECONDS, suddenDeathAt: c.SUDDEN_DEATH_AT, suddenDeathRamp: c.SUDDEN_DEATH_RAMP,
}));
const V = buildTelegraph(cfg);
const LIVE = readFileSync(join(ROOT, 'src/server/live.js'), 'utf8');
const serverKitLabels = new Function('kitOf', 'DELIVERIES', 'EFFECTS',
  `${LIVE.slice(LIVE.indexOf('function kitLabels(c) {'), LIVE.indexOf('import { TICK_HZ }'))}\nreturn kitLabels;`)(kitOf, DELIVERIES, EFFECTS);

const brains = {
  octopus: compileBrain(readFileSync(join(ROOT, 'tmp-skeptic/coverbrain.js'), 'utf8'), 'octopus'),
  gorilla: compileBrain(readFileSync(join(ROOT, 'brains/kit-stub/gorilla.js'), 'utf8'), 'gorilla'),
};
const octKit = KIT_PRESETS.saboteur.kit;
const kits = { octopus: compileKit(octKit).defs, gorilla: compileKit(KIT_PRESETS.breaker.kit).defs };
V.kitLabels.octopus = serverKitLabels({ kit_active: 1, kit_json: JSON.stringify(octKit) });
const kd = V.kitLabels.octopus.k2;

const seeds = Array.from({ length: Number(process.argv[2] || 12) }, (_, i) => 101 + i * 37);
let casts = 0, short = 0, shortHit = 0, frames = 0, shortFrames = 0, lastFrameShort = 0;
const eg = [];
for (const seed of seeds) {
  const list = []; let cur = null;
  const { world } = runMatch(brains, { seed, kits, onFrame: (s) => {
    const v = s.octopus, e = s.gorilla;
    if (v.act === 'k2' && v.actPhase === 'windup') {
      V.updateTelegraph('octopus', v);
      const t = V.tele.octopus;
      const drawn = t.lane.visible ? t.lane.scale.y * t.laneLen : 0;
      const dist = Math.hypot(e.x - v.x, e.z - v.z);
      const isShort = drawn + 0.6 < Math.min(dist, kd.range);
      frames++; if (isShort) shortFrames++;
      if (!cur) cur = { seed, n: 0, nShort: 0 };
      cur.n++; if (isShort) { cur.nShort++; cur.drawn = drawn; cur.dist = dist; cur.tShort = s.t; }
      cur.tEnd = s.t; cur.lastShort = isShort;
    } else if (cur) { list.push(cur); cur = null; }
  } });
  if (cur) list.push(cur);
  const dmg = world.log.filter((l) => l.type === 'damage' && l.who === 'octopus' && l.skill === 'k2');
  for (const k of list) {
    casts++;
    if (k.lastShort) lastFrameShort++;
    const hit = dmg.some((d) => d.t >= k.tEnd - 0.05 && d.t <= k.tEnd + kd.range / DELIVERIES.lob.speed + 0.3);
    if (k.nShort > 0) { short++; if (hit) { shortHit++; if (eg.length < 8) eg.push({ ...k, amount: dmg.find((d) => d.t >= k.tEnd - 0.05 && d.t <= k.tEnd + 1.6).amount }); } }
  }
}
console.log(`lob from cover — ${seeds.length} matches, shipped saboteur kit, brain that uses the lob as the prompt describes it`);
console.log(`  windup frames ${frames}; lane visibly short of the enemy in ${shortFrames} (${(100*shortFrames/Math.max(1,frames)).toFixed(1)}%)`);
console.log(`  casts ${casts}; with a short lane at some point ${short}; short on the LAST windup frame ${lastFrameShort}; short-lane casts that hit: ${shortHit}`);
for (const p of eg) console.log(`   seed ${p.seed} t=${p.tShort.toFixed(2)} short for ${p.nShort}/${p.n} windup frames, lane ${p.drawn.toFixed(2)} m, enemy ${p.dist.toFixed(2)} m, damage ${p.amount}`);
