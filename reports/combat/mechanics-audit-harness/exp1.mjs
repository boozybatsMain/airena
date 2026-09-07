import { run, spammer, summarise, avg } from './harness.mjs';

const K = (delivery, effects, channel, element = 'kinetic') => ({ delivery, effects, ...(channel ? { channel } : {}), element });
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const league = (label, A, B, opts = {}) => {
  const rs = SEEDS.map((seed) => run({ kits: { blue: A, orange: B }, brains: { blue: spammer(opts.a || {}), orange: spammer(opts.b || {}) }, seed, cd: ('cd' in opts ? opts.cd : 3), cdOverride: opts.cdOverride || null, builds: opts.builds || null }));
  console.log(summarise(rs, label));
  return rs;
};

console.log('=== E1 cadence baseline: 3 damage skills each side, symmetric ===');
const DMG3 = [K('beam', ['damage']), K('bolt', ['damage']), K('cone', ['damage'])];
league('derived CD (today)', DMG3, DMG3, { cd: null, cdOverride: null, a: { hold: 9 }, b: { hold: 9 } });
// derived: need cd=null → compileKit fixedCooldown null. run() passes cd; handle null
league('fixed CD 3', DMG3, DMG3, { cd: 3, a: { hold: 9 }, b: { hold: 9 } });
league('fixed CD 2', DMG3, DMG3, { cd: 2, a: { hold: 9 }, b: { hold: 9 } });
league('fixed CD 3, hp 300 both', DMG3, DMG3, { cd: 3, builds: { blue: { hp: 300 }, orange: { hp: 300 } }, a: { hold: 9 }, b: { hold: 9 } });
league('fixed CD 3, hp 60 both', DMG3, DMG3, { cd: 3, builds: { blue: { hp: 60 }, orange: { hp: 60 } }, a: { hold: 9 }, b: { hold: 9 } });

console.log('\n=== E2 sustain: heal+shield vs 3 damage ===');
league('A=[beam:dmg, self:heal, self:shield] vs DMG3', [K('beam', ['damage']), K('self', ['heal']), K('self', ['shield'])], DMG3, { a: { hold: 9, prio: ['k2', 'k3', 'k1'] }, b: { hold: 9 } });
league('A=[beam:dmg, self:heal+shield, blink:shield] vs DMG3', [K('beam', ['damage']), K('self', ['heal', 'shield']), K('blink', ['shield'])], DMG3, { a: { hold: 9, prio: ['k2', 'k3', 'k1'] }, b: { hold: 9 } });
league('A=[bolt:dmg, self:heal, self:shield] vs B=[beam:dmg, self:heal, self:shield] mirror', [K('bolt', ['damage']), K('self', ['heal']), K('self', ['shield'])], [K('beam', ['damage']), K('self', ['heal']), K('self', ['shield'])], { a: { hold: 9, prio: ['k2', 'k3', 'k1'] }, b: { hold: 9, prio: ['k2', 'k3', 'k1'] } });

console.log('\n=== E3 silence lock ===');
league('A=[bolt:sil, lob:sil, beam:dmg] vs [beam:dmg, bolt:dmg, self:cleanse]', [K('bolt', ['silence']), K('lob', ['silence']), K('beam', ['damage'])], [K('beam', ['damage']), K('bolt', ['damage']), K('self', ['cleanse'])], { a: { hold: 9, prio: ['k1', 'k2', 'k3'] }, b: { hold: 9, prio: ['k3', 'k1', 'k2'] } });
league('A=[beam:sil+dmg, bolt:sil, self:shield] vs DMG3', [K('beam', ['silence', 'damage']), K('bolt', ['silence']), K('self', ['shield'])], DMG3, { a: { hold: 9, prio: ['k1', 'k2', 'k3'] }, b: { hold: 9 } });

console.log('\n=== E4 stun lock ===');
league('A=[beam:stun, bolt:stun, lob:stun] vs DMG3', [K('beam', ['stun']), K('bolt', ['stun']), K('lob', ['stun'])], DMG3, { a: { hold: 9 }, b: { hold: 9 } });
league('A=[beam:stun+dmg, bolt:stun+dmg, cone:dmg] vs DMG3', [K('beam', ['stun', 'damage']), K('bolt', ['stun', 'damage']), K('cone', ['damage'])], DMG3, { a: { hold: 9 }, b: { hold: 9 } });
league('A=[beam:root, bolt:root, beam:dmg] vs DMG3', [K('beam', ['root']), K('bolt', ['root']), K('beam', ['damage'])], DMG3, { a: { hold: 9 }, b: { hold: 9 } });
league('A=[beam:blind, bolt:blind, beam:dmg] vs DMG3', [K('beam', ['blind']), K('bolt', ['blind']), K('beam', ['damage'])], DMG3, { a: { hold: 9 }, b: { hold: 9 } });

console.log('\n=== E5 zone field ===');
league('A=[zone:dmg, zone:burn, zone:root] vs DMG3', [K('zone', ['damage']), K('zone', ['burn']), K('zone', ['root'])], DMG3, { a: { hold: 8 }, b: { hold: 9 } });
league('A=[zone:stun, zone:dmg, beam:dmg] vs DMG3', [K('zone', ['stun']), K('zone', ['damage']), K('beam', ['damage'])], DMG3, { a: { hold: 8 }, b: { hold: 9 } });
league('A=[zone:silence, zone:dmg, beam:dmg] vs DMG3', [K('zone', ['silence']), K('zone', ['damage']), K('beam', ['damage'])], DMG3, { a: { hold: 8 }, b: { hold: 9 } });

console.log('\n=== E6 wall spam ===');
league('A=[self:wall, beam:wall+dmg, bolt:wall] vs DMG3', [K('self', ['wall']), K('beam', ['wall', 'damage']), K('bolt', ['wall'])], DMG3, { a: { hold: 9 }, b: { hold: 9 } });

console.log('\n=== E11 boost/weaken permanence ===');
league('A=[self:boost(cooldown), beam:dmg, bolt:dmg] vs DMG3', [K('self', ['boost'], 'cooldown'), K('beam', ['damage']), K('bolt', ['damage'])], DMG3, { a: { hold: 9 }, b: { hold: 9 } });
league('A=[beam:weaken(speed), bolt:dmg, blink:shield] vs melee [dash:dmg, cone:dmg+knock, self:shield]', [K('beam', ['weaken'], 'speed'), K('bolt', ['damage']), K('blink', ['shield'])], [K('dash', ['damage']), K('cone', ['damage', 'knock']), K('self', ['shield'])], { a: { hold: 12, prio: ['k1', 'k2', 'k3'] }, b: { hold: 2, prio: ['k1', 'k2', 'k3'] } });

console.log('\n=== E12 kiter vs melee at CD 3 ===');
league('kiter [bolt:dmg, blink:cleanse, self:boost(speed)] vs melee [dash:dmg, cone:dmg+knock, self:shield]', [K('bolt', ['damage']), K('blink', ['cleanse']), K('self', ['boost'], 'speed')], [K('dash', ['damage']), K('cone', ['damage', 'knock']), K('self', ['shield'])], { a: { hold: 12, prio: ['k3', 'k1', 'k2'] }, b: { hold: 2, prio: ['k1', 'k2', 'k3'] } });
league('same, kiter body maxSpeed 8.6 / melee 8.6', [K('bolt', ['damage']), K('blink', ['cleanse']), K('self', ['boost'], 'speed')], [K('dash', ['damage']), K('cone', ['damage', 'knock']), K('self', ['shield'])], { a: { hold: 12, prio: ['k3', 'k1', 'k2'] }, b: { hold: 2, prio: ['k1', 'k2', 'k3'] }, builds: { blue: { maxSpeed: 8.6 }, orange: { maxSpeed: 8.6 } } });
