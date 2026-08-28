// Paired with the octopus probe so the directory is a complete entry; this is
// just the reference stub.
function think(p, api) {
  const e = p.enemy, s = p.self;
  const d = Math.max(0.001, e.dist);
  api.faceAt(e.x, e.z);
  if (d < 3.4 && api.ready('smash')) { api.use('smash'); return; }
  if (d > 5 && d < 11 && e.visible && api.ready('charge')) { api.use('charge'); return; }
  api.moveTo(e.x, e.z);
}
