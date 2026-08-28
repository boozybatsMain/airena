const OBSTACLE_PAD = 0.0;

let lastLaserStart = -99;
let lastBlinkStart = -99;
let lastJumpStart = -99;
let jitterSeed = 0;
let sayT = -99;
let lastMoveDir = { x: 0, z: 1 };

function pointInObs(x, z, obs, pad) {
  for (const o of obs) {
    if (Math.abs(x - o.x) < o.hx + pad && Math.abs(z - o.z) < o.hz + pad) return true;
  }
  return false;
}

function segBlocked(ax, az, bx, bz, obs, pad) {
  const dx = bx - ax, dz = bz - az;
  for (const o of obs) {
    const minx = o.x - o.hx - pad, maxx = o.x + o.hx + pad;
    const minz = o.z - o.hz - pad, maxz = o.z + o.hz + pad;
    let t0 = 0, t1 = 1;
    if (Math.abs(dx) < 1e-9) {
      if (ax < minx || ax > maxx) continue;
    } else {
      let ta = (minx - ax) / dx, tb = (maxx - ax) / dx;
      if (ta > tb) { const t = ta; ta = tb; tb = t; }
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
      if (t0 > t1) continue;
    }
    if (Math.abs(dz) < 1e-9) {
      if (az < minz || az > maxz) continue;
    } else {
      let ta = (minz - az) / dz, tb = (maxz - az) / dz;
      if (ta > tb) { const t = ta; ta = tb; tb = t; }
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
      if (t0 > t1) continue;
    }
    return true;
  }
  return false;
}

function predict(e, t) {
  return { x: e.x + e.vx * t, z: e.z + e.vz * t };
}

function angErr(heading, dir) {
  return Math.abs(V.angleTo(heading, dir));
}

function think(p, api) {
  const s = p.self, e = p.enemy, obs = p.arena.obstacles;
  if (!s.alive) return;

  for (const ev of p.events) {
    if (ev.type === 'enemyStarted') {
      if (ev.skill === 'laser') lastLaserStart = p.t;
      else if (ev.skill === 'blink') lastBlinkStart = p.t;
      else if (ev.skill === 'jump') lastJumpStart = p.t;
    }
  }

  const d = e.dist;
  const casting = s.casting;
  const enemyCastingLaser = !!(e.casting && e.casting.skill === 'laser' && e.casting.telegraph);
  const laserRemain = enemyCastingLaser ? e.casting.remaining : 99;

  // --- Ongoing skill handling -------------------------------------------
  if (casting) {
    if (casting.skill === 'charge' && casting.phase === 'windup') {
      const travel = Math.min(12, Math.max(2, d));
      const lt = casting.remaining + travel / 15;
      const pe = predict(e, Math.min(lt, 0.9));
      api.faceAt(pe.x, pe.z);
      return;
    }
    if (casting.skill === 'smash' && casting.phase === 'windup') {
      const pe = predict(e, casting.remaining);
      api.faceAt(pe.x, pe.z);
      api.move(pe.x - s.x, pe.z - s.z);
      return;
    }
    // dash / strike / recover / air: hold orders, keep looking at them
    if (!s.airborne) api.faceAt(e.x, e.z);
    return;
  }
  if (s.stunned) return;

  const pe28 = predict(e, 0.28);
  const toPe = V.norm({ x: pe28.x - s.x, z: pe28.z - s.z });
  const dPred = Math.hypot(pe28.x - s.x, pe28.z - s.z);

  // Always look at where they will be.
  api.faceAt(pe28.x, pe28.z);

  const enemyAirLong = e.airborne && !(e.casting && e.casting.remaining < 0.24);
  const smashReach = 3.95 + e.radius * 0.4;

  // --- SMASH -------------------------------------------------------------
  if (api.ready('smash') && dPred < smashReach && !enemyAirLong && !e.invulnerable) {
    const err = angErr(s.heading, toPe);
    if (err < 1.15) {
      api.use('smash');
      api.move(toPe.x, toPe.z);
      return;
    }
  }

  // --- CHARGE ------------------------------------------------------------
  if (api.ready('charge') && !e.invulnerable && e.visible && d > 4.3 && d < 14.5) {
    const dir = V.norm({ x: e.x - s.x, z: e.z - s.z });
    const want = Math.min(11.5, d) - 0.6;
    const r = api.ray(dir.x, dir.z, Math.min(13, d + 1));
    const clear = !r.hit || r.dist >= want;
    const worthIt = d < 12.5 || enemyCastingLaser;
    if (clear && worthIt) {
      api.use('charge');
      api.faceAt(pe28.x, pe28.z);
      return;
    }
  }

  // --- MOVEMENT ----------------------------------------------------------
  if (d < 4.6) {
    // glue to them; heavier body wins the shove
    api.move(pe28.x - s.x, pe28.z - s.z);
    lastMoveDir = toPe;
    return;
  }

  if (!e.visible) {
    const path = api.pathTo(e.x, e.z);
    if (path && path.points && path.points.length) {
      const wp = path.points[0];
      const dir = V.norm({ x: wp.x - s.x, z: wp.z - s.z });
      api.move(dir.x, dir.z);
      lastMoveDir = dir;
    } else {
      api.moveTo(e.x, e.z);
    }
    return;
  }

  const laserHot = (p.t - lastLaserStart) > 1.55; // they can fire again soon
  const wantCover = d > 6.5 && (laserHot || enemyCastingLaser);

  const step = Math.min(3.4, Math.max(1.6, d - 2.2));
  let best = null, bestScore = -1e9;
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8;
    const dir = { x: Math.sin(a), z: Math.cos(a) };
    const cx = s.x + dir.x * step, cz = s.z + dir.z * step;
    if (Math.abs(cx) > 19.0 || Math.abs(cz) > 19.0) continue;
    if (pointInObs(cx, cz, obs, s.radius + 0.25)) continue;

    const nd = Math.hypot(e.x - cx, e.z - cz);
    let score = (d - nd) * 3.2;

    if (wantCover) {
      const blocked = segBlocked(e.x, e.z, cx, cz, obs, OBSTACLE_PAD);
      if (blocked) score += enemyCastingLaser ? 9 : 5.5;
      else if (enemyCastingLaser && laserRemain < 0.45) {
        // late lateral shuffle, better than nothing
        const perp = Math.abs(dir.x * (e.z - s.z) - dir.z * (e.x - s.x)) / Math.max(d, 0.001);
        score += perp * 1.2;
      }
    }

    const wallGap = 20 - Math.max(Math.abs(cx), Math.abs(cz));
    if (wallGap < 2.5) score -= (2.5 - wallGap) * 2.2;

    score += (dir.x * lastMoveDir.x + dir.z * lastMoveDir.z) * 0.9;
    score += (api.rand() - 0.5) * 0.7;

    if (score > bestScore) { bestScore = score; best = dir; }
  }

  if (best) {
    api.move(best.x, best.z);
    lastMoveDir = best;
  } else {
    api.moveTo(e.x, e.z);
  }

  if (p.t - sayT > 6) {
    sayT = p.t;
    if (d > 12) api.say("closing in");
    else api.say("come here, squid");
  }
}
