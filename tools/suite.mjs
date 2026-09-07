#!/usr/bin/env node
/**
 * Every gate, in order, and a wall of results at the end.
 *
 *   npm test
 *   node tools/suite.mjs --only=checkcontrast,checkscope
 *   node tools/suite.mjs --bail            (stop at the first failure)
 *   node tools/suite.mjs --list
 *   node tools/suite.mjs --log=reports/screens/ui/gates.log   (evidence, stamped)
 *
 * ── WHY THE LIST IS DATA ───────────────────────────────────────────────────
 *
 * This was once a chain of `&&` in package.json. It carried exactly one bit:
 * the set is red. Which gate fell was invisible, and repeating one by hand was
 * not enough — half of them take arguments, and without those it is a different
 * check. One such false trail (`sizebalance` with its default of 6 seeds
 * instead of the gate's 20) cost an hour hunting a failure that was not there.
 * See D154, D155. So the gates are a list here, each prints its own line, and a
 * failure names the gate, the whole command and the exit code.
 *
 * ── WHY IT NO LONGER STOPS AT THE FIRST RED ────────────────────────────────
 *
 * It used to `break`. That traded one bit for another: the set is red AND
 * everything after the first failure is unknown. Round one of the redesign hit
 * exactly that — `checkcontrast` (gate 7 of 32) fell on one exempt fill, and
 * the twenty-five gates behind it, including `checkscreens`, `checkscope`,
 * `checkspec`, `loadtest` and `falsify`, never ran at all. Nobody could tell
 * whether the rest of the wall was standing, so §1.10 and §12 were unanswerable
 * from a whole run of the suite.
 *
 * Now every gate runs, the run remembers each exit code, and the summary at the
 * end lists all of them with the failures repeated underneath as commands. One
 * red gate costs its own line and nothing else. `--bail` brings the old
 * behaviour back for the case it was good for: a machine where the first
 * failure is expected to be the only one and the rest is minutes of waiting.
 *
 * ── WHY A LOG NOBODY CAN DATE IS NOT EVIDENCE ──────────────────────────────
 *
 * `reports/screens/ui/gates.log` shipped with review round two carrying one
 * line — `FAIL checkbody` — between two green ones. Running that same gate on
 * that same tree an hour later reported every assertion green. So the log was
 * either evidence of a defect that had been fixed, or evidence of a stand whose
 * database was mid-rebuild while the suite read it, and nothing in the file
 * could tell a reviewer which. §12 asks for "npm test green"; the reviewer was
 * handed a red line with no way to attribute it, and attributing it wrongly is
 * how a real failure gets waved through the next time.
 *
 * `--log=` closes that: the file it writes opens with the commit the tree was
 * on, whether that tree was dirty, the node and the platform, the environment
 * variables that change what a gate does, and — because six of these gates read
 * it — `data/airena.db` with its size and mtime. A stand-state failure and a
 * code failure then look different on the page. The console output does not
 * change; the log is the same wall with its provenance on top.
 */

import { spawnSync, execFileSync } from 'node:child_process';
import { tmpdir, hostname } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { rmSync, mkdirSync, writeFileSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/* The shared trail file: checkframing writes it, checkcamera reads it. The name
   carries the pid so two parallel runs do not trample each other. */
const TRAIL = join(tmpdir(), `airena-trail-${process.pid}.json`);

const GATES = [
  ['test'],
  ['checkprompt'], ['checkdocs'], ['checkbehaviour'],
  ['checkframing', `--dump=${TRAIL}`],
  ['checkcamera', `--trail=${TRAIL}`],
  ['checkcontrast'], ['checkgrammar'], ['checkprices'], ['checkladder'], ['checkfixtures'],
  ['checkvfx'], ['checkdecay'], ['checkgauntlet'], ['checkcadence'],
  ['sizebalance', '--rounds=20'],
  ['checkstages'], ['checkspec'], ['checkboot'], ['checkisolate'], ['checkidentity'], ['checkimage'],
  ['checkbody'], ['checkbodyrace'], ['checkfaults'], ['checkfacade'], ['checkforge'], ['checkmodels'],
  ['checkpose'], ['checkselectors'], ['checkscreens'], ['checkscope'],
  ['checkkits'], ['checktactics'], ['checkstale'], ['checkdescribe'],
  ['loadtest'],
  ['falsify', '--controls', '--tags=u1,u2,u3,u4,u5,u6'],
];

const arg = (n) => {
  const hit = process.argv.find((a) => a === `--${n}` || a.startsWith(`--${n}=`));
  return hit ? (hit.includes('=') ? hit.slice(n.length + 3) : true) : null;
};
const BAIL = arg('bail') === true;
const LOG = arg('log') ? resolve(ROOT, String(arg('log'))) : null;
const ONLY = arg('only') ? String(arg('only')).split(',').map((s) => s.trim()).filter(Boolean) : null;
const gates = GATES.filter(([name]) => !ONLY || ONLY.includes(name));

const cmdOf = ([name, ...args]) => ['node', `tools/${name}.mjs`, ...args].join(' ');

/**
 * What this run was a run OF. Everything here is something a reviewer would
 * otherwise have to ask someone about, and asking is what did not happen.
 */
function provenance() {
  const git = (...a) => {
    try { return execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
    catch { return null; }
  };
  const dirty = git('status', '--porcelain');
  const db = join(ROOT, 'data/airena.db');
  let stand = 'data/airena.db  MISSING';
  if (existsSync(db)) {
    try {
      const st = statSync(db);
      stand = `data/airena.db  ${(st.size / 1e6).toFixed(1)} MB, modified ${new Date(st.mtimeMs).toISOString().slice(0, 16).replace('T', ' ')}Z`;
    } catch { stand = 'data/airena.db  unreadable'; }
  }
  /* Only the variables that change what a gate does. A gate reading a key that
     is not there takes a different path and reports a different thing. */
  const env = ['AIRENA_DEV', 'AIRENA_OPS', 'AIRENA_SEED', 'OPENROUTER_API_KEY', 'FAL_KEY', 'ANTHROPIC_API_KEY']
    .map((k) => `${k}=${process.env[k] ? 'set' : '—'}`).join('  ');
  return [
    `run     ${new Date().toISOString()}  on ${hostname()}`,
    `tree    ${git('rev-parse', 'HEAD')?.slice(0, 10) || 'not a git checkout'} on ${git('rev-parse', '--abbrev-ref', 'HEAD') || '?'}`
      + `${dirty ? `, ${dirty.split('\n').filter(Boolean).length} uncommitted files` : ', clean'}`,
    `node    ${process.version} on ${process.platform}/${process.arch}`,
    `stand   ${stand}`,
    `env     ${env}`,
    `gates   ${gates.length}${ONLY ? ` (--only=${ONLY.join(',')})` : ''}${BAIL ? ' --bail' : ''}`,
  ];
}

if (arg('list') === true) {
  console.log('');
  for (const g of gates) console.log(`  ${cmdOf(g)}`);
  console.log(`\n  ${gates.length} gates\n`);
  process.exit(0);
}
if (!gates.length) {
  console.error(`\n  no gate matches --only=${ONLY.join(',')}\n  gates: ${GATES.map(([n]) => n).join(' ')}\n`);
  process.exit(1);
}

const started = Date.now();
const runs = [];
for (const gate of gates) {
  const [name, ...args] = gate;
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [`tools/${name}.mjs`, ...args], { stdio: 'inherit' });
  const code = r.status ?? 1;
  runs.push({ name, gate, code, signal: r.signal || null, ms: Date.now() - t0 });
  if (code !== 0 && BAIL) break;
}

try { rmSync(TRAIL, { force: true }); } catch { /* never existed */ }

const failed = runs.filter((r) => r.code !== 0);
const skipped = gates.length - runs.length;
const secs = (ms) => `${(ms / 1000).toFixed(1)}s`;

/* The wall: one line per gate, so a run answers "what is standing?" and not
   only "is everything standing?". */
console.log(`\n  GATES  ${runs.length - failed.length}/${runs.length} green${skipped ? `, ${skipped} not run (--bail)` : ''}   ${secs(Date.now() - started)}\n`);
for (const r of runs) {
  console.log(`  ${r.code === 0 ? '✓' : '✗'} ${r.name.padEnd(16)} ${String(secs(r.ms)).padStart(7)}`
    + `${r.code === 0 ? '' : `   code ${r.code}${r.signal ? ` signal ${r.signal}` : ''}`}`);
}

/*
 * The log is written whatever the outcome — a red run is the one a reviewer
 * most needs to date — and it is written before the exit below, so `--bail`
 * and a failure both still leave the file behind.
 */
if (LOG) {
  const lines = [
    ...provenance(),
    '',
    ...runs.map((r) => `${r.code === 0 ? 'OK  ' : 'FAIL'} ${r.name.padEnd(16)} ${secs(r.ms).padStart(7)}`
      + `${r.code === 0 ? '' : `   code ${r.code}${r.signal ? ` signal ${r.signal}` : ''}   ${cmdOf(r.gate)}`}`),
    ...(skipped ? [`SKIP ${skipped} gates not run (--bail stopped the run)`] : []),
    '',
    failed.length
      ? `${failed.length} of ${runs.length} DOWN in ${secs(Date.now() - started)}`
      : `ALL ${runs.length} GREEN in ${secs(Date.now() - started)}`,
    '',
  ];
  try {
    mkdirSync(dirname(LOG), { recursive: true });
    writeFileSync(LOG, lines.join('\n'));
    console.log(`  log    ${LOG}`);
  } catch (e) {
    console.error(`  log    could not be written to ${LOG} — ${e.message}`);
  }
}

if (failed.length) {
  console.error(`\n  ${failed.length} GATE${failed.length > 1 ? 'S' : ''} DOWN — repeat exactly:`);
  for (const r of failed) console.error(`    ${cmdOf(r.gate)}`);
  console.error('');
  process.exit(failed[0].code);
}
console.log('\n  ALL GATES GREEN\n');
