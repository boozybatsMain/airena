// Reference stub. Close the distance, swing when in reach, charge when the gap
// is worth a charge.
function think(p, api) {
  const e = p.enemy, s = p.self;
  const dx = e.x - s.x, dz = e.z - s.z;
  const d = Math.max(0.001, Math.sqrt(dx * dx + dz * dz));
  const ux = dx / d, uz = dz / d;
  api.faceAt(e.x, e.z);

  if (d < 3.4 && api.ready('smash')) { api.use('smash'); return; }
  if (d > 5 && d < 11 && e.visible && api.ready('charge')) { api.use('charge'); return; }
  api.moveTo(e.x, e.z);
}
