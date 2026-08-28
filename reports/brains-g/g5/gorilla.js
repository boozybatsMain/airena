function think(p, api) {
  const s = p.self, e = p.enemy;
  if (!s || !s.alive) return;

  // ---- event bookkeeping ----
  for (const ev of p.events) {
    if (ev.type === 'enemyStarted') {
      if (ev.skill === 'laser') M.lastLaser = p.t;
      else if (ev.skill === 'blink') M.lastBlink = p.t;
      else if (ev.skill === 'jump') M.lastJump = p.t;
    } else if (ev.type === 'blocked') {
      M.stuckUntil = p.t + 0.7;
    } else if (ev.type === 'dealt') {
      M.lastHit = p.t;
    } else if (ev.type === 'damaged') {
      M.lastHurt = p.t;
    }
  }

  const d = e.dist;
  const laserThreat = !!(e.casting && e.casting.skill === 'laser' && e.casting.telegraph);
  const laserRemain = laserThreat ? e.casting.remaining : 99;

  // ---- can't act ----
  if (s.stunned) { api.faceAt(e.x, e.z); return; }
  if (s.airborne) { api.faceAt(e.x, e.z); return; }

  // ---- already committed to something ----
  if (s.casting) {
    const c = s.casting;
    if (c.skill === 'smash') {
      const t = Math.max(0, c.remaining || 0);
      const fx = e.x + e.vx * Math.min(t, 0.3), fz = e.z + e.vz * Math.min(t, 0.3);
      api.faceAt(fx, fz);
      if (c.phase === 'windup') api.move(fx - s.x, fz - s.z);
      return;
    }
    if (c.skill === 'charge') {
      if (c.phase === 'windup') {
        const aim = chargeAim(p, api, s, e);
        if (aim) api.face(aim.x - s.x, aim.z - s.z);
        else api.faceAt(e.x, e.z);
      } else {
        api.faceAt(e.x, e.z);
      }
      return;
    }
    api.faceAt(e.x, e.z);
    return;
  }

  // ---- facing: almost always at the enemy (lead a little) ----
  const faceX = e.x + e.vx * 0.18, faceZ = e.z + e.vz * 0.18;
  api.faceAt(faceX, faceZ);

  const enemyAirRemain = (e.casting && e.casting.phase === 'air') ? e.casting.remaining : 0;

  // ---- SMASH: highest priority when it can land ----
  if (api.ready('smash')) {
    const tl = 0.28;
    const ex = e.x + e.vx * tl, ez = e.z + e.vz * tl;
    const myx = s.x + s.vx * tl * 0.5, myz = s.z + s.vz * tl * 0.5;
    const pd = Math.hypot(ex - myx, ez - myz);
    const willBeAir = enemyAirRemain > tl + 0.05;
    const inv = e.invulnerable && d < 2.0;
    if (pd < 3.95 && !willBeAir && !inv) {
      api.use('smash');
      api.faceAt(ex, ez);
      api.move(ex - s.x, ez - s.z);
      return;
    }
  }

  // ---- CHARGE: gap closer, interrupter, stun setup ----
  if (api.ready('charge') && e.visible && !e.invulnerable && enemyAirRemain < 0.25) {
    const aim = chargeAim(p, api, s, e);
    if (aim) {
      const dx = aim.x - s.x, dz = aim.z - s.z;
      const adist = Math.hypot(dx, dz);
      const err = Math.abs(V.angleTo(s.heading, { x: dx, z: dz }));
      const clear = !segClear(p, s.x, s.z, aim.x, aim.z, 0.35);
      const good = adist > 2.2 && adist < 11.0 && clear;
      const worth = laserThreat || d > 4.2 || (p.t - M.lastHurt < 1.0);
      if (good && worth && err < 0.85) {
        api.use('charge');
        api.face(dx, dz);
        return;
      }
      if (good && worth) {
        // turn onto the line first, keep pressing
        api.face(dx, dz);
      }
    }
  }

  // ---- movement ----
  const tgt = moveTarget(p, api, s, e, d, laserThreat, laserRemain);
  if (tgt.kind === 'dir') api.move(tgt.x, tgt.z);
  else api.moveTo(tgt.x, tgt.z);

  if (p.t - M.lastSay > 6.5) {
    M.lastSay = p.t;
    api.say(d < 5 ? "close enough" : "nowhere to swim, squid");
  }
}

const M = {
  lastLaser: -99, lastBlink: -99, lastJump: -99,
  lastHit: -99, lastHurt: -99, lastSay: -99,
  stuckUntil: -99, evadeSign: 1, evadeFlip: -99
};

function segHitsBox(ax, az, bx, bz, o, pad) {
  const dx = bx - ax, dz = bz - az;
  let t0 = 0, t1 = 1;
  const minx = o.x - o.hx - pad, maxx = o.x + o.hx + pad;
  const minz = o.z - o.hz - pad, maxz = o.z + o.hz + pad;
  if (Math.abs(dx) < 1e-9) { if (ax < minx || ax > maxx) return false; }
  else {
    let ta = (minx - ax) / dx, tb = (maxx - ax) / dx;
    if (ta > tb) { const q = ta; ta = tb; tb = q; }
    if (ta > t0) t0 = ta; if (tb < t1) t1 = tb;
    if (t0 > t1) return false;
  }
  if (Math.abs(dz) < 1e-9) { if (az < minz || az > maxz) return false; }
  else {
    let ta = (minz - az) / dz, tb = (maxz - az) / dz;
    if (ta > tb) { const q = ta; ta = tb; tb = q; }
    if (ta > t0) t0 = ta; if (tb < t1) t1 = tb;
    if (t0 > t1) return false;
  }
  return true;
}

// true when the segment is BLOCKED by some obstacle
function segClear(p, ax, az, bx, bz, pad) {
  for (const o of p.arena.obstacles) if (segHitsBox(ax, az, bx, bz, o, pad)) return true;
  return false;
}

function inBox(p, x, z, pad) {
  for (const o of p.arena.obstacles) {
    if (Math.abs(x - o.x) < o.hx + pad && Math.abs(z - o.z) < o.hz + pad) return true;
  }
  return false;
}

function chargeAim(p, api, s, e) {
  const t0 = 0.28;
  const base = { x: e.x + e.vx * t0, z: e.z + e.vz * t0 };
  let aim = V.lead({ x: s.x, z: s.z }, base, { x: e.vx, z: e.vz }, 15);
  if (!aim || !isFinite(aim.x) || !isFinite(aim.z)) aim = base;
  let dx = aim.x - s.x, dz = aim.z - s.z;
  const L = Math.hypot(dx, dz);
  if (L < 0.001) return null;
  if (L > 11.5) { dx = dx / L * 11.5; dz = dz / L * 11.5; }
  const ax = s.x + dx, az = s.z + dz;
  if (Math.abs(ax) > 19.4 || Math.abs(az) > 19.4) {
    const k = Math.min(19.4 / Math.max(Math.abs(ax), 0.001), 19.4 / Math.max(Math.abs(az), 0.001));
    return { x: s.x + dx * Math.min(1, k), z: s.z + dz * Math.min(1, k) };
  }
  return { x: ax, z: az };
}

function moveTarget(p, api, s, e, d, laserThreat, laserRemain) {
  // very close: press in, stay in cone range, slight orbit so we are not shoved out
  if (d < 4.2) {
    const to = V.toward({ x: s.x, z: s.z }, { x: e.x, z: e.z });
    const per = V.perp(to);
    const sgn = M.evadeSign;
    if (d < 1.9) {
      return { kind: 'dir', x: to.x * 0.35 + per.x * sgn, z: to.z * 0.35 + per.z * sgn };
    }
    return { kind: 'dir', x: to.x + per.x * sgn * 0.35, z: to.z + per.z * sgn * 0.35 };
  }

  // laser incoming: try to break the beam line, otherwise juke hard sideways
  if (laserThreat && laserRemain < 0.62 && d > 3.5) {
    if (p.t - M.evadeFlip > 0.9) { M.evadeSign = -M.evadeSign; M.evadeFlip = p.t; }
    const best = scanDirections(p, api, s, e, true);
    if (best) return { kind: 'dir', x: best.x, z: best.z };
  }

  // stuck against geometry -> use the router
  if (p.t < M.stuckUntil || !e.visible) {
    const px = clampArena(e.x + e.vx * 0.4), pz = clampArena(e.z + e.vz * 0.4);
    return { kind: 'to', x: px, z: pz };
  }

  const best = scanDirections(p, api, s, e, false);
  if (best) return { kind: 'dir', x: best.x, z: best.z };
  return { kind: 'to', x: clampArena(e.x), z: clampArena(e.z) };
}

function clampArena(v) { return Math.max(-19.2, Math.min(19.2, v)); }

function scanDirections(p, api, s, e, wantCover) {
  const reach = wantCover ? 3.6 : 3.0;
  const dnow = Math.hypot(e.x - s.x, e.z - s.z);
  const to = V.toward({ x: s.x, z: s.z }, { x: e.x, z: e.z });
  const per = V.perp(to);
  let best = null, bestScore = -1e9;
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8;
    const dir = { x: Math.sin(a), z: Math.cos(a) };
    const px = s.x + dir.x * reach, pz = s.z + dir.z * reach;
    if (Math.abs(px) > 18.8 || Math.abs(pz) > 18.8) continue;
    if (inBox(p, px, pz, 1.55)) continue;
    if (segClear(p, s.x, s.z, px, pz, 1.35)) continue;
    let score = 0;
    const dnew = Math.hypot(e.x - px, e.z - pz);
    score += (dnow - dnew) * (wantCover ? 2.0 : 6.0);
    if (wantCover) {
      if (segClear(p, e.x, e.z, px, pz, 0.1)) score += 60;
      const lat = dir.x * per.x + dir.z * per.z;
      score += lat * M.evadeSign * 8;
    } else {
      const fwd = dir.x * to.x + dir.z * to.z;
      score += fwd * 4;
      const lat = dir.x * per.x + dir.z * per.z;
      score += lat * M.evadeSign * (dnow > 8 ? 1.6 : 0.6);
    }
    // stay away from the walls
    const wallPen = Math.max(0, Math.abs(px) - 15) + Math.max(0, Math.abs(pz) - 15);
    score -= wallPen * 2.5;
    if (score > bestScore) { bestScore = score; best = dir; }
  }
  if (!best) return null;
  return best;
}
