const BOXES = [
  { x: -7, z: -3, hx: 1.2, hz: 3.5 },
  { x: 7, z: 3, hx: 1.2, hz: 3.5 },
  { x: 0, z: -10, hx: 3.6, hz: 1.2 },
  { x: 0, z: 10, hx: 3.6, hz: 1.2 },
  { x: -12.5, z: 11, hx: 1.6, hz: 1.6 },
  { x: 12.5, z: -11, hx: 1.6, hz: 1.6 }
];

let lastLaserStart = -99;
let lastBlinkStart = -99;
let lastEnemyJump = -99;
let orbitSign = 1;
let lastFlip = 0;
let lastHitAt = -99;
let lastSaid = -99;
let chargeOrderedAt = -99;

function boxes(p) {
  return (p.arena && p.arena.obstacles && p.arena.obstacles.length) ? p.arena.obstacles : BOXES;
}

function segBlocked(ax, az, bx, bz, obs) {
  const dx = bx - ax, dz = bz - az;
  for (const o of obs) {
    const minx = o.x - o.hx, maxx = o.x + o.hx;
    const minz = o.z - o.hz, maxz = o.z + o.hz;
    let t0 = 0, t1 = 1;
    if (Math.abs(dx) < 1e-9) {
      if (ax < minx || ax > maxx) continue;
    } else {
      let ta = (minx - ax) / dx, tb = (maxx - ax) / dx;
      if (ta > tb) { const t = ta; ta = tb; tb = t; }
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
      if (t0 > t1) continue;
    }
    if (Math.abs(dz) < 1e-9) {
      if (az < minz || az > maxz) continue;
    } else {
      let ta = (minz - az) / dz, tb = (maxz - az) / dz;
      if (ta > tb) { const t = ta; ta = tb; tb = t; }
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
      if (t0 > t1) continue;
    }
    if (t0 <= t1) return true;
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

function angErr(heading, tx, tz, sx, sz) {
  const want = Math.atan2(tx - sx, tz - sz);
  let d = want - heading;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function coverPoint(p, me, en, maxDetour) {
  const obs = boxes(p);
  let best = null, bestScore = 1e9;
  const offs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  for (const o of obs) {
    for (const s of offs) {
      const cx = o.x + s[0] * (o.hx + 1.9);
      const cz = o.z + s[1] * (o.hz + 1.9);
      if (Math.abs(cx) > 18.3 || Math.abs(cz) > 18.3) continue;
      if (!segBlocked(cx, cz, en.x, en.z, obs)) continue;
      const d = Math.hypot(cx - me.x, cz - me.z);
      if (d > maxDetour) continue;
      const score = d + 0.4 * Math.hypot(cx - en.x, cz - en.z);
      if (score < bestScore) { bestScore = score; best = { x: cx, z: cz }; }
    }
  }
  return best;
}

function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en.alive) return;

  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      if (e.skill === 'laser') lastLaserStart = p.t;
      else if (e.skill === 'blink') lastBlinkStart = p.t;
      else if (e.skill === 'jump') lastEnemyJump = p.t;
    } else if (e.type === 'damaged') {
      lastHitAt = p.t;
      orbitSign = -orbitSign;
      lastFlip = p.t;
    } else if (e.type === 'blocked') {
      orbitSign = -orbitSign;
      lastFlip = p.t;
    }
  }

  const dist = en.dist;
  const obs = boxes(p);

  // ---- busy: keep aiming through wind-ups ----
  if (me.stunned) return;
  if (me.casting) {
    const c = me.casting;
    if (c.skill === 'smash' && c.phase === 'windup') {
      const t = Math.max(0, c.remaining || 0.1);
      const q = predict(en, t);
      api.faceAt(q.x, q.z);
      if (dist > 2.6) api.move(q.x - me.x, q.z - me.z);
      else api.stop();
      return;
    }
    if (c.skill === 'charge' && c.phase === 'windup') {
      const t = Math.max(0, c.remaining || 0.1) + Math.min(0.8, dist / 15);
      const q = predict(en, t);
      api.faceAt(q.x, q.z);
      return;
    }
    if (c.phase === 'dash') return;
    // air / recover
    api.faceAt(en.x, en.z);
    return;
  }
  if (me.airborne) { api.faceAt(en.x, en.z); return; }

  const enemyTele = en.casting && en.casting.telegraph;
  const enemyLaser = !!(enemyTele && en.casting.skill === 'laser');
  const laserProbablyReady = (p.t - lastLaserStart) > 2.05;

  const lead = predict(en, Math.min(0.35, dist / 12));
  api.faceAt(lead.x, lead.z);

  // ---- SMASH ----
  const smashSpot = predict(en, 0.28);
  const dPred = Math.hypot(smashSpot.x - me.x, smashSpot.z - me.z);
  const enemyLandsSoon = !en.airborne || (en.casting && en.casting.remaining <= 0.30);
  if (api.ready('smash') && dPred <= 4.5 && dist <= 5.4 && enemyLandsSoon && !en.invulnerable && (p.t - lastBlinkStart) > 0.30) {
    api.faceAt(smashSpot.x, smashSpot.z);
    api.use('smash');
    if (dist > 2.8) api.move(smashSpot.x - me.x, smashSpot.z - me.z);
    else api.stop();
    return;
  }

  // ---- CHARGE ----
  if (api.ready('charge') && en.visible && !en.invulnerable && (p.t - lastBlinkStart) > 0.32) {
    const flight = Math.min(0.8, Math.max(0.05, (dist - 2.2) / 15));
    const q = predict(en, 0.28 + flight);
    const clear = !segBlocked(me.x, me.z, q.x, q.z, obs);
    const dq = Math.hypot(q.x - me.x, q.z - me.z);
    const worth = dist >= 3.2 && dist <= 11.5;
    if (worth && clear && dq <= 12.4) {
      const err = Math.abs(angErr(me.heading, q.x, q.z, me.x, me.z));
      api.faceAt(q.x, q.z);
      if (err < 0.85) {
        api.use('charge');
        chargeOrderedAt = p.t;
        api.move(q.x - me.x, q.z - me.z);
        return;
      }
      api.move(q.x - me.x, q.z - me.z);
      return;
    }
  }

  // ---- MELEE DANCE ----
  if (dist <= 6.2) {
    if (p.t - lastFlip > 1.1) { orbitSign = -orbitSign; lastFlip = p.t; }
    const toE = { x: en.x - me.x, z: en.z - me.z };
    const n = Math.max(0.001, Math.hypot(toE.x, toE.z));
    const ux = toE.x / n, uz = toE.z / n;
    const px = -uz * orbitSign, pz = ux * orbitSign;
    let radial = 1;
    if (dist < 2.3) radial = -0.5;
    else if (dist < 3.2) radial = 0.1;
    let mx = ux * radial + px * 0.85;
    let mz = uz * radial + pz * 0.85;
    // stay off walls
    if (me.x > 17.5 && mx > 0) mx = -0.5;
    if (me.x < -17.5 && mx < 0) mx = 0.5;
    if (me.z > 17.5 && mz > 0) mz = -0.5;
    if (me.z < -17.5 && mz < 0) mz = 0.5;
    api.move(mx, mz);
    api.faceAt(lead.x, lead.z);
    if (p.t - lastSaid > 6) { lastSaid = p.t; api.say("come here, squid"); }
    return;
  }

  // ---- LONG RANGE ----
  if (enemyLaser && en.visible && dist > 6) {
    const cp = coverPoint(p, me, en, 7.5);
    if (cp) {
      api.moveTo(cp.x, cp.z);
      api.faceAt(en.x, en.z);
      return;
    }
    // no cover: sprint at them off-axis
    const toE = V.norm({ x: en.x - me.x, z: en.z - me.z });
    const pr = V.perp(toE);
    api.move(toE.x + pr.x * 0.55 * orbitSign, toE.z + pr.z * 0.55 * orbitSign);
    api.faceAt(en.x, en.z);
    return;
  }

  if (dist > 11 && en.visible && laserProbablyReady) {
    const cp = coverPoint(p, me, en, Math.min(9, dist * 0.7));
    if (cp && Math.hypot(cp.x - en.x, cp.z - en.z) < dist - 1.5) {
      api.moveTo(cp.x, cp.z);
      api.faceAt(en.x, en.z);
      return;
    }
  }

  const chase = predict(en, Math.min(0.6, dist / 10));
  api.moveTo(chase.x, chase.z);
  api.faceAt(chase.x, chase.z);
  if (p.t - lastSaid > 8) { lastSaid = p.t; api.say("closing"); }
}
