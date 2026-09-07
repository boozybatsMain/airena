function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en) return;
  const d = en.dist;

  if (p.t < 0.2) api.say("Fire and closing.");

  // aim point on enemy
  const ex = en.x, ez = en.z;

  if (!me.busy) {
    // k2 cone: melee burst
    if (d < 4.4 && api.ready('k2') && !en.airborne) {
      api.use('k2', { x: ex, z: ez });
      api.move(ex - me.x, ez - me.z);
      return;
    }
    // k3 disc: lead slightly
    if (api.ready('k3') && d < 13 && en.visible) {
      const lead = { x: ex + en.vx * 0.55, z: ez + en.vz * 0.55 };
      api.use('k3', lead);
      api.move(ex - me.x, ez - me.z);
      return;
    }
    // k1 dash to close / hit
    if (api.ready('k1') && d < 10.5 && d > 3 && en.visible) {
      api.use('k1', { x: ex, z: ez });
      return;
    }
  }

  // movement
  api.faceAt(ex, ez);
  if (d > 5) {
    api.moveTo(ex, ez);
  } else if (d < 2.8) {
    const a = V.away({ x: me.x, z: me.z }, { x: en.x, z: en.z });
    api.move(a.x, a.z);
  } else {
    // orbit
    const t = V.toward({ x: me.x, z: me.z }, { x: en.x, z: en.z });
    const per = V.perp(t);
    const s = (Math.floor(p.t / 2) % 2) ? 1 : -1;
    api.move(t.x * 0.4 + per.x * s, t.z * 0.4 + per.z * s);
  }
}