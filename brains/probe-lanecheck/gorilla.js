// DIAGNOSTIC PROBE (game-design reviewer, this pass).
// probe-dumbape with ONE change: before charging, ray-test the lane and only
// commit if the path to the intercept point is clear. If this lifts the charge
// hit rate a lot, the 30% grid-wide hit rate is a brain-quality artefact; if it
// barely moves, the charge is structurally bad against a body that can move.
function think(p, api) {
  const e = p.enemy, s = p.self;
  api.faceAt(e.x, e.z);
  api.moveTo(e.x, e.z);
  if (s.busy) return;
  if (e.dist < 4.0 && api.ready('smash')) { api.use('smash'); return; }
  if (e.dist >= 4.0 && e.dist < 11 && api.ready('charge')) {
    // where he will be when the 0.28 s wind-up ends, plus travel time
    const tof = 0.30 + Math.max(0, e.dist - 2.2) / 15;
    const aim = { x: e.x + e.vx * tof, z: e.z + e.vz * tof };
    const d = V.toward(s, aim);
    const need = Math.hypot(aim.x - s.x, aim.z - s.z);
    const hit = api.ray(d.x, d.z, need + 1.0);
    if (!hit.hit || hit.dist >= need - 0.5) { api.faceAt(aim.x, aim.z); api.use('charge'); }
    return;
  }
}
