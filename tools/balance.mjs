#!/usr/bin/env node
/**
 * Find the constants, rather than argue about them.
 *
 *   node tools/balance.mjs --samples=80 --rounds=40 --workers=6
 *
 * ── what is being optimised ─────────────────────────────────────────────────
 *
 * Not "fairness" alone. A 50/50 win rate is trivially achievable by making both
 * fighters harmless, and a fight nobody can lose is not a fight. So a candidate
 * is scored against several things at once, and the weights say which of them
 * the concept is actually for:
 *
 *   fairness     |winRate - 0.5|         the fight must be genuinely uncertain
 *   spread       per-matchup imbalance   and uncertain in every matchup, not on average
 *   pacing       match length in a band  long enough to develop, short enough to watch
 *   shape        melee uptime in a band  the chase must be a CHASE, not a hug
 *   decisiveness few clock decisions     a timeout is an anticlimax
 *
 * ── and against whom ────────────────────────────────────────────────────────
 *
 * Every candidate is measured twice: once with the generated brains and once
 * with the hand-written stubs. Tuning against the generated pair alone
 * overfits to two specific programs — those brains hard-code numbers they read
 * in their own prompt, so moving a number moves their behaviour in ways that
 * flatter or punish the candidate for reasons that will not survive the next
 * generation. The stubs are dumb and stable, which is exactly what a control
 * is for. A candidate has to be good for both.
 */

import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function arg(name, dflt) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : dflt;
}
const SAMPLES = Number(arg('samples', 60));
const ROUNDS = Number(arg('rounds', 40));
/**
 * Which brains a candidate is scored against.
 *
 * A grid, not a pair: the first sweep tuned against one generated pair, and
 * regenerating the brains afterwards moved that same matchup from 52/48 to
 * 20/80, because the constants had absorbed the relative strength of two
 * particular programs.
 *
 * `--gen` is the population being fitted; `--gen2`, if given, is a second one
 * and the candidate is scored on the WORSE of the two.
 *
 * Use the second only for populations generated against the SAME constants.
 * The minimax was tried across populations that were not, and it measured the
 * wrong thing: one of them had been told a different blink cooldown, so half
 * the objective was "how well does a brain do under rules it was never given",
 * which is a real effect (`tools/checkstale.mjs` reports it) and not the one
 * being tuned. Fit against a population that was told the truth, then generate
 * a fresh one against the result and measure it out of sample.
 */
const GEN_TAGS = String(arg('gen', 'i1,i2,i3,i4,i5,i6'));
const GEN_TAGS_B = arg('gen2', null) === null ? null : String(arg('gen2'));
const WORKERS = Number(arg('workers', 6));
const SEED = Number(arg('seed', 7));

/**
 * The search space. Each entry is a list; a candidate picks one from each.
 *
 * ── ТЕЛО ВЫШЛО ИЗ ПРОСТРАНСТВА ПОИСКА, И ЭТО НАДО ЧИТАТЬ БУКВАЛЬНО ─────────
 *
 * Здесь стояли четыре оси тела: `fighters.gorilla.maxSpeed`,
 * `fighters.octopus.maxSpeed` и два здоровья. Таблицы `FIGHTERS` больше нет —
 * тело принадлежит существу, — и оставить эти строки было нельзя даже как
 * мёртвые: `tune()` в `config.js` падает с «tuning names unknown fighters.
 * gorilla» на первом же кандидате, то есть весь прогон умирал бы на входе.
 *
 * Заменить их на `build.<ось>.def` — соблазн, и он не работает. Замерено:
 *   1. `DEFAULT_BUILD` собирается из `a.def` РАНЬШЕ вызова `tune()` в конце
 *      `config.js`, поэтому оверлей его не двигает: при `build.hp.def = 300`
 *      печатается прежние 210.
 *   2. Матч без `builds` берёт именно `DEFAULT_BUILD` (`sim.js`,
 *      `makeFighter(..., build || DEFAULT_BUILD)`), а `tools/tournament.mjs`
 *      никаких `builds` не передаёт. Значит ось двигала бы файл тюнинга и не
 *      двигала бы бой — худший вид пустого рычага: поиск отчитывается о
 *      находке, мир не меняется.
 *   3. Оси `min`/`max`/`per` до боя доходят, но не как оси: цена
 *      `DEFAULT_BUILD` ровно равна `BUILD_BUDGET`, поэтому любое их движение
 *      вверх включает пропорциональное СЖАТИЕ всех шести осей разом. Это не
 *      координата, это общий масштаб, и координатный спуск по нему ищет не то.
 *
 * Поэтому тело здесь не ищется вовсе, а поиск честно сузился до умений. Что
 * при этом осталось от `fairness`: обе стороны выходят в ОДНОМ теле, и
 * асимметрия боя целиком в эталонных наборах (луч/блинк против удара/рывка).
 * Это и есть то, что теперь мерит винрейт, — раньше он мерил ещё и разницу
 * тел, которой больше нет.
 *
 * Вернуть тело в поиск можно ровно одним способом: научить `tournament.mjs`
 * принимать `builds` и искать по НИМ, а не по осям. Это следующий шаг, и он
 * не делается молча внутри перебора констант.
 */
const SPACE = {
  'skills.blink.cooldown': [3.0, 3.8, 4.6],
  'skills.blink.distance': [6.5, 7.5],
  'skills.charge.cooldown': [3.4, 4.0, 4.8],
  'skills.charge.damage': [30, 34, 38],
  'skills.charge.dashSeconds': [0.8, 0.95],
  'skills.laser.damage': [23, 26, 29],
  'skills.laser.cooldown': [2.0, 2.2, 2.5],
  'skills.laser.windup': [0.55, 0.65, 0.75],
  'skills.laser.moveScale': [0.25, 0.35, 0.45],
  'skills.smash.damage': [32, 36, 40],
  'skills.smash.cooldown': [1.1, 1.3],
  'skills.smash.range': [2.9, 3.3],
  'skills.jump.cooldown': [2.8, 3.6],
};

/* A local PRNG so a sweep is repeatable and two runs can be compared. */
let s = SEED >>> 0;
const rnd = () => {
  s = (s + 0x6d2b79f5) >>> 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = (xs) => xs[Math.floor(rnd() * xs.length)];

function expand(flat) {
  const out = {};
  for (const [path, v] of Object.entries(flat)) {
    const [section, key, field] = path.split('.');
    out[section] ??= {};
    out[section][key] ??= {};
    out[section][key][field] = v;
  }
  return out;
}

const dir = mkdtempSync(join(tmpdir(), 'airena-balance-'));

/** A candidate with every axis named explicitly, so descent has something to move. */
const DEFAULTS = JSON.parse(
  (await import('node:child_process')).execFileSync('node', ['-e',
    `import('${resolve(ROOT, 'src/core/config.js').replace(/\\/g, '/')}').then(c=>{`
    + `const o={};`
    + `for(const [k,v] of Object.entries({build:c.BUILD_AXES,skills:c.SKILLS}))`
    + ` for(const [n,rec] of Object.entries(v))`
    + `  for(const [f,val] of Object.entries(rec)) o[k+'.'+n+'.'+f]=val;`
    + `console.log(JSON.stringify(o));})`,
  ], { cwd: ROOT, env: { ...process.env, AIRENA_TUNING: join(dir, 'none.json') } }).toString(),
);
/*
 * Every ladder must contain the committed value.
 *
 * Candidate zero is the current constants and coordinate descent starts from
 * whichever candidate scored best, then walks one axis at a time through that
 * axis's list. If the committed value is not ON the list, the search cannot
 * return to it after stepping away — the baseline it is supposed to beat is
 * unreachable, and a pass that finds nothing better still reports a move. Five
 * of the seventeen axes were in that state before this pass — octopus.hp 155,
 * octopus.maxSpeed 4.85, blink.cooldown 3.9, laser.damage 27, smash.damage 35 —
 * and four still are, since only the speed ladder was widened by hand. Patching
 * it in from `DEFAULTS` rather than maintaining the lists means a constant can
 * move without this going quietly untrue again.
 */
for (const [k, xs] of Object.entries(SPACE)) {
  if (typeof DEFAULTS[k] === 'number' && !xs.includes(DEFAULTS[k])) {
    SPACE[k] = [...xs, DEFAULTS[k]].sort((x, y) => x - y);
  }
}

const fill = (flat) => {
  const out = {};
  for (const k of Object.keys(SPACE)) out[k] = k in flat ? flat[k] : DEFAULTS[k];
  return out;
};

async function evaluate(flat, i) {
  const file = join(dir, `t${i}.json`);
  writeFileSync(file, JSON.stringify(expand(flat)));
  const env = { ...process.env, AIRENA_TUNING: file };
  const one = async (tags) => {
    const { stdout } = await run(
      'node',
      ['tools/tournament.mjs', `--rounds=${ROUNDS}`, `--tags=${tags}`, '--json'],
      { cwd: ROOT, env, maxBuffer: 64 * 1024 * 1024 },
    );
    return JSON.parse(stdout);
  };
  const [a, b] = await Promise.all([one(GEN_TAGS), GEN_TAGS_B ? one(GEN_TAGS_B) : Promise.resolve(null)]);
  const sa = score(a);
  if (!b) return { flat, gen: a, gen2: a, score: { ...sa, a: sa.total, b: sa.total }, file };
  const sb = score(b);
  const worse = sa.total >= sb.total ? sa : sb;
  return { flat, gen: a, gen2: b, score: { ...worse, a: sa.total, b: sb.total }, file };
}

/**
 * Lower is better. Every term is normalised so the weights below are the only
 * place a preference is expressed.
 */
function score(gen) {
  const band = (v, lo, hi, soft) => {
    if (v >= lo && v <= hi) return 0;
    return (v < lo ? lo - v : v - hi) / soft;
  };
  const hr = gen.hitRate || {};
  const g = {
    fairness: Math.abs(gen.mechanicsOctWinRate - 0.5) * 2,
    /*
     * Fairness alone reads a MEAN over the 36-cell grid, and a mean cannot tell
     * an even game from a rock-paper-scissors one: eighteen 0% cells and
     * eighteen 100% cells average to a flawless 50% and score a perfect
     * fairness term. That is the extreme case; brains-l at 25 rounds is the
     * ordinary one, scoring 0.06 on fairness under the current constants with a
     * median cell at 48% and cells still running from 4% to 100%. Roll the two
     * top speeds back to the split pair they replaced and fairness scores 0.26
     * while this term barely moves, 0.50 to 0.46 — the mean can be fixed while
     * every individual matchup stays as decided as it was.
     * `meanCellImbalance` is the mean distance of a cell from even, so this
     * term is 0 only when every individual matchup is a coin flip.
     */
    spread: gen.meanCellImbalance * 2,
    pacing: band(gen.meanSeconds, 20, 40, 10),
    /*
     * A chase, not a hug: the two of them should not spend the match touching.
     *
     * Banded on the WORST cell, for the same reason `spread` exists. brains-l's
     * mean melee uptime is 20.6% under the current constants and its worst cell
     * is 43.6% — just over the ceiling, for 0.11 of penalty. The band was set
     * when a mean of 40% was hiding a worst cell of 87%: one matchup that was a
     * wrestle from the opening bell, invisible to every mean in this function.
     */
    shape: band(gen.maxMeleeUptime, 0.15, 0.42, 0.15),
    decisive: gen.meanTimeoutRate / 0.15,
    /*
     * A damaging skill that lands one time in twenty is not a tactical choice,
     * it is dead weight. An earlier sweep produced exactly that — a charge with
     * a 6% hit rate — and no fairness or pacing term noticed, because a useless
     * skill costs its owner nothing but a cooldown it was not going to spend.
     *
     * The ceiling matters as much as the floor. A beam that lands 95% of the
     * time is not an aim, it is a guarantee, and it leaves the other fighter
     * with no reply to a cast except to already be behind a wall.
     */
    dead: ['laser', 'smash', 'charge'].reduce((a, k) => a + (hr[k] == null ? 0 : Math.max(0, 0.15 - hr[k]) / 0.15), 0),
    certain: ['laser', 'smash'].reduce((a, k) => a + (hr[k] == null ? 0 : Math.max(0, hr[k] - 0.85) / 0.15), 0),
  };
  const w = { fairness: 3.0, spread: 2.0, pacing: 1.1, shape: 1.4, decisive: 0.8, dead: 1.2, certain: 0.9 };
  let total = 0;
  /*
   * Half and half. Weighting the generated pair more would tune the CONSTANTS
   * to compensate for the relative quality of two particular programs, which
   * is not a property of the game and does not survive the next generation.
   */
  for (const k of Object.keys(w)) total += w[k] * g[k];
  return { total, gen: g };
}

let uid = 0;
async function evalBatch(flats, label) {
  const out = [];
  let next = 0;
  await Promise.all(Array.from({ length: WORKERS }, async () => {
    for (;;) {
      const i = next++;
      if (i >= flats.length) return;
      const tag = uid++;
      try {
        const r = await evaluate(flats[i], tag);
        out.push(r);
        const h = r.gen.hitRate;
        process.stdout.write(`  ${label}${String(i).padStart(3)}  worst ${r.score.total.toFixed(3)}  oct ${(r.gen.mechanicsOctWinRate * 100).toFixed(0)}%/${(r.gen2.mechanicsOctWinRate * 100).toFixed(0)}%  ${r.gen.meanSeconds.toFixed(0)}s  melee ${(r.gen.meanMeleeUptime * 100).toFixed(0)}%  hit L${(h.laser * 100).toFixed(0)}/S${(h.smash * 100).toFixed(0)}/C${(h.charge * 100).toFixed(0)}\n`);
      } catch (err) {
        process.stdout.write(`  ${label}${String(i).padStart(3)}  FAILED ${String(err.message).slice(0, 160)}\n`);
      }
    }
  }));
  return out;
}

const candidates = [];
for (let i = 0; i < SAMPLES; i++) {
  const flat = {};
  for (const [k, xs] of Object.entries(SPACE)) flat[k] = pick(xs);
  candidates.push(flat);
}
// The current committed numbers, as candidate zero, so the search has to beat
// something real rather than just the best of its own dice.
candidates.unshift({});

console.log(`balance: ${candidates.length} random candidates x ${ROUNDS} rounds x 2 brain pairs, ${WORKERS} workers`);
const t0 = Date.now();
const results = await evalBatch(candidates, 'r');
results.sort((a, b) => a.score.total - b.score.total);

/*
 * Random search over thirteen axes is sparse — a hundred and forty samples
 * touch a vanishing fraction of the grid — so the best of them is a starting
 * point rather than an answer. Coordinate descent from it is cheap and, on a
 * space this smooth, is where the real gain is.
 */
const PASSES = Number(arg('refine', 2));
let base = { ...fill(results[0].flat) };
for (let pass = 0; pass < PASSES; pass++) {
  for (const [axis, values] of Object.entries(SPACE)) {
    const trials = values.filter((v) => v !== base[axis]).map((v) => ({ ...base, [axis]: v }));
    if (!trials.length) continue;
    const got = await evalBatch(trials, `${pass}:${axis.split('.').slice(-2).join('.')} `);
    got.push({ flat: base, score: results.find((r) => JSON.stringify(fill(r.flat)) === JSON.stringify(base))?.score ?? { total: Infinity }, gen: null, stub: null });
    const localBest = (await evalBatch([base], `${pass}:base `))[0];
    got.push(localBest);
    got.sort((a, b) => a.score.total - b.score.total);
    if (got[0].gen) results.push(got[0]);
    for (const g of got) if (g.gen) results.push(g);
    base = { ...fill(got[0].flat) };
    console.log(`  pass ${pass} ${axis} -> ${base[axis]}  (score ${got[0].score.total.toFixed(3)})`);
  }
}

results.sort((a, b) => a.score.total - b.score.total);
console.log(`\ndone in ${((Date.now() - t0) / 1000).toFixed(0)}s\n`);
console.log('TOP 8');
for (const r of results.slice(0, 8)) {
  const s2 = r.score.gen, h = r.gen.hitRate;
  console.log(`\n  score ${r.score.total.toFixed(3)}${GEN_TAGS_B ? `  (worse of ${r.score.a.toFixed(3)} / ${r.score.b.toFixed(3)})` : ''}  [fair ${s2.fairness.toFixed(2)} spread ${s2.spread.toFixed(2)} pace ${s2.pacing.toFixed(2)} shape ${s2.shape.toFixed(2)} dead ${s2.dead.toFixed(2)} certain ${s2.certain.toFixed(2)}]`);
  console.log(`    octopus ${(r.gen.mechanicsOctWinRate * 100).toFixed(0)}% / ${(r.gen2.mechanicsOctWinRate * 100).toFixed(0)}%  ${r.gen.meanSeconds.toFixed(1)}s  melee ${(r.gen.meanMeleeUptime * 100).toFixed(0)}%  timeout ${(r.gen.meanTimeoutRate * 100).toFixed(0)}%  hit laser ${(h.laser * 100).toFixed(0)}% smash ${(h.smash * 100).toFixed(0)}% charge ${(h.charge * 100).toFixed(0)}%`);
  console.log(`    ${JSON.stringify(r.flat)}`);
}
writeFileSync(join(ROOT, 'reports', 'balance-search.json'), JSON.stringify(results.slice(0, 20).map((r) => ({
  score: r.score,
  flat: r.flat,
  gen: { tags: GEN_TAGS, win: r.gen.mechanicsOctWinRate, sec: r.gen.meanSeconds, melee: r.gen.meanMeleeUptime, hit: r.gen.hitRate, uses: r.gen.usesPerMatch },
  gen2: { tags: GEN_TAGS_B, win: r.gen2.mechanicsOctWinRate, sec: r.gen2.meanSeconds, melee: r.gen2.meanMeleeUptime, hit: r.gen2.hitRate },
})), null, 2));
console.log(`\nfull top-20 written to reports/balance-search.json`);
rmSync(dir, { recursive: true, force: true });
