const OB_PAD = 0;
let lastLaserStart = -99;
let lastBlinkStart = -99;
let lastJumpStart = -99;
let prevDir = { x: 0, z: 1 };
let blockedCount = 0;
let lastBlocked = -99;
let seen = { x: 0, z: 0, t: -99 };
let saidOnce = false;
let travelUntil = -99;

function boxHit(ax, az, bx, bz, o, pad) {
  const mnx = o.x - o.hx - pad, mxx = o.x + o.hx + pad;
  const mnz = o.z - o.hz - pad, mxz = o.z + o.hz + pad;
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dz = bz - az;
  if (Math.abs(dx) < 1e-9) {
    if (ax < mnx || ax > mxx) return false;
  } else {
    let ta = (mnx - ax) / dx, tb = (mxx - ax) / dx;
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  if (Math.abs(dz) < 1e-9) {
    if (az < mnz || az > mxz) return false;
  } else {
    let ta = (mnz - az) / dz, tb = (mxz - az) / dz;
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  return true;
}

function clearLine(ax, az, bx, bz, obs, pad) {
  for (const o of obs) if (boxHit(ax, az, bx, bz, o, pad || OB_PAD)) return false;
  return true;
}

function ptBlocked(x, z, obs, r) {
  if (Math.abs(x) > 20 - r || Math.abs(z) > 20 - r) return true;
  for (const o of obs) {
    if (x > o.x - o.hx - r && x < o.x + o.hx + r && z > o.z - o.hz - r && z < o.z + o.hz + r) return true;
  }
  return false;
}

function clampArena(pt) {
  return { x: Math.max(-19.4, Math.min(19.4, pt.x)), z: Math.max(-19.4, Math.min(19.4, pt.z)) };
}

function predict(e, t) {
  return clampArena({ x: e.x + e.vx * t, z: e.z + e.vz * t });
}

function chargeLead(s, e) {
  let t = 0.28;
  for (let i = 0; i < 4; i++) {
    const qx = e.x + e.vx * t, qz = e.z + e.vz * t;
    const dd = Math.hypot(qx - s.x, qz - s.z);
    t = 0.28 + Math.max(0, dd - (s.radius + e.radius) * 0.9) / 15;
    if (t > 1.08) t = 1.08;
  }
  const q = clampArena({ x: e.x + e.vx * t, z: e.z + e.vz * t });
  q.t = t;
  return q;
}

function chooseDir(p, mode) {
  const s = p.self, e = p.enemy, obs = p.arena.obstacles;
  let rem = 0.3;
  if (mode === 'dodge' && e.casting && e.casting.remaining != null) {
    rem = Math.max(0.06, e.casting.remaining);
  }
  const step = mode === 'dodge'
    ? Math.min(3.2, Math.max(0.9, s.maxSpeed * rem))
    : 2.8;
  const distEQ = Math.max(1.5, e.dist);
  const beamTol = Math.atan2(0.25 + s.radius, distEQ);
  const maxTurn = 2.1 * rem;
  let best = null, bs = -1e9;
  for (let i = 0; i < 24; i++) {
    const a = i * Math.PI / 12;
    const dx = Math.sin(a), dz = Math.cos(a);
    const qx = s.x + dx * step, qz = s.z + dz * step;
    if (ptBlocked(qx, qz, obs, s.radius + 0.25)) continue;
    let sc = 0;
    const dn = Math.hypot(e.x - qx, e.z - qz);
    sc += (e.dist - dn) * (mode === 'dodge' ? 1.1 : 3.0);
    if (mode === 'dodge') {
      if (!clearLine(qx, qz, e.x, e.z, obs, 0)) sc += 7.5;
      const ang = Math.abs(V.angleTo(e.heading, { x: qx - e.x, z: qz - e.z }));
      sc += Math.max(-3, Math.min(5.5, (ang - maxTurn - beamTol) * 6));
      if (dn < 3.4) sc += 2.5;
    }
    const wm = 20 - Math.max(Math.abs(qx), Math.abs(qz));
    if (wm < 3) sc -= (3 - wm) * 1.3;
    sc += (dx * prevDir.x + dz * prevDir.z) * 0.9;
    if (sc > bs) { bs = sc; best = { x: dx, z: dz }; }
  }
  return best;
}

function goDir(api, d) {
  if (!d) return;
  prevDir = d;
  api.move(d.x, d.z);
}

function think(p, api) {
  const s = p.self, e = p.enemy, obs = p.arena.obstacles;

  for (const ev of p.events) {
    if (ev.type === 'enemyStarted') {
      if (ev.skill === 'laser') lastLaserStart = p.t;
      else if (ev.skill === 'blink') lastBlinkStart = p.t;
      else if (ev.skill === 'jump') lastJumpStart = p.t;
    } else if (ev.type === 'blocked') {
      blockedCount++;
      lastBlocked = p.t;
    }
  }
  if (p.t - lastBlocked > 1.0) blockedCount = 0;
  if (blockedCount > 4) { travelUntil = p.t + 0.7; blockedCount = 0; }

  if (!s.alive) return;
  if (!e.alive) { api.stop(); return; }

  if (!saidOnce && p.t > 0.3) { saidOnce = true; api.say("come here, little squid"); }

  if (e.visible) seen = { x: e.x, z: e.z, t: p.t };

  const d = e.dist;
  const cast = s.casting;

  if (s.airborne) { api.faceAt(e.x, e.z); return; }

  if (cast) {
    if (cast.skill === 'charge' && cast.phase === 'windup') {
      const L = chargeLead(s, e);
      api.faceAt(L.x, L.z);
      api.move(L.x - s.x, L.z - s.z);
      return;
    }
    if (cast.skill === 'smash' && cast.telegraph) {
      const q = predict(e, Math.max(0.02, cast.remaining));
      api.faceAt(q.x, q.z);
      api.move(q.x - s.x, q.z - s.z);
      return;
    }
    api.faceAt(e.x, e.z);
    if (d > 2.2 && clearLine(s.x, s.z, e.x, e.z, obs, 0.9)) api.move(e.x - s.x, e.z - s.z);
    return;
  }

  if (s.stunned) { api.faceAt(e.x, e.z); return; }

  const enemyLaserCast = !!(e.casting && e.casting.skill === 'laser' && e.casting.telegraph);
  const enemyUp = e.y > 0.25 || e.airborne;
  const hittable = !e.invulnerable && !enemyUp;
  const losNow = clearLine(s.x, s.z, e.x, e.z, obs, 0);

  // ---- SMASH ----
  const toE = V.norm({ x: e.x - s.x, z: e.z - s.z });
  const mS = { x: s.x + toE.x * 0.42, z: s.z + toE.z * 0.42 };
  const eS = predict(e, 0.30);
  const pd = Math.hypot(eS.x - mS.x, eS.z - mS.z);

  if (api.ready('smash') && hittable && pd <= 4.25 && losNow) {
    api.faceAt(eS.x, eS.z);
    api.use('smash');
    api.move(eS.x - s.x, eS.z - s.z);
    return;
  }

  // ---- CHARGE ----
  if (api.ready('charge') && !e.invulnerable && losNow) {
    const L = chargeLead(s, e);
    const dd = Math.hypot(L.x - s.x, L.z - s.z);
    let maxR = 9.2;
    if (enemyLaserCast) maxR = 12.0;
    if (e.stunned) maxR = 11.0;
    if (d > 6 && e.speed < 1.0) maxR = 11.0;
    const pathOk = clearLine(s.x, s.z, L.x, L.z, obs, 0.55) &&
      Math.abs(L.x) < 19.3 && Math.abs(L.z) < 19.3;
    if (dd >= 1.2 && dd <= maxR && pathOk) {
      api.faceAt(L.x, L.z);
      api.use('charge');
      api.move(L.x - s.x, L.z - s.z);
      return;
    }
  }

  // ---- MOVEMENT ----
  let mode;
  if (enemyLaserCast && e.visible) mode = 'dodge';
  else if (!e.visible || d > 10.5 || p.t < travelUntil) mode = 'travel';
  else mode = 'press';

  if (mode === 'dodge') {
    const dir = chooseDir(p, 'dodge');
    if (dir) goDir(api, dir);
    else api.moveTo(e.x, e.z);
    const q = predict(e, 0.3);
    api.faceAt(q.x, q.z);
    return;
  }

  if (mode === 'travel') {
    const tgt = e.visible ? predict(e, Math.min(1.0, d / 10)) : seen;
    api.moveTo(tgt.x, tgt.z);
    if (e.visible) api.faceAt(e.x, e.z);
    else api.face(tgt.x - s.x, tgt.z - s.z);
    prevDir = V.norm({ x: tgt.x - s.x, z: tgt.z - s.z });
    return;
  }

  // press
  const aim = predict(e, 0.28);
  api.faceAt(aim.x, aim.z);

  const wantX = aim.x - s.x, wantZ = aim.z - s.z;
  const ahead = { x: s.x + V.norm({ x: wantX, z: wantZ }).x * 2.0, z: s.z + V.norm({ x: wantX, z: wantZ }).z * 2.0 };
  const straightOk = clearLine(s.x, s.z, e.x, e.z, obs, 0.85) && !ptBlocked(ahead.x, ahead.z, obs, s.radius + 0.15);

  if (straightOk) {
    // slight orbit bias when already in contact range so we keep the cone on them
    if (d < 2.4) {
      const side = V.perp(toE);
      const bias = (V.dot(side, { x: s.vx, z: s.vz }) >= 0) ? 1 : -1;
      const dir = V.norm({ x: toE.x + side.x * 0.35 * bias, z: toE.z + side.z * 0.35 * bias });
      goDir(api, dir);
    } else {
      goDir(api, V.norm({ x: wantX, z: wantZ }));
    }
  } else {
    const dir = chooseDir(p, 'press');
    if (dir) goDir(api, dir);
    else api.moveTo(e.x, e.z);
  }
}
