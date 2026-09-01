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
const src = (id) => readFileSync(join(ROOT, 'brains/kit-stub', `${id}.js`), 'utf8');
const brains = { octopus: compileBrain(src('octopus'), 'octopus'), gorilla: compileBrain(src('gorilla'), 'gorilla') };

const which = process.argv[2] || 'lob';
const octKit = which === 'lob'
  ? KIT_PRESETS.saboteur.kit
  : [{ trigger: 'active', delivery: 'zone', effects: ['damage'], element: 'arc' },
     { trigger: 'active', delivery: 'bolt', effects: ['damage'], element: 'void' },
     { trigger: 'on_low_hp', delivery: 'self', effects: ['heal'], element: 'frost' }];
const WATCH = which === 'lob' ? 'k2' : 'k1';
const kits = { octopus: compileKit(octKit).defs, gorilla: compileKit(KIT_PRESETS.breaker.kit).defs };
V.kitLabels.octopus = serverKitLabels({ kit_active: 1, kit_json: JSON.stringify(octKit) });
const kd = V.kitLabels.octopus[WATCH];

const seeds = Array.from({ length: Number(process.argv[3] || 24) }, (_, i) => 101 + i * 37);
let casts = 0, shortCasts = 0, shortCastsThatHit = 0, hitCasts = 0;
const eg = [];
for (const seed of seeds) {
  const castList = []; let cur = null;
  const { world } = runMatch(brains, { seed, kits, onFrame: (s) => {
    const v = s.octopus, e = s.gorilla;
    if (v.act === WATCH && v.actPhase === 'windup') {
      V.updateTelegraph('octopus', v);
      const t = V.tele.octopus;
      const drawn = t.lane.visible ? t.lane.scale.y * t.laneLen : 0;
      const dist = Math.hypot(e.x - v.x, e.z - v.z);
      if (!cur) cur = { seed, t0: s.t, short: false };
      cur.tEnd = s.t;
      cur.short = drawn + 0.6 < Math.min(dist, kd.range); cur.drawn = drawn; cur.dist = dist; cur.tShort = s.t;
    } else if (cur) { castList.push(cur); cur = null; }
  } });
  if (cur) castList.push(cur);
  const dmg = world.log.filter((l) => l.type === 'damage' && l.who === 'octopus' && l.skill === WATCH);
  const flight = which === 'lob' ? kd.range / DELIVERIES.lob.speed + 0.3 : 3.4;
  for (const k of castList) {
    casts++;
    const hit = dmg.some((d) => d.t >= k.tEnd - 0.05 && d.t <= k.tEnd + flight);
    if (hit) hitCasts++;
    if (k.short) { shortCasts++; if (hit) { shortCastsThatHit++; if (eg.length < 8) eg.push({ ...k, amount: dmg.find((d) => d.t >= k.tEnd - 0.05 && d.t <= k.tEnd + flight).amount }); } }
  }
}
console.log(`${which} (${kd.ru}) — ${seeds.length} matches, shipped starter kit, reference brains`);
console.log(`  casts ${casts}; casts that damaged the enemy ${hitCasts}`);
console.log(`  casts whose red lane visibly stopped short of the enemy: ${shortCasts}; of THOSE, casts that damaged the enemy anyway: ${shortCastsThatHit}`);
for (const p of eg) console.log(`   seed ${p.seed} t=${p.tShort.toFixed(2)} lane drawn ${p.drawn.toFixed(2)} m, enemy ${p.dist.toFixed(2)} m away, damage ${p.amount}`);
