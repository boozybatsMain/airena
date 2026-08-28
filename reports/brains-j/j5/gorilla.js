const BOX = [
  { x: -7, z: -3, hx: 1.2, hz: 3.5 },
  { x: 7, z: 3, hx: 1.2, hz: 3.5 },
  { x: 0, z: -10, hx: 3.6, hz: 1.2 },
  { x: 0, z: 10, hx: 3.6, hz: 1.2 },
  { x: -12.5, z: 11, hx: 1.6, hz: 1.6 },
  { x: 12.5, z: -11, hx: 1.6, hz: 1.6 }
];

let lastLaserStart = -99;
let lastBlinkStart = -99;
let smashRange = 4.05;
let coneMax = 1.15;
let lastFireDist = 0;
let orbitSign = 1;
let orbitFlipT = 0;
let sayT = -99;
let obsCache = BOX;

function boxes() { return obsCache; }

function segHitsBox(ax, az, bx, bz, b, pad) {
  const dx = bx - ax, dz = bz - az;
  let t0 = 0, t1 = 1;
  const minx = b.x - b.hx - pad, maxx = b.x + b.hx + pad;
  const minz = b.z - b.hz - pad, maxz = b.z + b.hz + pad;
  if (Math.abs(dx) < 1e-9) {
    if (ax < minx || ax > maxx) return false;
  } else {
    let ta = (minx - ax) / dx, tb = (maxx - ax) / dx;
    if (ta > tb) { const tmp = ta; ta = tb; tb = tmp; }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return false;
  }
  if (Math.abs(dz) < 1e-9) {
    if (az < minz || az > maxz) return false;
  } else {
    let ta = (minz - az) / dz, tb = (maxz - az) / dz;
    if (ta > tb) { const tmp = ta; ta = tb; tb = tmp; }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return false;
  }
  return true;
}

function segBlocked(ax, az, bx, bz, pad) {
  const list = boxes();
  for (let i = 0; i < list.length; i++) {
    if (segHitsBox(ax, az, bx, bz, list[i], pad || 0)) return true;
  }
  return false;
}

function inBlock(x, z, pad) {
  const list = boxes();
  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    if (Math.abs(x - b.x) < b.hx + pad && Math.abs(z - b.z) < b.hz + pad) return true;
  }
  return false;
}

function predict(e, t) {
  const k = e.stunned ? 0.35 : 1;
  let x = e.x + e.vx * t * k;
  let z = e.z + e.vz * t * k;
  if (x > 19.4) x = 19.4; if (x < -19.4) x = -19.4;
  if (z > 19.4) z = 19.4; if (z < -19.4) z = -19.4;
  return { x, z };
}

function moveSmart(api, p, tx, tz) {
  const s = p.self;
  const path = api.pathTo(tx, tz);
  if (path && path.points && path.points.length && !path.direct) {
    let pt = path.points[0];
    const d0 = Math.hypot(pt.x - s.x, pt.z - s.z);
    if (d0 < 1.1 && path.points.length > 1) pt = path.points[1];
    api.move(pt.x - s.x, pt.z - s.z);
    return;
  }
  api.move(tx - s.x, tz - s.z);
}

function findCover(p) {
  const s = p.self, e = p.enemy;
  let best = null, bs = 1e9;
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8;
    const dx = Math.sin(a), dz = Math.cos(a);
    for (let r = 0; r < 3; r++) {
      const R = 2.5 + r * 2.2;
      const cx = s.x + dx * R, cz = s.z + dz * R;
      if (Math.abs(cx) > 18.5 || Math.abs(cz) > 18.5) continue;
      if (inBlock(cx, cz, 1.5)) continue;
      if (segBlocked(s.x, s.z, cx, cz, 1.35)) continue;
      if (!segBlocked(e.x, e.z, cx, cz, 0)) continue;
      const dE = Math.hypot(cx - e.x, cz - e.z);
      const score = dE + R * 0.2;
      if (score < bs) { bs = score; best = { x: cx, z: cz }; }
    }
  }
  return best;
}

function think(p, api) {
  const s = p.self, e = p.enemy;
  if (!s || !s.alive) return;
  if (p.arena && p.arena.obstacles && p.arena.obstacles.length) obsCache = p.arena.obstacles;

  for (const ev of p.events) {
    if (ev.type === 'enemyStarted') {
      if (ev.skill === 'laser') lastLaserStart = p.t;
      else if (ev.skill === 'blink') lastBlinkStart = p.t;
    } else if (ev.type === 'missed' && ev.skill === 'smash') {
      if (ev.reason === 'range') smashRange = Math.max(3.0, Math.min(smashRange, lastFireDist - 0.35));
      else if (ev.reason === 'aim') coneMax = Math.max(0.7, coneMax - 0.12);
    } else if (ev.type === 'dealt' && ev.skill === 'smash') {
      if (lastFireDist > smashRange - 0.15) smashRange = Math.min(4.5, smashRange + 0.12);
    } else if (ev.type === 'blocked') {
      if (p.t - orbitFlipT > 0.4) { orbitSign = -orbitSign; orbitFlipT = p.t; }
    }
  }

  if (!e || !e.alive) { api.stop(); return; }

  const me = { x: s.x, z: s.z };
  const en = { x: e.x, z: e.z };
  const d = e.dist;
  const cast = s.casting;

  if (p.t - sayT > 6) {
    sayT = p.t;
    api.say(d > 8 ? "closing" : "SMASH");
  }

  // --- committed states -------------------------------------------------
  if (cast && cast.skill === 'smash' && cast.phase === 'windup') {
    const pr = predict(e, cast.remaining);
    api.faceAt(pr.x, pr.z);
    api.move(pr.x - s.x, pr.z - s.z);
    return;
  }
  if (cast && cast.skill === 'charge' && cast.phase === 'windup') {
    const tt = cast.remaining + Math.max(0, d - 1.8) / 15;
    const pr = predict(e, tt);
    api.faceAt(pr.x, pr.z);
    return;
  }
  if (s.stunned) return;
  if (s.busy || s.airborne) {
    api.faceAt(e.x, e.z);
    if (!s.airborne) api.move(e.x - s.x, e.z - s.z);
    return;
  }

  const enemyCasting = e.casting && e.casting.telegraph;
  const enemyLaserCast = enemyCasting && e.casting.skill === 'laser';
  const enemyAirSoon = e.airborne || (e.casting && e.casting.skill === 'jump');
  const laserThreat = enemyLaserCast || (p.t - lastLaserStart) > 1.9;

  // --- SMASH ------------------------------------------------------------
  if (api.ready('smash') && !enemyAirSoon) {
    const pr = predict(e, 0.28);
    const mx = s.x + s.vx * 0.13, mz = s.z + s.vz * 0.13;
    const dp = Math.hypot(pr.x - mx, pr.z - mz);
    const dir = V.toward(me, pr);
    const ang = Math.abs(V.angleTo(s.heading, dir));
    if (dp <= smashRange && ang < coneMax) {
      lastFireDist = dp;
      api.faceAt(pr.x, pr.z);
      api.move(pr.x - s.x, pr.z - s.z);
      api.use('smash');
      return;
    }
  }

  // --- CHARGE -----------------------------------------------------------
  if (api.ready('charge') && e.visible && !e.invulnerable) {
    const minD = enemyLaserCast ? 2.2 : 4.3;
    if (d > minD && d < 12.6) {
      const tt = 0.28 + Math.max(0, d - 1.8) / 15;
      const pr = predict(e, tt);
      const dist2 = Math.hypot(pr.x - s.x, pr.z - s.z);
      const dir = V.toward(me, pr);
      if (dist2 > 0.5 && dist2 < 12.4) {
        const r = api.ray(dir.x, dir.z, Math.min(13, dist2 + 0.6));
        const clear = (!r || !r.hit || r.dist >= dist2 - 1.3);
        if (clear) {
          api.face(dir.x, dir.z);
          api.move(dir.x, dir.z);
          if (Math.abs(V.angleTo(s.heading, dir)) < 1.0) api.use('charge');
          return;
        }
      }
    }
  }

  // --- MOVEMENT ---------------------------------------------------------
  api.faceAt(e.x + e.vx * 0.2, e.z + e.vz * 0.2);

  if (d < 3.3) {
    if (p.t - orbitFlipT > 1.3) { orbitSign = api.rand() < 0.5 ? -1 : 1; orbitFlipT = p.t; }
    const t2 = V.toward(me, en);
    const pv = V.perp(t2);
    let ox = t2.x * 0.55 + pv.x * orbitSign;
    let oz = t2.z * 0.55 + pv.z * orbitSign;
    const tx = s.x + ox * 2.2, tz = s.z + oz * 2.2;
    if (Math.abs(tx) > 18.6 || Math.abs(tz) > 18.6 || inBlock(tx, tz, 1.3)) {
      orbitSign = -orbitSign; orbitFlipT = p.t;
      ox = t2.x * 0.55 - pv.x * orbitSign * -1;
      ox = t2.x * 0.55 + pv.x * orbitSign;
      oz = t2.z * 0.55 + pv.z * orbitSign;
    }
    api.move(ox, oz);
    return;
  }

  if (e.visible && laserThreat && d > 6.2 && p.t < 42) {
    const c = findCover(p);
    if (c) {
      const gain = Math.hypot(c.x - e.x, c.z - e.z);
      if (gain < d + 3.5) {
        moveSmart(api, p, c.x, c.z);
        return;
      }
    }
  }

  const lead = predict(e, Math.min(0.9, d / 5.35) * 0.5);
  moveSmart(api, p, lead.x, lead.z);
}
