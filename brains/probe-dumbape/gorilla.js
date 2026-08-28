// DEGENERACY PROBE (reviewer): the dumbest possible gorilla. No reading, no
// reacting, no cover, no timing. Walk at the octopus. Smash whenever it is
// ready and something is roughly in front. Charge whenever it is ready and the
// octopus is further than a smash. That is the entire program. If this beats
// competent generated octopuses, the fight is decided by the body, not by the
// mind.
function think(p, api) {
  const e = p.enemy, s = p.self;
  api.faceAt(e.x, e.z);
  api.moveTo(e.x, e.z);
  if (s.busy) return;
  if (e.dist < 4.0 && api.ready('smash')) { api.use('smash'); return; }
  if (e.dist >= 4.0 && e.dist < 13 && api.ready('charge')) { api.use('charge'); return; }
}
