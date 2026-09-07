// Scratch: print the fault log entries for one kit from the bench's kit stream.
import fs from 'node:fs';
import path from 'node:path';
import { compileBrain } from '../../../src/brain/host.js';
import { runMatch } from '../../../src/core/match.js';
import { compileKit } from '../../../src/skills/compile.js';
import { CHANNELS, DELIVERIES, EFFECTS, releasedElements, validateKit, validateSkill } from '../../../src/skills/registry.js';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
const KI = Number(process.argv[2] || 1), RNG_SEED = Number(process.argv[3] || 11);
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function randomKit(rnd) {
  const dl = Object.keys(DELIVERIES), ef = Object.keys(EFFECTS), ch = Object.keys(CHANNELS); const el = Object.keys(releasedElements());
  for (let tries = 0; tries < 400; tries++) {
    const kit = [];
    for (let i = 0; i < 3; i++) for (let t = 0; t < 60; t++) {
      const n = 1 + Math.floor(rnd() * 3); const eff = [];
      while (eff.length < n) { const e = ef[Math.floor(rnd() * ef.length)]; if (!eff.includes(e)) eff.push(e); }
      const needs = eff.some((e) => EFFECTS[e].needsChannel);
      const s = { delivery: dl[Math.floor(rnd() * dl.length)], effects: eff, element: el[Math.floor(rnd() * el.length)], ...(needs ? { channel: ch[Math.floor(rnd() * ch.length)] } : {}) };
      if (!validateSkill(s).length) { kit.push(s); break; }
    }
    if (kit.length === 3 && !validateKit(kit).length) return kit;
  }
  return null;
}
const rnd = mulberry32(RNG_SEED); const kits = [];
while (kits.length <= KI) { const k = randomKit(rnd); if (k) kits.push(k); }
const kit = kits[KI];
console.log(`kit ${KI}: ${kit.map((s) => `${s.delivery}:${s.effects.join('+')}`).join(' | ')}`);
const defs = compileKit(kit).defs;
const srcA = fs.readFileSync(path.join(ROOT, 'brains/pilots/kiter.js'), 'utf8');
const srcB = fs.readFileSync(path.join(ROOT, 'brains/kit-stub/octopus.js'), 'utf8');
for (let s = 0; s < 4; s++) for (const mine of ['blue', 'orange']) {
  const other = mine === 'blue' ? 'orange' : 'blue';
  const brains = { [mine]: compileBrain(srcA, mine), [other]: compileBrain(srcB, other) };
  const r = runMatch(brains, { seed: 100 + KI * 10 + s, kits: { blue: defs, orange: defs } }).result;
  const f = r.log.filter((l) => l.who === mine && /fault/i.test(JSON.stringify(l)));
  console.log(`seed ${100 + KI * 10 + s} pilot=${mine} faults=${r[mine].faults} ${f.slice(0, 2).map((l) => JSON.stringify(l)).join(' ')}`);
}
