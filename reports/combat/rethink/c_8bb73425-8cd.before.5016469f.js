function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en.alive) return;
  const d = en.dist;

  if (me.busy) return;

  const k1 = me.kit.k1, k2 = me.kit.k2, k3 = me.kit.k3;
  const meleeReach = k2 ? (k2.range || 3.4) + en.radius : 4.9;

  // defensive shield: enemy casting close, or burning, or low shield & close
  if (api.ready('k3')) {
    const threat = (en.casting && en.casting.telegraph && d < 8) || me.burning ||
      me.silenced || me.rooted;
    if (threat && me.shield < 3) {
      api.use('k3');
      api.say("Brace.");
      return;
    }
  }

  // melee cone
  if (api.ready('k2') && d <= meleeReach - 0.3 && en.visible) {
    api.use('k2', { x: en.x, z: en.z });
    api.say("Close enough.");
    return;
  }

  // zone: predict lead
  if (api.ready('k1') && en.visible) {
    const r1 = k1 ? (k1.range || 12) : 12;
    if (d < r1 + 2) {
      const lead = 0.55;
      let tx = en.x + en.vx * lead, tz = en.z + en.vz * lead;
      const dx = tx - me.x, dz = tz - me.z;
      const l = Math.hypot(dx, dz);
      if (l > r1) { tx = me.x + dx / l * r1; tz = me.z + dz / l * r1; }
      api.use('k1', { x: tx, z: tz });
      api.say("Burn there.");
      return;
    }
  }

  // movement: avoid enemy zones
  let danger = null;
  for (const z of p.arena.zones) {
    if (z.mine) continue;
    const dd = Math.hypot(me.x - z.x, me.z - z.z);
    if (dd < z.r + me.radius + 1.2) danger = z;
  }
  if (danger) {
    const away = V.norm({ x: me.x - danger.x, z: me.z - danger.z });
    api.move(away.x, away.z);
    api.faceAt(en.x, en.z);
    return;
  }

  api.faceAt(en.x, en.z);
  if (d > 3.2) {
    api.moveTo(en.x, en.z);
  } else if (d < 2.6) {
    const away = V.away(me, en);
    api.move(away.x, away.z);
  } else {
    const t = V.toward(me, en);
    const s = V.perp(t);
    const sign = (p.tick % 120 < 60) ? 1 : -1;
    api.move(s.x * sign, s.z * sign);
  }
}