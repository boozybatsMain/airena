function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en) return;
  const d = en.dist;

  if (me.busy || me.stunned) return;

  const k2 = me.kit && me.kit.k2;
  const k3 = me.kit && me.kit.k3;

  // predict enemy position for lob
  const lead = { x: en.x + en.vx * 0.55, z: en.z + en.vz * 0.55 };

  if (p.t > 1 && api.ready('k2') && d < 16 && d > 3.5) {
    api.use('k2', lead);
    api.faceAt(en.x, en.z);
    return;
  }

  if (api.ready('k3') && d < 9.5 && d > 2.0 && en.visible && !en.airborne) {
    api.use('k3', { x: en.x, z: en.z });
    return;
  }

  if (api.ready('k1') && (d > 8 || me.hp < en.hp)) {
    api.use('k1');
    return;
  }

  api.faceAt(en.x, en.z);

  // movement: keep mid range, strafe
  const t = p.t;
  const side = Math.sin(t * 0.8) > 0 ? 1 : -1;
  const to = V.toward(me, en);
  const perp = V.perp(to);
  let dir;
  if (d > 9) dir = V.add(to, V.scale(perp, 0.4 * side));
  else if (d < 5) dir = V.add(V.scale(to, -1), V.scale(perp, 0.6 * side));
  else dir = V.add(V.scale(perp, side), V.scale(to, 0.15));

  let tx = me.x + dir.x * 6, tz = me.z + dir.z * 6;
  const lim = 18;
  tx = Math.max(-lim, Math.min(lim, tx));
  tz = Math.max(-lim, Math.min(lim, tz));
  api.moveTo(tx, tz);

  if (p.t < 0.5) api.say("Let's dance.");
}