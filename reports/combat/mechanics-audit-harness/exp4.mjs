import { createWorld, step } from '/Users/boozybats/Public/Repos/work/Airena/src/core/sim.js';
import { compileKit } from '/Users/boozybats/Public/Repos/work/Airena/src/skills/compile.js';
import { run, spammer, summarise } from './harness.mjs';
const K = (delivery, effects, channel, element = 'kinetic') => ({ delivery, effects, ...(channel ? { channel } : {}), element });
const kitOf = (arr, cd = 3) => { const o = compileKit(arr, { fixedCooldown: cd }); if (o.problems.length) throw new Error(JSON.stringify(o.problems)); return o.defs; };
const place = (w, bx, bz, ox, oz) => { const b = w.fighters.blue, o = w.fighters.orange; b.x = bx; b.z = bz; o.x = ox; o.z = oz; b.px = bx; b.pz = bz; o.px = ox; o.pz = oz; b.heading = Math.atan2(ox - bx, oz - bz); b.wantHeading = b.heading; o.heading = Math.atan2(bx - ox, bz - oz); o.wantHeading = o.heading; };
console.log('=== E7b knock/pull: peak displacement vs control within 1.2 s of impact ===');
for (const [eff] of [['knock'], ['pull']]) for (const mode of ['standing', 'walking toward caster', 'walking away']) for (const accel of [12, 24, 36]) {
  const mk = () => { const w = createWorld(7, { kits: { blue: kitOf([K('beam', [eff]), K('self', ['shield']), K('self', ['heal'])]), orange: kitOf([K('self', ['shield']), K('self', ['heal']), K('beam', ['damage'])]) }, builds: { blue: {}, orange: { accel } } }); place(w, 0, -6, 0, 6); return w; };
  const w = mk(), wc = mk();
  let fired = false;
  const mv = (id, api) => { if (id === 'orange') { if (mode === 'walking toward caster') api.move(0, -1); else if (mode === 'walking away') api.move(0, 1); } };
  const think = (id, p, api) => { mv(id, api); if (id === 'blue' && !fired && p.t > 0.3) { api.faceAt(p.enemy.x, p.enemy.z); api.use('k1'); fired = true; } };
  const thinkC = (id, p, api) => mv(id, api);
  let peak = 0, tHit = null;
  for (let i = 0; i < 70; i++) {
    step(w, think); step(wc, thinkC);
    if (tHit === null && w.log.some((e) => e.type === 'use' && e.who === 'blue')) tHit = w.t;
    const d = w.fighters.orange.z - wc.fighters.orange.z;
    if (Math.abs(d) > Math.abs(peak)) peak = d;
  }
  console.log(`${eff.padEnd(5)} ${mode.padEnd(22)} accel ${String(accel).padStart(2)} → peak ${peak.toFixed(2)} m (+z away from caster)`);
}
console.log('\n=== E15 control ROTATION vs per-id immunity (current tree) ===');
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const DMG3 = [K('beam', ['damage']), K('bolt', ['damage']), K('cone', ['damage'])];
const league = (label, A, B, opts = {}) => { const rs = SEEDS.map((seed) => run({ kits: { blue: A, orange: B }, brains: { blue: spammer(opts.a || {}), orange: spammer(opts.b || {}) }, seed, cd: ('cd' in opts ? opts.cd : null) })); console.log(summarise(rs, label)); return rs; };
league('[beam:stun, bolt:silence, lob:root] vs DMG3', [K('beam', ['stun']), K('bolt', ['silence']), K('lob', ['root'])], DMG3, { a: { hold: 9 }, b: { hold: 9 } });
league('[beam:stun+dmg, bolt:silence+dmg, cone:root+dmg] vs DMG3', [K('beam', ['stun', 'damage']), K('bolt', ['silence', 'damage']), K('cone', ['root', 'damage'])], DMG3, { a: { hold: 9 }, b: { hold: 9 } });
league('[beam:silence+dmg, bolt:stun+dmg, self:heal] vs [beam:dmg, bolt:dmg, self:heal]', [K('beam', ['silence', 'damage']), K('bolt', ['stun', 'damage']), K('self', ['heal'])], [K('beam', ['damage']), K('bolt', ['damage']), K('self', ['heal'])], { a: { hold: 9 }, b: { hold: 9 } });
league('sustain [bolt:dmg, self:heal, self:shield] vs [beam:dmg, bolt:dmg, cone:dmg] (per-delivery CDs)', [K('bolt', ['damage']), K('self', ['heal']), K('self', ['shield'])], DMG3, { a: { hold: 9, prio: ['k2', 'k3', 'k1'] }, b: { hold: 9 } });
league('cooldown boost [self:boost(cd), beam:dmg, bolt:dmg] vs DMG3 (per-delivery CDs)', [K('self', ['boost'], 'cooldown'), K('beam', ['damage']), K('bolt', ['damage'])], DMG3, { a: { hold: 9 }, b: { hold: 9 } });
