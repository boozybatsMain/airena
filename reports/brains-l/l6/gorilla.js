const SMASH_WIND = 0.28;
const SMASH_EXTRA = 2.9;

let M = null;
function fresh() {
  return { lastT: -1, lastLaser: -99, lastBlink: -99, lastEJump: -99, lastSeen: null, said: -99, dmgTaken: 0 };
}

function predictE(en, t) {
  let vx = en.vx || 0, vz = en.vz || 0;
  if (en.stunned) { vx *= 0.3; vz *= 0.3; }
  const s = Math.hypot(vx, vz);
  const cap = (en.maxSpeed || 4.85) * 1.7;
  if (s > cap && s > 0) { vx = vx / s * cap; vz = vz / s * cap; }
  return { x: en.x + vx * t, z: en.z + vz * t };
}

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

function segBlocked(ax, az, bx, bz, obs, pad) {
  for (const o of obs) if (segBox(ax, az, bx, bz, o, pad)) return true;
  return false;
}

function inObs(qx, qz, obs, pad) {
  for (const o of obs) {
    if (Math.abs(qx - o.x) < o.hx + pad && Math.abs(qz - o.z) < o.hz + pad) return true;
  }
  return false;
}

function steer(p, api, tx, tz, threat, en) {
  const me = p.self;
  const obs = p.arena.obstacles;
  const R = me.radius;
  const lim = p.arena.half - R - 0.35;
  const base = V.toward({ x: me.x, z: me.z }, { x: tx, z: tz });
  const step = 2.8;
  let best = base, bestScore = -1e9;
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8;
    const d = { x: Math.sin(a), z: Math.cos(a) };
    const qx = me.x + d.x * step, qz = me.z + d.z * step;
    let s = -Math.hypot(qx - tx, qz - tz);
    if (Math.abs(qx) > lim || Math.abs(qz) > lim) s -= 9;
    if (inObs(qx, qz, obs, R + 0.45)) s -= 25;
    if (segBlocked(me.x, me.z, qx, qz, obs, R + 0.15)) s -= 14;
    if (threat) {
      if (segBlocked(en.x, en.z, qx, qz, obs, 0)) s += 6.5; else s -= 2.5;
    }
    s += V.dot(d, base) * 0.7;
    if (s > bestScore) { bestScore = s; best = d; }
  }
  api.move(best.x, best.z);
}

function think(p, api) {
  if (!M || p.t < M.lastT) M = fresh();
  M.lastT = p.t;

  const me = p.self, en = p.enemy;
  if (!me.alive) return;
  const obs = p.arena.obstacles || [];

  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      if (e.skill === 'laser') M.lastLaser = p.t;
      else if (e.skill === 'blink') M.lastBlink = p.t;
      else if (e.skill === 'jump') M.lastEJump = p.t;
    } else if (e.type === 'damaged') {
      M.dmgTaken += e.amount || 0;
    }
  }
  if (en.visible) M.lastSeen = { x: en.x, z: en.z, t: p.t };

  const dist = en.dist;
  const ec = en.casting;
  const enLaser = !!(ec && ec.skill === 'laser' && ec.telegraph);
  const laserRemain = enLaser ? (ec.remaining || 0) : 0;
  const invUntil = M.lastBlink + 0.30;
  const invNow = en.invulnerable || p.t < invUntil;

  const canAct = !me.busy && !me.stunned && !me.airborne && me.y <= 0.01;

  // ---- aim points ----
  const aim = predictE(en, Math.min(0.32, 0.16 + dist * 0.02));
  const leadT = 0.28 + Math.max(0, dist - 2.3) / 15;
  const cp = predictE(en, leadT);
  const cdir = V.toward({ x: me.x, z: me.z }, cp);
  const cdist = Math.hypot(cp.x - me.x, cp.z - me.z);

  // ---- facing ----
  let faceTarget = aim;
  if (me.casting && me.casting.skill === 'charge' && me.casting.phase === 'windup') faceTarget = cp;
  else if (me.casting && me.casting.skill === 'smash' && me.casting.phase === 'windup') {
    faceTarget = predictE(en, Math.max(0.02, me.casting.remaining || 0.1));
  }
  api.faceAt(faceTarget.x, faceTarget.z);

  // ---- smash feasibility ----
  const smashReady = api.ready('smash');
  const pe = predictE(en, SMASH_WIND);
  const pm = { x: me.x + me.vx * SMASH_WIND * 0.8, z: me.z + me.vz * SMASH_WIND * 0.8 };
  const pd = Math.hypot(pe.x - pm.x, pe.z - pm.z);
  const smashMax = SMASH_EXTRA + me.radius + en.radius - 0.35;
  const airOk = !en.airborne || (ec && ec.phase === 'air' && (ec.remaining || 1) <= 0.30);
  const invOkSmash = !(invNow && (p.t + SMASH_WIND) < invUntil + 0.02);
  const angSmash = Math.abs(V.angleTo(me.heading, V.toward({ x: me.x, z: me.z }, pe)));
  const smashGood = smashReady && pd <= smashMax && airOk && invOkSmash && angSmash < 1.35 &&
    !segBlocked(me.x, me.z, en.x, en.z, obs, 0);

  // ---- charge feasibility ----
  const chargeReady = api.ready('charge');
  let chargeGood = false;
  let angCharge = Math.abs(V.angleTo(me.heading, cdir));
  if (chargeReady && en.visible && !en.airborne && !invNow && cdist > 1.9 && cdist < 12.0) {
    let clear = true;
    if (cdist > 2.5) {
      const r = api.ray(cdir.x, cdir.z, Math.min(13, cdist + 1.2));
      clear = !r.hit || r.dist > cdist - 1.3;
    }
    const worth = enLaser || dist > 5.0 || api.cooldown('smash') > 0.45 || en.speed > 3.0;
    if (clear && worth && angCharge < 0.8) chargeGood = true;
  }

  // ---- act ----
  let acted = false;
  if (canAct) {
    if (chargeGood && (!smashGood || enLaser || dist > 4.6)) {
      api.use('charge');
      acted = true;
    } else if (smashGood) {
      api.use('smash');
      acted = true;
    }
  }

  // ---- movement ----
  let tx, tz;
  if (en.visible || !M.lastSeen) {
    const chase = Math.min(1.1, dist / 5.35);
    const ip = predictE(en, chase * 0.75);
    tx = ip.x; tz = ip.z;
    if (dist < 3.0) { tx = en.x; tz = en.z; }
  } else {
    tx = M.lastSeen.x; tz = M.lastSeen.z;
    if (Math.hypot(me.x - tx, me.z - tz) < 1.5) { tx = en.x; tz = en.z; }
  }

  const holdBack = false;
  const threat = enLaser && laserRemain > 0.16 && dist > 4.0 && !chargeGood &&
    !(me.casting && me.casting.skill === 'charge');

  if (me.casting && (me.casting.phase === 'dash')) {
    // committed, nothing to steer
  } else {
    let wx = tx, wz = tz;
    if (segBlocked(me.x, me.z, tx, tz, obs, me.radius + 0.1)) {
      const path = api.pathTo(tx, tz);
      if (path && path.points && path.points.length) {
        for (const pt of path.points) {
          if (Math.hypot(pt.x - me.x, pt.z - me.z) > 1.2) { wx = pt.x; wz = pt.z; break; }
        }
      }
    }
    steer(p, api, wx, wz, threat, en);
  }

  // ---- flavour ----
  if (p.t - M.said > 6.5) {
    M.said = p.t;
    if (acted && chargeGood) api.say("no ink saves you");
    else if (dist > 10) api.say("come here, squid");
    else api.say("fists beat lasers");
  }
}
