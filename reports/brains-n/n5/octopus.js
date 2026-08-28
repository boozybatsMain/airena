function think(p, api) {
  const s = p.self, e = p.enemy;
  const obs = p.arena.obstacles, half = p.arena.half;

  for (const ev of p.events) {
    if (ev.type === 'enemyStarted') {
      if (ev.skill === 'charge') M.lastCharge = p.t;
      else if (ev.skill === 'smash') M.lastSmash = p.t;
      else if (ev.skill === 'jump') M.lastJump = p.t;
    } else if (ev.type === 'damaged' && ev.skill === 'charge') {
      M.lastCharge = p.t - 0.6;
    } else if (ev.type === 'damaged' && ev.skill === 'smash') {
      M.lastSmash = p.t - 0.3;
    }
  }

  if (!s.alive || !e.alive) return;

  const dist = e.dist;
  const chargeCD = Math.max(0, 4.033 - (p.t - M.lastCharge));
  const chargeReady = chargeCD <= 0.08;
  const blinkReady = api.ready('blink');
  const jumpReady = api.ready('jump');

  // ---------- facing ----------
  let lead = 0.22;
  if (s.casting && s.casting.skill === 'laser') lead = s.casting.remaining;
  let lx = e.x + e.vx * Math.min(lead, 0.7);
  let lz = e.z + e.vz * Math.min(lead, 0.7);
  if (Math.abs(lx) > half - 0.3) lx = Math.sign(lx) * (half - 0.3);
  if (Math.abs(lz) > half - 0.3) lz = Math.sign(lz) * (half - 0.3);
  api.faceAt(lx, lz);

  if (s.stunned) return;

  // ---------- threat analysis ----------
  const threat = chargeThreat(p);
  const smashWind = (e.casting && e.casting.skill === 'smash' && e.casting.telegraph) ? e.casting.remaining : -1;

  // time until they could touch us
  let ttrCharge = 99;
  if (e.casting && e.casting.skill === 'charge') {
    const wu = (e.casting.phase === 'windup') ? e.casting.remaining : 0;
    ttrCharge = wu + Math.max(0, dist - 2.25) / 15;
  } else if (chargeReady) {
    ttrCharge = 0.3 + Math.max(0, dist - 2.25) / 15;
  }
  let ttrSmash = 99;
  if (smashWind >= 0) ttrSmash = (dist <= 5.4) ? smashWind : 99;
  else ttrSmash = 0.3 + Math.max(0, dist - 5.15) / 5.35;
  const timeSafe = Math.min(ttrCharge, ttrSmash);

  // =========================================================
  // 1. EMERGENCY: incoming smash
  // =========================================================
  if (smashWind >= 0 && dist < 6.4 && !s.busy && !s.airborne) {
    if (smashWind > 0.14 && jumpReady) {
      const away = V.away({ x: s.x, z: s.z }, { x: e.x, z: e.z });
      const md = safeStep(p, away);
      api.move(md.x, md.z);
      api.use('jump');
      M.prev = md;
      return;
    }
    if (blinkReady) {
      const bd = pickBlink(p, V.away({ x: s.x, z: s.z }, { x: e.x, z: e.z }));
      api.use('blink', bd.x, bd.z);
      api.move(bd.x, bd.z);
      M.prev = bd;
      return;
    }
  }

  // =========================================================
  // 2. EMERGENCY: incoming charge
  // =========================================================
  if (threat) {
    const sgn = (Math.abs(threat.lat) > 0.35) ? Math.sign(threat.lat) : sideWithRoom(p, threat.dir);
    const perp = { x: -threat.dir.z * sgn, z: threat.dir.x * sgn };
    const committed = (threat.phase === 'dash');
    if (committed && blinkReady && !s.busy && !s.airborne && threat.along > -1.5) {
      const bd = pickBlink(p, perp);
      api.use('blink', bd.x, bd.z);
      api.move(bd.x, bd.z);
      M.prev = bd;
      return;
    }
    // strafe out of the lane, biased slightly backwards
    let dodge = V.norm({
      x: perp.x * 1.0 - threat.dir.x * 0.35,
      z: perp.z * 1.0 - threat.dir.z * 0.35
    });
    const md = safeStep(p, dodge);
    api.move(md.x, md.z);
    M.prev = md;
    if (committed) return;
  }

  // =========================================================
  // 3. LASER
  // =========================================================
  const ang = Math.abs(V.angleTo(s.heading, V.toward({ x: s.x, z: s.z }, { x: lx, z: lz })));
  const canSeeAim = e.visible && api.los(lx, lz);
  if (!s.busy && !s.airborne && api.ready('laser') && canSeeAim &&
      dist < 22.5 && ang < 1.05 && timeSafe > 0.74) {
    api.use('laser');
    M.shots = (M.shots || 0) + 1;
  }

  // =========================================================
  // 4. MOVEMENT
  // =========================================================
  let desired;
  if (!chargeReady) desired = 8.8;
  else if (blinkReady) desired = 10.6;
  else desired = 15.6;
  if (smashWind >= 0) desired = Math.max(desired, 8.0);
  if (dist < 4.0) desired = Math.max(desired, 9.0);

  if (!e.visible && dist > 5.5) {
    const dir = V.away({ x: e.x, z: e.z }, { x: s.x, z: s.z });
    let tx = e.x + dir.x * Math.min(desired, dist);
    let tz = e.z + dir.z * Math.min(desired, dist);
    tx = Math.max(-half + 1.6, Math.min(half - 1.6, tx));
    tz = Math.max(-half + 1.6, Math.min(half - 1.6, tz));
    api.moveTo(tx, tz);
    return;
  }

  const mv = chooseMove(p, desired);
  if (mv) {
    api.move(mv.x, mv.z);
    M.prev = mv;
  } else {
    api.moveTo(0, 0);
    M.prev = null;
  }
}

// ---------------------------------------------------------------
const M = { lastCharge: -99, lastSmash: -99, lastJump: -99, prev: null, shots: 0 };

function boxSeg(ax, az, bx, bz, b, pad) {
  const minx = b.x - b.hx - pad, maxx = b.x + b.hx + pad;
  const minz = b.z - b.hz - pad, maxz = b.z + b.hz + pad;
  const dx = bx - ax, dz = bz - az;
  let t0 = 0, t1 = 1;
  if (Math.abs(dx) < 1e-9) { if (ax < minx || ax > maxx) return false; }
  else {
    let ta = (minx - ax) / dx, tb = (maxx - ax) / dx;
    if (ta > tb) { const t = ta; ta = tb; tb = t; }
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  if (Math.abs(dz) < 1e-9) { if (az < minz || az > maxz) return false; }
  else {
    let ta = (minz - az) / dz, tb = (maxz - az) / dz;
    if (ta > tb) { const t = ta; ta = tb; tb = t; }
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  return true;
}

function clearSeg(obs, ax, az, bx, bz, pad) {
  for (const b of obs) if (boxSeg(ax, az, bx, bz, b, pad)) return false;
  return true;
}

function chargeThreat(p) {
  const s = p.self, e = p.enemy;
  if (!e.casting || e.casting.skill !== 'charge') return null;
  let dir;
  if (e.casting.phase === 'dash' && e.speed > 3) dir = V.norm({ x: e.vx, z: e.vz });
  else dir = V.fromHeading(e.heading);
  if (dir.x === 0 && dir.z === 0) return null;
  const rx = s.x - e.x, rz = s.z - e.z;
  const along = rx * dir.x + rz * dir.z;
  const lat = rx * (-dir.z) + rz * dir.x;
  if (along > 14.5 || along < -2.0) return null;
  if (Math.abs(lat) > 4.2) return null;
  return { dir, along, lat, phase: e.casting.phase };
}

function sideWithRoom(p, dir) {
  const s = p.self, half = p.arena.half, obs = p.arena.obstacles;
  let best = 1, bestSc = -1e9;
  for (const sg of [1, -1]) {
    const px = s.x + (-dir.z * sg) * 6, pz = s.z + (dir.x * sg) * 6;
    let sc = Math.min(half - Math.abs(px), half - Math.abs(pz));
    if (!clearSeg(obs, s.x, s.z, px, pz, s.radius + 0.2)) sc -= 5;
    if (sc > bestSc) { bestSc = sc; best = sg; }
  }
  return best;
}

function pickBlink(p, prefer) {
  const s = p.self, half = p.arena.half;
  let best = prefer, bestSc = -1e9;
  const base = V.heading(prefer);
  for (let i = -2; i <= 2; i++) {
    const a = base + i * 0.42;
    const d = V.fromHeading(a);
    const px = s.x + d.x * 7.2, pz = s.z + d.z * 7.2;
    let sc = Math.min(half - Math.abs(px), half - Math.abs(pz)) * 1.0;
    sc -= Math.abs(i) * 0.7;
    const nd = Math.hypot(px - p.enemy.x, pz - p.enemy.z);
    sc += Math.min(nd, 14) * 0.45;
    if (sc > bestSc) { bestSc = sc; best = d; }
  }
  return best;
}

function safeStep(p, dir) {
  const s = p.self, half = p.arena.half, obs = p.arena.obstacles;
  const base = V.heading(dir);
  let best = dir, bestSc = -1e9;
  for (let i = -4; i <= 4; i++) {
    const a = base + i * 0.32;
    const d = V.fromHeading(a);
    const px = s.x + d.x * 3.0, pz = s.z + d.z * 3.0;
    if (Math.abs(px) > half - 1.1 || Math.abs(pz) > half - 1.1) continue;
    if (!clearSeg(obs, s.x, s.z, px, pz, s.radius + 0.25)) continue;
    let sc = -Math.abs(i) * 0.6;
    sc += Math.min(half - Math.abs(px), half - Math.abs(pz)) * 0.3;
    if (sc > bestSc) { bestSc = sc; best = d; }
  }
  return best;
}

function chooseMove(p, desired) {
  const s = p.self, e = p.enemy, obs = p.arena.obstacles, half = p.arena.half;
  const casting = !!(s.casting && s.casting.skill === 'laser');
  const look = casting ? 1.7 : 3.0;
  let best = null, bestSc = -1e9;
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    const d = V.fromHeading(a);
    const nx = s.x + d.x * look, nz = s.z + d.z * look;
    if (Math.abs(nx) > half - 1.15 || Math.abs(nz) > half - 1.15) continue;
    if (!clearSeg(obs, s.x, s.z, nx, nz, s.radius + 0.25)) continue;

    let sc = 0;
    const nd = Math.hypot(nx - e.x, nz - e.z);
    sc -= Math.abs(nd - desired) * 2.1;

    // stay away from walls / corners
    const wm = Math.min(half - Math.abs(nx), half - Math.abs(nz));
    sc += Math.min(wm, 8) * 0.7;

    // long probe: don't march into a dead end
    const fx = s.x + d.x * (look + 3.5), fz = s.z + d.z * (look + 3.5);
    if (Math.abs(fx) > half - 1.1 || Math.abs(fz) > half - 1.1) sc -= 2.2;
    if (!clearSeg(obs, nx, nz, fx, fz, s.radius + 0.25)) sc -= 1.6;

    // keep a firing line
    const vis = clearSeg(obs, nx, nz, e.x, e.z, 0);
    sc += vis ? 3.0 : -2.5;

    // smoothness
    if (M.prev) sc += (d.x * M.prev.x + d.z * M.prev.z) * 1.5;

    // slight preference for orbiting rather than pure retreat
    const toE = V.toward({ x: s.x, z: s.z }, { x: e.x, z: e.z });
    const tang = Math.abs(d.x * -toE.z + d.z * toE.x);
    sc += tang * 0.8;

    if (sc > bestSc) { bestSc = sc; best = d; }
  }
  return best;
}
