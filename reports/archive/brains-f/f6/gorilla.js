const BOXES_PAD = 0.05;

let lastLaserStart = -99;
let lastBlinkStart = -99;
let weaveT = 0;
let weaveSign = 1;
let stuckTimer = 0;
let jitterUntil = 0;
let jitterDir = { x: 1, z: 0 };
let sayTimer = 0;

function segHitsBox(ax, az, bx, bz, box) {
  const dx = bx - ax, dz = bz - az;
  let t0 = 0, t1 = 1;
  const minx = box.x - box.hx - BOXES_PAD, maxx = box.x + box.hx + BOXES_PAD;
  const minz = box.z - box.hz - BOXES_PAD, maxz = box.z + box.hz + BOXES_PAD;
  if (Math.abs(dx) < 1e-9) {
    if (ax < minx || ax > maxx) return false;
  } else {
    let ta = (minx - ax) / dx, tb = (maxx - ax) / dx;
    if (ta > tb) { const tmp = ta; ta = tb; tb = tmp; }
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  if (Math.abs(dz) < 1e-9) {
    if (az < minz || az > maxz) return false;
  } else {
    let ta = (minz - az) / dz, tb = (maxz - az) / dz;
    if (ta > tb) { const tmp = ta; ta = tb; tb = tmp; }
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  return true;
}

function enemySees(cx, cz, p) {
  const e = p.enemy;
  for (const b of p.arena.obstacles) {
    if (segHitsBox(e.x, e.z, cx, cz, b)) return false;
  }
  return true;
}

function insideBox(x, z, p, pad) {
  for (const b of p.arena.obstacles) {
    if (x > b.x - b.hx - pad && x < b.x + b.hx + pad &&
        z > b.z - b.hz - pad && z < b.z + b.hz + pad) return true;
  }
  return false;
}

function think(p, api) {
  const s = p.self, e = p.enemy;
  if (!s.alive) return;
  const t = p.t;

  for (const ev of p.events) {
    if (ev.type === 'enemyStarted') {
      if (ev.skill === 'laser') lastLaserStart = t;
      else if (ev.skill === 'blink') lastBlinkStart = t;
    }
  }

  if (!e.alive) { api.stop(); return; }
  if (s.stunned || s.airborne) return;

  const me = { x: s.x, z: s.z };
  const dist = e.dist;
  const cast = s.casting;
  const phase = cast ? cast.phase : null;

  // ---- committed states -------------------------------------------------
  if (cast && phase === 'windup') {
    if (cast.skill === 'smash') {
      const tt = Math.max(0, cast.remaining);
      api.faceAt(e.x + e.vx * tt, e.z + e.vz * tt);
      api.move(e.x - s.x, e.z - s.z);
      return;
    }
    if (cast.skill === 'charge') {
      const tt = cast.remaining + Math.min(0.8, Math.max(0, (dist - 2.2) / 15));
      api.faceAt(e.x + e.vx * tt, e.z + e.vz * tt);
      return;
    }
    return;
  }
  if (cast && (phase === 'dash' || phase === 'air')) return;

  const canAct = !s.busy;
  const laserTelegraph = !!(e.casting && e.casting.skill === 'laser' && e.casting.telegraph);
  const laserRemaining = laserTelegraph ? e.casting.remaining : 99;
  const laserReadySoon = (t - lastLaserStart) > 1.75;
  const threat = laserTelegraph || (laserReadySoon && e.visible && dist > 4.5);

  // ---- skill decisions --------------------------------------------------
  let used = false;

  if (canAct) {
    // SMASH — predicted cone check
    const lead = 0.30;
    const px = e.x + e.vx * lead, pz = e.z + e.vz * lead;
    const mx = s.x + s.vx * lead * 0.7, mz = s.z + s.vz * lead * 0.7;
    const pd = Math.hypot(px - mx, pz - mz);
    const dirToPred = V.norm({ x: px - mx, z: pz - mz });
    const angErr = Math.abs(V.angleTo(s.heading, dirToPred));
    const reach = s.radius + 2.5 + e.radius - 0.35;
    if (!used && api.ready('smash') && !e.airborne && !e.invulnerable &&
        pd <= reach && angErr < 1.5) {
      api.use('smash');
      api.faceAt(px, pz);
      api.move(e.x - s.x, e.z - s.z);
      used = true;
    }

    // CHARGE — gap close / laser interrupt
    if (!used && api.ready('charge') && e.visible && !e.invulnerable &&
        (t - lastBlinkStart) > 0.4) {
      const tt = 0.34 + Math.min(0.8, Math.max(0, (dist - 2.2) / 15));
      const aim = { x: e.x + e.vx * tt, z: e.z + e.vz * tt };
      const rel = { x: aim.x - s.x, z: aim.z - s.z };
      const travel = Math.max(0.5, V.len(rel));
      const dir = V.norm(rel);
      const ray = api.ray(dir.x, dir.z, Math.min(13, travel + 1.0));
      const clear = !ray.hit || ray.dist >= travel - 1.0;
      const ang = Math.abs(V.angleTo(s.heading, dir));
      const turnOk = ang < 1.35;
      const smashCd = api.cooldown('smash');
      const worth =
        (laserTelegraph && dist < 11.5 && laserRemaining > 0.12) ||
        (dist > 3.4 && dist < 11.0) ||
        (dist > 2.2 && dist < 11.0 && smashCd > 0.45);
      if (clear && turnOk && worth && travel < 12.5) {
        api.use('charge');
        api.faceAt(aim.x, aim.z);
        used = true;
      }
    }
  }

  // ---- facing -----------------------------------------------------------
  if (!used) {
    const ft = 0.18;
    api.faceAt(e.x + e.vx * ft, e.z + e.vz * ft);
  }

  // ---- movement ---------------------------------------------------------
  // target selection
  let target = { x: e.x, z: e.z };
  if (!e.visible && dist > 3.0) {
    const path = api.pathTo(e.x, e.z);
    if (path && path.points && path.points.length) {
      for (const pt of path.points) {
        if (V.dist(pt, me) > 1.3) { target = { x: pt.x, z: pt.z }; break; }
      }
    }
  }

  // weave phase flip
  weaveT += p.dt;
  if (weaveT > 0.55) { weaveT = 0; weaveSign = -weaveSign; }

  const toE = V.norm({ x: e.x - s.x, z: e.z - s.z });
  const perp = { x: toE.z * weaveSign, z: -toE.x * weaveSign };

  // stuck handling
  if (s.speed < 0.6) stuckTimer += p.dt; else stuckTimer = 0;
  if (stuckTimer > 0.8 && t > jitterUntil) {
    const a = api.rand() * Math.PI * 2;
    jitterDir = { x: Math.sin(a), z: Math.cos(a) };
    jitterUntil = t + 0.45;
    stuckTimer = 0;
  }
  if (t < jitterUntil) {
    api.move(jitterDir.x, jitterDir.z);
    return;
  }

  const probe = 2.2;
  let best = null, bestScore = -1e9;
  const vel = V.norm({ x: s.vx, z: s.vz });
  const wantCover = laserTelegraph && dist > 3.0;
  const weaveAmt = (dist > 5.5 && threat) ? 1.6 : 0.0;

  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8;
    const d = { x: Math.sin(a), z: Math.cos(a) };
    const cx = s.x + d.x * probe, cz = s.z + d.z * probe;
    if (Math.abs(cx) > 19.0 || Math.abs(cz) > 19.0) continue;
    if (insideBox(cx, cz, p, s.radius * 0.9)) continue;
    const r = api.ray(d.x, d.z, probe + 0.4);
    if (r.hit && r.dist < probe + 0.1) continue;

    let sc = -Math.hypot(cx - target.x, cz - target.z) * 1.0;
    if (wantCover && !enemySees(cx, cz, p)) sc += 5.0;
    sc += weaveAmt * V.dot(d, perp);
    sc += 0.45 * V.dot(d, vel);
    // hug distance when in melee: don't over-shoot through them
    if (dist < 2.6) sc += 0.6 * V.dot(d, perp);

    if (sc > bestScore) { bestScore = sc; best = d; }
  }

  if (best) api.move(best.x, best.z);
  else api.move(target.x - s.x, target.z - s.z);

  sayTimer -= p.dt;
  if (sayTimer <= 0) {
    sayTimer = 4.0;
    if (dist < 3.5) api.say("get in the fist");
    else if (laserTelegraph) api.say("beam telegraphed — closing");
    else api.say("nowhere to swim, squid");
  }
}
