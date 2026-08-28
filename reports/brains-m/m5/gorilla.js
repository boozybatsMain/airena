function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en.alive) return;

  // ---- memory / state ----
  let lastLaser = api.recall('lastLaser', -99);
  let laserSeen = api.recall('laserSeen', 0);
  for (const e of p.events) {
    if (e.type === 'enemyStarted' && e.skill === 'laser') {
      api.remember('lastLaser', p.t);
      lastLaser = p.t;
      api.remember('laserSeen', laserSeen + 1);
    }
    if (e.type === 'enemyStarted' && e.skill === 'blink') api.remember('lastBlink', p.t);
  }

  const dist = en.dist;
  const toEn = V.toward(me, en);
  const surfDist = dist - me.radius - en.radius;

  // ---- helpers ----
  const enCasting = en.casting;
  const enLaserCast = enCasting && enCasting.skill === 'laser' && enCasting.telegraph;

  // predicted enemy position a bit ahead
  const lead = { x: en.x + en.vx * 0.28, z: en.z + en.vz * 0.28 };

  // ---- if busy, only manage facing ----
  if (me.casting) {
    const c = me.casting;
    if (c.skill === 'smash') {
      api.faceAt(lead.x, lead.z);
      // creep forward slightly during windup to close
      if (c.phase === 'windup') api.move(toEn.x, toEn.z);
      return;
    }
    if (c.skill === 'charge') {
      if (c.phase === 'windup') {
        // aim at where they will be at impact
        const eta = 0.3 + Math.max(0, (dist - 2) / 15);
        const tgt = { x: en.x + en.vx * eta * 0.8, z: en.z + en.vz * eta * 0.8 };
        api.faceAt(tgt.x, tgt.z);
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

  // ---- default facing ----
  api.faceAt(lead.x, lead.z);

  // ================= COMBAT DECISIONS =================

  // SMASH: in range and likely to land
  const smashMaxCenter = me.radius + 2.9 + en.radius; // 5.15
  if (api.ready('smash') && !en.invulnerable) {
    // predict distance at landing (0.3s)
    const fut = { x: en.x + en.vx * 0.3, z: en.z + en.vz * 0.3 };
    const myFut = { x: me.x + me.vx * 0.3, z: me.z + me.vz * 0.3 };
    const fd = V.dist(myFut, fut);
    const ang = Math.abs(V.angleTo(me.heading, V.toward(me, fut)));
    // will enemy be airborne at landing? if they just jumped, skip
    const enJump = en.casting && en.casting.skill === 'jump';
    if (fd < smashMaxCenter - 0.2 && ang < 1.4 && !enJump && !en.airborne) {
      api.use('smash');
      api.move(toEn.x, toEn.z);
      return;
    }
  }

  // CHARGE: mid range, line of sight, big commitment
  if (api.ready('charge') && !me.busy) {
    const good = dist > 4.0 && dist < 12.5 && en.visible && !en.invulnerable;
    // best when they are casting laser (interrupt) or just far
    if (good) {
      const clear = api.ray(toEn.x, toEn.z, Math.min(13, dist + 1));
      if (!clear.hit || clear.dist > dist - 1.2) {
        api.use('charge');
        const eta = 0.3 + Math.max(0, (dist - 2) / 15);
        const tgt = { x: en.x + en.vx * eta * 0.8, z: en.z + en.vz * eta * 0.8 };
        api.faceAt(tgt.x, tgt.z);
        return;
      }
    }
  }

  // JUMP to dodge? Laser ignores height, so jumping is useless vs laser.
  // Use jump only to close a gap fast while a laser is charging?  No — freeze velocity is fine.
  // Better: never jump defensively; jump only to leap over nothing. Skip mostly.

  // ================= MOVEMENT =================

  // Strafe component to make laser aiming hard
  let strafeSign = api.recall('strafe', 1);
  if (p.tick % 40 === 0 && api.rand() < 0.4) {
    strafeSign = -strafeSign;
    api.remember('strafe', strafeSign);
  }
  const perp = V.perp(toEn);

  if (enLaserCast) {
    // Beam fires along their facing at fire time. Dodge laterally hard, or break LOS.
    const rem = enCasting.remaining;
    // lateral relative to THEIR facing
    const theirDir = V.fromHeading(en.heading);
    const lat = V.perp(theirDir);
    // choose side away from beam line
    const rel = V.sub(me, en);
    const side = V.dot(rel, lat) >= 0 ? 1 : -1;
    let mv = { x: lat.x * side, z: lat.z * side };
    // also close distance if reasonably near
    if (dist < 9) {
      mv = V.norm(V.add(V.scale(mv, 1.0), V.scale(toEn, 1.1)));
    } else {
      mv = V.norm(V.add(V.scale(mv, 1.2), V.scale(toEn, 0.7)));
    }
    api.move(mv.x, mv.z);
    if (rem < 0.12 && api.ready('jump') && false) api.use('jump');
    return;
  }

  // Main plan: close aggressively, with a weaving strafe.
  if (dist > smashMaxCenter - 0.6) {
    let mv;
    const path = api.pathTo(en.x, en.z);
    if (path && !path.direct && path.points && path.points.length) {
      const wp = path.points[0];
      mv = V.toward(me, wp);
      api.move(mv.x, mv.z);
      return;
    }
    const weave = 0.45 * Math.sin(p.t * 3.1) * strafeSign;
    mv = V.norm({ x: toEn.x + perp.x * weave, z: toEn.z + perp.z * weave });
    api.move(mv.x, mv.z);
    return;
  }

  // In smash range but smash on cooldown: orbit close, stay adjacent, keep pressure
  const cd = api.cooldown('smash');
  if (cd > 0.35 && dist < 3.4) {
    // circle-strafe to stay hard to aim at, remain inside cone range
    const mv = V.norm({ x: perp.x * strafeSign + toEn.x * 0.35, z: perp.z * strafeSign + toEn.z * 0.35 });
    api.move(mv.x, mv.z);
  } else {
    api.move(toEn.x, toEn.z);
  }
}
