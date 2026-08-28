// A DEGENERACY PROBE, hand-written, not generated.
//
// The hop is immune to a ground sweep. If hopping on every telegraph is a
// winning line on its own, then the gorilla's main weapon has a free counter
// and the fight has a hole in it. This brain does nothing else clever: it hops
// on every smash wind-up, fires when it can, and otherwise backs away.
function think(p, api) {
  const e = p.enemy, s = p.self;
  const away = V.away(s, e);
  api.faceAt(e.x, e.z);
  const tele = e.casting && e.casting.skill === 'smash' && e.casting.telegraph;
  if (tele && api.ready('jump')) { api.move(away.x, away.z); api.use('jump'); return; }
  if (e.visible && e.dist < 22 && api.ready('laser')) { api.use('laser'); return; }
  if (e.dist < 10) api.move(away.x, away.z);
  else api.moveTo(e.x, e.z);
}
