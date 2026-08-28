function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en.alive) return;

  const dist = en.dist;
  const toEnemy = V.toward(me, en);

  // ---- event bookkeeping ----
  let sawLaserStart = false, sawBlink = false;
  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      if (e.skill === 'laser') { sawLaserStart = true; api.remember('laserAt', p.t); }
      if (e.skill === 'blink') { sawBlink = true; api.remember('blinkAt', p.t); }
      if (e.skill === 'jump') api.remember('enemyJumpAt', p.t);
    }
    if (e.type === 'damaged' && e.skill === 'laser') api.remember('lastLaserHit', p.t);
    if (e.type === 'blocked') api.remember('blockedAt', p.t);
  }

  // strafe side, flipped occasionally
  let side = api.recall('side', 1);
  if (p.t - api.recall('sideAt', -9) > 1.6 && (api.rand() < 0.25 || p.events.some(e => e.type === 'blocked'))) {
    side = -side;
    api.remember('side', side);
    api.remember('sideAt', p.t);
  }

  // ---- if busy with an uninterruptible thing, still steer/face ----
  const casting = me.casting;

  // ================= FACING =================
  // Almost always face the enemy (predicted slightly).
  const lead = { x: en.x + en.vx * 0.12, z: en.z + en.vz * 0.12 };
  api.faceAt(lead.x, lead.z);

  // ================= SKILL LOGIC =================

  const smashReach = 2.9 + me.radius + en.radius; // 5.15
  const enemyLaserWindup = en.casting && en.casting.skill === 'laser' && en.casting.telegraph;
  const enemyVulnerable = !en.invulnerable && !en.airborne;

  // --- SMASH: close range, in cone ---
  if (!me.busy && api.ready('smash') && enemyVulnerable) {
    // predict enemy position at land time (0.3s)
    const px = en.x + en.vx * 0.3, pz = en.z + en.vz * 0.3;
    const d = Math.hypot(px - me.x, pz - me.z);
    const ang = Math.abs(V.angleTo(me.heading, { x: px - me.x, z: pz - me.z }));
    // facing can turn 0.55*4*0.3 = 0.66 rad during windup
    const allowedHalf = (55 * Math.PI / 180) + Math.asin(Math.min(0.999, en.radius / Math.max(d, en.radius + 0.01)));
    if (d < smashReach - 0.25 && ang < allowedHalf + 0.6) {
      api.use('smash');
      // keep pressing in
      api.move(toEnemy.x, toEnemy.z);
      return;
    }
  }

  // --- CHARGE: mid range gap-closer / interrupt ---
  if (!me.busy && api.ready('charge') && en.visible) {
    // target position at end of windup + travel
    let good = false;
    if (dist > 4.0 && dist < 12.5) {
      // is the lane clear?
      const r = api.ray(toEnemy.x, toEnemy.z, Math.min(dist, 13));
      const clear = !r.hit || r.dist >= dist - (me.radius + en.radius) - 0.2;
      if (clear) {
        // prefer when they're casting laser (interrupt) or stationary-ish or close
        if (enemyLaserWindup) good = true;
        else if (dist < 9.5 && !en.airborne && !en.invulnerable) good = true;
      }
    }
    if (good) {
      const px = en.x + en.vx * 0.36, pz = en.z + en.vz * 0.36;
      api.faceAt(px, pz);
      api.use('charge');
      api.move(px - me.x, pz - me.z);
      return;
    }
  }

  // --- JUMP: dodge nothing useful (laser ignores height). Use to close gaps? ---
  // Jump preserves velocity; not that useful. Use rarely to cross open ground fast? No speed gain.
  // Skip jump entirely except to escape a smash-less situation. (Octopus has no ground sweep.)

  // ================= MOVEMENT =================

  if (me.busy) {
    if (casting && casting.skill === 'smash') {
      api.move(toEnemy.x, toEnemy.z);
    }
    return;
  }

  // Dodging laser: when the octopus is casting, break the line — either get behind
  // cover or strafe hard perpendicular. Beam has 0.4 margin + our 1.25 radius, so
  // we need substantial lateral displacement; better to duck behind a block or close.
  if (enemyLaserWindup) {
    const rem = en.casting.remaining;
    if (dist < 6.5) {
      // just get in their face
      api.move(toEnemy.x, toEnemy.z);
      return;
    }
    // strafe perpendicular with slight approach
    const perp = V.perp(toEnemy);
    let dir = { x: perp.x * side + toEnemy.x * 0.55, z: perp.z * side + toEnemy.z * 0.55 };
    // avoid running into walls
    dir = avoidWalls(me, dir, api);
    api.move(dir.x, dir.z);
    return;
  }

  // Default: close the distance, using pathing around blocks.
  // But approach with a curve so we're not a straight sitting duck.
  if (dist > 3.0) {
    const path = api.pathTo(en.x, en.z);
    if (path && !path.direct && path.points && path.points.length) {
      const wp = path.points[0];
      api.moveTo(wp.x, wp.z);
      return;
    }
    // direct line available
    const perp = V.perp(toEnemy);
    const weave = dist > 7 ? 0.65 : 0.35;
    let dir = { x: toEnemy.x + perp.x * side * weave, z: toEnemy.z + perp.z * side * weave };
    dir = avoidWalls(me, dir, api);
    api.move(dir.x, dir.z);
    return;
  }

  // In smash range but smash on cooldown: orbit tight, stay close, keep facing.
  const perp = V.perp(toEnemy);
  const cdSmash = api.cooldown('smash');
  let keep;
  if (cdSmash < 0.35) {
    keep = { x: toEnemy.x, z: toEnemy.z };
  } else {
    keep = { x: perp.x * side + toEnemy.x * 0.3, z: perp.z * side + toEnemy.z * 0.3 };
  }
  keep = avoidWalls(me, keep, api);
  api.move(keep.x, keep.z);
}

function avoidWalls(me, dir, api) {
  const H = 19.0;
  let x = dir.x, z = dir.z;
  if (me.x > H && x > 0) x = -Math.abs(x) * 0.5;
  if (me.x < -H && x < 0) x = Math.abs(x) * 0.5;
  if (me.z > H && z > 0) z = -Math.abs(z) * 0.5;
  if (me.z < -H && z < 0) z = Math.abs(z) * 0.5;
  const n = Math.hypot(x, z);
  if (n < 1e-6) return { x: -me.x, z: -me.z };
  return { x: x / n, z: z / n };
}
