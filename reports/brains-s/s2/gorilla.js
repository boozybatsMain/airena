function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en.alive) return;

  const dist = en.dist;
  const toEn = V.toward(me, en);

  // ---- track enemy laser casts / blinks
  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      api.remember('lastEnemySkill', e.skill);
      api.remember('lastEnemySkillT', p.t);
      if (e.skill === 'blink') api.remember('blinkT', p.t);
      if (e.skill === 'laser') api.remember('laserT', p.t);
    }
    if (e.type === 'damaged' && e.skill === 'laser') api.remember('laserT', p.t);
  }

  const laserT = api.recall('laserT', -99);
  const laserCd = Math.max(0, 2.2 - (p.t - laserT));

  // ---- helpers
  const blocks = p.arena.obstacles;
  const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);

  function pointBlocked(x, z, pad) {
    if (Math.abs(x) > p.arena.half - pad || Math.abs(z) > p.arena.half - pad) return true;
    for (const o of blocks) {
      if (Math.abs(x - o.x) < o.hx + pad && Math.abs(z - o.z) < o.hz + pad) return true;
    }
    return false;
  }

  // ---- state
  const enCast = en.casting;
  const enLasering = enCast && enCast.skill === 'laser' && enCast.telegraph;

  // =========================================================
  // 1. Dodge the laser: if they're casting and we're visible,
  //    sidestep hard perpendicular, or jump is useless (beam hits air),
  //    so use blocks / lateral movement.
  // =========================================================

  const canSmash = api.ready('smash');
  const canCharge = api.ready('charge');
  const canJump = api.ready('jump');

  // Smash reach: 2.9 + my radius + their radius = 5.15 centre-to-centre
  const SMASH_REACH = 5.15;

  // ---- If busy (charging/dashing), just steer facing
  if (me.casting) {
    const c = me.casting;
    if (c.skill === 'charge') {
      if (c.phase === 'windup') {
        // aim at predicted position
        const lead = 0.30;
        let tx = en.x + en.vx * lead, tz = en.z + en.vz * lead;
        // if enemy is casting laser they move slow; aim direct
        api.faceAt(tx, tz);
      } else {
        api.faceAt(en.x, en.z);
      }
      return;
    }
    if (c.skill === 'smash') {
      if (c.phase === 'windup') {
        const lead = Math.min(c.remaining, 0.3);
        api.faceAt(en.x + en.vx * lead, en.z + en.vz * lead);
        // creep toward them while winding up
        api.move(toEn.x, toEn.z);
      }
      return;
    }
    if (c.skill === 'jump') {
      api.faceAt(en.x, en.z);
      return;
    }
  }

  if (me.stunned || me.airborne) {
    api.faceAt(en.x, en.z);
    return;
  }

  // =========================================================
  // Core plan: close distance, land smashes, use charge as a gap-closer
  // and interrupt for their laser cast.
  // =========================================================

  // Face the enemy generally
  let faceTarget = { x: en.x, z: en.z };

  // ---- CHARGE decision
  // Charge is our best tool: 30 dmg + stun + cancels laser.
  // Dash covers up to 12m at 15 m/s. Use when in 4..11.5m and LOS clear along path.
  if (canCharge && en.visible && !en.invulnerable) {
    const good = dist > 3.2 && dist < 11.5;
    // check the straight path is clear enough
    if (good) {
      const dir = toEn;
      const r = api.ray(dir.x, dir.z, dist + 1);
      const clear = !r.hit || r.dist >= dist - (me.radius + en.radius) * 0.5;
      // Prefer charging when they are casting laser (interrupt), or just to close
      const enemyCommitted = enLasering || en.stunned || (enCast && enCast.skill === 'jump');
      if (clear && (enemyCommitted || dist > 5.0 || laserCd < 0.5)) {
        api.use('charge');
        api.faceAt(en.x + en.vx * 0.3, en.z + en.vz * 0.3);
        api.move(dir.x, dir.z);
        return;
      }
    }
  }

  // ---- SMASH decision
  if (canSmash && !en.airborne && !en.invulnerable) {
    // Predict where they'll be in 0.3s
    const px = en.x + en.vx * 0.3, pz = en.z + en.vz * 0.3;
    const pd = Math.hypot(px - me.x, pz - me.z);
    // current distance also matters; be a bit generous
    if (pd < SMASH_REACH - 0.25 || dist < SMASH_REACH - 0.9) {
      // check facing can get there: turn rate 4*0.55 = 2.2 rad/s over 0.3s = 0.66 rad
      const desired = Math.atan2(px - me.x, pz - me.z);
      let da = desired - me.heading;
      while (da > Math.PI) da -= 2 * Math.PI;
      while (da < -Math.PI) da += 2 * Math.PI;
      const halfAngle = Math.asin(Math.min(1, en.radius / Math.max(en.radius, pd))) + 55 * Math.PI / 180;
      if (Math.abs(da) - 0.6 < halfAngle) {
        api.use('smash');
        api.faceAt(px, pz);
        api.move(toEn.x, toEn.z);
        return;
      }
    }
  }

  // =========================================================
  // MOVEMENT
  // =========================================================

  // If enemy is casting laser at us and we can't punish yet: break LOS / strafe
  if (enLasering && en.visible && dist > 5.5) {
    // sidestep perpendicular, prefer direction that increases angle off their facing
    const perp = V.perp(toEn);
    const side = api.recall('strafeSide', 1);
    // pick side that stays in-arena and off blocks
    const step = 3.0;
    let s = side;
    const cand1 = { x: me.x + perp.x * step * s, z: me.z + perp.z * step * s };
    if (pointBlocked(cand1.x, cand1.z, 1.4)) s = -s;
    api.remember('strafeSide', s);
    // move mostly sideways with a bit of forward pressure
    const mv = V.norm({ x: perp.x * s * 1.0 + toEn.x * 0.55, z: perp.z * s * 1.0 + toEn.z * 0.55 });
    api.move(mv.x, mv.z);
    api.faceAt(en.x, en.z);
    return;
  }

  // Approach
  if (dist > 6.0) {
    // Zig-zag approach to make lasering harder, but path around blocks
    const path = api.pathTo(en.x, en.z);
    if (path && !path.direct && path.points && path.points.length) {
      const wp = path.points[0];
      api.moveTo(wp.x, wp.z);
    } else {
      // direct with weave
      const perp = V.perp(toEn);
      const phase = Math.sin(p.t * 2.6);
      const w = en.visible ? 0.55 : 0.0;
      const mv = V.norm({ x: toEn.x + perp.x * phase * w, z: toEn.z + perp.z * phase * w });
      api.move(mv.x, mv.z);
    }
    api.faceAt(en.x, en.z);
    return;
  }

  // Close range: stay glued, orbit slightly to stay in cone
  {
    const perp = V.perp(toEn);
    let s = api.recall('strafeSide', 1);
    if (api.rand() < 0.012) { s = -s; api.remember('strafeSide', s); }
    let bias = 0.35;
    let mv;
    if (dist > 3.4) {
      mv = V.norm({ x: toEn.x + perp.x * s * bias, z: toEn.z + perp.z * s * bias });
    } else if (dist < 2.6) {
      // slight back-off to keep smash range without body-blocking weirdness
      mv = V.norm({ x: toEn.x * 0.3 + perp.x * s, z: toEn.z * 0.3 + perp.z * s });
    } else {
      mv = V.norm({ x: toEn.x * 0.6 + perp.x * s * 0.8, z: toEn.z * 0.6 + perp.z * s * 0.8 });
    }
    if (pointBlocked(me.x + mv.x * 2.0, me.z + mv.z * 2.0, 1.3)) {
      mv = toEn;
    }
    api.move(mv.x, mv.z);
    api.faceAt(en.x + en.vx * 0.15, en.z + en.vz * 0.15);
  }
}
