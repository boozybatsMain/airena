function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en.alive) return;

  const dist = en.dist;
  const toEnemy = V.toward(me, en);

  // ---- track enemy laser casts / blinks
  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      api.remember('lastEnemySkill', e.skill);
      api.remember('lastEnemySkillT', p.t);
      if (e.skill === 'blink') api.remember('blinkT', p.t);
      if (e.skill === 'laser') api.remember('laserT', p.t);
    }
    if (e.type === 'damaged' && e.skill === 'laser') api.remember('laserHitT', p.t);
  }

  const enemyCasting = en.casting && en.casting.skill === 'laser' && en.casting.telegraph;

  // ---- helper: is a point safe-ish / in arena
  const clampArena = (x, z) => ({
    x: Math.max(-19, Math.min(19, x)),
    z: Math.max(-19, Math.min(19, z))
  });

  // ============ COMBAT LOGIC ============

  // Smash range: centre-to-centre up to 5.15, be a bit conservative
  const SMASH_MAX = 5.05;

  // Predict where enemy will be in 0.3s (windup)
  const predX = en.x + en.vx * 0.30;
  const predZ = en.z + en.vz * 0.30;
  const predDist = Math.hypot(predX - me.x, predZ - me.z);

  // If mid-skill, just keep facing enemy
  if (me.busy) {
    if (me.casting && me.casting.skill === 'smash') {
      api.faceAt(predX, predZ);
    } else if (me.casting && me.casting.skill === 'charge' && me.casting.phase === 'windup') {
      // aim charge at predicted position at end of windup + a bit of lead
      const t = me.casting.remaining;
      const lead = 0.25 + t;
      api.faceAt(en.x + en.vx * lead, en.z + en.vz * lead);
    } else {
      api.faceAt(en.x, en.z);
    }
    return;
  }

  // 1) SMASH if in range
  if (api.ready('smash') && !en.airborne && predDist < SMASH_MAX && dist < 5.6) {
    api.use('smash');
    api.faceAt(predX, predZ);
    api.move(toEnemy.x, toEnemy.z);
    return;
  }

  // 2) CHARGE — good gap closer and interrupts laser
  const chargeGood = api.ready('charge') && en.visible && dist > 4.0 && dist < 12.5 && !en.airborne;
  if (chargeGood) {
    // prefer to charge when they are casting (interrupt) or when closing distance
    const worthIt = enemyCasting || dist > 5.0;
    if (worthIt) {
      // check path is roughly clear
      const lead = 0.3 + Math.min(0.8, dist / 15);
      const tx = en.x + en.vx * lead, tz = en.z + en.vz * lead;
      const d = V.norm({ x: tx - me.x, z: tz - me.z });
      const r = api.ray(d.x, d.z, Math.min(13, dist + 1));
      if (!r.hit || r.dist > dist - 1.0) {
        api.use('charge');
        api.faceAt(tx, tz);
        api.move(d.x, d.z);
        return;
      }
    }
  }

  // 3) Dodge laser: if enemy is casting laser and we're in the open, strafe hard
  if (enemyCasting && en.visible && dist > 5) {
    // move perpendicular to the beam line
    const perp = V.perp(toEnemy);
    // pick side that has more room and is away from walls
    const s1 = clampArena(me.x + perp.x * 4, me.z + perp.z * 4);
    const s2 = clampArena(me.x - perp.x * 4, me.z - perp.z * 4);
    const room1 = Math.min(20 - Math.abs(s1.x), 20 - Math.abs(s1.z));
    const room2 = Math.min(20 - Math.abs(s2.x), 20 - Math.abs(s2.z));
    let dir = room1 >= room2 ? perp : V.scale(perp, -1);
    // blend toward enemy so we still close
    const mv = V.norm({ x: dir.x * 1.6 + toEnemy.x, z: dir.z * 1.6 + toEnemy.z });
    api.move(mv.x, mv.z);
    api.faceAt(en.x, en.z);
    return;
  }

  // 4) Approach
  api.faceAt(en.x, en.z);

  if (dist < 3.2) {
    // too close and smash on cooldown — stay glued, circle a bit
    const perp = V.perp(toEnemy);
    const sign = (Math.floor(p.t * 0.7) % 2 === 0) ? 1 : -1;
    const mv = V.norm({ x: toEnemy.x * 0.9 + perp.x * sign * 0.6, z: toEnemy.z * 0.9 + perp.z * sign * 0.6 });
    api.move(mv.x, mv.z);
    return;
  }

  // path toward enemy
  const path = api.pathTo(en.x, en.z);
  if (path && !path.direct && path.points && path.points.length) {
    const wp = path.points[0];
    api.move(wp.x - me.x, wp.z - me.z);
  } else {
    // straight in, with slight jitter-free weave to make laser aim harder
    if (dist > 8 && en.visible) {
      const perp = V.perp(toEnemy);
      const w = Math.sin(p.t * 2.4) * 0.55;
      const mv = V.norm({ x: toEnemy.x + perp.x * w, z: toEnemy.z + perp.z * w });
      api.move(mv.x, mv.z);
    } else {
      api.move(toEnemy.x, toEnemy.z);
    }
  }
}
