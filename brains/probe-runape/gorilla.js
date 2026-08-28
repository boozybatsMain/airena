// DEGENERACY PROBE (game-design reviewer, this pass — not generated).
// Sharper version: brawl normally, and ONLY disengage once the burn is about to
// start (t >= 21) while ahead on hp fraction. The gorilla is 10% faster than the
// octopus, so if this works the endgame can be stolen by refusing to play it.
function think(p, api) {
  const e = p.enemy, s = p.self;
  if (!s.alive) return;
  const ahead = (s.hp / s.maxHp) > (e.hp / e.maxHp) + 0.02;
  const endgame = p.t >= 21;

  if (!(ahead && endgame)) {
    api.faceAt(e.x, e.z);
    api.moveTo(e.x, e.z);
    if (s.busy) return;
    if (e.dist < 4.0 && api.ready('smash')) { api.use('smash'); return; }
    if (e.dist >= 4.0 && e.dist < 13 && api.ready('charge')) { api.use('charge'); return; }
    return;
  }
  let best = null, bestScore = -1e9;
  for (let i = 0; i < 24; i++) {
    const th = (i / 24) * Math.PI * 2;
    const d = { x: Math.sin(th), z: Math.cos(th) };
    const hit = api.ray(d.x, d.z, 26);
    const room = Math.min(hit.dist, 26) - 1.6;
    if (room < 1) continue;
    const px = s.x + d.x * room, pz = s.z + d.z * room;
    if (Math.abs(px) > 18.5 || Math.abs(pz) > 18.5) continue;
    const hidden = api.los(px, pz) ? 0 : 1;
    const gap = Math.hypot(px - e.x, pz - e.z);
    const sc = hidden * 30 + gap * 1.4 + room * 0.3;
    if (sc > bestScore) { bestScore = sc; best = { x: px, z: pz }; }
  }
  if (best) { api.moveTo(best.x, best.z); api.faceAt(best.x, best.z); }
  else { const a = V.away(s, e); api.move(a.x, a.z); api.face(a.x, a.z); }
}
