// DEGENERACY PROBE: never attacks at all. Tests whether pure refusal to engage
// is punished. Under the proportional burn it should be a DRAW at best.
const R = 16;
function think(p, api) {
  const e = p.enemy, s = p.self;
  if (e.dist < 7 && api.ready('blink')) { const a = V.away(s, e); api.use('blink', a.x, a.z); return; }
  if (e.casting && e.casting.telegraph && e.casting.skill === 'smash' && api.ready('jump')) {
    const a = V.away(s, e); api.move(a.x, a.z); api.use('jump'); return;
  }
  let best = null, bestScore = -1e9;
  for (let i = 0; i < R; i++) {
    const th = (i / R) * Math.PI * 2;
    const d = { x: Math.sin(th), z: Math.cos(th) };
    const room = Math.min(api.ray(d.x, d.z, 24).dist, 24);
    const sc = room * 0.8 + V.dot(d, V.away(s, e)) * 14;
    if (sc > bestScore) { bestScore = sc; best = d; }
  }
  api.move(best.x, best.z);
  api.faceAt(e.x, e.z);
}
