// World experiment: does any mortar speed / splash / wind-up make the aimed mortar land on a strafing kiter?
// The kit passed to runMatch is our own compiled copy; the registry is untouched.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const ROOT = '/Users/boozybats/Public/Repos/work/Airena';
const { compileBrain } = await import(join(ROOT, 'src/brain/host.js'));
const { runMatch } = await import(join(ROOT, 'src/core/match.js'));
const { compileKit } = await import(join(ROOT, 'src/skills/compile.js'));
const { normalizeBuild } = await import(join(ROOT, 'src/core/config.js'));
const creatures = JSON.parse(readFileSync(join(ROOT, 'reports/combat/bakeoff/creatures.json'), 'utf8'));
const c = creatures.find((x) => x.id === 'caster');
const build = normalizeBuild(c.build).build;
const other = (s) => (s === 'blue' ? 'orange' : 'blue');
const mindsToTry = ['sub-opus-high/caster', 'sub-fable-high/caster'];
const variants = [
  { name: 'as shipped', speed: 12, splash: 1.8, windup: 0.5 },
  { name: 'speed 18', speed: 18, splash: 1.8, windup: 0.5 },
  { name: 'speed 24', speed: 24, splash: 1.8, windup: 0.5 },
  { name: 'splash 2.6', speed: 12, splash: 2.6, windup: 0.5 },
  { name: 'windup 0.3', speed: 12, splash: 1.8, windup: 0.3 },
  { name: 'speed 18 + splash 2.4', speed: 18, splash: 2.4, windup: 0.5 },
  { name: 'speed 18 + windup 0.3', speed: 18, splash: 1.8, windup: 0.3 },
];
for (const key of mindsToTry) {
  const [dir, cid] = key.split('/');
  const mind = compileBrain(readFileSync(join(ROOT, 'reports/combat/bakeoff', dir, `${cid}.js`), 'utf8'), key);
  console.log(`\n${key}`);
  for (const v of variants) {
    const kit = compileKit(c.kit).defs;
    kit.k1.speed = v.speed; kit.k1.splash = v.splash; kit.k1.windup = v.windup;
    for (const pn of ['kiter', 'rusher']) {
      const pilot = compileBrain(readFileSync(join(ROOT, 'brains/pilots', `${pn}.js`), 'utf8'), 'pilot');
      let thrown = 0, hit = 0, wins = 0, games = 0, sd = 0, secs = 0, pThrown = 0, pHit = 0;
      for (const seed of [1, 2, 3, 4]) for (const side of ['blue', 'orange']) {
        mind.reset(); pilot.reset();
        const lobs = []; const frames = [];
        const { result } = runMatch({ [side]: mind, [other(side)]: pilot }, { seed, kits: { blue: kit, orange: kit }, builds: { blue: build, orange: build }, onFrame: (s) => { frames.push(s); for (const fx of s.fx) if (fx.kind === 'lob') lobs.push(fx); } });
        games++; if (result.winner === side) wins++; if (result.seconds > 30) sd++; secs += result.seconds;
        for (const l of lobs) {
          const tLand = l.t + (l.aim || 0) / (l.speed || 12);
          const fr = frames.find((f) => f.t >= tLand - 0.017) || frames[frames.length - 1];
          const en = fr[other(l.who)];
          const ok = Math.hypot(l.x1 - en.x, l.z1 - en.z) <= (l.splash || 1.8) + build.radius;
          if (l.who === side) { thrown++; if (ok) hit++; } else { pThrown++; if (ok) pHit++; }
        }
      }
      console.log(`  ${v.name.padEnd(24)} vs ${pn.padEnd(6)}: mind mortars ${String(thrown).padStart(3)} on target ${String(Math.round(hit / Math.max(1, thrown) * 100)).padStart(3)}% | pilot ${String(Math.round(pHit / Math.max(1, pThrown) * 100)).padStart(3)}% | wins ${wins}/${games} | len ${(secs / games).toFixed(1)}s | sudden death ${sd}/${games}`);
    }
  }
}
