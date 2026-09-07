import { run, spammer, summarise } from './harness.mjs';
const K = (delivery, effects, channel, element = 'kinetic') => ({ delivery, effects, ...(channel ? { channel } : {}), element });
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const DMG3 = [K('beam', ['damage']), K('bolt', ['damage']), K('cone', ['damage'])];
const league = (label, A, B, opts = {}) => { const rs = SEEDS.map((seed) => run({ kits: { blue: A, orange: B }, brains: { blue: spammer(opts.a || {}), orange: spammer(opts.b || {}) }, seed, cd: ('cd' in opts ? opts.cd : null) })); console.log(summarise(rs, label)); return rs; };
league('[beam:silence+dmg, bolt:stun+dmg, self:heal] vs [beam:dmg, bolt:dmg, self:heal]', [K('beam', ['silence', 'damage']), K('bolt', ['stun', 'damage']), K('self', ['heal'])], [K('beam', ['damage']), K('bolt', ['damage']), K('self', ['heal'])], { a: { hold: 9 }, b: { hold: 9 } });
league('sustain [bolt:dmg, self:heal, self:shield] vs DMG3 (per-delivery CDs)', [K('bolt', ['damage']), K('self', ['heal']), K('self', ['shield'])], DMG3, { a: { hold: 9, prio: ['k2', 'k3', 'k1'] }, b: { hold: 9 } });
league('cooldown boost [self:boost(cd), beam:dmg, bolt:dmg] vs DMG3 (per-delivery CDs)', [K('self', ['boost'], 'cooldown'), K('beam', ['damage']), K('bolt', ['damage'])], DMG3, { a: { hold: 9 }, b: { hold: 9 } });
league('zone:stun pin [zone:stun, zone:dmg, beam:dmg] vs DMG3 (per-delivery CDs)', [K('zone', ['stun']), K('zone', ['damage']), K('beam', ['damage'])], DMG3, { a: { hold: 8 }, b: { hold: 9 } });
