const OBST_FALLBACK = [
  { x: -7, z: -3, hx: 1.2, hz: 3.5 },
  { x: 7, z: 3, hx: 1.2, hz: 3.5 },
  { x: 0, z: -10, hx: 3.6, hz: 1.2 },
  { x: 0, z: 10, hx: 3.6, hz: 1.2 },
  { x: -12.5, z: 11, hx: 1.6, hz: 1.6 },
  { x: 12.5, z: -11, hx: 1.6, hz: 1.6 }
];

let smashReach = 3.85;
let strafeSign = 1;
let nextFlip = 0;
let prevEnemy = null;
let lastBlinkT = -99;
let lastLaserT = -99;
let hideTarget = null;
let hideTargetT = -99;
let slowSince = -1;
let lastSay = -99;
let chargeAimX = 0, chargeAimZ = 0;

function boxes(p) {
  return (p.arena && p.arena.obstacles && p.arena.obstacles.length) ? p.arena.obstacles : OBST_FALLBACK;
}

function segHitsBox(ax, az, bx, bz, o, pad) {
  const minx = o.x - o.hx - pad, maxx = o.x + o.hx + pad;
  const minz = o.z - o.hz - pad, maxz = o.z + o.hz + pad;
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

function blockedLine(list, ax, az, bx, bz) {
  for (const o of list) if (segHitsBox(ax, az, bx, bz, o, 0.05)) return true;
  return false;
}

function pointFree(list, x, z, r, half) {
  if (Math.abs(x) > half - r - 0.4 || Math.abs(z) > half - r - 0.4) return false;
  for (const o of list) {
    if (x > o.x - o.hx - r - 0.2 && x < o.x + o.hx + r + 0.2 &&
        z > o.z - o.hz - r - 0.2 && z < o.z + o.hz + r + 0.2) return false;
  }
  return true;
}

function predict(b, dt, half) {
  let x = b.x + (b.vx || 0) * dt;
  let z = b.z + (b.vz || 0) * dt;
  const lim = half - 1;
  if (x > lim) x = lim; if (x < -lim) x = -lim;
  if (z > lim) z = lim; if (z < -lim) z = -lim;
  return { x, z };
}

function think(p, api) {
  const me = p.self, e = p.enemy;
  if (!me || !me.alive || !e) return;
  const t = p.t;
  const half = (p.arena && p.arena.half) || 20;
  const list = boxes(p);
  const dist = e.dist;

  for (const ev of p.events) {
    if (ev.type === 'enemyStarted' && ev.skill === 'laser') lastLaserT = t;
    if (ev.type === 'missed' && ev.skill === 'smash') {
      if (ev.reason === 'range' || ev.reason === 'aim') smashReach = Math.max(3.05, smashReach - 0.22);
    }
    if (ev.type === 'dealt' && ev.skill === 'smash') smashReach = Math.min(4.15, smashReach + 0.06);
    if (ev.type === 'blocked') nextFlip = 0;
  }
  if (prevEnemy) {
    const jump = Math.hypot(e.x - prevEnemy.x, e.z - prevEnemy.z);
    if (jump > 3.2) lastBlinkT = t;
  }
  prevEnemy = { x: e.x, z: e.z };

  if (me.speed < 0.6) { if (slowSince < 0) slowSince = t; } else slowSince = -1;
  const stuck = slowSince >= 0 && (t - slowSince) > 0.7;

  if (t > nextFlip) { strafeSign = api.rand() < 0.5 ? -1 : 1; nextFlip = t + 0.7 + api.rand() * 0.9; }

  const eCast = e.casting;
  const enemyLasering = !!(eCast && eCast.skill === 'laser' && eCast.telegraph);
  const laserLeft = enemyLasering ? (typeof eCast.remaining === 'number' ? eCast.remaining : 0.3) : 99;

  // ---- busy: keep steering the thing we already started ----
  if (me.busy && me.casting) {
    const c = me.casting;
    if (c.skill === 'charge') {
      if (c.phase === 'windup') {
        const eta = 0.34 + Math.max(0, dist - 2.3) / 15;
        const aim = predict(e, Math.min(eta, 1.0), half);
        chargeAimX = aim.x; chargeAimZ = aim.z;
        api.faceAt(aim.x, aim.z);
        api.move(aim.x - me.x, aim.z - me.z);
      }
      return;
    }
    if (c.skill === 'smash') {
      const aim = predict(e, Math.max(0, c.remaining || 0.1), half);
      api.faceAt(aim.x, aim.z);
      if (dist > 2.0) api.move(e.x - me.x, e.z - me.z);
      else api.move(0, 0);
      return;
    }
    return;
  }
  if (me.stunned || me.airborne) return;

  const myFrac = me.hp / me.maxHp;
  const eFrac = e.hp / e.maxHp;

  // ---- endgame hide: burn is proportional, the higher fraction wins ----
  const hiding = t > 46 && myFrac - eFrac > 0.09 && e.hp > 35;

  if (hiding) {
    if (t - lastSay > 6) { api.say("clock's mine, squid"); lastSay = t; }
    let need = !hideTarget || (t - hideTargetT) > 0.8 ||
      !blockedLine(list, hideTarget.x, hideTarget.z, e.x, e.z) ||
      Math.hypot(me.x - hideTarget.x, me.z - hideTarget.z) < 1.0;
    if (need) {
      let best = null, bestScore = 1e9;
      for (const o of list) {
        const away = V.norm({ x: o.x - e.x, z: o.z - e.z });
        const rad = Math.max(o.hx, o.hz) + 2.3;
        for (let k = -1; k <= 1; k++) {
          const d = V.rot(away, k * 0.6);
          const cx = o.x + d.x * rad, cz = o.z + d.z * rad;
          if (!pointFree(list, cx, cz, me.radius, half)) continue;
          if (!blockedLine(list, cx, cz, e.x, e.z)) continue;
          const path = api.pathTo(cx, cz);
          if (!path) continue;
          const enemyGap = Math.hypot(cx - e.x, cz - e.z);
          const score = path.dist - enemyGap * 0.55;
          if (score < bestScore) { bestScore = score; best = { x: cx, z: cz }; }
        }
      }
      if (best) { hideTarget = best; hideTargetT = t; }
    }
    if (hideTarget) {
      api.moveTo(hideTarget.x, hideTarget.z);
      api.faceAt(e.x, e.z);
      return;
    }
    const away = V.away(me, e);
    api.move(away.x, away.z);
    api.faceAt(e.x, e.z);
    return;
  }

  // ---- aim ----
  const faceLead = predict(e, 0.2, half);
  api.faceAt(faceLead.x, faceLead.z);

  // ---- smash ----
  const landE = predict(e, 0.28, half);
  const landMe = { x: me.x + me.vx * 0.28, z: me.z + me.vz * 0.28 };
  const landDist = V.dist(landMe, landE);
  let enemyAirLong = false;
  if (e.airborne) {
    const r = (eCast && typeof eCast.remaining === 'number' && eCast.phase === 'air') ? eCast.remaining : 0.5;
    enemyAirLong = r > 0.22;
  }
  const freshBlink = (t - lastBlinkT) < 0.22 || e.invulnerable;

  if (api.ready('smash') && landDist < smashReach && !enemyAirLong && !freshBlink && e.visible) {
    api.use('smash');
    if (dist > 2.2) api.move(landE.x - me.x, landE.z - me.z); else api.move(0, 0);
    if (t - lastSay > 5) { api.say('come here'); lastSay = t; }
    return;
  }

  // ---- charge ----
  if (api.ready('charge') && e.visible && !enemyAirLong) {
    const eta = 0.34 + Math.max(0, dist - 2.3) / 15;
    const aim = predict(e, Math.min(eta, 1.0), half);
    const dir = V.toward(me, aim);
    const wantClose = dist > 3.3 && dist < 11.5;
    const punishCast = enemyLasering && dist < 12;
    if ((wantClose || punishCast) && (dir.x !== 0 || dir.z !== 0)) {
      const r = api.ray(dir.x, dir.z, Math.min(13, dist + 1.5));
      const clear = !r || r.dist >= dist - 1.4;
      if (clear) {
        api.use('charge');
        api.faceAt(aim.x, aim.z);
        api.move(dir.x, dir.z);
        if (t - lastSay > 5) { api.say('SMASH'); lastSay = t; }
        return;
      }
    }
  }

  // ---- laser dodge: step into cover if it is one hop away ----
  if (enemyLasering && e.visible && dist > 4.5 && laserLeft < 0.45) {
    let best = null, bestD = 1e9;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const dx = Math.sin(a), dz = Math.cos(a);
      for (const step of [2.2, 3.4]) {
        const cx = me.x + dx * step, cz = me.z + dz * step;
        if (!pointFree(list, cx, cz, me.radius, half)) continue;
        if (!blockedLine(list, cx, cz, e.x, e.z)) continue;
        if (blockedLine(list, me.x, me.z, cx, cz)) continue;
        const d = Math.hypot(cx - e.x, cz - e.z);
        if (d < bestD) { bestD = d; best = { x: cx, z: cz }; }
      }
    }
    if (best) {
      api.move(best.x - me.x, best.z - me.z);
      return;
    }
  }

  // ---- approach / pressure ----
  const target = predict(e, Math.min(0.35, dist / 12), half);

  if (dist < 4.6) {
    const to = V.toward(me, e);
    const perp = V.perp(to);
    const lat = enemyLasering ? 0.85 * strafeSign : 0.3 * strafeSign;
    api.move(to.x + perp.x * lat, to.z + perp.z * lat);
    return;
  }

  const path = api.pathTo(target.x, target.z);
  if (stuck || !e.visible || (path && !path.direct)) {
    if (path && path.points && path.points.length) {
      const wp = path.points[0];
      api.move(wp.x - me.x, wp.z - me.z);
    } else {
      api.moveTo(target.x, target.z);
    }
    return;
  }

  const to = V.toward(me, target);
  const perp = V.perp(to);
  let lat = 0;
  if (dist > 6.5) lat = 0.55 * strafeSign;
  else if (dist > 4.6) lat = 0.3 * strafeSign;
  let mx = to.x + perp.x * lat, mz = to.z + perp.z * lat;
  const nx = me.x + mx * 2.0, nz = me.z + mz * 2.0;
  if (Math.abs(nx) > half - 1.6 || Math.abs(nz) > half - 1.6) { mx = to.x; mz = to.z; }
  api.move(mx, mz);
}
