function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en.alive) return;

  const dist = en.dist;
  const toEnemy = V.toward(me, en);

  // --- track enemy laser casts / blinks
  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      api.remember('lastEnemySkill', e.skill);
      api.remember('lastEnemySkillT', p.t);
      if (e.skill === 'blink') api.remember('blinkT', p.t);
      if (e.skill === 'laser') api.remember('laserT', p.t);
    }
  }

  const enemyCasting = en.casting && en.casting.skill === 'laser' && en.casting.telegraph;
  const lastLaser = api.recall('laserT', -99);
  const laserCd = Math.max(0, 2.2 - (p.t - lastLaser));

  // --- helper: is a point safe-ish (not in a block)
  const blocks = p.arena.obstacles;
  function inBlock(x, z, pad) {
    for (const b of blocks) {
      if (Math.abs(x - b.x) < b.hx + pad && Math.abs(z - b.z) < b.hz + pad) return true;
    }
    return false;
  }

  // ---------- absolute reactions ----------

  // If busy with something uninterruptible, just keep facing enemy.
  if (me.casting && (me.casting.skill === 'charge' || me.casting.skill === 'jump')) {
    if (me.casting.phase === 'windup' && me.casting.skill === 'charge') {
      // aim charge with lead
      const lead = { x: en.x + en.vx * 0.35, z: en.z + en.vz * 0.35 };
      api.faceAt(lead.x, lead.z);
      api.move(toEnemy.x, toEnemy.z);
    } else {
      api.faceAt(en.x, en.z);
    }
    return;
  }

  // ---------- SMASH: highest priority when in range ----------
  const smashReach = 2.9 + me.radius + en.radius; // 5.15
  if (api.ready('smash') && !me.busy) {
    // predict enemy position at land time (0.3s)
    const px = en.x + en.vx * 0.3, pz = en.z + en.vz * 0.3;
    const pd = Math.hypot(px - me.x, pz - me.z);
    const ang = Math.abs(V.angleTo(me.heading, { x: px - me.x, z: pz - me.z }));
    // account for turn during windup (0.55*4*0.3 = 0.66 rad available)
    if (pd <= smashReach - 0.25 && ang < 0.66 + 0.7 && !en.airborne) {
      api.faceAt(px, pz);
      api.use('smash');
      api.move(toEnemy.x, toEnemy.z);
      return;
    }
  }

  // ---------- CHARGE ----------
  // Use charge to close distance and interrupt laser casts.
  if (api.ready('charge') && !me.busy && en.visible && !en.airborne) {
    const good = dist > 4.0 && dist < 13.5;
    const clear = api.ray(toEnemy.x, toEnemy.z, Math.min(dist, 13)).dist >= Math.min(dist - 0.6, 12.9);
    if (good && clear) {
      // Prefer charging when they're casting laser (interrupt) or when far.
      if (enemyCasting || dist > 5.5) {
        const lead = { x: en.x + en.vx * 0.5, z: en.z + en.vz * 0.5 };
        api.faceAt(lead.x, lead.z);
        api.use('charge');
        return;
      }
    }
  }

  // ---------- DODGE LASER ----------
  if (enemyCasting) {
    const rem = en.casting.remaining;
    // Break line of sight or move perpendicular hard.
    const perp = V.perp(toEnemy);
    // choose side away from wall
    let side = 1;
    const cand1 = { x: me.x + perp.x * 5, z: me.z + perp.z * 5 };
    const cand2 = { x: me.x - perp.x * 5, z: me.z - perp.z * 5 };
    const score = (c) => {
      let s = 0;
      if (Math.abs(c.x) > 18 || Math.abs(c.z) > 18) s -= 10;
      if (inBlock(c.x, c.z, 1.4)) s -= 5;
      if (!api.los(c.x, c.z)) s += 0; // fine
      return s;
    };
    if (score(cand2) > score(cand1)) side = -1;

    if (dist > 6) {
      // strafe hard perpendicular, slight closing
      const d = { x: perp.x * side + toEnemy.x * 0.45, z: perp.z * side + toEnemy.z * 0.45 };
      api.move(d.x, d.z);
    } else {
      const d = { x: perp.x * side + toEnemy.x * 0.7, z: perp.z * side + toEnemy.z * 0.7 };
      api.move(d.x, d.z);
    }
    api.faceAt(en.x, en.z);

    // Jump won't dodge a laser (height not consulted). Don't jump.
    return;
  }

  // ---------- DEFAULT: close and stay glued ----------
  api.faceAt(en.x + en.vx * 0.25, en.z + en.vz * 0.25);

  if (dist > 6.5) {
    // approach, using pathfinding around blocks
    const path = api.pathTo(en.x, en.z);
    if (path && !path.direct && path.points && path.points.length) {
      const wp = path.points[0];
      api.move(wp.x - me.x, wp.z - me.z);
    } else {
      api.move(toEnemy.x, toEnemy.z);
    }
  } else {
    // orbit-close: press in with a bit of lateral so their beam has to track
    const perp = V.perp(toEnemy);
    let side = api.recall('orbit', 1);
    if (p.t - api.recall('orbitT', -9) > 1.1) {
      side = api.rand() < 0.5 ? 1 : -1;
      api.remember('orbit', side);
      api.remember('orbitT', p.t);
    }
    // if a wall is close on that side, flip
    const test = { x: me.x + perp.x * side * 3, z: me.z + perp.z * side * 3 };
    if (Math.abs(test.x) > 18.5 || Math.abs(test.z) > 18.5 || inBlock(test.x, test.z, 1.4)) {
      side = -side;
      api.remember('orbit', side);
    }
    const want = dist > 3.0 ? 1.0 : (dist < 2.4 ? -0.35 : 0.15);
    const d = {
      x: toEnemy.x * want + perp.x * side * 0.75,
      z: toEnemy.z * want + perp.z * side * 0.75
    };
    api.move(d.x, d.z);
  }
}
