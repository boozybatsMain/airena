// Reference stub. Not generated — this exists so the simulation can be tested
// without the generator, and so a generated brain has something honest to be
// compared against. Deliberately simple: kite, break line of sight, fire.
function think(p, api) {
  const e = p.enemy, s = p.self;
  const dx = e.x - s.x, dz = e.z - s.z;
  const d = Math.max(0.001, Math.sqrt(dx * dx + dz * dz));
  const ux = dx / d, uz = dz / d;
  api.faceAt(e.x, e.z);

  if (e.casting && e.casting.skill === 'charge' && api.ready('blink')) {
    api.use('blink', -uz, ux);
    return;
  }
  if (d < 9 && api.ready('blink')) { api.use('blink', -ux, -uz); return; }
  if (e.visible && d < 22 && api.ready('laser')) { api.use('laser'); return; }

  if (d < 14) {
    let bx = -ux, bz = -uz;
    const r = api.ray(bx, bz, 5);
    if (r && r.hit && r.dist < 3) { bx = -uz; bz = ux; }
    api.move(bx, bz);
  } else {
    api.move(ux, uz);
  }
}
