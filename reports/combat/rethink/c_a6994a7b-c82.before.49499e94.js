function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en.alive) return;
  const d = en.dist;

  if (p.t < 0.3) api.say("Blue closes fast.");

  // if busy casting, just keep facing
  if (me.casting && me.casting.phase !== 'recover') {
    return;
  }

  const toEnemy = { x: en.x - me.x, z: en.z - me.z };

  // k3 disc on enemy predicted spot
  if (api.ready('k3') && d < 12 && en.visible) {
    const lead = { x: en.x + en.vx * 0.55, z: en.z + en.vz * 0.55 };
    api.use('k3', lead);
    api.move(toEnemy.x, toEnemy.z);
    return;
  }

  // k2 weaken when close
  if (api.ready('k2') && d < 4.6 && en.visible) {
    api.use('k2', { x: en.x, z: en.z });
    api.move(toEnemy.x, toEnemy.z);
    return;
  }

  // k1 dash when in reach
  if (api.ready('k1') && d > 3 && d < 10.5 && en.visible && !en.airborne) {
    api.use('k1', { x: en.x + en.vx * 0.35, z: en.z + en.vz * 0.35 });
    return;
  }

  // movement
  api.faceAt(en.x, en.z);
  if (d > 4) {
    api.moveTo(en.x, en.z);
  } else if (d < 2.6) {
    api.move(-toEnemy.x, -toEnemy.z);
  } else {
    const s = V.perp(V.norm(toEnemy));
    const sign = ((p.tick >> 5) & 1) ? 1 : -1;
    api.move(s.x * sign + toEnemy.x * 0.2, s.z * sign + toEnemy.z * 0.2);
  }
}