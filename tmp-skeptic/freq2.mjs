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
const gorKit = KIT_PRESETS.breaker.kit;
const kits = { octopus: compileKit(octKit).defs, gorilla: compileKit(gorKit).defs };
if (compileKit(octKit).problems.length) throw new Error(JSON.stringify(compileKit(octKit).problems));
V.kitLabels.octopus = serverKitLabels({ kit_active: 1, kit_json: JSON.stringify(octKit) });
const kd = V.kitLabels.octopus[WATCH];

const seeds = Array.from({ length: Number(process.argv[3] || 24) }, (_, i) => 101 + i * 37);
let casts = 0, castsAnyShort = 0, castsShortHit = 0, frames = 0, short = 0, trimmed = 0;
const eg = [];
for (const seed of seeds) {
  let cur = null; const open = [];
  runMatch(brains, { seed, kits, onFrame: (s) => {
    const v = s.octopus, e = s.gorilla;
    if (v.act === WATCH && v.actPhase === 'windup') {
      V.updateTelegraph('octopus', v);
      const t = V.tele.octopus;
      const drawn = t.lane.visible ? t.lane.scale.y * t.laneLen : 0;
      const dist = Math.hypot(e.x - v.x, e.z - v.z);
      frames++;
      if (drawn + 0.6 < kd.range) trimmed++;
      const isShort = drawn + 0.6 < Math.min(dist, kd.range);
      if (isShort) short++;
      if (!cur) { cur = { seed, t0: s.t, any: false, hp: e.hp, drawn, dist }; }
      if (isShort) { cur.any = true; cur.drawn = drawn; cur.dist = dist; cur.tShort = s.t; }
    } else if (cur && (v.act !== WATCH || v.actPhase !== 'windup')) {
      casts++; if (cur.any) { castsAnyShort++; cur.deadline = s.t + 2.5; open.push(cur); }
      cur = null;
    }
    for (const p of open) {
      if (p.done) continue;
      if (s.t <= p.deadline && e.hp < p.hp - 0.01) { p.done = true; castsShortHit++; if (eg.length < 8) eg.push(p); }
      else if (s.t > p.deadline) p.done = true;
    }
  } });
}
console.log(`${which}: skill ${WATCH} (${kd.ru}) range ${kd.range}`);
console.log(`  ${seeds.length} matches — windup frames ${frames}; lane trimmed below its own range in ${trimmed} (${(100*trimmed/Math.max(1,frames)).toFixed(1)}%);`);
console.log(`  lane visibly stops short of the ENEMY in ${short} (${(100*short/Math.max(1,frames)).toFixed(1)}%)`);
console.log(`  casts ${casts}; casts with at least one such frame ${castsAnyShort}; of those, enemy lost hp within 2.5 s: ${castsShortHit}`);
for (const p of eg) console.log('   e.g. seed', p.seed, 't=' + p.tShort.toFixed(2), 'drawn=' + p.drawn.toFixed(2), 'enemy at', p.dist.toFixed(2));
