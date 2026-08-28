/**
 * The ladder a generated brain climbs before it is allowed into a match.
 *
 * ── the rule for adding a rung ──────────────────────────────────────────────
 *
 * A rung must be CHEAP and must catch REAL breakage. It must not be a taste
 * check: "this brain never uses blink" is a strategy this file has no business
 * having an opinion about, and rejecting it would silently select for the
 * tactics whoever wrote the ladder happened to imagine. The rungs below all
 * answer the same question — does this program run, and does it drive the body
 * at all — and none of them answers "is this a good fighter".
 *
 * The one borderline rung is `silent`: a brain that issues no order in 20
 * seconds of match is not exercising a strategy, it is broken in a way the
 * compiler cannot see (a mis-spelled api verb, a guard that is never true, a
 * `return` at the top). It is worth a repair turn and it is worth quoting back.
 */

import { compileBrain, BrainFault } from './host.js';
import { runMatch } from '../core/match.js';
import { THINK_TIMEOUT_MS } from '../core/config.js';
import { readFileSync } from 'node:fs';

/** The house opponent every candidate is smoke-tested against. */
function sparringPartner(id) {
  const url = new URL(`../../brains/stub/${id}.js`, import.meta.url);
  return compileBrain(readFileSync(url, 'utf8'), `stub-${id}`);
}

export function validate(source, id, { seeds = [11, 22] } = {}) {
  const problems = [];
  let brain;
  try {
    brain = compileBrain(source, id);
  } catch (err) {
    return {
      ok: false,
      stage: err instanceof BrainFault ? err.stage : 'compile',
      problems: [err.message],
      report: err.message,
    };
  }

  const otherId = id === 'octopus' ? 'gorilla' : 'octopus';
  const runs = [];
  for (const seed of seeds) {
    const brains = { [id]: brain, [otherId]: sparringPartner(otherId) };
    let out;
    try {
      out = runMatch(brains, { seed });
    } catch (err) {
      return { ok: false, stage: 'crash', problems: [`the host crashed running the match: ${err.message}`], report: err.message };
    }
    runs.push(out.result);
  }

  const mine = runs.map((r) => r[id]);
  const thinks = mine.reduce((a, s) => a + s.thinks, 0);
  const faults = mine.reduce((a, s) => a + s.faults, 0);
  const orders = mine.reduce((a, s) => a + s.orders, 0);
  const uses = mine.reduce((a, s) => a + Object.values(s.uses).reduce((x, y) => x + y, 0), 0);
  const moved = mine.reduce((a, s) => a + s.distanceTravelled, 0);
  const micros = mine.reduce((a, s) => a + s.thinkMicros, 0);

  const faultRate = thinks > 0 ? faults / thinks : 1;
  const firstFault = runs
    .flatMap((r) => r.log)
    .find((e) => e.type === 'fault' && e.who === id);

  if (faultRate > 0.02) {
    problems.push(
      `it threw on ${faults} of ${thinks} thoughts (${(faultRate * 100).toFixed(1)}%). `
      + `The first error was: ${firstFault ? firstFault.error : 'unknown'}`,
    );
  }
  if (orders === 0) {
    problems.push('it issued no api order at all across two whole matches: nothing moved, nothing fired, nothing turned.');
  } else if (moved < 3) {
    problems.push(`the body travelled ${moved.toFixed(1)} m across two whole matches — it is issuing orders but never a movement one that takes effect.`);
  }
  if (uses === 0) {
    problems.push('it never successfully started a single skill across two whole matches. Check the names against p.self.skills and check api.ready before api.use.');
  }
  const avgMicros = thinks > 0 ? micros / thinks : 0;
  /*
   * 4 ms, against a THINK_TIMEOUT_MS of 60. The gap is deliberate and it used
   * to be a lie in the message: this rung read "close to the 25 ms ceiling"
   * long after the ceiling moved to 60, so the number a repair prompt quoted
   * back at the model was one no part of the system enforced.
   *
   * The rung guards the MEAN and the timeout guards the worst single thought,
   * and the two are far apart. The sweep behind THINK_TIMEOUT_MS measured one
   * thought at 250x its brain's mean, from a garbage collection landing inside
   * the call — so a brain averaging a fifteenth of the ceiling already has a
   * tail that reaches it.
   */
  if (avgMicros > 4000) {
    problems.push(
      `a thought takes ${(avgMicros / 1000).toFixed(1)} ms on average against a `
      + `${THINK_TIMEOUT_MS} ms per-thought ceiling. The ceiling applies to each thought `
      + `separately and the spread around the mean is wide, so at this average the tail `
      + `is already within reach of it — and a thought that reaches it is scored a fault.`,
    );
  }

  return {
    ok: problems.length === 0,
    stage: problems.length === 0 ? 'passed' : 'behaviour',
    problems,
    report: problems.join('\n\n'),
    metrics: {
      thinks, faults, faultRate: Math.round(faultRate * 1e4) / 1e4, orders, uses,
      distance: Math.round(moved * 10) / 10,
      avgMicros: Math.round(avgMicros),
      results: runs.map((r) => ({ seed: r.seed, winner: r.winner, seconds: r.seconds, reason: r.reason })),
    },
    brain,
  };
}
