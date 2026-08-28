function segAABB(ax, az, bx, bz, minx, minz, maxx, maxz) {
  const dx = bx - ax, dz = bz - az;
  let t0 = 0, t1 = 1;
  const axes = [[dx, ax, minx, maxx], [dz, az, minz, maxz]];
  for (const [pv, q, mn, mx] of axes) {
    if (Math.abs(pv) < 1e-9) {
      if (q < mn || q > mx) return false;
    } else {
      let ta = (mn - q) / pv, tb = (mx - q) / pv;
      if (ta > tb) { const s = ta; ta = tb; tb = s; }
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
      if (t0 > t1) return false;
    }
  }
  return true;
}

function blockedSeg(ax, az, bx, bz, obs) {
  for (const o of obs) {
    if (segAABB(ax, az, bx, bz, o.x - o.hx - 0.4, o.z - o.hz - 0.4, o.x + o.hx + 0.4, o.z + o.hz + 0.4)) return true;
  }
  return false;
}

function angDiff(h, dx, dz) {
  let a = Math.atan2(dx, dz) - h;
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

let strafe = 1;
let enemyLaserAt = -99;
let enemyBlinkAt = -99;
let sawLaser = false;
let lastChargeAt = -99;
let stuckTimer = 0;
let lastPos = null;
let saidAt = -99;

function chooseMove(p, api, threat) {
  const me = p.self, en = p.enemy, obs = p.arena.obstacles;
  const base = Math.atan2(en.x - me.x, en.z - me.z);
  let best = null, bestScore = -1e9;
  for (let i = 0; i < 16; i++) {
    const h = base + (i - 8) * (Math.PI / 8);
    const dx = Math.sin(h), dz = Math.cos(h);
    const step = 3.0;
    const cx = me.x + dx * step, cz = me.z + dz * step;
    if (Math.abs(cx) > 19 || Math.abs(cz) > 19) continue;
    if (!api.los(cx, cz)) continue;
    const dcx = Math.hypot(en.x - cx, en.z - cz);
    let s = -1.2 * dcx;
    if (blockedSeg(cx, cz, en.x, en.z, obs)) s += threat;
    s += 0.35 * Math.cos(h - base);
    const wallD = Math.min(20 - Math.abs(cx), 20 - Math.abs(cz));
    if (wallD < 3.5) s -= (3.5 - wallD) * 1.2;
    if (s > bestScore) { bestScore = s; best = { x: dx, z: dz }; }
  }
  return best;
}

function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en.alive) return;
  const obs = p.arena.obstacles;

  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      if (e.skill === 'laser') { enemyLaserAt = p.t; sawLaser = true; }
      else if (e.skill === 'blink') enemyBlinkAt = p.t;
    } else if (e.type === 'blocked') {
      strafe = -strafe;
    }
  }

  if (lastPos && Math.hypot(me.x - lastPos.x, me.z - lastPos.z) < 0.05 && !me.busy) stuckTimer += p.dt;
  else stuckTimer = 0;
  lastPos = { x: me.x, z: me.z };

  const d = en.dist;
  const cast = en.casting;
  const enemyCasting = !!(cast && cast.skill === 'laser' && cast.telegraph);
  const laserReady = !sawLaser || (p.t - enemyLaserAt) >= 2.15;

  if (me.stunned) return;

  // ---- facing / movement while committed ----
  if (me.casting && me.casting.skill === 'charge' && me.casting.phase === 'windup') {
    const tw = me.casting.remaining;
    const tt = tw + Math.max(0, d - 2.2) / 15;
    const lead = (en.stunned || en.airborne) ? 0 : 1;
    api.face(en.x + en.vx * tt * lead - me.x, en.z + en.vz * tt * lead - me.z);
    api.move(en.x - me.x, en.z - me.z);
    return;
  }
  if (me.airborne) {
    api.faceAt(en.x, en.z);
    return;
  }
  if (me.casting && me.casting.skill === 'smash' && me.casting.phase === 'windup') {
    const r = me.casting.remaining;
    api.face(en.x + en.vx * r - me.x, en.z + en.vz * r - me.z);
    api.move(en.x - me.x, en.z - me.z);
    return;
  }

  // ---- default facing ----
  const tPred = 0.15;
  api.face(en.x + en.vx * tPred - me.x, en.z + en.vz * tPred - me.z);

  const canAct = !me.busy && !me.airborne;
  const angToEn = angDiff(me.heading, en.x - me.x, en.z - me.z);

  // ---- smash decision ----
  const myV = Math.min(me.speed, 1.6);
  const mn = me.speed > 0.01 ? { x: me.vx / me.speed, z: me.vz / me.speed } : { x: 0, z: 0 };
  const mpx = me.x + mn.x * myV * 0.28, mpz = me.z + mn.z * myV * 0.28;
  const epx = en.x + en.vx * 0.28, epz = en.z + en.vz * 0.28;
  const predD = Math.hypot(epx - mpx, epz - mpz);

  let acted = false;

  if (canAct && api.ready('smash') && predD <= 4.35 && Math.abs(angToEn) < 1.25 && !en.airborne && !en.invulnerable) {
    api.use('smash');
    acted = true;
  }

  // ---- charge decision ----
  if (!acted && canAct && api.ready('charge') && en.visible && !en.invulnerable && !en.airborne) {
    const tt = 0.28 + Math.max(0, d - 2.2) / 15;
    const lead = en.stunned ? 0 : 1;
    const tx = en.x + en.vx * tt * lead, tz = en.z + en.vz * tt * lead;
    const ang = angDiff(me.heading, tx - me.x, tz - me.z);
    const clearPath = !blockedSeg(me.x, me.z, tx, tz, obs);
    if (Math.abs(ang) < 1.0 && clearPath && d < 11.5) {
      if (enemyCasting || d > 4.6) {
        api.use('charge');
        lastChargeAt = p.t;
        acted = true;
        if (p.t - saidAt > 3) { saidAt = p.t; api.say(enemyCasting ? "no beam for you" : "here i come"); }
      }
    }
  }

  // ---- movement ----
  let threat = 0.6;
  if (enemyCasting) threat = 9;
  else if (laserReady) threat = 4.5;

  if (d < 5.2 || !en.visible) {
    if (!en.visible) {
      api.moveTo(en.x, en.z);
    } else {
      // glue to them, slight orbit so we are not a straight-line target
      const tw = V.toward({ x: me.x, z: me.z }, { x: en.x, z: en.z });
      const pr = V.perp(tw);
      const push = d < 2.6 ? 0.9 : 0.25;
      api.move(tw.x + pr.x * strafe * push, tw.z + pr.z * strafe * push);
    }
  } else {
    const mv = chooseMove(p, api, threat);
    if (mv) api.move(mv.x, mv.z);
    else api.moveTo(en.x, en.z);
  }

  if (stuckTimer > 0.5) {
    strafe = -strafe;
    stuckTimer = 0;
    api.moveTo(en.x, en.z);
  }

  if (p.t - saidAt > 8) {
    saidAt = p.t;
    api.say(`hp ${Math.round(me.hp)} / squid ${Math.round(en.hp)}`);
  }

  api.remember('d', Math.round(d * 10) / 10);
  api.remember('threat', threat);
}
