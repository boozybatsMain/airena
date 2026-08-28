function pred(e, t) {
  return { x: e.x + (e.vx || 0) * t, z: e.z + (e.vz || 0) * t };
}

function clampArena(pt) {
  const h = 19.2;
  return { x: Math.max(-h, Math.min(h, pt.x)), z: Math.max(-h, Math.min(h, pt.z)) };
}

function segBox(ax, az, bx, bz, b, pad) {
  const hx = b.hx + pad, hz = b.hz + pad;
  if (hx <= 0 || hz <= 0) return false;
  const minx = b.x - hx, maxx = b.x + hx, minz = b.z - hz, maxz = b.z + hz;
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dz = bz - az;
  if (Math.abs(dx) < 1e-9) {
    if (ax < minx || ax > maxx) return false;
  } else {
    let ta = (minx - ax) / dx, tb = (maxx - ax) / dx;
    if (ta > tb) { const tmp = ta; ta = tb; tb = tmp; }
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  if (Math.abs(dz) < 1e-9) {
    if (az < minz || az > maxz) return false;
  } else {
    let ta = (minz - az) / dz, tb = (maxz - az) / dz;
    if (ta > tb) { const tmp = ta; ta = tb; tb = tmp; }
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  return true;
}

function anyBlocked(obs, ax, az, bx, bz, pad) {
  for (const b of obs) if (segBox(ax, az, bx, bz, b, pad)) return true;
  return false;
}

function findCover(s, e, obs) {
  let best = null, bestScore = -1e9;
  const toE = V.toward(s, e);
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8;
    const dir = { x: Math.sin(a), z: Math.cos(a) };
    for (const reach of [2.6, 4.2]) {
      const fx = s.x + dir.x * reach, fz = s.z + dir.z * reach;
      if (Math.abs(fx) > 18.4 || Math.abs(fz) > 18.4) continue;
      if (anyBlocked(obs, s.x, s.z, fx, fz, 1.35)) continue;
      if (!anyBlocked(obs, e.x, e.z, fx, fz, -0.35)) continue;
      const nd = Math.hypot(fx - e.x, fz - e.z);
      const sc = -nd * 0.55 + V.dot(dir, toE) * 1.2 + (reach > 3 ? 0.3 : 0);
      if (sc > bestScore) { bestScore = sc; best = dir; }
    }
  }
  return best;
}

const mem = { lastUse: {}, blockedAt: -99, side: 1, sideAt: -99, born: -1 };

function think(p, api) {
  const s = p.self;
  if (!s || !s.alive) return;
  const obs = (p.arena && p.arena.obstacles) || [];

  if (mem.born < 0 || p.t < mem.born - 0.5) {
    mem.born = p.t; mem.lastUse = {}; mem.blockedAt = -99; mem.side = 1; mem.sideAt = p.t;
  }

  for (const ev of p.events) {
    if (ev.type === 'enemyStarted') mem.lastUse[ev.skill] = p.t;
    else if (ev.type === 'blocked') mem.blockedAt = p.t;
  }

  const e = p.enemy;
  if (!e || !e.alive) { api.stop(); return; }

  const d = e.dist;
  const cast = e.casting;
  const laserCast = !!(cast && cast.skill === 'laser' && cast.telegraph);
  const enemyJumping = e.airborne || !!(cast && cast.skill === 'jump' && cast.telegraph);
  const eInv = !!e.invulnerable;
  const chargeActive = !!(s.casting && s.casting.skill === 'charge');

  // ---------- aiming ----------
  const chargeT = 0.28 + Math.min(d, 12) / 15;
  const aim = clampArena(pred(e, chargeActive ? Math.min(chargeT, 0.9) : 0.28));

  // ---------- smash decision ----------
  const t = 0.28;
  const myFut = { x: s.x + s.vx * t * 0.45, z: s.z + s.vz * t * 0.45 };
  const eFut = pred(e, t);
  const dvx = eFut.x - myFut.x, dvz = eFut.z - myFut.z;
  const dF = Math.hypot(dvx, dvz) || 0.001;
  const dirF = { x: dvx / dF, z: dvz / dF };
  const ang = Math.abs(V.angleTo(s.heading, dirF));
  const half = 0.9599 + Math.asin(Math.min(0.98, e.radius / Math.max(dF, e.radius + 0.05)));
  const turnable = 4 * 0.55 * t;
  const smashOK = dF < 4.6 && (ang - turnable) < half - 0.12 &&
    !enemyJumping && !eInv && e.visible && api.ready('smash');

  // ---------- charge decision ----------
  let chargeOK = false;
  if (api.ready('charge') && !eInv && e.visible && d > 3.1 && d < 13.5) {
    const cp = clampArena(pred(e, chargeT));
    let cdx = cp.x - s.x, cdz = cp.z - s.z;
    const cl = Math.hypot(cdx, cdz) || 1;
    cdx /= cl; cdz /= cl;
    const cang = Math.abs(V.angleTo(s.heading, { x: cdx, z: cdz }));
    if (cang < 0.42) {
      const r = api.ray(cdx, cdz, Math.min(d + 1.5, 13));
      if (r.dist >= Math.min(d - 1.6, 11.5)) chargeOK = true;
    }
  }

  // ---------- issue skill ----------
  if (!s.busy && !s.stunned && !s.airborne) {
    if (chargeOK && (d > 3.4 || !smashOK)) api.use('charge');
    else if (smashOK) api.use('smash');
    else if (chargeOK) api.use('charge');
  }

  // ---------- movement ----------
  const toE = V.toward(s, e);
  let perp = V.perp(toE);
  // keep strafing toward open arena
  const toCenter = V.norm({ x: -s.x, z: -s.z });
  if (p.t - mem.sideAt > 1.6) {
    mem.side = V.dot(perp, toCenter) >= 0 ? 1 : -1;
    if (api.rand() < 0.15) mem.side = -mem.side;
    mem.sideAt = p.t;
  }
  perp = V.scale(perp, mem.side);

  const laserCd = Math.max(0, 2.2 - (p.t - (mem.lastUse['laser'] !== undefined ? mem.lastUse['laser'] : -99)));
  const threatened = e.visible && (laserCast || laserCd < 0.35) && d > 4.0;

  let mv = null, useMoveTo = false;

  if (!chargeActive || s.casting.phase === 'windup') {
    if (laserCast && e.visible && d > 4.5) {
      const cov = findCover(s, e, obs);
      if (cov) mv = cov;
      else mv = V.norm({ x: toE.x * 0.9 + perp.x * 0.95, z: toE.z * 0.9 + perp.z * 0.95 });
    } else if (d > 5.0) {
      const path = api.pathTo(e.x, e.z);
      if (!path || path.direct) {
        const w = Math.sin(p.t * 2.3) * (threatened ? 0.5 : 0.28);
        mv = V.norm({ x: toE.x + perp.x * w, z: toE.z + perp.z * w });
      } else {
        useMoveTo = true;
      }
    } else if (d > 2.5) {
      if (laserCast) mv = V.norm({ x: toE.x * 0.85 + perp.x * 1.0, z: toE.z * 0.85 + perp.z * 1.0 });
      else mv = V.norm({ x: toE.x + perp.x * 0.22, z: toE.z + perp.z * 0.22 });
    } else {
      if (laserCast) mv = V.norm({ x: toE.x * 0.35 + perp.x * 1.0, z: toE.z * 0.35 + perp.z * 1.0 });
      else mv = V.norm({ x: toE.x * 0.9 + perp.x * 0.45, z: toE.z * 0.9 + perp.z * 0.45 });
    }
  }

  // unstick
  if (p.t - mem.blockedAt < 0.5 && !useMoveTo && mv) {
    const path = api.pathTo(e.x, e.z);
    if (path && !path.direct && path.points && path.points.length) {
      useMoveTo = true;
    } else {
      mv = V.norm({ x: mv.x + perp.x * 1.4, z: mv.z + perp.z * 1.4 });
    }
  }

  if (useMoveTo) api.moveTo(e.x, e.z);
  else if (mv) api.move(mv.x, mv.z);

  api.faceAt(aim.x, aim.z);
}
