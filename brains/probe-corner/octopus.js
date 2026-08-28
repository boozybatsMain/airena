// A DEGENERACY PROBE, hand-written, not generated.
//
// Sit behind a block, break line of sight, and peek only to fire. If holding
// one piece of cover is a winning line, the layout is the problem.
function think(p, api) {
  const e = p.enemy, s = p.self;
  api.faceAt(e.x, e.z);
  // the far side of the nearest block, measured from the enemy
  let best = null, bestScore = -1e9;
  for (const o of p.arena.obstacles) {
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = o.x + dx * (o.hx + 2.2), z = o.z + dz * (o.hz + 2.2);
      if (Math.abs(x) > 18 || Math.abs(z) > 18) continue;
      const hidden = api.los(x, z) ? 0 : 1;
      const sc = hidden * 40 - Math.hypot(x - s.x, z - s.z) - Math.max(0, 9 - Math.hypot(x - e.x, z - e.z)) * 3;
      if (sc > bestScore) { bestScore = sc; best = { x, z }; }
    }
  }
  if (api.ready('laser') && e.visible && e.dist < 22) { api.use('laser'); return; }
  if (best) api.moveTo(best.x, best.z);
  else api.move(V.away(s, e).x, V.away(s, e).z);
}
