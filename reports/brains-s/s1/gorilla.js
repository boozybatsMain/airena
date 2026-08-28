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
    if (e.type === 'damaged' && e.skill === 'laser') api.remember('laserHitT', p.t);
  }

  const lastLaser = api.recall('laserT', -99);
  const lastBlink = api.recall('blinkT', -99);

  // ---- if we're locked in a skill, only manage facing
  if (me.casting) {
    const c = me.casting;
    if (c.skill === 'smash') {
      // aim at where they'll be when it lands
      const lead = { x: en.x + en.vx * c.remaining, z: en.z + en.vz * c.remaining };
      api.faceAt(lead.x, lead.z);
      if (c.phase === 'windup') {
        api.move(toEn.x, toEn.z);
      }
      return;
    }
    if (c.skill === 'charge' && c.phase === 'windup') {
      // aim charge at predicted position
      const t = c.remaining + Math.min(0.8, dist / 15) * 0.5;
      const lead = { x: en.x + en.vx * t, z: en.z + en.vz * t };
      api.faceAt(lead.x, lead.z);
      return;
    }
    if (c.skill === 'jump') {
      api.faceAt(en.x, en.z);
      return;
    }
    if (c.phase === 'recover') {
      api.faceAt(en.x, en.z);
      // keep pressing
      api.move(toEn.x, toEn.z);
      return;
    }
    return;
  }

  if (me.stunned) { api.faceAt(en.x, en.z); return; }

  // ---- ALWAYS face the enemy by default
  api.faceAt(en.x, en.z);

  const enemyCasting = en.casting;
  const enemyLaserCast = enemyCasting && enemyCasting.skill === 'laser' && enemyCasting.telegraph;

  // =========================================================
  // KILL RANGE: smash
  // =========================================================
  const smashMaxCenter = 2.9 + me.radius + en.radius; // 5.15
  const angErr = Math.abs(V.angleTo(me.heading, toEn));

  if (dist <= smashMaxCenter - 0.35 && api.ready('smash') && !en.airborne && !en.invulnerable) {
    // predict: will they still be in range in 0.3s?
    const fx = en.x + en.vx * 0.32, fz = en.z + en.vz * 0.32;
    const mx = me.x + me.vx * 0.15, mz = me.z + me.vz * 0.15;
    const fd = Math.hypot(fx - mx, fz - mz);
    if (fd <= smashMaxCenter - 0.1 && angErr < 1.3) {
      api.use('smash');
      api.move(toEn.x, toEn.z);
      return;
    }
  }

  // =========================================================
  // CHARGE: gap closer / interrupter
  // =========================================================
  const chargeReady = api.ready('charge');
  if (chargeReady && dist > 3.0 && dist < 13.0 && en.visible && !en.airborne) {
    // check the dash lane is clear-ish
    const r = api.ray(toEn.x, toEn.z, Math.min(dist + 1, 14));
    const laneClear = !r.hit || r.dist >= dist - 0.6;
    if (laneClear) {
      // prioritize charging while they cast laser (interrupt) or any time in range
      const good = enemyLaserCast || dist < 12;
      if (good) {
        api.use('charge');
        return;
      }
    }
  }

  // =========================================================
  // DODGE LASER: if they are casting and we're exposed
  // =========================================================
  if (enemyLaserCast && en.visible && dist > 4) {
    const rem = enemyCasting.remaining;
    // strafe hard perpendicular; also try breaking LOS
    const perp = V.perp(toEn);
    // pick the side that moves us away from their facing sweep and toward cover
    let side = api.recall('strafeSide', 1);
    const cand1 = { x: me.x + perp.x * 4 * side, z: me.z + perp.z * 4 * side };
    if (Math.abs(cand1.x) > 18.5 || Math.abs(cand1.z) > 18.5) { side = -side; api.remember('strafeSide', side); }
    if (rem < 0.35 && api.ready('jump')) {
      // jump doesn't dodge laser (height not consulted) - so don't
    }
    const dir = { x: perp.x * side + toEn.x * 0.35, z: perp.z * side + toEn.z * 0.35 };
    api.move(dir.x, dir.z);
    api.faceAt(en.x, en.z);
    return;
  }

  // =========================================================
  // GENERAL APPROACH
  // =========================================================
  // Keep switching strafe side occasionally to make lasers miss
  let side = api.recall('strafeSide', 1);
  const lastSwap = api.recall('swapT', 0);
  if (p.t - lastSwap > 0.9 + api.rand() * 0.8) {
    side = (api.rand() < 0.5 ? 1 : -1);
    api.remember('strafeSide', side);
    api.remember('swapT', p.t);
  }

  if (dist > 2.2) {
    if (en.visible) {
      const perp = V.perp(toEn);
      // strafe blend: stronger sideways at long range, more direct up close
      let w = dist > 8 ? 0.75 : dist > 5 ? 0.5 : 0.15;
      let dir = { x: toEn.x + perp.x * side * w, z: toEn.z + perp.z * side * w };
      // wall avoidance
      const nx = me.x + dir.x * 3, nz = me.z + dir.z * 3;
      if (Math.abs(nx) > 18 || Math.abs(nz) > 18) {
        dir = { x: toEn.x, z: toEn.z };
      }
      api.move(dir.x, dir.z);
    } else {
      api.moveTo(en.x, en.z);
    }
  } else {
    // in contact range but smash on cooldown: stay glued, circle a bit
    const perp = V.perp(toEn);
    api.move(toEn.x * 0.6 + perp.x * side * 0.7, toEn.z * 0.6 + perp.z * side * 0.7);
  }

  // Emergency: enemy far and burn is on and we can't reach — just push
  if (p.burn > 0 && me.hp / me.maxHp < en.hp / en.maxHp && dist > 6) {
    api.moveTo(en.x, en.z);
  }
}
