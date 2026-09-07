/**
 * Scratch diagnostic: one kit index from the bench's kit stream, per-game
 * detail (winner, seconds, damage, uses/misses per side) and the pilot's
 * say-lines for the first game.
 *
 *   node reports/combat/pilots/kiter-diag.mjs <kitIndex> [seeds=4] [rngSeed=7]
 */
import fs from 'node:fs';
import path from 'node:path';
import { compileBrain } from '../../../src/brain/host.js';
import { runMatch } from '../../../src/core/match.js';
import { compileKit } from '../../../src/skills/compile.js';
import {
  CHANNELS, DELIVERIES, EFFECTS, releasedElements, validateKit, validateSkill,
} from '../../../src/skills/registry.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
const KI = Number(process.argv[2] || 0);
const NSEEDS = Number(process.argv[3] || 4);
const RNG_SEED = Number(process.argv[4] || 7);

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function randomKit(rnd) {
  const dl = Object.keys(DELIVERIES), ef = Object.keys(EFFECTS), ch = Object.keys(CHANNELS);
  const el = Object.keys(releasedElements());
  for (let tries = 0; tries < 400; tries++) {
    const kit = [];
    for (let i = 0; i < 3; i++) {
      for (let t = 0; t < 60; t++) {
        const n = 1 + Math.floor(rnd() * 3);
        const eff = [];
        while (eff.length < n) { const e = ef[Math.floor(rnd() * ef.length)]; if (!eff.includes(e)) eff.push(e); }
        const needs = eff.some((e) => EFFECTS[e].needsChannel);
        const s = { delivery: dl[Math.floor(rnd() * dl.length)], effects: eff, element: el[Math.floor(rnd() * el.length)],
          ...(needs ? { channel: ch[Math.floor(rnd() * ch.length)] } : {}) };
        if (!validateSkill(s).length) { kit.push(s); break; }
      }
    }
    if (kit.length === 3 && !validateKit(kit).length) return kit;
  }
  return null;
}
const desc = (s) => `${s.delivery}:${s.effects.join('+')}${s.channel ? `(${s.channel})` : ''}`;

const rnd = mulberry32(RNG_SEED);
const kits = [];
while (kits.length <= KI) { const k = randomKit(rnd); if (k) kits.push(k); }
const kit = kits[KI];
console.log(`kit ${KI}: ${kit.map(desc).join(' | ')}`);
const defs = compileKit(kit).defs;
for (const n of Object.keys(defs)) console.log(`  ${n} cd ${defs[n].cooldown} windup ${defs[n].windup} dmg ${defs[n].damage ?? '-'}`);

const srcA = fs.readFileSync(process.env.PILOT || path.join(ROOT, 'brains/pilots/kiter.js'), 'utf8');
const srcB = fs.readFileSync(path.join(ROOT, 'brains/kit-stub/octopus.js'), 'utf8');
const pilot = { blue: compileBrain(srcA, 'blue'), orange: compileBrain(srcA, 'orange') };
const stub = { blue: compileBrain(srcB, 'blue'), orange: compileBrain(srcB, 'orange') };

let first = true;
for (let s = 0; s < NSEEDS; s++) {
  for (const mine of ['blue', 'orange']) {
    const other = mine === 'blue' ? 'orange' : 'blue';
    pilot[mine].reset(); stub[other].reset();
    const r = runMatch({ [mine]: pilot[mine], [other]: stub[other] }, { seed: 100 + KI * 10 + s, kits: { blue: defs, orange: defs } }).result;
    const f = (x) => `dealt ${x.damageDealt.toFixed(0).padStart(4)} taken ${x.damageTaken.toFixed(0).padStart(4)} uses ${JSON.stringify(x.uses)} miss ${JSON.stringify(x.misses)} faults ${x.faults}`;
    console.log(`seed ${100 + KI * 10 + s} pilot=${mine} winner=${r.winner} ${r.reason} ${r.seconds}s\n   pilot ${f(r[mine])}\n   stub  ${f(r[other])}`);
    if (first) {
      first = false;
      const says = r.log.filter((l) => l.type === 'say' && l.who === mine).map((l) => `${l.t}:${l.text}`);
      console.log('   pilot says: ' + says.join(' | '));
      const evs = r.log.filter((l) => (l.type === 'use' || l.type === 'miss') && l.who === mine).slice(0, 40).map((l) => `${l.t}:${l.type}:${l.skill}${l.reason ? '/' + l.reason : ''}`);
      console.log('   pilot acts: ' + evs.join(' '));
    }
  }
}
