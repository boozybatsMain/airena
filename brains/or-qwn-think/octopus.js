function think(p, api) {
  const me = p.self;
  const en = p.enemy;
  if (!me.alive || !en.alive) return;

  // Track enemy cooldowns from events
  let ecd = api.recall('ecd', { smash: 0, charge: 0, jump: 0 });
  for (const ev of p.events) {
    if (ev.type === 'enemyStarted') {
      if (ev.skill === 'smash') ecd.smash = p.t + 1.3;
      else if (ev.skill === 'charge') ecd.charge = p.t + 4.033;
      else if (ev.skill === 'jump') ecd.jump = p.t + 2.8;
    }
  }
  api.remember('ecd', ecd);

  const dx = en.x - me.x;
  const dz = en.z - me.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  const toEnemy = dist > 0.01 ? { x: dx / dist, z: dz / dist } : { x: 0, z: 1 };
  const awayDir = { x: -toEnemy.x, z: -toEnemy.z };

  const enemyCharging = en.casting && en.casting.skill === 'charge' && en.casting.phase === 'dash';
  const enemyWindupCharge = en.casting && en.casting.skill === 'charge' && en.casting.phase === 'windup';
  const enemySmashing = en.casting && en.casting.skill === 'smash' && en.casting.phase === 'windup';
  const enemyStunned = en.stunned;

  // --- DODGE: Blink away from charge ---
  if (enemyCharging && dist < 16) {
    const chargeDir = V.fromHeading(en.heading);
    const dotToward = V.dot(chargeDir, toEnemy);
    if (dotToward > 0.3) {
      if (api.ready('blink')) {
        let perp = V.perp(chargeDir);
        const t1 = { x: me.x + perp.x * 7, z: me.z + perp.z * 7 };
        const t2 = { x: me.x - perp.x * 7, z: me.z - perp.z * 7 };
        const clearance1 = Math.min(20 - Math.abs(t1.x), 20 - Math.abs(t1.z));
        const clearance2 = Math.min(20 - Math.abs(t2.x), 20 - Math.abs(t2.z));
        if (clearance2 > clearance1) perp = V.scale(perp, -1);
        api.use('blink', perp.x, perp.z);
        return;
      } else if (api.ready('jump') && !me.airborne) {
        api.use('jump');
        return;
      }
    }
  }

  // --- DODGE: React to charge windup ---
  if (enemyWindupCharge && dist < 14 && api.ready('blink')) {
    const faceDir = V.fromHeading(en.heading);
    const dotToward = V.dot(faceDir, toEnemy);
    if (dotToward > 0.4) {
      let perp = V.perp(faceDir);
      const t1 = { x: me.x + perp.x * 7, z: me.z + perp.z * 7 };
      const t2 = { x: me.x - perp.x * 7, z: me.z - perp.z * 7 };
      const c1 = Math.min(20 - Math.abs(t1.x), 20 - Math.abs(t1.z));
      const c2 = Math.min(20 - Math.abs(t2.x), 20 - Math.abs(t2.z));
      if (c2 > c1) perp = V.scale(perp, -1);
      api.use('blink', perp.x, perp.z);
      return;
    }
  }

  // --- DODGE: Jump over smash ---
  if (enemySmashing && dist < 5.5 && !me.airborne) {
    if (api.ready('jump')) {
      api.use('jump');
      return;
    } else if (api.ready('blink')) {
      api.use('blink', awayDir.x, awayDir.z);
      return;
    }
  }

  // --- ATTACK: Laser ---
  if (api.ready('laser') && !me.busy && !me.airborne) {
    const castTime = 0.667;
    const predX = en.x + en.vx * castTime;
    const predZ = en.z + en.vz * castTime;
    const predDist = Math.sqrt((predX - me.x) ** 2 + (predZ - me.z) ** 2);

    if (predDist < 26 && api.los(predX, predZ)) {
      api.faceAt(predX, predZ);
      api.use('laser');
      // Strafe slowly while casting
      const perp = V.perp(toEnemy);
      const strafeTest = { x: me.x + perp.x * 2, z: me.z + perp.z * 2 };
      const inBounds = Math.abs(strafeTest.x) < 19 && Math.abs(strafeTest.z) < 19;
      if (inBounds) {
        api.move(perp.x * 0.4, perp.z * 0.4);
      } else {
        api.move(-perp.x * 0.4, -perp.z * 0.4);
      }
      return;
    }
  }

  // --- If casting laser, keep facing predicted position ---
  if (me.casting && me.casting.skill === 'laser') {
    const remaining = me.casting.remaining || 0;
    const predX = en.x + en.vx * remaining;
    const predZ = en.z + en.vz * remaining;
    api.faceAt(predX, predZ);
    return;
  }

  // --- MOVEMENT ---
  const idealDist = 11;

  if (dist < 5) {
    // Too close, retreat urgently
    api.move(awayDir.x, awayDir.z);
    api.faceAt(en.x, en.z);
    if (api.ready('blink') && dist < 3.5) {
      api.use('blink', awayDir.x, awayDir.z);
      return;
    }
  } else if (dist > 20) {
    // Too far, close in
    api.moveTo(en.x, en.z);
    api.faceAt(en.x, en.z);
  } else if (dist > idealDist + 3) {
    // Slightly too far, approach carefully
    api.moveTo(en.x, en.z);
    api.faceAt(en.x, en.z);
  } else if (dist < idealDist - 3) {
    // Slightly too close, back off
    api.move(awayDir.x, awayDir.z);
    api.faceAt(en.x, en.z);
  } else {
    // Good range, strafe to be unpredictable
    const perp = V.perp(toEnemy);
    let strafeSign = api.recall('strafeSign', 1);
    // Occasionally flip strafe direction
    if (api.rand() < 0.02) {
      strafeSign = -strafeSign;
      api.remember('strafeSign', strafeSign);
    }
    const strafeDir = V.scale(perp, strafeSign);
    const testPos = { x: me.x + strafeDir.x * 3, z: me.z + strafeDir.z * 3 };
    if (Math.abs(testPos.x) > 18.5 || Math.abs(testPos.z) > 18.5) {
      strafeSign = -strafeSign;
      api.remember('strafeSign', strafeSign);
      api.move(-strafeDir.x, -strafeDir.z);
    } else {
      api.move(strafeDir.x, strafeDir.z);
    }
    api.faceAt(en.x, en.z);
  }

  // --- BURN PHASE: fight harder ---
  if (p.burn > 0) {
    const myFrac = me.hp / me.maxHp;
    const enFrac = en.hp / en.maxHp;
    if (myFrac < enFrac && api.ready('laser') && !me.busy && p.enemy.visible && dist < 26) {
      api.faceAt(en.x, en.z);
      api.use('laser');
    }
  }
}