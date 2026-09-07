/**
 * Pick a five for the counter-panel `GAUNTLET` (src/skills/gauntlet.js) on the
 * PRODUCT field — blue (octopus stub) against orange (gorilla stub), the
 * registry's own cooldowns — i.e. `real: true` jobs on the pool, exactly what
 * `tools/gauntletfield.mjs` and `tools/checkgauntlet.mjs` play.
 *
 *   node reports/combat/gauntlet/pick.mjs [--seeds=8] [--verify=20] [--top=16]
 *                                         [--finalists=12] [--chunk=1000] [--dry]
 *
 * Method
 *   1. A candidate pool: the top-N kits of `reports/combat/atombalance-panel-v5.json`
 *      (the four-pilot league of 07.09), sixteen hand-designed archetypes and
 *      the 30.08 five (frozen here as literals, so the command reproduces
 *      itself after the panel is replaced). Every kit must be legal
 *      (`validateKit`), compile, and carry at least one damage/burn source.
 *   2. Every unordered pair of candidates is played MIRRORED over `--seeds`
 *      seeds (seed = 900 + s·7919, the same ladder as viability/gate/field),
 *      plus every candidate against the three starter presets. Results are
 *      cached per (blue kit, orange kit, seed) in `pairs.json`, so a restart
 *      after a worker crash costs nothing and any resolution (8, 12, 20 seeds)
 *      is read from the same cache. Jobs run in chunks of `--chunk` — one
 *      pool run at a time, never more than a thousand matches in it.
 *   3. Every 5-subset of the pool is scored OFFLINE from the cache:
 *        hard: ≥ 4 styles (`isDiverse`), ≥ 1 three-cycle, no member with a
 *              worst result under 15 %, spread of worsts ≥ 20 pp (the gate's
 *              "field distinguishes"), field ceiling ≤ 80 % and the presets'
 *              worsts ≤ 75 % on the viability grid — so a BASELINE.bestMin
 *              exists that is above the field, not under a preset, and under
 *              87.5 % (the grid's "reachable without a clean sweep" bound).
 *        soft: decisive cells (far from 50 %), more cycles, five styles, a
 *              higher floor, more headroom under 87.5 %, two damage sources,
 *              different delivery shapes.
 *   4. The best `--finalists` fives (at most two per family of four shared
 *      members) are extended to `--verify` seeds and must hold every hard
 *      criterion at 8, 12 (gate) and 20 (baseline) seeds.
 *   5. The winner's ORDER is chosen among the 120 permutations: `isDiverse`
 *      merges styles greedily in gauntlet order, so the order is part of the
 *      instrument and is picked to keep the most styles at both resolutions.
 *
 * Output: the winner's tables at 12 and 20 seeds, the presets' viability-style
 * rates against it (8 fights, alternating sides — what `viability()` plays),
 * a suggested BASELINE, `result.json`.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { closePool, runJobs, superviseSelf } from '../../../tools/matchpool.mjs';
import { isDiverse } from '../../../src/skills/gauntlet.js';
import { damagingCount, describe, validateKit } from '../../../src/skills/registry.js';
import { compileKit } from '../../../src/skills/compile.js';
import { KIT_PRESETS } from '../../../src/server/forge/pipeline.js';

const DRY = process.argv.includes('--dry');
if (!DRY) superviseSelf('AIRENA_GPICK_CHILD');

const arg = (n, d) => {
  const h = process.argv.find((a) => a.startsWith(`--${n}=`));
  return h ? Number(h.split('=')[1]) : d;
};
const SEEDS = arg('seeds', 8);
const VERIFY = arg('verify', 20);
const TOP = arg('top', 16);
const FINALISTS = arg('finalists', 12);
const CHUNK = Math.min(1000, arg('chunk', 1000));
const str = (n, d) => {
  const h = process.argv.find((a) => a.startsWith(`--${n}=`));
  return h ? h.split('=').slice(1).join('=') : d;
};
/** Cache / result suffix — see the note above `CACHE`. */
const TAG = str('tag', '');
/** Which pricing pass seeds the pool's top kits. */
const PANEL = str('panel', 'atombalance-panel-v5.json');
const VIAB_FIGHTS = 8; /* VIABILITY_ROUNDS / 5 — what `viability()` plays per opponent */

const HERE = dirname(fileURLToPath(import.meta.url));
const seedAt = (s) => 900 + s * 7919;
const sigOf = (kit) => kit.map((s) => `${s.delivery}:${s.effects.join('+')}${s.channel ? `/${s.channel}` : ''}`).join(' | ');

/* ── candidate pool ──────────────────────────────────────────────────────── */

const HAND = [
  { id: 'lancer', why: 'beam kiter: beam and bolt damage, blink with a shield',
    kit: [{ delivery: 'beam', effects: ['damage'], element: 'arc' }, { delivery: 'bolt', effects: ['damage'], element: 'arc' }, { delivery: 'blink', effects: ['shield'], element: 'frost' }] },
  { id: 'searer', why: 'beam kiter: damage+burn beam, silencing bolt, cleansing blink',
    kit: [{ delivery: 'beam', effects: ['damage', 'burn'], element: 'ember' }, { delivery: 'bolt', effects: ['silence'], element: 'void' }, { delivery: 'blink', effects: ['cleanse'], element: 'ember' }] },
  { id: 'sniper', why: 'beam kiter: damage bolt, damage+slowing beam, shield+cleanse aura',
    kit: [{ delivery: 'bolt', effects: ['damage'], element: 'frost' }, { delivery: 'beam', effects: ['damage', 'weaken'], channel: 'speed', element: 'frost' }, { delivery: 'self', effects: ['shield', 'cleanse'], element: 'frost' }] },
  { id: 'brawler', why: 'fan/lunge brawler: damage+burn fan, damage lunge, shield aura',
    kit: [{ delivery: 'cone', effects: ['damage', 'burn'], element: 'kinetic' }, { delivery: 'dash', effects: ['damage'], element: 'kinetic' }, { delivery: 'self', effects: ['shield'], element: 'frost' }] },
  { id: 'mauler', why: 'fan/lunge brawler: rooting fan, burning lunge, shield+heal aura',
    kit: [{ delivery: 'cone', effects: ['damage', 'root'], element: 'kinetic' }, { delivery: 'dash', effects: ['damage', 'burn'], element: 'ember' }, { delivery: 'self', effects: ['shield', 'heal'], element: 'frost' }] },
  { id: 'duelist', why: 'fan/lunge brawler: damage fan, damage bolt to close with, shield+heal blink',
    kit: [{ delivery: 'cone', effects: ['damage'], element: 'kinetic' }, { delivery: 'bolt', effects: ['damage'], element: 'kinetic' }, { delivery: 'blink', effects: ['shield', 'heal'], element: 'void' }] },
  { id: 'bombardier', why: 'mortar/field zoner: damage mortar, damage+burn field, burn+pull mortar',
    kit: [{ delivery: 'lob', effects: ['damage'], element: 'void' }, { delivery: 'zone', effects: ['damage', 'burn'], element: 'ember' }, { delivery: 'lob', effects: ['burn', 'pull'], element: 'void' }] },
  { id: 'zoner', why: 'mortar/field zoner: damage field, damage+knock mortar, burn+wall field',
    kit: [{ delivery: 'zone', effects: ['damage'], element: 'arc' }, { delivery: 'lob', effects: ['damage', 'knock'], element: 'kinetic' }, { delivery: 'zone', effects: ['burn', 'wall'], element: 'ember' }] },
  { id: 'stormcaller', why: 'mortar/field zoner: damage+burn field, stunning mortar, healing blink',
    kit: [{ delivery: 'zone', effects: ['damage', 'burn'], element: 'ember' }, { delivery: 'lob', effects: ['damage', 'stun'], element: 'arc' }, { delivery: 'blink', effects: ['heal'], element: 'arc' }] },
  { id: 'warden', why: 'sustain warden: shield+heal aura, damage beam, damage+heal bolt',
    kit: [{ delivery: 'self', effects: ['shield', 'heal'], element: 'frost' }, { delivery: 'beam', effects: ['damage'], element: 'frost' }, { delivery: 'bolt', effects: ['damage', 'heal'], element: 'frost' }] },
  { id: 'medic', why: 'sustain warden: heal+shield blink, damage field, damage bolt',
    kit: [{ delivery: 'blink', effects: ['heal', 'shield'], element: 'void' }, { delivery: 'zone', effects: ['damage'], element: 'arc' }, { delivery: 'bolt', effects: ['damage'], element: 'arc' }] },
  { id: 'controller', why: 'controller: stun bolt, silence beam, one damage field',
    kit: [{ delivery: 'bolt', effects: ['stun'], element: 'arc' }, { delivery: 'beam', effects: ['silence'], element: 'void' }, { delivery: 'zone', effects: ['damage'], element: 'arc' }] },
  { id: 'jailer', why: 'controller: silence+damage fan, damage+blind bolt, root+damage lunge',
    kit: [{ delivery: 'cone', effects: ['silence', 'damage'], element: 'void' }, { delivery: 'bolt', effects: ['damage', 'blind'], element: 'void' }, { delivery: 'dash', effects: ['root', 'damage'], element: 'kinetic' }] },
  { id: 'silencer', why: 'controller: silence+damage beam, stunning bolt with damage, heal aura',
    kit: [{ delivery: 'beam', effects: ['silence', 'damage'], element: 'void' }, { delivery: 'bolt', effects: ['stun', 'damage'], element: 'arc' }, { delivery: 'self', effects: ['heal'], element: 'void' }] },
  { id: 'pyro', why: 'burn specialist: burn beam, burn+knock field, burn+pull mortar',
    kit: [{ delivery: 'beam', effects: ['burn'], element: 'ember' }, { delivery: 'zone', effects: ['burn', 'knock'], element: 'ember' }, { delivery: 'lob', effects: ['burn', 'pull'], element: 'ember' }] },
  { id: 'arsonist', why: 'burn specialist: burn beam, damage+burn lunge, burn+knock field',
    kit: [{ delivery: 'beam', effects: ['burn'], element: 'ember' }, { delivery: 'dash', effects: ['damage', 'burn'], element: 'ember' }, { delivery: 'zone', effects: ['burn', 'knock'], element: 'ember' }] },
  { id: 'vaulter', why: 'leaper: shield leap, damage fan, damage bolt',
    kit: [{ delivery: 'jump', effects: ['shield'], element: 'kinetic' }, { delivery: 'cone', effects: ['damage'], element: 'kinetic' }, { delivery: 'bolt', effects: ['damage'], element: 'kinetic' }] },
];

/* The 30.08 five, frozen as literals: the command must reproduce itself
   after `GAUNTLET` is replaced (the lesson recorded in tools/gauntletpick.mjs). */
const OLD = [
  { id: 'old-striker', kit: [{ delivery: 'beam', effects: ['cleanse', 'silence'], element: 'ember' }, { delivery: 'blink', effects: ['shield'], element: 'ember' }, { delivery: 'lob', effects: ['damage'], element: 'ember' }] },
  { id: 'old-warden', kit: [{ delivery: 'beam', effects: ['heal', 'wall'], element: 'frost' }, { delivery: 'blink', effects: ['wall'], element: 'ember' }, { delivery: 'bolt', effects: ['cleanse', 'pull', 'damage'], element: 'void' }] },
  { id: 'old-conjurer', kit: [{ delivery: 'zone', effects: ['boost'], channel: 'range', element: 'kinetic' }, { delivery: 'blink', effects: ['boost'], channel: 'vision', element: 'void' }, { delivery: 'zone', effects: ['heal', 'damage'], element: 'arc' }] },
  { id: 'old-runner', kit: [{ delivery: 'dash', effects: ['burn', 'weaken'], channel: 'range', element: 'arc' }, { delivery: 'zone', effects: ['boost'], channel: 'cooldown', element: 'arc' }, { delivery: 'dash', effects: ['boost'], channel: 'range', element: 'void' }] },
  { id: 'old-lobber', kit: [{ delivery: 'lob', effects: ['blind', 'wall'], element: 'arc' }, { delivery: 'lob', effects: ['wall'], element: 'ember' }, { delivery: 'lob', effects: ['damage'], element: 'void' }] },
];

/*
 * THE LADDER'S OWN TOP KITS AND THE BALANCE REVIEW'S ARCHETYPES.
 *
 * The pool used to be "the panel's best random kits plus hand-made
 * archetypes", and the balance review r1 §6 named the consequence: a five
 * drawn from random legal kits is a LADDER, because a random kit's strength
 * is mostly how much damage it happens to carry. The kits people actually
 * play — `data/airena.db`'s top-rated four (review r1 §4) — and the six
 * extreme shapes the review duelled (§3) are the ones a counter-panel has to
 * be able to separate, so they are candidates too.
 */
const LADDER = [
  { id: 'lad-ash', why: 'ladder #1 ASH (kit-stub): beam and bolt damage, a burning mortar',
    kit: [{ delivery: 'beam', effects: ['damage'], element: 'kinetic' }, { delivery: 'bolt', effects: ['damage'], element: 'kinetic' }, { delivery: 'lob', effects: ['burn'], element: 'ember' }] },
  { id: 'lad-cutter', why: 'ladder #2 MONOCYCLE CUTTER: beam damage, lunge damage, a knocking fan',
    kit: [{ delivery: 'beam', effects: ['damage'], element: 'kinetic' }, { delivery: 'dash', effects: ['damage'], element: 'kinetic' }, { delivery: 'cone', effects: ['damage', 'knock'], element: 'kinetic' }] },
  { id: 'lad-golem', why: 'ladder #3 STONE GOLEM: knocking fan, lunge damage, a stunning lunge',
    kit: [{ delivery: 'cone', effects: ['damage', 'knock'], element: 'kinetic' }, { delivery: 'dash', effects: ['damage'], element: 'kinetic' }, { delivery: 'dash', effects: ['damage', 'stun'], element: 'kinetic' }] },
  { id: 'lad-storm', why: 'ladder #4 STORM (kit-stub): three bare damage deliveries',
    kit: [{ delivery: 'beam', effects: ['damage'], element: 'kinetic' }, { delivery: 'bolt', effects: ['damage'], element: 'kinetic' }, { delivery: 'lob', effects: ['damage'], element: 'kinetic' }] },
  { id: 'rev-harmmax', why: 'review §3 A: harm-max — two burning attacks and a mortar',
    kit: [{ delivery: 'bolt', effects: ['damage', 'burn'], element: 'ember' }, { delivery: 'beam', effects: ['damage', 'burn'], element: 'ember' }, { delivery: 'lob', effects: ['damage'], element: 'ember' }] },
  { id: 'rev-sustain', why: 'review §3 C: sustain-burn — aura and leap of heal+shield, a burning bolt',
    kit: [{ delivery: 'self', effects: ['heal', 'shield'], element: 'frost' }, { delivery: 'jump', effects: ['shield', 'heal'], element: 'frost' }, { delivery: 'bolt', effects: ['burn'], element: 'ember' }] },
  { id: 'rev-control', why: 'review §3 E: control-heavy — a stunning rooting silencing fan, a blinding mortar, a damage bolt',
    kit: [{ delivery: 'cone', effects: ['stun', 'root', 'silence'], element: 'void' }, { delivery: 'lob', effects: ['blind', 'knock'], element: 'void' }, { delivery: 'bolt', effects: ['damage'], element: 'kinetic' }] },
  { id: 'rev-ctrldmg', why: 'review §3 F: control+damage — a control riding every attack',
    kit: [{ delivery: 'bolt', effects: ['damage', 'stun'], element: 'arc' }, { delivery: 'zone', effects: ['damage', 'root'], element: 'arc' }, { delivery: 'lob', effects: ['damage', 'blind'], element: 'void' }] },
];

const legal = (kit) => !validateKit(kit).length && !compileKit(kit).problems.length && damagingCount(kit) >= 1;

const presets = Object.entries(KIT_PRESETS).map(([name, p]) => ({ id: `preset:${name}`, kit: p.kit, sig: sigOf(p.kit) }));
const presetSigs = new Set(presets.map((p) => p.sig));

const pool = [];
const seen = new Set(presetSigs);
const add = (id, kit, src, why = '') => {
  const sig = sigOf(kit);
  if (seen.has(sig)) return false;
  if (!legal(kit)) { console.log(`  skipped ${id}: ${JSON.stringify(validateKit(kit).map((b) => b.code))}`); return false; }
  seen.add(sig);
  pool.push({ id, kit, sig, src, why, dmg: damagingCount(kit) });
  return true;
};
const panel = JSON.parse(readFileSync(join(HERE, '..', PANEL), 'utf8'));
const ranked = panel.kits.slice().sort((a, b) => b.score - a.score);
let taken = 0;
for (const k of ranked) {
  if (taken >= TOP) break;
  if (add(`p${k.id}`, k.kit, `panel #${k.id} ${(k.score * 100).toFixed(0)}%`)) taken++;
}
for (const h of HAND) add(h.id, h.kit, 'hand', h.why);
for (const l of LADDER) add(l.id, l.kit, 'ladder / review r1', l.why);
for (const o of OLD) add(o.id, o.kit, 'old five (30.08)');

console.log(`\n  pool: ${pool.length} candidates (${taken} from ${PANEL}, ${HAND.length} hand-designed, ${LADDER.length} ladder/review, ${OLD.length} old), ${presets.length} preset probes`);
for (const c of pool) console.log(`    ${c.id.padEnd(13)} dmg ${c.dmg}  ${c.sig}`);
if (DRY) process.exit(0);

/* ── the pair cache ──────────────────────────────────────────────────────── */

/*
 * THE CACHE IS KEYED BY KIT SIGNATURE AND SEED, AND A PRICE PASS INVALIDATES IT.
 *
 * `pairs.json` holds results measured on the magnitudes of the day it was
 * written. After a magnitude change the same signature is a different fight,
 * so a search that reads the old cache re-picks the five of the old world.
 * `--tag=NAME` moves the cache, the result file and nothing else, so each
 * round of pricing has its own record and the previous one is never
 * overwritten. Default tag: the 07.09 files this script first wrote.
 */
const CACHE = join(HERE, TAG === '' ? 'pairs.json' : `pairs-${TAG}.json`);
const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {};
const key = (blueSig, orangeSig, seed) => `${blueSig}||${orangeSig}||${seed}`;

/** Play every missing (blue, orange, seed) of the given pairs, mirrored, over `S` seeds. */
async function ensure(pairs, S, label) {
  const jobs = []; const keys = [];
  for (const [A, B] of pairs) {
    for (let s = 0; s < S; s++) {
      for (const [x, y] of [[A, B], [B, A]]) {
        const k = key(x.sig, y.sig, seedAt(s));
        if (k in cache) continue;
        jobs.push({ a: x.kit, b: y.kit, seed: seedAt(s), sym: false, real: true });
        keys.push(k);
      }
    }
  }
  if (!jobs.length) { console.log(`  ${label}: cached`); return; }
  console.log(`  ${label}: ${jobs.length} matches to play, ${Math.ceil(jobs.length / CHUNK)} runs of ≤ ${CHUNK}`);
  const t0 = Date.now();
  for (let o = 0; o < jobs.length; o += CHUNK) {
    const part = jobs.slice(o, o + CHUNK);
    const out = await runJobs(part, (d) => process.stdout.write(`\r    ${o + d}/${jobs.length}   `));
    for (let i = 0; i < out.length; i++) cache[keys[o + i]] = out[i];
    writeFileSync(CACHE, JSON.stringify(cache));
    process.stdout.write(`\r    ${Math.min(o + CHUNK, jobs.length)}/${jobs.length}  (${((Date.now() - t0) / 1000).toFixed(0)} s)   \n`);
  }
}

/** Mirrored winrate of A against B over seeds 0..S-1 (draw = ½). */
function rate(A, B, S) {
  let w = 0; let n = 0;
  for (let s = 0; s < S; s++) {
    const r1 = cache[key(A.sig, B.sig, seedAt(s))];
    if (r1 !== undefined && r1 !== 'error') { n++; if (r1 === 'blue') w++; else if (r1 === null) w += 0.5; }
    const r2 = cache[key(B.sig, A.sig, seedAt(s))];
    if (r2 !== undefined && r2 !== 'error') { n++; if (r2 === 'orange') w++; else if (r2 === null) w += 0.5; }
  }
  return n ? w / n : NaN;
}

/** What `viability()` measures for candidate P against gauntlet member G:
    eight fights, P on blue for even i and on orange for odd i. */
function viabRate(P, G) {
  let w = 0; let n = 0;
  for (let i = 0; i < VIAB_FIGHTS; i++) {
    const flip = i % 2 === 1;
    const r = flip ? cache[key(G.sig, P.sig, seedAt(i))] : cache[key(P.sig, G.sig, seedAt(i))];
    if (r === undefined || r === 'error') continue;
    n++;
    if (r === (flip ? 'orange' : 'blue')) w++; else if (r === null) w += 0.5;
  }
  return n ? w / n : NaN;
}

/* ── scoring a five ──────────────────────────────────────────────────────── */

function cyclesOf(t) {
  const beats = (i, j) => Number.isFinite(t[i][j]) && t[i][j] > 0.5;
  const out = [];
  for (let i = 0; i < t.length; i++) {
    for (let j = i + 1; j < t.length; j++) {
      for (let k = i + 1; k < t.length; k++) {
        if (j !== k && beats(i, j) && beats(j, k) && beats(k, i)) out.push([i, j, k]);
      }
    }
  }
  return out;
}

const REACH = 0.875; /* per = 8 fights on the viability grid: a threshold at or above 7/8 needs a clean sweep */
const CEILING = 0.80; /* the field's best worst may not exceed this: BASELINE has to sit strictly above it and under REACH */
const PRESET_CAP = 0.75; /* a preset's worst on the 1/8 grid; the next step (0.875) can never be under a reachable BASELINE */

/** @param {number[][]} R full rate matrix at some resolution, indexed like `pool` */
function evaluate(ix, R, V) {
  const t = ix.map((i) => ix.map((j) => (i === j ? 0.5 : R[i][j])));
  const off = (i) => t[i].filter((_, j) => j !== i).filter(Number.isFinite);
  const mins = ix.map((_, i) => Math.min(...off(i)));
  const maxs = ix.map((_, i) => Math.max(...off(i)));
  const bestMin = Math.max(...mins);
  const floor = Math.min(...mins);
  const spread = bestMin - floor;
  const div = isDiverse(t);
  const cyc = cyclesOf(t);
  const cycStrength = cyc.length
    ? Math.max(...cyc.map(([i, j, k]) => Math.min(t[i][j], t[j][k], t[k][i]) - 0.5)) : 0;
  let edgeMargin = 1;
  for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) if (i !== j) edgeMargin = Math.min(edgeMargin, Math.abs(t[i][j] - 0.5));
  /* Each preset's worst against the five — the number `readShape` compares with BASELINE.bestMin. */
  const presetMins = presets.map((_, p) => Math.min(...ix.map((i) => V[p][i]).filter(Number.isFinite)));
  const presetWorst = Math.max(...presetMins);
  const twoDmg = ix.filter((i) => pool[i].dmg >= 2).length;
  const shapes = new Set(ix.map((i) => pool[i].kit.map((s) => s.delivery).sort().join('+'))).size;
  const ceiling = Math.max(bestMin, presetWorst);
  const hard = div.ok && cyc.length > 0 && floor >= 0.15 && spread >= 0.2 && bestMin <= CEILING + 1e-9 && presetWorst <= PRESET_CAP + 1e-9;
  const score = 10 * Math.min(cycStrength, edgeMargin) + 3 * cyc.length + 2 * (div.unique === 5 ? 1 : 0)
    + 4 * floor + 3 * (REACH - ceiling) + 0.3 * twoDmg + 0.2 * shapes;
  return { ix, t, mins, maxs, bestMin, floor, spread, div, cyc, cycStrength, edgeMargin, presetMins, presetWorst, twoDmg, shapes, hard, score };
}

function matrices(S) {
  const R = pool.map((A) => pool.map((B) => (A === B ? 0.5 : rate(A, B, S))));
  const V = presets.map((P) => pool.map((G) => viabRate(P, G)));
  return { R, V };
}

function tableLines(e, ids) {
  const names = ids || e.ix.map((i) => pool[i].id);
  const lines = [];
  lines.push(`  ${''.padEnd(13)}${names.map((n) => n.slice(0, 7).padStart(8)).join('')}     worst`);
  for (let i = 0; i < 5; i++) {
    const cells = e.t[i].map((v, j) => (i === j ? '     ·  ' : `${(v * 100).toFixed(0).padStart(7)}%`)).join('');
    lines.push(`  ${names[i].padEnd(13)}${cells}   ${(e.mins[i] * 100).toFixed(0).padStart(5)}%`);
  }
  lines.push(`  best worst ${(e.bestMin * 100).toFixed(1)}%  floor ${(e.floor * 100).toFixed(1)}%  spread ${(e.spread * 100).toFixed(0)} pp  styles ${e.div.unique}/5${e.div.ok ? '' : ' ← HOMOGENEOUS'}  cycles ${e.cyc.length}${e.cyc.length ? '  ' + e.cyc.map(([i, j, k]) => `${names[i]}→${names[j]}→${names[k]}`).join(', ') : '  ← LADDER'}`);
  lines.push(`  presets' worst (viability, 8 fights): ${presets.map((p, k) => `${p.id.slice(7)} ${(e.presetMins[k] * 100).toFixed(1)}%`).join(', ')}  → ${e.hard ? 'holds' : 'FAILS'}`);
  return lines;
}
const printTable = (e, ids) => console.log(tableLines(e, ids).join('\n'));

/* ── 1. the matrix at SEEDS ──────────────────────────────────────────────── */

const allPairs = [];
for (let i = 0; i < pool.length; i++) for (let j = i + 1; j < pool.length; j++) allPairs.push([pool[i], pool[j]]);
for (const P of presets) for (const c of pool) allPairs.push([P, c]);
console.log(`\n  ${allPairs.length} pairs × ${SEEDS} seeds × 2 sides`);
await ensure(allPairs, SEEDS, `matrix @${SEEDS}`);

/* ── 2. every five, offline ──────────────────────────────────────────────── */

const M8 = matrices(SEEDS);
const N = pool.length;
const ranked5 = [];
let total = 0; let passing = 0;
const why = { div: 0, cyc: 0, floor: 0, spread: 0, ceiling: 0, presets: 0 };
for (let a = 0; a < N; a++) for (let b = a + 1; b < N; b++) for (let c = b + 1; c < N; c++) for (let d = c + 1; d < N; d++) for (let e = d + 1; e < N; e++) {
  total++;
  const ev = evaluate([a, b, c, d, e], M8.R, M8.V);
  if (!ev.div.ok) why.div++;
  if (!ev.cyc.length) why.cyc++;
  if (ev.floor < 0.15) why.floor++;
  if (ev.spread < 0.2) why.spread++;
  if (ev.bestMin > CEILING + 1e-9) why.ceiling++;
  if (ev.presetWorst > PRESET_CAP + 1e-9) why.presets++;
  if (!ev.hard) continue;
  passing++;
  ranked5.push(ev);
}
ranked5.sort((x, y) => y.score - x.score);
console.log(`\n  fives: ${total} enumerated, ${passing} meet every hard criterion at ${SEEDS} seeds`);
console.log(`  failing (a five may fail several): styles ${why.div}, no cycle ${why.cyc}, punching bag ${why.floor}, spread ${why.spread}, ceiling ${why.ceiling}, presets ${why.presets}`);

/* Per-candidate strength on the pool, for the report. */
const strength = pool.map((c, i) => {
  const row = M8.R[i].filter((_, j) => j !== i).filter(Number.isFinite);
  return { id: c.id, mean: row.reduce((a, b) => a + b, 0) / row.length, min: Math.min(...row), max: Math.max(...row) };
}).sort((a, b) => b.mean - a.mean);
console.log(`\n  candidates by mean winrate on the pool @${SEEDS}:`);
for (const s of strength) console.log(`    ${s.id.padEnd(13)} mean ${(s.mean * 100).toFixed(0).padStart(3)}%  worst ${(s.min * 100).toFixed(0).padStart(3)}%  best ${(s.max * 100).toFixed(0).padStart(3)}%`);

/* Finalists: the best by score, but no more than two from the same family
   (four members shared) so the verification hedges across compositions. */
const finalists = [];
for (const ev of ranked5) {
  const near = finalists.filter((f) => f.ix.filter((i) => ev.ix.includes(i)).length >= 4).length;
  if (near >= 2) continue;
  finalists.push(ev);
  if (finalists.length >= FINALISTS) break;
}
console.log(`\n  finalists: ${finalists.length}`);
for (const [n, f] of finalists.entries()) {
  console.log(`   ${String(n + 1).padStart(2)}. score ${f.score.toFixed(2)}  cycles ${f.cyc.length} (str ${(f.cycStrength * 100).toFixed(0)})  styles ${f.div.unique}  floor ${(f.floor * 100).toFixed(0)}%  best-worst ${(f.bestMin * 100).toFixed(0)}%  presets ${(f.presetWorst * 100).toFixed(0)}%  2dmg ${f.twoDmg}  ${f.ix.map((i) => pool[i].id).join(', ')}`);
}
if (!finalists.length) {
  console.log('\n  NO FIVE meets the hard criteria at this resolution; best by score without the filter:');
  const soft = [];
  for (let a = 0; a < N; a++) for (let b = a + 1; b < N; b++) for (let c = b + 1; c < N; c++) for (let d = c + 1; d < N; d++) for (let e = d + 1; e < N; e++) {
    const ev = evaluate([a, b, c, d, e], M8.R, M8.V);
    if (ev.div.ok && ev.cyc.length) soft.push(ev);
  }
  soft.sort((x, y) => y.score - x.score);
  for (const f of soft.slice(0, 10)) console.log(`     ${f.ix.map((i) => pool[i].id).join(', ')}  floor ${(f.floor * 100).toFixed(0)}% best-worst ${(f.bestMin * 100).toFixed(0)}% presets ${(f.presetWorst * 100).toFixed(0)}%`);
  writeFileSync(join(HERE, TAG === '' ? 'result.json' : `result-${TAG}.json`), JSON.stringify({ seeds: SEEDS, pool: pool.map((c) => ({ id: c.id, src: c.src, sig: c.sig, kit: c.kit })), strength, soft: soft.slice(0, 10).map((f) => ({ ids: f.ix.map((i) => pool[i].id), ev: f })) }, null, 1));
  closePool();
  process.exit(2);
}

/* ── 3. verify the finalists at 12 (gate) and VERIFY (baseline) seeds ──────── */

const fPairs = new Map();
for (const f of finalists) {
  for (let i = 0; i < 5; i++) for (let j = i + 1; j < 5; j++) {
    const A = pool[f.ix[i]]; const B = pool[f.ix[j]];
    fPairs.set(`${A.sig}##${B.sig}`, [A, B]);
  }
}
await ensure([...fPairs.values()], VERIFY, `finalists @${VERIFY}`);

const M12 = matrices(12);
const M20 = matrices(VERIFY);
const verified = finalists.map((f) => {
  const e8 = evaluate(f.ix, M8.R, M8.V);
  const e12 = evaluate(f.ix, M12.R, M12.V);
  const e20 = evaluate(f.ix, M20.R, M20.V);
  const ok = e8.hard && e12.hard && e20.hard;
  return { ix: f.ix, e8, e12, e20, ok, score: e12.score + e20.score };
}).sort((x, y) => (y.ok - x.ok) || (y.score - x.score));

console.log(`\n  verification (hard criteria must hold at ${SEEDS}, 12 and ${VERIFY} seeds):`);
for (const [n, v] of verified.entries()) {
  console.log(`   ${String(n + 1).padStart(2)}. ${v.ok ? 'HOLDS' : 'fails'}  @12: cyc ${v.e12.cyc.length} sty ${v.e12.div.unique} floor ${(v.e12.floor * 100).toFixed(0)}% best ${(v.e12.bestMin * 100).toFixed(0)}%   @${VERIFY}: cyc ${v.e20.cyc.length} sty ${v.e20.div.unique} floor ${(v.e20.floor * 100).toFixed(0)}% best ${(v.e20.bestMin * 100).toFixed(0)}% presets ${(v.e20.presetWorst * 100).toFixed(0)}%  ${v.ix.map((i) => pool[i].id).join(', ')}`);
}

const win = verified[0];
if (!win.ok) console.log('\n  NO finalist holds at every resolution — installing the best partial (see the report).');

/* ── 4. the order: `isDiverse` merges greedily in gauntlet order ──────────── */

function permutations(xs) {
  if (xs.length <= 1) return [xs];
  const out = [];
  xs.forEach((x, i) => { for (const p of permutations([...xs.slice(0, i), ...xs.slice(i + 1)])) out.push([x, ...p]); });
  return out;
}
let best = null;
for (const perm of permutations(win.ix)) {
  const a = evaluate(perm, M12.R, M12.V); const b = evaluate(perm, M20.R, M20.V); const c = evaluate(perm, M8.R, M8.V);
  const styles = Math.min(a.div.unique, b.div.unique, c.div.unique);
  const sum = a.div.unique + b.div.unique + c.div.unique;
  if (!best || styles > best.styles || (styles === best.styles && sum > best.sum)) best = { perm, styles, sum, e8: c, e12: a, e20: b };
}
const order = best.perm;
console.log(`\n  CHOSEN FIVE${win.ok ? '' : ' (partial)'}, in the order to install (styles at 8/12/${VERIFY} seeds: ${best.e8.div.unique}/${best.e12.div.unique}/${best.e20.div.unique}):`);
for (const i of order) console.log(`    ${pool[i].id.padEnd(13)} [${pool[i].src}]  ${pool[i].kit.map((s) => describe(s)).join('  |  ')}`);
console.log(`\n  @12 seeds (gate resolution):`);
printTable(best.e12);
console.log(`\n  @${VERIFY} seeds (baseline resolution):`);
printTable(best.e20);

/*
 * Suggested BASELINE.bestMin. The gate wants: strictly above the field's best
 * worst at 12 seeds; under 87.5 % (reachable on the viability grid); not under
 * any preset's worst (else the preset reads `dominant`); and no member more
 * than 12 pp above it. Take the field's ceiling at either resolution plus a
 * small sampling margin, rounded up to a 5-pp step, never under the presets.
 */
const fieldTop = Math.max(best.e12.bestMin, best.e20.bestMin);
const step = (x) => Math.ceil((x + 1e-9) * 20) / 20;
const suggested = Math.min(0.85, Math.max(step(fieldTop + 0.03), best.e20.presetWorst));
const sortedMins = best.e20.mins.slice().sort((a, b) => a - b);
const okBase = suggested > best.e12.bestMin && suggested < REACH && suggested >= best.e20.presetWorst;
console.log(`\n  suggested BASELINE: bestMin ${suggested} (field top ${(fieldTop * 100).toFixed(1)}%, presets' worst ${(best.e20.presetWorst * 100).toFixed(1)}%)${okBase ? '' : ' — DOES NOT SATISFY THE GATE'}, medianMin ${sortedMins[2].toFixed(3)}`);
console.log(`\n  JSON:\n${JSON.stringify(order.map((i) => pool[i].kit))}\n`);

writeFileSync(join(HERE, TAG === '' ? 'result.json' : `result-${TAG}.json`), JSON.stringify({
  seeds: SEEDS, verify: VERIFY, pool: pool.map((c) => ({ id: c.id, src: c.src, why: c.why, sig: c.sig, kit: c.kit })),
  strength,
  enumerated: { total, passing, why },
  finalists: verified.map((v) => ({ ids: v.ix.map((i) => pool[i].id), ok: v.ok, score: v.score, at8: v.e8, at12: v.e12, at20: v.e20 })),
  chosen: {
    ids: order.map((i) => pool[i].id), kits: order.map((i) => pool[i].kit), ok: win.ok,
    at8: best.e8, at12: best.e12, at20: best.e20,
    tables: { at12: tableLines(best.e12), at20: tableLines(best.e20) },
    suggested: { bestMin: suggested, medianMin: sortedMins[2], ok: okBase },
  },
}, null, 1));
closePool();
process.exit(win.ok ? 0 : 2);
