#!/usr/bin/env node
/*
 * Measures brains/pilots/controller.js against the kit-agnostic reference
 * (brains/kit-stub/octopus.js): N random legal kits × M seeds, the pilot on
 * BOTH sides in turn, both fighters holding the same kit so only the mind
 * differs. Prints win rate, faults, per-ability use counts, mean seconds.
 *
 *   node reports/combat/pilots/controller-vs-stub.mjs [--kits=12] [--seeds=4] [--kitseed=7] [--pilot=path] [--mixed]
 *
 * --mixed gives the stub its own random kit instead of a mirror.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const arg = (n, d) => { const h = process.argv.find((a) => a.startsWith(`--${n}=`)); if (h) return h.slice(n.length + 3); return process.argv.includes(`--${n}`) ? true : d; };
/* --root=<dir> runs the engine from a copy (a frozen snapshot for A/B work). */
const SRC = resolve(String(arg('root', ROOT)));
const { compileBrain } = await import(`${SRC}/src/brain/host.js`);
const { runMatch } = await import(`${SRC}/src/core/match.js`);
const { compileKit } = await import(`${SRC}/src/skills/compile.js`);
const { validateKit, DELIVERIES, EFFECTS, CHANNELS, releasedElements } = await import(`${SRC}/src/skills/registry.js`);

const KITS = Number(arg('kits', 12));
const SEEDS = Number(arg('seeds', 4));
const KITSEED = Number(arg('kitseed', 7));
const MIXED = !!arg('mixed', false);
const PILOT = resolve(ROOT, String(arg('pilot', 'brains/pilots/controller.js')));
const STUB = resolve(ROOT, 'brains/kit-stub/octopus.js');

function mulberry32(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rng = mulberry32(KITSEED);
const pick = (arr) => arr[Math.floor(rng() * arr.length)];

const DELS = Object.keys(DELIVERIES), EFFS = Object.keys(EFFECTS), CHS = Object.keys(CHANNELS);
const ELS = releasedElements();
function randomSkill() {
  const delivery = pick(DELS);
  const n = 1 + Math.floor(rng() * 3);
  const effects = [];
  while (effects.length < n) { const e = pick(EFFS); if (!effects.includes(e)) effects.push(e); }
  const needsChannel = effects.some((e) => EFFECTS[e].needsChannel);
  const okEl = Object.keys(ELS).filter((id) => !ELS[id].forms || ELS[id].forms.includes(delivery));
  return { delivery, effects, element: pick(okEl), ...(needsChannel ? { channel: pick(CHS) } : {}) };
}
function randomKit() {
  for (let tries = 0; tries < 100000; tries++) {
    const kit = [randomSkill(), randomSkill(), randomSkill()];
    if (validateKit(kit).length === 0) return kit;
  }
  throw new Error('no legal kit found');
}
const label = (s) => `${s.delivery}:${s.effects.join('+')}${s.channel ? '/' + s.channel : ''}`;

const kits = [];
while (kits.length < KITS) kits.push(randomKit());
const stubKits = MIXED ? kits.map(() => randomKit()) : kits;

const pilotSrc = readFileSync(PILOT, 'utf8');
const stubSrc = readFileSync(STUB, 'utf8');
const brains = {
  pilotBlue: compileBrain(pilotSrc, 'pilot'), pilotOrange: compileBrain(pilotSrc, 'pilot'),
  stubBlue: compileBrain(stubSrc, 'stub'), stubOrange: compileBrain(stubSrc, 'stub'),
};

let wins = 0, losses = 0, draws = 0, faults = 0, stubFaults = 0, secs = 0, n = 0;
const perKit = [];
const useByShape = {};
const deadSlots = [];
const missWhy = {};
for (let ki = 0; ki < kits.length; ki++) {
  const kit = kits[ki];
  const defs = compileKit(kit).defs;
  const sdefs = compileKit(stubKits[ki]).defs;
  const row = { kit: kit.map(label), wins: 0, losses: 0, draws: 0, uses: [0, 0, 0], hits: [0, 0, 0], misses: [0, 0, 0], stubUses: [0, 0, 0], stubHits: [0, 0, 0], stubMisses: [0, 0, 0], faults: 0, secs: 0, dealt: 0, taken: 0 };
  for (let si = 0; si < SEEDS; si++) {
    const seed = 100 + ki * 31 + si * 7;
    for (const side of ['blue', 'orange']) {
      const other = side === 'blue' ? 'orange' : 'blue';
      const b = side === 'blue' ? brains.pilotBlue : brains.pilotOrange;
      const s = side === 'blue' ? brains.stubOrange : brains.stubBlue;
      b.reset(); s.reset();
      const r = runMatch({ [side]: b, [other]: s }, { seed, kits: { [side]: defs, [other]: sdefs } }).result;
      const mine = r[side], theirs = r[other];
      n++; secs += r.seconds; row.secs += r.seconds;
      faults += mine.faults; row.faults += mine.faults; stubFaults += theirs.faults;
      if (r.winner === side) { wins++; row.wins++; } else if (r.winner === other) { losses++; row.losses++; } else { draws++; row.draws++; }
      ['k1', 'k2', 'k3'].forEach((k, i) => {
        row.uses[i] += mine.uses[k] || 0; row.hits[i] += mine.hits[k] || 0; row.misses[i] += mine.misses[k] || 0;
        row.stubUses[i] += theirs.uses[k] || 0; row.stubHits[i] += theirs.hits[k] || 0; row.stubMisses[i] += theirs.misses[k] || 0;
      });
      for (const e of r.log) {
        if (e.type !== 'miss' || e.who !== side) continue;
        const key = `${label(kit[Number(e.skill[1]) - 1])} ${e.reason}`;
        missWhy[key] = (missWhy[key] || 0) + 1;
      }
      row.dealt += mine.damageDealt; row.taken += mine.damageTaken;
    }
  }
  kit.forEach((s, i) => {
    const key = label(s);
    const u = useByShape[key] || (useByShape[key] = { uses: 0, hits: 0, misses: 0, matches: 0 });
    u.uses += row.uses[i]; u.hits += row.hits[i]; u.misses += row.misses[i]; u.matches += SEEDS * 2;
    if (row.uses[i] === 0) deadSlots.push(`kit ${ki} slot k${i + 1} ${key}`);
  });
  perKit.push(row);
  console.log(`kit ${String(ki).padStart(2)}  ${row.kit.join(' | ').padEnd(96)} W${row.wins} L${row.losses} D${row.draws}  uses ${row.uses.join('/')} hits ${row.hits.join('/')} miss ${row.misses.join('/')}  stub uses ${row.stubUses.join('/')} hits ${row.stubHits.join('/')} miss ${row.stubMisses.join('/')}  dmg ${row.dealt.toFixed(0)}/${row.taken.toFixed(0)}  faults ${row.faults}  ${(row.secs / (SEEDS * 2)).toFixed(1)}s`);
}
if (arg('why', false)) {
  console.log('\nmiss reasons (pilot):');
  for (const [k, c] of Object.entries(missWhy).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(56)} ${c}`);
}

console.log('');
console.log(`matches ${n}  wins ${wins}  losses ${losses}  draws ${draws}  win rate ${(100 * wins / n).toFixed(1)}%  (wins+draws/2: ${(100 * (wins + draws / 2) / n).toFixed(1)}%)`);
console.log(`pilot faults ${faults}  stub faults ${stubFaults}  mean seconds ${(secs / n).toFixed(1)}`);
console.log(`dead slots (never used across ${SEEDS * 2} matches): ${deadSlots.length ? '\n  ' + deadSlots.join('\n  ') : 'none'}`);
console.log('');
console.log('per-ability use (shape: uses / hits / misses over matches held):');
for (const [k, u] of Object.entries(useByShape).sort((a, b) => b[1].uses - a[1].uses)) {
  console.log(`  ${k.padEnd(44)} ${String(u.uses).padStart(4)} / ${String(u.hits).padStart(4)} / ${String(u.misses).padStart(4)}   in ${u.matches} matches`);
}
