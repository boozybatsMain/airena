/**
 * One fight, start to finish.
 *
 * Shared by the headless runner, the validation ladder and the live server, so
 * that "it worked in the balance run" and "it worked in the browser" are claims
 * about the same code. The only difference between the three is what they do
 * with the frames.
 */

import { MATCH_SECONDS, TICK_HZ } from './config.js';
import { createWorld, snapshot, step } from './sim.js';

/**
 * @param {object} brains { octopus, gorilla } — each `{ tick(p, api) }`
 * @param {object} opts
 *   seed      match seed
 *   record    keep every snapshot (a replay), off by default
 *   onFrame   called with each snapshot as it is produced
 */
export function runMatch(brains, { seed = 1, record = false, onFrame = null, observer = null, curtainSeconds = 0, kits = null } = {}) {
  const world = createWorld(seed, { curtainSeconds, kits });
  if (observer) world.observer = observer;
  const frames = record ? [] : null;

  const think = (id, p, api) => {
    const b = brains[id];
    if (!b) return null;
    return b.tick(p, api);
  };

  const maxTicks = (MATCH_SECONDS + curtainSeconds) * TICK_HZ + 8;
  let guard = 0;
  while (!world.done && guard++ < maxTicks) {
    step(world, think);
    const s = snapshot(world);
    if (frames) frames.push(s);
    if (onFrame) onFrame(s);
  }

  return { world, frames, result: summarise(world, seed) };
}

export function summarise(world, seed) {
  const o = world.fighters.octopus, g = world.fighters.gorilla;
  const f = (x) => ({
    hp: Math.round(x.hp * 100) / 100,
    hpFrac: Math.round((x.hp / x.def.hp) * 1000) / 1000,
    ...x.stats,
  });
  return {
    seed,
    seconds: Math.round(world.t * 100) / 100,
    ticks: world.tick,
    winner: world.winner,
    reason: world.reason,
    octopus: f(o),
    gorilla: f(g),
    log: world.log,
  };
}
