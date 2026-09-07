function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en) return;
  const d = en.dist;

  // keep boost up
  if (api.ready('k2') && !me.busy) {
    const boosted = me.maxSpeed > 6.5;
    if (!boosted && d < 16) { api.use('k2'); return; }
  }

  // cone: close range, big burn + silence
  if (d < 4.4 && en.visible && !en.airborne && api.ready('k3')) {
    api.use('k3', { x: en.x, z: en.z });
    api.move(en.x - me.x, en.z - me.z);
    return;
  }

  // dash in
  if (d > 4.5 && d < 10.5 && en.visible && api.ready('k1')) {
    const lead = V.lead({ x: me.x, z: me.z }, { x: en.x, z: en.z }, { x: en.vx, z: en.vz }, 16);
    api.use('k1', lead);
    return;
  }

  // movement
  if (en.visible) {
    if (d > 4.0) {
      api.move(en.x - me.x, en.z - me.z);
    } else {
      // orbit slightly to stay in cone range
      const t = V.toward({ x: me.x, z: me.z }, { x: en.x, z: en.z });
      const per = V.perp(t);
      api.move(t.x * 0.3 + per.x, t.z * 0.3 + per.z);
    }
    api.faceAt(en.x, en.z);
  } else {
    api.moveTo(en.x, en.z);
    api.faceAt(en.x, en.z);
  }

  if (p.t > 1 && p.tick % 120 === 0) api.say("Come closer. The fire is warm.");
}