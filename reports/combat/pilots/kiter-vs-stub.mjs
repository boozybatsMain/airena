/**
 * Scratch bench: brains/pilots/kiter.js against brains/kit-stub/octopus.js.
 *
 * 12 random legal kits (validateKit), 4 seeds each, mirror kits (both sides
 * hold the same set so the only difference is the mind), the pilot on BOTH
 * sides. Prints: win rate, faults, per-ability use counts, mean seconds.
 *
 *   node reports/combat/pilots/kiter-vs-stub.mjs [kits=12] [seeds=4] [rngSeed=7]
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
const NKITS = Number(process.argv[2] || 12);
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

const srcA = fs.readFileSync(path.join(ROOT, 'brains/pilots/kiter.js'), 'utf8');
const srcB = fs.readFileSync(path.join(ROOT, 'brains/kit-stub/octopus.js'), 'utf8');
const pilot = { blue: compileBrain(srcA, 'blue'), orange: compileBrain(srcA, 'orange') };
const stub = { blue: compileBrain(srcB, 'blue'), orange: compileBrain(srcB, 'orange') };

const rnd = mulberry32(RNG_SEED);
const kits = [];
while (kits.length < NKITS) { const k = randomKit(rnd); if (k) kits.push(k); }

let wins = 0, draws = 0, games = 0, faults = 0, secs = 0, stubFaults = 0;
const perKit = [];
const byDelivery = {}; // delivery -> { held, used, uses, hits, misses }
for (let ki = 0; ki < kits.length; ki++) {
  const kit = kits[ki];
  const c = compileKit(kit);
  if (c.problems.length) { console.log('kit rejected at compile', JSON.stringify(c.problems)); continue; }
  const defs = c.defs;
  const uses = { k1: 0, k2: 0, k3: 0 }, hits = { k1: 0, k2: 0, k3: 0 }, misses = { k1: 0, k2: 0, k3: 0 };
  let kw = 0, kg = 0, kf = 0;
  for (let s = 0; s < NSEEDS; s++) {
    for (const mine of ['blue', 'orange']) {
      const other = mine === 'blue' ? 'orange' : 'blue';
      pilot[mine].reset(); stub[other].reset();
      const brains = { [mine]: pilot[mine], [other]: stub[other] };
      const r = runMatch(brains, { seed: 100 + ki * 10 + s, kits: { blue: defs, orange: defs } }).result;
      games++; kg++;
      if (process.env.DEBUG_KIT === String(ki)) console.log(`  dbg kit ${ki} seed ${100 + ki * 10 + s} pilot=${mine} winner=${r.winner} ${r.seconds}s dealt ${r[mine].damageDealt.toFixed(1)} taken ${r[mine].damageTaken.toFixed(1)} uses ${JSON.stringify(r[mine].uses)}`);
      if (r.winner === mine) { wins++; kw++; } else if (r.winner === null) { draws++; wins += 0.5; kw += 0.5; }
      faults += r[mine].faults; kf += r[mine].faults; stubFaults += r[other].faults;
      secs += r.seconds;
      for (const n of Object.keys(uses)) {
        uses[n] += r[mine].uses[n] || 0; hits[n] += r[mine].hits[n] || 0; misses[n] += r[mine].misses[n] || 0;
      }
    }
  }
  const row = { ki, kw, kg, kf, uses, hits, misses, kit };
  perKit.push(row);
  kit.forEach((s, i) => {
    const n = `k${i + 1}`;
    const b = byDelivery[s.delivery] || (byDelivery[s.delivery] = { held: 0, used: 0, uses: 0, hits: 0, misses: 0 });
    b.held++; if (uses[n] > 0) b.used++; b.uses += uses[n]; b.hits += hits[n]; b.misses += misses[n];
  });
}

console.log(`\nKITER vs kit-stub — ${kits.length} kits × ${NSEEDS} seeds × both sides = ${games} games`);
console.log(`win rate ${(100 * wins / games).toFixed(1)}%  (draws ${draws})  faults ${faults}  stub faults ${stubFaults}  mean ${(secs / games).toFixed(1)} s\n`);
console.log('kit  win   flt  ability                                   uses hits miss');
const never = [];
for (const row of perKit) {
  row.kit.forEach((s, i) => {
    const n = `k${i + 1}`;
    const head = i === 0 ? `${String(row.ki).padStart(2)}  ${(100 * row.kw / row.kg).toFixed(0).padStart(4)}%  ${String(row.kf).padStart(3)}` : '               ';
    console.log(`${head}  ${n} ${desc(s).padEnd(40)} ${String(row.uses[n]).padStart(4)} ${String(row.hits[n]).padStart(4)} ${String(row.misses[n]).padStart(4)}`);
    if (row.uses[n] === 0) never.push(`kit ${row.ki} ${n} ${desc(s)}`);
  });
}
console.log('\nby delivery: held / used-at-least-once / total uses / hits / misses');
for (const [d, b] of Object.entries(byDelivery)) console.log(`  ${d.padEnd(6)} ${b.held}  ${b.used}  ${b.uses}  ${b.hits}  ${b.misses}`);
console.log(`\nnever used: ${never.length ? never.join('; ') : 'none'}`);
