#!/usr/bin/env node
/**
 * The measured half of `docs/EXPERIMENT.md`, regenerated from the artefacts.
 *
 *   node tools/report.mjs
 *   node tools/report.mjs --force     # publish anyway, degradation and all
 *
 * The prose in that document is written by hand. Every number in it is not:
 * this walks the JSON under reports/, the provenance beside each brain, and
 * replaces the block between the two markers. Hand-copied numbers go stale in
 * the same silent way a hand-copied prompt does, and a write-up that quietly
 * describes a previous version of the results is worse than none — it is the
 * one artefact a reader has no way to check against.
 *
 * ── what the guard below is for ─────────────────────────────────────────────
 *
 * Regenerating from "whatever is on disk" has a failure mode this tool met
 * during its own review: a reviewer ran the README's commands in order, and a
 * 40-round tournament rewrote "0 brain faults across 2450 matches" as "across
 * 1440 matches", replaced a spread measured over 240 matches per brain with one
 * over 48, and dropped the `stub` control column out of the grid — in 0.03 s,
 * printing "refreshed the measured block", exit 0. The two artefacts it fused
 * were not even from the same session. Nothing in the emitted document recorded
 * which run produced it, so nothing about the document could be checked.
 *
 * So two things, and neither is optional. Every published block carries a
 * PROVENANCE stamp — which artefacts, what power, when they were written,
 * whether falsify's controls held, and when the simulation they measure last
 * changed. And a run weaker than the floors below, weaker than the block already
 * published, or older than `src/core`, is REFUSED rather than written. A
 * write-up is allowed to get better on its own and is not allowed to get
 * quietly worse.
 */

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { FIGHTERS, SKILLS, ARENA_HALF, MATCH_SECONDS, SUDDEN_DEATH_AT, SUDDEN_DEATH_RAMP, TICK_HZ, THINK_HZ, OBSTACLES } from '../src/core/config.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FORCE = process.argv.includes('--force');

/** An artefact plus the two facts about it the document has to carry: when it was written, and how. */
function artefact(p) {
  const full = join(ROOT, p);
  if (!existsSync(full)) return null;
  return { path: p, json: JSON.parse(readFileSync(full, 'utf8')), mtime: statSync(full).mtime.toISOString() };
}

const tourA = artefact('reports/tournament.json');
const falsA = artefact('reports/falsify.json');
const tour = tourA?.json ?? null;
const fals = falsA?.json ?? null;

/**
 * The power the surrounding prose already asserts, as the knobs a reader turns.
 *
 * Expressed as ROUNDS rather than as total matches, because the total is
 * population size times rounds and the population is the thing that legitimately
 * changes. The numbers are the ones the shipped block was measured at: the grid
 * is `--rounds=50 --with-stub` (7x7x50 = the 2450 matches the fault claim is
 * quoted over) and the falsification set is `--rounds=40 --react=6` (6x40 = the
 * 240 matches per brain the permutation spread is quoted over).
 */
const FLOOR = { tournamentRounds: 50, falsifyRounds: 40, falsifyReactRounds: 6, tags: 6 };

const problems = [];
const refuse = (why) => problems.push(why);

const pct = (v) => (v == null ? '—' : `${(v * 100).toFixed(0)}%`);
const pct1 = (v) => (v == null ? '—' : `${(v * 100).toFixed(1)}%`);
const n = (v) => (v == null ? '—' : (Number.isInteger(v) ? String(v) : String(Math.round(v * 1000) / 1000)));

const L = [];
const say = (s = '') => L.push(s);

// ---------------------------------------------------------------------------
say('## The generation lane, as it ran');
say();

const brainDir = join(ROOT, 'brains');
const tags = readdirSync(brainDir)
  .filter((d) => statSync(join(brainDir, d)).isDirectory() && d !== 'stub')
  .sort();

let attempts = 0, accepted = 0, cost = 0, ms = 0, chars = 0, records = 0;
const rows = [];
for (const tag of tags) {
  for (const id of ['octopus', 'gorilla']) {
    const p = join(brainDir, tag, `${id}.json`);
    if (!existsSync(p)) continue;
    const r = JSON.parse(readFileSync(p, 'utf8'));
    records++;
    attempts += r.attempts.length;
    if (r.accepted) accepted++;
    cost += r.costUsd || 0;
    ms += r.wallMs || 0;
    const c = r.accepted ? r.attempts[r.accepted.attempt]?.chars ?? 0 : 0;
    chars += c;
    rows.push(`| ${tag} | ${id} | ${r.model}/${r.effort} | ${r.attempts.length} | ${r.accepted ? 'yes' : 'NO'} | ${c} | $${(r.costUsd || 0).toFixed(3)} | ${((r.wallMs || 0) / 1000).toFixed(0)} s |`);
  }
}

say(`| tag | fighter | model | attempts | accepted | chars | cost | wall |`);
say(`|---|---|---|---|---|---|---|---|`);
rows.forEach((r) => say(r));
say();
say(`**${accepted} of ${records} brains accepted**, ${attempts} generator calls in total — `
  + `${attempts === records ? 'every one on the first attempt, no repair turn used' : `${attempts - records} repair turn(s) used`}. `
  + `Mean accepted source ${records ? Math.round(chars / Math.max(1, accepted)) : 0} characters. `
  + `Total $${cost.toFixed(2)} and ${(ms / 1000 / 60).toFixed(0)} minutes of model time.`);
say();

// ---------------------------------------------------------------------------
if (tour) {
  say('## Result 1 — the grid, and where this draw landed in the bracket');
  say();
  const gen = tour.tags.filter((t) => t !== 'stub');
  say('Octopus win rate. Row = which octopus brain, column = which gorilla brain.');
  say();
  say(`| | ${tour.tags.join(' | ')} | **mean** |`);
  say(`|---|${tour.tags.map(() => '---').join('|')}|---|`);
  for (const o of tour.tags) {
    const cells = tour.tags.map((g) => {
      const c = tour.cells.find((x) => x.octopus === o && x.gorilla === g);
      return c ? pct(c.octWinRate) : '—';
    });
    say(`| **${o}** | ${cells.join(' | ')} | **${pct(tour.octStrength[o])}** |`);
  }
  say();
  say(`- **Octopus win rate: ${pct(tour.mechanicsOctWinRate)}**, averaged over the ${gen.length}x${gen.length} generated grid. `
    + `Read it with the bracket above in mind: the constants were chosen so that a strong-kiter population `
    + `and an ordinary one sit either side of 50%, and this is one draw from the same generator.`);
  say(`- **Mind: the octopus brains span ${pct(tour.octSpread)} of win rate and the gorilla brains ${pct(tour.gorSpread)}**, `
    + `over an identical field of opponents and identical constants.`);
  say(`- Mean match **${tour.meanSeconds.toFixed(1)} s**, **${pct(tour.meanTimeoutRate)}** decided on the clock, `
    + `melee uptime **${pct(tour.meanMeleeUptime)}**.`);
  if (tour.hitRate) {
    say(`- Hit rates: laser **${pct(tour.hitRate.laser)}**, smash **${pct(tour.hitRate.smash)}**, charge **${pct(tour.hitRate.charge)}**. `
      + `Uses per match: ${Object.entries(tour.usesPerMatch || {}).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(', ')}.`);
  }
  const totalMatches = tour.tags.length * tour.tags.length * tour.rounds;
  const totalFaults = tour.cells.reduce((a, c) => a + c.faults.octopus + c.faults.gorilla, 0);
  say(`- **${totalFaults} brain fault${totalFaults === 1 ? '' : 's'} across ${totalMatches} matches.** `
    + `Nothing was hand-corrected; this is the source the model returned, run unmodified.`);
  say();
}

// ---------------------------------------------------------------------------
if (fals) {
  say('## Result 2 — the brains are closed-loop on the opponent');
  say();
  say('Each brain is run twice in lockstep inside one match. Instance A perceives the world and');
  say('drives the fight; instance B perceives an ablated copy and its orders are discarded. The');
  say('world is therefore identical for both, so the only thing that can make them disagree is the');
  say('removed channel. Figures are the extra fraction of thoughts whose *intent* changes, over and');
  say('above the identity control — a brain that ignores a channel scores zero on it.');
  say();
  say('The column that carries the spectacle claim is **cast hidden**: `p.enemy.casting` is the field that');
  say('says *what* the opponent is winding up and *how long* is left of it, so a brain scoring zero there');
  say('never dodges a wind-up, only a body. It is deliberately separated from **position pinned**, which is');
  say('the far easier signal and the one a brain gets for free by walking towards a number. `p.enemy.busy`');
  say('is left live in the cast-hidden run — it still says *that* something is happening — which makes that');
  say('column a lower bound rather than a flattering one.');
  say();
  const react = Object.entries(fals.reactivity);
  const netOf = (v, x) => Math.max(0, (v[x] ?? 0) - v.identity);
  say('| brain | control | opponent\'s cast hidden | opponent\'s position pinned | opponent events dropped | health frozen |');
  say('|---|---|---|---|---|---|');
  for (const [k, v] of react) {
    say(`| ${k} | ${pct1(v.identity)} | **${pct1(netOf(v, 'castingHidden'))}** | ${pct1(netOf(v, 'posPinned'))} `
      + `| ${pct1(netOf(v, 'opponentEvents'))} | ${pct1(netOf(v, 'healthFrozen'))} |`);
  }
  say();
  {
    const cast = react.map(([, v]) => netOf(v, 'castingHidden'));
    const pos = react.map(([, v]) => netOf(v, 'posPinned'));
    const both = react.map(([, v]) => netOf(v, 'enemyPinned'));
    const gaps = react.map(([, v]) => Math.abs(netOf(v, 'enemyPinned') - netOf(v, 'posPinned')));
    const lo = (xs) => pct1(Math.min(...xs)), hi = (xs) => pct1(Math.max(...xs));
    const pts = (v) => `${(v * 100).toFixed(1)} points`;
    say(`All ${react.length} brains change what they do when the opponent's wind-up is hidden from them, on `
      + `${lo(cast)}–${hi(cast)} of thoughts, against an identity control of `
      + `${pct1(Math.max(...react.map(([, v]) => v.identity)))}. Pinning the opponent's position instead scores `
      + `${lo(pos)}–${hi(pos)}: much the larger effect, and much the cheaper one to have — a brain gets it by `
      + 'walking towards a number, where the telegraph column requires it to act on a threat that has not landed yet.');
    say();
    /*
     * The footnote, not a table column: the number the first write-up led with
     * is a fusion of the two channels beside it, and the arithmetic below is
     * what says which one carried it. Regenerated rather than hand-copied so it
     * cannot describe a previous run.
     */
    say(`_Footnote — the earlier write-up published a single **enemy pinned** column, ${lo(both)}–${hi(both)}, which pinned`);
    say(`position and telegraph together. Pinning position ALONE reproduces it to within ${pts(Math.max(...gaps))} on every one`);
    say(`of the ${react.length} brains, so that column measured the position channel and was never evidence about the`);
    say('telegraph. It is kept measured here for continuity with the earlier figure, and superseded by the two');
    say('columns above._');
    say();
  }
  if (fals.diversity) {
    say('## Result 0 — one model, one prompt, six different programs');
    say();
    say('Each pair of same-fighter brains is run in lockstep inside one match: one drives, the');
    say('other perceives the identical world and has its orders discarded. **Policy disagreement**');
    say('is how often two programs handed the same situation want different things — two copies of');
    say('one program score 0, which is what the control column checks. **Vocabulary overlap** is a');
    say('second, cheaper angle: which api verbs and perception fields each source mentions at all.');
    say();
    say('| fighter | control (self vs self) | policy disagreement (mean / closest pair) | vocabulary overlap (mean / worst) | source lengths |');
    say('|---|---|---|---|---|');
    for (const [who, d] of Object.entries(fals.diversity)) {
      say(`| ${who} | ${pct1(d.control)} | **${pct1(d.policyMean)}** / ${pct1(d.policyMin)} | `
        + `${d.vocabularyMean.toFixed(3)} / ${d.vocabularyMax.toFixed(3)} | `
        + `${Object.values(d.sourceChars).join(', ')} chars |`);
    }
    say();
  }
  say('## Result 3 — the six programs are not interchangeable');
  say();
  say('The spread of win rates across same-fighter brains is tested against the null "the brain');
  say('labels are exchangeable", by permuting them over the pooled match outcomes within each');
  say('opponent column. A spread on its own is not evidence; five identical coins produce one.');
  say();
  say('Note what this does and does not establish. It rejects "these six are the same fighter", and');
  say('that is all. Six programs differing only in one hardcoded constant would also reject it, so');
  say('this is a floor under the claim, not the claim itself — Result 0 is what shows the six are');
  say('different *policies* rather than one policy with the numbers moved. The negative control');
  say('below is six labels bound to a single program, and it must fail to reject.');
  say();
  for (const [side, r] of Object.entries(fals.permutation)) {
    say(`- **${side}**: ${Object.entries(r.winRates).map(([t, v]) => `${t} ${pct(v)}`).join(', ')} — `
      + `spread **${(r.spread * 100).toFixed(1)} points** over ${r.matchesPerBrain} matches each, `
      + `**p ${r.p < 1 / r.trials ? `< ${(1 / r.trials).toExponential(1)}` : `= ${r.p.toFixed(5)}`}** `
      + `(${r.trials} permutations).`);
  }
  /*
   * The control is the half that makes the test worth printing: the same
   * machinery, run on labels bound to one program, has to come back unable to
   * reject. Without it a reader has no way to tell a real result from a test
   * that rejects everything.
   *
   * The verdict used to be a constant. `p = ${nc.p.toFixed(3)} — does not
   * reject, as it must not` was emitted with no test on `nc.p` at all: setting
   * the control to p = 0.00007 and spread 61 points published "spread 61.0
   * points, p = 0.000 — does not reject, as it must not", exit 0. The project's
   * headline evidence contained a sentence that could not be false, which is
   * the same as containing no control. It is now read, judged, and refused.
   *
   * Printed once, because it IS once: falsify binds every label to one program,
   * so the octopus and gorilla control runs are the same matches scored in
   * opposite polarity. Two lines of the same measurement read as corroboration
   * that was never there.
   */
  const controls = Object.values(fals.permutation).map((r) => r.negativeControl).filter(Boolean);
  const minP = fals.controls?.negativeControlMinP ?? 0.01;
  if (!controls.length) {
    refuse('reports/falsify.json carries no permutation negative control — re-run tools/falsify.mjs');
  } else {
    const shared = controls[0].sharedAcrossSides || controls.every((c) => c.p === controls[0].p);
    for (const nc of shared ? [controls[0]] : controls) {
      const held = nc.p >= minP;
      if (!held) {
        refuse(`the permutation negative control REJECTED (p = ${nc.p.toFixed(5)}, needs p >= ${minP}): `
          + `${controls.length > 1 && !shared ? 'one side of ' : ''}the test rejects a null that is true by `
          + 'construction, so the headline p is not evidence of anything');
      }
      say(`- _negative control${shared ? ', one run scored for both sides' : ''}: all ${fals.tags?.length ?? 'six'} labels `
        + `bound to \`${nc.brain}\` on disjoint seed blocks — spread ${(nc.spread * 100).toFixed(1)} points, p = ${nc.p.toFixed(3)}, `
        + `${held ? `which does not reject, as it must not (the threshold is p ≥ ${minP})` : `which **REJECTS at p < ${minP}, and must not** — this run is not publishable`}._`);
    }
  }
  say();
}

// ---------------------------------------------------------------------------
say('## The constants, as shipped');
say();
say(`Arena ${ARENA_HALF * 2} x ${ARENA_HALF * 2} m with ${OBSTACLES.length} blocks. `
  + `Simulation ${TICK_HZ} Hz, thought ${THINK_HZ} Hz. `
  + `Sudden death from ${SUDDEN_DEATH_AT} s at ${SUDDEN_DEATH_RAMP} of maximum hp per second per second; `
  + `backstop clock ${MATCH_SECONDS} s.`);
say();
say('| | octopus | gorilla |');
say('|---|---|---|');
for (const k of ['hp', 'radius', 'maxSpeed', 'accel', 'turnRate', 'mass', 'jumpHeight']) {
  say(`| ${k} | ${n(FIGHTERS.octopus[k])} | ${n(FIGHTERS.gorilla[k])} |`);
}
say();
const fields = ['windup', 'airborne', 'dashSeconds', 'recover', 'cooldown', 'damage', 'range',
  'distance', 'dashSpeed', 'halfAngle', 'knockback', 'stun', 'iframes', 'moveScale', 'turnScale'];
say(`| skill | ${fields.join(' | ')} |`);
say(`|---|${fields.map(() => '---').join('|')}|`);
for (const [name, s] of Object.entries(SKILLS)) {
  say(`| ${name} | ${fields.map((f) => (s[f] === undefined ? '' : n(s[f]))).join(' | ')} |`);
}
say();

// ---------------------------------------------------------------------------
// provenance, and the guard that reads it back
// ---------------------------------------------------------------------------

const target = join(ROOT, 'docs', 'EXPERIMENT.md');
const START = '<!-- MEASURED:BEGIN -->';
const END = '<!-- MEASURED:END -->';
const STAMP = '<!-- PROVENANCE ';

/**
 * When the world these numbers were measured in was last changed.
 *
 * Every figure in this document is a property of `src/core` as much as of the
 * brains, and the two drift apart silently: while this guard was being written
 * `src/core/sim.js` was edited under a finished artefact, and the very same
 * falsification run that had returned a negative control of p = 0.87 returned
 * p = 0.002 afterwards. Same tool, same brains, different world. An artefact
 * older than the simulation that produced it describes a fight that no longer
 * happens, and nothing in the tables says so.
 */
function worldTouchedAt() {
  const dirs = [join(ROOT, 'src', 'core'), join(ROOT, 'src', 'brain')];
  let newest = { at: 0, file: null };
  for (const d of dirs) {
    if (!existsSync(d)) continue;
    for (const f of readdirSync(d).filter((x) => x.endsWith('.js'))) {
      const t = statSync(join(d, f)).mtimeMs;
      if (t > newest.at) newest = { at: t, file: `${d.slice(ROOT.length + 1)}/${f}` };
    }
  }
  return newest;
}
const world = worldTouchedAt();

const stamp = {
  generatedAt: new Date().toISOString(),
  world: world.file && { newestFile: world.file, touchedAt: new Date(world.at).toISOString() },
  tournament: tourA && {
    tags: tour.tags, rounds: tour.rounds,
    matches: tour.tags.length * tour.tags.length * tour.rounds,
    writtenAt: tourA.mtime,
  },
  falsify: falsA && {
    tags: fals.tags, rounds: fals.rounds, reactRounds: fals.reactRounds ?? null,
    matchesPerBrain: (fals.tags?.length ?? 0) * fals.rounds,
    controlsPassed: fals.controls?.passed ?? null,
    writtenAt: falsA.mtime,
  },
};

/*
 * "How long before this block" rather than "how old", because the age of an
 * artefact stops being true the moment the document is read and the GAP does
 * not. It is also the number that catches the failure this stamp exists for: a
 * block whose two artefacts were written hours apart was assembled from two
 * different sessions.
 */
const before = (iso) => {
  const m = (Date.parse(stamp.generatedAt) - Date.parse(iso)) / 60000;
  return m < 90 ? `${m.toFixed(0)} min before this block` : `${(m / 60).toFixed(1)} h before this block`;
};
say('_Provenance of every number above:_');
if (stamp.tournament) {
  say(`- \`reports/tournament.json\` — \`${stamp.tournament.tags.join(',')}\` x ${stamp.tournament.rounds} rounds `
    + `= ${stamp.tournament.matches} matches, written ${stamp.tournament.writtenAt} (${before(stamp.tournament.writtenAt)}).`);
}
if (stamp.falsify) {
  say(`- \`reports/falsify.json\` — \`${stamp.falsify.tags.join(',')}\` x ${stamp.falsify.rounds} rounds `
    + `= ${stamp.falsify.matchesPerBrain} matches per brain, reactivity over ${stamp.falsify.reactRounds ?? '?'} opponents each, `
    + `controls ${stamp.falsify.controlsPassed === true ? 'PASSED' : stamp.falsify.controlsPassed === false ? 'FAILED' : 'not recorded'}, `
    + `written ${stamp.falsify.writtenAt} (${before(stamp.falsify.writtenAt)}).`);
}
if (stamp.world) {
  const after = [stamp.tournament, stamp.falsify].filter(Boolean)
    .filter((a) => world.at > Date.parse(a.writtenAt)).length;
  say(`- The simulation they were measured in: \`src/core\` and \`src/brain\` last changed `
    + `${stamp.world.touchedAt} (\`${stamp.world.newestFile}\`), `
    + `${after ? `**AFTER ${after === 2 ? 'both artefacts' : 'one of the artefacts'} above — these numbers describe a simulation that has since moved**` : 'before both artefacts above'}.`);
}
say(`- Regenerated by \`node tools/report.mjs\` at ${stamp.generatedAt} from those files and \`src/core/config.js\`.`);
say();
say(`${STAMP}${JSON.stringify(stamp)} -->`);

const block = `${START}\n\n${L.join('\n')}\n\n${END}`;

// ---------------------------------------------------------------------------
// the guard
// ---------------------------------------------------------------------------

if (!tour) refuse('reports/tournament.json is missing — Result 1 would publish as an empty section');
if (!fals) refuse('reports/falsify.json is missing — Results 0, 2 and 3 would publish as empty sections');

if (fals) {
  if (fals.controls && fals.controls.passed === false) {
    refuse(`falsify's own controls failed (${fals.controls.failures.join('; ')}) — nothing measured beside `
      + 'a broken control is publishable');
  }
  if (!Object.values(fals.reactivity ?? {}).every((v) => 'castingHidden' in v && 'posPinned' in v)) {
    refuse('reports/falsify.json predates the position/telegraph split — Result 2 would publish the fused '
      + '`enemyPinned` number as though it were evidence about the telegraph. Re-run tools/falsify.mjs');
  }
  if (fals.rounds < FLOOR.falsifyRounds) refuse(`falsify ran ${fals.rounds} rounds, the published claim needs ${FLOOR.falsifyRounds}`);
  if ((fals.reactRounds ?? FLOOR.falsifyReactRounds) < FLOOR.falsifyReactRounds) {
    refuse(`falsify's reactivity ran over ${fals.reactRounds} opponents per brain, the published claim needs ${FLOOR.falsifyReactRounds}`);
  }
  if ((fals.tags?.length ?? 0) < FLOOR.tags) refuse(`falsify covered ${fals.tags?.length ?? 0} brains, the published claim needs ${FLOOR.tags}`);
}
if (tour) {
  if (tour.rounds < FLOOR.tournamentRounds) refuse(`the tournament ran ${tour.rounds} rounds, the published claim needs ${FLOOR.tournamentRounds}`);
  if (tour.tags.length < FLOOR.tags) refuse(`the tournament covered ${tour.tags.length} tags, the published claim needs ${FLOOR.tags}`);
}
/*
 * The world has to be older than the measurement of it.
 *
 * mtime rather than a content hash, because the question is ordering — "was
 * this simulated before or after the rules last moved" — and a hash answers
 * "is it the same as some remembered one", which needs somewhere to remember it
 * and goes stale on a whitespace edit. A touched-but-unchanged file costs a
 * re-run of two commands; an untouched-but-changed one cannot happen.
 */
for (const [name, a] of [['reports/tournament.json', tourA], ['reports/falsify.json', falsA]]) {
  if (a && world.file && world.at > Date.parse(a.mtime)) {
    refuse(`${name} was written ${((world.at - Date.parse(a.mtime)) / 60000).toFixed(0)} min BEFORE `
      + `${world.file} last changed — it measures a simulation that no longer exists. Re-run it`);
  }
}

/*
 * One population per document.
 *
 * The two artefacts are read independently and were once fused without anyone
 * noticing: a `rounds:40` tournament from one session and a `rounds:8, 6 tags`
 * falsify written by a concurrent process, published side by side as though
 * they described the same six brains. Requiring falsify's population to be a
 * subset of the grid's is the cheapest statement of "these tables are about the
 * same thing", and it costs nothing when they are.
 */
if (tour && fals && fals.tags) {
  const stray = fals.tags.filter((t) => !tour.tags.includes(t));
  if (stray.length) {
    refuse(`falsify measured [${stray.join(', ')}], which the tournament grid does not contain `
      + `([${tour.tags.join(', ')}]) — the two tables would describe different populations`);
  }
}

/*
 * And the ratchet: whatever was published last time is also a floor.
 *
 * The floors above are the power the hand-written prose asserts, and they go
 * stale the moment someone legitimately runs something bigger. The previous
 * stamp does not: it is what a reader of the current document has already been
 * told. Publishing fewer matches than the block already claims is the exact
 * failure this guard exists for, and it does not depend on anyone remembering
 * to raise a constant.
 */
const cur = existsSync(target) ? readFileSync(target, 'utf8') : '';
const prevRaw = cur.match(new RegExp(`${STAMP}([\\s\\S]*?) -->`));
let prev = null;
try { prev = prevRaw ? JSON.parse(prevRaw[1]) : null; } catch { prev = null; }
if (prev) {
  const weaker = (name, now, was) => {
    if (typeof was === 'number' && typeof now === 'number' && now < was) {
      refuse(`${name} would go from ${was} to ${now} — the published block is stronger than this run`);
    }
  };
  weaker('the tournament grid', stamp.tournament?.matches, prev.tournament?.matches);
  weaker('matches per brain in the permutation test', stamp.falsify?.matchesPerBrain, prev.falsify?.matchesPerBrain);
  weaker('reactivity opponents per brain', stamp.falsify?.reactRounds, prev.falsify?.reactRounds);
  weaker('brains in the falsification set', stamp.falsify?.tags?.length, prev.falsify?.tags?.length);
} else if (cur.includes(START)) {
  /*
   * A block with no stamp is one written before this guard existed, so its
   * power is unknown and the floors above are all there is. Say so rather than
   * pretend the ratchet ran.
   */
  console.log('  note: the published block carries no provenance stamp, so only the floors were checked.');
}

if (problems.length && !FORCE) {
  console.error(`\nREFUSING to rewrite ${target} — the artefacts on disk are not publishable:\n`);
  for (const p of problems) console.error(`  - ${p}`);
  console.error('\n  fix it:   node tools/tournament.mjs --rounds=50 --with-stub && node tools/falsify.mjs');
  console.error('  or force: node tools/report.mjs --force   (and own the degradation)\n');
  process.exit(1);
}
if (problems.length) {
  console.error('\n  --force: publishing a degraded block anyway:');
  for (const p of problems) console.error(`    - ${p}`);
  console.error('');
}

if (!existsSync(target)) {
  writeFileSync(target, `# Airena — the experiment\n\n${block}\n`);
  console.log(`wrote ${target} (new file)`);
} else if (!cur.includes(START)) {
  writeFileSync(target, `${cur.trimEnd()}\n\n${block}\n`);
  console.log(`appended the measured block to ${target}`);
} else {
  writeFileSync(target, cur.replace(new RegExp(`${START}[\\s\\S]*?${END}`), () => block));
  console.log(`refreshed the measured block in ${target}`);
}
console.log(`  tournament ${stamp.tournament ? `${stamp.tournament.matches} matches` : '—'}, `
  + `falsify ${stamp.falsify ? `${stamp.falsify.matchesPerBrain}/brain, controls ${stamp.falsify.controlsPassed}` : '—'}`);
