function think(p, api) {
  const me = p.self;
  const en = p.enemy;
  const t = p.t;

  if (!me.alive) return;

  const dx = en.x - me.x;
  const dz = en.z - me.z;
  const dist = Math.hypot(dx, dz);
  const faceToEnemy = Math.atan2(dx, dz);

  const k1 = me.kit.k1;
  const k2 = me.kit.k2;
  const k3 = me.kit.k3;

  const k1R = k1.range || 18;
  const k3R = k3.range || 24;
  const k2D = k2.distance || 6.5;

  const safe = (x, z) => x > -19 && x < 19 && z > -19 && z < 19;

  const centerX = 0, centerZ = 0;

  const enemyCasting = en.casting;
  const enemyTele = enemyCasting && enemyCasting.telegraph;
  const enemySkill = enemyCasting && enemyCasting.skill;

  const myCasting = me.casting;
  const mySkill = myCasting && myCasting.skill;

  const enBeaming = enemySkill === 'k3' && enemyTele;
  const enBolting = enemySkill === 'k1' && enemyTele;
  const enBlinking = enemySkill === 'k2' && enemyTele;

  const burnActive = p.burn > 0;

  const enemyHpFrac = en.hp / en.maxHp;
  const myHpFrac = me.hp / me.maxHp;

  const enRooted = !!en.rooted;
  const meRooted = !!me.rooted;
  const meShield = me.shield || 0;

  const enClose = dist < k2D + en.radius + 1.5;
  const enMid = dist > 8 && dist < k1R - 2;
  const enFar = dist >= k1R - 2;

  const turnShortest = (a, b) => {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  };

  const angleTo = turnShortest(me.heading, faceToEnemy);

  if (meRooted || me.stunned || me.airborne) {
    api.face(dx, dz);
    return;
  }

  if (enBeaming || enBolting) {
    let bx = -dz, bz = dx;
    const bl = Math.hypot(bx, bz) || 1;
    bx /= bl; bz /= bl;
    let strafex = me.x + bx * 3;
    let strafez = me.z + bz * 3;
    if (!safe(strafex, strafez)) {
      strafex = me.x - bx * 3;
      strafez = me.z - bz * 3;
    }
    if (api.ready('k2')) {
      const away = { x: -dx, z: -dz };
      const al = Math.hypot(away.x, away.z) || 1;
      let tx = me.x + (away.x / al) * k2D;
      let tz = me.z + (away.z / al) * k2D;
      if (!safe(tx, tz)) {
        tx = me.x - bx * k2D;
        tz = me.z - bz * k2D;
      }
      api.use('k2', { x: tx, z: tz });
      return;
    }
    api.moveTo(strafex, strafez);
    api.face(dx, dz);
    return;
  }

  if (api.ready('k3') && dist < k3R + en.radius && en.visible && !enBeaming) {
    if (api.los(en.x, en.z)) {
      api.face(dx, dz);
      api.use('k3');
      return;
    }
  }

  if (api.ready('k1') && dist < k1R + en.radius && en.visible && !myCasting) {
    if (api.los(en.x, en.z)) {
      api.face(dx, dz);
      api.use('k1');
      return;
    }
  }

  const desired = (() => {
    if (dist < 5) {
      const back = { x: -dx, z: -dz };
      const bl = Math.hypot(back.x, back.z) || 1;
      return { x: me.x + (back.x / bl) * 5, z: me.z + (back.z / bl) * 5 };
    }
    if (dist > k1R - 1) {
      return { x: en.x, z: en.z };
    }
    const perp1x = -dz, perp1z = dx;
    const pl = Math.hypot(perp1x, perp1z) || 1;
    const side = api.rand() < 0.5 ? 1 : -1;
    const tx = me.x + (perp1x / pl) * 4 * side;
    const tz = me.z + (perp1z / pl) * 4 * side;
    if (safe(tx, tz)) return { x: tx, z: tz };
    return { x: en.x, z: en.z };
  })();

  if (safe(desired.x, desired.z)) {
    api.moveTo(desired.x, desired.z);
  } else {
    api.moveTo(centerX, centerZ);
  }
  api.face(dx, dz);
}