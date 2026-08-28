function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive) return;

  const dist = en.dist;
  const toEn = { x: en.x - me.x, z: en.z - me.z };
  const enDir = V.norm(toEn);

  // ---------- danger detection ----------
  let chargeWindup = false, chargeCommitted = false, smashWindup = false;
  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      if (e.skill === 'charge') api.remember('chgT', p.t);
      if (e.skill === 'smash') api.remember('smashT', p.t);
    }
    if (e.type === 'enemyCommitted') api.remember('commitT', p.t);
  }
  const enC = en.casting;
  if (enC) {
    if (enC.skill === 'charge') {
      if (enC.phase === 'windup') chargeWindup = true;
      else chargeCommitted = true;
    }
    if (enC.skill === 'smash' && enC.telegraph) smashWindup = true;
  }

  // enemy facing direction
  const enFace = V.fromHeading(en.heading);
  // am I in the charge lane?
  const rel = { x: me.x - en.x, z: me.z - en.z };
  const along = V.dot(rel, enFace);
  const lateral = Math.abs(rel.x * enFace.z - rel.z * enFace.x);
  const inLane = along > -1 && along < 14 && lateral < 3.0;

  // ---------- helpers ----------
  const clampArena = (pt) => ({
    x: Math.max(-18.5, Math.min(18.5, pt.x)),
    z: Math.max(-18.5, Math.min(18.5, pt.z))
  });

  const sideSign = api.recall('side', 1);

  // ---------- emergency: charge incoming ----------
  const dodgeNow = (chargeCommitted && inLane) || (chargeWindup && inLane && dist < 14);
  if (dodgeNow && !me.busy) {
    // perpendicular escape
    const perp = { x: enFace.z, z: -enFace.x };
    const s = (rel.x * perp.x + rel.z * perp.z) >= 0 ? 1 : -1;
    const esc = { x: perp.x * s, z: perp.z * s };
    if (api.ready('blink') && chargeCommitted) {
      api.use('blink', esc.x, esc.z);
      api.face(enDir.x, enDir.z);
      return;
    }
    if (chargeCommitted && api.ready('jump') && dist < 6) {
      // jumping doesn't dodge charge; prefer move
    }
    api.move(esc.x, esc.z);
    api.face(enDir.x, enDir.z);
    return;
  }

  // ---------- smash avoidance ----------
  if (smashWindup && dist < 4.6 && !me.busy) {
    if (api.ready('blink')) {
      const away = V.away(me, en);
      api.use('blink', away.x, away.z);
      api.face(enDir.x, enDir.z);
      return;
    }
    if (api.ready('jump')) {
      api.use('jump');
      const away = V.away(me, en);
      api.move(away.x, away.z);
      return;
    }
    const away = V.away(me, en);
    api.move(away.x, away.z);
    api.face(enDir.x, enDir.z);
    return;
  }

  // ---------- laser ----------
  const casting = me.casting && me.casting.skill === 'laser';
  if (casting) {
    // keep aiming at lead position
    const lead = V.lead(me, en, { x: en.vx, z: en.vz }, 0);
    // aim slightly ahead of enemy motion during remaining cast
    const rem = me.casting.remaining || 0.1;
    const aim = { x: en.x + en.vx * rem * 0.55, z: en.z + en.vz * rem * 0.55 };
    api.faceAt(aim.x, aim.z);
    // strafe while casting
    const perp = V.perp(enDir);
    api.move(perp.x * sideSign * 0.6, perp.z * sideSign * 0.6);
    return;
  }

  const goodRange = dist > 5.0 && dist < 21;
  const facingErr = Math.abs(V.angleTo(me.heading, enDir));

  if (!me.busy && api.ready('laser') && en.visible && goodRange && facingErr < 0.9 &&
      !chargeWindup && !(en.casting && en.casting.skill === 'charge')) {
    // don't cast if enemy is close enough to reach us mid-cast with charge ready
    const chargeThreat = api.cooldown ? 0 : 0;
    const enCd = en.cooldowns || {};
    const chReady = (enCd.charge !== undefined ? enCd.charge : 0) <= 0.7;
    if (!(chReady && dist < 13)) {
      api.use('laser');
      const rem2 = 0.55;
      api.faceAt(en.x + en.vx * rem2 * 0.6, en.z + en.vz * rem2 * 0.6);
      return;
    }
  }

  // ---------- positioning ----------
  api.face(enDir.x, enDir.z);

  // flip strafe side occasionally or when blocked
  let side = sideSign;
  let flip = false;
  for (const e of p.events) if (e.type === 'blocked') flip = true;
  if (flip || api.rand() < 0.012) {
    side = -sideSign;
    api.remember('side', side);
  }

  const idealMin = 9, idealMax = 15;
  let desired;

  if (dist < idealMin) {
    // back off while circling
    const away = V.away(me, en);
    const perp = V.perp(enDir);
    desired = V.norm({
      x: away.x * 1.0 + perp.x * side * 0.8,
      z: away.z * 1.0 + perp.z * side * 0.8
    });
  } else if (dist > idealMax) {
    const perp = V.perp(enDir);
    desired = V.norm({
      x: enDir.x * 0.9 + perp.x * side * 0.5,
      z: enDir.z * 0.9 + perp.z * side * 0.5
    });
  } else {
    const perp = V.perp(enDir);
    desired = { x: perp.x * side, z: perp.z * side };
  }

  // wall avoidance: steer away from arena edges
  const margin = 4.0;
  let wx = 0, wz = 0;
  if (me.x > 20 - margin) wx -= (me.x - (20 - margin)) / margin;
  if (me.x < -20 + margin) wx += ((-20 + margin) - me.x) / margin;
  if (me.z > 20 - margin) wz -= (me.z - (20 - margin)) / margin;
  if (me.z < -20 + margin) wz += ((-20 + margin) - me.z) / margin;
  desired = V.norm({ x: desired.x + wx * 1.6, z: desired.z + wz * 1.6 });

  // obstacle avoidance: if the direction runs into a block soon, deflect
  const probe = api.ray(desired.x, desired.z, 3.0);
  if (probe && probe.hit && probe.dist < 2.2) {
    const alt1 = V.rot(desired, 1.0);
    const alt2 = V.rot(desired, -1.0);
    const r1 = api.ray(alt1.x, alt1.z, 3.0);
    const r2 = api.ray(alt2.x, alt2.z, 3.0);
    const d1 = r1 ? r1.dist : 3, d2 = r2 ? r2.dist : 3;
    desired = d1 >= d2 ? alt1 : alt2;
    api.remember('side', -side);
  }

  api.move(desired.x, desired.z);

  // opportunistic blink to regain line of sight or escape corner
  if (!me.busy && api.ready('blink') && dist < 4.0 && !en.casting) {
    const away = V.away(me, en);
    const tgt = clampArena({ x: me.x + away.x * 7, z: me.z + away.z * 7 });
    api.use('blink', tgt.x - me.x, tgt.z - me.z);
  }
}
