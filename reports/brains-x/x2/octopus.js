function think(p, api) {
  const s = p.self, e = p.enemy;
  if (!s || !e || !s.alive) return;

  // ---- digest events -------------------------------------------------
  let committed = false;
  for (const ev of p.events) {
    if (ev.type === 'enemyStarted') {
      if (ev.skill === 'charge') M.lastCharge = p.t;
      else if (ev.skill === 'smash') M.lastSmash = p.t;
      else if (ev.skill === 'jump') M.lastJump = p.t;
    } else if (ev.type === 'enemyCommitted') {
      committed = true;
      if (ev.skill === 'charge') M.lastCharge = p.t - 0.3;
    } else if (ev.type === 'blocked') {
      if (p.t - M.lastFlip > 0.6) { M.side = -M.side; M.lastFlip = p.t; }
    } else if (ev.type === 'damaged') {
      M.lastHit = p.t;
    }
  }

  const dist = e.dist;
  const chargeReady = (p.t - M.lastCharge) >= 3.95;
  const smashReady = (p.t - M.lastSmash) >= 1.25;

  if (s.airborne || s.stunned) {
    // can only turn
    api.faceAt(e.x, e.z);
    return;
  }

  // ---- facing (lead the shot) ----------------------------------------
  let lead = 0.45;
  if (s.casting && s.casting.skill === 'laser' && s.casting.telegraph) {
    lead = Math.max(0, s.casting.remaining);
  }
  let ax = e.x + e.vx * lead * 0.85;
  let az = e.z + e.vz * lead * 0.85;
  if (blockedSeg(p, s.x, s.z, ax, az, 0) && !blockedSeg(p, s.x, s.z, e.x, e.z, 0)) {
    ax = e.x; az = e.z;
  }
  api.faceAt(ax, az);

  let acted = false;

  // ---- charge dodge ---------------------------------------------------
  const ec = e.casting;
  const charging = ec && ec.skill === 'charge';
  if (charging) {
    const imminent = ec.phase === 'dash' || committed ||
      (ec.phase === 'windup' && ec.remaining <= 0.15);
    if (imminent) {
      const d = V.fromHeading(e.heading);
      const rx = s.x - e.x, rz = s.z - e.z;
      const along = rx * d.x + rz * d.z;
      const lat = rx * d.z - rz * d.x;
      const threat = along > -1.5 && along < 15 && Math.abs(lat) < 4.2;
      if (threat) {
        let sign = lat >= 0 ? 1 : -1;
        let px = d.z * sign, pz = -d.x * sign;
        let lx = s.x + px * 7.4, lz = s.z + pz * 7.4;
        if (Math.abs(lx) > 18.5 || Math.abs(lz) > 18.5) {
          const qx = -px, qz = -pz;
          const l2x = s.x + qx * 7.4, l2z = s.z + qz * 7.4;
          if (Math.abs(l2x) <= 18.5 && Math.abs(l2z) <= 18.5) { px = qx; pz = qz; }
        }
        // bias slightly backwards
        const bx = px * 1.0 - d.x * 0.35, bz = pz * 1.0 - d.z * 0.35;
        if (!acted && api.ready('blink') && !s.busy) {
          api.use('blink', bx, bz);
          api.move(bx, bz);
          acted = true;
        } else {
          api.move(px, pz);
          M.prev = { x: px, z: pz };
          acted = true;
        }
      }
    }
  }

  // ---- smash dodge (hop over the sweep) -------------------------------
  if (!acted && ec && ec.skill === 'smash' && ec.telegraph && dist < 6.6 &&
      !s.busy && api.ready('jump')) {
    const awx = s.x - e.x, awz = s.z - e.z;
    const n = Math.hypot(awx, awz) || 1;
    api.move(awx / n, awz / n);
    api.use('jump');
    M.prev = { x: awx / n, z: awz / n };
    acted = true;
  }

  // ---- blink out of melee when the charge is spent ---------------------
  if (!acted && !chargeReady && !s.busy && api.ready('blink') && dist < 6.2) {
    let awx = s.x - e.x, awz = s.z - e.z;
    const n = Math.hypot(awx, awz) || 1;
    awx /= n; awz /= n;
    let lx = s.x + awx * 7.4, lz = s.z + awz * 7.4;
    if (Math.abs(lx) > 18.3 || Math.abs(lz) > 18.3) {
      const rot = V.rot({ x: awx, z: awz }, M.side * 1.1);
      const l2x = s.x + rot.x * 7.4, l2z = s.z + rot.z * 7.4;
      if (Math.abs(l2x) <= 18.3 && Math.abs(l2z) <= 18.3) { awx = rot.x; awz = rot.z; }
    }
    api.use('blink', awx, awz);
    acted = true;
  }

  // ---- laser ----------------------------------------------------------
  const opening = e.stunned || e.airborne ||
    (ec && ec.skill === 'smash' && ec.phase === 'recover') ||
    (ec && ec.skill === 'jump' && ec.phase === 'air');
  const safeCharge = dist > 15.5 || !chargeReady;
  const safeSmash = dist > 7.6 || !smashReady;
  const canFire = !acted && !s.busy && api.ready('laser') && e.visible &&
    dist <= 23.5 && !e.invulnerable;
  if (canFire && (opening || (safeCharge && safeSmash))) {
    api.use('laser');
    acted = true;
  }

  // ---- movement --------------------------------------------------------
  if (!acted || !M.moveIssued) {
    let target;
    if (!chargeReady) target = 9.0;
    else target = 16.0;
    if (smashReady && target < 8.0) target = 8.0;
    if (dist > 26) target = 17;

    if (!e.visible && dist > 5) {
      // reacquire line of sight
      const tw = V.toward(e, s);
      const px = e.x + tw.x * 8.5, pz = e.z + tw.z * 8.5;
      const path = api.pathTo(px, pz);
      if (path) api.moveTo(px, pz);
      else api.moveTo(e.x, e.z);
    } else {
      const dir = pickDir(p, target);
      api.move(dir.x, dir.z);
      M.prev = dir;
    }
  }
  M.moveIssued = true;

  if (p.t - M.lastSay > 9 && api.rand() < 0.35) {
    M.lastSay = p.t;
    api.say(dist < 8 ? "too close, ape" : "eight arms, one beam");
  }
}

const M = {
  lastCharge: -99, lastSmash: -99, lastJump: -99, lastHit: -99,
  lastFlip: -99, lastSay: 0, side: 1, prev: { x: 0, z: 1 }, moveIssued: false
};

function segHit(ax, az, bx, bz, minx, minz, maxx, maxz) {
  let tmin = 0, tmax = 1;
  const dx = bx - ax, dz = bz - az;
  if (Math.abs(dx) < 1e-9) { if (ax < minx || ax > maxx) return false; }
  else {
    let t1 = (minx - ax) / dx, t2 = (maxx - ax) / dx;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return false;
  }
  if (Math.abs(dz) < 1e-9) { if (az < minz || az > maxz) return false; }
  else {
    let t1 = (minz - az) / dz, t2 = (maxz - az) / dz;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return false;
  }
  return true;
}

function blockedSeg(p, ax, az, bx, bz, pad) {
  const obs = p.arena.obstacles;
  for (let i = 0; i < obs.length; i++) {
    const o = obs[i];
    if (segHit(ax, az, bx, bz, o.x - o.hx - pad, o.z - o.hz - pad,
      o.x + o.hx + pad, o.z + o.hz + pad)) return true;
  }
  return false;
}

function pickDir(p, target) {
  const s = p.self, e = p.enemy;
  let best = M.prev, bestScore = -1e9;
  const step = 3.0;
  for (let i = 0; i < 32; i++) {
    const a = i * Math.PI / 16;
    const dx = Math.sin(a), dz = Math.cos(a);
    const cx = s.x + dx * step, cz = s.z + dz * step;
    let sc = 0;
    if (Math.abs(cx) > 18.4 || Math.abs(cz) > 18.4) sc -= 60;
    if (blockedSeg(p, s.x, s.z, cx, cz, 1.15)) sc -= 60;
    const dE = Math.hypot(cx - e.x, cz - e.z);
    sc -= Math.abs(dE - target) * 1.3;
    if (dE < 5.0) sc -= (5.0 - dE) * 4;
    if (blockedSeg(p, cx, cz, e.x, e.z, 0)) sc -= 4.5;
    const wm = Math.min(18.4 - Math.abs(cx), 18.4 - Math.abs(cz));
    if (wm < 5.5) sc -= (5.5 - wm) * 1.4;
    sc += (dx * M.prev.x + dz * M.prev.z) * 1.8;
    if (sc > bestScore) { bestScore = sc; best = { x: dx, z: dz }; }
  }
  return best;
}
