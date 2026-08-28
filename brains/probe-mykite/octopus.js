// DEGENERACY PROBE (written by the game-design reviewer, not generated).
//
// The thesis: under a proportional burn, a single connected laser is a
// permanent hp-FRACTION lead. So "land a few, then never be touchable again"
// should win without ever making an interesting decision. This brain does
// exactly that and nothing else: it never closes, never trades, never uses
// cover cleverly. It picks the emptiest direction away from the gorilla, walks
// it, blinks the moment the ape is near or committed, hops every smash
// wind-up, and fires only from outside charge reach.
const R = 16;
function think(p, api) {
  const e = p.enemy, s = p.self;

  // 1. hard escapes first — these are free, they cost no tempo
  if (e.casting && e.casting.skill === 'charge' && e.casting.telegraph && api.ready('blink')) {
    const perp = V.perp(V.toward(s, e));
    api.use('blink', perp.x, perp.z);
    api.faceAt(e.x, e.z);
    return;
  }
  if (e.dist < 6.5 && api.ready('blink')) {
    const a = V.away(s, e);
    api.use('blink', a.x, a.z);
    api.faceAt(e.x, e.z);
    return;
  }
  if (e.casting && e.casting.skill === 'smash' && e.casting.telegraph && api.ready('jump')) {
    const a = V.away(s, e);
    api.move(a.x, a.z);
    api.use('jump');
    return;
  }

  // 2. the emptiest heading that also opens the gap
  let best = null, bestScore = -1e9;
  for (let i = 0; i < R; i++) {
    const th = (i / R) * Math.PI * 2;
    const d = { x: Math.sin(th), z: Math.cos(th) };
    const hit = api.ray(d.x, d.z, 24);
    const room = Math.min(hit.dist, 24);
    const away = V.dot(d, V.away(s, e));
    const sc = room * 0.8 + away * 14;
    if (sc > bestScore) { bestScore = sc; best = d; }
  }
  api.move(best.x, best.z);
  api.faceAt(e.x, e.z);

  // 3. fire only from beyond the charge's reach, never while it can punish
  if (api.ready('laser') && e.visible && e.dist > 13 && e.dist < 23) api.use('laser');
}
