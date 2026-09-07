function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en) return;

  const d = en.dist;
  const k1 = me.kit.k1, k2 = me.kit.k2, k3 = me.kit.k3;

  // keep shield up
  if (k3 && api.ready('k3') && me.shield < 4 && (d < 12 || p.burn > 0)) {
    api.use('k3');
    return;
  }

  // cone range
  const coneReach = (k1 && k1.range ? k1.range : 3.4) + en.radius;
  const dashReach = (k2 && k2.distance ? k2.distance : 8) + 2.5;

  if (!me.busy) {
    if (k1 && api.ready('k1') && d <= coneReach - 0.3 && en.visible && !en.airborne) {
      api.faceAt(en.x, en.z);
      api.use('k1', { x: en.x, z: en.z });
      api.move(en.x - me.x, en.z - me.z);
      return;
    }
    if (k2 && api.ready('k2') && d > coneReach && d <= dashReach && en.visible && !en.airborne) {
      const lead = { x: en.x + en.vx * 0.35, z: en.z + en.vz * 0.35 };
      api.use('k2', lead);
      return;
    }
  }

  // movement: close in, but dodge their windup
  const theirCast = en.casting;
  if (theirCast && theirCast.telegraph && d < 7) {
    // sidestep
    const away = V.away(me, en);
    const per = V.perp(V.toward(me, en));
    const sgn = (api.rand() > 0.5 ? 1 : -1);
    const dir = V.norm(V.add(V.scale(per, sgn * 1.2), V.scale(away, 0.8)));
    let tx = me.x + dir.x * 6, tz = me.z + dir.z * 6;
    tx = Math.max(-18.5, Math.min(18.5, tx));
    tz = Math.max(-18.5, Math.min(18.5, tz));
    api.moveTo(tx, tz);
    api.faceAt(en.x, en.z);
    return;
  }

  api.faceAt(en.x, en.z);
  if (d > coneReach - 0.5) {
    api.moveTo(en.x, en.z);
  } else {
    // orbit while waiting for k1
    const per = V.perp(V.toward(me, en));
    let tx = me.x + per.x * 3, tz = me.z + per.z * 3;
    tx = Math.max(-18.5, Math.min(18.5, tx));
    tz = Math.max(-18.5, Math.min(18.5, tz));
    api.move(tx - me.x, tz - me.z);
  }
}