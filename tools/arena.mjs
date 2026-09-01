#!/usr/bin/env node
/**
 * The headless runner. A hundred fights in a few seconds, and the numbers that
 * say whether the concept is working.
 *
 *   node tools/arena.mjs --rounds=100 --tag=v1
 *   node tools/arena.mjs --rounds=200 --octopus=v1 --gorilla=stub
 *
 * ── why the metrics are what they are ───────────────────────────────────────
 *
 * One good-looking fight proves nothing: with asymmetric skills the outcome is
 * decided by the constants long before it is decided by the brains. So the
 * report is in three parts.
 *
 *  - BALANCE answers "is the fight fair and the right length". That is what
 *    the constants are tuned against.
 *  - EXECUTION answers "does this brain drive its body competently" — hit
 *    rates, cooldown uptime, faults.
 *  - ENGAGEMENT answers the question the whole project is about: is this brain
 *    REACTING to an opponent, or is it running a fixed routine that happens to
 *    look busy? Two of these are built specifically to catch a fake.
 *      * telegraphResponse — of all the windows in which the opponent was
 *        visibly winding something up, in how many did this brain change what
 *        it was doing? A fixed routine scores near its own base rate.
 *      * enemyCorrelation — the mean of dot(chosen move direction, direction
 *        away from the opponent). A brain that ignores the opponent's position
 *        scores ~0 no matter how much it moves; a kiter scores positive, a
 *        chaser negative. It cannot be faked by moving a lot.
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compileBrain } from '../src/brain/host.js';
import { runMatch } from '../src/core/match.js';
import { SKILLS } from '../src/core/config.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function arg(name, dflt) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (hit) return hit.slice(name.length + 3);
  return process.argv.includes(`--${name}`) ? true : dflt;
}

const ROUNDS = Number(arg('rounds', 60));
const TAG = String(arg('tag', 'v1'));
const JSON_OUT = arg('json', false);

function brainPath(id, tag) {
  if (tag === 'stub') return resolve(ROOT, 'brains/stub', `${id}.js`);
  return resolve(ROOT, 'brains', tag, `${id}.js`);
}

function load(id, tag) {
  const p = brainPath(id, tag);
  if (!existsSync(p)) {
    // A stack trace here tells a reader nothing they can act on. Say what is
    // missing and what to type.
    console.error(`\nno ${id} brain for tag "${tag}" (looked in ${p})\n`);
    console.error('  available tags: ' + available().join(', '));
    console.error('  generate one:   node tools/brainforge.mjs --all --tag=' + tag + '\n');
    process.exit(1);
  }
  return { source: readFileSync(p, 'utf8'), path: p };
}

/**
 * The same treatment `load` gives a missing file, for a file that is present
 * and does not parse. A brain is a generated program and a bad one is an
 * ordinary outcome; the raw V8 trace names `octopus.brain.js`, a file that
 * exists nowhere, and buries the one line that says what is wrong with it.
 */
function compile(id, tag) {
  try {
    return compileBrain(sources[id].source, id);
  } catch (err) {
    console.error(`\n${id} brain for tag "${tag}" does not compile (${sources[id].path})`);
    console.error(`  ${err.message}`);
    console.error(`  regenerate it:  node tools/brainforge.mjs --fighter=${id} --tag=${tag}\n`);
    process.exit(1);
  }
}

function available() {
  const dir = resolve(ROOT, 'brains');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((d) => statSync(resolve(dir, d)).isDirectory()).sort();
}

const tags = { octopus: String(arg('octopus', TAG)), gorilla: String(arg('gorilla', TAG)) };
const other = (id) => (id === 'octopus' ? 'gorilla' : 'octopus');
const sources = { octopus: load('octopus', tags.octopus), gorilla: load('gorilla', tags.gorilla) };

// ---------------------------------------------------------------------------

const acc = {
  octopus: blank('octopus'),
  gorilla: blank('gorilla'),
};
const lengths = [];
let draws = 0, timeouts = 0;

function blank(id) {
  return {
    id, wins: 0, hpLeft: [], damageDealt: 0, damageTaken: 0,
    thinks: 0, faults: 0, micros: 0, distance: 0, verbs: {},
    uses: {}, hits: {}, misses: {}, missReasons: {},
    /**
     * The controlled comparison. `act` counts thoughts on which the brain did
     * something new — started a skill, or changed its standing movement order.
     * Splitting that count by whether the opponent was visibly winding up turns
     * "it looks busy" into "it is busier WHEN IT MATTERS", which a fixed
     * routine cannot produce however busy it is.
     */
    teleThinks: 0, teleActs: 0, calmThinks: 0, calmActs: 0,
    corrSum: 0, corrN: 0,
    distSum: 0, distN: 0, meleeThinks: 0, visibleThinks: 0,
    losOrders: 0, losOrdersVisible: 0,
    cooldownIdle: {}, cooldownSamples: 0,
    saidLines: 0, sayTexts: [],
  };
}

const t0 = Date.now();
for (let round = 0; round < ROUNDS; round++) {
  const seed = 1000 + round;
  const brains = {
    octopus: compile('octopus', tags.octopus),
    gorilla: compile('gorilla', tags.gorilla),
  };

  /** Per-fighter rolling state the engagement metrics need. */
  const watch = { octopus: { lastDir: null }, gorilla: { lastDir: null } };
  /**
   * "Changed its mind" has to mean a change of INTENT, not a change of
   * floating-point bits. Re-aiming a chase order at a moving target rewrites
   * the numbers every single thought; only a turn of more than this counts.
   */
  const TURN_COS = Math.cos((40 * Math.PI) / 180);
  /*
   * "In melee" is the reach of the only skill that defines it: the cone's range
   * plus both radii, which is exactly the test `inCone` performs. It was
   * `range + 2.0` for a while, which is neither fighter's radius and agreed
   * with the simulation's own counter only by coincidence.
   *
   * ── РАДИУСЫ БЕРУТСЯ ИЗ ПЕРЦЕПЦИИ, А НЕ ИЗ ТАБЛИЦЫ ────────────────────────
   *
   * Здесь стояла сумма радиусов двух архетипов — одно число на весь прогон.
   * Записей больше нет, и постоянного числа тоже: радиус принадлежит телу
   * бойца и у каждого свой. `p.self.radius` и `p.enemy.radius` — те же самые
   * `def.radius`, что использует `inCone` в симуляции, поэтому порог остаётся
   * ровно тем, чем был обещан, при любых телах — включая бой двух тел разного
   * размера, где ОДНОГО правильного числа не существует вовсе.
   */
  const meleeReach = (p) => SKILLS.smash.range + p.self.radius + p.enemy.radius;

  const observer = (id, p, q, calls) => {
    const a = acc[id];
    const w = watch[id];

    // distance held
    a.distSum += p.enemy.dist; a.distN++;
    if (p.enemy.dist < meleeReach(p)) a.meleeThinks++;
    if (p.enemy.visible) a.visibleThinks++;

    // did this brain steer with the opponent in mind?
    if (q.move && (q.move.kind === 'dir' || q.move.kind === 'point')) {
      let dx, dz;
      if (q.move.kind === 'dir') { dx = q.move.dx; dz = q.move.dz; }
      else { dx = q.move.x - p.self.x; dz = q.move.z - p.self.z; }
      const l = Math.hypot(dx, dz);
      if (l > 1e-6) {
        const ax = p.self.x - p.enemy.x, az = p.self.z - p.enemy.z;
        const al = Math.hypot(ax, az);
        if (al > 1e-6) { a.corrSum += (dx / l) * (ax / al) + (dz / l) * (az / al); a.corrN++; }
      }
    }

    // line-of-sight discipline: did it start a beam it could actually land?
    if (q.use && SKILLS[q.use.name] && SKILLS[q.use.name].needsLos) {
      a.losOrders++;
      if (p.enemy.visible) a.losOrdersVisible++;
    }

    // cooldown idling: a ready skill left unused is a real cost, whatever the reason
    for (const [k, v] of Object.entries(p.self.cooldowns)) {
      if (v <= 0 && !p.self.busy) a.cooldownIdle[k] = (a.cooldownIdle[k] || 0) + 1;
    }
    a.cooldownSamples++;

    // the controlled comparison — see the field comment on teleThinks
    const tele = !!(p.enemy.casting && p.enemy.casting.telegraph);
    let dir = null;
    if (q.move) {
      if (q.move.kind === 'stop') dir = { x: 0, z: 0 };
      else {
        const mx = q.move.kind === 'dir' ? q.move.dx : q.move.x - p.self.x;
        const mz = q.move.kind === 'dir' ? q.move.dz : q.move.z - p.self.z;
        const l = Math.hypot(mx, mz);
        dir = l > 1e-6 ? { x: mx / l, z: mz / l } : { x: 0, z: 0 };
      }
    }
    let changed = !!q.use;
    if (!changed && dir) {
      const prev = w.lastDir;
      if (!prev) changed = true;
      else if (dir.x * prev.x + dir.z * prev.z < TURN_COS) changed = true;
    }
    if (tele) { a.teleThinks++; if (changed) a.teleActs++; }
    else { a.calmThinks++; if (changed) a.calmActs++; }
    if (dir) w.lastDir = dir;
    if (q.say) { a.saidLines++; if (a.sayTexts.length < 40) a.sayTexts.push(q.say); }
  };

  const { result } = runMatch(brains, { seed, observer });
  lengths.push(result.seconds);
  if (result.winner) acc[result.winner].wins++; else draws++;
  if (result.reason.startsWith('timeout')) timeouts++;

  for (const id of ['octopus', 'gorilla']) {
    const a = acc[id], s = result[id];
    a.hpLeft.push(s.hpFrac);
    a.damageDealt += s.damageDealt; a.damageTaken += s.damageTaken;
    a.thinks += s.thinks; a.faults += s.faults; a.micros += s.thinkMicros;
    a.distance += s.distanceTravelled;
    for (const [k, v] of Object.entries(s.uses)) a.uses[k] = (a.uses[k] || 0) + v;
    for (const [k, v] of Object.entries(s.hits)) a.hits[k] = (a.hits[k] || 0) + v;
    for (const [k, v] of Object.entries(s.misses)) a.misses[k] = (a.misses[k] || 0) + v;
    for (const [k, v] of Object.entries(s.verbs)) a.verbs[k] = (a.verbs[k] || 0) + v;
  }
  /*
   * Three kinds of log line, because the simulation writes a miss three ways.
   *
   * Reading only `type:'miss'` made the breakdown silent about the skill it was
   * most needed for: over the 200 seeds this tool uses, l1 vs l1, the gorilla
   * charged 1137 times, hit 170, and the printed reason line named NONE of the
   * 967 non-hits — the handful the simulation did count reached
   * `stats.misses.charge` and no line of output. That silence sat directly under
   * the charge hit rate, which is the number it exists to explain. `dashStep`
   * never calls the code that writes a `miss`, so no amount of reading that one
   * event would have helped. An i-frame dodge logs `evade` against the
   * DEFENDER (sim.js:686) while crediting the ATTACKER's miss counter, so the
   * side is flipped here; a charge that ends without touching the enemy logs
   * `chargeMiss` with its own reason (`wall`, `push`, `range` — see
   * `chargeMissed` in sim.js, which replaced the old `chargeWall` line and
   * covers the two outcomes that used to log nothing); and a wind-up knocked
   * out before it resolves logs `interrupt` against the fighter who lost it.
   * None of the three overlaps `miss` — an interrupted, wall-stopped or
   * empty-air skill never reaches the code that records one — so nothing is
   * counted twice.
   */
  for (const e of result.log) {
    const bump = (who, skill, reason) => {
      const a = acc[who];
      a.missReasons[`${skill}:${reason}`] = (a.missReasons[`${skill}:${reason}`] || 0) + 1;
    };
    if (e.type === 'miss') bump(e.who, e.skill, e.reason);
    else if (e.type === 'evade') bump(other(e.who), e.skill, 'invulnerable');
    else if (e.type === 'chargeMiss') bump(e.who, 'charge', e.reason);
    else if (e.type === 'interrupt') bump(e.target, e.skill, 'interrupted');
  }
}

// ---------------------------------------------------------------------------

const pct = (v) => `${(v * 100).toFixed(1)}%`;
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const quant = (xs, q) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
};

function report(id) {
  const a = acc[id];
  const rate = (k) => {
    const u = a.uses[k] || 0, h = a.hits[k] || 0;
    return u === 0 ? '   —  ' : pct(h / u).padStart(6);
  };
  const skills = Object.keys(a.uses);
  const damaging = skills.filter((k) => SKILLS[k] && typeof SKILLS[k].damage === 'number');
  const teleRate = a.teleThinks ? a.teleActs / a.teleThinks : null;
  const calmRate = a.calmThinks ? a.calmActs / a.calmThinks : null;
  /**
   * Every non-hit, with a residual so the total cannot lie by omission.
   *
   * `uses - hits` is the number of swings that did not land, and the named
   * reasons have to add up to it. What they do not cover goes in `unrecorded`
   * rather than nowhere. Measured on l1 vs l1 over the same 200 seeds, reading
   * the three extra log lines moved the share of non-hits with a named reason
   * from 0.0% to 67.6% on charge (654 of 967, 650 of them the wall), 73.4% to
   * 93.6% on laser (interrupts), and 98.2% to 99.7% on smash.
   *
   * The charge residual that left is now closed in the simulation instead, by
   * `chargeMissed` in src/core/sim.js: every charge that ends without touching
   * the enemy writes one `chargeMiss` line with a reason. Measured on the
   * 36-cell grid, o1..o6 against o1..o6 at 12 seeds — 432 matches, 2 028
   * charges, 640 hits, 1 388 non-hits:
   *
   *                named   unrecorded   share of non-hits   of all charges
   *     before       710       678            48.8%             33.4%
   *     after      1 388         0             0.0%              0.0%
   *
   * The 678 were 624 dashes that ran the full 0.8 s through empty air and 54
   * charges whose owner was killed before the dash could resolve. NONE were the
   * collision-pass stop this comment used to blame alongside them — that branch
   * fired 0 times in 5 222 charges, and `collide` in sim.js now carries the
   * argument for why it cannot fire at all. A wrong lead is worse than a
   * residual, which is the whole reason the residual is printed: a visible one
   * is a lead; a missing one is a lie.
   */
  const missBreakdown = {};
  for (const k of damaging) {
    const nonHits = (a.uses[k] || 0) - (a.hits[k] || 0);
    if (nonHits <= 0) continue;
    const reasons = {};
    let named = 0;
    for (const [rk, v] of Object.entries(a.missReasons)) {
      if (!rk.startsWith(`${k}:`)) continue;
      reasons[rk.slice(k.length + 1)] = v;
      named += v;
    }
    // Negative means the log double-counted an outcome, which is worth seeing.
    if (nonHits !== named) reasons.unrecorded = nonHits - named;
    missBreakdown[k] = { nonHits, reasons };
  }
  return {
    winRate: a.wins / ROUNDS,
    meanHpLeft: mean(a.hpLeft),
    dmgPerMatch: a.damageDealt / ROUNDS,
    faultRate: a.thinks ? a.faults / a.thinks : 0,
    avgThinkMicros: a.thinks ? a.micros / a.thinks : 0,
    metresPerMatch: a.distance / ROUNDS,
    uses: a.uses,
    hitRate: Object.fromEntries(damaging.map((k) => [k, a.uses[k] ? (a.hits[k] || 0) / a.uses[k] : null])),
    missReasons: a.missReasons,
    missBreakdown,
    verbs: a.verbs,
    meanEnemyDist: a.distN ? a.distSum / a.distN : 0,
    enemyCorrelation: a.corrN ? a.corrSum / a.corrN : 0,
    reactUnderTelegraph: teleRate,
    reactBaseline: calmRate,
    reactLift: teleRate !== null && calmRate !== null && calmRate > 0 ? teleRate / calmRate : null,
    telegraphThinks: a.teleThinks,
    meleeUptime: a.distN ? a.meleeThinks / a.distN : 0,
    visibleUptime: a.distN ? a.visibleThinks / a.distN : 0,
    losDiscipline: a.losOrders ? a.losOrdersVisible / a.losOrders : null,
    readyIdle: Object.fromEntries(Object.entries(a.cooldownIdle).map(([k, v]) => [k, v / a.cooldownSamples])),
    saidPerMatch: a.saidLines / ROUNDS,
    sampleSay: a.sayTexts.slice(0, 5),
  };
}

const out = {
  rounds: ROUNDS,
  brains: { octopus: `${tags.octopus}`, gorilla: `${tags.gorilla}` },
  wallSeconds: (Date.now() - t0) / 1000,
  balance: {
    octopusWinRate: acc.octopus.wins / ROUNDS,
    gorillaWinRate: acc.gorilla.wins / ROUNDS,
    drawRate: draws / ROUNDS,
    timeoutRate: timeouts / ROUNDS,
    seconds: { mean: mean(lengths), p10: quant(lengths, 0.1), median: quant(lengths, 0.5), p90: quant(lengths, 0.9) },
  },
  octopus: report('octopus'),
  gorilla: report('gorilla'),
};

/**
 * Do the two brains actually differ, or did one model write the same program
 * twice with the nouns changed? Cosine similarity over the verb histograms is
 * the cheapest honest answer: it is blind to how MUCH each brain does and
 * sensitive to WHAT it reaches for.
 */
function cosine(a, b) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  let dot = 0, la = 0, lb = 0;
  for (const k of keys) {
    const x = a[k] || 0, y = b[k] || 0;
    dot += x * y; la += x * x; lb += y * y;
  }
  return la && lb ? dot / Math.sqrt(la * lb) : 0;
}
const norm = (h) => {
  const tot = Object.values(h).reduce((x, y) => x + y, 0) || 1;
  return Object.fromEntries(Object.entries(h).map(([k, v]) => [k, v / tot]));
};
out.verbSimilarity = cosine(norm(acc.octopus.verbs), norm(acc.gorilla.verbs));

if (JSON_OUT) {
  console.log(JSON.stringify(out, null, 2));
} else {
  const b = out.balance;
  console.log(`\n═══ ${ROUNDS} rounds — octopus:${tags.octopus} vs gorilla:${tags.gorilla} — ${out.wallSeconds.toFixed(1)}s\n`);
  console.log('BALANCE');
  console.log(`  octopus wins   ${pct(b.octopusWinRate)}      gorilla wins  ${pct(b.gorillaWinRate)}      draws ${pct(b.drawRate)}`);
  console.log(`  match length   mean ${b.seconds.mean.toFixed(1)}s   p10 ${b.seconds.p10.toFixed(1)}s   median ${b.seconds.median.toFixed(1)}s   p90 ${b.seconds.p90.toFixed(1)}s`);
  console.log(`  decided on the clock  ${pct(b.timeoutRate)}`);
  for (const id of ['octopus', 'gorilla']) {
    const r = out[id];
    console.log(`\n${id.toUpperCase()}`);
    console.log(`  EXECUTION  faults ${pct(r.faultRate)}   think ${r.avgThinkMicros.toFixed(0)}us   damage/match ${r.dmgPerMatch.toFixed(0)}   walked ${r.metresPerMatch.toFixed(0)}m`);
    for (const k of Object.keys(r.uses)) {
      const hr = r.hitRate[k];
      const idle = r.readyIdle[k];
      console.log(`             ${k.padEnd(8)} used ${(r.uses[k] / ROUNDS).toFixed(1)}/match   hit ${hr === undefined ? '   n/a' : pct(hr)}   ready-and-idle ${idle === undefined ? 'n/a' : pct(idle)}`);
    }
    for (const [k, m] of Object.entries(r.missBreakdown)) {
      const parts = Object.entries(m.reasons)
        .sort((x, y) => Math.abs(y[1]) - Math.abs(x[1]))
        .map(([rk, v]) => `${rk} ${(v / ROUNDS).toFixed(1)}`);
      console.log(`             ${k.padEnd(8)} missed ${(m.nonHits / ROUNDS).toFixed(1)}/match = ${parts.join(' + ')}`);
    }
    console.log(`  ENGAGEMENT mean gap ${r.meanEnemyDist.toFixed(1)}m   melee uptime ${pct(r.meleeUptime)}   in sight ${pct(r.visibleUptime)}`);
    console.log(`             enemyCorrelation ${r.enemyCorrelation >= 0 ? '+' : ''}${r.enemyCorrelation.toFixed(2)}  (+1 = always retreating, -1 = always closing)`);
    console.log(`             reacts under telegraph ${r.reactUnderTelegraph === null ? 'n/a' : pct(r.reactUnderTelegraph)} vs baseline ${r.reactBaseline === null ? 'n/a' : pct(r.reactBaseline)}  lift x${r.reactLift === null ? '—' : r.reactLift.toFixed(2)}`);
    if (r.losDiscipline !== null) console.log(`             losDiscipline ${pct(r.losDiscipline)}`);
    console.log(`             verbs: ${Object.entries(r.verbs).sort((a, c) => c[1] - a[1]).map(([k, v]) => `${k} ${(v / ROUNDS).toFixed(0)}`).join('  ')}`);
    if (r.saidPerMatch > 0) console.log(`             says ${r.saidPerMatch.toFixed(1)}/match e.g. ${JSON.stringify(r.sampleSay.slice(0, 2))}`);
  }
  console.log(`\nDISTINCTNESS  verb-profile similarity between the two brains: ${out.verbSimilarity.toFixed(3)}  (1.000 = identical vocabulary use)`);
  console.log('');
}
