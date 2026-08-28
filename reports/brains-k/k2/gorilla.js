function segBox(ax, az, bx, bz, o, pad) {
  const minx = o.x - o.hx - pad, maxx = o.x + o.hx + pad;
  const minz = o.z - o.hz - pad, maxz = o.z + o.hz + pad;
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dz = bz - az;
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

function clearLine(obs, ax, az, bx, bz, pad) {
  for (const o of obs) if (segBox(ax, az, bx, bz, o, pad || 0)) return false;
  return true;
}

function pointFree(p, x, z, r) {
  const h = p.arena.half - r;
  if (x < -h || x > h || z < -h || z > h) return false;
  for (const o of p.arena.obstacles) {
    if (Math.abs(x - o.x) < o.hx + r && Math.abs(z - o.z) < o.hz + r) return false;
  }
  return true;
}

function chargeLead(me, e) {
  let t = 0.28;
  let px = e.x, pz = e.z;
  for (let i = 0; i < 3; i++) {
    px = e.x + e.vx * t;
    pz = e.z + e.vz * t;
    const d = Math.hypot(px - me.x, pz - me.z);
    t = 0.28 + Math.max(0, d - (me.radius + e.radius)) / 15;
    if (t > 1.08) t = 1.08;
  }
  return { x: px, z: pz };
}

function pickApproach(p, me, e, penalty) {
  const base = Math.atan2(e.x - me.x, e.z - me.z);
  const obs = p.arena.obstacles;
  const offs = [0, 0.3, -0.3, 0.62, -0.62, 0.95, -0.95, 1.3, -1.3, 1.8, -1.8];
  let best = null;
  for (const off of offs) {
    const h = base + off;
    const sx = Math.sin(h), sz = Math.cos(h);
    for (const step of [3.2, 6.0]) {
      const x = me.x + sx * step, z = me.z + sz * step;
      if (!pointFree(p, x, z, me.radius + 0.4)) continue;
      let s = Math.hypot(e.x - x, e.z - z) + Math.abs(off) * 0.7;
      if (!clearLine(obs, me.x, me.z, x, z, me.radius * 0.6)) s += 2.2;
      if (penalty > 0 && !clearLine(obs, e.x, e.z, x, z, 0)) s -= penalty;
      if (!best || s < best.s) best = { s: s, x: x, z: z };
    }
  }
  return best;
}

let lastLaserStart = -99;
let lastBlinkStart = -99;
let blockedUntil = -99;
let lastSay = -99;

function think(p, api) {
  const me = p.self, e = p.enemy;
  if (!me.alive) return;

  for (const ev of p.events) {
    if (ev.type === 'enemyStarted') {
      if (ev.skill === 'laser') lastLaserStart = p.t;
      else if (ev.skill === 'blink') lastBlinkStart = p.t;
    } else if (ev.type === 'blocked') {
      blockedUntil = p.t + 0.45;
    }
  }

  if (!e || !e.alive) { api.stop(); return; }
  if (me.stunned) return;

  const obs = p.arena.obstacles;
  const dist = e.dist;
  const vis = e.visible;
  const casting = e.casting;
  const enemyLasering = !!(casting && casting.skill === 'laser' && casting.telegraph);
  const laserReadySoon = (p.t - lastLaserStart) >= 1.9;
  const threat = enemyLasering || laserReadySoon;

  // ---- predicted enemy points ----
  const leadPt = { x: e.x + e.vx * 0.2, z: e.z + e.vz * 0.2 };

  let moveKind = null, mx = 0, mz = 0;
  let faceX = leadPt.x, faceZ = leadPt.z;
  let skill = null, sa = 0, sb = 0;

  // ---------- busy: keep steering the running skill ----------
  if (me.busy) {
    const c = me.casting;
    if (c && c.skill === 'smash' && c.phase === 'windup') {
      const t = Math.max(0, c.remaining);
      faceX = e.x + e.vx * t;
      faceZ = e.z + e.vz * t;
      moveKind = 'move'; mx = e.x - me.x; mz = e.z - me.z;
    } else if (c && c.skill === 'charge' && c.phase === 'windup') {
      const lp = chargeLead(me, e);
      faceX = lp.x; faceZ = lp.z;
      moveKind = 'move'; mx = e.x - me.x; mz = e.z - me.z;
    } else if (c && c.skill === 'charge' && c.phase === 'dash') {
      faceX = me.x + me.vx; faceZ = me.z + me.vz;
    } else {
      faceX = leadPt.x; faceZ = leadPt.z;
      moveKind = 'move'; mx = e.x - me.x; mz = e.z - me.z;
      if (dist < 2.2) { moveKind = null; }
    }
    api.faceAt(faceX, faceZ);
    if (moveKind === 'move') api.move(mx, mz);
    return;
  }

  // ---------- SMASH ----------
  let wantSmash = false;
  if (api.ready('smash') && !e.invulnerable) {
    const t = 0.28;
    const ex = e.x + e.vx * t, ez = e.z + e.vz * t;
    let sxp = me.x, szp = me.z;
    const sp = Math.hypot(me.vx, me.vz);
    if (sp > 0.2) { sxp += (me.vx / sp) * 1.6 * t; szp += (me.vz / sp) * 1.6 * t; }
    const dd = Math.hypot(ex - sxp, ez - szp);
    let airOk = true;
    if (e.airborne) {
      const ec = e.casting;
      airOk = !!(ec && ec.remaining !== undefined && ec.remaining < 0.22);
      if (!ec) airOk = false;
    }
    if (dd < 4.85 && airOk) {
      const desired = Math.atan2(ex - sxp, ez - szp);
      let da = desired - me.heading;
      while (da > Math.PI) da -= 2 * Math.PI;
      while (da < -Math.PI) da += 2 * Math.PI;
      const canTurn = 0.616;
      const half = 0.96 + Math.asin(Math.min(0.999, e.radius / Math.max(e.radius + 0.05, dd)));
      if (Math.abs(da) - canTurn < half - 0.12) {
        if (clearLine(obs, me.x, me.z, ex, ez, 0)) wantSmash = true;
      }
    }
  }

  // ---------- CHARGE ----------
  let wantCharge = false;
  let clp = null;
  if (!wantSmash && api.ready('charge') && vis && !e.invulnerable && !e.airborne) {
    clp = chargeLead(me, e);
    const d = Math.hypot(clp.x - me.x, clp.z - me.z);
    const maxD = enemyLasering ? 13.5 : 12.0;
    const minD = enemyLasering ? 1.5 : 3.6;
    if (d > minD && d < maxD && clearLine(obs, me.x, me.z, clp.x, clp.z, 0.9)) {
      const desired = Math.atan2(clp.x - me.x, clp.z - me.z);
      let da = desired - me.heading;
      while (da > Math.PI) da -= 2 * Math.PI;
      while (da < -Math.PI) da += 2 * Math.PI;
      if (Math.abs(da) < 1.5) wantCharge = true;
      faceX = clp.x; faceZ = clp.z;
    }
  }

  if (wantSmash) {
    skill = 'smash';
    const t = 0.28;
    faceX = e.x + e.vx * t; faceZ = e.z + e.vz * t;
  } else if (wantCharge) {
    skill = 'charge';
    faceX = clp.x; faceZ = clp.z;
  }

  // ---------- MOVEMENT ----------
  const stuck = p.t < blockedUntil;
  if (dist < 6.2 && vis && !stuck) {
    let tx = e.x - me.x, tz = e.z - me.z;
    const L = Math.hypot(tx, tz) || 1;
    tx /= L; tz /= L;
    let ax = tx, az = tz;
    if (enemyLasering || dist < 2.6) {
      const px = tz, pz = -tx;
      let s = 1;
      const c1x = me.x + px * 2.5, c1z = me.z + pz * 2.5;
      const c2x = me.x - px * 2.5, c2z = me.z - pz * 2.5;
      const f1 = pointFree(p, c1x, c1z, me.radius + 0.3) ? 1 : 0;
      const f2 = pointFree(p, c2x, c2z, me.radius + 0.3) ? 1 : 0;
      if (f2 > f1) s = -1;
      else if (f1 === f2) {
        const d1 = Math.hypot(c1x, c1z), d2 = Math.hypot(c2x, c2z);
        if (d2 < d1) s = -1;
      }
      const w = dist < 2.6 ? 1.1 : 0.75;
      ax = tx + px * s * w; az = tz + pz * s * w;
    }
    moveKind = 'move'; mx = ax; mz = az;
  } else {
    const pen = threat && dist > 7 ? 6.5 : 0;
    const cand = pickApproach(p, me, e, pen);
    if (cand) { moveKind = 'to'; mx = cand.x; mz = cand.z; }
    else { moveKind = 'to'; mx = e.x; mz = e.z; }
  }

  if (skill === 'smash' || skill === 'charge') {
    if (dist < 2.0) { moveKind = 'move'; mx = e.x - me.x; mz = e.z - me.z; }
  }

  api.faceAt(faceX, faceZ);
  if (moveKind === 'move') api.move(mx, mz);
  else if (moveKind === 'to') api.moveTo(mx, mz);
  if (skill) api.use(skill, sa, sb);

  if (p.t - lastSay > 9) {
    lastSay = p.t;
    const lines = ['Come here, calamari.', 'No blink outruns a fist.', 'Cover only delays it.', 'Squeeze.'];
    api.say(lines[Math.floor(api.rand() * lines.length) % lines.length]);
  }
}
