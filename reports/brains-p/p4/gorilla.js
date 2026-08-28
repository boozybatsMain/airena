const EPS = 1e-9;
let BOXES = null;
let strafeDir = 1;
let lastFlip = 0;
let lastLaserT = -99;
let laserHits = 0;
let lastSay = -99;

function ensureBoxes(p) {
  if (!BOXES) {
    BOXES = (p.arena && p.arena.obstacles ? p.arena.obstacles : []).map(o => ({ x: o.x, z: o.z, hx: o.hx, hz: o.hz }));
  }
}

function segHitsBox(ax, az, bx, bz, b, inf) {
  const minx = b.x - b.hx - inf, maxx = b.x + b.hx + inf;
  const minz = b.z - b.hz - inf, maxz = b.z + b.hz + inf;
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dz = bz - az;
  if (Math.abs(dx) < EPS) {
    if (ax < minx || ax > maxx) return false;
  } else {
    let ta = (minx - ax) / dx, tb = (maxx - ax) / dx;
    if (ta > tb) { const t = ta; ta = tb; tb = t; }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return false;
  }
  if (Math.abs(dz) < EPS) {
    if (az < minz || az > maxz) return false;
  } else {
    let ta = (minz - az) / dz, tb = (maxz - az) / dz;
    if (ta > tb) { const t = ta; ta = tb; tb = t; }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return false;
  }
  return true;
}

function segClear(ax, az, bx, bz, inf) {
  for (const b of BOXES) if (segHitsBox(ax, az, bx, bz, b, inf)) return false;
  return true;
}

function inBox(x, z, inf) {
  for (const b of BOXES) {
    if (x > b.x - b.hx - inf && x < b.x + b.hx + inf && z > b.z - b.hz - inf && z < b.z + b.hz + inf) return true;
  }
  return false;
}

function predict(e, t) {
  let x = e.x + (e.vx || 0) * t;
  let z = e.z + (e.vz || 0) * t;
  if (x > 19.4) x = 19.4; if (x < -19.4) x = -19.4;
  if (z > 19.4) z = 19.4; if (z < -19.4) z = -19.4;
  return { x, z };
}

function pickTactical(p, wantCover, wantClose, step) {
  const s = p.self, e = p.enemy;
  let best = null, bestScore = -1e9;
  for (let i = 0; i < 24; i++) {
    const a = i * Math.PI / 12;
    const dx = Math.sin(a), dz = Math.cos(a);
    const nx = s.x + dx * step, nz = s.z + dz * step;
    if (Math.abs(nx) > 18.6 || Math.abs(nz) > 18.6) continue;
    if (inBox(nx, nz, 1.5)) continue;
    if (!segClear(s.x, s.z, nx, nz, 1.3)) continue;
    const nd = Math.hypot(e.x - nx, e.z - nz);
    let sc = wantClose ? -nd * 1.2 : Math.min(nd, 15) * 0.7;
    if (wantCover && !segClear(nx, nz, e.x, e.z, 0.0)) sc += 30;
    const wall = 20 - Math.max(Math.abs(nx), Math.abs(nz));
    if (wall < 3.5) sc -= (3.5 - wall) * 2.2;
    sc += (dx * (s.vx || 0) + dz * (s.vz || 0)) * 0.2;
    if (sc > bestScore) { bestScore = sc; best = { x: dx, z: dz }; }
  }
  return best;
}

function think(p, api) {
  const s = p.self, e = p.enemy;
  if (!s || !e || !s.alive || !e.alive) return;
  ensureBoxes(p);

  for (const ev of p.events) {
    if (ev.type === 'enemyStarted' && ev.skill === 'laser') lastLaserT = p.t;
    if (ev.type === 'damaged' && ev.skill === 'laser') laserHits++;
  }

  if (s.stunned) return;

  const dist = e.dist;
  const toE = V.norm({ x: e.x - s.x, z: e.z - s.z });

  if (s.airborne) { api.faceAt(e.x, e.z); return; }

  const cast = s.casting;
  if (cast && cast.phase === 'windup') {
    if (cast.skill === 'charge') {
      const tt = Math.max(0, cast.remaining) + Math.max(0, (dist - 2.3)) / 15;
      const pe = predict(e, tt);
      api.faceAt(pe.x, pe.z);
      api.move(toE.x, toE.z);
    } else {
      const pe = predict(e, Math.max(0, cast.remaining));
      api.faceAt(pe.x, pe.z);
      api.move(toE.x, toE.z);
    }
    return;
  }
  if (cast && (cast.phase === 'dash' || cast.phase === 'strike' || cast.phase === 'air')) {
    api.faceAt(e.x, e.z);
    return;
  }

  if (p.t - lastFlip > 0.85 + api.rand() * 0.7) { strafeDir = -strafeDir; lastFlip = p.t; }

  const eCastLaser = !!(e.casting && e.casting.skill === 'laser' && e.casting.telegraph);
  const fracMe = s.hp / s.maxHp, fracE = e.hp / e.maxHp;
  const turtle = p.t > 31.5 && fracMe > fracE + 0.13 && dist > 7;

  const canUse = !s.busy;
  let usedSkill = false;

  // ---- SMASH ----
  if (canUse && api.ready('smash')) {
    const tl = 0.3;
    const pe = predict(e, tl);
    const vlen = Math.hypot(s.vx || 0, s.vz || 0);
    const sc = vlen > EPS ? Math.min(1, 1.6 / vlen) : 0;
    const ps = { x: s.x + (s.vx || 0) * sc * tl, z: s.z + (s.vz || 0) * sc * tl };
    const dvx = pe.x - ps.x, dvz = pe.z - ps.z;
    const d2 = Math.hypot(dvx, dvz);
    const ang = Math.abs(V.angleTo(s.heading, { x: dvx, z: dvz }));
    const maxTurn = s.turnRate * 0.55 * tl;
    const resid = Math.max(0, ang - maxTurn);
    const half = 0.96 + Math.asin(Math.min(0.98, e.radius / Math.max(d2, e.radius + 0.05)));
    const airOk = !e.airborne || (e.casting && e.casting.remaining !== undefined && e.casting.remaining < 0.18);
    if (d2 <= 4.8 && resid < half - 0.18 && airOk && !e.invulnerable) {
      api.use('smash');
      usedSkill = true;
    }
  }

  // ---- CHARGE ----
  if (canUse && !usedSkill && !turtle && api.ready('charge')) {
    const travelT = 0.3 + Math.max(0, dist - 2.3) / 15;
    const pe = predict(e, travelT);
    const dvx = pe.x - s.x, dvz = pe.z - s.z;
    const ang = Math.abs(V.angleTo(s.heading, { x: dvx, z: dvz }));
    const reachable = Math.hypot(dvx, dvz) < 12.2;
    const ok = dist > 3.1 && dist < 12.4 && reachable && !e.airborne && !e.invulnerable &&
      ang < 1.0 && segClear(s.x, s.z, pe.x, pe.z, 0.85) && e.visible;
    const worth = eCastLaser || dist > 4.6 || e.stunned;
    if (ok && worth) {
      api.use('charge');
      usedSkill = true;
      if (p.t - lastSay > 5) { lastSay = p.t; api.say("come here, squid"); }
    }
  }

  // ---- MOVEMENT ----
  if (dist < 4.2) {
    const perp = V.perp(toE);
    const radial = dist < 2.5 ? -0.3 : 1.0;
    api.move(toE.x * radial + perp.x * strafeDir * 0.85, toE.z * radial + perp.z * strafeDir * 0.85);
  } else if (turtle) {
    const d = pickTactical(p, true, false, 3.4);
    if (d) api.move(d.x, d.z); else api.move(-toE.x, -toE.z);
  } else if (eCastLaser && dist > 5) {
    const rem = e.casting && e.casting.remaining ? e.casting.remaining : 0.3;
    const step = Math.max(1.8, Math.min(3.6, 5.35 * (rem + 0.15)));
    const d = pickTactical(p, true, true, step);
    if (d) api.move(d.x, d.z); else api.move(toE.x, toE.z);
  } else {
    if (e.visible && segClear(s.x, s.z, e.x, e.z, 1.35)) {
      let dx = toE.x, dz = toE.z;
      if (dist > 8) {
        const perp = V.perp(toE);
        dx += perp.x * 0.32 * strafeDir;
        dz += perp.z * 0.32 * strafeDir;
      }
      api.move(dx, dz);
    } else {
      api.moveTo(e.x, e.z);
    }
  }

  // ---- FACING ----
  const pf = predict(e, 0.22);
  api.faceAt(pf.x, pf.z);
}
