function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en) return;

  const d = en.dist;
  const canSee = en.visible;

  // shield/boost when threatened
  if (api.ready('k3') && (d < 9 || (en.casting && en.casting.telegraph) || me.hp < me.maxHp * 0.55)) {
    api.use('k3');
  } else if (api.ready('k2') && canSee && d < 17.5 && d > 3.0) {
    // lead the target a little
    const lead = V.lead(me, en, { x: en.vx, z: en.vz }, 18);
    let aim = { x: lead.x, z: lead.z };
    const dd = Math.hypot(aim.x - me.x, aim.z - me.z);
    if (dd < 3.8) {
      const dir = V.toward(me, en);
      aim = { x: me.x + dir.x * 3.9, z: me.z + dir.z * 3.9 };
    }
    aim.x = Math.max(-17.5, Math.min(17.5, aim.x));
    aim.z = Math.max(-17.5, Math.min(17.5, aim.z));
    api.use('k2', aim);
  } else if (api.ready('k1') && canSee && d < 13.5) {
    const lead2 = V.lead(me, en, { x: en.vx, z: en.vz }, 0);
    api.use('k1', { x: en.x + (en.vx || 0) * 0.4, z: en.z + (en.vz || 0) * 0.4 });
  }

  // movement: kite at mid range, avoid standing in enemy zones
  let danger = null;
  for (const z of p.arena.zones) {
    if (!z.mine) {
      const dz = Math.hypot(me.x - z.x, me.z - z.z);
      if (dz < z.r + 2.4) danger = z;
    }
  }

  const ideal = 9;
  let dir;
  if (danger) {
    dir = V.norm({ x: me.x - danger.x, z: me.z - danger.z });
  } else if (!canSee) {
    api.moveTo(en.x, en.z);
    api.faceAt(en.x, en.z);
    return;
  } else if (d > ideal + 2) {
    dir = V.toward(me, en);
  } else if (d < ideal - 2) {
    dir = V.away(me, en);
  } else {
    const perp = V.perp(V.toward(me, en));
    const s = (Math.floor(p.t / 2.5) % 2) ? 1 : -1;
    dir = { x: perp.x * s, z: perp.z * s };
  }

  let tx = me.x + dir.x * 6, tz = me.z + dir.z * 6;
  const lim = 18;
  if (tx > lim) tx = lim; if (tx < -lim) tx = -lim;
  if (tz > lim) tz = lim; if (tz < -lim) tz = -lim;
  api.move(tx - me.x, tz - me.z);
  api.faceAt(en.x, en.z);
}