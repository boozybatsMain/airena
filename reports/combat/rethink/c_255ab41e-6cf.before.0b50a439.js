function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en.alive) return;
  if (me.busy || me.stunned) return;

  const d = en.dist;
  const toEn = { x: en.x - me.x, z: en.z - me.z };

  if (p.t < 1 && api.rand() < 1) api.say("Blue burns first.");

  // keep boost up
  if (api.ready('k2') && !me.silenced) {
    const boosted = me.maxSpeed > me.maxSpeed * 0 + 6.5;
    if (!boosted && d > 5) { api.use('k2'); api.moveTo(en.x, en.z); api.faceAt(en.x, en.z); return; }
  }

  // cone: close, visible, grounded
  if (d < 4.6 && en.y < 0.35 && p.enemy.visible && api.ready('k3')) {
    api.use('k3', { x: en.x, z: en.z });
    api.move(toEn.x, toEn.z);
    return;
  }

  // dash: mid range
  if (d > 3 && d < 10.5 && p.enemy.visible && en.y < 0.35 && api.ready('k1')) {
    const aim = V.lead(me, en, { x: en.vx, z: en.vz }, 20);
    api.use('k1', { x: aim.x, z: aim.z });
    return;
  }

  // dodge their dash telegraph
  if (en.casting && en.casting.telegraph && en.casting.skill === 'k1' && d < 12) {
    const side = V.perp(V.toward(me, en));
    api.move(side.x, side.z);
    api.faceAt(en.x, en.z);
    return;
  }

  // approach
  api.faceAt(en.x, en.z);
  if (d > 3.2) api.moveTo(en.x, en.z);
  else {
    const away = V.away(me, en);
    const orbit = V.perp(V.toward(me, en));
    api.move(orbit.x * 0.8 + away.x * 0.4, orbit.z * 0.8 + away.z * 0.4);
  }
}