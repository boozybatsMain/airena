const CLAMP = 19.2;

let strafeSign = 1;
let laserReadyAt = 0;
let blinkReadyAt = 0;
let lastSayT = -99;
let stuckCount = 0;

function segBox(a, b, box, pad) {
  const minx = box.x - box.hx - pad, maxx = box.x + box.hx + pad;
  const minz = box.z - box.hz - pad, maxz = box.z + box.hz + pad;
  let t0 = 0, t1 = 1;
  const dx = b.x - a.x, dz = b.z - a.z;
  const axes = [[a.x, dx, minx, maxx], [a.z, dz, minz, maxz]];
  for (const ax of axes) {
    const p0 = ax[0], q0 = ax[1], mn = ax[2], mx = ax[3];
    if (Math.abs(q0) < 1e-9) {
      if (p0 < mn || p0 > mx) return false;
    } else {
      let ta = (mn - p0) / q0, tb = (mx - p0) / q0;
      if (ta > tb) { const t = ta; ta = tb; tb = t; }
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
      if (t0 > t1) return false;
    }
  }
  return true;
}

function segClear(a, b, obs) {
  for (const o of obs) if (segBox(a, b, o, 0)) return false;
  return true;
}

function inBox(q, obs, pad) {
  for (const o of obs) {
    if (Math.abs(q.x - o.x) < o.hx + pad && Math.abs(q.z - o.z) < o.hz + pad) return true;
  }
  return false;
}

function clampP(v) {
  return v > CLAMP ? CLAMP : (v < -CLAMP ? -CLAMP : v);
}

function pickDir(p, goal, opts) {
  const s = p.self, e = p.enemy, obs = p.arena.obstacles;
  const toE = V.toward(s, e);
  const per = V.perp(toE);
  let best = goal, bestScore = -1e9;
  for (let i = 0; i < 20; i++) {
    const a = i * Math.PI / 10;
    const dir = { x: Math.sin(a), z: Math.cos(a) };
    const q = { x: s.x + dir.x * 2.4, z: s.z + dir.z * 2.4 };
    let sc = V.dot(dir, goal) * (opts.goal || 1);
    if (Math.abs(q.x) > 18.6 || Math.abs(q.z) > 18.6) sc -= 7;
    if (inBox(q, obs, 1.5)) sc -= 9;
    if (opts.cover) {
      if (!segClear(q, e, obs)) sc += opts.cover;
    }
    if (opts.lateral) {
      sc += Math.abs(V.dot(dir, per)) * opts.lateral;
    }
    if (opts.keep) {
      sc += V.dot(dir, opts.keep) * opts.keepW;
    }
    if (sc > bestScore) { bestScore = sc; best = dir; }
  }
  return best;
}

function think(p, api) {
  const s = p.self, e = p.enemy;
  if (!s.alive || !e.alive) return;

  for (const ev of p.events) {
    if (ev.type === 'enemyStarted') {
      if (ev.skill === 'laser') laserReadyAt = p.t + 2.2;
      else if (ev.skill === 'blink') blinkReadyAt = p.t + 3.933;
    } else if (ev.type === 'blocked') {
      stuckCount += 2;
    }
  }
  if (stuckCount > 0) stuckCount -= 0.5;

  const obs = p.arena.obstacles;
  const R = s.radius + e.radius;
  const d = e.dist;
  const toE = V.toward(s, e);

  const pe = (t) => ({ x: clampP(e.x + e.vx * t), z: clampP(e.z + e.vz * t) });
  const pSmash = pe(0.3);

  const laserCast = !!(e.casting && e.casting.skill === 'laser' && e.casting.telegraph);
  const laserRem = laserCast ? e.casting.remaining : 99;
  const laserThreat = laserCast || (p.t >= laserReadyAt - 0.2);

  // charge aim (lead the target)
  let tt = 0.3 + Math.max(0, d - R) / 15;
  let aim = pe(tt);
  tt = 0.3 + Math.max(0, V.dist(s, aim) - R) / 15;
  aim = pe(tt);
  const aimAng = Math.abs(V.angleTo(s.heading, V.toward(s, aim)));

  // ---------- FACING ----------
  if (s.casting && s.casting.skill === 'charge' && s.casting.phase === 'windup') {
    api.faceAt(aim.x, aim.z);
  } else {
    api.faceAt(pSmash.x, pSmash.z);
  }

  // ---------- SKILLS ----------
  const enemyStillAir = e.airborne && !(e.casting && e.casting.remaining < 0.28);

  if (!s.busy && !s.stunned && !s.airborne) {
    const myFut = { x: s.x + s.vx * 0.25, z: s.z + s.vz * 0.25 };
    const dSmash = V.dist(myFut, pSmash);
    const smashAng = Math.abs(V.angleTo(s.heading, V.toward(s, pSmash)));

    const canSmash = api.ready('smash') && dSmash <= R + 2.45 && smashAng < 1.25 && !enemyStillAir;

    let canCharge = api.ready('charge') && e.visible && !enemyStillAir &&
      d > R + 1.4 && d < 12.5 && aimAng < 0.9 && segClear(s, e, obs);
    if (canCharge && laserCast && d > 8.0) canCharge = false;

    if (canSmash) {
      api.use('smash');
    } else if (canCharge && (laserCast || d > R + 2.6 || !api.ready('smash'))) {
      api.use('charge');
    }
  }

  // ---------- MOVEMENT ----------
  if (s.airborne) return;

  const inCharge = s.casting && s.casting.skill === 'charge' &&
    (s.casting.phase === 'windup' || s.casting.phase === 'dash');
  if (inCharge) return;

  let dir = null;

  if (d <= R + 2.2) {
    // melee: orbit while keeping contact pressure
    const per = V.perp(toE);
    const q1 = { x: s.x + per.x * strafeSign * 2.6, z: s.z + per.z * strafeSign * 2.6 };
    if (Math.abs(q1.x) > 18.4 || Math.abs(q1.z) > 18.4 || inBox(q1, obs, 1.5)) strafeSign = -strafeSign;
    if (stuckCount > 3) { strafeSign = -strafeSign; stuckCount = 0; }
    const w = laserCast ? 1.25 : 0.7;
    dir = V.norm({
      x: toE.x * 0.85 + per.x * strafeSign * w,
      z: toE.z * 0.85 + per.z * strafeSign * w
    });
    api.move(dir.x, dir.z);
  } else if (laserCast && d > 3.0) {
    // dodge: break line, or juke sideways hard
    const opts = { goal: laserRem < 0.35 ? 0.5 : 1.6, cover: 5.5, lateral: d > 6 ? 2.6 : 1.8 };
    dir = pickDir(p, toE, opts);
    api.move(dir.x, dir.z);
  } else if (!e.visible) {
    const path = api.pathTo(e.x, e.z);
    if (path && path.points && path.points.length > 0) {
      const wp = path.points[0];
      api.moveTo(e.x, e.z);
    } else {
      api.move(toE.x, toE.z);
    }
  } else {
    // approach with light cover preference while the beam is up
    const useCover = laserThreat && d > 8.5;
    dir = pickDir(p, toE, { goal: 3, cover: useCover ? 1.8 : 0, lateral: d > 10 ? 0.5 : 0 });
    if (stuckCount > 4) {
      api.moveTo(e.x, e.z);
      stuckCount = 0;
    } else {
      api.move(dir.x, dir.z);
    }
  }

  if (p.t - lastSayT > 6) {
    lastSayT = p.t;
    const lines = ["come here, calamari", "no beam beats fists", "ink won't save you", "205 hp of bad news"];
    api.say(lines[Math.floor(api.rand() * lines.length) % lines.length]);
  }
}
