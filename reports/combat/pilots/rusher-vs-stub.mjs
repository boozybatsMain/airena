/**
 * Measure a kit-agnostic pilot against the kit-stub octopus.
 *
 * Both sides hold the SAME random legal kit, so the only difference is the
 * mind; the pilot plays blue and then orange for every kit and seed. Prints
 * the win rate, faults, per-ability use counts and the mean match length.
 *
 *   node reports/combat/pilots/rusher-vs-stub.mjs [--pilot=brains/pilots/rusher.js]
 *        [--kits=12] [--seeds=4] [--kseed=7] [--debug]
 *
 * Single process, single thread: no worker pool.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compileBrain } from '../../../src/brain/host.js';
import { runMatch } from '../../../src/core/match.js';
import { compileKit } from '../../../src/skills/compile.js';
import { CHANNELS, DELIVERIES, EFFECTS, releasedElements, validateKit } from '../../../src/skills/registry.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const arg = (n, d) => {
  const h = process.argv.find((a) => a.startsWith(`--${n}=`));
  if (h) return h.slice(n.length + 3);
  return process.argv.includes(`--${n}`) ? true : d;
};
const KITS = Number(arg('kits', 12));
const SEEDS = Number(arg('seeds', 4));
const KSEED = Number(arg('kseed', 7));
const PILOT = arg('pilot', 'brains/pilots/rusher.js');
const DEBUG = !!arg('debug', false);
const ONLY = arg('only', null) === null ? null : Number(arg('only', null));
const VERBOSE = !!arg('verbose', false);
const TRACE = Number(arg('trace', 0));

/* Seeded generator for the kits themselves, so a run is reproducible. */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(KSEED);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const DELS = Object.keys(DELIVERIES);
const EFFS = Object.keys(EFFECTS);
const CHS = Object.keys(CHANNELS);
const ELS = Object.values(releasedElements());

function randomSkill() {
  const delivery = pick(DELS);
  const n = rnd() < 0.5 ? 1 : (rnd() < 0.7 ? 2 : 3);
  const effects = [];
  while (effects.length < n) { const e = pick(EFFS); if (!effects.includes(e)) effects.push(e); }
  const s = { delivery, effects };
  if (effects.some((e) => EFFECTS[e].needsChannel)) s.channel = pick(CHS);
  const els = ELS.filter((e) => !e.forms || e.forms.includes(delivery)).map((e) => e.id);
  s.element = els.length ? pick(els) : 'kinetic';
  return s;
}
function randomKit() {
  for (let tries = 0; tries < 20000; tries++) {
    const kit = [randomSkill(), randomSkill(), randomSkill()];
    if (validateKit(kit).length === 0) return kit;
  }
  throw new Error('no legal kit found');
}
const tokens = (kit) => kit.flatMap((s) => [`d:${s.delivery}`, ...s.effects.map((e) => `e:${e}`), ...s.effects.map((e) => `${s.delivery}:${e}`)]);
const label = (s) => `${s.delivery}:${s.effects.join('+')}${s.channel ? `/${s.channel}` : ''}`;

/* Greedy coverage: among many legal random kits, keep the ones that add the
   most delivery kinds / effects not yet seen, so twelve kits touch the whole
   grammar rather than a random corner of it. */
const cands = [];
for (let i = 0; i < 400; i++) cands.push(randomKit());
const kits = [];
const seen = new Set();
while (kits.length < KITS) {
  let best = null, bestGain = -1;
  for (const c of cands) {
    if (kits.includes(c)) continue;
    const gain = tokens(c).filter((k) => !seen.has(k)).length;
    if (gain > bestGain) { bestGain = gain; best = c; }
  }
  kits.push(best);
  for (const k of tokens(best)) seen.add(k);
}

const src = readFileSync(resolve(ROOT, PILOT), 'utf8');
const stubSrc = readFileSync(join(ROOT, 'brains/kit-stub/octopus.js'), 'utf8');
const pilot = { blue: compileBrain(src, 'blue'), orange: compileBrain(src, 'orange') };
const stub = { blue: compileBrain(stubSrc, 'blue'), orange: compileBrain(stubSrc, 'orange') };

let wins = 0, draws = 0, losses = 0, faults = 0, secs = 0, n = 0;
const sideWins = { blue: 0, orange: 0 };
const reasons = {};
const unused = [];
const t0 = Date.now();

for (let i = 0; i < kits.length; i++) {
  const kit = kits[i];
  if (ONLY !== null && i + 1 !== ONLY) continue;
  const c = compileKit(kit);
  if (c.problems.length) { console.log(`kit ${i + 1}: compile problems`, JSON.stringify(c.problems)); continue; }
  const per = {};
  for (const name of c.names) per[name] = { uses: 0, hits: 0, misses: 0 };
  let kw = 0, kd = 0, kf = 0, ks = 0, kn = 0;
  for (let s = 0; s < SEEDS; s++) {
    const seed = 1000 + i * 97 + s * 13;
    for (const side of ['blue', 'orange']) {
      const brains = side === 'blue'
        ? { blue: pilot.blue, orange: stub.orange }
        : { blue: stub.blue, orange: pilot.orange };
      brains.blue.reset(); brains.orange.reset();
      const r = runMatch(brains, { seed, kits: { blue: c.defs, orange: c.defs } }).result;
      const mine = r[side];
      n++; kn++;
      if (r.winner === side) { wins++; kw++; sideWins[side]++; }
      else if (r.winner === 'blue' || r.winner === 'orange') losses++;
      else { draws++; kd++; }
      reasons[r.reason] = (reasons[r.reason] || 0) + 1;
      faults += mine.faults; kf += mine.faults;
      secs += r.seconds; ks += r.seconds;
      for (const name of c.names) {
        per[name].uses += (mine.uses && mine.uses[name]) || 0;
        per[name].hits += (mine.hits && mine.hits[name]) || 0;
        per[name].misses += (mine.misses && mine.misses[name]) || 0;
      }
      if (VERBOSE) {
        const other = side === 'blue' ? 'orange' : 'blue';
        const th = r[other];
        const fmt = (x) => `dealt ${x.damageDealt.toFixed(0)} taken ${x.damageTaken.toFixed(0)} hp ${x.hpFrac} uses ${JSON.stringify(x.uses)} hits ${JSON.stringify(x.hits)} misses ${JSON.stringify(x.misses)} blocked ${JSON.stringify(x.blocked || {})}`;
        console.log(`  seed ${seed} as ${side}: winner ${r.winner} (${r.reason}) ${r.seconds}s`);
        console.log(`    me   ${fmt(mine)}`);
        console.log(`    stub ${fmt(th)}`);
        const why = {};
        for (const e of r.log) if (e.type === 'miss' && e.who === side) why[`${e.skill}:${e.reason}`] = (why[`${e.skill}:${e.reason}`] || 0) + 1;
        const kinds = {};
        for (const e of r.log) if (e.who === side && e.type !== 'say' && e.type !== 'use' && e.type !== 'miss') kinds[e.type] = (kinds[e.type] || 0) + 1;
        console.log(`    my miss reasons ${JSON.stringify(why)}  my other log ${JSON.stringify(kinds)}`);
      }
      if (TRACE > 0 && side === 'blue' && s === 0) {
        for (const e of r.log) {
          if (e.t > TRACE) break;
          if (e.type === 'say') continue;
          const who = e.who === side ? 'ME  ' : 'STUB';
          console.log(`    ${String(e.t).padStart(6)} ${who} ${e.type} ${e.skill || ''} ${e.reason || ''} ${e.amount !== undefined ? e.amount : ''} ${e.effect || ''} ${e.target ? 'on ' + (e.target === side ? 'ME' : 'STUB') : ''}`);
        }
      }
      if (DEBUG && mine.faults) {
        for (const e of r.log) if (e.type === 'fault' && e.who === side) { console.log('  FAULT', JSON.stringify(e)); break; }
      }
    }
  }
  const line = c.names.map((name, j) => `${name}=${label(kit[j])} u${per[name].uses}/h${per[name].hits}/m${per[name].misses}`).join('  ');
  console.log(`kit ${String(i + 1).padStart(2)}: wins ${kw}/${kn} draws ${kd} faults ${kf} mean ${(ks / kn).toFixed(1)}s`);
  console.log(`        ${line}`);
  for (let j = 0; j < c.names.length; j++) if (per[c.names[j]].uses === 0) unused.push(`kit ${i + 1} ${c.names[j]} ${label(kit[j])}`);
}

console.log('');
console.log(`pilot ${PILOT} vs kit-stub over ${kits.length} kits x ${SEEDS} seeds x 2 sides = ${n} matches`);
console.log(`win rate ${(100 * wins / n).toFixed(1)}%  (wins ${wins}, draws ${draws}, losses ${losses}; with half-draws ${(100 * (wins + draws / 2) / n).toFixed(1)}%)`);
console.log(`as blue ${sideWins.blue}/${n / 2}, as orange ${sideWins.orange}/${n / 2}`);
console.log(`faults ${faults}`);
console.log(`mean match seconds ${(secs / n).toFixed(1)}`);
console.log(`end reasons ${JSON.stringify(reasons)}`);
console.log(unused.length ? `NEVER USED: ${unused.join('; ')}` : 'every held ability was used at least once');
console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s wall`);
