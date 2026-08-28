function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en.alive) return;

  // ---- memory / state ----
  let lastLaser = api.recall('lastLaser', -99);
  let lastBlink = api.recall('lastBlink', -99);
  let laserCastStart = api.recall('laserCastStart', -99);

  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      if (e.skill === 'laser') { api.remember('lastLaser', p.t); api.remember('laserCastStart', p.t); lastLaser = p.t; laserCastStart = p.t; }
      if (e.skill === 'blink') { api.remember('lastBlink', p.t); lastBlink = p.t; }
    }
  }

  const dist = en.dist;
  const toEn = V.toward(me, en);
  const surfaceGap = dist - me.radius - en.radius;

  // ---- helpers ----
  const clampArena = (v) => Math.max(-19, Math.min(19, v));

  function blockedBetween(ax, az, bx, bz) {
    // approximate: sample
    const steps = 8;
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      for (const o of p.arena.obstacles) {
        if (Math.abs(x - o.x) < o.hx + 0.2 && Math.abs(z - o.z) < o.hz + 0.2) return true;
      }
    }
    return false;
  }

  // ---- situational flags ----
  const enemyCasting = en.casting && en.casting.skill === 'laser' && en.casting.telegraph;
  const smashReady = api.ready('smash');
  const chargeReady = api.ready('charge');
  const jumpReady = api.ready('jump');

  // If we are mid-skill and cannot act, still allow facing/movement adjustments
  const canAct = !me.busy && !me.stunned && !me.airborne;

  // ---- always face the enemy while attacking ----
  // Predict enemy position slightly ahead for smash aim
  const predT = 0.30;
  const px = en.x + en.vx * predT, pz = en.z + en.vz * predT;

  // ---- SMASH: when in cone range ----
  const smashMaxCenter = me.radius + 2.9 + en.radius; // 5.15
  if (canAct && smashReady && dist < smashMaxCenter - 0.15 && !en.airborne && !en.invulnerable) {
    api.faceAt(px, pz);
    api.use('smash');
    // keep closing
    api.move(toEn.x, toEn.z);
    return;
  }

  // ---- CHARGE: mid range gap closer / interrupter ----
  const chargeMax = 12 + me.radius + en.radius;
  if (canAct && chargeReady && en.visible && dist > 3.4 && dist < 11.5 && !en.airborne) {
    // lead a bit: charge dash reaches after 0.3s windup + travel
    const travelT = 0.3 + Math.max(0, (dist - me.radius - en.radius)) / 15;
    let tx = en.x + en.vx * travelT * 0.6;
    let tz = en.z + en.vz * travelT * 0.6;
    if (!blockedBetween(me.x, me.z, tx, tz)) {
      api.faceAt(tx, tz);
      api.use('charge');
      api.move(toEn.x, toEn.z);
      return;
    }
  }

  // ---- Dodge the laser: if they are casting and we're in their line ----
  if (enemyCasting && en.visible && dist > 3) {
    const rem = en.casting.remaining;
    // strafe perpendicular hard
    const perp = V.perp(toEn);
    // pick side away from arena wall
    let side = api.recall('strafeSide', 1);
    const cand = { x: me.x + perp.x * side * 4, z: me.z + perp.z * side * 4 };
    if (Math.abs(cand.x) > 18.5 || Math.abs(cand.z) > 18.5) { side = -side; api.remember('strafeSide', side); }
    // If jump can carry us... jump doesn't dodge laser (height not consulted). Use lateral movement.
    if (canAct && chargeReady && dist < 11.5) {
      api.faceAt(en.x + en.vx * 0.4, en.z + en.vz * 0.4);
      api.use('charge');
      api.move(toEn.x, toEn.z);
      return;
    }
    // break LOS if a block is near, otherwise strafe + close
    const mv = V.norm({ x: perp.x * side * 1.4 + toEn.x, z: perp.z * side * 1.4 + toEn.z });
    api.move(mv.x, mv.z);
    api.faceAt(en.x, en.z);
    return;
  }

  // ---- Default: close the distance aggressively ----
  api.faceAt(px, pz);

  if (!en.visible) {
    const path = api.pathTo(en.x, en.z);
    if (path && path.points && path.points.length) {
      const wp = path.points[0];
      api.move(wp.x - me.x, wp.z - me.z);
    } else {
      api.moveTo(clampArena(en.x), clampArena(en.z));
    }
    return;
  }

  // Approach with slight zigzag to make laser aim harder at long range
  if (dist > 7) {
    const perp = V.perp(toEn);
    const wig = Math.sin(p.t * 3.4) * 0.75;
    const mv = V.norm({ x: toEn.x + perp.x * wig, z: toEn.z + perp.z * wig });
    api.move(mv.x, mv.z);
  } else {
    api.move(toEn.x, toEn.z);
  }
}
