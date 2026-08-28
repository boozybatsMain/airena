function segBox(ax, az, bx, bz, o, pad) {
  const minx = o.x - o.hx - pad, maxx = o.x + o.hx + pad;
  const minz = o.z - o.hz - pad, maxz = o.z + o.hz + pad;
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dz = bz - az;
  if (Math.abs(dx) < 1e-9) { if (ax < minx || ax > maxx) return false; }
  else {
    let ta = (minx - ax) / dx, tb = (maxx - ax) / dx;
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    if (ta > t0) t0 = ta; if (tb < t1) t1 = tb;
    if (t0 > t1) return false;
  }
  if (Math.abs(dz) < 1e-9) { if (az < minz || az > maxz) return false; }
  else {
    let ta = (minz - az) / dz, tb = (maxz - az) / dz;
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    if (ta > t0) t0 = ta; if (tb < t1) t1 = tb;
    if (t0 > t1) return false;
  }
  return true;
}

function clearLine(obs, ax, az, bx, bz, pad) {
  for (const o of obs) if (segBox(ax, az, bx, bz, o, pad)) return false;
  return true;
}

function insideBox(obs, x, z, pad) {
  for (const o of obs) {
    if (x > o.x - o.hx - pad && x < o.x + o.hx + pad && z > o.z - o.hz - pad && z < o.z + o.hz + pad) return true;
  }
  return false;
}

let prevDir = null;
let lastLaserSeen = -99;
let saidAt = -99;
let lastMode = 'rush';

function pickGoal(api, s, e) {
  const pr = api.pathTo(e.x, e.z);
  if (pr && pr.points && pr.points.length) {
    for (const pt of pr.points) {
      if (Math.hypot(pt.x - s.x, pt.z - s.z) > 1.0) return pt;
    }
  }
  return { x: e.x, z: e.z };
}

function chooseDir(p, obs, goal, mode, laserNow) {
  const s = p.self, e = p.enemy;
  const dGoal = Math.hypot(goal.x - s.x, goal.z - s.z);
  const dEn = Math.hypot(e.x - s.x, e.z - s.z);
  const step = Math.min(4.5, Math.max(1.6, (mode === 'evade' ? 4.5 : dGoal)));
  const toEn = { x: (e.x - s.x) / (dEn || 1), z: (e.z - s.z) / (dEn || 1) };
  let best = null;
  const N = 24;
  for (let i = 0; i < N; i++) {
    const a = i * 2 * Math.PI / N;
    const dir = { x: Math.sin(a), z: Math.cos(a) };
    const px = s.x + dir.x * step, pz = s.z + dir.z * step;
    if (Math.abs(px) > 18.8 || Math.abs(pz) > 18.8) continue;
    if (insideBox(obs, px, pz, 1.4)) continue;
    if (!clearLine(obs, s.x, s.z, px, pz, 1.3)) continue;
    const ng = Math.hypot(goal.x - px, goal.z - pz);
    const ne = Math.hypot(e.x - px, e.z - pz);
    const hidden = !clearLine(obs, px, pz, e.x, e.z, 0.35);
    let sc = 0;
    if (mode === 'evade') {
      sc += 0.7 * (ne - dEn);
      if (hidden) sc += 7.0;
    } else {
      sc += (dGoal - ng);
      if (mode === 'cover' && hidden) sc += 4.5;
      if (mode === 'cover' && !hidden) sc -= 0.4;
    }
    if (laserNow) {
      const lat = Math.abs(dir.x * toEn.z - dir.z * toEn.x) * step;
      sc += 1.1 * lat;
      if (hidden) sc += 4.0;
    }
    if (prevDir) sc += 0.85 * (dir.x * prevDir.x + dir.z * prevDir.z);
    const wd = Math.min(20 - Math.abs(px), 20 - Math.abs(pz));
    if (wd < 3.5) sc -= (3.5 - wd) * 0.7;
    if (!best || sc > best.sc) best = { sc, dir };
  }
  return best ? best.dir : null;
}

function think(p, api) {
  const s = p.self, e = p.enemy;
  if (!s || !e || !s.alive || !e.alive) return;
  const obs = (p.arena && p.arena.obstacles) ? p.arena.obstacles : [];
  const dx = e.x - s.x, dz = e.z - s.z;
  const d = Math.hypot(dx, dz) || 0.001;

  for (const ev of p.events) {
    if (ev.type === 'enemyStarted' && ev.skill === 'laser') lastLaserSeen = p.t;
    if (ev.type === 'blocked') prevDir = null;
  }
  const ec = e.casting;
  const laserNow = !!(ec && ec.skill === 'laser' && ec.telegraph);
  if (laserNow) lastLaserSeen = p.t;
  const laserReady = (p.t - lastLaserSeen) > 1.85;

  if (s.stunned) return;

  const sc = s.casting;
  if (sc && sc.phase === 'windup') {
    if (sc.skill === 'charge') {
      const tRem = sc.remaining || 0;
      const tHit = tRem + Math.max(0, d - 2.3) / 15;
      api.faceAt(e.x + e.vx * tHit * 0.85, e.z + e.vz * tHit * 0.85);
      api.move(dx, dz);
    } else {
      const tRem = (sc.remaining != null ? sc.remaining : 0.15);
      api.faceAt(e.x + e.vx * tRem, e.z + e.vz * tRem);
      api.move(dx, dz);
    }
    return;
  }
  if (s.airborne) { api.faceAt(e.x, e.z); return; }

  api.faceAt(e.x + e.vx * 0.22, e.z + e.vz * 0.22);

  const myFrac = s.hp / s.maxHp, eFrac = e.hp / e.maxHp;
  let mode = 'rush';
  if (p.t > 31.5 && myFrac > eFrac + 0.02) mode = 'evade';
  else if (d > 6.5 && (laserReady || laserNow)) mode = 'cover';
  lastMode = mode;

  let goal;
  if (mode === 'evade') goal = { x: s.x - dx, z: s.z - dz };
  else goal = pickGoal(api, s, e);

  const dir = chooseDir(p, obs, goal, mode, laserNow);
  if (dir) { prevDir = dir; api.move(dir.x, dir.z); }
  else api.moveTo(e.x, e.z);

  if (s.busy) return;

  const airRisk = e.airborne && !(ec && ec.phase === 'air' && ec.remaining != null && ec.remaining < 0.2);

  const T = 0.3;
  const px = e.x + e.vx * T, pz = e.z + e.vz * T;
  const mx = s.x + s.vx * T * 0.6, mz = s.z + s.vz * T * 0.6;
  const pd = Math.hypot(px - mx, pz - mz) || 0.001;
  const ang = Math.abs(V.angleTo(s.heading, { x: (px - mx) / pd, z: (pz - mz) / pd }));

  if (api.ready('smash') && pd <= 4.85 && ang <= 1.2 && !e.invulnerable && !airRisk) {
    api.use('smash');
    if (p.t - saidAt > 6) { saidAt = p.t; api.say("hands"); }
    return;
  }

  const lineOK = clearLine(obs, s.x, s.z, e.x, e.z, 1.1);
  if (api.ready('charge') && lineOK && !e.invulnerable && mode !== 'evade') {
    if (laserNow && d >= 2.4 && d <= 11.5) { api.use('charge'); return; }
    if (d >= 4.7 && d <= 11.5 && !airRisk) { api.use('charge'); return; }
    if (d > 13 && d <= 30 && p.t < 6) { api.use('charge'); return; }
  }
}
