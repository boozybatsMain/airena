function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en.alive) return;

  const dist = en.dist;
  const toEn = { x: en.x - me.x, z: en.z - me.z };
  const dirEn = V.norm(toEn);

  // ---- track enemy laser casts / blinks
  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      api.remember('lastEnemySkill', e.skill);
      api.remember('lastEnemySkillT', p.t);
    }
    if (e.type === 'damaged' && e.skill === 'laser') api.remember('lastLaserHit', p.t);
  }

  const enemyCasting = en.casting && en.casting.skill === 'laser' && en.casting.telegraph;

  // ---------- facing: almost always at the enemy
  let faceSet = false;
  const faceEnemy = () => { if (!faceSet) { api.faceAt(en.x, en.z); faceSet = true; } };

  // ---------- if busy with something uninterruptible, just steer facing
  if (me.airborne) {
    faceEnemy();
    return;
  }

  // ---------- smash range check
  const smashReach = 2.9 + me.radius + en.radius; // 5.15 centre-to-centre
  const angErr = Math.abs(V.angleTo(me.heading, dirEn));

  // Predict where enemy will be in 0.3s (windup) for smash decision
  const pred = { x: en.x + en.vx * 0.3, z: en.z + en.vz * 0.3 };
  const predDist = V.dist({ x: me.x + me.vx * 0.3, z: me.z + me.vz * 0.3 }, pred);

  // ---------- SMASH
  if (!me.busy && api.ready('smash') && predDist < smashReach - 0.25 && dist < smashReach + 0.6) {
    // angle at land time approximated
    const predDir = V.norm({ x: pred.x - me.x, z: pred.z - me.z });
    const predAng = Math.abs(V.angleTo(me.heading, predDir));
    const allow = 0.95 + Math.asin(Math.min(0.99, en.radius / Math.max(1.2, predDist)));
    if (predAng < allow && !en.airborne) {
      api.use('smash');
      api.faceAt(pred.x, pred.z);
      faceSet = true;
      api.move(dirEn.x, dirEn.z);
      return;
    }
  }

  // ---------- CHARGE
  // Use charge to close distance and to interrupt lasers.
  const chargeMax = 12 + me.radius + en.radius;
  if (!me.busy && api.ready('charge') && dist > 4.0 && dist < chargeMax - 0.5 && en.visible) {
    // Aim where they'll be at the end of windup + travel time
    const travel = Math.max(0, (dist - me.radius - en.radius)) / 15;
    const lead = 0.3 + travel;
    let tx = en.x + en.vx * lead * 0.8;
    let tz = en.z + en.vz * lead * 0.8;
    // If enemy is casting laser, charge straight now (they're slow)
    if (enemyCasting) { tx = en.x + en.vx * lead * 0.5; tz = en.z + en.vz * lead * 0.5; }
    if (api.los(tx, tz)) {
      api.remember('chargeAt', p.t);
      api.use('charge');
      api.faceAt(tx, tz);
      faceSet = true;
      api.move(dirEn.x, dirEn.z);
      return;
    }
  }

  // If currently winding up charge, keep facing the lead point
  if (me.casting && me.casting.skill === 'charge' && me.casting.phase === 'windup') {
    const travel = Math.max(0, (dist - me.radius - en.radius)) / 15;
    const lead = me.casting.remaining + travel;
    api.faceAt(en.x + en.vx * lead * 0.8, en.z + en.vz * lead * 0.8);
    return;
  }

  // ---------- JUMP to dodge? Laser ignores height, so jump is only useful for gaps.
  // Skip jump mostly; use it to cross when about to be beamed is useless.

  // ---------- MOVEMENT
  faceEnemy();

  // Dodge laser: strafe perpendicular hard while they cast
  if (enemyCasting && dist > 3) {
    // move perpendicular to their facing, preferring toward cover / toward them
    const perp = V.perp(dirEn);
    const s = (V.dot(perp, { x: me.vx, z: me.vz }) >= 0) ? 1 : -1;
    // blend: mostly sideways, some approach
    let mv = { x: perp.x * s * 1.0 + dirEn.x * 0.75, z: perp.z * s * 1.0 + dirEn.z * 0.75 };
    // Avoid running into walls
    const nx = me.x + mv.x * 2.5, nz = me.z + mv.z * 2.5;
    if (Math.abs(nx) > 18.5 || Math.abs(nz) > 18.5) {
      mv = { x: -perp.x * s + dirEn.x * 0.8, z: -perp.z * s + dirEn.z * 0.8 };
    }
    api.move(mv.x, mv.z);
    return;
  }

  // Default: close in and stay glued.
  if (dist > smashReach - 1.0) {
    if (en.visible && dist < 14) {
      // straight approach with slight zigzag to spoil aim
      const perp = V.perp(dirEn);
      const wob = Math.sin(p.t * 3.3) * 0.55;
      api.move(dirEn.x + perp.x * wob, dirEn.z + perp.z * wob);
    } else {
      api.moveTo(en.x, en.z);
    }
  } else {
    // In smash range but smash on cooldown: orbit close, stay inside cone range
    const perp = V.perp(dirEn);
    const s = (Math.floor(p.t * 0.7) % 2 === 0) ? 1 : -1;
    let push = (dist < 2.6) ? -0.5 : 0.7;
    api.move(dirEn.x * push + perp.x * s * 0.9, dirEn.z * push + perp.z * s * 0.9);
  }
}
