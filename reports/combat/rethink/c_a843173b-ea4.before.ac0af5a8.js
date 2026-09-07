function think(p, api) {
  const me = p.self, e = p.enemy;
  if (!e || !e.alive) { api.stop(); return; }
  const d = e.dist;
  const k1 = me.kit.k1, k3 = me.kit.k3, k2 = me.kit.k2;

  if (!me.said && p.t > 1) { api.say("Come closer."); me.said = 1; }

  // cone range
  const coneReach = ((k3 && k3.range) || 3.4) + e.radius;
  const beamReach = ((k1 && k1.range) || 24) + 1.7 + 0.4 + e.radius;
  const dashReach = ((k2 && k2.distance) || 8) + 3;

  const aim = { x: e.x, z: e.z };
  api.faceAt(e.x, e.z);

  // cast priority
  if (!me.busy) {
    if (d <= coneReach - 0.3 && api.ready('k3') && !e.airborne) {
      api.use('k3', aim); return;
    }
    if (e.visible && d > 6 && d <= beamReach && api.ready('k1')) {
      api.use('k1', aim); return;
    }
    if (e.visible && d > coneReach && d <= dashReach - 1 && api.ready('k2')) {
      api.use('k2', aim); return;
    }
    if (d <= coneReach && api.ready('k3')) { api.use('k3', aim); return; }
  }

  // movement
  const toE = V.toward(me, e);
  if (d < coneReach - 0.5 && api.cooldown('k3') > 0.4) {
    // back off while cone recharges
    const away = V.away(me, e);
    const t = { x: me.x + away.x * 4, z: me.z + away.z * 4 };
    const h = Math.max(-19, Math.min(19, t.x));
    const z = Math.max(-19, Math.min(19, t.z));
    api.move(h - me.x, z - me.z);
  } else if (!e.visible) {
    api.moveTo(e.x, e.z);
  } else if (d > 3.2) {
    // approach with slight strafe
    const perp = V.perp(toE);
    const s = ((p.tick / 60) | 0) % 2 ? 1 : -1;
    api.move(toE.x + perp.x * 0.45 * s, toE.z + perp.z * 0.45 * s);
  } else {
    api.move(toE.x * 0.2, toE.z * 0.2);
  }
}