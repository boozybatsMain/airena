/* A brain that plays the lob the way the prompt describes it:
   "a projectile on an arc. It flies OVER blocks and lands where it was aimed" */
function think(p, api) {
  const me = p.self;
  const en = p.enemy;
  if (!me || !me.alive || !en) return;
  api.faceAt(en.x, en.z);
  if (en.visible) {
    /* break the line: put the nearest block between us */
    let best = null;
    for (const o of p.arena.obstacles) {
      const d = Math.hypot(o.x - me.x, o.z - me.z);
      if (!best || d < best.d) best = { o, d };
    }
    if (best) {
      const ux = (me.x - en.x), uz = (me.z - en.z);
      const n = Math.hypot(ux, uz) || 1;
      api.moveTo(best.o.x + (ux / n) * (best.o.hz + best.o.hx + 3), best.o.z + (uz / n) * (best.o.hz + best.o.hx + 3));
    }
  } else {
    api.stop();
  }
  if (api.ready('k2')) api.use('k2');
}
