function think(p, api) {
  const s = p.self, e = p.enemy;
  if (!s || !s.alive) return;
  if (!e) { api.stop(); return; }

  // ---- event bookkeeping ----
  for (const ev of p.events) {
    if (ev.type === 'enemyStarted') {
      if (ev.skill === 'laser') M.lastLaser = p.t;
      else if (ev.skill === 'blink') M.lastBlink = p.t;
      else if (ev.skill === 'jump') M.lastEJump = p.t;
    } else if (ev.type === 'blocked') {
      M.lastBlocked = p.t;
      M.blockCount++;
    } else if (ev.type === 'dealt') {
      if (ev.skill === 'charge') M.lastChargeHit = p.t;
    } else if (ev.type === 'missed') {
      if (ev.skill === 'smash') M.smashMiss++;
    }
  }
  if (e.casting && e.casting.skill === 'laser' && e.casting.telegraph) M.lastLaser = p.t - (e.casting.elapsed || 0);

  const obs = p.arena.obstacles;
  const half = p.arena.half;
  const dist = e.dist;

  // ---- aiming ----
  const smashAim = { x: e.x + e.vx * 0.30, z: e.z + e.vz * 0.30 };
  const chgAim = leadPoint(s, e, 0.34, 15);
  const faceP = (dist > 6 ? chgAim : smashAim);
  api.faceAt(faceP.x, faceP.z);

  const facingErr = Math.abs(V.angleTo(s.heading, V.norm({ x: chgAim.x - s.x, z: chgAim.z - s.z })));

  // ---- if committed to something, just keep steering ----
  const cast = s.casting;
  if (s.busy) {
    if (cast && cast.skill === 'charge' && cast.phase === 'windup') {
      api.faceAt(chgAim.x, chgAim.z);
      api.move(chgAim.x - s.x, chgAim.z - s.z);
      return;
    }
    if (cast && cast.skill === 'smash') {
      // shuffle into them while winding up
      api.faceAt(smashAim.x, smashAim.z);
      if (dist > 2.2) api.move(e.x - s.x, e.z - s.z);
      else api.move(0, 0);
      return;
    }
    // dash / recovery / air: keep a sane standing move order
    if (!s.airborne) approach(p, api, false);
    return;
  }
  if (s.stunned || s.airborne) return;

  const enemyHittable = !e.invulnerable && !e.airborne;
  const laserCasting = !!(e.casting && e.casting.skill === 'laser' && e.casting.telegraph);
  const laserReady = (p.t - M.lastLaser) > 1.85;

  // ---- SMASH ----
  const predD = Math.hypot(smashAim.x - s.x, smashAim.z - s.z);
  if (api.ready('smash') && enemyHittable && predD < 3.55 && dist < 4.4) {
    api.use('smash');
    api.faceAt(smashAim.x, smashAim.z);
    if (dist > 2.3) api.move(e.x - s.x, e.z - s.z);
    return;
  }

  // ---- CHARGE ----
  if (api.ready('charge') && enemyHittable && e.visible && facingErr < 0.95) {
    const cd = Math.hypot(chgAim.x - s.x, chgAim.z - s.z);
    const lineOK = losClear(s.x, s.z, chgAim.x, chgAim.z, obs, 0.35);
    const interrupt = laserCasting && dist < 6.5;
    const good = cd >= 2.6 && cd <= 11.0 && lineOK;
    if (good || (interrupt && cd <= 11.5 && lineOK)) {
      api.use('charge');
      api.faceAt(chgAim.x, chgAim.z);
      api.move(chgAim.x - s.x, chgAim.z - s.z);
      if (p.t - M.lastSay > 4) { M.lastSay = p.t; api.say("CHARGE"); }
      return;
    }
  }

  // ---- movement ----
  const wantCover = e.visible && (laserCasting || (laserReady && dist > 7.5));
  approach(p, api, wantCover);
}

// ================= helpers =================

const M = {
  lastLaser: -99, lastBlink: -99, lastEJump: -99,
  lastBlocked: -99, blockCount: 0, lastChargeHit: -99,
  smashMiss: 0, lastSay: -99, sideSign: 1
};

function leadPoint(s, e, delay, speed) {
  let t = delay;
  let px = e.x, pz = e.z;
  for (let i = 0; i < 4; i++) {
    px = e.x + e.vx * t;
    pz = e.z + e.vz * t;
    const d = Math.hypot(px - s.x, pz - s.z);
    t = delay + (speed > 0 ? d / speed : 0);
    if (t > delay + 1.0) t = delay + 1.0;
  }
  return { x: px, z: pz };
}

function segBox(ax, az, bx, bz, minx, minz, maxx, maxz) {
  const dx = bx - ax, dz = bz - az;
  let t0 = 0, t1 = 1;
  if (Math.abs(dx) < 1e-9) {
    if (ax < minx || ax > maxx) return false;
  } else {
    let ta = (minx - ax) / dx, tb = (maxx - ax) / dx;
    if (ta > tb) { const q = ta; ta = tb; tb = q; }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return false;
  }
  if (Math.abs(dz) < 1e-9) {
    if (az < minz || az > maxz) return false;
  } else {
    let ta = (minz - az) / dz, tb = (maxz - az) / dz;
    if (ta > tb) { const q = ta; ta = tb; tb = q; }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return false;
  }
  return true;
}

function losClear(ax, az, bx, bz, obs, pad) {
  for (const o of obs) {
    if (segBox(ax, az, bx, bz, o.x - o.hx - pad, o.z - o.hz - pad, o.x + o.hx + pad, o.z + o.hz + pad)) return false;
  }
  return true;
}

function inBox(x, z, o, pad) {
  return x > o.x - o.hx - pad && x < o.x + o.hx + pad && z > o.z - o.hz - pad && z < o.z + o.hz + pad;
}

function pickCover(p) {
  const s = p.self, e = p.enemy, obs = p.arena.obstacles, half = p.arena.half;
  const R = s.radius * 0.8;
  let best = null, bs = -1e9;
  for (const r of [2.2, 3.6, 5.2, 7.0]) {
    for (let i = 0; i < 16; i++) {
      const a = i * Math.PI / 8;
      const cx = s.x + Math.sin(a) * r, cz = s.z + Math.cos(a) * r;
      if (Math.abs(cx) > half - 1.7 || Math.abs(cz) > half - 1.7) continue;
      let bad = false;
      for (const o of obs) { if (inBox(cx, cz, o, R + 0.3)) { bad = true; break; } }
      if (bad) continue;
      if (!losClear(s.x, s.z, cx, cz, obs, R)) continue;
      const hidden = !losClear(cx, cz, e.x, e.z, obs, 0);
      const de = Math.hypot(cx - e.x, cz - e.z);
      let sc = (hidden ? 80 : 0) - de * 1.3 - r * 0.2;
      if (Math.abs(cx) > half - 3.5 || Math.abs(cz) > half - 3.5) sc -= 9;
      if (sc > bs) { bs = sc; best = { x: cx, z: cz, hidden: hidden }; }
    }
  }
  return best;
}

function approach(p, api, useCover) {
  const s = p.self, e = p.enemy;
  if (useCover) {
    const c = pickCover(p);
    if (c && c.hidden) { api.move(c.x - s.x, c.z - s.z); return; }
  }
  const d = e.dist;
  if (d <= 3.4) {
    // stay glued, shove them
    api.move(e.x - s.x, e.z - s.z);
    return;
  }
  const straight = losClear(s.x, s.z, e.x, e.z, p.arena.obstacles, s.radius * 0.75);
  if (straight) {
    let dx = e.x - s.x, dz = e.z - s.z;
    if (p.t - M.lastBlocked < 0.4 && s.speed < 1.2) {
      const px = dz, pz = -dx;
      dx += px * 0.9 * M.sideSign;
      dz += pz * 0.9 * M.sideSign;
    }
    api.move(dx, dz);
  } else {
    const path = api.pathTo(e.x, e.z);
    if (path && path.points && path.points.length) {
      let wp = path.points[0];
      for (const q of path.points) {
        if (Math.hypot(q.x - s.x, q.z - s.z) > 1.0) { wp = q; break; }
      }
      api.move(wp.x - s.x, wp.z - s.z);
    } else {
      api.moveTo(e.x, e.z);
    }
  }
}
