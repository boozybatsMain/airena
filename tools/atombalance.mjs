/**
 * atombalance — the marginal VALUE of every grammar piece, measured, then priced.
 *
 * WHAT IT ANSWERS. The registry (`src/skills/registry.js`) prices each
 * delivery, effect and channel by hand. `tools/kitbalance.mjs` measures one
 * atom at a time against a fixed base kit, which is a measurement of that base
 * as much as of the atom. This tool measures the pieces the way a player meets
 * them: inside random legal kits, against other random legal kits, and asks a
 * regression which pieces move the win rate and by how much. The output is a
 * price proposal — the cost every piece would carry if a point of budget
 * bought the same amount of win rate everywhere.
 *
 * HOW.
 *   1. Sample N random LEGAL kits (`validateKit`: three abilities, skill and
 *      kit budgets, L1/L2, no duplicates, E1 with the kinetic element — the
 *      element is visual only and costs nothing, so every kit is kinetic).
 *      Sampling is seeded and stratified: every effect and every delivery
 *      appears in at least --minEach kits (rejection sampling with a
 *      coverage target). Two-effect and three-effect abilities are drawn at
 *      35% / 15% before the budget filter.
 *   2. League: each kit plays --games matches against random other kits,
 *      every pairing mirrored (both sides, same seed), the SAME pilot on both
 *      sides of a match so that only the kits differ, symmetric default
 *      bodies. Pilots come from --pilots; a name whose file is missing under
 *      brains/pilots/ falls back to the stub (reported).
 *   3. Score: kit score = mean points (win 1, draw 0.5, loss 0). Ridge
 *      regression of score on: count of each delivery, effect and channel in
 *      the kit; count of each delivery×effect pair present; number of 2- and
 *      3-effect abilities; intercept. Normal equations solved by Cholesky
 *      (Gauss-Jordan fallback). Bootstrap standard errors over kits.
 *   4. Pricing: value = the ABSOLUTE coefficient (win-rate points per unit).
 *      One scale k turns values into points so that the sum of proposed costs
 *      over the 30 pieces equals the sum of current costs (the budget scale is
 *      kept); each piece: round(clamp(k·value, 1, 10)), optionally damped
 *      toward the current price (--damp) when the loop is oscillating.
 *   5. Verdict: CONVERGED (exit 0) when no proposed price moves by more than
 *      one point AND no piece is significantly negative; NOT CONVERGED and
 *      exit 2 otherwise. Printed first, in the report and on the console.
 *   6. Report: Markdown to --out plus a JSON beside it with every row.
 *
 * WHY THE `cost` FEATURE IS GONE (balance review r1, H3). The fit used to
 * carry total kit cost as a 31st feature. Cost is an EXACT linear sum of the
 * piece counts, so ridge's minimum-norm solution split every piece's value
 * arbitrarily between "cost" and the piece itself — and the re-price then read
 * only the piece half. That is why four passes never settled and prices
 * oscillated (blink 5→4→5→6, root 5→3→3→2). With cost dropped, and one
 * delivery dummy dropped with it (the nine delivery counts always sum to 3, so
 * they are collinear with the intercept), the coefficients are what the report
 * calls them: the value of carrying one more of that piece.
 *
 * WHAT IS STILL RELATIVE. The dropped delivery is the baseline; the delivery
 * block is re-centred to mean zero across all nine and its common LEVEL is
 * unidentifiable by construction — a kit cannot carry four deliveries or two.
 * Differences between deliveries are absolute; the block's level is not. The
 * effect and channel values are absolute. Standard errors for the re-centred
 * delivery values come from the bootstrap, re-centred inside each resample.
 *
 * THE HEADLINE is value per point — a piece's value divided by what it costs.
 * Flat prices mean every point of budget buys the same win rate, so the
 * quantity to watch is the SPREAD of value per point, not the correlation
 * between cost and value (that only says the ORDER is right, and it has been
 * right for four passes while the rate was not). corr(cost, value) is printed
 * below it as the secondary line it is.
 *
 * A piece the pilots never use well reads as worthless — the pilot-agreement
 * section says which values are pilot-dependent.
 *
 * USAGE
 *   node tools/atombalance.mjs                                  full run, 240 kits × 24 games
 *   node tools/atombalance.mjs --dry                            smoke run, ~40 kits, exit 0 whatever it finds
 *   node tools/atombalance.mjs --n=60 --games=8 --pilots=stub --cooldown=3 --seed=1
 *
 * FLAGS
 *   --n=240          kits to sample
 *   --games=24       matches per kit as the home side (pairings × 2 sides)
 *   --pilots=stub,rusher,kiter,controller   pilot panel, comma-separated
 *   --cooldown=null  fixed cooldown in seconds for every ability of every kit;
 *                    null (default) keeps the registry's own cooldown — the
 *                    schedule the game is actually played on
 *   --real           product path (kit size enforced, registry cooldowns unless --cooldown)
 *   --seed=1         PRNG seed for sampling, pairing and match seeds
 *   --ridge=1.0      ridge lambda
 *   --boot=200       bootstrap resamples for standard errors
 *   --minEach=N/20   coverage target per effect and per delivery (min 3)
 *   --damp=1         how far the proposal moves from the current price toward
 *                    the fit's target (1 = all the way, 0.5 = halfway). The
 *                    VERDICT is always judged on the undamped target, so
 *                    damping slows the loop without softening the gate.
 *   --dry            small, fast smoke run; the verdict is printed but
 *                    ADVISORY and the exit status is 0 whatever it says
 *   --out=reports/combat/atombalance-<seed>.md
 *
 * EXIT STATUS
 *   0  CONVERGED — no proposed price moves by more than one point and no piece
 *      is significantly negative (value < −2·se). Also 0 for any --dry run.
 *   2  NOT CONVERGED — one of those two conditions fails. The pass is real and
 *      the report is written; the prices are not settled.
 *   1  the run itself failed (too few scored kits, a crash).
 *
 * Runs on the worker pool (`tools/matchpool.mjs`); one league at a time.
 */

import { SUDDEN_DEATH_AT } from '../src/core/config.js';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { POOL_SIZE, closePool, runJobsFull, superviseSelf } from './matchpool.mjs';

/* The pool occasionally takes the whole process down with a signal (see
   `superviseSelf`); the supervisor restarts the run with fewer workers. */
superviseSelf('ATOMBALANCE_CHILD');

import { mulberry32 } from '../src/core/rng.js';
import {
  CHANNELS, DELIVERIES, EFFECTS, SELF_ALLOWED, costOf, validateKit, validateSkill,
} from '../src/skills/registry.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/* ── flags ─────────────────────────────────────────────────────────────── */
const arg = (n, d) => {
  const h = process.argv.find((a) => a.startsWith(`--${n}=`));
  if (h) return h.slice(n.length + 3);
  return process.argv.includes(`--${n}`) ? true : d;
};
const num = (v, d) => (v === true || v === undefined || v === null || v === '' ? d : Number(v));
/* `--dry` only moves the DEFAULTS: an explicit --n / --games / --boot still wins. */
const DRY_RUN = process.argv.includes('--dry');
const N = Math.max(10, Math.round(num(arg('n'), DRY_RUN ? 40 : 240)));
const GAMES = Math.max(2, Math.round(num(arg('games'), DRY_RUN ? 6 : 24)));
const PILOTS = String(arg('pilots', 'stub,rusher,kiter,controller')).split(',').map((s) => s.trim()).filter(Boolean)
  .filter((s, i, a) => a.indexOf(s) === i);
const cdRaw = arg('cooldown', null);
const COOLDOWN = cdRaw === null || cdRaw === true || String(cdRaw) === 'null' ? null : Number(cdRaw);
const REAL = arg('real', false) === true;
const SEED = Math.round(num(arg('seed'), 1));
const RIDGE = num(arg('ridge'), 1.0);
const BOOT = Math.max(0, Math.round(num(arg('boot'), DRY_RUN ? 40 : 200)));
const MIN_EACH = Math.max(3, Math.round(num(arg('minEach'), Math.max(3, Math.round(N / 20)))));
const DAMP = Math.min(1, Math.max(0, num(arg('damp'), 1)));
const OUT = resolve(ROOT, String(arg('out', `reports/combat/atombalance-${SEED}.md`)));
const OUT_JSON = OUT.replace(/\.md$/, '') + '.json';
const MIN_COST = 1, MAX_COST = 10;
/** A delivery×effect pair needs this many kits before it gets a column. */
const MIN_PAIR_KITS = 2;

if (!Number.isFinite(RIDGE) || RIDGE <= 0) { console.error('--ridge must be a positive number'); process.exit(2); }
if (COOLDOWN !== null && !(Number.isFinite(COOLDOWN) && COOLDOWN > 0)) { console.error('--cooldown must be a positive number or null'); process.exit(2); }
if (!PILOTS.length) { console.error('--pilots must name at least one pilot'); process.exit(2); }

const DELIVERY_IDS = Object.keys(DELIVERIES);
const EFFECT_IDS = Object.keys(EFFECTS);
const CHANNEL_IDS = Object.keys(CHANNELS);

/* ── seeded randomness ─────────────────────────────────────────────────── */
const rng = mulberry32((SEED * 2654435761) >>> 0);
const pick = (arr) => arr[Math.floor(rng() * arr.length)];
const pickWeighted = (items, weights) => {
  let r = rng() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < items.length; i++) { r -= weights[i]; if (r < 0) return items[i]; }
  return items[items.length - 1];
};

/* ── 1. kit sampling ────────────────────────────────────────────────────── */
/**
 * One random ability. `force` is an optional {kind:'delivery'|'effect', id}
 * that must appear in it; null when the forced piece cannot fit here.
 */
function sampleSkill(force) {
  const delivery = force?.kind === 'delivery' ? force.id : pick(DELIVERY_IDS);
  const selfClass = DELIVERIES[delivery].klass === 'self';
  const pool = selfClass ? EFFECT_IDS.filter((e) => SELF_ALLOWED.has(e)) : EFFECT_IDS;
  const n = pickWeighted([1, 2, 3], [0.5, 0.35, 0.15]);
  const effects = [];
  if (force?.kind === 'effect') {
    if (!pool.includes(force.id)) return null;
    effects.push(force.id);
  }
  let guard = 0;
  while (effects.length < n && guard++ < 50) {
    const e = pick(pool);
    if (!effects.includes(e)) effects.push(e);
  }
  const skill = { delivery, effects, element: 'kinetic' };
  if (effects.some((e) => EFFECTS[e].needsChannel)) skill.channel = pick(CHANNEL_IDS);
  return validateSkill(skill).length ? null : skill;
}

/**
 * Does this kit have any way to take a hit point off the other body?
 *
 * A kit of three durations cannot win: it waits for the arena's burn and its
 * league game is decided by who happened to be ahead on hp fraction at the
 * bell. Those rows priced "who survives a stall", not "who wins a fight" —
 * the pace review's M1 — so they are drawn again instead of being scored.
 * The bar is deliberately the lowest possible one: ONE damage or burn atom
 * anywhere in the three abilities.
 */
const HARM = new Set(['damage', 'burn']);
const canHarm = (kit) => kit.some((s) => s.effects.some((e) => HARM.has(e)));

let harmlessRejected = 0;

function sampleKit(force) {
  for (let tries = 0; tries < 4000; tries++) {
    const slot = Math.floor(rng() * 3);
    const kit = [];
    let ok = true;
    for (let i = 0; i < 3; i++) {
      const s = sampleSkill(i === slot ? force : null);
      if (!s) { ok = false; break; }
      kit.push(s);
    }
    if (!ok) continue;
    if (validateKit(kit).length) continue;
    if (!canHarm(kit)) { harmlessRejected++; continue; }
    return kit;
  }
  return null;
}

const skillSig = (s) => `${s.delivery}:${[...s.effects].sort().join('+')}${s.channel ? '/' + s.channel : ''}`;
const kitSig = (kit) => kit.map(skillSig).sort().join(' | ');
const skillLabel = (s) => `${s.delivery}:${s.effects.join('+')}${s.channel ? '/' + s.channel : ''}`;
const kitLabel = (kit) => kit.map(skillLabel).join(' | ');

function sampleLeague() {
  const kits = [];
  const seen = new Set();
  const cover = { delivery: Object.fromEntries(DELIVERY_IDS.map((d) => [d, 0])), effect: Object.fromEntries(EFFECT_IDS.map((e) => [e, 0])) };
  const deficits = () => {
    const out = [];
    for (const d of DELIVERY_IDS) if (cover.delivery[d] < MIN_EACH) out.push({ kind: 'delivery', id: d, need: MIN_EACH - cover.delivery[d] });
    for (const e of EFFECT_IDS) if (cover.effect[e] < MIN_EACH) out.push({ kind: 'effect', id: e, need: MIN_EACH - cover.effect[e] });
    return out;
  };
  let forced = 0;
  const cap = N + Math.max(40, Math.round(N * 0.5));
  while (kits.length < cap) {
    const def = deficits();
    const D = def.reduce((a, x) => a + x.need, 0);
    if (kits.length >= N && D === 0) break;
    const R = Math.max(1, N - kits.length);
    let force = null;
    /* Force a lagging piece with probability deficit/(2·remaining) — a kit
       carries several pieces, so the deficit shrinks faster than one per
       kit; this spreads the forced kits through the sample instead of
       stacking them at the start. Past N the forcing is certain, so coverage
       is reached (up to the cap) whatever the draw. */
    if (D > 0 && (kits.length >= N || rng() < Math.min(1, D / (2 * R)))) {
      force = pickWeighted(def, def.map((x) => x.need));
      forced++;
    }
    const kit = sampleKit(force);
    if (!kit) continue;
    const sig = kitSig(kit);
    if (seen.has(sig)) continue;
    seen.add(sig);
    kits.push(kit);
    for (const d of new Set(kit.map((s) => s.delivery))) cover.delivery[d]++;
    for (const e of new Set(kit.flatMap((s) => s.effects))) cover.effect[e]++;
  }
  return { kits, cover, forced, uncovered: deficits(), harmlessRejected };
}

/* ── 2. league ─────────────────────────────────────────────────────────── */
function schedule(kits) {
  const jobs = []; const meta = [];
  const pairings = Math.max(1, Math.ceil(GAMES / 2));
  const base = 100000 + SEED * 1000003;
  let pairIndex = 0;
  for (let i = 0; i < kits.length; i++) {
    const others = [];
    const tried = new Set([i]);
    while (others.length < Math.min(pairings, kits.length - 1)) {
      const j = Math.floor(rng() * kits.length);
      if (tried.has(j)) continue;
      tried.add(j); others.push(j);
    }
    for (const j of others) {
      const pilot = pick(PILOTS);
      const seed = (base + pairIndex * 7919) % 2147483647;
      pairIndex++;
      const common = { seed, pilots: { blue: pilot, orange: pilot }, cooldown: COOLDOWN, ...(REAL ? { real: true } : {}) };
      jobs.push({ a: kits[i], b: kits[j], ...common }); meta.push({ a: i, b: j, pilot, seed, pair: pairIndex - 1 });
      jobs.push({ a: kits[j], b: kits[i], ...common }); meta.push({ a: j, b: i, pilot, seed, pair: pairIndex - 1 });
    }
  }
  return { jobs, meta };
}

/* ── 3. features & regression ──────────────────────────────────────────── */
/**
 * Column names for the design matrix.
 *
 * TWO COLUMNS THAT USED TO BE HERE ARE NOT:
 *
 * `cost` — an exact linear sum of every other column. Ridge split each piece's
 *   value between cost and the piece, the re-price read only the piece half,
 *   and the loop oscillated for four passes (balance review H3). Gone.
 *
 * one delivery dummy — a kit carries exactly three deliveries, so the nine
 *   delivery counts sum to a constant and are collinear with the intercept
 *   whatever else is in the matrix. The delivery that appears in the MOST kits
 *   is dropped as the baseline (most kits = the best-measured baseline, and
 *   the choice is deterministic from the sample). The remaining eight are read
 *   as differences from it and re-centred to mean zero over all nine, so the
 *   block's common level — the part the design genuinely cannot see — is
 *   stated instead of being hidden inside one arbitrary piece.
 *
 * @returns {{names: string[], pairs: string[], pairCount: Map, baseDelivery: string}}
 */
function featureNames(kits) {
  const pairCount = new Map();
  const delKits = Object.fromEntries(DELIVERY_IDS.map((d) => [d, 0]));
  for (const kit of kits) {
    const here = new Set();
    for (const s of kit) for (const e of s.effects) here.add(`${s.delivery}×${e}`);
    for (const p of here) pairCount.set(p, (pairCount.get(p) || 0) + 1);
    for (const d of new Set(kit.map((s) => s.delivery))) delKits[d]++;
  }
  const baseDelivery = DELIVERY_IDS.slice().sort((a, b) => delKits[b] - delKits[a] || (a < b ? -1 : 1))[0];
  const pairs = [...pairCount.entries()].filter(([, c]) => c >= MIN_PAIR_KITS).map(([p]) => p).sort();
  const names = [
    ...DELIVERY_IDS.filter((d) => d !== baseDelivery).map((d) => `d:${d}`),
    ...EFFECT_IDS.map((e) => `e:${e}`),
    ...CHANNEL_IDS.map((c) => `c:${c}`),
    'n2', 'n3',
    ...pairs.map((p) => `p:${p}`),
  ];
  return { names, pairs, pairCount, baseDelivery };
}

function featurize(kit, names) {
  const row = new Float64Array(names.length);
  const idx = new Map(names.map((n, i) => [n, i]));
  const bump = (k, v = 1) => { const i = idx.get(k); if (i !== undefined) row[i] += v; };
  for (const s of kit) {
    bump(`d:${s.delivery}`);
    for (const e of s.effects) { bump(`e:${e}`); bump(`p:${s.delivery}×${e}`); }
    if (s.channel) bump(`c:${s.channel}`);
    if (s.effects.length === 2) bump('n2');
    if (s.effects.length === 3) bump('n3');
  }
  /* No `cost` column — see `featureNames`. `bump` ignores a name that is not
     in `names`, which is also how the baseline delivery drops out. */
  return row;
}

function cholSolve(A, b) {
  const n = A.length;
  const L = A.map(() => new Float64Array(n));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = A[i][j];
      for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
      if (i === j) { if (!(s > 1e-12)) return null; L[i][i] = Math.sqrt(s); } else L[i][j] = s / L[j][j];
    }
  }
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) { let s = b[i]; for (let k = 0; k < i; k++) s -= L[i][k] * y[k]; y[i] = s / L[i][i]; }
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) { let s = y[i]; for (let k = i + 1; k < n; k++) s -= L[k][i] * x[k]; x[i] = s / L[i][i]; }
  return x;
}

function gaussSolve(A, b) {
  const n = A.length;
  const M = A.map((r, i) => { const o = new Float64Array(n + 1); o.set(r); o[n] = b[i]; return o; });
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-14) continue;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      if (f === 0) continue;
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = new Float64Array(n);
  for (let i = 0; i < n; i++) x[i] = Math.abs(M[i][i]) < 1e-14 ? 0 : M[i][n] / M[i][i];
  return x;
}

/** Ridge with an unpenalised intercept: centre X and y, solve (XᵀX + λI)β = Xᵀy. */
function ridgeFit(rows, y, lambda) {
  const n = rows.length; const p = rows[0].length;
  const xm = new Float64Array(p);
  for (const r of rows) for (let j = 0; j < p; j++) xm[j] += r[j] / n;
  const ym = y.reduce((a, b) => a + b, 0) / n;
  const A = Array.from({ length: p }, () => new Float64Array(p));
  const b = new Float64Array(p);
  const xc = new Float64Array(p);
  for (let i = 0; i < n; i++) {
    const r = rows[i];
    for (let j = 0; j < p; j++) xc[j] = r[j] - xm[j];
    const yc = y[i] - ym;
    for (let j = 0; j < p; j++) {
      const v = xc[j];
      if (v === 0) continue;
      b[j] += v * yc;
      const Aj = A[j];
      for (let k = 0; k <= j; k++) Aj[k] += v * xc[k];
    }
  }
  for (let j = 0; j < p; j++) { for (let k = 0; k < j; k++) A[k][j] = A[j][k]; A[j][j] += lambda; }
  const beta = cholSolve(A, b) || gaussSolve(A, b);
  let intercept = ym;
  for (let j = 0; j < p; j++) intercept -= beta[j] * xm[j];
  let ssRes = 0, ssTot = 0;
  for (let i = 0; i < n; i++) {
    let yh = intercept; for (let j = 0; j < p; j++) yh += beta[j] * rows[i][j];
    ssRes += (y[i] - yh) ** 2; ssTot += (y[i] - ym) ** 2;
  }
  return { beta, intercept, r2: ssTot > 0 ? 1 - ssRes / ssTot : 0 };
}

/**
 * 10-fold cross-validated R². The in-sample R² of a ridge fit with more
 * features than rows is a statement about the penalty, not about the game
 * (94 features against 60 kits scored 0.96 on a dry run); this is the number
 * to trust when deciding whether the sample is big enough.
 */
function cvR2(rows, y, lambda, folds = 10) {
  const n = rows.length;
  const order = rows.map((_, i) => i);
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  const ym = y.reduce((a, b) => a + b, 0) / n;
  let ssRes = 0, ssTot = 0;
  for (let f = 0; f < folds; f++) {
    const test = new Set(order.filter((_, k) => k % folds === f));
    const tr = [], ty = [];
    for (let i = 0; i < n; i++) if (!test.has(i)) { tr.push(rows[i]); ty.push(y[i]); }
    if (tr.length < 2) continue;
    const fit = ridgeFit(tr, ty, lambda);
    for (const i of test) {
      let yh = fit.intercept; for (let j = 0; j < rows[i].length; j++) yh += fit.beta[j] * rows[i][j];
      ssRes += (y[i] - yh) ** 2; ssTot += (y[i] - ym) ** 2;
    }
  }
  return ssTot > 0 ? 1 - ssRes / ssTot : NaN;
}

/**
 * Bootstrap standard errors over kits.
 *
 * `derive` (optional) turns one resample's coefficient vector into the DERIVED
 * quantities the report actually prices on — the piece values, whose delivery
 * block is re-centred. Re-centring inside every resample is the only way the
 * baseline delivery gets an honest standard error: outside, it would read 0 by
 * construction and the gate "no piece significantly negative" would be blind
 * to exactly one piece.
 */
function bootstrapSE(rows, y, lambda, B, derive = null) {
  const p = rows[0].length; const n = rows.length;
  const empty = derive ? { seDerived: new Float64Array(derive(new Float64Array(p)).length).fill(NaN) } : {};
  if (B < 2) return { se: new Float64Array(p).fill(NaN), seIntercept: NaN, ...empty };
  const sums = new Float64Array(p), sq = new Float64Array(p);
  let dSums = null, dSq = null;
  let si = 0, sqi = 0;
  for (let b = 0; b < B; b++) {
    const rr = [], yy = [];
    for (let i = 0; i < n; i++) { const k = Math.floor(rng() * n); rr.push(rows[k]); yy.push(y[k]); }
    const f = ridgeFit(rr, yy, lambda);
    for (let j = 0; j < p; j++) { sums[j] += f.beta[j]; sq[j] += f.beta[j] ** 2; }
    si += f.intercept; sqi += f.intercept ** 2;
    if (derive) {
      const d = derive(f.beta);
      if (!dSums) { dSums = new Float64Array(d.length); dSq = new Float64Array(d.length); }
      for (let j = 0; j < d.length; j++) { dSums[j] += d[j]; dSq[j] += d[j] ** 2; }
    }
  }
  const sd = (sum, sumsq) => Math.sqrt(Math.max(0, sumsq / B - (sum / B) ** 2) * B / (B - 1));
  const se = new Float64Array(p);
  for (let j = 0; j < p; j++) se[j] = sd(sums[j], sq[j]);
  const out = { se, seIntercept: sd(si, sqi) };
  if (derive && dSums) {
    out.seDerived = new Float64Array(dSums.length);
    for (let j = 0; j < dSums.length; j++) out.seDerived[j] = sd(dSums[j], dSq[j]);
  }
  return out;
}

function pearson(a, b) {
  const n = a.length; if (n < 3) return NaN;
  const ma = a.reduce((x, y) => x + y, 0) / n, mb = b.reduce((x, y) => x + y, 0) / n;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) ** 2; sbb += (b[i] - mb) ** 2; }
  return saa > 0 && sbb > 0 ? sab / Math.sqrt(saa * sbb) : NaN;
}

/* ── 4. pricing ────────────────────────────────────────────────────────── */
const PIECES = [
  ...DELIVERY_IDS.map((id) => ({ axis: 'delivery', id, feature: `d:${id}`, currentCost: DELIVERIES[id].cost })),
  ...EFFECT_IDS.map((id) => ({ axis: 'effect', id, feature: `e:${id}`, currentCost: EFFECTS[id].cost })),
  ...CHANNEL_IDS.map((id) => ({ axis: 'channel', id, feature: `c:${id}`, currentCost: CHANNELS[id].cost })),
];

/**
 * ZERO-SUM RE-PRICE, from the absolute values.
 *
 * `cost_i ∝ value_i`, with one scale k for all thirty pieces chosen so the sum
 * of the proposed costs equals the sum of the current ones — the budget scale
 * is a design decision (a kit is 56 points) and a measurement is not allowed to
 * move it. Every price is clamped to [1, 10].
 *
 * DAMPING (--damp, default 1 = none). A proposal that jumps the whole way to
 * the fit's target can overshoot and come back next pass; `damp` moves each
 * price only part of the way, `current + damp·(target − current)`. The sum is
 * kept by bisecting k on the DAMPED sum, so a damped proposal is still
 * budget-neutral. The convergence verdict is judged on the UNDAMPED target,
 * so turning damping up can never talk the gate into passing.
 *
 * @param {number[]} values pp per unit, one per piece, in PIECES order
 * @param {number} damp 0…1
 */
function proposePrices(values, damp = 1) {
  const target = PIECES.reduce((a, p) => a + p.currentCost, 0);
  const rawAt = (k, i) => Math.min(MAX_COST, Math.max(MIN_COST, k * values[i]));
  const dampedAt = (k, i) => Math.round(Math.min(MAX_COST, Math.max(MIN_COST,
    PIECES[i].currentCost + damp * (rawAt(k, i) - PIECES[i].currentCost))));
  const sumAt = (k) => PIECES.reduce((a, _p, i) => a + dampedAt(k, i), 0);
  const maxV = Math.max(1e-9, ...values.map((v) => Math.abs(v)));
  let lo = 0, hi = (MAX_COST * 4) / maxV;
  /* sumAt is a non-decreasing step function of k: bisect to the smallest k
     whose sum reaches the target, then keep whichever neighbour is closer. */
  for (let it = 0; it < 80; it++) { const mid = (lo + hi) / 2; if (sumAt(mid) >= target) hi = mid; else lo = mid; }
  const k = Math.abs(sumAt(hi) - target) <= Math.abs(sumAt(lo) - target) ? hi : lo;
  const costs = PIECES.map((_p, i) => dampedAt(k, i));
  const targets = PIECES.map((_p, i) => Math.round(rawAt(k, i)));
  return { k, costs, targets, target, sum: costs.reduce((a, b) => a + b, 0), damp };
}

/**
 * THE STOP RULE, in one function (`docs/COMBAT.md` §5 step 5).
 *
 * A pricing pass is finished when both halves are true:
 *   1. no price moves by more than one point — the fit agrees with the prices
 *      the fit was measured at, so another pass would change nothing;
 *   2. no piece is significantly negative (value < −2·se) — no piece is a trap
 *      that costs points and loses fights, at any price the grammar allows.
 * The second half cannot be fixed by pricing (a piece already at the floor of
 * 1 that still reads −7 has no price left to lose), so it is the half that
 * sends the work back to the MAGNITUDES rather than to the price table.
 *
 * @returns {{converged: boolean, maxDelta: number, movers: object[], negatives: object[]}}
 */
function verdictOf(pieceRows) {
  const movers = pieceRows.filter((p) => Math.abs(p.targetCost - p.currentCost) > 1);
  const negatives = pieceRows.filter((p) => Number.isFinite(p.se) && p.value < -2 * p.se);
  const maxDelta = pieceRows.reduce((a, p) => Math.max(a, Math.abs(p.targetCost - p.currentCost)), 0);
  return { converged: movers.length === 0 && negatives.length === 0, maxDelta, movers, negatives };
}

/* ── main ──────────────────────────────────────────────────────────────── */
const fmt = (x, d = 3) => (Number.isFinite(x) ? x.toFixed(d) : 'n/a');
const pct = (x, d = 1) => (Number.isFinite(x) ? (x * 100).toFixed(d) + '%' : 'n/a');
const signed = (x, d = 2) => (Number.isFinite(x) ? (x >= 0 ? '+' : '') + x.toFixed(d) : 'n/a');

async function main() {
  const t0 = Date.now();
  const pilotsMissing = PILOTS.filter((p) => p !== 'stub' && !existsSync(join(ROOT, 'brains/pilots', `${p}.js`)));
  console.log(`atombalance · seed ${SEED} · ${N} kits × ${GAMES} games · pilots ${PILOTS.join(',')}`
    + ` · cooldown ${COOLDOWN === null ? 'registry' : COOLDOWN + ' s'}${REAL ? ' · real' : ''} · ridge ${RIDGE} · boot ${BOOT}`);
  if (pilotsMissing.length) console.log(`  pilots missing on disk (stub will stand in): ${pilotsMissing.join(', ')}`);

  const league = sampleLeague();
  const kits = league.kits;
  console.log(`  sampled ${kits.length} distinct legal kits (${league.forced} coverage-forced; target ≥ ${MIN_EACH} kits per effect and per delivery)`);
  if (league.uncovered.length) console.log(`  coverage NOT met for: ${league.uncovered.map((u) => `${u.id} (${u.need} short)`).join(', ')}`);

  const { jobs, meta } = schedule(kits);
  console.log(`  league: ${jobs.length} matches on ${POOL_SIZE} workers`);
  const tl = Date.now();
  const results = await runJobsFull(jobs, (d, t) => {
    const el = (Date.now() - tl) / 1000;
    const eta = d > 0 ? (el / d) * (t - d) : 0;
    process.stdout.write(`\r  league: ${d}/${t} · ${el.toFixed(0)} s elapsed · ~${eta.toFixed(0)} s left   `);
  });
  process.stdout.write('\n');
  const leagueSec = (Date.now() - tl) / 1000;
  closePool();

  /* ── tally ── */
  const K = kits.length;
  const stat = kits.map(() => ({ pts: 0, games: 0, wins: 0, draws: 0, losses: 0, perPilot: {} }));
  const health = {
    matches: results.length, errors: 0, draws: 0, blueWins: 0, orangeWins: 0, seconds: 0, timed: 0,
    reasons: {}, faults: 0, idleSides: 0, pilotMissing: {}, pilotBroken: {}, usesPerSide: 0, hitsPerSide: 0,
    errorMessages: {}, pilotsUsed: {}, lengths: [],
    /* Population health (pace review M1): what world these prices were found
       in. `decided` is what took the last hit point, `dodges` are i-frame and
       airborne escapes, `deadSlots` are paid abilities that never fired. */
    decided: {}, dodges: 0, deadSlots: 0, slots: 0, paced: 0,
  };
  const perPilotScores = Object.fromEntries(PILOTS.map((p) => [p, kits.map(() => ({ pts: 0, games: 0 }))]));
  results.forEach((r, i) => {
    const m = meta[i];
    if (!r || r.winner === 'error') {
      health.errors++;
      const msg = r?.error || r?.reason || 'unknown';
      health.errorMessages[msg] = (health.errorMessages[msg] || 0) + 1;
      return;
    }
    if (r.pilot_missing) for (const p of r.pilot_missing) health.pilotMissing[p] = (health.pilotMissing[p] || 0) + 1;
    if (r.problems) for (const p of r.problems) if (p.code === 'pilot_broken') health.pilotBroken[p.name] = (health.pilotBroken[p.name] || 0) + 1;
    if (r.pilots) for (const side of ['blue', 'orange']) health.pilotsUsed[r.pilots[side]] = (health.pilotsUsed[r.pilots[side]] || 0) + 1;
    health.reasons[r.reason || 'unknown'] = (health.reasons[r.reason || 'unknown'] || 0) + 1;
    if (r.pace) {
      health.paced++;
      health.decided[r.pace.decided] = (health.decided[r.pace.decided] || 0) + 1;
      health.dodges += r.pace.dodges || 0;
      health.deadSlots += r.pace.deadSlots || 0;
      health.slots += r.pace.slots || 0;
    }
    if (Number.isFinite(r.seconds)) { health.seconds += r.seconds; health.timed++; health.lengths.push(r.seconds); }
    for (const side of ['blue', 'orange']) {
      const s = r[side];
      if (!s) continue;
      health.faults += s.faults || 0;
      health.usesPerSide += s.uses || 0;
      health.hitsPerSide += s.hits || 0;
      if (!s.uses) health.idleSides++;
    }
    const pa = r.winner === 'blue' ? 1 : r.winner === 'orange' ? 0 : 0.5;
    if (r.winner === null) health.draws++;
    else if (r.winner === 'blue') health.blueWins++;
    else health.orangeWins++;
    const add = (k, pts) => {
      const st = stat[k];
      st.pts += pts; st.games++;
      if (pts === 1) st.wins++; else if (pts === 0) st.losses++; else st.draws++;
      const pp = st.perPilot[m.pilot] || (st.perPilot[m.pilot] = { pts: 0, games: 0 });
      pp.pts += pts; pp.games++;
      const ps = perPilotScores[m.pilot][k]; ps.pts += pts; ps.games++;
    };
    add(m.a, pa); add(m.b, 1 - pa);
  });
  const ok = health.matches - health.errors;

  const scored = kits.map((_, k) => stat[k].games > 0);
  const scoreOf = (k) => (stat[k].games ? stat[k].pts / stat[k].games : NaN);

  /* ── regression ── */
  const { names, pairs, pairCount, baseDelivery } = featureNames(kits);
  const rowsAll = kits.map((kit) => featurize(kit, names));
  const kitCost = kits.map((kit) => kit.reduce((a, sk) => a + costOf(sk), 0));
  const rows = [], y = [], costCol = [];
  kits.forEach((_, k) => { if (scored[k]) { rows.push(rowsAll[k]); y.push(scoreOf(k)); costCol.push([kitCost[k]]); } });
  if (rows.length < 10) { console.error('too few scored kits to regress'); process.exit(1); }
  const fit = ridgeFit(rows, y, RIDGE);
  const cv = cvR2(rows, y, RIDGE);

  /*
   * PIECE VALUES from one coefficient vector, in PIECES order, in pp per unit.
   *
   * The baseline delivery has no column, so its raw value is 0; the nine
   * delivery values are then re-centred to mean zero, which is the same
   * normalisation the old all-nine ridge fit reached by minimum norm and makes
   * the block's unidentifiable level explicit rather than parked on one piece.
   * Effects and channels are absolute and are not touched.
   */
  const featIdx = PIECES.map((pc) => names.indexOf(pc.feature));
  const deliveryPos = PIECES.map((pc, i) => (pc.axis === 'delivery' ? i : -1)).filter((i) => i >= 0);
  const valuesFrom = (beta) => {
    const v = new Float64Array(PIECES.length);
    for (let i = 0; i < PIECES.length; i++) v[i] = (featIdx[i] >= 0 ? beta[featIdx[i]] : 0) * 100;
    let m = 0; for (const i of deliveryPos) m += v[i];
    m /= deliveryPos.length;
    for (const i of deliveryPos) v[i] -= m;
    return v;
  };
  const { se, seIntercept, seDerived } = bootstrapSE(rows, y, RIDGE, BOOT, valuesFrom);
  const coefs = names.map((name, j) => ({ name, coef: fit.beta[j], se: se[j], t: se[j] > 0 ? fit.beta[j] / se[j] : NaN }));
  /* `cost` is no longer a column (see `featureNames`); the cost-only slope is
     still worth printing, so it is fitted on its own one-column design. */
  const costOnly = ridgeFit(costCol, y, 1e-9);

  /* per-pilot fits — only meaningful with two or more pilots */
  const pilotFits = {};
  if (PILOTS.length > 1) {
    for (const p of PILOTS) {
      const pr = [], py = [];
      kits.forEach((_, k) => { const s = perPilotScores[p][k]; if (s.games > 0) { pr.push(rowsAll[k]); py.push(s.pts / s.games); } });
      if (pr.length < 10) continue;
      const f = ridgeFit(pr, py, RIDGE);
      const b = bootstrapSE(pr, py, RIDGE, Math.min(BOOT, 100));
      pilotFits[p] = { n: pr.length, r2: f.r2, coef: f.beta, se: b.se };
    }
  }
  const pilotAgreement = [];
  for (let i = 0; i < PILOTS.length; i++) for (let j = i + 1; j < PILOTS.length; j++) {
    const a = [], b = [];
    kits.forEach((_, k) => {
      const sa = perPilotScores[PILOTS[i]][k], sb = perPilotScores[PILOTS[j]][k];
      if (sa.games > 0 && sb.games > 0) { a.push(sa.pts / sa.games); b.push(sb.pts / sb.games); }
    });
    pilotAgreement.push({ a: PILOTS[i], b: PILOTS[j], kits: a.length, r: pearson(a, b) });
  }
  const pilotDependent = (feature) => {
    const ps = Object.keys(pilotFits);
    if (ps.length < 2) return null;
    const j = names.indexOf(feature);
    /* The baseline delivery has no column of its own — it is the zero every
       other delivery is measured from, so there is nothing to disagree about. */
    if (j < 0) return null;
    const sig = ps.filter((p) => Math.abs(pilotFits[p].coef[j]) > 2 * pilotFits[p].se[j]);
    const signs = new Set(sig.map((p) => Math.sign(pilotFits[p].coef[j])));
    if (signs.size > 1) return `sign flips across pilots (${sig.map((p) => `${p} ${signed(pilotFits[p].coef[j] * 100, 1)}`).join(', ')})`;
    if (sig.length === 1) return `significant only under ${sig[0]}`;
    return null;
  };

  /* ── pricing ── */
  /* Values are already in pp per unit and the delivery block is re-centred. */
  const values = Array.from(valuesFrom(fit.beta));
  const valueSe = PIECES.map((_p, i) => (seDerived ? seDerived[i] : NaN));
  const price = proposePrices(values, DAMP);
  const pieceRows = PIECES.map((p, i) => ({
    axis: p.axis, id: p.id, currentCost: p.currentCost,
    value: values[i], se: valueSe[i], significant: Math.abs(values[i]) > 2 * valueSe[i],
    negative: Number.isFinite(valueSe[i]) && values[i] < -2 * valueSe[i],
    proposedCost: price.costs[i], targetCost: price.targets[i],
    delta: price.targets[i] - p.currentCost,
    perPoint: values[i] / p.currentCost,
    baseline: p.axis === 'delivery' && p.id === baseDelivery,
    kits: p.axis === 'delivery' ? league.cover.delivery[p.id] : p.axis === 'effect' ? league.cover.effect[p.id]
      : kits.filter((kit) => kit.some((s) => s.channel === p.id)).length,
    pilotNote: pilotDependent(p.feature),
  })).sort((a, b) => b.value - a.value);

  /*
   * THE HEADLINE — value per point, and how far apart those numbers are.
   *
   * Flat prices mean a point of budget buys the same win rate wherever it is
   * spent, so the quantity that says "priced" is the SPREAD of value ÷ cost,
   * not corr(cost, value): the correlation was 0.79–0.96 through four passes
   * in which a point on damage bought 3 pp and a point on root bought −3.6.
   * The effect block is the gate (`tools/checkprices.mjs` reads it) because
   * effects are what a kit really chooses between; the all-thirty spread is
   * printed beside it, and carries the delivery block's arbitrary level, so it
   * is the looser of the two readings.
   */
  const sdOf = (xs) => {
    const v = xs.filter(Number.isFinite);
    if (v.length < 2) return { mean: NaN, sd: NaN, n: v.length, min: NaN, max: NaN };
    const m = v.reduce((a, b) => a + b, 0) / v.length;
    return {
      mean: m, n: v.length, min: Math.min(...v), max: Math.max(...v),
      sd: Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1)),
    };
  };
  const perPointEffects = sdOf(pieceRows.filter((p) => p.axis === 'effect').map((p) => p.perPoint));
  const perPointAll = sdOf(pieceRows.map((p) => p.perPoint));
  const corrCostValue = pearson(pieceRows.map((p) => p.currentCost), pieceRows.map((p) => p.value));
  const corrCostValueEffects = pearson(
    pieceRows.filter((p) => p.axis === 'effect').map((p) => p.currentCost),
    pieceRows.filter((p) => p.axis === 'effect').map((p) => p.value),
  );
  const verdict = verdictOf(pieceRows);

  const pairRows = pairs.map((pr) => {
    const j = names.indexOf(`p:${pr}`);
    return { pair: pr, kits: pairCount.get(pr), coef: fit.beta[j] * 100, se: se[j] * 100, significant: Math.abs(fit.beta[j]) > 2 * se[j] };
  }).sort((a, b) => Math.abs(b.coef) - Math.abs(a.coef));
  const sigPairs = pairRows.filter((p) => p.significant);

  /* ── Nash-style summary ── */
  const ranking = kits.map((kit, k) => ({ k, label: kitLabel(kit), cost: kit.reduce((a, s) => a + costOf(s), 0), score: scoreOf(k), ...stat[k] }))
    .filter((r) => Number.isFinite(r.score)).sort((a, b) => b.score - a.score || b.games - a.games);
  const top10 = ranking.slice(0, 10);
  const decile = ranking.slice(0, Math.max(1, Math.round(ranking.length / 10)));
  const decDeliveries = new Map(), decEffects = new Map();
  for (const r of decile) for (const s of kits[r.k]) {
    decDeliveries.set(s.delivery, (decDeliveries.get(s.delivery) || 0) + 1);
    for (const e of s.effects) decEffects.set(e, (decEffects.get(e) || 0) + 1);
  }
  const share = (m) => { const tot = [...m.values()].reduce((a, b) => a + b, 0); const [id, c] = [...m.entries()].sort((a, b) => b[1] - a[1])[0] || ['-', 0]; return { id, share: tot ? c / tot : 0 }; };
  const nash = {
    decileKits: decile.length,
    distinctDeliveries: decDeliveries.size, distinctEffects: decEffects.size,
    topDelivery: share(decDeliveries), topEffect: share(decEffects),
    monoculture: decDeliveries.size < DELIVERY_IDS.length / 2 || decEffects.size < EFFECT_IDS.length / 2
      || share(decDeliveries).share > 0.5 || share(decEffects).share > 0.5,
  };

  const runtimeSec = (Date.now() - t0) / 1000;

  /* ── report ── */
  const ls = health.lengths.slice().sort((a, b) => a - b);
  const quant = (f) => (ls.length ? ls[Math.min(ls.length - 1, Math.floor(f * ls.length))] : NaN);
  const burnt = ls.filter((x) => x > SUDDEN_DEATH_AT).length;
  const decidedShare = Object.entries(health.decided).sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k} ${pct(health.paced ? v / health.paced : NaN, 0)}`).join(' · ');

  const L = [];
  L.push(`# atombalance — seed ${SEED}`);
  L.push('');
  L.push(`## ${verdict.converged ? '**CONVERGED**' : '**NOT CONVERGED**'}${DRY_RUN ? ' (dry run — advisory)' : ''}`);
  L.push('');
  L.push(`Largest price move proposed: **${verdict.maxDelta} point${verdict.maxDelta === 1 ? '' : 's'}**`
    + ` (settled means ≤ 1). Pieces significantly negative: **${verdict.negatives.length}** (settled means 0).`);
  L.push('');
  if (verdict.movers.length) {
    L.push(`Still moving: ${verdict.movers.slice(0, 12).map((p) => `${p.id} ${p.currentCost}→${p.targetCost}`).join(', ')}`
      + `${verdict.movers.length > 12 ? `, and ${verdict.movers.length - 12} more` : ''}.`);
    L.push('');
  }
  if (verdict.negatives.length) {
    L.push(`Traps — a point spent here loses fights, and the floor price of 1 cannot fix that: `
      + `${verdict.negatives.map((p) => `**${p.id}** (${signed(p.value, 1)} ± ${fmt(p.se, 1)} at cost ${p.currentCost})`).join(', ')}.`
      + ` These go back to the magnitudes, not to the price table.`);
    L.push('');
  }
  L.push(`**Value per point — ${fmt(perPointEffects.mean, 2)} ± ${fmt(perPointEffects.sd, 2)} pp/pt across the ${perPointEffects.n} effects`
    + ` (range ${signed(perPointEffects.min, 2)} … ${signed(perPointEffects.max, 2)}).**`
    + ` Across all ${perPointAll.n} pieces: ${fmt(perPointAll.mean, 2)} ± ${fmt(perPointAll.sd, 2)}.`
    + ` This is the founder's flatness quantity: a point of budget should buy the same win rate wherever it is spent,`
    + ` so the number to drive down is the **sd**.`);
  L.push('');
  L.push(`Secondary — corr(cost, value) = ${fmt(corrCostValue, 3)} over all pieces, ${fmt(corrCostValueEffects, 3)} over effects.`
    + ` That is the price ORDER, not the price RATE; it can sit at 0.95 while a point on one piece buys three times what it buys on another.`);
  L.push('');
  L.push(`Regression of kit win rate on grammar pieces. ${kits.length} random legal kits, ${health.matches} matches`
    + ` (${GAMES} per kit as the home side, mirrored pairings, same pilot on both sides), pilots: ${PILOTS.join(', ')}.`
    + ` Cooldown: ${COOLDOWN === null ? "the registry's own — the schedule the game is played on" : `${COOLDOWN} s fixed for every ability`}${REAL ? ', product path' : ''}.`
    + ` Ridge λ=${RIDGE}, ${BOOT} bootstrap resamples. Runtime ${runtimeSec.toFixed(0)} s (league ${leagueSec.toFixed(0)} s on ${POOL_SIZE} workers).`);
  L.push('');
  L.push('Command: `node tools/atombalance.mjs ' + process.argv.slice(2).join(' ') + '`');
  L.push('');
  L.push('## Population health — the world these prices were measured in');
  L.push('');
  L.push('A price found in fights the arena finished is a price for stalling, and a price found on kits whose slots never'
    + ' fired is a price for the slots that did. These rows say whether this pass measured fights or waits.');
  L.push('');
  L.push('| | | contract (`docs/COMBAT.md` §3) |');
  L.push('|---|---|---|');
  L.push(`| fight length, mean / median | ${fmt(health.timed ? health.seconds / health.timed : NaN, 1)} s / ${fmt(quant(0.5), 1)} s | median 20–35 s |`);
  L.push(`| reaching the burn clock (${SUDDEN_DEATH_AT} s) | ${burnt} of ${ls.length} (${pct(ls.length ? burnt / ls.length : NaN)}) | ≤ 35% |`);
  L.push(`| decided by | ${decidedShare || 'n/a'} | arena ≤ 20% |`);
  L.push(`| dead slots (a paid ability that never fired) | ${health.deadSlots} of ${health.slots} (${pct(health.slots ? health.deadSlots / health.slots : NaN)}) | ≤ 2% |`);
  L.push(`| dodges per fight | ${fmt(health.paced ? health.dodges / health.paced : NaN, 2)} | ≥ 1 |`);
  L.push(`| harmless kits redrawn | ${league.harmlessRejected} | — |`);
  L.push('');
  L.push('Every sampled kit carries at least one damage or burn atom, asserted here and not merely inherited from the'
    + ' grammar\'s L2 rule: a kit of three durations cannot take a hit point off anybody, so its league game would be'
    + ` decided by who was ahead at the bell. ${league.harmlessRejected} such draws were rejected and re-drawn rather than`
    + ` scored${league.harmlessRejected === 0 ? ' (0 is the expected number while L2 stands)' : ''}.`);
  L.push('');
  L.push('"Decided by" is what took the last hit point — an opponent (`hit`), an ability\'s burn (`fire`), or the arena\'s'
    + ' own burn (`arena`); the sim logs all three as `kill`, and they are separated by matching the loser\'s `death` line'
    + ' against a `burned` / `burnedOut` line on the same tick. A dodge is an i-frame `evade` or a ground shape passing'
    + ' under an airborne body. A dead slot is an ability that never fired once; a kit is three abilities and all three are paid.');
  L.push('');
  L.push('## Instrument health');
  L.push('');
  L.push(`| | |\n|---|---|`);
  L.push(`| matches scored | ${ok} of ${health.matches} (${health.errors} errors) |`);
  L.push(`| draws | ${health.draws} (${pct(ok ? health.draws / ok : NaN)}) |`);
  L.push(`| side balance (blue : orange wins) | ${health.blueWins} : ${health.orangeWins} — mirrored pairings, so a lopsided ratio is a side bias of the arena, not of a kit |`);
  L.push(`| mean match length | ${fmt(health.timed ? health.seconds / health.timed : NaN, 1)} s |`);
  /* Quartiles here; the headline pace numbers are in Population health above. */
  L.push(`| match length quartiles | p25 ${fmt(quant(0.25), 1)} s · p50 ${fmt(quant(0.5), 1)} s · p75 ${fmt(quant(0.75), 1)} s |`);
  L.push(`| fights outliving the burn clock (${SUDDEN_DEATH_AT} s) | ${burnt} of ${ls.length} (${pct(ls.length ? burnt / ls.length : NaN)}) |`);
  L.push(`| endings | ${Object.entries(health.reasons).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ')} |`);
  L.push(`| brain faults (must be 0) | ${health.faults} |`);
  L.push(`| sides with zero ability uses | ${health.idleSides} of ${ok * 2} |`);
  L.push(`| mean uses / hits per side per match | ${fmt(ok ? health.usesPerSide / (ok * 2) : NaN, 1)} / ${fmt(ok ? health.hitsPerSide / (ok * 2) : NaN, 1)} |`);
  L.push(`| pilots actually used (sides) | ${Object.entries(health.pilotsUsed).map(([k, v]) => `${k} ${v}`).join(', ') || 'n/a'} |`);
  if (Object.keys(health.pilotMissing).length) L.push(`| **pilot files missing → stub stood in** | ${Object.entries(health.pilotMissing).map(([k, v]) => `${k} (${v} sides)`).join(', ')} |`);
  if (Object.keys(health.pilotBroken).length) L.push(`| **pilot files failed to compile → stub stood in** | ${Object.entries(health.pilotBroken).map(([k, v]) => `${k} (${v} sides)`).join(', ')} |`);
  if (health.errors) L.push(`| error messages | ${Object.entries(health.errorMessages).map(([k, v]) => `${k} ×${v}`).join('; ')} |`);
  L.push(`| coverage | ${league.uncovered.length ? 'NOT met: ' + league.uncovered.map((u) => u.id).join(', ') : `every effect and delivery in ≥ ${MIN_EACH} kits`} (${league.forced} kits coverage-forced) |`);
  L.push(`| features | ${names.length} (+ intercept): ${DELIVERY_IDS.length - 1} deliveries (\`${baseDelivery}\` dropped as the baseline —`
    + ` the nine counts always sum to 3), ${EFFECT_IDS.length} effects, ${CHANNEL_IDS.length} channels, n2, n3,`
    + ` ${pairs.length} delivery×effect pairs seen in ≥ ${MIN_PAIR_KITS} kits. **No \`cost\` column** — it is an exact sum of the others (balance review H3) |`);
  L.push(`| fit | R² ${fmt(fit.r2)} in-sample, **${fmt(cv)} cross-validated** (10-fold; ${rows.length} rows vs ${names.length} features${names.length >= rows.length ? ' — MORE FEATURES THAN ROWS, raise --n' : ''}); cost alone: slope ${signed(costOnly.beta[0] * 100, 2)} pp per point, R² ${fmt(costOnly.r2)} |`);
  L.push(`| score spread across kits | mean ${fmt(y.reduce((a, b) => a + b, 0) / y.length)}, sd ${fmt(Math.sqrt(y.reduce((a, b) => a + (b - 0.5) ** 2, 0) / y.length))} |`);
  L.push('');
  L.push('Reading the numbers: `value` is the change in a kit\'s win rate, in percentage points, from carrying one more unit of the piece'
    + ' (one more ability with that delivery / effect / channel), everything else held. Effect and channel values are absolute.'
    + ` Delivery counts always sum to 3, so the delivery block is identified only up to a common level: \`${baseDelivery}\` is the`
    + ' baseline column and the nine delivery values are re-centred to mean zero, with standard errors bootstrapped through the'
    + ' re-centring. `target` = round(clamp(k·value, ' + MIN_COST + ', ' + MAX_COST + ')) with one k'
    + ` (${fmt(price.k, 3)} points per pp) chosen so the costs sum to the current sum (${price.target}; achieved ${price.sum})`
    + `${DAMP < 1 ? `; \`proposed\` moves only ${fmt(DAMP, 2)} of the way there (--damp), and the verdict is judged on \`target\`` : ' — with --damp=1, `proposed` and `target` are the same number'}.`
    + ' A ● in `neg` marks a piece whose value is below −2·se: a trap, and no price in [1, 10] fixes it.');
  L.push('');
  L.push('## Pieces — value and proposed cost');
  L.push('');
  L.push('| axis | piece | kits | cost now | value (pp/unit) | ± se | sig | neg | target | proposed | Δ | value per point now | pilot note |');
  L.push('|---|---|---:|---:|---:|---:|:-:|:-:|---:|---:|---:|---:|---|');
  for (const p of pieceRows) {
    L.push(`| ${p.axis} | ${p.id}${p.baseline ? ' *(baseline)*' : ''} | ${p.kits} | ${p.currentCost} | ${signed(p.value, 2)} | ${fmt(p.se, 2)}`
      + ` | ${p.significant ? '●' : ''} | ${p.negative ? '●' : ''} | ${p.targetCost} | ${p.proposedCost} | ${signed(p.delta, 0)} | ${signed(p.perPoint, 2)} | ${p.pilotNote || ''} |`);
  }
  L.push('');
  L.push('## Combination features');
  L.push('');
  for (const nm of ['n2', 'n3']) {
    const c = coefs.find((x) => x.name === nm);
    L.push(`- \`${nm}\`: ${signed(c.coef * 100, 2)} pp per unit ± ${fmt(c.se * 100, 2)}${Math.abs(c.coef) > 2 * c.se ? ' (significant)' : ''}`);
  }
  L.push(`- kit cost, fitted alone (it is NOT a column of the main design): ${signed(costOnly.beta[0] * 100, 2)} pp per point, R² ${fmt(costOnly.r2)}`);
  L.push(`- intercept: ${fmt(fit.intercept * 100, 1)} ± ${fmt(seIntercept * 100, 1)} pp`);
  L.push('');
  L.push(`## Delivery × effect interactions (${sigPairs.length} significant of ${pairRows.length})`);
  L.push('');
  if (sigPairs.length) {
    L.push('| pair | kits | coef (pp) | ± se |');
    L.push('|---|---:|---:|---:|');
    for (const p of sigPairs) L.push(`| ${p.pair} | ${p.kits} | ${signed(p.coef, 2)} | ${fmt(p.se, 2)} |`);
  } else L.push('No pair clears |coef| > 2·se at this sample size.');
  L.push('');
  L.push('## Pilot agreement');
  L.push('');
  if (pilotAgreement.length) {
    L.push('| pilot A | pilot B | kits in common | r (per-kit score) |');
    L.push('|---|---|---:|---:|');
    for (const a of pilotAgreement) L.push(`| ${a.a} | ${a.b} | ${a.kits} | ${fmt(a.r, 3)} |`);
    L.push('');
    for (const [p, f] of Object.entries(pilotFits)) L.push(`- ${p}: ${f.n} kits, R² ${fmt(f.r2)}`);
    const dep = pieceRows.filter((p) => p.pilotNote);
    L.push('');
    L.push(dep.length ? `Pilot-dependent pieces: ${dep.map((p) => `**${p.id}** (${p.pilotNote})`).join('; ')}.` : 'No piece is valued by one pilot only.');
  } else L.push(`One pilot (${PILOTS[0]}${Object.keys(health.pilotMissing).length ? ', with the stub standing in for missing files' : ''}): agreement cannot be measured. Every value above is that pilot's value.`);
  L.push('');
  L.push('## Nash-style summary');
  L.push('');
  L.push('| # | score | games | W/D/L | cost | kit |');
  L.push('|---:|---:|---:|---|---:|---|');
  top10.forEach((r, i) => L.push(`| ${i + 1} | ${pct(r.score)} | ${r.games} | ${r.wins}/${r.draws}/${r.losses} | ${r.cost} | ${r.label} |`));
  L.push('');
  L.push(`Top 10% (${nash.decileKits} kits) use ${nash.distinctDeliveries} of ${DELIVERY_IDS.length} deliveries and ${nash.distinctEffects} of ${EFFECT_IDS.length} effects;`
    + ` most common delivery ${nash.topDelivery.id} (${pct(nash.topDelivery.share)} of their ability slots), most common effect ${nash.topEffect.id} (${pct(nash.topEffect.share)} of their effect slots).`
    + ` Monoculture flag: **${nash.monoculture ? 'YES' : 'no'}** (raised when the decile uses under half the deliveries or effects, or one piece holds over half the slots).`);
  L.push('');
  L.push(`JSON with every row: \`${OUT_JSON.replace(ROOT + '/', '')}\``);
  L.push('');

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, L.join('\n'));
  writeFileSync(OUT_JSON, JSON.stringify({
    meta: {
      seed: SEED, n: N, kits: kits.length, games: GAMES, pilots: PILOTS, cooldown: COOLDOWN, real: REAL, ridge: RIDGE, boot: BOOT, minEach: MIN_EACH,
      matches: health.matches, poolSize: POOL_SIZE, runtimeSec, leagueSec, argv: process.argv.slice(2), generated: new Date().toISOString(),
    },
    health, coverage: league.cover, uncovered: league.uncovered,
    harmlessRejected: league.harmlessRejected,
    /* The stop rule, machine-readable: `tools/checkprices.mjs` binds to the
       newest of these files and reads `verdict` and `headline`. */
    verdict: {
      converged: verdict.converged, maxDelta: verdict.maxDelta,
      movers: verdict.movers.map((p) => ({ id: p.id, axis: p.axis, currentCost: p.currentCost, targetCost: p.targetCost })),
      negatives: verdict.negatives.map((p) => ({ id: p.id, axis: p.axis, value: p.value, se: p.se, currentCost: p.currentCost })),
      exitCode: verdict.converged || DRY_RUN ? 0 : 2, dry: DRY_RUN,
    },
    headline: {
      perPointEffects, perPointAll, corrCostValue, corrCostValueEffects,
      note: 'value per point = value (pp per unit) / current cost; sd across pieces is the flatness quantity',
    },
    population: {
      lengthMean: health.timed ? health.seconds / health.timed : null,
      lengthMedian: Number.isFinite(quant(0.5)) ? quant(0.5) : null,
      burnClock: ls.length ? burnt / ls.length : null,
      decided: health.decided, decidedOf: health.paced,
      deadSlots: health.deadSlots, slots: health.slots,
      deadSlotShare: health.slots ? health.deadSlots / health.slots : null,
      dodgesPerFight: health.paced ? health.dodges / health.paced : null,
    },
    fit: { r2: fit.r2, cvR2: cv, rows: rows.length, features: names.length, intercept: fit.intercept, seIntercept, costOnly: { slope: costOnly.beta[0], r2: costOnly.r2 }, baseDelivery },
    features: names,
    coefficients: coefs,
    pieces: pieceRows,
    pricing: { k: price.k, target: price.target, sum: price.sum, min: MIN_COST, max: MAX_COST, damp: DAMP },
    pairs: pairRows,
    pilotAgreement, pilotFits: Object.fromEntries(Object.entries(pilotFits).map(([p, f]) => [p, { n: f.n, r2: f.r2, coef: Array.from(f.coef), se: Array.from(f.se) }])),
    nash: { ...nash, top10: top10.map((r) => ({ label: r.label, score: r.score, games: r.games, wins: r.wins, draws: r.draws, losses: r.losses, cost: r.cost })) },
    kits: kits.map((kit, k) => ({ id: k, label: kitLabel(kit), kit, cost: kit.reduce((a, s) => a + costOf(s), 0), score: scoreOf(k), ...stat[k] })),
  }, null, 1));

  /* console summary — the verdict first, because it is the answer */
  console.log(`\n  ${verdict.converged ? 'CONVERGED' : 'NOT CONVERGED'}${DRY_RUN ? ' (dry run — advisory, exit 0)' : ''}`
    + ` · largest proposed move ${verdict.maxDelta} pt (settled ≤ 1) · ${verdict.negatives.length} piece(s) significantly negative (settled 0)`);
  console.log(`  value per point: ${fmt(perPointEffects.mean, 2)} ± ${fmt(perPointEffects.sd, 2)} pp/pt over ${perPointEffects.n} effects`
    + ` (all ${perPointAll.n} pieces ${fmt(perPointAll.mean, 2)} ± ${fmt(perPointAll.sd, 2)}) · corr(cost, value) ${fmt(corrCostValue, 3)}`);
  if (verdict.negatives.length) console.log(`  traps: ${verdict.negatives.map((p) => `${p.id} ${signed(p.value, 1)}±${fmt(p.se, 1)} @${p.currentCost}`).join(', ')}`);
  console.log(`  population: ${fmt(health.timed ? health.seconds / health.timed : NaN, 1)} s mean / ${fmt(quant(0.5), 1)} s median`
    + ` · burn clock ${pct(ls.length ? burnt / ls.length : NaN, 0)} · decided ${decidedShare || 'n/a'}`
    + ` · dead slots ${pct(health.slots ? health.deadSlots / health.slots : NaN, 0)} · dodges ${fmt(health.paced ? health.dodges / health.paced : NaN, 2)}/fight`
    + ` · ${league.harmlessRejected} harmless kits redrawn`);
  console.log(`\n  scored ${ok}/${health.matches} · draws ${pct(ok ? health.draws / ok : NaN)} · faults ${health.faults} · R² ${fmt(fit.r2)} in-sample, ${fmt(cv)} cross-validated (${rows.length} rows, ${names.length} features) · cost-only R² ${fmt(costOnly.r2)}`);
  if (names.length >= rows.length) console.log('  WARNING: more features than kits — the coefficients are the ridge penalty talking; raise --n');
  if (Object.keys(health.pilotMissing).length) console.log(`  stub stood in for: ${Object.entries(health.pilotMissing).map(([k, v]) => `${k} (${v} sides)`).join(', ')}`);
  console.log('\n  piece            cost  value(pp)   ±se    target  proposed');
  for (const p of pieceRows) console.log(`  ${(p.axis[0] + ':' + p.id).padEnd(16)} ${String(p.currentCost).padStart(4)}  ${signed(p.value, 2).padStart(8)}  ${fmt(p.se, 2).padStart(5)}  ${String(p.targetCost).padStart(6)}  ${String(p.proposedCost).padStart(8)}${p.negative ? '  TRAP' : p.significant ? '  ●' : ''}`);
  console.log(`\n  k = ${fmt(price.k, 3)} points per pp · proposed sum ${price.sum} vs current ${price.target}`);
  console.log(`  significant pairs: ${sigPairs.length ? sigPairs.slice(0, 8).map((p) => `${p.pair} ${signed(p.coef, 1)}`).join(', ') : 'none'}`);
  for (const a of pilotAgreement) console.log(`  agreement ${a.a} ~ ${a.b}: r = ${fmt(a.r, 3)} over ${a.kits} kits`);
  console.log(`  top decile: ${nash.distinctDeliveries}/${DELIVERY_IDS.length} deliveries, ${nash.distinctEffects}/${EFFECT_IDS.length} effects · monoculture ${nash.monoculture ? 'YES' : 'no'}`);
  console.log(`\n  report: ${OUT}\n  json:   ${OUT_JSON}\n  runtime ${runtimeSec.toFixed(0)} s`);

  /*
   * EXIT STATUS IS THE VERDICT. A pass that leaves a trap on the board or
   * still wants to move a price by two points is not a finished pass, and a
   * caller that only reads stdout used to record it as one (`DESIGN.md` D190
   * recorded a red gate as done). A --dry run is too small to judge, so it
   * says so and exits 0.
   */
  if (!DRY_RUN && !verdict.converged) process.exitCode = 2;
}

main().catch((err) => { console.error(err); closePool(); process.exit(1); });
