function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en.alive) return;

  // ---- event bookkeeping ----
  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      if (e.skill === 'charge') { lastChargeStart = p.t; enemyChargeWindup = true; }
      if (e.skill === 'smash') lastSmashStart = p.t;
      if (e.skill === 'jump') lastJumpStart = p.t;
    }
    if (e.type === 'enemyCommitted' && e.skill === 'charge') {
      chargeCommitted = p.t;
      chargeDir = { x: Math.sin(en.heading), z: Math.cos(en.heading) };
      chargeOrigin = { x: en.x, z: en.z };
      enemyChargeWindup = false;
    }
    if (e.type === 'damaged') lastHurt = p.t;
    if (e.type === 'chargeStopped') { chargeCommitted = -99; }
  }
  if (chargeCommitted > 0 && p.t - chargeCommitted > 0.85) chargeCommitted = -99;
  if (lastChargeStart > 0 && p.t - lastChargeStart > 0.4) enemyChargeWindup = false;

  const dist = en.dist;
  const toEn = V.toward(me, en);
  const awayEn = { x: -toEn.x, z: -toEn.z };

  // ---- charge cooldown estimate ----
  const chargeReadyIn = lastChargeStart < 0 ? 0 : Math.max(0, 4 - (p.t - lastChargeStart));
  const smashReadyIn = lastSmashStart < 0 ? 0 : Math.max(0, 1.3 - (p.t - lastSmashStart));

  // =========================================================
  // THREAT: active charge dash — dodge sideways / blink
  // =========================================================
  const activeCharge = chargeCommitted > 0 && p.t - chargeCommitted < 0.85;
  if (activeCharge && chargeDir) {
    // lateral offset from charge line
    const rel = { x: me.x - en.x, z: me.z - en.z };
    const along = V.dot(rel, chargeDir);
    const lat = rel.x * chargeDir.z - rel.z * chargeDir.x; // signed perpendicular
    if (along > -1 && Math.abs(lat) < 3.0 && along < 14) {
      const side = lat >= 0 ? 1 : -1;
      const perp = { x: chargeDir.z * side, z: -chargeDir.x * side };
      if (api.ready('blink')) {
        api.use('blink', perp.x, perp.z);
        api.face(toEn.x, toEn.z);
        api.remember('act', 'dodge-blink');
        return;
      }
      api.move(perp.x, perp.z);
      api.face(toEn.x, toEn.z);
      api.remember('act', 'dodge-run');
      return;
    }
  }

  // =========================================================
  // THREAT: smash windup at close range — jump over it
  // =========================================================
  if (en.casting && en.casting.skill === 'smash' && en.casting.telegraph) {
    if (dist < 6.2) {
      const rem = en.casting.remaining !== undefined ? en.casting.remaining : 0.15;
      if (rem < 0.2 && api.ready('jump') && !me.airborne && !me.busy) {
        api.move(awayEn.x, awayEn.z);
        api.use('jump');
        api.face(toEn.x, toEn.z);
        api.remember('act', 'hop-smash');
        return;
      }
      if (api.ready('blink') && dist < 5.4) {
        const perp = V.perp(toEn);
        const d = { x: awayEn.x * 0.8 + perp.x * 0.6, z: awayEn.z * 0.8 + perp.z * 0.6 };
        api.use('blink', d.x, d.z);
        api.face(toEn.x, toEn.z);
        api.remember('act', 'blink-smash');
        return;
      }
      api.move(awayEn.x, awayEn.z);
      api.face(toEn.x, toEn.z);
      return;
    }
  }

  // =========================================================
  // Danger zone: too close to gorilla
  // =========================================================
  const DANGER = 7.0;
  const IDEAL_MIN = 11.0;
  const IDEAL_MAX = 17.0;

  // =========================================================
  // LASER: fire when we can, at good range with LOS
  // =========================================================
  const casting = me.casting && me.casting.skill === 'laser';
  if (casting) {
    // keep aiming with lead; enemy speed known
    const aimPt = predictAim(me, en, me.casting.remaining || 0.1);
    api.faceAt(aimPt.x, aimPt.z);
    // strafe while casting to stay safe
    const perp = V.perp(toEn);
    let s = strafeSign;
    if (dist < IDEAL_MIN) api.move(awayEn.x * 0.9 + perp.x * s * 0.4, awayEn.z * 0.9 + perp.z * s * 0.4);
    else api.move(perp.x * s, perp.z * s);
    return;
  }

  // decide whether to start a laser
  const canLaser = api.ready('laser') && !me.busy && !me.airborne && !me.stunned;
  const goodRange = dist > 6.5 && dist < 24.5;
  const safeToCast = dist > 8.0 || (chargeReadyIn > 0.9 && smashReadyIn > 0.55 && dist > 6.5);
  if (canLaser && en.visible && goodRange && safeToCast && !en.airborne) {
    const aimPt = predictAim(me, en, 0.68);
    api.faceAt(aimPt.x, aimPt.z);
    api.use('laser');
    // start strafing
    if (p.t - lastStrafeFlip > 1.2) { strafeSign = -strafeSign; lastStrafeFlip = p.t; }
    api.remember('act', 'laser');
    return;
  }

  // =========================================================
  // MOVEMENT: kiting
  // =========================================================
  if (p.t - lastStrafeFlip > 1.6 + api.rand() * 1.2) { strafeSign = -strafeSign; lastStrafeFlip = p.t; }

  api.face(toEn.x, toEn.z);

  // If enemy is winding a charge, break the line: move perpendicular hard
  if (enemyChargeWindup && dist < 14) {
    const perp = V.perp(toEn);
    const d = pickOpen(api, me, { x: perp.x * strafeSign, z: perp.z * strafeSign }, awayEn);
    api.move(d.x, d.z);
    api.faceAt(en.x, en.z);
    return;
  }

  // too close -> retreat
  if (dist < DANGER + 2.5) {
    if (dist < 5.0 && api.ready('blink')) {
      const perp = V.perp(toEn);
      const d = { x: awayEn.x + perp.x * strafeSign * 0.7, z: awayEn.z + perp.z * strafeSign * 0.7 };
      api.use('blink', d.x, d.z);
      api.faceAt(en.x, en.z);
      return;
    }
    const perp = V.perp(toEn);
    const d = pickOpen(api, me, { x: awayEn.x * 1.0 + perp.x * strafeSign * 0.55, z: awayEn.z * 1.0 + perp.z * strafeSign * 0.55 }, awayEn);
    api.move(d.x, d.z);
    return;
  }

  // Behind in burn race? Octopus 155 vs Gorilla 205 — fraction matters.
  const myFrac = me.hp / me.maxHp, enFrac = en.hp / en.maxHp;

  if (dist > IDEAL_MAX + 3 || !en.visible) {
    // close in / regain sight
    if (!en.visible) {
      const path = api.pathTo(en.x, en.z);
      if (path && path.points && path.points.length) {
        api.moveTo(en.x, en.z);
      } else {
        api.move(toEn.x, toEn.z);
      }
    } else {
      api.move(toEn.x, toEn.z);
    }
    return;
  }

  // ideal band: orbit while waiting for laser
  const perp = V.perp(toEn);
  let radial = 0;
  if (dist < IDEAL_MIN) radial = -1;
  else if (dist > IDEAL_MAX) radial = 0.7;
  const dir = {
    x: perp.x * strafeSign + toEn.x * radial,
    z: perp.z * strafeSign + toEn.z * radial
  };
  const chosen = pickOpen(api, me, dir, { x: perp.x * -strafeSign, z: perp.z * -strafeSign });
  api.move(chosen.x, chosen.z);
}

let strafeSign = 1;
let lastStrafeFlip = 0;
let lastChargeStart = -99;
let lastSmashStart = -99;
let lastJumpStart = -99;
let chargeCommitted = -99;
let chargeDir = null;
let chargeOrigin = null;
let enemyChargeWindup = false;
let lastHurt = -99;

function predictAim(me, en, lead) {
  const t = Math.min(0.8, Math.max(0, lead));
  return { x: en.x + en.vx * t * 0.85, z: en.z + en.vz * t * 0.85 };
}

function pickOpen(api, me, primary, alt) {
  const pn = V.norm(primary);
  if (pn.x === 0 && pn.z === 0) return V.norm(alt);
  const r = api.ray(pn.x, pn.z, 3.2);
  if (!r.hit || r.dist > 2.6) return pn;
  const an = V.norm(alt);
  const r2 = api.ray(an.x, an.z, 3.2);
  if (!r2.hit || r2.dist > 2.6) return an;
  // slide along
  const p1 = V.perp(pn);
  const r3 = api.ray(p1.x, p1.z, 3.2);
  if (!r3.hit || r3.dist > 2.6) return p1;
  return { x: -p1.x, z: -p1.z };
}
