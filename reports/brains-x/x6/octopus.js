const OB_PAD = 1.15;
const enemyLast = {};
let lastDir = { x: 0, z: 1 };
let lastLaserT = -99;

function blockedPt(x, z, obs, pad) {
  for (const b of obs) {
    if (Math.abs(x - b.x) < b.hx + pad && Math.abs(z - b.z) < b.hz + pad) return true;
  }
  return false;
}

function segHitsBox(ax, az, bx, bz, b, pad) {
  const minx = b.x - b.hx - pad, maxx = b.x + b.hx + pad;
  const minz = b.z - b.hz - pad, maxz = b.z + b.hz + pad;
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dz = bz - az;
  if (Math.abs(dx) < 1e-9) {
    if (ax < minx || ax > maxx) return false;
  } else {
    let ta = (minx - ax) / dx, tb = (maxx - ax) / dx;
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return false;
  }
  if (Math.abs(dz) < 1e-9) {
    if (az < minz || az > maxz) return false;
  } else {
    let ta = (minz - az) / dz, tb = (maxz - az) / dz;
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return false;
  }
  return true;
}

function losClear(ax, az, bx, bz, obs) {
  for (const b of obs) if (segHitsBox(ax, az, bx, bz, b, 0)) return false;
  return true;
}

function landingOf(px, pz, dx, dz, obs, half) {
  let best = 0;
  for (let t = 7.5; t >= 0.5; t -= 0.5) {
    const x = px + dx * t, z = pz + dz * t;
    if (Math.abs(x) > half - 1.1 || Math.abs(z) > half - 1.1) continue;
    if (blockedPt(x, z, obs, 1.05)) continue;
    best = t;
    break;
  }
  return { t: best, x: px + dx * best, z: pz + dz * best };
}

function pickBlink(p, api, prefX, prefZ, avoidLine) {
  const me = p.self, en = p.enemy, obs = p.arena.obstacles, half = p.arena.half;
  let best = null, bestS = -1e9;
  for (let i = 0; i < 20; i++) {
    const a = (i * Math.PI * 2) / 20;
    const dx = Math.sin(a), dz = Math.cos(a);
    const L = landingOf(me.x, me.z, dx, dz, obs, half);
    if (L.t < 2.5) continue;
    let s = 0;
    s += (dx * prefX + dz * prefZ) * 4;
    s += L.t * 0.5;
    const de = Math.hypot(L.x - en.x, L.z - en.z);
    s += Math.min(de, 16) * 0.6;
    if (avoidLine) {
      const rx = L.x - avoidLine.x, rz = L.z - avoidLine.z;
      const perp = Math.abs(rx * avoidLine.dz - rz * avoidLine.dx);
      s += Math.min(perp, 7) * 3.5;
    }
    s -= Math.max(0, Math.abs(L.x) - (half - 4)) * 2;
    s -= Math.max(0, Math.abs(L.z) - (half - 4)) * 2;
    if (s > bestS) { bestS = s; best = { x: dx, z: dz }; }
  }
  return best;
}

function pickMove(p, wantLOS, desired) {
  const me = p.self, en = p.enemy, obs = p.arena.obstacles, half = p.arena.half;
  let best = null, bestS = -1e9;
  const step = 2.7;
  const tw = V.toward(me, en);
  const seeNow = losClear(me.x, me.z, en.x, en.z, obs);
  for (let i = 0; i < 24; i++) {
    const a = (i * Math.PI * 2) / 24;
    const dx = Math.sin(a), dz = Math.cos(a);
    const fx = me.x + dx * step, fz = me.z + dz * step;
    const mx = me.x + dx * 1.25, mz = me.z + dz * 1.25;
    let s = 0;
    if (blockedPt(fx, fz, obs, OB_PAD) || blockedPt(mx, mz, obs, OB_PAD)) s -= 70;
    if (Math.abs(fx) > half - 1.3 || Math.abs(fz) > half - 1.3) s -= 50;
    s -= Math.max(0, Math.abs(fx) - (half - 4.5)) * 3.5;
    s -= Math.max(0, Math.abs(fz) - (half - 4.5)) * 3.5;
    const dd = Math.hypot(fx - en.x, fz - en.z);
    s -= Math.abs(dd - desired) * 1.7;
    const clear = losClear(fx, fz, en.x, en.z, obs);
    if (wantLOS) {
      if (clear) s += 5;
      if (!seeNow) s += (dx * tw.x + dz * tw.z) * 3;
    } else {
      if (!clear) s += 9;
    }
    s += (dx * lastDir.x + dz * lastDir.z) * 1.6;
    if (s > bestS) { bestS = s; best = { x: dx, z: dz }; }
  }
  return best || { x: -tw.x, z: -tw.z };
}

function think(p, api) {
  const me = p.self, en = p.enemy, obs = p.arena.obstacles;

  for (const e of p.events) {
    if (e.type === 'enemyStarted' && e.skill) enemyLast[e.skill] = p.t;
  }
  if (!me.alive || !en) return;

  const d = en.dist;
  const tw = V.toward(me, en);
  const enCast = en.casting;
  const charging = !!(enCast && enCast.skill === 'charge' && enCast.phase !== 'recover');
  const smashTel = !!(enCast && enCast.skill === 'smash' && enCast.telegraph);
  const chargeReady = !enemyLast.charge || (p.t - enemyLast.charge) >= 4.0;

  // ---- facing target (lead the shot) ----
  let tt = 0.55;
  if (me.casting && me.casting.skill === 'laser' && me.casting.telegraph) {
    tt = Math.max(0, Math.min(0.7, me.casting.remaining || 0.3));
  }
  const aimX = en.x + en.vx * tt, aimZ = en.z + en.vz * tt;
  api.faceAt(aimX, aimZ);

  if (me.airborne || me.stunned) return;

  const canAct = !me.busy;

  // ---- dodge an incoming charge ----
  if (charging && canAct) {
    const h = en.heading;
    const cd = { x: Math.sin(h), z: Math.cos(h) };
    const imminent = enCast.phase === 'dash' || (enCast.phase === 'windup' && (enCast.remaining || 0) <= 0.17);
    const perpDist = Math.abs((me.x - en.x) * cd.z - (me.z - en.z) * cd.x);
    const ahead = (me.x - en.x) * cd.x + (me.z - en.z) * cd.z;
    const inPath = perpDist < 3.2 && ahead > -1 && ahead < 14;
    if (imminent && inPath && api.ready('blink')) {
      let px = -cd.z, pz = cd.x;
      const side = (me.x - en.x) * px + (me.z - en.z) * pz;
      if (side < 0) { px = -px; pz = -pz; }
      const dir = pickBlink(p, api, px, pz, { x: en.x, z: en.z, dx: cd.x, dz: cd.z });
      if (dir) {
        api.use('blink', dir.x, dir.z);
        lastDir = dir;
        api.move(dir.x, dir.z);
        return;
      }
    }
    // sidestep while they wind up
    let px = -cd.z, pz = cd.x;
    const side = (me.x - en.x) * px + (me.z - en.z) * pz;
    if (side < 0) { px = -px; pz = -pz; }
    let bx = px + tw.x * -0.4, bz = pz + tw.z * -0.4;
    const fx = me.x + bx * 2.2, fz = me.z + bz * 2.2;
    if (blockedPt(fx, fz, obs, OB_PAD) || Math.abs(fx) > p.arena.half - 1.3 || Math.abs(fz) > p.arena.half - 1.3) {
      bx = -px; bz = -pz;
    }
    const n = V.norm({ x: bx, z: bz });
    lastDir = n;
    api.move(n.x, n.z);
    return;
  }

  // ---- dodge a smash by hopping over it ----
  if (smashTel && d < 7.5 && canAct) {
    if (api.ready('jump')) {
      const away = pickMove(p, false, 16);
      lastDir = away;
      api.move(away.x, away.z);
      api.use('jump');
      return;
    }
    if (api.ready('blink') && d < 5.5) {
      const dir = pickBlink(p, api, -tw.x, -tw.z, null);
      if (dir) {
        lastDir = dir;
        api.move(dir.x, dir.z);
        api.use('blink', dir.x, dir.z);
        return;
      }
    }
  }

  // ---- emergency disengage ----
  if (canAct && d < 4.6 && api.ready('blink') && !me.invulnerable) {
    const dir = pickBlink(p, api, -tw.x, -tw.z, null);
    if (dir) {
      lastDir = dir;
      api.move(dir.x, dir.z);
      api.use('blink', dir.x, dir.z);
      return;
    }
  }

  const laserCd = api.cooldown('laser');
  const wantLOS = laserCd < 0.5 || d > 15;
  let desired = wantLOS ? 13.5 : 11.5;
  if (!wantLOS && d < 14) desired = 10;
  if (me.hp < 45) desired += 2;

  // ---- fire ----
  const safeDist = chargeReady ? 8.6 : 6.4;
  const enemyBusyHarmless = en.stunned ||
    (enCast && (enCast.skill === 'jump' || (enCast.skill === 'smash' && enCast.phase === 'recover') ||
      (enCast.skill === 'charge' && enCast.phase === 'recover')));
  if (canAct && api.ready('laser') && en.visible && d < 21.5 && !charging &&
      (d > safeDist || enemyBusyHarmless)) {
    const ang = Math.abs(V.angleTo(me.heading, { x: aimX - me.x, z: aimZ - me.z }));
    if (ang < 1.0) {
      api.use('laser');
      lastLaserT = p.t;
      const mv = pickMove(p, true, desired);
      lastDir = mv;
      api.move(mv.x, mv.z);
      return;
    }
  }

  const mv = pickMove(p, wantLOS, desired);
  lastDir = mv;
  api.move(mv.x, mv.z);
}
