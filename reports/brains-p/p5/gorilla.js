const OBSTPAD = 0;
let orbitDir = 1;
let lastLaserStart = -99;
let lastBlinkStart = -99;
let saidHi = false;
let coverTgt = null;
let coverTime = -99;
let lastSay = -99;

function segBox(ax, az, bx, bz, o, pad) {
  const minx = o.x - o.hx - pad, maxx = o.x + o.hx + pad;
  const minz = o.z - o.hz - pad, maxz = o.z + o.hz + pad;
  const dx = bx - ax, dz = bz - az;
  let t0 = 0, t1 = 1;
  if (Math.abs(dx) < 1e-9) {
    if (ax < minx || ax > maxx) return false;
  } else {
    let ta = (minx - ax) / dx, tb = (maxx - ax) / dx;
    if (ta > tb) { const t = ta; ta = tb; tb = t; }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return false;
  }
  if (Math.abs(dz) < 1e-9) {
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

function clearLine(ax, az, bx, bz, obs, pad) {
  for (const o of obs) if (segBox(ax, az, bx, bz, o, pad)) return false;
  return true;
}

function inArena(x, z, m) {
  return Math.abs(x) < 20 - m && Math.abs(z) < 20 - m;
}

function inBox(x, z, obs, pad) {
  for (const o of obs) {
    if (Math.abs(x - o.x) < o.hx + pad && Math.abs(z - o.z) < o.hz + pad) return true;
  }
  return false;
}

function dist2d(ax, az, bx, bz) {
  return Math.hypot(bx - ax, bz - az);
}

function predict(e, t) {
  return { x: e.x + e.vx * t, z: e.z + e.vz * t };
}

function avoidDir(me, dir, obs) {
  const probe = 2.4;
  for (let k = 0; k < 6; k++) {
    for (const s of [1, -1]) {
      const a = k * 0.4 * s;
      const d2 = V.rot(dir, a);
      const px = me.x + d2.x * probe, pz = me.z + d2.z * probe;
      if (inArena(px, pz, 1.5) && !inBox(px, pz, obs, 1.45)) return d2;
      if (k === 0) break;
    }
  }
  return dir;
}

function pickPoint(p, obs, coverWeight, radii) {
  const me = p.self, en = p.enemy;
  let best = null, bestScore = -1e9;
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8;
    const dir = { x: Math.sin(a), z: Math.cos(a) };
    for (const r of radii) {
      const cx = me.x + dir.x * r, cz = me.z + dir.z * r;
      if (!inArena(cx, cz, 1.7)) continue;
      if (inBox(cx, cz, obs, 1.6)) continue;
      if (!clearLine(me.x, me.z, cx, cz, obs, 1.15)) continue;
      const dd = dist2d(cx, cz, en.x, en.z);
      const covered = !clearLine(en.x, en.z, cx, cz, obs, OBSTPAD);
      let s = (en.dist - dd) * 1.0;
      if (covered) s += coverWeight;
      if (dd < 3.0) s -= (3.0 - dd) * 2.0;
      const wallPen = Math.max(0, 3.0 - (20 - Math.max(Math.abs(cx), Math.abs(cz))));
      s -= wallPen * 0.8;
      if (s > bestScore) { bestScore = s; best = { x: cx, z: cz }; }
    }
  }
  return best;
}

function think(p, api) {
  const me = p.self, en = p.enemy, obs = p.arena.obstacles;
  if (!me.alive) return;

  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      if (e.skill === 'laser') lastLaserStart = p.t;
      else if (e.skill === 'blink') lastBlinkStart = p.t;
    } else if (e.type === 'blocked') {
      orbitDir = -orbitDir;
    } else if (e.type === 'damaged' && e.skill === 'laser') {
      lastLaserStart = p.t - 0.7;
    }
  }

  if (!saidHi) { saidHi = true; api.say("Ape close. Ape smash."); lastSay = p.t; }

  if (!en || !en.alive) { api.stop(); return; }
  if (me.stunned) return;
  if (me.airborne) { api.faceAt(en.x, en.z); return; }

  const d = en.dist;
  const vis = en.visible;
  const laserReadyIn = Math.max(0, lastLaserStart + 2.2 - p.t);
  const enemyCasting = en.casting && en.casting.telegraph;
  const enemyLasering = enemyCasting && en.casting.skill === 'laser';
  const enemySafeTarget = !en.invulnerable && !en.airborne &&
    !(en.casting && en.casting.skill === 'jump' && en.casting.phase !== 'recover');

  const myFrac = me.hp / me.maxHp;
  const enFrac = en.hp / en.maxHp;
  const turtle = p.t > 30 && myFrac > enFrac + 0.04;

  // ---- charge intercept solution ----
  let ct = 0.3 + Math.max(0, d - 2.25) / 15;
  for (let i = 0; i < 3; i++) {
    const tx = en.x + en.vx * ct, tz = en.z + en.vz * ct;
    const dd = dist2d(me.x, me.z, tx, tz);
    ct = 0.3 + Math.max(0, dd - 2.25) / 15;
  }
  const cTarget = { x: en.x + en.vx * ct * 0.85, z: en.z + en.vz * ct * 0.85 };

  // ---- committed charge wind-up: only steer facing ----
  if (me.casting && me.casting.skill === 'charge') {
    if (me.casting.phase === 'windup') {
      api.faceAt(cTarget.x, cTarget.z);
      api.move(cTarget.x - me.x, cTarget.z - me.z);
    }
    return;
  }
  if (me.casting && me.casting.skill === 'smash' && me.casting.phase === 'windup') {
    const ps = predict(en, Math.max(0, me.casting.remaining));
    api.faceAt(ps.x, ps.z);
    const dirS = V.norm({ x: ps.x - me.x, z: ps.z - me.z });
    api.move(dirS.x, dirS.z);
    return;
  }

  // ---- default facing ----
  const pf = predict(en, 0.18);
  api.faceAt(pf.x, pf.z);

  // ---- smash evaluation ----
  const mp = { x: me.x + me.vx * 0.28, z: me.z + me.vz * 0.28 };
  const ps = predict(en, 0.3);
  const dsm = dist2d(mp.x, mp.z, ps.x, ps.z);
  const toPs = V.norm({ x: ps.x - me.x, z: ps.z - me.z });
  const angErr = Math.abs(V.angleTo(me.heading, toPs));

  let usedSkill = false;

  if (!me.busy && api.ready('smash') && enemySafeTarget && dsm <= 4.65 && angErr < 1.35 &&
      clearLine(me.x, me.z, en.x, en.z, obs, 0)) {
    api.use('smash');
    usedSkill = true;
  }

  // ---- charge evaluation ----
  const chargeClear = clearLine(me.x, me.z, cTarget.x, cTarget.z, obs, 0.85) &&
    inArena(cTarget.x, cTarget.z, 0.5);
  const chargeGeom = api.ready('charge') && !me.busy && vis && enemySafeTarget &&
    d >= 2.9 && d <= 11.4 && chargeClear && angErr < 0.95;

  if (!usedSkill && chargeGeom) {
    const smashSoon = api.cooldown('smash') < 0.25 && d < 4.9;
    const want = enemyLasering || en.stunned || d > 4.6 || !smashSoon;
    if (want) {
      api.faceAt(cTarget.x, cTarget.z);
      api.use('charge');
      api.move(cTarget.x - me.x, cTarget.z - me.z);
      return;
    }
  }

  // ---- movement ----
  const melee = d < 6.2 && vis;

  if (melee) {
    let dir;
    if (en.invulnerable && d < 3.2) {
      dir = V.norm({ x: me.x - en.x, z: me.z - en.z });
    } else if (d > 3.6) {
      const t = V.norm({ x: ps.x - me.x, z: ps.z - me.z });
      dir = V.rot(t, 0.22 * orbitDir);
    } else {
      const t = V.norm({ x: en.x - me.x, z: en.z - me.z });
      const swing = (d < 2.7) ? 1.25 : 0.85;
      dir = V.rot(t, swing * orbitDir);
    }
    if (dir.x === 0 && dir.z === 0) dir = V.fromHeading(me.heading);
    dir = avoidDir(me, dir, obs);
    api.move(dir.x, dir.z);
    return;
  }

  // far game
  if (enemyLasering && vis && d > 5) {
    const spot = pickPoint(p, obs, 30, [2.6, 3.6]);
    if (spot && !clearLine(en.x, en.z, spot.x, spot.z, obs, OBSTPAD)) {
      api.move(spot.x - me.x, spot.z - me.z);
      return;
    }
    const t = V.norm({ x: en.x - me.x, z: en.z - me.z });
    let dir = V.rot(t, 0.55 * orbitDir);
    dir = avoidDir(me, dir, obs);
    api.move(dir.x, dir.z);
    return;
  }

  const aggressive = !turtle && (laserReadyIn > 0.85 || (api.ready('charge') && d <= 11.5) ||
    en.stunned || d < 7 || !vis && d > 14);

  if (aggressive) {
    api.moveTo(en.x, en.z);
    return;
  }

  const cw = turtle ? 14 : 6.5;
  const needNew = !coverTgt || (p.t - coverTime > 0.35) ||
    dist2d(me.x, me.z, coverTgt.x, coverTgt.z) < 1.2;
  if (needNew) {
    const spot = pickPoint(p, obs, cw, [3.2, 5.5]);
    if (spot) { coverTgt = spot; coverTime = p.t; }
  }
  if (coverTgt) {
    api.move(coverTgt.x - me.x, coverTgt.z - me.z);
  } else {
    api.moveTo(en.x, en.z);
  }
}
