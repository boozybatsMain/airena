// Does api.faceAt(enemy) on the thoughts AFTER a point-aimed bolt order throw the lead away?
// Two minimal kiter minds, identical except for the faceAt during the wind-up, vs the kiter pilot.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const ROOT = '/Users/boozybats/Public/Repos/work/Airena';
const { compileBrain } = await import(join(ROOT, 'src/brain/host.js'));
const { runMatch } = await import(join(ROOT, 'src/core/match.js'));
const { compileKit } = await import(join(ROOT, 'src/skills/compile.js'));
const { normalizeBuild } = await import(join(ROOT, 'src/core/config.js'));
const creatures = JSON.parse(readFileSync(join(ROOT, 'reports/combat/bakeoff/creatures.json'), 'utf8'));
const c = creatures.find((x) => x.id === 'kiter');
const kit = compileKit(c.kit).defs, build = normalizeBuild(c.build).build;
const other = (s) => (s === 'blue' ? 'orange' : 'blue');
const wrap = (a) => { let x = a; while (x > Math.PI) x -= 2 * Math.PI; while (x < -Math.PI) x += 2 * Math.PI; return x; };
const src = (faceDuringWindup) => `
function think(p, api) {
  const me = p.self, en = p.enemy;
  const dist = en.dist;
  if (api.ready('k1') && en.visible && dist < 18) {
    const aim = V.lead({ x: me.x, z: me.z }, { x: en.x, z: en.z }, { x: en.vx, z: en.vz }, me.kit.k1.speed);
    api.use('k1', aim);
  } else if (${faceDuringWindup ? 'true' : '!me.busy'}) {
    api.faceAt(en.x, en.z);
  }
  const toE = V.toward(me, en), perp = V.perp(toE);
  const sign = Math.floor(p.t / 1.5) % 2 === 0 ? 1 : -1;
  const radial = dist > 13 ? 1 : dist < 10 ? -1 : 0;
  api.move(toE.x * radial + perp.x * sign, toE.z * radial + perp.z * sign);
}`;
for (const face of [true, false]) {
  const mind = compileBrain(src(face), `face${face}`);
  const pilot = compileBrain(readFileSync(join(ROOT, 'brains/pilots/kiter.js'), 'utf8'), 'pilot');
  let n = 0, toward = 0, errSum = 0, hits = 0, misses = 0;
  for (const seed of [1, 2, 3, 4]) for (const side of ['blue', 'orange']) {
    mind.reset(); pilot.reset();
    const { result } = runMatch({ [side]: mind, [other(side)]: pilot }, { seed, kits: { blue: kit, orange: kit }, builds: { blue: build, orange: build }, onFrame: (s) => {
      for (const fx of s.fx) {
        if (fx.kind !== 'bolt' || fx.who !== side) continue;
        const en = s[other(side)];
        const rx = en.x - fx.x, rz = en.z - fx.z, vx = en.vx, vz = en.vz, sp = fx.speed;
        const a = vx * vx + vz * vz - sp * sp, b = 2 * (rx * vx + rz * vz), cc = rx * rx + rz * rz;
        const disc = b * b - 4 * a * cc; if (disc < 0) continue;
        const tt = [(-b - Math.sqrt(disc)) / (2 * a), (-b + Math.sqrt(disc)) / (2 * a)].filter((x) => x > 0).sort((p, q) => p - q)[0];
        if (tt === undefined) continue;
        const ideal = Math.atan2(rx + vx * tt, rz + vz * tt), direct = Math.atan2(rx, rz);
        if (Math.abs(wrap(ideal - direct)) < 3 * Math.PI / 180) continue;
        n++; const eI = Math.abs(wrap(fx.h - ideal)), eD = Math.abs(wrap(fx.h - direct));
        if (eI < eD) toward++; errSum += eI;
      }
    } });
    for (const ev of result.log) if (ev.who === side && ev.skill === 'k1') { if (ev.type === 'damage') hits++; if (ev.type === 'miss') misses++; }
  }
  console.log(`faceAt(enemy) during wind-up = ${face}: ${n} bolts needing lead, ${toward} (${Math.round(toward / n * 100)}%) aimed nearer the intercept, mean error from intercept ${(errSum / n * 180 / Math.PI).toFixed(1)}°, k1 damage lines ${hits}, misses ${misses}`);
}
