// DIAGNOSTIC PROBE (game-design reviewer, this pass).
// Is the punish-the-cast pattern answerable? This octopus tracks the gorilla's
// charge cooldown from `enemyStarted` events and only commits the 0.65 s laser
// cast when the charge cannot reach it: either charge is down, or the gap is
// bigger than the charge's 12 m + wind-up travel.
let chargeReadyAt = 0;
function think(p, api) {
  const e = p.enemy, s = p.self;
  if (!s.alive) return;
  for (const ev of p.events) {
    if (ev.type === 'enemyStarted' && ev.skill === 'charge') chargeReadyAt = p.t + 4.0;
  }
  api.faceAt(e.x, e.z);

  if (e.casting && e.casting.skill === 'charge' && e.casting.telegraph && api.ready('blink')) {
    const perp = V.perp(V.toward(s, e));
    api.use('blink', perp.x, perp.z); return;
  }
  if (e.casting && e.casting.skill === 'smash' && e.casting.telegraph && api.ready('jump')) {
    const a = V.away(s, e); api.move(a.x, a.z); api.use('jump'); return;
  }
  if (e.dist < 5.5 && api.ready('blink')) { const a = V.away(s, e); api.use('blink', a.x, a.z); return; }

  const chargeDown = p.t < chargeReadyAt;
  const safeToCast = chargeDown || e.dist > 14.5;
  if (api.ready('laser') && e.visible && e.dist < 23 && safeToCast) { api.use('laser'); return; }

  let best = null, bs = -1e9;
  for (let i = 0; i < 16; i++) {
    const th = (i / 16) * Math.PI * 2, d = { x: Math.sin(th), z: Math.cos(th) };
    const room = Math.min(api.ray(d.x, d.z, 24).dist, 24);
    const sc = room * 0.8 + V.dot(d, V.away(s, e)) * 14;
    if (sc > bs) { bs = sc; best = d; }
  }
  api.move(best.x, best.z);
}
