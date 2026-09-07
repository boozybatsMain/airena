function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en) return;
  const d = en.dist;

  // shield/heal when hurt or when they're close
  if (api.ready('k3') && (me.hp < me.maxHp * 0.85 || d < 5) && me.shield <= 0.1) {
    api.use('k3');
    return;
  }

  // melee cone
  if (api.ready('k1') && d < 4.4 && en.y < 0.35 && en.visible) {
    api.use('k1', { x: en.x, z: en.z });
    api.move(V.toward(me, en).x, V.toward(me, en).z);
    return;
  }

  // root disc, lead slightly
  if (api.ready('k2') && d < 11.5 && en.visible && (!en.immune || en.immune.indexOf('move') < 0)) {
    const lead = { x: en.x + en.vx * 0.5, z: en.z + en.vz * 0.5 };
    api.use('k2', lead);
    return;
  }

  // movement
  const zones = p.arena.zones || [];
  let flee = null;
  for (const z of zones) {
    if (z.mine) continue;
    const dd = Math.hypot(me.x - z.x, me.z - z.z);
    if (dd < z.r + me.radius + 1.2) flee = z;
  }
  if (flee) {
    const away = V.norm({ x: me.x - flee.x, z: me.z - flee.z });
    api.move(away.x, away.z);
    api.faceAt(en.x, en.z);
    return;
  }

  api.faceAt(en.x, en.z);

  // avoid walking into their cone while our k1 is down
  const wantClose = api.cooldown('k1') < 0.35;
  if (wantClose || p.burn > 0) {
    api.moveTo(en.x, en.z);
  } else if (d < 5.5) {
    const away = V.away(me, en);
    let tx = me.x + away.x * 5, tz = me.z + away.z * 5;
    tx = Math.max(-18.5, Math.min(18.5, tx));
    tz = Math.max(-18.5, Math.min(18.5, tz));
    api.moveTo(tx, tz);
  } else {
    api.moveTo(en.x, en.z);
  }

  if (p.t > 1 && api.rand() < 0.02) api.say("Come closer. I bite.");
}