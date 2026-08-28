function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en.alive) return;

  const dist = en.dist;
  const toEn = V.toward(me, en);
  const enHeadingFromMe = Math.atan2(en.x - me.x, en.z - me.z);

  // --- track enemy laser casts ---
  const ev = p.events || [];
  let enemyStartedLaser = false, enemyStartedBlink = false;
  for (const e of ev) {
    if (e.type === 'enemyStarted') {
      if (e.skill === 'laser') enemyStartedLaser = true;
      if (e.skill === 'blink') enemyStartedBlink = true;
    }
    if (e.type === 'damaged') lastHitT = p.t;
  }
  if (enemyStartedLaser) lastLaserT = p.t;
  if (enemyStartedBlink) lastBlinkT = p.t;

  const enemyCasting = en.casting && en.casting.skill === 'laser' && en.casting.telegraph;

  // --- helpers ---
  const clampArena = (x, z) => ({
    x: Math.max(-19, Math.min(19, x)),
    z: Math.max(-19, Math.min(19, z))
  });

  // strafe direction memory
  if (strafeSign === 0) strafeSign = api.rand() < 0.5 ? 1 : -1;
  if (p.t - lastStrafeFlip > 1.4) {
    lastStrafeFlip = p.t;
    if (api.rand() < 0.35) strafeSign = -strafeSign;
  }

  // ---------- while airborne: just turn toward enemy ----------
  if (me.airborne) {
    api.faceAt(en.x, en.z);
    return;
  }

  // ---------- SMASH: if in range, swing ----------
  const smashReach = me.radius + 2.9; // 4.15
  // predict where enemy will be in 0.28s
  const predX = en.x + en.vx * 0.30;
  const predZ = en.z + en.vz * 0.30;
  const predDist = Math.hypot(predX - me.x, predZ - me.z);

  // ---------- decide ----------
  const canCharge = api.ready('charge');
  const canSmash = api.ready('smash');

  // Dodge a telegraphed laser: if we're in beam and it's about to fire, sidestep or jump
  if (enemyCasting && en.visible) {
    const rem = en.casting.remaining;
    // angle between enemy facing and direction to me
    const dirToMe = { x: me.x - en.x, z: me.z - en.z };
    const off = Math.abs(V.angleTo(en.heading, V.norm(dirToMe)));
    // If they're aimed at us and beam fires soon
    if (rem < 0.30 && off < 0.5 && dist > 3) {
      // strafe hard perpendicular
      const perp = V.perp(toEn);
      api.move(perp.x * strafeSign, perp.z * strafeSign);
      api.faceAt(en.x, en.z);
      if (api.ready('jump') && rem < 0.16 && dist > 6) {
        // jump does not dodge a laser (beam is a line, not ground sweep) - skip
      }
      // Charging into them interrupts the cast
      if (canCharge && dist < 12.5 && dist > 2.5) {
        api.face(toEn.x, toEn.z);
        api.use('charge');
        chargeAimT = p.t;
      }
      return;
    }
  }

  // ---------- SMASH when close ----------
  if (dist < smashReach + 0.9 && canSmash && !me.busy && !en.airborne) {
    api.faceAt(predX, predZ);
    api.use('smash');
    api.move(toEn.x, toEn.z);
    return;
  }

  // ---------- CHARGE: closing tool ----------
  // Use charge when in the good band and line is clear
  if (canCharge && !me.busy && en.visible && dist > 3.0 && dist < 12.0) {
    // lead the target slightly: charge windup 0.28 then dash
    const travelT = 0.28 + (dist - me.radius - en.radius) / 15;
    const lx = en.x + en.vx * travelT * 0.75;
    const lz = en.z + en.vz * travelT * 0.75;
    const c = clampArena(lx, lz);
    // check clear path
    const d = V.norm({ x: c.x - me.x, z: c.z - me.z });
    const r = api.ray(d.x, d.z, Math.min(12, dist + 1));
    if (!r.hit || r.dist > dist - 1.2) {
      api.face(d.x, d.z);
      // only fire charge when already roughly facing (facing at END of windup matters,
      // turn rate 0.85*4 = 3.4 rad/s over 0.28s = 0.95 rad correctable)
      const err = Math.abs(V.angleTo(me.heading, d));
      if (err < 0.9) {
        api.use('charge');
        api.move(d.x, d.z);
        return;
      }
      api.move(d.x, d.z);
      return;
    }
  }

  // ---------- approach ----------
  if (me.busy) {
    // during smash windup keep facing target
    api.faceAt(predX, predZ);
    if (me.casting && me.casting.skill === 'smash') api.move(toEn.x, toEn.z);
    return;
  }

  api.faceAt(en.x, en.z);

  if (dist > 2.2) {
    if (en.visible) {
      // approach with slight zigzag to spoil laser aim at long range
      if (dist > 7) {
        const perp = V.perp(toEn);
        const w = 0.45;
        api.move(toEn.x + perp.x * strafeSign * w, toEn.z + perp.z * strafeSign * w);
      } else {
        api.move(toEn.x, toEn.z);
      }
    } else {
      api.moveTo(en.x, en.z);
    }
  } else {
    // very close: circle a bit while smash recharges
    const perp = V.perp(toEn);
    api.move(perp.x * strafeSign + toEn.x * 0.3, perp.z * strafeSign + toEn.z * 0.3);
  }
}

let strafeSign = 0;
let lastStrafeFlip = 0;
let lastLaserT = -10;
let lastBlinkT = -10;
let lastHitT = -10;
let chargeAimT = -10;
