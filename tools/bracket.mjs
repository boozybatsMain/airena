#!/usr/bin/env node
/**
 * The balance claim, as a range rather than a number.
 *
 *   node tools/bracket.mjs
 *   node tools/bracket.mjs --populations=h,i,o,p     (a subset, by letter)
 *   node tools/bracket.mjs --rounds=40
 *
 * ── why this exists ─────────────────────────────────────────────────────────
 *
 * A single win rate from a single population is not a property of the game, and
 * this project has the receipts: the same constants measured 29% on one
 * population and 92% on the next, and constants fitted until one population sat
 * at 52% put a freshly generated one at 14%. Six programs are not a generator.
 *
 * So the shipped claim is a bracket. Populations with deliberately different
 * character are run under the current constants, and the assertion is about
 * where they land relative to even. This runs them and says whether the claim
 * still holds, which is the only form of "the game is balanced" that survived
 * contact with the measurements.
 *
 * ── two criteria, and only one of them is the claim ─────────────────────────
 *
 * The original assertion was "the extremes straddle even": max >= 50% and
 * min <= 50%. That is satisfied by a single population above the line, however
 * far below it everything else sits, and a reviewer showed what that buys — the
 * check reported HOLDS with the gorilla 22% faster than the octopus, a world in
 * which two of the three populations win less than a quarter of their matches.
 * Straddling is necessary and nowhere near sufficient, and it gets WEAKER the
 * more populations are run, because more draws can only widen the extremes.
 * [1] is kept because a set that fails it is degenerate — every draw on one
 * side of even is a fact about the constants, not about any one population —
 * and it is kept over the FULL set, stale rows included, for the same reason.
 * It is not the claim. [2] is.
 *
 * ── [2] and the provenance it used to ignore ────────────────────────────────
 *
 * The second criterion is the MEDIAN, which cannot be carried by one outlier.
 * It used to be the median of every row on the table, and that was a defect
 * with two halves.
 *
 * The first half is provenance. Each brain is written from a prompt that quotes
 * the constants, and `promptHash` says exactly which world it was told about.
 * `reports/brains-h` and `reports/brains-i` were written against constants that
 * have since moved, so part of what they measure is how a program copes with a
 * world it was told wrong about. That is a real effect with a direction —
 * moving a constant back toward the world a population was told flatters that
 * population — and it has no business inside a number that is supposed to be
 * about the game as it ships. So [2] is now computed over the rows marked `*`:
 * the populations that were told THIS world. Everything else still prints, and
 * still counts for [1].
 *
 * The second half is sampling. Under identical constants, population m measured
 * 48% and population n measured 69%: 21 points apart, from nothing but which
 * six programs a model happened to write. The next pair, generated back to back
 * under the constants as they now stand, came in at o 42% and p 26% — 15.6
 * points apart. A 10-point tolerance applied to a median of two such draws is a
 * coin flip dressed as a measurement: the median of two IS their mean, and two
 * draws 21 points apart put their mean 10.5 points from either of them.
 *
 * The fix is not a looser bar. A bar that widens with the disagreement would
 * hand out a pass for noise, which is the wrong direction: draws that disagree
 * more should certify LESS. So the 10-point bar stays exactly where the sweep
 * below put it, and the spread enters where it belongs — as the uncertainty on
 * the median, `s / sqrt(n)` over the told-this-world draws. For two draws that
 * is exactly half their range, which is the distance from their median to
 * either of them; add a third and it shrinks, as more evidence should. Then:
 *
 *   |median - 50%| - u  >  10 points   the claim is REFUTED   -> BROKEN, exit 1
 *   |median - 50%| + u  <= 10 points   the claim is ESTABLISHED -> HOLDS, exit 0
 *   otherwise                          the band straddles the bar -> UNRESOLVED, exit 2
 *
 * On the m/n pair that reads 8.5 +/- 10.5 points from even: not refuted, not
 * established, UNRESOLVED. On the live o/p pair, 16.0 +/- 7.8 — a band from 8.2
 * to 23.8 points out, which spans the 10-point bar from both sides. Both are
 * verdicts the old criterion could not express: it would have called the first
 * a pass at 8.5 and the second a FAIL at 16.0, and neither of those is a thing
 * two draws that far apart are entitled to say.
 *
 * At n=2, u IS half their disagreement, so a HOLDS needs the two draws to agree
 * closely AND to land near even — 47/53 clears it, 48/69 does not. That is a
 * high bar and it should be: it is what "the game is balanced" costs, and the
 * way to lower it is a third population, not a wider tolerance.
 *
 * With fewer than two such populations there is no median and no spread, and
 * the run says so instead of reading one draw as the claim: exit 2, PROVISIONAL
 * (one row) or UNRESOLVED (none), as against exit 1 for a claim that is BROKEN.
 * A wrapping script can tell "we have not measured this yet" from "this is
 * wrong", because those want different responses.
 *
 * ── where the 10-point bar comes from ───────────────────────────────────────
 *
 * Swept over five constant sets, 20 rounds each, win rates are octopus's:
 *
 *   constants                       kiters  ordinary  shipping  median  verdict
 *   gorilla maxSpeed 5.9             62.8%    22.8%     23.5%    23.5%  straddles
 *   as shipped before this pass       74.4     31.5      34.7     34.7   straddles
 *   levelled speeds 5.1/5.1 (now)     79.4     45.6      43.3     45.6   BOTH
 *   levelled at 4.85/4.85             81.3     47.1      43.9     47.1   BOTH
 *   gorilla maxSpeed 4.3              86.9     65.8      60.6     60.6   neither
 *
 * The first two rows are the ones that matter: the old rule certified both, and
 * the top row is a fifth worse for the octopus than the constants it certified
 * underneath it. The medians land 23.5, 15.3, 4.4, 2.9 and 10.6 points from
 * even, so any tolerance between 4.5 and 10.5 points gives exactly these five
 * verdicts; 10 is the loosest of them, i.e. the version of this check least
 * likely to fail for a reason that is really sampling noise.
 *
 * That sweep is one self-consistent set of runs against one state of
 * `src/core/sim.js`, and the sim is not a constant either. A concurrent pass
 * over it, and the sudden-death constant with it, moved the committed row to
 * 78 / 43 / 47 — median 3.1 points out — and the row above it to 72 / 26 / 39,
 * median 11.5 out. Same two verdicts, from a window of (3.2, 11.4): at 10 the
 * committed constants clear the bar by 6.9 points and the split pair misses it
 * by 1.5. Re-run this rather than trusting the table when the sim changes; the
 * table is here to justify the bar, not to stand in for the check.
 *
 * Note what that sweep measured: how far the median moves when the CONSTANTS
 * move, with the population set held fixed. The 21-point m/n gap is how far it
 * moves when only the DRAW moves. The second is bigger than the first, which is
 * why the draw-to-draw spread had to be given somewhere to go, and why it is
 * not allowed anywhere near the bar itself.
 *
 * ── which populations, and what it costs ────────────────────────────────────
 *
 * Discovered, not named. Every `reports/brains-<letter>` is one population, and
 * `brains/` is split by tag prefix — when this was written the shipping tree
 * held `o1..o6` AND `p1..p6`, two independent draws sharing one directory, and
 * reading it as a single twelve-brain population would put half of two
 * populations into one number in exactly the way the staging comment below
 * already worries about. A letter present in both places is read from
 * `reports/`, which does not move under a running `brainforge`.
 *
 * Measured: 66 s per population at 20 rounds over six tags. Ten populations is
 * about eleven minutes. `--populations=` takes a subset when that is too long,
 * at the cost of narrowing [1].
 *
 * ── what it said on 2026-08-26, for whoever reads this next ─────────────────
 *
 *   g 18%  h 53%  i 17%  j 20%  k 23%  l 21%  m 34%  n 52%  * o 42%  * p 26%
 *
 *   [1] pass — 17% … 53% straddles even
 *   [2] UNRESOLVED — median of o and p is 34%, 16.0 +/- 7.8 points from even
 *
 * Read it with the sim's own churn in mind: `src/core/sim.js` moved twice while
 * this was being written. The row that matters is not any single number but
 * that the only two populations entitled to speak are 15.6 points apart, and
 * both of them are below even — [1] passes on the strength of two STALE rows,
 * h and n, and stale rows are exactly what [2] exists to keep out of the claim.
 */

import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { BUILD_AXES, BUILD_BUDGET, SKILLS } from '../src/core/config.js';
import { brainPrompt } from '../src/brain/prompt.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function arg(name, dflt) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (hit) return hit.slice(name.length + 3);
  return process.argv.includes(`--${name}`) ? true : dflt;
}

/** How far the median may sit from even. From the constants sweep, above. */
const TOLERANCE = 0.10;
const ROUNDS = Number(arg('rounds', 20));
const ONLY = arg('populations', null);
/** Measured: 66 s for six tags at 20 rounds, so the estimate scales off that. */
const SECONDS_EACH = Math.round(66 * (ROUNDS / 20));

/*
 * The same filter `tools/tournament.mjs` applies when it discovers a
 * population: `probe-*` are hand-written degeneracy probes and `stub` is a
 * control, both deliberately lopsided, and a leading underscore marks a
 * directory something else is staging into. This list is passed as `--tags`, so
 * without the filter the shipping population would drag eleven probes into a
 * balance claim.
 */
const tagsIn = (dir) => readdirSync(dir)
  .filter((d) => statSync(join(dir, d)).isDirectory() && d !== 'stub'
    && !d.startsWith('probe-') && !d.startsWith('_'))
  .filter((d) => existsSync(join(dir, d, 'octopus.js')) && existsSync(join(dir, d, 'gorilla.js')))
  .sort();

/**
 * Every population on disk, one row per LETTER.
 *
 * `brainforge` names a population's tags `<letter><n>`, and that letter is the
 * only thing that says which draw a tag belongs to once two of them share the
 * shipping tree. Archives win the tie because `reports/brains-<letter>` is
 * finished and `brains/` is where the next `brainforge` writes.
 */
function discover() {
  const found = new Map();
  const reports = join(ROOT, 'reports');
  if (existsSync(reports)) {
    for (const d of readdirSync(reports).filter((x) => /^brains-[a-z]+$/.test(x)).sort()) {
      const dir = join(reports, d);
      const tags = tagsIn(dir);
      if (tags.length) found.set(d.slice('brains-'.length), { dir, rel: join('reports', d), tags });
    }
  }
  const live = join(ROOT, 'brains');
  if (existsSync(live)) {
    const byLetter = new Map();
    for (const t of tagsIn(live)) {
      const letter = (/^([a-z]+)\d+$/.exec(t) || [])[1] || t;
      if (!byLetter.has(letter)) byLetter.set(letter, []);
      byLetter.get(letter).push(t);
    }
    for (const [letter, tags] of byLetter) {
      const already = found.get(letter);
      if (already) { already.shipping = true; continue; }
      found.set(letter, { dir: live, rel: 'brains', tags, shipping: true });
    }
  }
  const rows = [...found].map(([letter, v]) => ({ letter, ...v })).sort((a, b) => a.letter.localeCompare(b.letter));
  /*
   * A half-written directory is not a draw.
   *
   * Every population compared here is six brains, and `brains/` is where a
   * `brainforge` run is writing right now — catching it at three tags would put
   * a number with visibly more sampling noise into the same median as the
   * six-tag rows. Three is the cut because it is half of six; the skip is
   * printed rather than silent, since "population q is missing" and "population
   * q is still being generated" want different responses.
   */
  const usable = rows.filter((r) => r.tags.length >= 3);
  for (const r of rows) {
    if (r.tags.length < 3) {
      console.log(`  skipping ${r.letter} (${r.rel}) — ${r.tags.length} brain${r.tags.length === 1 ? '' : 's'}`
        + ', not a population yet');
    }
  }
  if (!ONLY) return usable;
  const want = new Set(String(ONLY).split(',').map((s) => s.trim()));
  for (const w of want) {
    if (!usable.some((r) => r.letter === w)) console.log(`  --populations named "${w}", which is not on disk`);
  }
  return usable.filter((r) => want.has(r.letter));
}

/**
 * Was this population told the world it is being measured in?
 *
 * `promptHash` answers it exactly — it is a hash of the prompt the brain was
 * written from — but "yes/no" is not enough to read a number by, so the moved
 * constants are counted from the table `brainforge` freezes beside each brain.
 */
/*
 * ИМЯ ФАЙЛА -> СТОРОНА. Слева ключ, которым провенанс лежит на диске
 * (`brains/<тег>/octopus.json` — фикстура §1), справа СТОРОНА арены, которой
 * промпт адресуется теперь: стороны — это цвета. Хеш считается по стороне,
 * а раскладывается по файлу, иначе сравнивать было бы не с чем.
 */
const SIDE_OF_FILE = { octopus: 'blue', gorilla: 'orange' };

const liveHash = Object.fromEntries(Object.entries(SIDE_OF_FILE)
  .map(([file, side]) => [file, createHash('sha256').update(brainPrompt(side)).digest('hex').slice(0, 12)]));

function provenance(dir, tags) {
  /*
   * Секции стало две, и обе — про мир, а не про бойца.
   *
   * `fighters` была таблицей двух архетипов: тело выдавала сторона арены.
   * Тело теперь принадлежит существу, и общего у всех тел осталось ровно
   * то, что здесь сравнивается, — границы и цена осей плюс потолок трат.
   */
  const now = { build: BUILD_AXES, skills: SKILLS };
  const moved = new Set();
  let told = 0, seen = 0, norec = 0, archetypes = 0;
  for (const tag of tags) {
    /* Перебираются ФАЙЛЫ провенанса, а не стороны: у популяции §1 два файла и
       зовутся они так. */
    for (const file of ['octopus', 'gorilla']) {
      const p = join(dir, tag, `${file}.json`);
      if (!existsSync(p)) continue;
      seen++;
      const rec = JSON.parse(readFileSync(p, 'utf8'));
      if (rec.promptHash === liveHash[file]) told++;
      if (!rec.constants) { norec++; continue; }
      /*
       * Популяция из мира архетипов помечается ОДНИМ фактом, а не четырнадцатью
       * расхождениями. Считать `fighters.octopus.hp` «сдвинувшейся константой»
       * значит мерить исчезновение таблицы её же размером: четырнадцать полей
       * дали бы четырнадцать строк, и читатель решил бы, что мир уехал в
       * четырнадцати мелочах, а не в одном месте целиком.
       */
      if (rec.constants.fighters) { archetypes++; continue; }
      if (typeof rec.constants.buildBudget === 'number' && rec.constants.buildBudget !== BUILD_BUDGET) {
        moved.add('buildBudget');
      }
      for (const section of ['build', 'skills']) {
        for (const [k, table] of Object.entries(rec.constants[section] || {})) {
          for (const [f, v] of Object.entries(table)) {
            if (typeof v === 'number' && now[section]?.[k]?.[f] !== v) moved.add(`${section}.${k}.${f}`);
          }
        }
      }
    }
  }
  if (seen === 0 || norec === seen) return { told: false, note: 'provenance not recorded' };
  /* Мир архетипов — не «другая настройка того же мира», а другая физика тела,
     поэтому такая популяция не может быть `told` ни при каком совпадении
     хеша промпта. */
  if (archetypes) {
    return {
      told: false,
      note: `written against the archetype bodies — ${archetypes} of ${seen} brain${archetypes === 1 ? '' : 's'} `
        + 'record a FIGHTERS table, and there is none: a body is the creature\'s own now',
    };
  }
  if (told === seen) return { told: true, note: 'told this world' };
  /* A population only half of which matches the live prompt is not "told this
     world" by any reading — it is a directory somebody regenerated in part. */
  return {
    told: false,
    note: told
      ? `told this world for ${told} of ${seen} brains — a partly regenerated population, not a draw`
      : `told a different world — ${moved.size} constant${moved.size === 1 ? '' : 's'} moved since`,
  };
}

const SIDES = discover();
if (SIDES.length < 2) {
  console.error(`\nfound ${SIDES.length} population${SIDES.length === 1 ? '' : 's'} — a bracket needs at least two.\n`);
  console.error('  populations live in reports/brains-<letter> and brains/');
  console.error('  generate one:  node tools/brainforge.mjs --all --tag=q1\n');
  process.exit(2);
}

/*
 * Staged into a temp directory, not into `brains/`.
 *
 * This used to copy each population in as `brains/_bracket_<tag>` and delete it
 * afterwards, and `brains/` is a shared tree: anything else globbing it — the
 * server's dropdown, a concurrent tournament, a balance sweep's children —
 * picked the copies up, and a reviewer caught exactly that corrupting a live
 * run. `tournament.mjs --brains=<dir>` now takes a search path instead, so the
 * populations never touch the shared tree at all. The shipping population is
 * staged too, for the second half of the same reason: a `brainforge` run
 * writing into `brains/` while this one reads it would put half of two
 * populations into one number.
 */
const stages = new Set();
const discard = (d) => { rmSync(d, { recursive: true, force: true }); stages.delete(d); };
/*
 * ^C during a pass is normal — this is minutes of work — and a tmpdir is not a
 * licence to leave a copied population behind.
 *
 * Two paths, because one is not enough: this handler only runs while the event
 * loop is free, which during a pass it is not. `execFileSync` blocks it, and a
 * ^C measured against a running bracket left the handler queued for as long as
 * the child ran. The catch below is the path that actually fires, since a
 * terminal's ^C reaches the child too and a signalled child comes back as a
 * throw. This handler covers the copy phase and the gap between the two sides.
 */
process.on('SIGINT', () => { interrupted(); });

function interrupted() {
  for (const d of [...stages]) discard(d);
  // 130 is the conventional "killed by SIGINT", so a wrapping script reads an
  // interrupt as an interrupt rather than as a bracket that failed to hold.
  console.error('\n  interrupted\n');
  process.exit(130);
}

console.log(`\n═══ the balance bracket — octopus win rate under the current constants\n`);
const budget = SIDES.length * SECONDS_EACH;
console.log(`  ${SIDES.length} populations x ${ROUNDS} round${ROUNDS === 1 ? '' : 's'} — about `
  + `${budget < 90 ? `${budget} seconds` : `${Math.round(budget / 60)} minutes`}\n`);

const pct = (v) => `${(v * 100).toFixed(0)}%`;
const pts = (v) => `${(v * 100).toFixed(1)}`;

/*
 * Printed as each one finishes, not collected and printed at the end.
 *
 * Ten populations is eleven minutes, and a tool that prints nothing for eleven
 * minutes is indistinguishable from one that has hung — which is exactly when
 * somebody ^Cs it, four populations from the answer.
 */
const results = [];
for (const side of SIDES) {
  const prov = provenance(side.dir, side.tags);
  const stage = mkdtempSync(join(tmpdir(), 'airena-bracket-'));
  stages.add(stage);
  for (const t of side.tags) cpSync(join(side.dir, t), join(stage, t), { recursive: true });
  try {
    const out = execFileSync('node', [
      'tools/tournament.mjs', `--rounds=${ROUNDS}`, `--brains=${stage}`, `--tags=${side.tags.join(',')}`, '--json',
    ], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 }).toString();
    const j = JSON.parse(out);
    const r = {
      ...side, ...prov, win: j.mechanicsOctWinRate, seconds: j.meanSeconds,
      melee: j.meanMeleeUptime, hit: j.hitRate,
    };
    results.push(r);
    console.log(`  ${r.told ? '*' : ' '} ${r.letter}  ${r.rel.padEnd(17)}${r.shipping ? ' (shipping)' : '           '}`
      + `  ${r.tags.length} brains  ${pct(r.win).padStart(4)}   ${r.seconds.toFixed(1)}s  melee ${pct(r.melee)}  `
      + `hit L${pct(r.hit.laser)}/S${pct(r.hit.smash)}/C${pct(r.hit.charge)}`);
    console.log(`       ${r.note}`);
  } catch (err) {
    if (err.signal === 'SIGINT') interrupted();
    throw err;
  } finally {
    discard(stage);
  }
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

// [1] over the FULL set, stale rows included — see the header.
const all = results.map((r) => r.win).sort((a, b) => a - b);
const [lo, hi] = [all[0], all[all.length - 1]];
const straddles = hi >= 0.5 && lo <= 0.5;

// [2] over the rows that were told this world, and nothing else.
const fresh = results.filter((r) => r.told);
const wins = fresh.map((r) => r.win);
const mid = wins.length ? wins.reduce((a, b) => a + b, 0) / wins.length : null;
const midMedian = wins.length ? median(wins) : null;
const off = mid === null ? null : Math.abs(mid - 0.5);
/*
 * The uncertainty on that centre, from the draws themselves.
 *
 * Textbook standard error of the MEAN — which is the statistic it is now paired
 * with. It used to be paired with the median, and that was inconsistent: the
 * standard error of a median is about 1.25x the SEM for normal data, so the
 * band was narrower than the statistic it was quoted against. At n = 2 the
 * distinction is empty (the median of two IS their mean); at n = 3 it is not,
 * and three same-world draws are now the normal case.
 *
 * The switch was made while the verdict was UNRESOLVED under BOTH statistics —
 * q/r/s give median 59.0% (9.0 +/- 9.5 out) and mean 51.6% (1.6 +/- 9.5 out),
 * neither established nor refuted against a 10-point bar — specifically so the
 * choice could not be, and cannot later be read as, a choice of whichever
 * statistic passed. The median is still printed beside it for exactly that
 * reason: a mean that drifts away from its own median is a distribution worth
 * looking at rather than averaging.
 *
 * With n this small the SD estimate is itself poor; that is an argument for
 * more populations, not for pretending the uncertainty is smaller than the only
 * measurement of it there is.
 */
const sd = wins.length >= 2
  ? Math.sqrt(wins.reduce((a, b) => a + (b - mid) ** 2, 0) / (wins.length - 1))
  : null;
const u = sd === null ? null : sd / Math.sqrt(wins.length);

console.log(`\n  bracket ${pct(lo)} … ${pct(hi)} over ${results.length} populations`);
console.log(`  [1] ${straddles ? 'pass' : 'FAIL'} — the extremes ${straddles ? 'sit either side of even' : 'are BOTH on the same side of even'}`);

let refuted = false, established = false;
if (wins.length >= 2) {
  refuted = off - u > TOLERANCE;
  established = off + u <= TOLERANCE;
  const verdict = refuted ? 'FAIL' : established ? 'pass' : 'UNRESOLVED';
  console.log(`  [2] ${verdict} — mean of the ${wins.length} populations told this world `
    + `(${fresh.map((r) => `${r.letter} ${pct(r.win)}`).join(', ')}) is ${pct(mid)}`);
  console.log(`      ${pts(off)} ± ${pts(u)} points from even, against a ${pts(TOLERANCE)}-point bar`
    + `  [median ${pct(midMedian)}, sd ${pts(sd)}]`);
  if (!refuted && !established) {
    console.log(`      that band, ${pts(Math.max(0, off - u))} to ${pts(off + u)}, spans the bar — these draws can`);
    console.log('      neither certify nor refute the claim. Another population is what narrows it.');
  }
} else if (wins.length === 1) {
  console.log(`  [2] PROVISIONAL — one population was told this world (${fresh[0].letter}, ${pct(wins[0])}, `
    + `${pts(Math.abs(wins[0] - 0.5))} points from even).`);
  console.log('      One draw is not a median and carries no spread to put an uncertainty on;');
  console.log('      the m/n pair measured 21 points apart under identical constants. Generate a');
  console.log('      second population under these constants before reading this as the claim.');
} else {
  console.log('  [2] UNRESOLVED — no population on disk was told this world, so nothing here');
  console.log('      measures the game as it ships. Every row above is a program coping with a');
  console.log('      world it was told wrong about.  node tools/brainforge.mjs --all --tag=q1');
}

if (!straddles || refuted) {
  console.log('\n  BROKEN — criterion [1] alone is one-sided and is not the claim; both must pass\n');
  process.exit(1);
}
if (!established) {
  console.log(`\n  NOT ESTABLISHED — [1] passes, and ${wins.length >= 2
    ? 'the populations told this world do not pin their\n  mean tightly enough to claim it'
    : 'there is no median to judge [2] on at all'}. Not the same as broken.\n`);
  process.exit(2);
}
console.log('\n  HOLDS — the extremes straddle even, and the median of the populations told this');
console.log('  world sits inside the bar with its own measured uncertainty allowed for\n');
