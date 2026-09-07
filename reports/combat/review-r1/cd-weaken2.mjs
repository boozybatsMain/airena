/* Clean measure: while a tile reads > 0, how long since that slot's last `use`? Chained casts reset the clock. */
import { readFileSync } from 'node:fs';
const ROOT = '/Users/boozybats/Public/Repos/work/Airena';
const { compileBrain } = await import(`${ROOT}/src/brain/host.js`);
const { runMatch } = await import(`${ROOT}/src/core/match.js`);
const { compileKit } = await import(`${ROOT}/src/skills/compile.js`);
const { normalizeBuild, DT } = await import(`${ROOT}/src/core/config.js`);
const A = compileKit([{ delivery: 'bolt', effects: ['weaken'], channel: 'cooldown', element: 'kinetic' }, { delivery: 'cone', effects: ['damage'], element: 'kinetic' }, { delivery: 'self', effects: ['shield'], element: 'kinetic' }]).defs;
const B = compileKit([{ delivery: 'cone', effects: ['damage'], element: 'kinetic' }, { delivery: 'bolt', effects: ['damage'], element: 'kinetic' }, { delivery: 'self', effects: ['shield'], element: 'kinetic' }]).defs;
const build = normalizeBuild(null).build;
for (const pilotName of ['rusher', 'controller']) {
  const src = readFileSync(`${ROOT}/brains/pilots/${pilotName}.js`, 'utf8');
  let worst = { since: 0 }; let over = 0, samples = 0;
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const kits = { blue: A, orange: B };
    // pass 1: collect use times
    const r1 = runMatch({ blue: compileBrain(src, 'blue'), orange: compileBrain(src, 'orange') }, { seed, kits, builds: { blue: build, orange: build }, record: false }).result;
    const uses = { blue: {}, orange: {} }; for (const e of r1.log) if (e.type === 'use') (uses[e.who][e.skill] ||= []).push(e.t);
    // pass 2: per tick, time since last use while cd > 0
    const last = { blue: {}, orange: {} }; const ptr = { blue: {}, orange: {} };
    const onFrame = (s) => { for (const side of ['blue', 'orange']) { const f = s[side]; if (!f.alive) continue; for (const [k, c] of Object.entries(f.cd)) { const ts = uses[side][k] || []; while ((ptr[side][k] || 0) < ts.length && ts[ptr[side][k] || 0] <= s.t + 1e-6) { last[side][k] = ts[ptr[side][k] || 0]; ptr[side][k] = (ptr[side][k] || 0) + 1; } if (c > 0 && last[side][k] != null) { const since = s.t - last[side][k]; samples++; const cd = kits[side][k].cooldown; if (since > cd + DT + 1e-6) { over++; if (since > worst.since) worst = { seed, side, k, since, cd, kind: kits[side][k].kind }; } } } } };
    runMatch({ blue: compileBrain(src, 'blue'), orange: compileBrain(src, 'orange') }, { seed, kits, builds: { blue: build, orange: build }, record: false, onFrame });
  }
  console.log(`${pilotName}: ticks with a tile still >0 later than its cooldown+1 tick after the last use: ${over} of ${samples}; worst: ${worst.since ? `${worst.side}.${worst.k} (${worst.kind}, cd ${worst.cd} s) still on cooldown ${worst.since.toFixed(2)} s after the cast, seed ${worst.seed}` : 'none'}`);
}
