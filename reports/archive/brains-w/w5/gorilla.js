const OBS_SHRINK = 0.5;

let jukeSide = 1;
let prevLaserTele = false;
let lastPos = { x: 0, z: 0 };
let stuckTimer = 0;
let arcSide = 1;
let arcFlipT = 0;
let saidT = -9;

function predictPos(e, t) {
  return { x: e.x + e.vx * t, z: e.z + e.vz * t };
}

function segBlocked(ax, az, bx, bz, obstacles, shrink) {
  const dx = bx - ax, dz = bz - az;
  for (const b of obstacles) {
    const hx = b.hx - shrink, hz = b.hz - shrink;
    if (hx <= 0.05 || hz <= 0.05) continue;
    let t0 = 0, t1 = 1, ok = true;
    if (Math.abs(dx) < 1e-9) {
      if (ax < b.x - hx || ax > b.x + hx) ok = false;
    } else {
      let ta = (b.x - hx - ax) / dx, tb = (b.x + hx - ax) / dx;
      if (ta > tb) { const s = ta; ta = tb; tb = s; }
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
      if (t0 > t1) ok = false;
    }
    if (ok) {
      if (Math.abs(dz) < 1e-9) {
        if (az < b.z - hz || az > b.z + hz) ok = false;
      } else {
        let ta = (b.z - hz - az) / dz, tb = (b.z + hz - az) / dz;
        if (ta > tb) { const s = ta; ta = tb; tb = s; }
        if (ta > t0) t0 = ta;
        if (tb < t1) t1 = tb;
        if (t0 > t1) ok = false;
      }
    }
    if (ok) return true;
  }
  return false;
}

function insideBlock(x, z, obstacles, pad) {
  for (const b of obstacles) {
    if (Math.abs(x - b.x) < b.hx + pad && Math.abs(z - b.z) < b.hz + pad) return true;
  }
  return false;
}

function chargeAimPoint(p, me, en, windupLeft) {
  let t = windupLeft;
  let aim = { x: en.x, z: en.z };
  for (let i = 0; i < 4; i++) {
    aim = predictPos(en, t);
    const d = Math.hypot(aim.x - me.x, aim.z - me.z);
    const travel = Math.max(0, d - (me.radius + en.radius) * 0.6) / 15;
    t = windupLeft + Math.min(0.8, travel);
  }
  return aim;
}

function clampArena(x, z, lim) {
  return { x: Math.max(-lim, Math.min(lim, x)), z: Math.max(-lim, Math.min(lim, z)) };
}

function goTo(api, me, tx, tz) {
  const path = api.pathTo(tx, tz);
  if (path && !path.direct && path.points && path.points.length) {
    api.moveTo(tx, tz);
  } else {
    api.move(tx - me.x, tz - me.z);
  }
}

function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me || !me.alive || !en) return;
  const obs = p.arena.obstacles;
  const dist = en.dist;
  const toE = V.toward(me, en);

  const moved = Math.hypot(me.x - lastPos.x, me.z - lastPos.z);
  lastPos = { x: me.x, z: me.z };
  if (moved < 0.015 && !me.airborne && !me.stunned && !me.busy) stuckTimer += p.dt;
  else stuckTimer = Math.max(0, stuckTimer - p.dt * 2.5);

  const enCast = en.casting;
  const laserTele = !!(enCast && enCast.skill === 'laser' && enCast.telegraph);
  const laserLeft = laserTele ? enCast.remaining : 99;
  if (laserTele && !prevLaserTele) jukeSide = -jukeSide;
  prevLaserTele = laserTele;

  // ---- while committed to something, only steer facing ----
  if (me.busy) {
    const c = me.casting;
    if (c) {
      if (c.skill === 'smash' && c.phase === 'windup') {
        const f = predictPos(en, Math.max(0, c.remaining));
        api.faceAt(f.x, f.z);
        api.move(toE.x, toE.z);
      } else if (c.skill === 'charge' && c.phase === 'windup') {
        const aim = chargeAimPoint(p, me, en, Math.max(0, c.remaining));
        api.faceAt(aim.x, aim.z);
      }
    }
    return;
  }
  if (me.stunned || me.airborne) return;

  const smashReady = api.ready('smash');
  const chargeReady = api.ready('charge');

  const myFrac = me.hp / me.maxHp;
  const enFrac = en.hp / en.maxHp;
  const stalling = p.burn > 0 && myFrac - enFrac > 0.12 && dist > 7.5;

  // ---- melee: smash ----
  const enFut = predictPos(en, 0.28);
  const myFut = { x: me.x + toE.x * 0.42, z: me.z + toE.z * 0.42 };
  const predD = Math.hypot(enFut.x - myFut.x, enFut.z - myFut.z);

  if (smashReady && !en.airborne && !en.invulnerable && predD < 3.7 && !segBlocked(me.x, me.z, en.x, en.z, obs, 0.9)) {
    api.faceAt(enFut.x, enFut.z);
    api.use('smash');
    api.move(toE.x, toE.z);
    return;
  }

  // ---- charge ----
  if (chargeReady && !en.invulnerable && dist > 2.2 && dist < 11.5 && (!smashReady || dist > 4.2 || laserTele)) {
    const aim = chargeAimPoint(p, me, en, 0.34);
    const dir = V.norm({ x: aim.x - me.x, z: aim.z - me.z });
    const need = Math.hypot(aim.x - me.x, aim.z - me.z);
    const r = api.ray(dir.x, dir.z, Math.min(13, need + 1));
    const clear = !r || !r.hit || r.dist > need - 1.0;
    const ang = Math.abs(V.angleTo(me.heading, dir));
    if (clear && ang < 1.1) {
      api.faceAt(aim.x, aim.z);
      api.use('charge');
      return;
    }
    if (clear) api.faceAt(aim.x, aim.z);
  }

  // ---- facing default ----
  const faceP = predictPos(en, Math.min(0.35, dist / 12));
  api.faceAt(faceP.x, faceP.z);

  // ---- stall when ahead on hp fraction during burn ----
  if (stalling) {
    const away = V.away(me, en);
    let best = null, bestScore = -1e9;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const d = V.rot(away, a * 0.0 + (i - 6) * 0.26);
      const cand = clampArena(me.x + d.x * 7, me.z + d.z * 7, 17.5);
      if (insideBlock(cand.x, cand.z, obs, 1.6)) continue;
      const dd = Math.hypot(cand.x - en.x, cand.z - en.z);
      const hidden = segBlocked(cand.x, cand.z, en.x, en.z, obs, OBS_SHRINK) ? 6 : 0;
      const score = dd + hidden;
      if (score > bestScore) { bestScore = score; best = cand; }
    }
    if (best) {
      goTo(api, me, best.x, best.z);
      if (p.t - saidT > 6) { saidT = p.t; api.say("burn favours the big body"); }
      return;
    }
  }

  // ---- laser dodge / juke ----
  if (laserTele && laserLeft < 0.42 && dist > 3.0 && en.visible) {
    const perp = V.perp(toE);
    let side = jukeSide;
    let cand = clampArena(me.x + perp.x * side * 4, me.z + perp.z * side * 4, 18);
    if (insideBlock(cand.x, cand.z, obs, 1.5) || Math.abs(cand.x) > 17.5 || Math.abs(cand.z) > 17.5) {
      side = -side; jukeSide = side;
      cand = clampArena(me.x + perp.x * side * 4, me.z + perp.z * side * 4, 18);
    }
    const fwd = dist > 6 ? 0.55 : 0.2;
    const mv = V.norm({ x: perp.x * side + toE.x * fwd, z: perp.z * side + toE.z * fwd });
    api.move(mv.x, mv.z);
    return;
  }

  // ---- approach ----
  let target = { x: en.x, z: en.z };
  if (dist > 3.0) {
    const lead = V.lead(me, en, { x: en.vx, z: en.vz }, me.maxSpeed);
    if (lead && isFinite(lead.x) && isFinite(lead.z)) {
      target = clampArena(lead.x, lead.z, 19);
    }
  }

  const blockedLine = segBlocked(me.x, me.z, target.x, target.z, obs, 0.0);

  if (blockedLine || stuckTimer > 0.35) {
    goTo(api, me, en.x, en.z);
    if (stuckTimer > 1.2) {
      const side = V.perp(toE);
      api.move(toE.x * 0.4 + side.x * arcSide, toE.z * 0.4 + side.z * arcSide);
      arcSide = -arcSide;
      stuckTimer = 0;
    }
    return;
  }

  let dir = V.norm({ x: target.x - me.x, z: target.z - me.z });

  if (dist > 6.5 && en.visible) {
    if (p.t - arcFlipT > 1.4) {
      arcFlipT = p.t;
      const perp = V.perp(toE);
      const c1 = { x: me.x + perp.x * 5, z: me.z + perp.z * 5 };
      const c2 = { x: me.x - perp.x * 5, z: me.z - perp.z * 5 };
      const ok1 = Math.abs(c1.x) < 18 && Math.abs(c1.z) < 18 && !insideBlock(c1.x, c1.z, obs, 1.5);
      const ok2 = Math.abs(c2.x) < 18 && Math.abs(c2.z) < 18 && !insideBlock(c2.x, c2.z, obs, 1.5);
      if (ok1 && !ok2) arcSide = 1;
      else if (ok2 && !ok1) arcSide = -1;
      else arcSide = api.rand() < 0.5 ? 1 : -1;
    }
    const perp = V.perp(dir);
    dir = V.norm({ x: dir.x + perp.x * arcSide * 0.35, z: dir.z + perp.z * arcSide * 0.35 });
  }

  api.move(dir.x, dir.z);

  if (p.t - saidT > 9 && dist < 5) { saidT = p.t; api.say("close enough"); }
}
