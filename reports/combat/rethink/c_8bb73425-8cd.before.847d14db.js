function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en) return;
  const d = en.dist;

  if (p.t < 0.5) api.say("Come close. I burn things.");

  // Emergency / utility: k3 shield+cleanse
  if (api.ready('k3')) {
    const hurt = me.burning || me.stunned === false && (me.hp < 90);
    const incoming = en.casting && en.casting.telegraph && d < 7;
    if (me.burning || incoming || (d < 5 && me.shield <= 0)) {
      api.use('k3');
    }
  }

  // k2 cone: close range burst + knock
  if (api.ready('k2') && d < 4.5 && en.visible && !en.airborne) {
    api.use('k2', { x: en.x, z: en.z });
    api.face(en.x - me.x, en.z - me.z);
    return;
  }

  // k1 disc: lead the enemy slightly
  if (api.ready('k1') && d < 13 && api.los(en.x, en.z)) {
    const lead = 0.5;
    let tx = en.x + en.vx * lead, tz = en.z + en.vz * lead;
    const dx = tx - me.x, dz = tz - me.z;
    const L = Math.hypot(dx, dz);
    if (L > 12) { tx = me.x + dx / L * 12; tz = me.z + dz / L * 12; }
    api.use('k1', { x: tx, z: tz });
  }

  // Movement: avoid standing in enemy zones
  let danger = null;
  for (const z of p.arena.zones) {
    if (!z.mine) {
      const dd = Math.hypot(z.x - me.x, z.z - me.z);
      if (dd < z.r + me.radius + 1.2) danger = z;
    }
  }
  if (danger) {
    const away = V.norm({ x: me.x - danger.x, z: me.z - danger.z });
    api.move(away.x, away.z);
    api.faceAt(en.x, en.z);
    return;
  }

  api.faceAt(en.x, en.z);

  // Kiting logic: stay at ~3.2m to threaten cone, back off when k2 down
  const k2cd = api.cooldown('k2');
  let want;
  if (me.hp < en.hp - 40 && p.burnStartsIn > 3) want = 8;
  else if (k2cd > 0.6) want = 6.5;
  else want = 2.6;

  const toEn = V.toward(me, en);
  if (d > want + 1) {
    api.moveTo(en.x, en.z);
  } else if (d < want - 0.8) {
    let away = { x: -toEn.x, z: -toEn.z };
    let tx = me.x + away.x * 5, tz = me.z + away.z * 5;
    if (Math.abs(tx) > 18 || Math.abs(tz) > 18) {
      const s = V.rot(away, 1.2);
      tx = me.x + s.x * 5; tz = me.z + s.z * 5;
    }
    api.move(tx - me.x, tz - me.z);
  } else {
    const strafe = V.perp(toEn);
    const sgn = (p.tick % 120 < 60) ? 1 : -1;
    api.move(strafe.x * sgn, strafe.z * sgn);
  }
}