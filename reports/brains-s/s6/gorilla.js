function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en.alive) return;

  const dist = en.dist;
  const toEnemy = V.toward(me, en);

  // ---- track enemy laser casts / blinks ----
  for (const ev of p.events) {
    if (ev.type === 'enemyStarted') {
      api.remember('lastEnemySkill', ev.skill);
      api.remember('lastEnemySkillT', p.t);
      if (ev.skill === 'blink') api.remember('blinkT', p.t);
      if (ev.skill === 'laser') api.remember('laserT', p.t);
    }
    if (ev.type === 'damaged') api.remember('lastHitT', p.t);
  }

  const enemyCasting = en.casting && en.casting.skill === 'laser' && en.casting.telegraph;

  // ---- if busy with an uninterruptible thing, just keep facing ----
  if (me.airborne) {
    api.faceAt(en.x, en.z);
    return;
  }

  // ================= COMBAT DECISIONS =================

  // Smash range: centre-to-centre up to 5.15, but be safe: use 4.4 to allow travel during windup
  const smashLandRange = 5.0;

  // predict enemy position at smash land (0.3s)
  const predX = en.x + en.vx * 0.30;
  const predZ = en.z + en.vz * 0.30;
  const predDist = Math.hypot(predX - me.x, predZ - me.z);

  const angToEnemy = Math.abs(V.angleTo(me.heading, toEnemy));

  // ---- SMASH ----
  if (!me.busy && api.ready('smash') && predDist < smashLandRange && !en.airborne && en.visible && angToEnemy < 1.4) {
    api.use('smash');
    api.faceAt(predX, predZ);
    // keep pressing in
    api.move(toEnemy.x, toEnemy.z);
    return;
  }

  // ---- CHARGE ----
  // Great for closing distance and interrupting lasers.
  if (!me.busy && api.ready('charge') && en.visible && dist > 3.2 && dist < 13.5) {
    // aim at where they'll be at contact time
    const windup = 0.3;
    const travelT = Math.max(0, (dist - 2.2) / 15);
    let tx = en.x + en.vx * (windup + travelT) * 0.85;
    let tz = en.z + en.vz * (windup + travelT) * 0.85;
    // if they are casting laser they're slow -> aim nearly straight
    if (enemyCasting) { tx = en.x + en.vx * 0.3; tz = en.z + en.vz * 0.3; }
    const dir = V.norm({ x: tx - me.x, z: tz - me.z });
    const r = api.ray(dir.x, dir.z, Math.min(13, dist + 1.5));
    // only charge if path fairly clear
    if (!r.hit || r.dist > dist - 1.5) {
      api.use('charge');
      api.face(dir.x, dir.z);
      api.move(dir.x, dir.z);
      return;
    }
  }

  // ---- LASER DODGE ----
  // If enemy is casting laser and we're in the line, strafe hard perpendicular.
  if (enemyCasting && !me.busy) {
    const rem = en.casting.remaining;
    const perp = V.perp(toEnemy);
    // pick side that increases angular offset from their facing
    const enFace = V.fromHeading(en.heading);
    const side = V.dot(perp, enFace) > 0 ? -1 : 1;
    let dodge = V.scale(perp, side);
    // blend a little toward them to keep pressure
    dodge = V.norm({ x: dodge.x + toEnemy.x * 0.35, z: dodge.z + toEnemy.z * 0.35 });
    // jump won't help (height not consulted). Use blocks / strafe.
    if (rem < 0.35 && api.ready('charge') && dist < 13 && dist > 3.2) {
      const dir = V.toward(me, en);
      api.use('charge');
      api.face(dir.x, dir.z);
      api.move(dir.x, dir.z);
      return;
    }
    api.move(dodge.x, dodge.z);
    api.faceAt(en.x, en.z);
    return;
  }

  // ---- DEFAULT: CLOSE IN ----
  api.faceAt(en.x, en.z);

  if (!me.busy) {
    if (dist > 2.0) {
      // approach; use pathing when blocked
      if (en.visible) {
        // weave slightly so a laser is harder to land
        const weavePhase = Math.sin(p.t * 3.3);
        const perp = V.perp(toEnemy);
        const w = dist > 7 ? 0.45 : 0.2;
        const dir = V.norm({
          x: toEnemy.x + perp.x * weavePhase * w,
          z: toEnemy.z + perp.z * weavePhase * w
        });
        api.move(dir.x, dir.z);
      } else {
        api.moveTo(en.x, en.z);
      }
    } else {
      // right on top: hold contact, keep facing
      api.move(toEnemy.x, toEnemy.z);
    }
  }
}
