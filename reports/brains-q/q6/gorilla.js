function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en.alive) return;

  const dist = en.dist;
  const toEnemy = V.toward(me, en);

  // ---- track enemy laser casts / blinks ----
  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      api.remember('lastEnemySkill', e.skill);
      api.remember('lastEnemySkillT', p.t);
      if (e.skill === 'laser') api.remember('lastLaserT', p.t);
      if (e.skill === 'blink') api.remember('lastBlinkT', p.t);
    }
    if (e.type === 'damaged' && e.skill === 'laser') api.remember('lastLaserHitT', p.t);
  }

  const enemyCasting = en.casting && en.casting.skill === 'laser' && en.casting.telegraph;

  // ---------- helpers ----------
  const blocks = p.arena.obstacles;

  function clampArena(x, z) {
    const h = p.arena.half - 1.6;
    return { x: Math.max(-h, Math.min(h, x)), z: Math.max(-h, Math.min(h, z)) };
  }

  // ---------- combat decisions ----------
  const smashReach = 2.9 + me.radius + en.radius; // 5.15
  const smashReady = api.ready('smash');
  const chargeReady = api.ready('charge');
  const jumpReady = api.ready('jump');

  // Predict enemy position at smash landing (0.3s)
  const predX = en.x + en.vx * 0.3;
  const predZ = en.z + en.vz * 0.3;
  const predDist = Math.hypot(predX - me.x, predZ - me.z);

  // if busy, only manage facing/movement lightly
  if (me.casting && me.casting.skill === 'smash') {
    api.faceAt(predX, predZ);
    api.move(toEnemy.x, toEnemy.z);
    return;
  }
  if (me.casting && me.casting.skill === 'charge') {
    if (me.casting.phase === 'windup') {
      // aim at where they'll be when the dash arrives
      const tArrive = Math.max(0.05, (dist - me.radius - en.radius) / 15);
      const lx = en.x + en.vx * (0.3 + tArrive) * 0.7;
      const lz = en.z + en.vz * (0.3 + tArrive) * 0.7;
      api.faceAt(lx, lz);
    }
    return;
  }
  if (me.airborne || me.busy) {
    api.faceAt(en.x, en.z);
    return;
  }

  // ---------- SMASH ----------
  // Fire if they'll be in cone range when it lands.
  if (smashReady && !en.invulnerable && !en.airborne) {
    const willBeClose = predDist <= smashReach - 0.25 || dist <= smashReach - 0.6;
    if (willBeClose) {
      // only if facing roughly right (cone is wide, 55deg)
      const ang = Math.abs(V.angleTo(me.heading, V.toward(me, { x: predX, z: predZ })));
      if (ang < 1.2) {
        api.use('smash');
        api.faceAt(predX, predZ);
        api.move(toEnemy.x, toEnemy.z);
        return;
      }
    }
  }

  // ---------- CHARGE ----------
  // Use charge to close distance / interrupt laser cast.
  if (chargeReady && en.visible) {
    const good = dist > 5.0 && dist < 13.5;
    const interrupt = enemyCasting && dist < 13.5 && dist > 3.0;
    if (good || interrupt) {
      // check path is fairly clear along the direction
      const dir = V.toward(me, en);
      const r = api.ray(dir.x, dir.z, Math.min(dist + 0.5, 14));
      if (!r.hit || r.dist > dist - 1.4) {
        api.use('charge');
        api.faceAt(en.x, en.z);
        api.move(dir.x, dir.z);
        return;
      }
    }
  }

  // ---------- DODGE LASER ----------
  // When enemy is casting laser and we can't reach: strafe hard perpendicular,
  // or jump won't help (height not consulted). Break LOS if possible.
  if (enemyCasting && en.visible && dist > 4) {
    const rem = en.casting.remaining;
    // strafe perpendicular to the beam line
    const perp = V.perp(toEnemy);
    // pick side that moves away from enemy facing sweep — choose side with more room
    const s1 = clampArena(me.x + perp.x * 6, me.z + perp.z * 6);
    const s2 = clampArena(me.x - perp.x * 6, me.z - perp.z * 6);
    const d1 = V.dist(me, s1), d2 = V.dist(me, s2);
    let side = d1 >= d2 ? 1 : -1;
    const memSide = api.recall('strafeSide', 1);
    if (Math.abs(d1 - d2) < 1) side = memSide;
    api.remember('strafeSide', side);
    // blend perpendicular with closing so we still approach
    const mv = V.norm({
      x: perp.x * side * 1.0 + toEnemy.x * 0.55,
      z: perp.z * side * 1.0 + toEnemy.z * 0.55
    });
    api.move(mv.x, mv.z);
    api.faceAt(en.x, en.z);
    return;
  }

  // ---------- APPROACH ----------
  api.faceAt(en.x, en.z);

  if (dist > 6.5) {
    // weave while closing to make the beam miss; use pathing around blocks
    const path = api.pathTo(en.x, en.z);
    if (path && !path.direct && path.points && path.points.length) {
      const wp = path.points[0];
      api.moveTo(wp.x, wp.z);
    } else {
      // serpentine approach
      const phase = Math.sin(p.t * 2.4 + (api.recall('phaseOff', 0)));
      const perp = V.perp(toEnemy);
      const w = dist > 10 ? 0.75 : 0.5;
      const mv = V.norm({
        x: toEnemy.x + perp.x * phase * w,
        z: toEnemy.z + perp.z * phase * w
      });
      api.move(mv.x, mv.z);
    }
    return;
  }

  // ---------- CLOSE RANGE ----------
  // Stay just inside smash range, orbit slightly to stay on them.
  if (dist > 3.2) {
    const perp = V.perp(toEnemy);
    const side = api.recall('strafeSide', 1);
    const mv = V.norm({ x: toEnemy.x * 1.0 + perp.x * side * 0.35, z: toEnemy.z * 1.0 + perp.z * side * 0.35 });
    api.move(mv.x, mv.z);
  } else {
    // pressing in; body-block them with mass advantage
    api.move(toEnemy.x, toEnemy.z);
  }
}

const _init = (() => { return true; })();
