function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en.alive) return;

  const dist = en.dist;
  const toEn = V.toward(me, en);

  // ---- track enemy laser casts / blinks ----
  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      api.remember('lastEnemySkill', e.skill);
      api.remember('lastEnemySkillT', p.t);
      if (e.skill === 'laser') api.remember('lastLaserT', p.t);
      if (e.skill === 'blink') api.remember('lastBlinkT', p.t);
    }
  }

  const lastLaser = api.recall('lastLaserT', -99);
  const lastBlink = api.recall('lastBlinkT', -99);
  const laserReadyIn = Math.max(0, 2.2 - (p.t - lastLaser));
  const blinkReadyIn = Math.max(0, 3.933 - (p.t - lastBlink));

  const enemyCasting = en.casting && en.casting.skill === 'laser' && en.casting.telegraph;

  // ---------- helpers ----------
  const insideBlock = (x, z, pad) => {
    for (const o of p.arena.obstacles) {
      if (Math.abs(x - o.x) < o.hx + pad && Math.abs(z - o.z) < o.hz + pad) return true;
    }
    return false;
  };
  const clampArena = (v) => Math.max(-19, Math.min(19, v));

  // ---------- combat ranges ----------
  const smashReach = 2.9 + me.radius + en.radius; // 5.15 centre-to-centre
  const canSmashNow = api.ready('smash');
  const canCharge = api.ready('charge');

  // predicted enemy position at smash landing (0.3s)
  const predX = en.x + en.vx * 0.3;
  const predZ = en.z + en.vz * 0.3;
  const predDist = Math.hypot(predX - me.x, predZ - me.z);

  // ---------- face logic ----------
  let faceTarget = { x: en.x, z: en.z };

  // ---------- if busy, only steer ----------
  const busySkill = me.casting ? me.casting.skill : null;

  // ============ ACTION ============
  let acted = false;

  if (!me.busy && !me.stunned && !me.airborne) {
    // SMASH when in range (and about to be in range)
    if (canSmashNow && !en.invulnerable && predDist <= smashReach - 0.15 && !en.airborne) {
      api.use('smash');
      acted = true;
      api.say('SMASH');
    }
    // CHARGE: gap closer / interrupt
    else if (canCharge && dist > 4.0 && dist < 13.5 && en.visible && !en.airborne) {
      // aim at lead point: enemy pos after windup 0.3 + travel
      const travelT = Math.min(0.8, Math.max(0, (dist - me.radius - en.radius) / 15));
      const ax = en.x + en.vx * (0.3 + travelT) * 0.8;
      const az = en.z + en.vz * (0.3 + travelT) * 0.8;
      // check path clear-ish
      const d = V.norm({ x: ax - me.x, z: az - me.z });
      const r = api.ray(d.x, d.z, Math.min(13, dist + 1));
      const good = !r.hit || r.dist >= dist - (me.radius + en.radius) - 0.3;
      const urgent = enemyCasting || dist < 9;
      if (good && urgent) {
        api.faceAt(ax, az);
        api.use('charge');
        acted = true;
        api.say('CHARGE');
      }
    }
  }

  // Dodge laser with jump? Laser hits airborne too — no. Jump used for gap only.
  // Use jump to cross gaps quickly is not faster. Skip jump mostly.

  // ============ MOVEMENT ============
  if (me.casting && me.casting.skill === 'charge' && me.casting.phase === 'windup') {
    // lock facing toward lead point already set; keep facing
    const ax = api.recall('chargeAimX', en.x), az = api.recall('chargeAimZ', en.z);
    api.faceAt(en.x + en.vx * 0.35, en.z + en.vz * 0.35);
    return;
  }

  if (acted && me === me) {
    // fallthrough to movement below
  }

  // Movement decision
  if (me.airborne) {
    api.faceAt(en.x, en.z);
    return;
  }

  // If enemy is casting laser and we have line of sight, strafe hard perpendicular
  let moveVec = null;

  if (dist <= smashReach + 0.6) {
    // stay glued, circle slightly to stay in cone
    const push = V.toward(me, en);
    moveVec = { x: push.x, z: push.z };
  } else if (enemyCasting && en.visible && dist > 6) {
    // break LOS or strafe
    const perp = V.perp(toEn);
    const side = api.recall('strafeSide', 1);
    // pick side that moves away from walls
    let s = side;
    const tx = me.x + perp.x * s * 4, tz = me.z + perp.z * s * 4;
    if (Math.abs(tx) > 18 || Math.abs(tz) > 18) { s = -s; api.remember('strafeSide', s); }
    moveVec = { x: toEn.x * 0.55 + perp.x * s * 1.0, z: toEn.z * 0.55 + perp.z * s * 1.0 };
  } else {
    // approach: use pathing around blocks
    const path = api.pathTo(en.x, en.z);
    if (path && path.points && path.points.length > 0 && !path.direct) {
      const wp = path.points[0];
      moveVec = V.toward(me, { x: wp.x, z: wp.z });
    } else {
      // zigzag approach to make laser aim harder
      const perp = V.perp(toEn);
      const phase = Math.sin(p.t * 2.4);
      let side = api.recall('strafeSide', 1);
      if (p.t - api.recall('sideT', 0) > 0.9) {
        api.remember('strafeSide', -side);
        api.remember('sideT', p.t);
        side = -side;
      }
      const jig = dist > 7 ? 0.75 : 0.35;
      moveVec = { x: toEn.x + perp.x * side * jig, z: toEn.z + perp.z * side * jig };
    }
  }

  // wall avoidance
  const nx = me.x + moveVec.x * 2.2, nz = me.z + moveVec.z * 2.2;
  if (Math.abs(nx) > 19) moveVec.x -= Math.sign(nx) * 0.9;
  if (Math.abs(nz) > 19) moveVec.z -= Math.sign(nz) * 0.9;

  api.move(moveVec.x, moveVec.z);

  // facing: lead the enemy for smash
  if (me.casting && me.casting.skill === 'smash') {
    api.faceAt(en.x + en.vx * 0.15, en.z + en.vz * 0.15);
  } else {
    api.faceAt(predX, predZ);
  }
}
