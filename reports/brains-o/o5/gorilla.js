function pred(e, t) { return { x: e.x + e.vx * t, z: e.z + e.vz * t }; }

function segHitsBox(ax, az, bx, bz, b, pad) {
  const hx = b.hx + pad, hz = b.hz + pad;
  const dx = bx - ax, dz = bz - az;
  let tmin = 0, tmax = 1;
  if (Math.abs(dx) < 1e-9) {
    if (ax < b.x - hx || ax > b.x + hx) return false;
  } else {
    let t1 = (b.x - hx - ax) / dx, t2 = (b.x + hx - ax) / dx;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return false;
  }
  if (Math.abs(dz) < 1e-9) {
    if (az < b.z - hz || az > b.z + hz) return false;
  } else {
    let t1 = (b.z - hz - az) / dz, t2 = (b.z + hz - az) / dz;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return false;
  }
  return true;
}

function clearLine(ax, az, bx, bz, obs, pad) {
  for (let i = 0; i < obs.length; i++) if (segHitsBox(ax, az, bx, bz, obs[i], pad)) return false;
  return true;
}

function insideBox(x, z, b, pad) {
  return Math.abs(x - b.x) <= b.hx + pad && Math.abs(z - b.z) <= b.hz + pad;
}

function findCover(me, ex, ez, obs, maxR, curDist, needProgress) {
  let best = null, bestScore = 1e9;
  for (let ri = 0; ri < 3; ri++) {
    const r = maxR * (0.45 + 0.275 * ri);
    if (r < 1.2) continue;
    for (let k = 0; k < 20; k++) {
      const a = k * Math.PI * 2 / 20;
      const x = me.x + Math.sin(a) * r, z = me.z + Math.cos(a) * r;
      if (Math.abs(x) > 18.4 || Math.abs(z) > 18.4) continue;
      let bad = false;
      for (let i = 0; i < obs.length; i++) if (insideBox(x, z, obs[i], 1.55)) { bad = true; break; }
      if (bad) continue;
      if (!clearLine(me.x, me.z, x, z, obs, 1.35)) continue;
      if (clearLine(x, z, ex, ez, obs, 0)) continue;
      const de = Math.hypot(x - ex, z - ez);
      if (needProgress && de > curDist - 0.4) continue;
      const score = de + r * 0.35;
      if (score < bestScore) { bestScore = score; best = { x, z }; }
    }
  }
  return best;
}

let laserStart = -99;
let blinkStart = -99;
let orbitDir = 1;
let lastBlockT = -99;
let lastFlip = 0;
let saidHi = false;

function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive) return;
  const obs = p.arena.obstacles;

  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      if (e.skill === 'laser') laserStart = p.t;
      else if (e.skill === 'blink') blinkStart = p.t;
    } else if (e.type === 'blocked') {
      lastBlockT = p.t;
      if (e.by === 'obstacle') { orbitDir = -orbitDir; lastFlip = p.t; }
    } else if (e.type === 'damaged' && e.skill === 'laser') {
      laserStart = p.t - 0.7;
    }
  }

  if (!saidHi) { saidHi = true; api.say("come here, little squid"); }

  if (!en.alive) { api.stop(); return; }
  if (me.stunned) return;

  const d = en.dist;
  const vis = en.visible;
  const enCast = en.casting;
  const enLasering = !!(enCast && enCast.skill === 'laser' && enCast.telegraph);
  const laserRemain = enLasering ? Math.max(0, enCast.remaining) : 99;
  const laserCdLeft = Math.max(0, 2.2 - (p.t - laserStart));

  // ---- already committed to something ----
  if (me.casting) {
    const c = me.casting;
    if (c.skill === 'smash' && c.phase === 'windup') {
      const pt = pred(en, Math.max(0, c.remaining));
      api.faceAt(pt.x, pt.z);
      if (d > 2.7) api.move(en.x - me.x, en.z - me.z);
      else api.move(en.x - me.x, en.z - me.z);
    } else if (c.skill === 'charge' && c.phase === 'windup') {
      const th = 0.3 + Math.max(0, d - 2.25) / 15;
      const pt = pred(en, Math.min(th, 0.9));
      api.faceAt(pt.x, pt.z);
    } else {
      api.faceAt(en.x, en.z);
    }
    return;
  }
  if (me.airborne) { api.faceAt(en.x, en.z); return; }

  // ---- SMASH ----
  const sp = pred(en, 0.3);
  const sdx = sp.x - me.x, sdz = sp.z - me.z;
  const dPred = Math.hypot(sdx, sdz);
  const ang = Math.abs(V.angleTo(me.heading, { x: sdx, z: sdz }));
  const enemyLandingSoon = en.airborne && enCast && enCast.remaining <= 0.2;
  if (api.ready('smash') && dPred <= 4.75 && ang < 1.25 && !en.invulnerable &&
      (!en.airborne || enemyLandingSoon)) {
    api.use('smash');
    api.faceAt(sp.x, sp.z);
    api.move(en.x - me.x, en.z - me.z);
    return;
  }

  // ---- CHARGE ----
  const th = 0.3 + Math.max(0, d - 2.25) / 15;
  const cp = pred(en, Math.min(th, 0.9));
  const cdx = cp.x - me.x, cdz = cp.z - me.z;
  const distC = Math.hypot(cdx, cdz);
  if (api.ready('charge') && vis && !en.invulnerable && distC < 10.5 &&
      (d > 4.6 || (enLasering && d > 3.0)) &&
      clearLine(me.x, me.z, cp.x, cp.z, obs, 1.1)) {
    api.use('charge');
    api.faceAt(cp.x, cp.z);
    return;
  }

  // ---- facing ----
  const fp = pred(en, 0.15);
  api.faceAt(fp.x, fp.z);

  if (p.t - lastFlip > 2.2) { lastFlip = p.t; if (api.rand() < 0.4) orbitDir = -orbitDir; }

  const directClear = clearLine(me.x, me.z, en.x, en.z, obs, 1.3) && (p.t - lastBlockT > 0.6);

  // ---- close range: press, orbit while they cast ----
  if (d < 5.2) {
    const tw = V.norm({ x: en.x - me.x, z: en.z - me.z });
    if ((enLasering || laserCdLeft < 0.35) && d > 2.6) {
      const pv = V.perp(tw);
      let mx = tw.x * 0.55 + pv.x * orbitDir * 1.0;
      let mz = tw.z * 0.55 + pv.z * orbitDir * 1.0;
      const nx = me.x + mx * 2.2, nz = me.z + mz * 2.2;
      let blockedCand = Math.abs(nx) > 18.6 || Math.abs(nz) > 18.6;
      if (!blockedCand) for (const b of obs) if (insideBox(nx, nz, b, 1.5)) { blockedCand = true; break; }
      if (blockedCand) { orbitDir = -orbitDir; mx = tw.x; mz = tw.z; }
      api.move(mx, mz);
    } else {
      api.move(tw.x, tw.z);
    }
    return;
  }

  // ---- being lasered right now: try to break line of sight ----
  if (enLasering && vis && laserRemain > 0.12) {
    const reach = Math.min(5.35 * laserRemain + 0.8, 6.5);
    const cov = findCover(me, en.x, en.z, obs, reach, d, false);
    if (cov) { api.moveTo(cov.x, cov.z); return; }
  }

  // ---- mid/long range approach, prefer cover when the beam is loaded ----
  if (vis && d > 6.5 && laserCdLeft < 0.7) {
    const cov = findCover(me, en.x, en.z, obs, 6.0, d, true);
    if (cov) { api.moveTo(cov.x, cov.z); return; }
  }

  if (directClear) api.move(en.x - me.x, en.z - me.z);
  else api.moveTo(en.x, en.z);
}
