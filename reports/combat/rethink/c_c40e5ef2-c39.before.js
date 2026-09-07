const OBS = [
  { x: -7, z: -3, hx: 1.2, hz: 3.5 },
  { x: 7, z: 3, hx: 1.2, hz: 3.5 },
  { x: 0, z: -10, hx: 3.6, hz: 1.2 },
  { x: 0, z: 10, hx: 3.6, hz: 1.2 },
  { x: -12.5, z: 11, hx: 1.6, hz: 1.6 },
  { x: 12.5, z: -11, hx: 1.6, hz: 1.6 }
];

let lastBlink = -99;
let lastLaser = -99;
let strafe = 1;
let lastFlip = -99;
let saidHi = false;

function segAABB(ax, az, bx, bz, o, pad) {
  const dx = bx - ax, dz = bz - az;
  let tmin = 0, tmax = 1;
  const minx = o.x - o.hx - pad, maxx = o.x + o.hx + pad;
  const minz = o.z - o.hz - pad, maxz = o.z + o.hz + pad;
  if (Math.abs(dx) < 1e-9) {
    if (ax < minx || ax > maxx) return false;
  } else {
    let t1 = (minx - ax) / dx, t2 = (maxx - ax) / dx;
    if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return false;
  }
  if (Math.abs(dz) < 1e-9) {
    if (az < minz || az > maxz) return false;
  } else {
    let t1 = (minz - az) / dz, t2 = (maxz - az) / dz;
    if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return false;
  }
  return true;
}

function segBlocked(ax, az, bx, bz, pad) {
  for (const o of OBS) if (segAABB(ax, az, bx, bz, o, pad)) return true;
  return false;
}

function inBlock(x, z, pad) {
  for (const o of OBS) {
    if (Math.abs(x - o.x) <= o.hx + pad && Math.abs(z - o.z) <= o.hz + pad) return true;
  }
  return false;
}

function angDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

function chargeAim(me, e) {
  let tt = 0.3;
  let px = e.x, pz = e.z;
  for (let i = 0; i < 4; i++) {
    px = e.x + e.vx * tt * 0.75;
    pz = e.z + e.vz * tt * 0.75;
    const dd = Math.hypot(px - me.x, pz - me.z);
    tt = 0.3 + Math.max(0, dd - (me.radius + e.radius)) / 15;
    if (tt > 1.1) tt = 1.1;
  }
  return { x: px, z: pz };
}

function pickDir(p, horizon, coverBonus, closeWeight, avoidDir) {
  const me = p.self, e = p.enemy;
  const half = p.arena.half;
  const d0 = e.dist;
  let best = null, bestScore = -1e9;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const dx = Math.sin(a), dz = Math.cos(a);
    const fx = me.x + dx * horizon, fz = me.z + dz * horizon;
    if (Math.abs(fx) > half - 1.6 || Math.abs(fz) > half - 1.6) continue;
    if (inBlock(fx, fz, me.radius + 0.25)) continue;
    if (segBlocked(me.x, me.z, fx, fz, me.radius * 0.85)) continue;
    const df = Math.hypot(fx - e.x, fz - e.z);
    let s = (d0 - df) * closeWeight;
    const cov = segBlocked(e.x, e.z, fx, fz, 0);
    if (cov) s += coverBonus;
    if (avoidDir) {
      const need = Math.abs(angDiff(Math.atan2(fx - e.x, fz - e.z), e.heading));
      const maxTurn = avoidDir.turn;
      if (!cov) {
        if (need > maxTurn) s += 35 + 12 * (need - maxTurn);
        else s += 6 * need;
      }
    }
    if (df < 1.9) s -= 12;
    const edge = Math.min(half - Math.abs(fx), half - Math.abs(fz));
    if (edge < 3) s -= (3 - edge) * 2.5;
    if (best) {
      // continuity mild bonus toward current heading of motion
    }
    if (s > bestScore) { bestScore = s; best = { x: dx, z: dz }; }
  }
  return best;
}

function think(p, api) {
  const me = p.self, e = p.enemy;
  if (!me.alive) return;
  const t = p.t;

  for (const ev of p.events) {
    if (ev.type === 'enemyStarted') {
      if (ev.skill === 'blink') lastBlink = t;
      else if (ev.skill === 'laser') lastLaser = t;
    } else if (ev.type === 'blocked') {
      if (t - lastFlip > 0.35) { strafe = -strafe; lastFlip = t; }
    } else if (ev.type === 'damaged' && ev.skill === 'laser') {
      if (t - lastFlip > 0.5) { strafe = -strafe; lastFlip = t; }
    }
  }

  if (!saidHi) { saidHi = true; api.say("come here, little squid"); }

  if (!e.alive) { api.stop(); return; }

  const d = e.dist;
  const cast = e.casting;
  const laserCasting = !!(cast && cast.skill === 'laser' && cast.telegraph);
  const laserLeft = laserCasting ? Math.max(0.05, cast.remaining) : 99;
  const laserReadyGuess = (t - lastLaser) > 1.9;

  // --- committed states ---
  if (me.casting && me.casting.skill === 'charge' && me.casting.phase === 'windup') {
    const aim = chargeAim(me, e);
    api.faceAt(aim.x, aim.z);
    api.move(aim.x - me.x, aim.z - me.z);
    return;
  }

  if (me.stunned || me.airborne) {
    api.faceAt(e.x + e.vx * 0.2, e.z + e.vz * 0.2);
    return;
  }

  if (me.busy) {
    const fp = { x: e.x + e.vx * 0.2, z: e.z + e.vz * 0.2 };
    api.faceAt(fp.x, fp.z);
    if (me.casting && me.casting.skill === 'smash') {
      if (d > 2.6) api.move(e.x - me.x, e.z - me.z);
      else api.stop();
    }
    return;
  }

  // --- predicted geometry ---
  const pex = e.x + e.vx * 0.28, pez = e.z + e.vz * 0.28;
  const pmx = me.x + me.vx * 0.28, pmz = me.z + me.vz * 0.28;
  const dPred = Math.hypot(pex - pmx, pez - pmz);
  const angToEnemy = Math.atan2(pex - me.x, pez - me.z);
  const faceErr = Math.abs(angDiff(angToEnemy, me.heading));

  const enemyUntouchable = e.invulnerable || (e.airborne && (!e.casting || e.casting.remaining > 0.28));

  let usedSkill = false;

  // --- SMASH ---
  if (!usedSkill && api.ready('smash') && !enemyUntouchable) {
    const inRange = dPred <= 4.85 || (d <= 5.0 && (e.stunned || laserCasting));
    if (inRange && faceErr < 1.35 && e.visible) {
      api.use('smash');
      usedSkill = true;
    }
  }

  // --- CHARGE ---
  if (!usedSkill && api.ready('charge') && !e.invulnerable && e.visible && d > 3.0 && d < 12.5) {
    const aim = chargeAim(me, e);
    const adx = aim.x - me.x, adz = aim.z - me.z;
    const alen = Math.hypot(adx, adz) || 1;
    const need = Math.max(0, alen - (me.radius + e.radius) + 0.3);
    let clear = true;
    const r = api.ray(adx / alen, adz / alen, Math.min(60, need + 1));
    if (r && r.hit && r.dist < need - 0.6) clear = false;
    const aimErr = Math.abs(angDiff(Math.atan2(adx, adz), me.heading));
    const worthIt = d > 5.2 || (laserCasting && !api.ready('smash')) || (e.stunned && d > 4.2);
    if (clear && worthIt && aimErr < 1.9 && need / 15 < 0.78) {
      api.faceAt(aim.x, aim.z);
      api.use('charge');
      api.move(adx, adz);
      return;
    }
  }

  // --- FACING ---
  api.faceAt(pex, pez);

  // --- MOVEMENT ---
  let dir = null;

  if (laserCasting && e.visible && d > 4.6) {
    const horizon = Math.min(0.6, laserLeft) * 5.2;
    dir = pickDir(p, Math.max(1.4, horizon), 120, 1.5, { turn: 2.1 * laserLeft + 0.08 });
  } else if (laserCasting && d <= 4.6) {
    // press in and circle hard; smash will interrupt
    const tx = e.x - me.x, tz = e.z - me.z;
    const px = -tz, pz2 = tx;
    dir = { x: tx * 0.55 + px * strafe * 0.85, z: tz * 0.55 + pz2 * strafe * 0.85 };
  } else if (d > 6.5) {
    const cb = (laserReadyGuess && d > 8) ? 7 : 0;
    dir = pickDir(p, 3.0, cb, 3.0, null);
    if (!dir) { api.moveTo(e.x, e.z); return; }
    if (!e.visible) {
      const path = api.pathTo(e.x, e.z);
      if (path && !path.direct) { api.moveTo(e.x, e.z); return; }
    }
  } else {
    // brawling range: stay glued, slight orbit
    if (t - lastFlip > 1.6) { strafe = -strafe; lastFlip = t; }
    const tx = e.x - me.x, tz = e.z - me.z;
    const L = Math.hypot(tx, tz) || 1;
    const ux = tx / L, uz = tz / L;
    const sx = -uz * strafe, sz = ux * strafe;
    let w = d > 3.2 ? 1.0 : 0.55;
    let cand = { x: ux * w + sx * 0.5, z: uz * w + sz * 0.5 };
    const fx = me.x + cand.x * 2, fz = me.z + cand.z * 2;
    if (inBlock(fx, fz, me.radius + 0.2) || Math.abs(fx) > p.arena.half - 1.4 || Math.abs(fz) > p.arena.half - 1.4) {
      strafe = -strafe; lastFlip = t;
      cand = { x: ux * w - sx * 0.5, z: uz * w - sz * 0.5 };
    }
    dir = cand;
  }

  if (dir && (dir.x !== 0 || dir.z !== 0)) api.move(dir.x, dir.z);
  else api.moveTo(e.x, e.z);
}
