const CHARGE_SPEED = 15;
const SMASH_WINDUP = 0.28;

let strafeDir = 1;
let lastStrafeFlip = 0;
let laserReadyAt = 0;
let blinkReadyAt = 0;
let jukedThisCast = false;
let stuckTimer = 0;
let lastSayT = -99;

function inObstacle(obs, x, z, pad) {
  for (const o of obs) {
    if (Math.abs(x - o.x) <= o.hx + pad && Math.abs(z - o.z) <= o.hz + pad) return true;
  }
  return false;
}

function segAABB(ax, az, bx, bz, minx, minz, maxx, maxz) {
  const dx = bx - ax, dz = bz - az;
  let tmin = 0, tmax = 1;
  if (Math.abs(dx) < 1e-9) {
    if (ax < minx || ax > maxx) return false;
  } else {
    let t1 = (minx - ax) / dx, t2 = (maxx - ax) / dx;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  if (Math.abs(dz) < 1e-9) {
    if (az < minz || az > maxz) return false;
  } else {
    let t1 = (minz - az) / dz, t2 = (maxz - az) / dz;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  return true;
}

function segBlocked(obs, ax, az, bx, bz) {
  for (const o of obs) {
    if (segAABB(ax, az, bx, bz, o.x - o.hx, o.z - o.hz, o.x + o.hx, o.z + o.hz)) return true;
  }
  return false;
}

function predict(en, t) {
  return { x: en.x + en.vx * t, z: en.z + en.vz * t };
}

function clampPt(pt, lim) {
  return { x: Math.max(-lim, Math.min(lim, pt.x)), z: Math.max(-lim, Math.min(lim, pt.z)) };
}

function safeMove(p, api, dx, dz) {
  const d = V.norm({ x: dx, z: dz });
  if (d.x === 0 && d.z === 0) { api.stop(); return; }
  let best = d;
  const r = api.ray(d.x, d.z, 2.4);
  if (r && r.hit && r.dist < 2.0) {
    let bestScore = -1e9;
    for (const ang of [0, 0.55, -0.55, 1.1, -1.1, 1.7, -1.7, 2.4, -2.4, Math.PI]) {
      const c = V.rot(d, ang);
      const rr = api.ray(c.x, c.z, 2.4);
      const free = (rr && rr.hit) ? rr.dist : 2.4;
      const s = free - Math.abs(ang) * 0.35;
      if (s > bestScore) { bestScore = s; best = c; }
    }
  }
  api.move(best.x, best.z);
}

function dodgeDir(p, api, remaining) {
  const me = p.self, en = p.enemy;
  const obs = p.arena.obstacles;
  const step = Math.max(1.3, Math.min(5 * remaining + 0.9, 3.2));
  const toE = V.toward(me, en);
  const perp = V.perp(toE);
  let best = null, bestScore = -1e9;
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8;
    const d = { x: Math.sin(a), z: Math.cos(a) };
    const px = me.x + d.x * step, pz = me.z + d.z * step;
    if (Math.abs(px) > 18.6 || Math.abs(pz) > 18.6) continue;
    if (inObstacle(obs, px, pz, me.radius + 0.2)) continue;
    let score = 0;
    if (segBlocked(obs, px, pz, en.x, en.z)) score += 60;
    score += Math.abs(V.dot(d, perp)) * 9;
    score += V.dot(d, toE) * 6;
    const r = api.ray(d.x, d.z, step + 0.5);
    if (r && r.hit && r.dist < step * 0.8) score -= 25;
    if (score > bestScore) { bestScore = score; best = d; }
  }
  return best;
}

function approachDir(p, api) {
  const me = p.self, en = p.enemy;
  const dist = en.dist;
  const toE = V.toward(me, en);
  const perp = V.perp(toE);
  let radial;
  const want = 1.9;
  if (dist > want + 0.7) radial = 1;
  else if (dist < want - 0.5) radial = -0.55;
  else radial = 0.2;
  let tang = (dist < 7 ? 0.95 : dist < 11 ? 0.4 : 0.15) * strafeDir;
  let dir = V.norm({ x: toE.x * radial + perp.x * tang, z: toE.z * radial + perp.z * tang });

  if (!en.visible || dist > 6) {
    const path = api.pathTo(en.x, en.z);
    if (path && !path.direct && path.points && path.points.length) {
      let wp = null;
      for (const q of path.points) {
        if (V.dist(me, q) > 1.0) { wp = q; break; }
      }
      if (wp) dir = V.toward(me, wp);
    }
  }
  return dir;
}

function handleEvents(p, api) {
  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      if (e.skill === 'laser') { laserReadyAt = p.t + 2.0; jukedThisCast = false; }
      else if (e.skill === 'blink') blinkReadyAt = p.t + 5.0;
    } else if (e.type === 'damaged') {
      if (p.t - lastStrafeFlip > 0.35) { strafeDir = -strafeDir; lastStrafeFlip = p.t; }
    } else if (e.type === 'blocked') {
      if (p.t - lastStrafeFlip > 0.45) { strafeDir = -strafeDir; lastStrafeFlip = p.t; }
    } else if (e.type === 'blinked') {
      blinkReadyAt = p.t + 5.0;
    }
  }
}

function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive) return;
  handleEvents(p, api);
  if (!en) return;
  if (!en.alive) { api.stop(); return; }

  const now = p.t;
  const obs = p.arena.obstacles;

  if (now - lastStrafeFlip > 1.2) { strafeDir = -strafeDir; lastStrafeFlip = now; }

  const enCast = en.casting;
  const laserCast = !!(enCast && enCast.skill === 'laser' && enCast.telegraph);
  if (laserCast) {
    laserReadyAt = now - (enCast.elapsed || 0) + 2.0;
    if (enCast.remaining < 0.30 && !jukedThisCast) {
      jukedThisCast = true;
      strafeDir = -strafeDir;
      lastStrafeFlip = now;
    }
  }

  if (me.stunned) return;

  if (me.airborne) {
    api.faceAt(en.x, en.z);
    return;
  }

  // --- own cast maintenance ---
  if (me.casting) {
    const c = me.casting;
    if (c.skill === 'smash') {
      const pe = predict(en, Math.max(0, c.remaining));
      api.faceAt(pe.x, pe.z);
      if (c.phase === 'windup') {
        const d = V.toward(me, pe);
        if (en.dist > 2.2) safeMove(p, api, d.x, d.z);
        else api.stop();
      }
      return;
    }
    if (c.skill === 'charge') {
      if (c.phase === 'windup') {
        const travel = Math.max(0, en.dist - (me.radius + en.radius)) / CHARGE_SPEED;
        const pe = clampPt(predict(en, (c.remaining || 0) + travel * 0.85), 19);
        api.faceAt(pe.x, pe.z);
      }
      return;
    }
    if (c.phase !== 'recover') return;
  }

  const dist = en.dist;
  const airRemain = (en.airborne && enCast && enCast.remaining) ? enCast.remaining : 0;
  const enemyLandPt = en.airborne ? clampPt(predict(en, airRemain), 19) : { x: en.x, z: en.z };

  // --- SMASH ---
  const pe = clampPt(predict(en, SMASH_WINDUP), 19.5);
  const dP = V.dist(me, pe);
  const angP = Math.abs(V.angleTo(me.heading, V.toward(me, pe)));
  const willBeAirborne = en.airborne && airRemain > 0.30;
  if (api.ready('smash') && !willBeAirborne && !en.invulnerable && dP < 3.85 && angP < 1.30 &&
      !segBlocked(obs, me.x, me.z, pe.x, pe.z)) {
    api.faceAt(pe.x, pe.z);
    api.use('smash');
    if (dist > 2.3) { const d = V.toward(me, pe); safeMove(p, api, d.x, d.z); }
    return;
  }

  // --- CHARGE ---
  if (api.ready('charge') && !me.casting && dist > 4.0 && dist < 12.0 && en.visible && !en.invulnerable) {
    const travel = Math.max(0, dist - (me.radius + en.radius)) / CHARGE_SPEED;
    const lead = clampPt(predict(en, (0.28 + travel) * 0.85), 19);
    const cdir = V.toward(me, lead);
    const cdist = V.dist(me, lead);
    const ang = Math.abs(V.angleTo(me.heading, cdir));
    const r = api.ray(cdir.x, cdir.z, Math.min(cdist + 2.0, 14));
    const clear = !(r && r.hit) || r.dist > cdist - 1.2;
    if (clear && cdist < 12.5) {
      if (ang < 0.75) {
        api.face(cdir.x, cdir.z);
        api.use('charge');
        if (now - lastSayT > 6) { lastSayT = now; api.say("come here, squid"); }
        return;
      } else {
        api.face(cdir.x, cdir.z);
        safeMove(p, api, cdir.x, cdir.z);
        return;
      }
    }
  }

  // --- facing ---
  if (en.airborne) api.faceAt(enemyLandPt.x, enemyLandPt.z);
  else {
    const fp = predict(en, 0.12);
    api.faceAt(fp.x, fp.z);
  }

  // --- movement ---
  let dir = null;

  if (en.airborne && airRemain > 0.15 && V.dist(me, enemyLandPt) > 2.0) {
    dir = V.toward(me, enemyLandPt);
  } else if (laserCast && dist > 4.0 && en.visible) {
    dir = dodgeDir(p, api, enCast.remaining);
  }

  if (!dir) dir = approachDir(p, api);

  // stuck handling
  if (me.speed < 0.5) stuckTimer += p.dt; else stuckTimer = 0;
  if (stuckTimer > 0.7) {
    stuckTimer = 0;
    strafeDir = -strafeDir;
    dir = V.rot(dir, (api.rand() - 0.5) * 2.4 + (api.rand() < 0.5 ? 1.6 : -1.6));
  }

  safeMove(p, api, dir.x, dir.z);
}
