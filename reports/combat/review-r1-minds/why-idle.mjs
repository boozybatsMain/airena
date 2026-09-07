// Instrument one mind: log every api.use / api.ready answer per thought for a window of the match.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const ROOT = '/Users/boozybats/Public/Repos/work/Airena';
const { compileBrain } = await import(join(ROOT, 'src/brain/host.js'));
const { runMatch } = await import(join(ROOT, 'src/core/match.js'));
const { compileKit } = await import(join(ROOT, 'src/skills/compile.js'));
const { normalizeBuild } = await import(join(ROOT, 'src/core/config.js'));
const [key, pilotName, seedS, t0S, t1S] = process.argv.slice(2);
const [dir, cid] = key.split('/');
const creatures = JSON.parse(readFileSync(join(ROOT, 'reports/combat/bakeoff/creatures.json'), 'utf8'));
const c = creatures.find((x) => x.id === cid);
const kit = compileKit(c.kit).defs, build = normalizeBuild(c.build).build;
const mind = compileBrain(readFileSync(join(ROOT, 'reports/combat/bakeoff', dir, `${cid}.js`), 'utf8'), key);
const pilot = compileBrain(readFileSync(join(ROOT, 'brains/pilots', `${pilotName}.js`), 'utf8'), 'pilot');
const t0 = Number(t0S), t1 = Number(t1S);
const wrapped = {
  reset() { mind.reset(); },
  tick(p, api) {
    if (p.t < t0 || p.t > t1) return mind.tick(p, api);
    const calls = [];
    const a2 = {};
    for (const k of Object.keys(api)) {
      a2[k] = (...args) => { const r = api[k](...args); if (k === 'use' || k === 'ready' || k === 'los' || k === 'pathTo' || k === 'move' || k === 'moveTo' || k === 'stop' || k === 'faceAt' || k === 'face') calls.push(`${k}(${args.map((x) => typeof x === 'object' ? JSON.stringify(x) : (typeof x === 'number' ? x.toFixed(2) : x)).join(',')})${k === 'ready' ? '=' + r : ''}`); return r; };
    }
    const r = mind.tick(p, a2);
    const s = p.self, e = p.enemy;
    console.log(`t=${p.t.toFixed(2)} dist ${e.dist.toFixed(1)} busy ${s.busy} sil ${s.silenced} root ${s.rooted} stun ${s.stunned} cds ${JSON.stringify(s.cooldowns)} eCast ${e.casting ? e.casting.skill + '/' + e.casting.phase : '-'} vis ${e.visible} | ${calls.join(' ')}`);
    return r;
  },
};
runMatch({ blue: wrapped, orange: pilot }, { seed: Number(seedS), kits: { blue: kit, orange: kit }, builds: { blue: build, orange: build } });
