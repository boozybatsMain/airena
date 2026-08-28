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
    if (e.type === 'damaged' && e.skill === 'laser') api.remember('lastHitT', p.t);
  }

  const enemyCasting = en.casting && en.casting.skill === 'laser' && en.casting.telegraph;

  // ---------------------------------------------------------------
  // SMASH — highest priority when in range
  // ---------------------------------------------------------------
  // Predict where they'll be in 0.3s (windup) — they're small and fast, but
  // the cone is huge so mostly we just need range.
  const predX = en.x + en.vx * 0.30;
  const predZ = en.z + en.vz * 0.30;
  const predDist = Math.hypot(predX - me.x, predZ - me.z);
  const smashReach = 2.9 + me.radius + en.radius; // 5.15 centre-to-centre

  // ---------------------------------------------------------------
  // Facing: almost always at the enemy
  // ---------------------------------------------------------------
  api.faceAt(en.x, en.z);

  // If already busy with something, just keep facing and let it run.
  if (me.busy) {
    // during smash windup, creep toward them
    if (me.casting && me.casting.skill === 'smash') {
      api.faceAt(predX, predZ);
      api.move(toEn.x, toEn.z);
    }
    return;
  }
  if (me.stunned || me.airborne) return;

  // ---------------------------------------------------------------
  // 1. SMASH if they are within reach and grounded
  // ---------------------------------------------------------------
  if (api.ready('smash') && !en.airborne && predDist <= smashReach - 0.15 && dist <= smashReach + 0.6) {
    // aim where they'll be
    api.faceAt(predX, predZ);
    api.use('smash');
    api.move(toEn.x, toEn.z);
    return;
  }

  // ---------------------------------------------------------------
  // 2. CHARGE — the closer, the better. Use it to close distance and
  //    to interrupt lasers.
  // ---------------------------------------------------------------
  if (api.ready('charge') && en.visible && !en.airborne) {
    // charge travels 12m max, lands after 0.3s windup
    // predict their position at contact time
    const travelT = Math.min(0.8, Math.max(0, (dist - me.radius - en.radius) / 15));
    const lookAhead = 0.30 + travelT;
    let cx = en.x + en.vx * lookAhead * 0.6;
    let cz = en.z + en.vz * lookAhead * 0.6;
    // if they're casting laser they will barely move
    if (enemyCasting) { cx = en.x + en.vx * 0.3; cz = en.z + en.vz * 0.3; }
    const cd = Math.hypot(cx - me.x, cz - me.z);
    const good = cd <= 12.5 && cd >= 3.0 && api.los(cx, cz);
    if (good) {
      api.faceAt(cx, cz);
      // Only commit if we're roughly aimed already (windup turn is 0.85 rate)
      const ang = Math.abs(V.angleTo(me.heading, V.toward(me, { x: cx, z: cz })));
      if (ang < 0.85) {
        api.use('charge');
        api.stop();
        return;
      }
    }
  }

  // ---------------------------------------------------------------
  // 3. JUMP to dodge? Laser ignores height, so jumping is useless
  //    defensively. Use jump only to carry momentum — skip it mostly.
  // ---------------------------------------------------------------

  // ---------------------------------------------------------------
  // 4. MOVEMENT — close the gap, use cover against the laser
  // ---------------------------------------------------------------

  // If the enemy is casting laser at us and we're visible, strafe hard.
  if (enemyCasting && en.visible) {
    const rem = en.casting.remaining;
    // sidestep perpendicular; pick the side that also closes distance / breaks LOS
    const perp = V.perp(toEn);
    let side = api.recall('strafeSide', 1);
    // flip side occasionally
    if (p.t - api.recall('sideT', -9) > 0.9) {
      side = (api.rand() < 0.5) ? 1 : -1;
      api.remember('strafeSide', side);
      api.remember('sideT', p.t);
    }
    // bias inward (toward them) so we still close
    const dir = V.norm({
      x: perp.x * side * 1.0 + toEn.x * 0.65,
      z: perp.z * side * 1.0 + toEn.z * 0.65
    });
    // avoid walls
    const nx = me.x + dir.x * 3, nz = me.z + dir.z * 3;
    if (Math.abs(nx) > 18.5 || Math.abs(nz) > 18.5) {
      api.remember('strafeSide', -side);
      api.move(-perp.x * side + toEn.x * 0.8, -perp.z * side + toEn.z * 0.8);
    } else {
      api.move(dir.x, dir.z);
    }
    api.faceAt(en.x, en.z);
    if (rem < 0.12) api.say("dodge");
    return;
  }

  // Default: hunt. Serpentine while approaching so the laser has to lead.
  if (dist > smashReach - 0.4) {
    const path = api.pathTo(en.x, en.z);
    if (path && !path.direct && path.points && path.points.length) {
      const wp = path.points[0];
      api.moveTo(wp.x, wp.z);
    } else {
      // direct approach with a weave
      const weave = Math.sin(p.t * 3.4) * (en.visible && dist > 6 ? 0.75 : 0.15);
      const perp = V.perp(toEn);
      api.move(toEn.x + perp.x * weave, toEn.z + perp.z * weave);
    }
  } else {
    // in range but smash on cooldown: stay glued, circle slightly
    const perp = V.perp(toEn);
    const s = api.recall('strafeSide', 1);
    api.move(toEn.x * 0.85 + perp.x * s * 0.5, toEn.z * 0.85 + perp.z * s * 0.5);
  }
}
