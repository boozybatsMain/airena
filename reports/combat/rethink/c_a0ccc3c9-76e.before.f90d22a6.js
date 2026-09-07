function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en.alive) return;
  const d = en.dist;

  if (me.busy && me.casting && me.casting.phase !== 'windup') {
    // keep standing orders
  }

  // shield when they commit or when close
  if (api.ready('k3') && me.shield <= 0 && (d < 7 || (en.casting && en.casting.telegraph))) {
    api.use('k3');
  }

  // melee cone
  if (api.ready('k1') && d <= 4.2 && en.visible && !en.airborne) {
    api.use('k1', { x: en.x, z: en.z });
    api.faceAt(en.x, en.z);
    return;
  }

  // dash gap closer
  if (api.ready('k2') && d > 4.5 && d < 10.5 && en.visible && !en.airborne) {
    api.use('k2', { x: en.x, z: en.z });
    return;
  }

  api.faceAt(en.x, en.z);

  if (d > 4.0) {
    api.moveTo(en.x, en.z);
  } else if (d < 2.9) {
    const a = V.away({ x: me.x, z: me.z }, { x: en.x, z: en.z });
    api.move(a.x, a.z);
  } else {
    // orbit
    const t = V.toward({ x: me.x, z: me.z }, { x: en.x, z: en.z });
    const q = V.perp(t);
    const s = (Math.floor(p.t) % 4 < 2) ? 1 : -1;
    api.move(q.x * s + t.x * 0.2, q.z * s + t.z * 0.2);
  }

  if (p.t > 1 && p.t < 1.2) api.say("Come closer. I bite.");
}