/**
 * How often, in ordinary matches, does the lane telegraph a lob/zone caster
 * draws stop short of the enemy — and how often does the skill hit anyway?
 */
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
const a = LIVE.indexOf('function kitLabels(c) {');
const b = LIVE.indexOf('import { TICK_HZ }');
const serverKitLabels = new Function('kitOf', 'DELIVERIES', 'EFFECTS',
  `${LIVE.slice(a, b)}\nreturn kitLabels;`)(kitOf, DELIVERIES, EFFECTS);

const src = (id) => readFileSync(join(ROOT, 'brains/kit-stub', `${id}.js`), 'utf8');
const brains = {
  octopus: compileBrain(src('octopus'), 'octopus'),
  gorilla: compileBrain(src('gorilla'), 'gorilla'),
};

const octKit = KIT_PRESETS.saboteur.kit;      // k2 is the lob (damage+blind)
const gorKit = KIT_PRESETS.breaker.kit;
const kits = { octopus: compileKit(octKit).defs, gorilla: compileKit(gorKit).defs };
V.kitLabels.octopus = serverKitLabels({ kit_active: 1, kit_json: JSON.stringify(octKit) });
V.kitLabels.gorilla = serverKitLabels({ kit_active: 1, kit_json: JSON.stringify(gorKit) });

const pending = [];
const WATCH = process.argv[2] || 'k2';
let castsSeen = 0, castsShort = 0, shortAndHit = 0, windupFrames = 0, shortFrames = 0;
const examples = [];
const seeds = Array.from({ length: Number(process.argv[3] || 12) }, (_, i) => 101 + i * 37);

for (const seed of seeds) {
  let cast = null;
  const hpBefore = new Map();
  runMatch(brains, {
    seed,
    kits,
    onFrame: (s) => {
      const v = s.octopus, e = s.gorilla;
      const kd = V.kitLabels.octopus[WATCH];
      if (v.act === WATCH && v.actPhase === 'windup') {
        V.updateTelegraph('octopus', v);
        const drawn = V.tele.octopus.lane.visible ? V.tele.octopus.lane.scale.y * V.tele.octopus.laneLen : 0;
        const dist = Math.hypot(e.x - v.x, e.z - v.z);
        windupFrames++;
        const short = drawn + 0.6 < Math.min(dist, kd.range ?? 0);
        if (short) shortFrames++;
        cast = { t: s.t, drawn, dist, short, hpAt: e.hp, x: v.x, z: v.z, h: v.h, seed };
      } else if (cast && v.act !== WATCH) {
        // the cast has left windup — resolve its outcome over the next 2 s
        castsSeen++;
        if (cast.short) castsShort++;
        cast.deadline = s.t + 2.2;
        cast.pending = true;
        if (!cast.short) cast = null;
        else { pending.push(cast); cast = null; }
      }
      for (const p of pending) {
        if (p.pending && s.t <= p.deadline && e.hp < p.hpAt - 0.01) {
          p.pending = false; p.hit = true; shortAndHit++;
          if (examples.length < 6) examples.push(p);
        } else if (p.pending && s.t > p.deadline) p.pending = false;
      }
    },
  });
}
console.log(`skill ${WATCH} (${V.kitLabels.octopus[WATCH].ru}, kind=${V.kitLabels.octopus[WATCH].kind}, range=${V.kitLabels.octopus[WATCH].range})`);
console.log(`  seeds ${seeds.length}, windup frames ${windupFrames}, of them lane visibly short of the enemy: ${shortFrames} (${(100*shortFrames/Math.max(1,windupFrames)).toFixed(1)}%)`);
console.log(`  casts ${castsSeen}, cast-with-short-lane ${castsShort}, of those that then damaged the enemy within 2.2 s: ${shortAndHit}`);
for (const e of examples) console.log('   e.g.', JSON.stringify({ seed: e.seed, t: +e.t.toFixed(2), drawn: +e.drawn.toFixed(2), dist: +e.dist.toFixed(2) }));
