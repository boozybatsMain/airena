const OBS_MOVE_PAD = 1.35;
const IN_PAD = 1.45;

let enemyLaserAt = -99;
let enemyBlinkAt = -99;
let enemyJumpAt = -99;
let blockedHeat = 0;
let lastDir = { x: 0, z: 0 };
let saidAt = -99;

function insideObs(x, z, obs, pad) {
  for (const o of obs) {
    if (Math.abs(x - o.x) < o.hx + pad && Math.abs(z - o.z) < o.hz + pad) return true;
  }
  return false;
}

function segBlocked(ax, az, bx, bz, obs, pad) {
  const dx = bx - ax, dz = bz - az;
  for (const o of obs) {
    const minx = o.x - o.hx - pad, maxx = o.x + o.hx + pad;
    const minz = o.z - o.hz - pad, maxz = o.z + o.hz + pad;
    let t0 = 0, t1 = 1;
    if (Math.abs(dx) < 1e-9) {
      if (ax < minx || ax > maxx) continue;
    } else {
      let ta = (minx - ax) / dx, tb = (maxx - ax) / dx;
      if (ta > tb) { const tmp = ta; ta = tb; tb = tmp; }
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
      if (t0 > t1) continue;
    }
    if (Math.abs(dz) < 1e-9) {
      if (az < minz || az > maxz) continue;
    } else {
      let ta = (minz - az) / dz, tb = (maxz - az) / dz;
      if (ta > tb) { const tmp = ta; ta = tb; tb = tmp; }
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
      if (t0 > t1) continue;
    }
    return true;
  }
  return false;
}

function predictEnemy(e, dt, half, damp) {
  const k = damp === undefined ? 0.85 : damp;
  const lim = half - 1.1;
  let x = e.x + e.vx * dt * k;
  let z = e.z + e.vz * dt * k;
  if (x > lim) x = lim; if (x < -lim) x = -lim;
  if (z > lim) z = lim; if (z < -lim) z = -lim;
  return { x, z };
}

function angDiff(heading, dx, dz) {
  let a = Math.atan2(dx, dz) - heading;
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

function chargeIntercept(s, e, half) {
  let d0 = Math.hypot(e.x - s.x, e.z - s.z);
  let tt = 0.3 + Math.max(0, d0 - 2.2) / 15;
  let aim = predictEnemy(e, tt, half, 0.8);
  for (let i = 0; i < 3; i++) {
    const d = Math.hypot(aim.x - s.x, aim.z - s.z);
    tt = 0.3 + Math.max(0, d - 2.2) / 15;
    aim = predictEnemy(e, tt, half, 0.8);
  }
  return aim;
}

function pickGoal(p, api, ex, ez) {
  const s = p.self, obs = p.arena.obstacles;
  if (!segBlocked(s.x, s.z, ex, ez, obs, OBS_MOVE_PAD)) return { x: ex, z: ez };
  let path = null;
  try { path = api.pathTo(ex, ez); } catch (err) { path = null; }
  if (path && path.points && path.points.length) {
    for (const pt of path.points) {
      const d = Math.hypot(pt.x - s.x, pt.z - s.z);
      if (d > 1.2) return { x: pt.x, z: pt.z };
    }
    const last = path.points[path.points.length - 1];
    return { x: last.x, z: last.z };
  }
  return { x: ex, z: ez };
}

function steer(p, api, goal, ex, ez, threat) {
  const s = p.self, obs = p.arena.obstacles, half = p.arena.half;
  const cands = [];
  cands.push({ x: goal.x, z: goal.z, prime: true });
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8;
    const sx = Math.sin(a), sz = Math.cos(a);
    cands.push({ x: s.x + sx * 3.0, z: s.z + sz * 3.0 });
    cands.push({ x: s.x + sx * 6.0, z: s.z + sz * 6.0 });
  }
  let best = null, bestScore = 1e9;
  for (const c of cands) {
    let cx = c.x, cz = c.z;
    const lim = half - 1.5;
    if (cx > lim || cx < -lim || cz > lim || cz < -lim) {
      if (!c.prime) continue;
      cx = Math.max(-lim, Math.min(lim, cx));
      cz = Math.max(-lim, Math.min(lim, cz));
    }
    if (!c.prime) {
      if (insideObs(cx, cz, obs, IN_PAD)) continue;
      if (segBlocked(s.x, s.z, cx, cz, obs, OBS_MOVE_PAD)) continue;
    }
    let score = Math.hypot(cx - goal.x, cz - goal.z);
    if (threat > 0) {
      const open = !segBlocked(cx, cz, ex, ez, obs, 0);
      if (open) score += threat; else score -= 1.2;
    }
    const dvx = cx - s.x, dvz = cz - s.z;
    const dl = Math.hypot(dvx, dvz) || 1;
    if (lastDir.x * (dvx / dl) + lastDir.z * (dvz / dl) > 0.7) score -= 0.7;
    if (score < bestScore) { bestScore = score; best = { x: cx, z: cz }; }
  }
  if (!best) best = { x: goal.x, z: goal.z };
  let dx = best.x - s.x, dz = best.z - s.z;
  const l = Math.hypot(dx, dz);
  if (l < 0.05) { api.stop(); lastDir = { x: 0, z: 0 }; return; }
  dx /= l; dz /= l;
  lastDir = { x: dx, z: dz };
  api.move(dx, dz);
}

function think(p, api) {
  const s = p.self, e = p.enemy;
  if (!s.alive) return;
  const T = p.t, obs = p.arena.obstacles, half = p.arena.half;

  for (const ev of p.events) {
    if (ev.type === 'enemyStarted') {
      if (ev.skill === 'laser') enemyLaserAt = T;
      else if (ev.skill === 'blink') enemyBlinkAt = T;
      else if (ev.skill === 'jump') enemyJumpAt = T;
    } else if (ev.type === 'blocked') {
      blockedHeat += 1;
    }
  }
  blockedHeat *= 0.92;

  if (!e || !e.alive) { api.stop(); return; }

  const dist = e.dist;
  const casting = s.casting;

  // ---- while committed to something, keep aim and pre-position ----
  if (casting) {
    const c = casting;
    if (c.skill === 'smash') {
      const rem = c.phase === 'windup' ? Math.max(0, c.remaining || 0.15) : 0;
      const pe = predictEnemy(e, rem, half, 0.9);
      api.faceAt(pe.x, pe.z);
      if (dist > 2.0) api.move(e.x - s.x, e.z - s.z); else api.stop();
      return;
    }
    if (c.skill === 'charge') {
      if (c.phase === 'windup') {
        const aim = chargeIntercept(s, e, half);
        api.faceAt(aim.x, aim.z);
      } else {
        api.faceAt(e.x, e.z);
        if (c.phase === 'recover') api.move(e.x - s.x, e.z - s.z);
      }
      return;
    }
    api.faceAt(e.x, e.z);
    return;
  }

  if (s.stunned || s.airborne) {
    api.faceAt(e.x, e.z);
    return;
  }

  // ---- threat model ----
  const laserRemain = 2.2 - (T - enemyLaserAt);
  const blinkRemain = 3.933 - (T - enemyBlinkAt);
  const enemyCastingLaser = !!(e.casting && e.casting.skill === 'laser' && e.casting.telegraph);
  const losOpen = !segBlocked(s.x, s.z, e.x, e.z, obs, 0);

  let threat = 0;
  if (dist > 4.6) {
    if (enemyCastingLaser) threat = 10;
    else if (laserRemain <= 0.35 && dist > 6.0) threat = 3.2;
  }

  // ---- offense ----
  const smashReady = api.ready('smash');
  const chargeReady = api.ready('charge');

  const peSmash = predictEnemy(e, 0.3, half, 0.9);
  const myx = s.x + s.vx * 0.22, myz = s.z + s.vz * 0.22;
  const dSmash = Math.hypot(peSmash.x - myx, peSmash.z - myz);
  const angS = angDiff(s.heading, peSmash.x - myx, peSmash.z - myz);

  let enemyGrounded = !e.airborne;
  if (e.casting && e.casting.skill === 'jump') enemyGrounded = false;

  const smashOK = smashReady && enemyGrounded && !e.invulnerable &&
    dSmash <= 4.75 && Math.abs(angS) < 1.35 &&
    !segBlocked(s.x, s.z, e.x, e.z, obs, 0);

  if (smashOK) {
    api.faceAt(peSmash.x, peSmash.z);
    api.use('smash');
    if (dist > 2.2) api.move(e.x - s.x, e.z - s.z); else api.stop();
    return;
  }

  if (chargeReady && !e.invulnerable) {
    const aim = chargeIntercept(s, e, half);
    const daim = Math.hypot(aim.x - s.x, aim.z - s.z);
    const clear = !segBlocked(s.x, s.z, aim.x, aim.z, obs, 0.55);
    const ang = Math.abs(angDiff(s.heading, aim.x - s.x, aim.z - s.z));
    const alignable = ang < 1.0;
    let want = false;
    if (clear && daim >= 2.0 && daim <= 12.2 && alignable) {
      if (enemyCastingLaser) want = true;             // interrupt the beam
      else if (e.stunned || e.airborne) want = true;  // free hit
      else if (dist > 4.6) want = true;               // gap close
      else if (blinkRemain > 0.5 && dist > 2.6) want = true;
    }
    if (want) {
      api.faceAt(aim.x, aim.z);
      api.use('charge');
      return;
    }
    if (clear && daim >= 2.0 && daim <= 12.2 && !alignable && dist > 4.6) {
      // turn toward the intercept so we can commit next thought
      api.faceAt(aim.x, aim.z);
      steer(p, api, { x: aim.x, z: aim.z }, e.x, e.z, threat);
      return;
    }
  }

  // ---- facing ----
  const peF = predictEnemy(e, 0.18, half, 0.9);
  api.faceAt(peF.x, peF.z);

  // ---- movement ----
  let goal = pickGoal(p, api, e.x, e.z);

  if (blockedHeat > 2.5) {
    const side = api.rand() < 0.5 ? 1 : -1;
    const dxg = goal.x - s.x, dzg = goal.z - s.z;
    const l = Math.hypot(dxg, dzg) || 1;
    goal = { x: s.x + (-dzg / l) * side * 4 + (dxg / l) * 1.5, z: s.z + (dxg / l) * side * 4 + (dzg / l) * 1.5 };
    blockedHeat *= 0.5;
  }

  // stay glued in melee, no cover detours
  if (dist <= 4.6) {
    let tx = e.x, tz = e.z;
    if (dist < 2.1) {
      // slight orbit rather than shoving straight in
      const ox = -(e.z - s.z), oz = (e.x - s.x);
      tx = e.x + ox * 0.35; tz = e.z + oz * 0.35;
    }
    steer(p, api, { x: tx, z: tz }, e.x, e.z, 0);
    return;
  }

  steer(p, api, goal, e.x, e.z, threat);

  if (T - saidAt > 7 && dist < 8 && api.rand() < 0.06) {
    saidAt = T;
    const lines = ['no beam outruns arms.', 'come closer, little squid.', 'ink does not stop 205 hp.'];
    api.say(lines[Math.floor(api.rand() * lines.length) % lines.length]);
  }
}
