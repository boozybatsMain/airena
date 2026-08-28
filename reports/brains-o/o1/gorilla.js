let lastLaser = -99;
let lastBlink = -99;
let orbitDir = 1;
let stuckTime = 0;
let lastSay = -99;

function leadPos(e, t) {
  const vx = e.vx || 0, vz = e.vz || 0;
  return { x: e.x + vx * t, z: e.z + vz * t };
}

function clampArena(pt) {
  return { x: Math.max(-19.2, Math.min(19.2, pt.x)), z: Math.max(-19.2, Math.min(19.2, pt.z)) };
}

function goTo(p, api, x, z) {
  const me = p.self;
  let path = null;
  try { path = api.pathTo(x, z); } catch (err) { path = null; }
  if (path && path.direct === false && path.points && path.points.length) {
    let pt = path.points[0];
    if (path.points.length > 1 && V.dist(me, pt) < 0.8) pt = path.points[1];
    api.move(pt.x - me.x, pt.z - me.z);
  } else {
    api.move(x - me.x, z - me.z);
  }
}

function coverPoint(p, api) {
  const me = p.self, e = p.enemy;
  let best = null, bestScore = 1e9;
  for (const o of p.arena.obstacles) {
    const dx = o.x - e.x, dz = o.z - e.z;
    const L = Math.hypot(dx, dz) || 1;
    const ux = dx / L, uz = dz / L;
    const ext = Math.abs(ux) * o.hx + Math.abs(uz) * o.hz;
    const c = clampArena({ x: o.x + ux * (ext + 2.1), z: o.z + uz * (ext + 2.1) });
    const dEn = Math.hypot(c.x - e.x, c.z - e.z);
    if (dEn > e.dist - 1.0) continue;
    let walk = V.dist(me, c);
    const path = api.pathTo(c.x, c.z);
    if (path) walk = path.dist;
    const score = walk + dEn * 0.55;
    if (score < bestScore) { bestScore = score; best = c; }
  }
  return best;
}

function think(p, api) {
  const me = p.self, e = p.enemy;
  if (!me.alive) return;
  if (!e || !e.alive) { api.stop(); return; }

  for (const ev of p.events) {
    if (ev.type === 'enemyStarted') {
      if (ev.skill === 'laser') lastLaser = p.t;
      else if (ev.skill === 'blink') lastBlink = p.t;
    } else if (ev.type === 'damaged' && ev.skill === 'laser') {
      if (p.t - lastLaser > 1.5) lastLaser = p.t - 0.7;
    } else if (ev.type === 'blocked') {
      orbitDir = -orbitDir;
    }
  }

  const dist = e.dist;
  const toE = V.toward(me, e);
  const perp = V.perp(toE);

  if (me.stunned) return;

  // ---- while a skill is running, only manage facing / drift ----
  if (me.busy) {
    const c = me.casting;
    if (c && c.skill === 'smash') {
      const q = leadPos(e, Math.max(0, c.remaining || 0));
      api.faceAt(q.x, q.z);
      if (c.phase === 'windup') api.move(q.x - me.x, q.z - me.z);
    } else if (c && c.skill === 'charge' && c.phase === 'windup') {
      const tt = Math.max(0, c.remaining || 0) + Math.max(0, dist - 2.3) / 15;
      const q = leadPos(e, Math.min(0.9, tt));
      api.faceAt(q.x, q.z);
      api.move(q.x - me.x, q.z - me.z);
    } else if (c && c.skill === 'jump') {
      api.faceAt(e.x, e.z);
    }
    return;
  }

  const enemyCasting = e.casting && e.casting.telegraph;
  const enemyLasering = enemyCasting && e.casting.skill === 'laser';
  const enemyAir = e.airborne;
  const laserReady = (p.t - lastLaser) >= 2.1;

  // ---- facing: always toward where they will be ----
  const faceQ = leadPos(e, 0.25);
  api.faceAt(faceQ.x, faceQ.z);

  // ---- SMASH ----
  const q3 = leadPos(e, 0.3);
  const d3 = V.dist(me, q3);
  const dirQ = V.toward(me, q3);
  const angErr = Math.abs(V.angleTo(me.heading, dirQ));
  const spread = Math.asin(Math.min(0.98, (e.radius || 1) / Math.max(d3, (e.radius || 1) + 0.1)));
  const allowed = 0.96 + spread + 0.5;
  const smashOk =
    api.ready('smash') &&
    d3 <= 4.75 && dist <= 5.6 &&
    angErr <= allowed &&
    !e.invulnerable &&
    !(enemyAir && (!e.casting || (e.casting.remaining || 1) > 0.28)) &&
    e.visible;

  if (smashOk) {
    api.use('smash');
    api.move(q3.x - me.x, q3.z - me.z);
    return;
  }

  // ---- CHARGE ----
  let chargeOk = false;
  if (api.ready('charge') && e.visible && dist >= 3.6 && dist <= 11.8 && !e.invulnerable) {
    const impactT = 0.3 + Math.max(0, dist - 2.3) / 15;
    const q = leadPos(e, Math.min(1.1, impactT));
    const dir = V.toward(me, q);
    let clear = true;
    const r = api.ray(dir.x, dir.z, Math.min(14, dist + 1));
    if (r && r.hit && r.dist < dist - 1.2) clear = false;
    if (clear) {
      if (enemyLasering) chargeOk = true;
      else if (dist >= 5.0) chargeOk = true;
      else if (p.t - lastBlink < 1.2) chargeOk = true;
    }
    if (chargeOk) {
      api.use('charge');
      api.faceAt(q.x, q.z);
      api.move(q.x - me.x, q.z - me.z);
      return;
    }
  }

  // ---- MOVEMENT ----
  if (enemyLasering && dist < 4.2) {
    // point-blank: out-rotate the beam
    const side = V.dot(perp, { x: me.vx, z: me.vz }) >= 0 ? 1 : -1;
    orbitDir = side || orbitDir;
    const strafe = {
      x: perp.x * orbitDir * 1.25 + toE.x * (dist > 2.8 ? 0.5 : -0.35),
      z: perp.z * orbitDir * 1.25 + toE.z * (dist > 2.8 ? 0.5 : -0.35)
    };
    api.move(strafe.x, strafe.z);
    return;
  }

  if (dist > 12.5 && laserReady && e.visible) {
    const cov = coverPoint(p, api);
    if (cov) {
      goTo(p, api, cov.x, cov.z);
      if (p.t - lastSay > 6) { lastSay = p.t; api.say("through the rocks, little squid"); }
      return;
    }
  }

  // default: close and press
  let tgt;
  if (dist > 6) {
    tgt = leadPos(e, Math.min(0.6, dist / 12));
  } else {
    tgt = leadPos(e, 0.2);
  }
  tgt = clampArena(tgt);

  if (dist < 2.9 && !e.stunned) {
    // stay glued but keep circling so we are never a static beam target
    const mix = {
      x: toE.x * 0.85 + perp.x * orbitDir * 0.6,
      z: toE.z * 0.85 + perp.z * orbitDir * 0.6
    };
    api.move(mix.x, mix.z);
  } else {
    goTo(p, api, tgt.x, tgt.z);
  }

  if (me.speed < 0.5 && dist > 3) {
    stuckTime += p.dt;
    if (stuckTime > 0.5) { orbitDir = -orbitDir; stuckTime = 0; api.move(toE.x + perp.x * orbitDir * 1.4, toE.z + perp.z * orbitDir * 1.4); }
  } else {
    stuckTime = 0;
  }

  if (p.t - lastSay > 9 && dist < 6) { lastSay = p.t; api.say("come here"); }
}
