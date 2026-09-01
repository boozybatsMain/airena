#!/usr/bin/env node
/**
 * Every blue-slot brain against every orange-slot brain.
 *
 *   node tools/tournament.mjs --rounds=50 --tags=v2,v3,v4,v5 --with-stub
 *
 * ── why a matrix and not a match ────────────────────────────────────────────
 *
 * The first balance pass tuned the constants until the generated pair sat at
 * 52/48, regenerated both brains against those constants, and watched the same
 * matchup go to 20/80. Nothing in the world had changed; one of the two new
 * programs was simply better than the one it replaced. That is the single most
 * important measurement this project has made, and it makes a one-pair win rate
 * meaningless as a balance signal: it is a sample of two programs, not a
 * property of the game.
 *
 * A cross-matrix separates the two. Read down a column and you are reading how
 * good one gorilla brain is against a fixed field of opponents; read the whole
 * grid's mean and you are reading the MECHANICS, because brain quality averages
 * out. The spread between the best and worst brain of a side is then a direct
 * measurement of how much the mind matters — which is the thing the project set
 * out to demonstrate.
 */

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compileBrain } from '../src/brain/host.js';
import { runMatch } from '../src/core/match.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, dflt) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : (process.argv.includes(`--${name}`) ? true : dflt);
};

const ROUNDS = Number(arg('rounds', 40));
const WITH_STUB = !!arg('with-stub', false);
const JSON_OUT = !!arg('json', false);
/*
 * Where populations are read from, replacing `brains/` entirely.
 *
 * This exists so a caller can hand over a directory it owns. `tools/bracket.mjs`
 * used to copy its two populations INTO `brains/` and delete them afterwards,
 * which meant any tool globbing the tree at the wrong moment ran a fight
 * against half a population — a reviewer caught it corrupting a live run. One
 * flag is a cheaper fix than making every reader of `brains/` interruption-safe.
 */
const BRAINS = resolve(ROOT, String(arg('brains', join(ROOT, 'brains'))));
if (!existsSync(BRAINS)) {
  console.error(`\nno brains directory at ${BRAINS}\n`);
  process.exit(1);
}

function discover() {
  return readdirSync(BRAINS)
    // `probe-*` are hand-written degeneracy probes, not generated brains; they
    // are run on purpose with --tags, never swept into a population average.
    // A leading underscore marks a directory a tool is staging into. Sweeping
    // one of those into a population is exactly how the leak described above
    // reached a live run, so the convention is refused here as well as avoided
    // there.
    .filter((d) => statSync(join(BRAINS, d)).isDirectory() && d !== 'stub'
      && !d.startsWith('probe-') && !d.startsWith('_'))
    .filter((d) => existsSync(join(BRAINS, d, 'octopus.js')) && existsSync(join(BRAINS, d, 'gorilla.js')))
    .sort();
}

const tags = String(arg('tags', '')).length ? String(arg('tags')).split(',') : discover();
const all = WITH_STUB ? [...tags, 'stub'] : tags;
if (all.length === 0) { console.error('no brains found'); process.exit(1); }

const src = (id, tag) => {
  const p = join(BRAINS, tag, `${id}.js`);
  if (!existsSync(p)) {
    console.error(`\nno ${id} brain for tag "${tag}" (looked in ${p})`);
    console.error(`  available: ${discover().join(', ') || '(none — run tools/brainforge.mjs)'}\n`);
    process.exit(1);
  }
  return readFileSync(p, 'utf8');
};

/*
 * The same treatment `src` gives a missing file. A brain that does not parse is
 * an ordinary outcome here — these are generated programs — and the raw V8
 * trace through the vm wrapper names `blue-j3.brain.js`, a file that exists
 * nowhere, instead of the one on disk that needs regenerating.
 */
const compile = (id, tag, label) => {
  try {
    return compileBrain(src(id, tag), label);
  } catch (err) {
    console.error(`\n${id} brain for tag "${tag}" does not compile (${join(BRAINS, tag, `${id}.js`)})`);
    console.error(`  ${err.message}\n`);
    process.exit(1);
  }
};

/*
 * ── ДВА РАЗНЫХ СЛОВАРЯ, И ИХ НЕЛЬЗЯ ПУТАТЬ ────────────────────────────────
 *
 * СИМУЛЯЦИЯ адресуется СТОРОНАМИ, а стороны — это цвета: `blue` и `orange`.
 * Через них ключуются `brains`, `result` и `winner`.
 *
 * ОТЧЁТ (`reports/tournament.json`) ключуется ИМЕНАМИ ФАЙЛОВ популяции §1 —
 * `octopus` и `gorilla`, — потому что это опубликованный замер: под этими
 * именами напечатаны §1 и §16, и по ним же его читают `tools/report.mjs`,
 * `/api/recommended` и `src/viewer/main.js`. Переименовать схему отчёта —
 * значит переписать замер задним числом; здесь этого не делается.
 *
 * Ниже эти два словаря разведены явно и встречаются только тут.
 */
const BLUE_FILE = 'octopus';
const ORANGE_FILE = 'gorilla';

const cells = [];
const t0 = Date.now();
for (const ot of all) {
  for (const gt of all) {
    const brains = {
      blue: compile(BLUE_FILE, ot, `blue-${ot}`),
      orange: compile(ORANGE_FILE, gt, `orange-${gt}`),
    };
    let octWins = 0, draws = 0, secs = 0, timeouts = 0, meleeTicks = 0, allTicks = 0;
    const dmg = { octopus: 0, gorilla: 0 };
    const faults = { octopus: 0, gorilla: 0 };
    const uses = {}, hits = {};
    for (let r = 0; r < ROUNDS; r++) {
      // Reset, not recompiled — see `reset()` in src/brain/host.js. The clean
      // slate is what makes 60 seeded rounds 60 samples rather than one.
      brains.blue.reset();
      brains.orange.reset();
      const { result, world } = runMatch(brains, { seed: 5000 + r });
      if (result.winner === 'blue') octWins++;
      else if (!result.winner) draws++;
      if (result.reason.startsWith('timeout')) timeouts++;
      secs += result.seconds;
      dmg.octopus += result.blue.damageDealt;
      dmg.gorilla += result.orange.damageDealt;
      faults.octopus += result.blue.faults;
      faults.gorilla += result.orange.faults;
      for (const side of ['blue', 'orange']) {
        for (const [k, v] of Object.entries(result[side].uses)) uses[k] = (uses[k] || 0) + v;
        for (const [k, v] of Object.entries(result[side].hits)) hits[k] = (hits[k] || 0) + v;
      }
      meleeTicks += world.meleeTicks || 0;
      allTicks += world.tick;
    }
    cells.push({
      octopus: ot, gorilla: gt,
      octWinRate: octWins / ROUNDS,
      drawRate: draws / ROUNDS,
      timeoutRate: timeouts / ROUNDS,
      seconds: secs / ROUNDS,
      octDamage: dmg.octopus / ROUNDS,
      gorDamage: dmg.gorilla / ROUNDS,
      faults: { octopus: faults.octopus, gorilla: faults.gorilla },
      meleeUptime: allTicks ? meleeTicks / allTicks : 0,
      hitRate: Object.fromEntries(Object.keys(uses).map((k) => [k, uses[k] ? (hits[k] || 0) / uses[k] : null])),
      usesPerMatch: Object.fromEntries(Object.entries(uses).map(([k, v]) => [k, v / ROUNDS])),
    });
  }
}

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
/*
 * The mechanics number is an average over GENERATED brains only. The stub and
 * the hand-written degeneracy probes are deliberately lopsided — that is what
 * they are for — and letting them into the mean would report the probe's
 * failure as a property of the game.
 */
const isGenerated = (t) => t !== 'stub' && !t.startsWith('probe-');
const grid = cells.filter((c) => isGenerated(c.octopus) && isGenerated(c.gorilla));

const octStrength = Object.fromEntries(all.map((t) => [t, mean(cells.filter((c) => c.octopus === t).map((c) => c.octWinRate))]));
const gorStrength = Object.fromEntries(all.map((t) => [t, mean(cells.filter((c) => c.gorilla === t).map((c) => 1 - c.octWinRate))]));

const out = {
  rounds: ROUNDS,
  tags: all,
  cells,
  /** The mechanics signal: brain quality has been averaged out of this number. */
  mechanicsOctWinRate: mean(grid.map((c) => c.octWinRate)),
  meanSeconds: mean(grid.map((c) => c.seconds)),
  meanTimeoutRate: mean(grid.map((c) => c.timeoutRate)),
  meanMeleeUptime: mean(grid.map((c) => c.meleeUptime)),
  /*
   * The mean's blind spot, measured, because the balance scorer reads these
   * numbers and every term it had was a mean. A mean cannot tell an even game
   * from a rock-paper-scissors one: eighteen 0% cells and eighteen 100% cells
   * average to a flawless 50%. This is the mean distance of a cell from even —
   * 0 if every matchup is a coin flip, 0.5 if every one is decided before it
   * starts.
   *
   * Every figure quoted in this file names the population it was measured on,
   * because the population is regenerated whenever a constant moves and an
   * unattributed number goes stale silently. brains-l at 25 rounds, under the
   * constants committed when this was written: 0.23 imbalance behind a
   * mechanics mean of 47.2%, with a median cell at 48%. Rolling the two top
   * speeds back to the split pair they replaced and changing nothing else, the
   * same population reads 0.25 / 37.2% / 32% — the mean moves ten points and
   * the spread barely two, which is why both are reported. A grid can be made
   * fairer on average without any individual matchup becoming less decided.
   */
  meanCellImbalance: mean(grid.map((c) => Math.abs(c.octWinRate - 0.5))),
  /*
   * The worst hug in the grid rather than the average one: brains-l's mean
   * melee uptime is 20.6% and its worst cell is 43.6%, against 24.8% and 48.8%
   * with the split speeds rolled back. The worst cell is what
   * `tools/balance.mjs` bands, because a mean of 21% can hide a matchup that is
   * a wrestle from the opening bell — and did, at 87%, in an earlier world.
   */
  maxMeleeUptime: grid.length ? Math.max(...grid.map((c) => c.meleeUptime)) : 0,
  hitRate: Object.fromEntries(['laser', 'smash', 'charge'].map((k) => [k, mean(grid.map((c) => c.hitRate[k]).filter((v) => v !== null && v !== undefined))])),
  usesPerMatch: Object.fromEntries(['laser', 'blink', 'jump', 'smash', 'charge'].map((k) => [k, mean(grid.map((c) => c.usesPerMatch[k] || 0))])),
  octStrength,
  gorStrength,
  /** How much the mind matters: the spread of one side's brains over one field. */
  octSpread: (() => { const g = tags.filter(isGenerated); return Math.max(...g.map((t) => octStrength[t])) - Math.min(...g.map((t) => octStrength[t])); })(),
  gorSpread: (() => { const g = tags.filter(isGenerated); return Math.max(...g.map((t) => gorStrength[t])) - Math.min(...g.map((t) => gorStrength[t])); })(),
  wallSeconds: (Date.now() - t0) / 1000,
};

/**
 * Which pair to open the viewer on.
 *
 * Not the strongest pair — the strongest octopus against the weakest gorilla is
 * a demonstration of nothing. The most watchable one: close to even, long
 * enough to develop, short enough to hold attention.
 */
const watchable = grid
  .map((c) => ({
    ...c,
    spectacle: Math.abs(c.octWinRate - 0.5) * 2 + Math.max(0, Math.abs(c.seconds - 27) - 6) / 12 + c.timeoutRate,
  }))
  .sort((a, b) => a.spectacle - b.spectacle);
out.recommended = watchable.length
  ? { octopus: watchable[0].octopus, gorilla: watchable[0].gorilla, octWinRate: watchable[0].octWinRate, seconds: watchable[0].seconds }
  : null;

/*
 * `--json` means "you are being used as a subroutine": the balance sweep runs
 * dozens of these concurrently as child processes, and each one writing the
 * shared report file left `reports/tournament.json` holding whichever sweep
 * candidate happened to finish last — which is then what the write-up quotes.
 */
if (JSON_OUT) { console.log(JSON.stringify(out, null, 2)); process.exit(0); }

writeFileSync(join(ROOT, 'reports', 'tournament.json'), JSON.stringify(out, null, 2));

const pct = (v) => `${(v * 100).toFixed(0)}%`;
console.log(`\n═══ cross-tournament — ${all.length}x${all.length} matchups x ${ROUNDS} rounds = ${all.length * all.length * ROUNDS} matches in ${out.wallSeconds.toFixed(1)}s`);
console.log('\n  octopus win rate, row = octopus brain, column = gorilla brain\n');
process.stdout.write('            ');
for (const g of all) process.stdout.write(g.padStart(8));
process.stdout.write('   | mean\n');
for (const o of all) {
  process.stdout.write(`  ${o.padEnd(10)}`);
  for (const g of all) {
    const c = cells.find((x) => x.octopus === o && x.gorilla === g);
    process.stdout.write(pct(c.octWinRate).padStart(8));
  }
  process.stdout.write(`   | ${pct(octStrength[o]).padStart(4)}\n`);
}
process.stdout.write('  gorilla   ');
for (const g of all) process.stdout.write(pct(1 - gorStrength[g]).padStart(8));
process.stdout.write('\n  holds     (octopus win rate against that gorilla)\n');

console.log(`\n  MECHANICS   octopus wins ${pct(out.mechanicsOctWinRate)} averaged over the generated grid`);
console.log(`              mean match ${out.meanSeconds.toFixed(1)}s, decided on the clock ${pct(out.meanTimeoutRate)}`);
console.log(`              cells sit ${pct(out.meanCellImbalance)} from even on average, worst melee cell ${pct(out.maxMeleeUptime)} — both invisible in the means above`);
console.log(`  MIND        octopus brains span ${pct(out.octSpread)} of win rate; gorilla brains span ${pct(out.gorSpread)}`);
const tf = cells.reduce((a, c) => a + c.faults.octopus + c.faults.gorilla, 0);
console.log(`  RELIABILITY ${tf} brain faults across ${all.length * all.length * ROUNDS} matches`);
if (out.recommended) {
  console.log(`  WATCH       octopus:${out.recommended.octopus} vs gorilla:${out.recommended.gorilla} — ${pct(out.recommended.octWinRate)} / ${out.recommended.seconds.toFixed(0)}s, the closest fight in the grid`);
}
console.log(`\n  written to reports/tournament.json\n`);
