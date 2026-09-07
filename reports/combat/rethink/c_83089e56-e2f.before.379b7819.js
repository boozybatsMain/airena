function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en) return;
  const d = en.dist;
  const K = me.kit || {};
  const k1 = K.k1, k2 = K.k2, k3 = K.k3;

  // defensive boost when threatened
  if (k3 && api.ready('k3') && !me.busy) {
    const threat = (d < 12 && en.casting && en.casting.telegraph) || (d < 6);
    if (threat && api.cooldown('k3') === 0) {
      api.use('k3');
      return;
    }
  }

  // cone: best damage + stun
  if (k2 && api.ready('k2') && d < 4.4 && en.visible && !en.airborne) {
    api.use('k2', { x: en.x, z: en.z });
    return;
  }

  // dash in when mid range
  if (k1 && api.ready('k1') && d > 4.5 && d < 10.5 && en.visible && !en.airborne) {
    api.use('k1', { x: en.x, z: en.z });
    return;
  }

  api.faceAt(en.x, en.z);

  // movement: close to cone range, orbit slightly
  if (d > 4.0) {
    api.moveTo(en.x, en.z);
  } else if (d < 2.8) {
    const a = V.away({ x: me.x, z: me.z }, { x: en.x, z: en.z });
    api.move(a.x, a.z);
  } else {
    const t = V.toward({ x: me.x, z: me.z }, { x: en.x, z: en.z });
    const s = V.perp(t);
    api.move(s.x, s.z);
  }

  if (p.t > 1 && p.t < 1.2) api.say("Come close. I bite.");
}