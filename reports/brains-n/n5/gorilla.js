function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive) return;

  const dist = en.dist;
  const toEnemy = V.toward(me, en);

  // --- track enemy laser casts / events ---
  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      api.remember('lastEnemySkill', e.skill);
      api.remember('lastEnemySkillT', p.t);
      if (e.skill === 'laser') api.remember('lastLaserT', p.t);
      if (e.skill === 'blink') api.remember('lastBlinkT', p.t);
    }
    if (e.type === 'damaged') api.remember('lastHitT', p.t);
  }

  const busy = me.busy;
  const casting = me.casting;

  // If we're mid-skill and can't act, still steer/face where useful.
  const canAct = !busy && !me.stunned && !me.airborne;

  // ---------- facing: always toward enemy (predicted) ----------
  // Predict enemy slightly ahead for smash timing
  const predT = 0.32;
  const ex = en.x + en.vx * predT * 0.6;
  const ez = en.z + en.vz * predT * 0.6;

  // ---------- strafe helper to dodge laser ----------
  const enemyCastingLaser = en.casting && en.casting.skill === 'laser' && en.casting.telegraph;

  // ---------- SMASH ----------
  // effective reach: 2.9 + my radius + their radius = 5.15 centre-centre
  const smashMax = 5.15;
  if (canAct && api.ready('smash') && !en.airborne && !en.invulnerable) {
    // distance at land time ~0.3s ahead
    const fx = en.x + en.vx * 0.3, fz = en.z + en.vz * 0.3;
    const mfx = me.x + me.vx * 0.3, mfz = me.z + me.vz * 0.3;
    const fd = Math.hypot(fx - mfx, fz - mfz);
    if (fd < smashMax - 0.15 && dist < smashMax + 0.6) {
      api.use('smash');
      api.faceAt(fx, fz);
      api.move(toEnemy.x, toEnemy.z);
      return;
    }
  }

  // ---------- CHARGE ----------
  // Great opener and gap-closer. Use when enemy visible, in a good band.
  if (canAct && api.ready('charge') && en.visible && !en.invulnerable) {
    const good = dist > 4.0 && dist < 11.5;
    // Prefer charging while they're casting laser (interrupt) or at range
    if (good) {
      // aim at lead position for dash arrival time
      const eta = Math.max(0, (dist - 2.2)) / 15 + 0.3;
      const lx = en.x + en.vx * eta * 0.8;
      const lz = en.z + en.vz * eta * 0.8;
      if (api.los(lx, lz) || api.los(en.x, en.z)) {
        api.use('charge');
        api.faceAt(lx, lz);
        api.move(toEnemy.x, toEnemy.z);
        api.remember('chargeT', p.t);
        return;
      }
    }
  }

  // During charge windup, keep facing the lead point (facing at end of windup = direction)
  if (casting && casting.skill === 'charge' && casting.phase === 'windup') {
    const eta = 0.3 + Math.max(0, dist - 2.2) / 15;
    api.faceAt(en.x + en.vx * eta * 0.8, en.z + en.vz * eta * 0.8);
    return;
  }

  // ---------- JUMP to dodge? Jump doesn't dodge laser (height not consulted). ----------
  // Jump is only useful for closing distance safely? Not really. Use to cover ground: no.
  // Use jump to avoid nothing. Skip mostly; but jump can carry momentum — harmless.

  // ---------- MOVEMENT ----------
  api.faceAt(ex, ez);

  // Anti-laser: when enemy is casting laser and we're far, strafe hard perpendicular
  // and/or break line of sight.
  if (enemyCastingLaser && dist > 3.5) {
    const perp = V.perp(toEnemy);
    // pick side that keeps us moving toward enemy-ish and away from walls
    let s = api.recall('strafeSide', 1);
    const cand1 = { x: me.x + perp.x * 4, z: me.z + perp.z * 4 };
    const cand2 = { x: me.x - perp.x * 4, z: me.z - perp.z * 4 };
    const ok = (c) => Math.abs(c.x) < 18.5 && Math.abs(c.z) < 18.5;
    if (!ok(cand1)) s = -1; else if (!ok(cand2)) s = 1;
    api.remember('strafeSide', s);
    // blend: mostly perpendicular, some approach
    const dir = V.norm({
      x: perp.x * s * 1.0 + toEnemy.x * 0.75,
      z: perp.z * s * 1.0 + toEnemy.z * 0.75
    });
    api.move(dir.x, dir.z);
    return;
  }

  // Flip strafe side occasionally to be unpredictable
  if (p.tick % 60 === 0 && api.rand() < 0.5) {
    api.remember('strafeSide', -api.recall('strafeSide', 1));
  }

  // Close in.
  if (dist > smashMax - 0.5) {
    if (en.visible) {
      // Approach with a slight weave so a beam has to track
      const perp = V.perp(toEnemy);
      const s = api.recall('strafeSide', 1);
      const weave = dist > 7 ? 0.55 : 0.25;
      const dir = V.norm({
        x: toEnemy.x + perp.x * s * weave,
        z: toEnemy.z + perp.z * s * weave
      });
      const target = { x: me.x + dir.x * 6, z: me.z + dir.z * 6 };
      if (Math.abs(target.x) < 19 && Math.abs(target.z) < 19) {
        api.move(dir.x, dir.z);
      } else {
        api.moveTo(en.x, en.z);
      }
    } else {
      api.moveTo(en.x, en.z);
    }
    return;
  }

  // In smash range but smash on cooldown: stay glued, circle a little.
  {
    const perp = V.perp(toEnemy);
    const s = api.recall('strafeSide', 1);
    const want = dist < 2.6 ? -0.3 : 0.9;
    const dir = V.norm({
      x: toEnemy.x * want + perp.x * s * 0.7,
      z: toEnemy.z * want + perp.z * s * 0.7
    });
    api.move(dir.x, dir.z);
  }
}
