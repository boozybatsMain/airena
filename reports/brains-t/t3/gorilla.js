function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en.alive) return;

  const dist = en.dist;
  const toEnemy = V.toward(me, en);

  // --- track enemy laser cast start ---
  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      api.remember('lastEnemySkill', e.skill);
      api.remember('lastEnemySkillT', p.t);
      if (e.skill === 'laser') api.remember('laserT', p.t);
      if (e.skill === 'blink') api.remember('blinkT', p.t);
    }
    if (e.type === 'damaged' && e.skill === 'laser') api.remember('laserHitT', p.t);
  }

  const enemyCasting = en.casting;
  const enemyLasering = enemyCasting && enemyCasting.skill === 'laser' && enemyCasting.telegraph;

  // ---------- helpers ----------
  const SMASH_MAX = 2.9 + me.radius + en.radius; // 5.15
  const angDiff = (h, dir) => Math.abs(V.angleTo(h, dir));

  // predicted enemy position a bit ahead
  const pred = (t) => ({ x: en.x + en.vx * t, z: en.z + en.vz * t });

  // ---------- 1. SMASH if in range and aimed (or will be) ----------
  const facingErr = angDiff(me.heading, toEnemy);

  // If already winding up smash, just keep aiming at predicted landing spot
  if (me.casting && me.casting.skill === 'smash') {
    const rem = me.casting.remaining || 0;
    const tp = pred(Math.min(rem, 0.3));
    api.faceAt(tp.x, tp.z);
    if (dist > 3.0) api.move(toEnemy.x, toEnemy.z);
    else api.stop();
    return;
  }
  if (me.busy) {
    // charge dash / jump air etc — keep facing enemy
    api.faceAt(en.x, en.z);
    return;
  }

  const smashReady = api.ready('smash');
  const chargeReady = api.ready('charge');
  const jumpReady = api.ready('jump');

  // Predicted position at smash landing (0.3s)
  const sp = pred(0.3);
  const dSp = Math.hypot(sp.x - me.x, sp.z - me.z);
  const dirSp = V.norm({ x: sp.x - me.x, z: sp.z - me.z });
  const turnable = 0.3 * me.turnRate * 0.55; // radians available during windup
  const errSp = angDiff(me.heading, dirSp);
  const halfAngle = (55 * Math.PI / 180) + Math.asin(Math.min(0.99, en.radius / Math.max(dSp, en.radius + 0.01)));

  if (smashReady && !en.airborne && dSp <= SMASH_MAX - 0.15 && errSp <= halfAngle + turnable - 0.05) {
    api.use('smash');
    api.faceAt(sp.x, sp.z);
    api.move(toEnemy.x, toEnemy.z);
    return;
  }

  // ---------- 2. CHARGE ----------
  // Good when enemy is at mid range, visible, and roughly ahead.
  // Also excellent to interrupt a laser cast.
  const chargeTravel = Math.min(12, dist + 1);
  const chargeGood = chargeReady && en.visible && dist > 4.0 && dist < 11.5 && !en.airborne;

  if (chargeGood) {
    // aim at where they'll be when we arrive: windup 0.3 + travel/15
    const tArrive = 0.3 + Math.max(0, dist - me.radius - en.radius) / 15;
    const cp = pred(tArrive * 0.8);
    const dirC = V.norm({ x: cp.x - me.x, z: cp.z - me.z });
    const errC = angDiff(me.heading, dirC);
    const turnableC = 0.3 * me.turnRate * 0.85;
    // Check path clear-ish
    const r = api.ray(dirC.x, dirC.z, Math.min(dist + 0.5, 12));
    const clear = !r.hit || r.dist >= dist - en.radius - 0.6;
    if (clear && (errC < turnableC + 0.35 || enemyLasering)) {
      if (errC < turnableC + 0.05) {
        api.use('charge');
      }
      api.face(dirC.x, dirC.z);
      api.move(dirC.x, dirC.z);
      return;
    }
    api.face(dirC.x, dirC.z);
  }

  // ---------- 3. Dodging the laser ----------
  // If enemy is casting laser and we're in the line, strafe hard perpendicular
  // or break line of sight.
  if (enemyLasering && dist > SMASH_MAX + 0.5) {
    const rem = enemyCasting.remaining;
    // Enemy beam direction: their facing, turning toward us at reduced rate
    const perp = V.perp(toEnemy);
    // pick side that moves us away from their aim & toward cover
    const s1 = { x: me.x + perp.x * 3.5, z: me.z + perp.z * 3.5 };
    const s2 = { x: me.x - perp.x * 3.5, z: me.z - perp.z * 3.5 };
    const inB = (v) => Math.abs(v.x) < 19 && Math.abs(v.z) < 19;
    let dir = perp;
    if (!inB(s1) && inB(s2)) dir = V.scale(perp, -1);
    else if (inB(s1) && inB(s2)) {
      // choose side that also closes distance slightly
      const a = V.add(V.scale(perp, 1), V.scale(toEnemy, 0.55));
      const b = V.add(V.scale(perp, -1), V.scale(toEnemy, 0.55));
      const ra = api.ray(a.x, a.z, 3);
      const rb = api.ray(b.x, b.z, 3);
      dir = (ra.dist >= rb.dist) ? V.norm(a) : V.norm(b);
    } else if (!inB(s1) && !inB(s2)) {
      dir = toEnemy;
    }
    // If close to firing, jump to nothing (jump doesn't dodge laser). Just strafe.
    api.move(dir.x + toEnemy.x * 0.5, dir.z + toEnemy.z * 0.5);
    api.faceAt(en.x, en.z);
    return;
  }

  // ---------- 4. Closing / positioning ----------
  api.faceAt(en.x, en.z);

  if (dist <= SMASH_MAX + 0.6) {
    // Stay glued: move into them, orbit slightly to be unpredictable
    const perp = V.perp(toEnemy);
    const side = (Math.floor(p.t * 1.3) % 2 === 0) ? 1 : -1;
    const d = V.norm({ x: toEnemy.x * 1.0 + perp.x * side * 0.45, z: toEnemy.z * 1.0 + perp.z * side * 0.45 });
    api.move(d.x, d.z);
    // aim at predicted
    api.faceAt(sp.x, sp.z);
    return;
  }

  // Approach. Use pathTo if no LOS, else weaving straight line.
  if (!en.visible) {
    const path = api.pathTo(en.x, en.z);
    if (path && path.points && path.points.length) {
      const wp = path.points[0];
      api.moveTo(wp.x, wp.z);
    } else {
      api.move(toEnemy.x, toEnemy.z);
    }
    return;
  }

  // Visible and far: zigzag approach to make laser aim harder.
  const phase = Math.sin(p.t * 3.1);
  const perp = V.perp(toEnemy);
  const weave = dist > 8 ? 0.75 : 0.4;
  let dir = V.norm({ x: toEnemy.x + perp.x * phase * weave, z: toEnemy.z + perp.z * phase * weave });
  // avoid walking straight into a wall
  const nx = me.x + dir.x * 2.5, nz = me.z + dir.z * 2.5;
  if (Math.abs(nx) > 19 || Math.abs(nz) > 19) dir = toEnemy;
  api.move(dir.x, dir.z);
}
