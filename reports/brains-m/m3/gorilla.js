const R_SELF = 1.25;

let seenX = 0, seenZ = 0, seenT = -99;
let blockedT = -99;
let sideFlip = -99;
let side = 1;
let saidT = -99;

function segBox(ax, az, bx, bz, b, pad) {
  const minx = b.x - b.hx - pad, maxx = b.x + b.hx + pad;
  const minz = b.z - b.hz - pad, maxz = b.z + b.hz + pad;
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dz = bz - az;
  if (Math.abs(dx) < 1e-9) { if (ax < minx || ax > maxx) return false; }
  else {
    let ta = (minx - ax) / dx, tb = (maxx - ax) / dx;
    if (ta > tb) { const q = ta; ta = tb; tb = q; }
    if (ta > t0) t0 = ta; if (tb < t1) t1 = tb;
    if (t0 > t1) return false;
  }
  if (Math.abs(dz) < 1e-9) { if (az < minz || az > maxz) return false; }
  else {
    let ta = (minz - az) / dz, tb = (maxz - az) / dz;
    if (ta > tb) { const q = ta; ta = tb; tb = q; }
    if (ta > t0) t0 = ta; if (tb < t1) t1 = tb;
    if (t0 > t1) return false;
  }
  return true;
}

function segBlocked(ax, az, bx, bz, obs, pad) {
  for (const o of obs) if (segBox(ax, az, bx, bz, o, pad)) return true;
  return false;
}

function pointClear(x, z, obs, clr) {
  if (Math.abs(x) > 19.0 || Math.abs(z) > 19.0) return false;
  for (const o of obs) {
    if (Math.abs(x - o.x) < o.hx + clr && Math.abs(z - o.z) < o.hz + clr) return false;
  }
  return true;
}

// is point pt hidden from shooter "from" (with lateral robustness)?
function hidden(from, pt, obs) {
  const dx = pt.x - from.x, dz = pt.z - from.z;
  const L = Math.hypot(dx, dz);
  if (L < 0.5) return false;
  const px = -dz / L, pz = dx / L;
  for (const off of [0, 1.3, -1.3]) {
    if (!segBlocked(from.x, from.z, pt.x + px * off, pt.z + pz * off, obs, 0)) return false;
  }
  return true;
}

function bestCover(s, e, obs) {
  let best = null, bestScore = Infinity;
  const dSE = Math.hypot(e.x - s.x, e.z - s.z);
  for (const o of obs) {
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4;
      const px = o.x + Math.cos(a) * (o.hx + 2.3);
      const pz = o.z + Math.sin(a) * (o.hz + 2.3);
      if (!pointClear(px, pz, obs, 1.45)) continue;
      const dE = Math.hypot(e.x - px, e.z - pz);
      if (dE > dSE - 1.5) continue;
      if (!hidden(e, { x: px, z: pz }, obs)) continue;
      const dS = Math.hypot(s.x - px, s.z - pz);
      const score = dS * 0.75 + dE;
      if (score < bestScore) { bestScore = score; best = { x: px, z: pz }; }
    }
  }
  return best;
}

function goTo(api, p, tx, tz, strafe) {
  const s = p.self;
  const path = api.pathTo(tx, tz);
  if (path && !path.direct && path.points && path.points.length) {
    let tgt = { x: tx, z: tz };
    for (const q of path.points) {
      if (Math.hypot(q.x - s.x, q.z - s.z) > 0.8) { tgt = q; break; }
    }
    api.move(tgt.x - s.x, tgt.z - s.z);
    return;
  }
  let d = V.norm({ x: tx - s.x, z: tz - s.z });
  if (d.x === 0 && d.z === 0) { api.stop(); return; }
  if (strafe) {
    const per = V.perp(d);
    d = V.norm(V.add(d, V.scale(per, strafe)));
  }
  api.move(d.x, d.z);
}

function think(p, api) {
  const s = p.self, e = p.enemy;
  if (!s.alive) return;
  const obs = p.arena.obstacles;
  const t = p.t;

  for (const ev of p.events) {
    if (ev.type === 'blocked') blockedT = t;
  }

  if (e.visible) { seenX = e.x; seenZ = e.z; seenT = t; }
  else if (seenT < 0) { seenX = e.x; seenZ = e.z; seenT = t; }
  const tgtX = e.visible ? e.x : seenX;
  const tgtZ = e.visible ? e.z : seenZ;

  if (t - sideFlip > 1.1) { sideFlip = t; side = api.rand() < 0.5 ? 1 : -1; }

  const dist = e.dist;
  const canAct = !s.busy && !s.stunned && !s.airborne;
  const lasering = !!(e.casting && e.casting.skill === 'laser' && e.casting.telegraph);

  const eLead = (dt) => ({ x: e.x + e.vx * dt, z: e.z + e.vz * dt });
  const enemyAirAt = (dt) => {
    if (e.casting && e.casting.skill === 'jump') {
      if (e.casting.phase === 'windup') return dt > e.casting.remaining - 0.05;
      if (e.casting.phase === 'air') return dt < e.casting.remaining + 0.05;
    }
    if (e.airborne) return dt < 0.35;
    return false;
  };

  let acted = false;
  let facedone = false;

  // ---------- offense ----------
  if (canAct) {
    const p3 = eLead(0.3);
    const dPred = Math.hypot(p3.x - s.x, p3.z - s.z);
    const dirP = V.norm({ x: p3.x - s.x, z: p3.z - s.z });
    const ang = Math.abs(V.angleTo(s.heading, dirP));
    const smashOk = api.ready('smash') && dPred <= 4.8 && ang < 1.45 &&
      !enemyAirAt(0.3) && !e.invulnerable &&
      (e.visible || dist < 3.2);
    if (smashOk) {
      api.use('smash');
      api.faceAt(p3.x, p3.z);
      facedone = true;
      acted = true;
    }
  }

  if (!acted && canAct && api.ready('charge') && e.visible && !e.invulnerable && !enemyAirAt(0.45)) {
    const lead = Math.min(0.3 + dist / 15, 0.85);
    const cp = eLead(lead);
    const dirC = V.norm({ x: cp.x - s.x, z: cp.z - s.z });
    if (dirC.x !== 0 || dirC.z !== 0) {
      const ray = api.ray(dirC.x, dirC.z, Math.min(dist + 2.0, 13.5));
      const clear = !ray.hit || ray.dist > dist - 0.9;
      const good = clear && dist > 3.8 && dist < 11.6;
      if (good) {
        api.use('charge');
        api.faceAt(cp.x, cp.z);
        facedone = true;
        acted = true;
      }
    }
  }

  // ---------- facing / movement ----------
  const cast = s.casting;

  if (cast && cast.skill === 'charge' && cast.phase === 'windup') {
    const lead2 = Math.min(cast.remaining + dist / 15, 0.9);
    const cp = eLead(lead2);
    api.faceAt(cp.x, cp.z);
    api.move(cp.x - s.x, cp.z - s.z);
    return;
  }
  if (cast && (cast.phase === 'dash' || cast.phase === 'air')) {
    if (!facedone) api.faceAt(tgtX, tgtZ);
    return;
  }
  if (cast && cast.skill === 'smash') {
    const cp = eLead(Math.max(0, cast.remaining));
    if (!facedone) api.faceAt(cp.x, cp.z);
    if (dist > 2.3) api.move(cp.x - s.x, cp.z - s.z); else api.stop();
    return;
  }

  if (!facedone) api.faceAt(tgtX, tgtZ);

  // movement
  const exposed = e.visible;

  if (!exposed) {
    goTo(api, p, tgtX, tgtZ, 0);
  } else if (lasering && dist > 5.2) {
    // try to break line of sight
    const r = Math.max(0.05, e.casting.remaining);
    const step = Math.min(5.1 * r + 0.6, 3.2);
    let bestPt = null, bestScore = Infinity;
    for (let i = 0; i < 16; i++) {
      const a = i * Math.PI / 8;
      const cx = s.x + Math.sin(a) * step, cz = s.z + Math.cos(a) * step;
      if (!pointClear(cx, cz, obs, 1.4)) continue;
      if (!hidden(e, { x: cx, z: cz }, obs)) continue;
      const sc = Math.hypot(e.x - cx, e.z - cz);
      if (sc < bestScore) { bestScore = sc; bestPt = { x: cx, z: cz }; }
    }
    if (bestPt) {
      api.move(bestPt.x - s.x, bestPt.z - s.z);
    } else {
      goTo(api, p, tgtX, tgtZ, side * 0.7);
    }
  } else if (dist > 9.0) {
    const cov = (t - blockedT > 0.6) ? bestCover(s, e, obs) : null;
    if (cov) {
      goTo(api, p, cov.x, cov.z, 0);
    } else {
      goTo(api, p, tgtX, tgtZ, side * 0.5);
    }
  } else if (dist > 3.0) {
    goTo(api, p, tgtX, tgtZ, side * 0.4);
  } else {
    // in his face: orbit slightly, stay glued
    const toE = V.norm({ x: e.x - s.x, z: e.z - s.z });
    const per = V.perp(toE);
    let radial = dist < 2.2 ? -0.5 : 0.75;
    const d = V.norm(V.add(V.scale(toE, radial), V.scale(per, side * 0.85)));
    api.move(d.x, d.z);
  }

  if (t - saidT > 6.5) {
    saidT = t;
    api.say(dist < 5 ? "SMASH THE SQUID" : "no beam can hide you");
  }
}
