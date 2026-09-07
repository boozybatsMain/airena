// Mortar lead experiment: the opus-high caster with its lead factor forced to F, vs the kiter and rusher pilots.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const ROOT = '/Users/boozybats/Public/Repos/work/Airena';
const { compileBrain } = await import(join(ROOT, 'src/brain/host.js'));
const { runMatch } = await import(join(ROOT, 'src/core/match.js'));
const { compileKit } = await import(join(ROOT, 'src/skills/compile.js'));
const { normalizeBuild } = await import(join(ROOT, 'src/core/config.js'));
const creatures = JSON.parse(readFileSync(join(ROOT, 'reports/combat/bakeoff/creatures.json'), 'utf8'));
const c = creatures.find((x) => x.id === 'caster');
const kit = compileKit(c.kit).defs, build = normalizeBuild(c.build).build;
const src = readFileSync(join(ROOT, 'reports/combat/bakeoff/sub-opus-high/caster.js'), 'utf8');
const other = (s) => (s === 'blue' ? 'orange' : 'blue');
for (const F of ['orig', 0, 0.25, 0.5, 0.75, 1.0]) {
  const s2 = F === 'orig' ? src : src.replace("const evadeFactor = (en.casting || en.rooted || en.stunned) ? 0.45 : 0.85;", `const evadeFactor = ${F};`);
  if (F !== 'orig' && s2 === src) throw new Error('patch failed');
  const mind = compileBrain(s2, `lead${F}`);
  for (const pn of ['kiter', 'rusher']) {
    const pilot = compileBrain(readFileSync(join(ROOT, 'brains/pilots', `${pn}.js`), 'utf8'), 'pilot');
    let thrown = 0, hit = 0, wins = 0, games = 0, dmg = 0, sd = 0;
    for (const seed of [1, 2, 3, 4]) for (const side of ['blue', 'orange']) {
      mind.reset(); pilot.reset();
      const lobs = [];
      const frames = [];
      const { result } = runMatch({ [side]: mind, [other(side)]: pilot }, { seed, kits: { blue: kit, orange: kit }, builds: { blue: build, orange: build }, onFrame: (s) => { frames.push(s); for (const fx of s.fx) if (fx.kind === 'lob' && fx.who === side) lobs.push(fx); } });
      games++; if (result.winner === side) wins++; dmg += result[side].damageDealt; if (result.seconds > 30) sd++;
      for (const l of lobs) {
        const tLand = l.t + (l.aim || 0) / (l.speed || 12);
        const fr = frames.find((f) => f.t >= tLand - 0.017) || frames[frames.length - 1];
        const en = fr[other(side)];
        thrown++; if (Math.hypot(l.x1 - en.x, l.z1 - en.z) <= (l.splash || 1.8) + build.radius) hit++;
      }
    }
    console.log(`lead ${String(F).padEnd(5)} vs ${pn.padEnd(6)}: mortars ${thrown}, on target ${hit} (${Math.round(hit / thrown * 100)}%), wins ${wins}/${games}, dmg/game ${Math.round(dmg / games)}, sudden death ${sd}/${games}`);
  }
}
