function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en) return;

  const dist = en.dist;
  const k1 = me.kit.k1, k2 = me.kit.k2, k3 = me.kit.k3;

  // dodge incoming projectiles
  let dodge = null;
  for (const pr of p.arena.projectiles) {
    if (pr.mine) continue;
    const rel = { x: me.x - pr.x, z: me.z - pr.z };
    const v = { x: pr.vx, z: pr.vz };
    const vl = Math.hypot(v.x, v.z) || 1;
    const u = { x: v.x / vl, z: v.z / vl };
    const along = rel.x * u.x + rel.z * u.z;
    if (along < 0 || along > vl * pr.left + 2) continue;
    const perp = Math.abs(rel.x * u.z - rel.z * u.x);
    if (perp < 2.4) {
      const side = (rel.x * u.z - rel.z * u.x) >= 0 ? 1 : -1;
      dodge = { x: u.z * side, z: -u.x * side };
    }
  }

  if (dodge) {
    if (api.ready('k2') && dist > 4) {
      api.use('k2', { x: me.x + dodge.x * 6, z: me.z + dodge.z * 6 });
      api.faceAt(en.x, en.z);
      return;
    }
    api.move(dodge.x, dodge.z);
    api.faceAt(en.x, en.z);
    if (api.ready('k1') && en.visible && dist < 20) api.use('k1', { x: en.x, z: en.z });
    return;
  }

  // avoid enemy zones
  for (const z of p.arena.zones) {
    if (z.mine) continue;
    const d = Math.hypot(me.x - z.x, me.z - z.z);
    if (d < z.r + me.radius + 0.8) {
      const away = V.norm({ x: me.x - z.x, z: me.z - z.z });
      api.move(away.x, away.z);
      api.faceAt(en.x, en.z);
      return;
    }
  }

  api.faceAt(en.x, en.z);

  const visible = en.visible;

  // offense
  if (visible) {
    if (api.ready('k1') && dist < 20) {
      const lead = V.lead({ x: me.x, z: me.z }, { x: en.x, z: en.z }, { x: en.vx, z: en.vz }, k1 ? k1.speed || 22 : 22);
      api.use('k1', lead);
    } else if (api.ready('k3') && dist < 13) {
      const lead = V.lead({ x: me.x, z: me.z }, { x: en.x, z: en.z }, { x: en.vx, z: en.vz }, 6);
      api.use('k3', lead);
    } else if (api.ready('k2') && (me.hp < 120 || en.casting) && dist < 9) {
      // shield up / reposition
      const away = V.away({ x: me.x, z: me.z }, { x: en.x, z: en.z });
      api.use('k2', { x: V.clamp(me.x + away.x * 6, -18, 18), z: V.clamp(me.z + away.z * 6, -18, 18) });
    }
  }

  // movement: kite at mid range
  const ideal = 11;
  if (!visible) {
    api.moveTo(en.x, en.z);
  } else if (dist > ideal + 2) {
    api.moveTo(en.x, en.z);
  } else if (dist < ideal - 3) {
    const away = V.away({ x: me.x, z: me.z }, { x: en.x, z: en.z });
    const strafe = V.perp(away);
    const sgn = ((p.tick / 60) | 0) % 2 ? 1 : -1;
    const dir = V.norm({ x: away.x + strafe.x * 0.7 * sgn, z: away.z + strafe.z * 0.7 * sgn });
    let tx = V.clamp(me.x + dir.x * 8, -18, 18);
    let tz = V.clamp(me.z + dir.z * 8, -18, 18);
    api.moveTo(tx, tz);
  } else {
    const away = V.away({ x: me.x, z: me.z }, { x: en.x, z: en.z });
    const strafe = V.perp(away);
    const sgn = ((p.tick / 45) | 0) % 2 ? 1 : -1;
    let tx = V.clamp(me.x + strafe.x * 6 * sgn, -18, 18);
    let tz = V.clamp(me.z + strafe.z * 6 * sgn, -18, 18);
    api.moveTo(tx, tz);
  }

  if (p.t > 1 && p.t < 1.2) api.say("Blue holds the line.");
}