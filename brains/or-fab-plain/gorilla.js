function think(p, api) {
  const S = p.self, E = p.enemy;

  for (const ev of p.events) {
    if (ev.type === 'enemyStarted') {
      if (ev.skill === 'laser') api.remember('side', api.rand() < 0.5 ? 1 : -1);
    }
    if (ev.type === 'blocked') api.remember('side', -api.recall('side', 1));
  }

  const dist = E.dist;
  const toE = V.toward(S, E);
  const clampPt = (x, z) => ({
    x: Math.max(-18.5, Math.min(18.5, x)),
    z: Math.max(-18.5, Math.min(18.5, z))
  });

  // ----- mid-skill steering -----
  if (S.casting) {
    const c = S.casting;
    if (c.skill === 'smash' && c.phase === 'windup') {
      const px = E.x + E.vx * c.remaining, pz = E.z + E.vz * c.remaining;
      api.faceAt(px, pz);
      api.moveTo(px, pz);
    } else if (c.skill === 'charge' && c.phase === 'windup') {
      const tt = c.remaining + Math.max(0, dist - 2.25) / 15;
      const q = clampPt(E.x + E.vx * tt, E.z + E.vz * tt);
      api.faceAt(q.x, q.z);
      api.move(q.x - S.x, q.z - S.z);
    }
    return;
  }

  if (!E.alive) { api.stop(); return; }

  const eCast = E.casting;
  const laserCasting = !!(eCast && eCast.skill === 'laser' && eCast.telegraph);
  const laserThreat = laserCasting && E.visible;
  const enemyJumping = !!(eCast && eCast.skill === 'jump' &&
    (eCast.phase === 'windup' || eCast.phase === 'air'));

  // ----- enemy in the air: meet them where they land -----
  if (E.airborne) {
    const rem = eCast && eCast.phase === 'air' ? eCast.remaining : 0.3;
    const q = clampPt(E.x + E.vx * rem, E.z + E.vz * rem);
    api.moveTo(q.x, q.z);
    api.faceAt(q.x, q.z);
    const pd = Math.hypot(q.x - S.x, q.z - S.z);
    if (api.ready('smash') && rem < 0.26 && pd < 4.6) api.use('smash');
    return;
  }

  const smashReady = api.ready('smash');
  const chargeReady = api.ready('charge');

  // ----- smash to interrupt a point-blank laser -----
  if (laserThreat && smashReady && dist < 5.3 && !E.invulnerable) {
    api.use('smash');
    api.faceAt(E.x, E.z);
    api.moveTo(E.x, E.z);
    return;
  }

  // ----- regular smash on a landing-time prediction -----
  const sx = E.x + E.vx * 0.3, sz = E.z + E.vz * 0.3;
  const sd = Math.hypot(sx - S.x, sz - S.z);
  const sang = Math.abs(V.angleTo(S.heading, { x: sx - S.x, z: sz - S.z }));
  if (smashReady && !E.invulnerable && !enemyJumping && E.visible &&
      sd < 4.9 && sang < 1.5) {
    api.use('smash');
    api.faceAt(sx, sz);
    api.moveTo(sx, sz);
    return;
  }

  // ----- charge: interrupt a laser, punish a stun, or close the gap -----
  if (chargeReady && E.visible && !E.invulnerable) {
    const tt = 0.3 + Math.max(0, dist - 2.25) / 15;
    const q = clampPt(E.x + E.vx * tt, E.z + E.vz * tt);
    const qd = Math.hypot(q.x - S.x, q.z - S.z);
    const want = laserCasting
      ? dist < 13
      : (E.stunned
          ? dist < 11
          : (dist > 4.2 && dist < 10.5 && api.cooldown('smash') > 0.35));
    if (want && qd < 11.5 && api.los(q.x, q.z)) {
      api.use('charge');
      api.faceAt(q.x, q.z);
      api.move(q.x - S.x, q.z - S.z);
      return;
    }
  }

  // ----- beam incoming and no answer ready: strafe hard, keep closing -----
  if (laserThreat) {
    const side = api.recall('side', 1);
    const perp = V.perp(toE);
    const fwd = dist > 7 ? 0.7 : 0.15;
    const m = V.norm(V.add(V.scale(toE, fwd), V.scale(perp, side)));
    api.move(m.x, m.z);
    api.faceAt(E.x, E.z);
    return;
  }

  // ----- default: relentless pursuit -----
  api.moveTo(E.x, E.z);
  api.faceAt(E.x, E.z);
}