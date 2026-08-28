function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en.alive) return;

  const dist = en.dist;
  const toEnemy = V.toward(me, en);

  // --- track enemy laser casts / blinks ---
  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      api.remember('lastEnemySkill', e.skill);
      api.remember('lastEnemySkillT', p.t);
      if (e.skill === 'blink') api.remember('lastBlinkT', p.t);
      if (e.skill === 'laser') api.remember('lastLaserT', p.t);
    }
    if (e.type === 'damaged') api.remember('lastHitT', p.t);
  }

  const lastBlinkT = api.recall('lastBlinkT', -99);
  const blinkLikelyReady = (p.t - lastBlinkT) > 3.9;

  // ---------- helpers ----------
  const obs = p.arena.obstacles;
  function blockedPoint(x, z, pad) {
    if (Math.abs(x) > p.arena.half - pad || Math.abs(z) > p.arena.half - pad) return true;
    for (const o of obs) {
      if (Math.abs(x - o.x) < o.hx + pad && Math.abs(z - o.z) < o.hz + pad) return true;
    }
    return false;
  }

  // ---------- combat state ----------
  const enemyCasting = en.casting;
  const enemyLaserCasting = enemyCasting && enemyCasting.skill === 'laser' && enemyCasting.telegraph;

  const smashReach = 2.9 + me.radius + en.radius; // 5.15
  const canSmashNow = dist <= smashReach - 0.15;

  // Predict where they will be in the smash windup (0.3s)
  const predX = en.x + en.vx * 0.32;
  const predZ = en.z + en.vz * 0.32;
  const predDist = Math.hypot(predX - me.x, predZ - me.z);

  // ---------- always face the enemy (or prediction) ----------
  let faceTarget = { x: predX, z: predZ };

  // ---------- if busy, just steer facing ----------
  if (me.casting && me.casting.skill === 'charge' && me.casting.phase === 'windup') {
    // Lock direction: aim slightly ahead of them (they dash away)
    const eta = 0.3 + Math.min(0.8, Math.max(0, (dist - me.radius - en.radius) / 15));
    let ax = en.x + en.vx * eta * 0.7;
    let az = en.z + en.vz * eta * 0.7;
    api.face(ax - me.x, az - me.z);
    api.move(ax - me.x, az - me.z);
    return;
  }

  if (me.busy && !(me.casting && me.casting.skill === 'smash')) {
    api.face(faceTarget.x - me.x, faceTarget.z - me.z);
    return;
  }

  // ---------- SMASH ----------
  if (api.ready('smash') && !me.airborne && !me.stunned) {
    if (predDist <= smashReach - 0.25 && !en.invulnerable && !en.airborne) {
      api.use('smash');
      api.face(predX - me.x, predZ - me.z);
      // keep pushing into them
      api.move(toEnemy.x, toEnemy.z);
      return;
    }
  }

  // ---------- CHARGE ----------
  // Charge is the main gap closer & interrupter.
  if (api.ready('charge') && !me.airborne && !me.stunned && en.visible) {
    const good = dist > 3.2 && dist < 12.5;
    const interrupt = enemyLaserCasting && dist < 13;
    if (good || interrupt) {
      // Make sure the path is roughly clear
      const r = api.ray(toEnemy.x, toEnemy.z, Math.min(13, dist + 1));
      if (!r.hit || r.dist >= dist - 0.6) {
        api.use('charge');
        api.face(en.x - me.x, en.z - me.z);
        api.move(toEnemy.x, toEnemy.z);
        return;
      }
    }
  }

  // ---------- DODGE THE LASER ----------
  // If they're casting laser at us and we can't reach them, strafe hard
  // perpendicular / break line of sight.
  if (enemyLaserCasting && dist > 3) {
    const rem = enemyCasting.remaining;
    // jump does NOT dodge laser (height not consulted). Move sideways instead.
    const perp = V.perp(toEnemy);
    let sign = api.recall('strafeSign', 1);
    // pick side that gets us out of the beam line fastest & is open
    const tryA = { x: me.x + perp.x * 4, z: me.z + perp.z * 4 };
    const tryB = { x: me.x - perp.x * 4, z: me.z - perp.z * 4 };
    const okA = !blockedPoint(tryA.x, tryA.z, 1.5);
    const okB = !blockedPoint(tryB.x, tryB.z, 1.5);
    if (okA && !okB) sign = 1; else if (okB && !okA) sign = -1;
    api.remember('strafeSign', sign);
    // combine with approach so we still close distance
    const mv = V.norm({
      x: perp.x * sign * 1.15 + toEnemy.x * 0.75,
      z: perp.z * sign * 1.15 + toEnemy.z * 0.75
    });
    api.move(mv.x, mv.z);
    api.face(predX - me.x, predZ - me.z);
    return;
  }

  // ---------- APPROACH ----------
  api.face(faceTarget.x - me.x, faceTarget.z - me.z);

  if (dist > 6.5) {
    // Close distance, weaving a little so a laser cast can't pre-aim easily.
    if (en.visible) {
      const perp = V.perp(toEnemy);
      const w = Math.sin(p.t * 2.4) * 0.55;
      const mv = V.norm({ x: toEnemy.x + perp.x * w, z: toEnemy.z + perp.z * w });
      const tx = me.x + mv.x * 3.5, tz = me.z + mv.z * 3.5;
      if (!blockedPoint(tx, tz, 1.4)) api.move(mv.x, mv.z);
      else api.moveTo(en.x, en.z);
    } else {
      api.moveTo(en.x, en.z);
    }
    return;
  }

  // ---------- CLOSE RANGE BRAWL ----------
  // Stay glued: inside smash range, orbit slightly to stay in cone.
  if (dist > smashReach - 1.0) {
    api.move(toEnemy.x, toEnemy.z);
  } else {
    // hug them, slight circling to prevent them walking behind us
    const perp = V.perp(toEnemy);
    let sign = api.recall('orbitSign', 1);
    if (api.rand() < 0.02) { sign = -sign; api.remember('orbitSign', sign); }
    const mv = V.norm({ x: toEnemy.x * 0.85 + perp.x * sign * 0.5, z: toEnemy.z * 0.85 + perp.z * sign * 0.5 });
    api.move(mv.x, mv.z);
  }
}
