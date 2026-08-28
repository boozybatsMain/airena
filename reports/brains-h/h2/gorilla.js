function segBox(ax, az, bx, bz, b, pad) {
  const minx = b.x - b.hx - pad, maxx = b.x + b.hx + pad;
  const minz = b.z - b.hz - pad, maxz = b.z + b.hz + pad;
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dz = bz - az;
  if (Math.abs(dx) < 1e-9) {
    if (ax < minx || ax > maxx) return false;
  } else {
    let ta = (minx - ax) / dx, tb = (maxx - ax) / dx;
    if (ta > tb) { const t = ta; ta = tb; tb = t; }
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  if (Math.abs(dz) < 1e-9) {
    if (az < minz || az > maxz) return false;
  } else {
    let ta = (minz - az) / dz, tb = (maxz - az) / dz;
    if (ta > tb) { const t = ta; ta = tb; tb = t; }
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  return true;
}

function segBlocked(ax, az, bx, bz, obs, pad) {
  for (const b of obs) if (segBox(ax, az, bx, bz, b, pad)) return true;
  return false;
}

function inObs(x, z, obs, pad) {
  for (const b of obs) {
    if (x > b.x - b.hx - pad && x < b.x + b.hx + pad && z > b.z - b.hz - pad && z < b.z + b.hz + pad) return true;
  }
  return false;
}

function okSpot(x, z, obs, r, half) {
  if (Math.abs(x) > half - r - 0.4 || Math.abs(z) > half - r - 0.4) return false;
  return !inObs(x, z, obs, r + 0.15);
}

let S = { init: false };

function resetState() {
  S = {
    init: true,
    lastT: 0,
    laserReadyAt: 0,
    blinkInvUntil: -9,
    orbit: 1,
    lastFlip: -9,
    lastSay: -9,
    hitCount: 0
  };
}

function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!S.init || p.t < S.lastT - 0.5) resetState();
  S.lastT = p.t;
  if (!me.alive || !en.alive) return;

  const obs = p.arena.obstacles;
  const half = p.arena.half;

  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      if (e.skill === 'laser') S.laserReadyAt = p.t + 2.2;
      else if (e.skill === 'blink') S.blinkInvUntil = p.t + 0.34;
    } else if (e.type === 'blocked') {
      if (p.t - S.lastFlip > 0.5) { S.orbit = -S.orbit; S.lastFlip = p.t; }
    } else if (e.type === 'missed' && e.skill === 'charge') {
      if (p.t - S.lastFlip > 0.4) { S.orbit = -S.orbit; S.lastFlip = p.t; }
    } else if (e.type === 'dealt') {
      S.hitCount++;
    }
  }
  if (en.invulnerable) S.blinkInvUntil = Math.max(S.blinkInvUntil, p.t + 0.2);

  const dist = en.dist;
  const evx = Math.max(-6, Math.min(6, en.vx));
  const evz = Math.max(-6, Math.min(6, en.vz));
  const clampX = (v) => Math.max(-half + 1, Math.min(half - 1, v));
  const pred = (t) => ({ x: clampX(en.x + evx * t), z: clampX(en.z + evz * t) });

  const enCastLaser = en.casting && en.casting.skill === 'laser' && en.casting.telegraph;
  const laserSoon = enCastLaser || (p.t >= S.laserReadyAt - 0.35);
  const clearLine = !segBlocked(me.x, me.z, en.x, en.z, obs, 0);

  // ---- facing target ----
  const fp = pred(0.28);
  api.faceAt(fp.x, fp.z);

  // ---- if locked in a skill we cannot redirect, keep moving and bail ----
  const cast = me.casting;
  if (me.stunned) return;
  if (cast && cast.skill === 'charge') {
    if (cast.phase === 'windup') {
      const t = 0.28 + Math.max(0, dist - 2.25) / 15;
      const q = pred(t);
      api.faceAt(q.x, q.z);
      api.move(q.x - me.x, q.z - me.z);
    }
    return;
  }
  if (me.airborne) {
    api.faceAt(fp.x, fp.z);
    return;
  }
  if (cast && cast.skill === 'smash') {
    const q = pred(Math.max(0.02, cast.remaining || 0.1));
    api.faceAt(q.x, q.z);
    if (dist > 3.0) api.move(q.x - me.x, q.z - me.z);
    else {
      const toE = V.toward(me, en);
      const d = V.rot(toE, 0.5 * S.orbit);
      api.move(d.x, d.z);
    }
    return;
  }

  const invulnRisk = p.t + 0.28 < S.blinkInvUntil;

  // ---- SMASH ----
  const dPred = Math.hypot(fp.x - me.x, fp.z - me.z);
  const canSmash = api.ready('smash') && !invulnRisk && !me.busy;
  if (canSmash && dPred <= 4.15 && dist <= 4.6 && !(en.airborne && (!en.casting || en.casting.phase === 'air'))) {
    api.use('smash');
  } else if (api.ready('charge') && !me.busy && !invulnRisk && dist > 3.2 && dist < 12.5) {
    // ---- CHARGE ----
    let t = 0.28 + Math.max(0, dist - 2.25) / 15;
    let q = pred(t);
    for (let i = 0; i < 3; i++) {
      const d2 = Math.hypot(q.x - me.x, q.z - me.z);
      t = 0.28 + Math.max(0, d2 - 2.25) / 15;
      q = pred(t);
    }
    const d2 = Math.hypot(q.x - me.x, q.z - me.z);
    const dirq = V.norm({ x: q.x - me.x, z: q.z - me.z });
    const pathClear = !segBlocked(me.x, me.z, me.x + dirq.x * Math.min(d2, 12), me.z + dirq.z * Math.min(d2, 12), obs, 0.6);
    const err = Math.abs(V.angleTo(me.heading, dirq));
    if (pathClear && clearLine && d2 < 12 && err < 1.4) {
      api.use('charge');
      api.faceAt(q.x, q.z);
      api.move(q.x - me.x, q.z - me.z);
      return;
    }
  }

  // ---- MOVEMENT ----
  if (dist < 6.2 && clearLine) {
    // melee: orbit-close
    const toE = V.toward(me, en);
    let ang;
    if (dist > 4.6) ang = 0.22;
    else if (dist > 3.2) ang = 0.6;
    else if (dist > 2.4) ang = 1.05;
    else ang = 1.45;
    if (enCastLaser && dist < 4.0) ang = 1.55;
    let dir = V.rot(toE, ang * S.orbit);
    let tx = me.x + dir.x * 2.2, tz = me.z + dir.z * 2.2;
    if (!okSpot(tx, tz, obs, me.radius, half)) {
      S.orbit = -S.orbit;
      dir = V.rot(toE, ang * S.orbit);
      tx = me.x + dir.x * 2.2; tz = me.z + dir.z * 2.2;
      if (!okSpot(tx, tz, obs, me.radius, half)) dir = toE;
    }
    api.move(dir.x, dir.z);
  } else if (laserSoon && clearLine && dist > 5.5) {
    // seek cover while approaching
    let best = null, bestScore = -1e9;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const dx = Math.sin(a), dz = Math.cos(a);
      for (const r of [2.6, 5.0]) {
        const cx = me.x + dx * r, cz = me.z + dz * r;
        if (!okSpot(cx, cz, obs, me.radius, half)) continue;
        if (segBlocked(me.x, me.z, cx, cz, obs, me.radius * 0.85)) continue;
        const hidden = segBlocked(cx, cz, en.x, en.z, obs, 0.25);
        const de = Math.hypot(cx - en.x, cz - en.z);
        let sc = -de * 1.0 + (hidden ? 16 : 0);
        // small preference for keeping momentum
        sc += (dx * me.vx + dz * me.vz) * 0.15;
        // avoid hugging walls
        const wall = Math.min(half - Math.abs(cx), half - Math.abs(cz));
        if (wall < 3) sc -= (3 - wall) * 1.5;
        if (sc > bestScore) { bestScore = sc; best = { x: cx, z: cz, hidden }; }
      }
    }
    if (best && best.hidden) {
      api.move(best.x - me.x, best.z - me.z);
      if (p.t - S.lastSay > 6) { S.lastSay = p.t; api.say("behind the rock, squid"); }
    } else {
      // no cover: rush with a lateral bias
      const toE = V.toward(me, en);
      const d = V.rot(toE, 0.45 * S.orbit);
      api.move(d.x, d.z);
    }
  } else {
    if (clearLine && dist < 14) {
      const toE = V.toward(me, en);
      const d = V.rot(toE, 0.18 * S.orbit);
      api.move(d.x, d.z);
    } else {
      api.moveTo(en.x, en.z);
    }
    if (p.t - S.lastSay > 8) { S.lastSay = p.t; api.say("come here."); }
  }
}
