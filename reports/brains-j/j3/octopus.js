function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en.alive) return;

  const dist = en.dist;
  const toEn = V.toward(me, en);

  // ---- track enemy skill usage times ----
  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      if (e.skill === 'charge') lastEnemyCharge = p.t;
      if (e.skill === 'smash') lastEnemySmash = p.t;
      if (e.skill === 'jump') lastEnemyJump = p.t;
    }
    if (e.type === 'damaged') { lastHurt = p.t; }
    if (e.type === 'enemyCommitted' && e.skill === 'charge') {
      chargeLockT = p.t;
      chargeDir = V.fromHeading(en.heading);
      chargeFrom = { x: en.x, z: en.z };
    }
  }

  const chargeReady = (p.t - lastEnemyCharge) > 4.0;
  const smashReady = (p.t - lastEnemySmash) > 1.3;

  // ---- danger assessment ----
  const enCasting = en.casting;
  let dodging = false;

  // Enemy charge wind-up or dashing: get out of the line
  if (enCasting && enCasting.skill === 'charge') {
    dodging = true;
  }
  const dashing = enCasting && enCasting.skill === 'charge' && enCasting.phase === 'dash';

  // --- emergency: charge committed / dashing -> blink perpendicular ---
  if (dashing || (enCasting && enCasting.skill === 'charge' && enCasting.phase === 'windup' && enCasting.remaining < 0.12)) {
    const dir = V.fromHeading(en.heading);
    // lateral offset of me relative to charge line
    const rel = V.sub(me, en);
    const along = V.dot(rel, dir);
    const lat = rel.x * dir.z - rel.z * dir.x; // cross
    const latAbs = Math.abs(lat);
    if (along > -1 && latAbs < 3.2 && along < 14) {
      const side = lat >= 0 ? 1 : -1;
      // perpendicular escape direction
      const perp = { x: dir.z * side, z: -dir.x * side };
      if (api.ready('blink')) {
        api.use('blink', perp.x, perp.z);
        api.face(toEn.x, toEn.z);
        return;
      }
      api.move(perp.x, perp.z);
      api.face(toEn.x, toEn.z);
      return;
    }
  }

  // --- enemy smash wind-up and we're close: escape or jump ---
  if (enCasting && enCasting.skill === 'smash' && enCasting.telegraph) {
    const timeLeftW = enCasting.remaining;
    const reach = 2.9 + en.radius + me.radius;
    if (dist < reach + 1.6) {
      if (timeLeftW < 0.16 && api.ready('jump') && !me.busy) {
        // hop over the sweep
        const away = V.away(me, en);
        api.move(away.x, away.z);
        api.use('jump');
        api.face(toEn.x, toEn.z);
        return;
      }
      if (api.ready('blink')) {
        const away = V.away(me, en);
        api.use('blink', away.x, away.z);
        api.face(toEn.x, toEn.z);
        return;
      }
      const away = V.away(me, en);
      const side = V.perp(away);
      const dir = { x: away.x * 0.7 + side.x * 0.7, z: away.z * 0.7 + side.z * 0.7 };
      api.move(dir.x, dir.z);
      api.face(toEn.x, toEn.z);
      return;
    }
  }

  // ---- KITE distance management ----
  // We want to stay far: laser range 24. Ideal ~11-16 m so charge (12m) can't
  // reach cleanly and we keep LOS.
  const IDEAL = 14.5;
  const MIN_SAFE = 11.0;

  // ---- Laser logic ----
  const casting = me.casting && me.casting.skill === 'laser';

  if (casting) {
    // keep aiming with lead-ish prediction; beam is instant so aim at target now,
    // but account for our turn during cast.
    const aimT = me.casting.remaining;
    const px = en.x + en.vx * aimT * 0.85;
    const pz = en.z + en.vz * aimT * 0.85;
    api.faceAt(px, pz);
    // strafe while casting to be unpredictable, keep distance
    const away = V.away(me, en);
    const side = V.perp(toEn);
    const s = strafeSign;
    let mv = { x: side.x * s, z: side.z * s };
    if (dist < IDEAL) mv = { x: mv.x * 0.5 + away.x, z: mv.z * 0.5 + away.z };
    const safe = avoidWalls(me, mv, api);
    api.move(safe.x, safe.z);
    return;
  }

  // flip strafe direction occasionally
  if (p.t - lastFlip > 1.1 + api.rand() * 1.2) {
    strafeSign = -strafeSign;
    lastFlip = p.t;
  }

  // Fire laser when: visible, in range, and reasonably safe
  const canFire = api.ready('laser') && en.visible && dist < 22 && !me.airborne && !me.busy;
  if (canFire) {
    // Prefer firing when enemy is far enough that charge can't punish the cast,
    // or when enemy is busy/stunned.
    const enemyBusyHarmless = en.stunned || (en.casting && (en.casting.skill === 'jump'));
    const safeToCast = dist > 12.5 || !chargeReady || enemyBusyHarmless || en.airborne;
    if (safeToCast) {
      const aimT = 0.68;
      const px = en.x + en.vx * aimT * 0.85;
      const pz = en.z + en.vz * aimT * 0.85;
      api.faceAt(px, pz);
      api.use('laser');
      const away = V.away(me, en);
      const side = V.perp(toEn);
      let mv = { x: side.x * strafeSign * 0.6 + away.x * 0.8, z: side.z * strafeSign * 0.6 + away.z * 0.8 };
      const safe = avoidWalls(me, mv, api);
      api.move(safe.x, safe.z);
      return;
    }
  }

  // ---- Positioning ----
  api.faceAt(en.x, en.z);

  let desired;
  if (!en.visible) {
    // Move to regain line of sight but keep range
    const path = api.pathTo(en.x, en.z);
    if (path && path.points && path.points.length) {
      // approach only until we have LOS at good range
      if (dist > IDEAL) {
        const pt = path.points[0];
        desired = V.norm(V.sub(pt, me));
      } else {
        // sidestep to peek
        const side = V.perp(toEn);
        desired = { x: side.x * strafeSign, z: side.z * strafeSign };
      }
    } else {
      desired = toEn;
    }
  } else if (dist < MIN_SAFE) {
    // too close — back off hard, strafe
    const away = V.away(me, en);
    const side = V.perp(toEn);
    desired = { x: away.x + side.x * strafeSign * 0.75, z: away.z + side.z * strafeSign * 0.75 };
    // emergency blink out if very close and enemy could smash
    if (dist < 4.2 && api.ready('blink') && !me.busy) {
      api.use('blink', away.x, away.z);
      return;
    }
  } else if (dist > IDEAL + 3.5) {
    const side = V.perp(toEn);
    desired = { x: toEn.x + side.x * strafeSign * 0.5, z: toEn.z + side.z * strafeSign * 0.5 };
  } else {
    const side = V.perp(toEn);
    desired = { x: side.x * strafeSign, z: side.z * strafeSign };
    // slight drift to hold ideal
    const err = (dist - IDEAL) / 4;
    desired = { x: desired.x + toEn.x * err, z: desired.z + toEn.z * err };
  }

  const safe = avoidWalls(me, desired, api);
  api.move(safe.x, safe.z);
}

let strafeSign = 1;
let lastFlip = 0;
let lastEnemyCharge = -99;
let lastEnemySmash = -99;
let lastEnemyJump = -99;
let lastHurt = -99;
let chargeLockT = -99;
let chargeDir = { x: 0, z: 1 };
let chargeFrom = { x: 0, z: 0 };

function avoidWalls(me, dir, api) {
  let d = V.norm(dir);
  if (d.x === 0 && d.z === 0) return d;
  const probe = 3.0;
  const r = api.ray(d.x, d.z, probe);
  if (r && r.hit && r.dist < 2.2) {
    // try rotated alternatives
    let best = null, bestScore = -1;
    for (const ang of [0.6, -0.6, 1.1, -1.1, 1.7, -1.7, 2.3, -2.3, 3.14]) {
      const c = V.rot(d, ang);
      const rr = api.ray(c.x, c.z, probe);
      const dd = rr && rr.hit ? rr.dist : probe;
      const score = dd - Math.abs(ang) * 0.35;
      if (score > bestScore) { bestScore = score; best = c; }
    }
    if (best) d = best;
  }
  // keep off the outer walls
  const half = 19.0;
  if (me.x > half && d.x > 0) d = { x: -Math.abs(d.z), z: d.z };
  if (me.x < -half && d.x < 0) d = { x: Math.abs(d.z), z: d.z };
  if (me.z > half && d.z > 0) d = { x: d.x, z: -Math.abs(d.x) };
  if (me.z < -half && d.z < 0) d = { x: d.x, z: Math.abs(d.x) };
  return V.norm(d);
}
