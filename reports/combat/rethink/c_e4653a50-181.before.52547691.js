function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en) return;
  const d = en.dist;

  if (me.busy || me.stunned) return;

  const k = me.kit || {};
  const cone = k.k2, dash = k.k1, boost = k.k3;

  // boost when about to engage
  if (boost && api.ready('k3') && d < 9 && d > 3.6) {
    api.use('k3');
    api.faceAt(en.x, en.z);
    return;
  }

  const coneReach = cone && cone.range ? cone.range + (en.radius || 1.5) : 4.9;
  if (cone && api.ready('k2') && d <= coneReach - 0.4 && en.visible && !en.airborne) {
    api.use('k2', { x: en.x, z: en.z });
    api.move(en.x - me.x, en.z - me.z);
    return;
  }

  const dashReach = dash && dash.distance ? dash.distance + 2.5 : 10.5;
  if (dash && api.ready('k1') && d > coneReach && d < dashReach && en.visible && !en.airborne) {
    const lx = en.x + en.vx * 0.35, lz = en.z + en.vz * 0.35;
    api.use('k1', { x: lx, z: lz });
    return;
  }

  // approach
  api.faceAt(en.x, en.z);
  if (d > 2.6) api.moveTo(en.x, en.z);
  else {
    // strafe while waiting for cone
    const t = V.toward(me, en);
    const s = V.perp(t);
    const sgn = (p.tick % 120) < 60 ? 1 : -1;
    api.move(s.x * sgn - t.x * 0.2, s.z * sgn - t.z * 0.2);
  }

  if (p.t < 1) api.say("Come closer. I bite.");
}