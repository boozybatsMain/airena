function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en.alive) return;

  const dist = en.dist;
  const toEn = V.toward(me, en);

  // ---- track enemy laser timing ----
  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      if (e.skill === 'laser') api.remember('laserAt', p.t);
      if (e.skill === 'blink') api.remember('blinkAt', p.t);
      if (e.skill === 'jump') api.remember('jumpAt', p.t);
    }
    if (e.type === 'dealt') api.remember('lastHit', p.t);
  }

  const enemyCasting = en.casting && en.casting.skill === 'laser' && en.casting.telegraph;

  // ---- if busy with an uninterruptible thing, just steer ----
  if (me.airborne) {
    api.faceAt(en.x, en.z);
    return;
  }

  // ---------- cover / approach helpers ----------
  const clampArena = (v) => Math.max(-18.5, Math.min(18.5, v));

  // strafing sign, flip occasionally
  let sSign = api.recall('sSign', 1);
  if (api.rand() < 0.02) { sSign = -sSign; api.remember('sSign', sSign); }
  for (const e of p.events) {
    if (e.type === 'blocked') { sSign = -sSign; api.remember('sSign', sSign); }
  }

  // ---------- SMASH ----------
  // Landing range: centre-to-centre up to 5.15m at strike time.
  // Wind-up 0.3s -> predict.
  const predT = 0.3;
  const ex = en.x + en.vx * predT, ez = en.z + en.vz * predT;
  const mx = me.x + me.vx * predT * 0.5, mz = me.z + me.vz * predT * 0.5;
  const predDist = Math.hypot(ex - mx, ez - mz);

  if (api.ready('smash') && !me.busy && predDist < 4.6 && !en.airborne && !en.invulnerable) {
    api.use('smash');
    api.faceAt(ex, ez);
    api.move(toEn.x, toEn.z);
    return;
  }

  // ---------- CHARGE ----------
  // Great when enemy is casting laser (interrupts) or at mid range.
  if (api.ready('charge') && !me.busy && en.visible && dist > 3.2 && dist < 11.5) {
    // predict where they'll be at contact: windup 0.3 then dash at 15 m/s
    const tGuess = 0.3 + Math.max(0, (dist - 2.2) / 15);
    let tx = en.x + en.vx * tGuess * 0.7;
    let tz = en.z + en.vz * tGuess * 0.7;
    if (enemyCasting) { tx = en.x; tz = en.z; }
    const good = api.los(tx, tz);
    if (good) {
      api.faceAt(tx, tz);
      const ang = Math.abs(V.angleTo(me.heading, V.toward(me, { x: tx, z: tz })));
      if (ang < 0.45 || enemyCasting) {
        api.use('charge');
        api.move(0, 0);
        return;
      }
    }
  }

  // ---------- DODGE LASER ----------
  if (enemyCasting && en.visible) {
    const rem = en.casting.remaining;
    // strafe perpendicular hard; or jump won't help (height not consulted)
    const perp = V.perp(toEn);
    // choose side away from enemy facing offset
    const rel = V.angleTo(en.heading, V.toward(en, me));
    const side = rel > 0 ? -1 : 1;
    let dx = perp.x * side, dz = perp.z * side;
    // bias slightly toward closing so we don't lose ground
    dx += toEn.x * 0.35; dz += toEn.z * 0.35;
    // check we're not running into a wall
    const nx = clampArena(me.x + dx * 4), nz = clampArena(me.z + dz * 4);
    api.move(nx - me.x, nz - me.z);
    api.faceAt(en.x, en.z);
    if (rem < 0.12 && api.ready('smash') && dist < 5.0) api.use('smash');
    return;
  }

  // ---------- CLOSE / PRESSURE ----------
  api.faceAt(en.x, en.z);

  if (dist > 6.5) {
    // sprint at them, use path routing around blocks
    const path = api.pathTo(en.x, en.z);
    if (path && path.points && path.points.length > 0 && !path.direct) {
      const wp = path.points[0];
      api.move(wp.x - me.x, wp.z - me.z);
    } else {
      // weave slightly to be a harder laser target
      const perp = V.perp(toEn);
      const wob = Math.sin(p.t * 2.4) * 0.55 * sSign;
      api.move(toEn.x + perp.x * wob, toEn.z + perp.z * wob);
    }
    return;
  }

  // in close: orbit-press to stay inside smash range
  const perp = V.perp(toEn);
  let dx, dz;
  if (dist > 3.0) {
    dx = toEn.x + perp.x * 0.5 * sSign;
    dz = toEn.z + perp.z * 0.5 * sSign;
  } else if (dist > 1.9) {
    dx = toEn.x * 0.5 + perp.x * sSign;
    dz = toEn.z * 0.5 + perp.z * sSign;
  } else {
    dx = toEn.x * 0.3 + perp.x * sSign;
    dz = toEn.z * 0.3 + perp.z * sSign;
  }
  const tx = clampArena(me.x + dx * 3), tz = clampArena(me.z + dz * 3);
  api.move(tx - me.x, tz - me.z);
}
