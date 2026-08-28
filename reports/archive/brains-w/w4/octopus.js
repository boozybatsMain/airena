const OBS = [];
let lastCharge = -10, lastSmash = -10, chargeDodged = false, lastDirX = 0, lastDirZ = 1, saidT = -10;

function segBox(ax, az, bx, bz, o, m) {
  const minx = o.x - o.hx - m, maxx = o.x + o.hx + m, minz = o.z - o.hz - m, maxz = o.z + o.hz + m;
  let t0 = 0, t1 = 1;
  let d = bx - ax;
  if (Math.abs(d) < 1e-9) { if (ax < minx || ax > maxx) return false; }
  else {
    let ta = (minx - ax) / d, tb = (maxx - ax) / d;
    if (ta > tb) { const q = ta; ta = tb; tb = q; }
    if (ta > t0) t0 = ta; if (tb < t1) t1 = tb;
    if (t0 > t1) return false;
  }
  d = bz - az;
  if (Math.abs(d) < 1e-9) { if (az < minz || az > maxz) return false; }
  else {
    let ta = (minz - az) / d, tb = (maxz - az) / d;
    if (ta > tb) { const q = ta; ta = tb; tb = q; }
    if (ta > t0) t0 = ta; if (tb < t1) t1 = tb;
    if (t0 > t1) return false;
  }
  return true;
}

function clearLine(ax, az, bx, bz, m) {
  for (const o of OBS) if (segBox(ax, az, bx, bz, o, m)) return false;
  return true;
}

function inBox(x, z, m) {
  for (const o of OBS) {
    if (x > o.x - o.hx - m && x < o.x + o.hx + m && z > o.z - o.hz - m && z < o.z + o.hz + m) return true;
  }
  return false;
}

function leadPoint(e, t) {
  return { x: e.x + e.vx * t * 0.92, z: e.z + e.vz * t * 0.92 };
}

function pickMove(p, api, ideal, wantLos) {
  const s = p.self, e = p.enemy;
  let best = null, bestSc = -1e9;
  for (let i = 0; i < 24; i++) {
    const a = i * Math.PI / 12 + 0.13;
    const dx = Math.sin(a), dz = Math.cos(a);
    for (const r of [3.5, 7.5]) {
      const cx = s.x + dx * r, cz = s.z + dz * r;
      if (Math.abs(cx) > 18.4 || Math.abs(cz) > 18.4) continue;
      if (inBox(cx, cz, 1.2)) continue;
      if (!clearLine(s.x, s.z, cx, cz, 0.95)) continue;
      const d = Math.hypot(cx - e.x, cz - e.z);
      let sc = -Math.abs(d - ideal);
      const los = clearLine(cx, cz, e.x, e.z, 0.0);
      sc += wantLos ? (los ? 3.0 : -3.5) : (los ? -3.5 : 3.5);
      const wc = 20 - Math.max(Math.abs(cx), Math.abs(cz));
      if (wc < 4) sc -= (4 - wc) * 2.5;
      sc += 1.6 * (dx * lastDirX + dz * lastDirZ);
      if (r > 5) sc += 0.5;
      if (sc > bestSc) { bestSc = sc; best = { dx, dz }; }
    }
  }
  if (best) {
    lastDirX = best.dx; lastDirZ = best.dz;
    api.move(best.dx, best.dz);
  } else {
    const aw = V.away({ x: s.x, z: s.z }, { x: e.x, z: e.z });
    let tx = s.x + aw.x * 7, tz = s.z + aw.z * 7;
    tx = Math.max(-17, Math.min(17, tx)); tz = Math.max(-17, Math.min(17, tz));
    api.moveTo(tx, tz);
  }
}

function bestEscapeDir(p) {
  const s = p.self, e = p.enemy;
  const aw = V.away({ x: s.x, z: s.z }, { x: e.x, z: e.z });
  let best = aw, bestSc = -1e9;
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8;
    const dx = Math.sin(a), dz = Math.cos(a);
    const cx = s.x + dx * 7.4, cz = s.z + dz * 7.4;
    let sc = Math.hypot(cx - e.x, cz - e.z);
    if (Math.abs(cx) > 18.5 || Math.abs(cz) > 18.5) sc -= 12;
    if (inBox(cx, cz, 1.1)) sc -= 6;
    sc += 3 * (dx * aw.x + dz * aw.z);
    const wc = 20 - Math.max(Math.abs(cx), Math.abs(cz));
    if (wc < 4) sc -= (4 - wc) * 2;
    if (sc > bestSc) { bestSc = sc; best = { x: dx, z: dz }; }
  }
  return best;
}

function lateralDir(p, dirx, dirz) {
  const s = p.self, e = p.enemy;
  const rx = s.x - e.x, rz = s.z - e.z;
  const dot = rx * dirx + rz * dirz;
  let lx = rx - dot * dirx, lz = rz - dot * dirz;
  const l = Math.hypot(lx, lz);
  if (l < 0.4) { lx = -dirz; lz = dirx; }
  else { lx /= l; lz /= l; }
  const a = { x: s.x + lx * 7, z: s.z + lz * 7 };
  const b = { x: s.x - lx * 7, z: s.z - lz * 7 };
  const scoreP = (c) => {
    let v = 0;
    if (Math.abs(c.x) > 18.3 || Math.abs(c.z) > 18.3) v -= 10;
    if (inBox(c.x, c.z, 1.1)) v -= 8;
    v += 20 - Math.max(Math.abs(c.x), Math.abs(c.z));
    return v;
  };
  if (l >= 0.4 && scoreP(a) >= scoreP(b) - 3) return { x: lx, z: lz };
  return scoreP(a) >= scoreP(b) ? { x: lx, z: lz } : { x: -lx, z: -lz };
}

function think(p, api) {
  const s = p.self, e = p.enemy;
  if (!s || !s.alive || !e) return;
  if (OBS.length === 0 && p.arena && p.arena.obstacles) {
    for (const o of p.arena.obstacles) OBS.push({ x: o.x, z: o.z, hx: o.hx, hz: o.hz });
  }

  for (const ev of p.events) {
    if (ev.type === 'enemyStarted') {
      if (ev.skill === 'charge') { lastCharge = p.t; chargeDodged = false; }
      else if (ev.skill === 'smash') lastSmash = p.t;
    }
  }
  const ec = e.casting;
  if (ec && ec.skill === 'charge' && p.t - lastCharge > 2.0) { lastCharge = p.t; chargeDodged = false; }
  if (ec && ec.skill === 'smash' && p.t - lastSmash > 1.3) lastSmash = p.t;

  const chargeAvail = (p.t - lastCharge) >= 4.35;
  const dist = e.dist;

  if (s.stunned || s.airborne) {
    api.faceAt(e.x, e.z);
    return;
  }

  // --- keep aiming while our own laser is in flight ---
  if (s.casting && s.casting.skill === 'laser') {
    const t = s.casting.remaining != null ? Math.max(0, s.casting.remaining - 0.03) : 0.3;
    const lp = leadPoint(e, t);
    api.faceAt(lp.x, lp.z);
    if (ec && ec.skill === 'charge' && dist < 13) {
      const cd = V.fromHeading(e.heading);
      const lat = lateralDir(p, cd.x, cd.z);
      api.move(lat.x, lat.z);
    } else {
      pickMove(p, api, chargeAvail ? 15 : 9.5, true);
    }
    return;
  }

  // --- CHARGE DODGE ---
  if (ec && ec.skill === 'charge' && dist < 17) {
    const cd = V.fromHeading(e.heading);
    const lat = lateralDir(p, cd.x, cd.z);
    api.faceAt(e.x, e.z);
    const committed = ec.phase === 'dash' || (ec.phase === 'windup' && ec.remaining != null && ec.remaining < 0.09);
    if (committed && !chargeDodged && dist < 12.5 && api.ready('blink')) {
      const aw = V.away({ x: s.x, z: s.z }, { x: e.x, z: e.z });
      const bx = lat.x * 1.0 + aw.x * 0.45, bz = lat.z * 1.0 + aw.z * 0.45;
      api.use('blink', bx, bz);
      chargeDodged = true;
      api.move(lat.x, lat.z);
      return;
    }
    api.move(lat.x, lat.z);
    return;
  }

  // --- SMASH DODGE ---
  if (ec && ec.skill === 'smash' && ec.telegraph && dist < 5.2) {
    const aw = V.away({ x: s.x, z: s.z }, { x: e.x, z: e.z });
    api.faceAt(e.x, e.z);
    if (dist < 3.9 && api.ready('blink')) {
      const d = bestEscapeDir(p);
      api.use('blink', d.x, d.z);
      api.move(d.x, d.z);
      return;
    }
    if (dist < 3.7 && api.ready('jump') && !chargeAvail) {
      api.move(aw.x, aw.z);
      api.use('jump');
      return;
    }
    pickMove(p, api, 12, false);
    return;
  }

  // --- EMERGENCY DISENGAGE ---
  if (dist < 4.6 && api.ready('blink') && !s.busy) {
    const d = bestEscapeDir(p);
    api.use('blink', d.x, d.z);
    api.move(d.x, d.z);
    api.faceAt(e.x, e.z);
    return;
  }

  // --- SHOOT ---
  const enemyBusySafe = ec && ec.skill !== 'charge';
  const laserSafe = (!chargeAvail) || dist > 13.2 || enemyBusySafe;
  const wantShoot = api.ready('laser') && !s.busy && e.visible && dist < 22 && dist > 2.2 && laserSafe;

  const lp0 = leadPoint(e, 0.55);
  api.faceAt(lp0.x, lp0.z);

  if (wantShoot) {
    const ang = Math.abs(V.angleTo(s.heading, V.toward({ x: s.x, z: s.z }, lp0)));
    if (ang < 1.5 && clearLine(s.x, s.z, lp0.x, lp0.z, 0.0)) {
      api.use('laser');
    }
  }

  // --- KITE ---
  const lcd = api.cooldown('laser');
  const ideal = chargeAvail ? (dist < 10 ? 15.5 : 15) : 9.5;
  const wantLos = (lcd < 0.85) && laserSafe && dist > 4;
  pickMove(p, api, ideal, wantLos);

  if (p.t - saidT > 6) {
    saidT = p.t;
    api.say(chargeAvail ? "eight arms, one beam — keep your distance" : "his charge is cold. burn him.");
  }
}
