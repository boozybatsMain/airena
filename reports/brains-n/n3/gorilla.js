function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive) return;

  const now = p.t;

  // ---- memory of enemy laser timing ----
  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      if (e.skill === 'laser') api.remember('lastLaser', now);
      if (e.skill === 'blink') api.remember('lastBlink', now);
      if (e.skill === 'jump') api.remember('lastEJump', now);
    }
    if (e.type === 'damaged' && e.skill === 'laser') api.remember('lastLaserHit', now);
  }

  const dist = en.dist;
  const toEnemy = V.toward(me, en);
  const enCasting = en.casting;
  const enLasering = enCasting && enCasting.skill === 'laser' && enCasting.telegraph;

  // ---------- helpers ----------
  const blocks = p.arena.obstacles;

  function clampArena(x, z) {
    const h = p.arena.half - 1.6;
    return { x: Math.max(-h, Math.min(h, x)), z: Math.max(-h, Math.min(h, z)) };
  }

  // strafe direction memory
  let strafe = api.recall('strafe', 1);
  if (p.tick % 40 === 0 && api.rand() < 0.35) { strafe = -strafe; api.remember('strafe', strafe); }
  for (const e of p.events) {
    if (e.type === 'blocked') { strafe = -strafe; api.remember('strafe', strafe); }
  }

  // ---------- combat decisions ----------
  const smashReach = 2.9 + me.radius + en.radius; // 5.15
  const busy = me.busy;

  // If busy with an uninterruptible thing, still allow facing updates.
  const cast = me.casting;

  // Always face enemy roughly (lead slightly for smash)
  const aimPt = { x: en.x + en.vx * 0.28, z: en.z + en.vz * 0.28 };

  // ============ SMASH ============
  if (!busy && api.ready('smash')) {
    // predicted distance at land time (0.3s)
    const px = en.x + en.vx * 0.3, pz = en.z + en.vz * 0.3;
    const mx = me.x + me.vx * 0.3 * 0.3, mz = me.z + me.vz * 0.3 * 0.3;
    const pd = Math.hypot(px - mx, pz - mz);
    if (!en.airborne && (dist < smashReach - 0.4 || pd < smashReach - 0.5)) {
      api.faceAt(px, pz);
      api.use('smash');
      return;
    }
  }

  // ============ CHARGE ============
  if (!busy && api.ready('charge')) {
    // charge lands after 0.3s windup then dash at 15m/s
    const goodDist = dist > 4.0 && dist < 13.5;
    if (goodDist && en.visible && !en.airborne) {
      // predict where they'll be at contact
      const travelT = Math.max(0, (dist - me.radius - en.radius) / 15);
      const lead = 0.3 + travelT;
      let px = en.x + en.vx * lead * 0.7, pz = en.z + en.vz * lead * 0.7;
      const c = clampArena(px, pz);
      px = c.x; pz = c.z;
      // require line of sight to the predicted point
      if (api.los(px, pz)) {
        api.remember('chargeAim', { x: px, z: pz });
        api.faceAt(px, pz);
        api.use('charge');
        return;
      }
    }
  }

  // during charge windup, keep aiming
  if (cast && cast.skill === 'charge' && cast.phase === 'windup') {
    const travelT = Math.max(0, (dist - me.radius - en.radius) / 15);
    let px = en.x + en.vx * (cast.remaining + travelT) * 0.8;
    let pz = en.z + en.vz * (cast.remaining + travelT) * 0.8;
    const c = clampArena(px, pz);
    api.faceAt(c.x, c.z);
    api.move(V.fromHeading(me.heading).x, V.fromHeading(me.heading).z);
    return;
  }

  // during smash windup, keep aiming at them
  if (cast && cast.skill === 'smash' && cast.phase === 'windup') {
    api.faceAt(en.x + en.vx * cast.remaining, en.z + en.vz * cast.remaining);
    if (dist > 2.2) api.move(toEnemy.x, toEnemy.z);
    else api.move(0, 0);
    return;
  }

  // ============ JUMP dodge (laser passes through air anyway — jump doesn't help vs laser) ============
  // Jump is only useful to close gaps quickly? No: velocity frozen. Use to cross open ground while laser aims? No benefit.
  // Use jump to avoid nothing. Keep it for a burst of committed movement toward enemy is same speed. Skip mostly.

  // ============ MOVEMENT ============
  api.faceAt(aimPt.x, aimPt.z);

  // Dodging the laser: while they cast, move perpendicular hard, or break LOS.
  if (enLasering) {
    // beam fires at cast.remaining
    const rem = enCasting.remaining;
    // perpendicular escape relative to enemy facing
    const perp = V.perp(V.fromHeading(en.heading));
    // choose side matching current lateral velocity / strafe
    let s = strafe;
    // If close, better to charge in — handled above. Here just juke.
    let dir = { x: perp.x * s, z: perp.z * s };
    // Blend a bit toward enemy so we keep closing
    const blend = dist > 8 ? 0.55 : 0.25;
    dir = V.norm({ x: dir.x + toEnemy.x * blend, z: dir.z + toEnemy.z * blend });
    const tgt = clampArena(me.x + dir.x * 6, me.z + dir.z * 6);
    api.move(tgt.x - me.x, tgt.z - me.z);
    api.faceAt(en.x, en.z);
    return;
  }

  // approach
  if (dist > 6.5) {
    // seek cover-ish approach: go straight if visible, else path
    const path = api.pathTo(en.x, en.z);
    if (path && !path.direct && path.points && path.points.length) {
      const wp = path.points[0];
      api.moveTo(wp.x, wp.z);
    } else {
      // serpentine approach to make lasers harder
      const perp = V.perp(toEnemy);
      const wobble = Math.sin(now * 3.1) * 0.5 * strafe;
      const dir = V.norm({ x: toEnemy.x + perp.x * wobble, z: toEnemy.z + perp.z * wobble });
      const tgt = clampArena(me.x + dir.x * 5, me.z + dir.z * 5);
      api.move(tgt.x - me.x, tgt.z - me.z);
    }
    return;
  }

  // close range: orbit inward to stay in smash range
  {
    const perp = V.perp(toEnemy);
    let radial;
    if (dist > 3.6) radial = 1.0;
    else if (dist < 2.2) radial = -0.5;
    else radial = 0.2;
    const dir = V.norm({
      x: toEnemy.x * radial + perp.x * strafe * 0.9,
      z: toEnemy.z * radial + perp.z * strafe * 0.9
    });
    const tgt = clampArena(me.x + dir.x * 4, me.z + dir.z * 4);
    api.move(tgt.x - me.x, tgt.z - me.z);
  }
}
