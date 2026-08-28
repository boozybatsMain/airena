#!/usr/bin/env node
/**
 * Write a tuning into `src/core/config.js` as literals, and prove it landed.
 *
 *   node tools/bake.mjs --dry reports/balance-search.json   # look first
 *   node tools/bake.mjs reports/balance-search.json         # then write it
 *   node tools/bake.mjs --dry some-tuning.json              # or any tuning file
 *
 * ── --dry is first because the write is not a small thing ───────────────────
 *
 * A generated brain hard-codes some of the numbers it was told — a cooldown it
 * counts down itself, a range it compares against — so moving a constant does
 * not make a brain wrong, it makes it MISINFORMED, and the difference shows up
 * as a win rate rather than as an error. Measured against the search winner
 * committed in `reports/balance-search.json`: it moves 12 constants, and all
 * 18 populations that `tools/checkstale.mjs` currently calls `current` — the
 * six in `brains/` included — would stop being current the moment it lands.
 *
 * That was invisible. This tool wrote the numbers, verified them, said
 * "verified", and stopped; README quoted only the destructive form of the
 * command. So the last thing it does now is run `checkstale` on both sides of
 * the write and name every population the write just invalidated.
 *
 * ── why bake rather than ship the overlay ───────────────────────────────────
 *
 * `AIRENA_TUNING` exists so a sweep can run sixty candidates without editing
 * source, and it would work perfectly well as the shipping mechanism too. It is
 * not used as one because of who reads `config.js`: every constant in that file
 * is quoted verbatim into the brain prompt and into the write-up, and a reader
 * who opens it and finds numbers that are not the numbers in play has been
 * lied to by the one file whose entire docstring is about not lying.
 *
 * So the winner goes in as literals. The edit is per-field inside the named
 * record rather than a file-wide regex — `cooldown: 2` appears in five
 * different skills — and the result is verified by re-importing the module in a
 * child process with the overlay explicitly disabled and comparing every value.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG = join(ROOT, 'src/core/config.js');

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const file = args.find((a) => !a.startsWith('--'));
if (!file) {
  console.error('usage: node tools/bake.mjs [--dry] <tuning.json | reports/balance-search.json>');
  console.error('       --dry lists what would change and writes nothing. Start there:');
  console.error('       a write moves the constants under every brain already generated.');
  process.exit(1);
}

/**
 * Which populations `checkstale` calls `current`, right now.
 *
 * Read by running the tool rather than by reimplementing its comparison: the
 * question "is this population stale" has exactly one answer in this repo and
 * it is the one that tool gives. Called once before the write and once after,
 * so what is reported is the difference the write MADE, not a guess at it.
 */
function currentPopulations() {
  try {
    const out = execFileSync('node', [join(ROOT, 'tools/checkstale.mjs')], { cwd: ROOT }).toString();
    return new Set(out.split('\n').filter((l) => /\scurrent$/.test(l)).map((l) => l.trim().split(/\s+/)[0]));
  } catch {
    return null; // checkstale itself is broken; say so rather than claim a count
  }
}

const raw = JSON.parse(readFileSync(resolve(ROOT, file), 'utf8'));

/** Accept either a tuning object or the search report (whose [0] is the winner). */
let flat;
if (Array.isArray(raw)) {
  if (!raw.length || !raw[0].flat) { console.error(`${file} is not a search report`); process.exit(1); }
  flat = raw[0].flat;
  const g = raw[0].gen;
  console.log(`winner of ${file}: score ${raw[0].score.total.toFixed(3)}`);
  if (g) console.log(`  octopus ${(g.win * 100).toFixed(0)}%  ${g.sec.toFixed(1)} s  melee ${(g.melee * 100).toFixed(0)}%  `
    + `hit laser ${(g.hit.laser * 100).toFixed(0)}% smash ${(g.hit.smash * 100).toFixed(0)}% charge ${(g.hit.charge * 100).toFixed(0)}%`);
} else {
  flat = {};
  for (const [section, table] of Object.entries(raw)) {
    for (const [key, fields] of Object.entries(table)) {
      for (const [f, v] of Object.entries(fields)) flat[`${section}.${key}.${f}`] = v;
    }
  }
}

const SECTION_OF = { fighters: 'FIGHTERS', skills: 'SKILLS' };

let src = readFileSync(CONFIG, 'utf8');
const applied = [];

for (const [path, value] of Object.entries(flat)) {
  const [section, key, field] = path.split('.');
  const objName = SECTION_OF[section];
  if (!objName) { console.error(`unknown section in "${path}"`); process.exit(1); }

  // Find the record: `  <key>: {` inside `export const <OBJ> = {`, then walk to
  // its closing brace by counting depth. Editing inside those bounds is what
  // stops `cooldown: 2` in one skill rewriting `cooldown: 2` in another.
  const objAt = src.indexOf(`export const ${objName} = {`);
  if (objAt < 0) { console.error(`${objName} not found in config.js`); process.exit(1); }
  const keyAt = src.indexOf(`\n  ${key}: {`, objAt);
  if (keyAt < 0) { console.error(`${objName}.${key} not found`); process.exit(1); }
  let depth = 0, end = keyAt;
  for (let i = src.indexOf('{', keyAt); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  const block = src.slice(keyAt, end);
  const re = new RegExp(`(\\n\\s*${field}:\\s*)(-?[0-9.]+)`);
  if (!re.test(block)) { console.error(`${objName}.${key}.${field} not found (or not a plain number)`); process.exit(1); }
  const was = block.match(re)[2];
  if (Number(was) === Number(value)) continue;
  src = src.slice(0, keyAt) + block.replace(re, `$1${value}`) + src.slice(end);
  applied.push(`${path}: ${was} -> ${value}`);
}

if (applied.length === 0) { console.log('\nnothing to change; config already matches.'); process.exit(0); }

console.log(`\n${applied.length} change(s):`);
for (const a of applied) console.log(`  ${a}`);
if (dry) { console.log('\n--dry: nothing written.'); process.exit(0); }

const before = currentPopulations();
writeFileSync(CONFIG, src);

/*
 * Verify by re-importing in a child, with the overlay pointed at a file that
 * does not exist. Editing source and trusting the edit is how a constant ends
 * up half-applied — one field written, another silently skipped by a regex that
 * matched somewhere else.
 */
const probe = execFileSync('node', ['-e',
  `import(${JSON.stringify(CONFIG)}).then((c) => {`
  + `const o = {}; for (const [k, v] of Object.entries({ fighters: c.FIGHTERS, skills: c.SKILLS }))`
  + ` for (const [n, rec] of Object.entries(v)) for (const [f, val] of Object.entries(rec)) o[k+'.'+n+'.'+f] = val;`
  + `console.log(JSON.stringify(o)); });'`.slice(0, -1),
], { cwd: ROOT, env: { ...process.env, AIRENA_TUNING: join(tmpdir(), 'airena-no-such-tuning.json') } }).toString();

const now = JSON.parse(probe);
const wrong = Object.entries(flat).filter(([k, v]) => Number(now[k]) !== Number(v));
if (wrong.length) {
  console.error(`\nBAKE FAILED — ${wrong.length} value(s) did not land:`);
  for (const [k, v] of wrong) console.error(`  ${k}: wanted ${v}, config reports ${now[k]}`);
  process.exit(1);
}
console.log(`\nbaked into src/core/config.js and verified (${Object.keys(flat).length} values checked).`);
if (existsSync(join(ROOT, 'tuning.json'))) {
  console.log('note: tuning.json still exists and will override these literals. Delete it.');
}

/*
 * The consequence, measured rather than warned about. A population that was
 * current before this write and is not current after it has been silently
 * invalidated: its brains were written against numbers that no longer exist,
 * and every measurement taken on them from here on is measuring staleness as
 * well as skill.
 */
const after = currentPopulations();
if (before === null || after === null) {
  console.log('\ncould not run tools/checkstale.mjs, so the staleness of the existing brains is unknown.');
} else {
  const lost = [...before].filter((p) => !after.has(p));
  if (lost.length === 0) console.log('\nno population went stale: every brain was already written against other numbers.');
  else {
    console.log(`\n${lost.length} population(s) were current before this write and are now STALE:`);
    for (const p of lost) console.log(`  ${p}`);
    console.log('  Their brains hard-code numbers that have just moved. Regenerate with');
    console.log('  tools/brainforge.mjs, or read tools/checkstale.mjs for exactly what changed.');
  }
}
