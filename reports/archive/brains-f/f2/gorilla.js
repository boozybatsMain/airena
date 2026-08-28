const OBS_PAD = 0.15;
let smashThresh = 3.7;
let lastLaserStart = -99;
let lastBlocked = -99;
let saidT = -99;

function segAABB(ax, az, bx, bz, minx, minz, maxx, maxz) {
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dz = bz - az;
  if (Math.abs(dx) < 1e-9) {
    if (ax < minx || ax > maxx) return false;
  } else {
    let ta = (minx - ax) / dx, tb = (maxx - ax) / dx;
    if (ta > tb) { const t = ta; ta = tb; tb = t; }
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  if (Math.abs(dz) < 1e-9) {
    if (az < minz || az > maxz) return false;
  } else {
    let ta = (minz - az) / dz, tb = (maxz - az) / dz;
    if (ta > tb) { const t = ta; ta = tb; tb = t; }
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  return true;
}

function segBlocked(ax, az, bx, bz, obs, pad) {
  for (const o of obs) {
    if (segAABB(ax, az, bx, bz, o.x - o.hx - pad, o.z - o.hz - pad, o.x + o.hx + pad, o.z + o.hz + pad)) return true;
  }
  return false;
}

function insideBlock(x, z, obs, pad) {
  for (const o of obs) {
    if (x > o.x - o.hx - pad && x < o.x + o.hx + pad && z > o.z - o.hz - pad && z < o.z + o.hz + pad) return true;
  }
  return false;
}

function pickCover(me, e, obs, maxOut) {
  let best = null, bestScore = Infinity;
  const here = Math.hypot(me.x - e.x, me.z - e.z);
  for (let i = 0; i < 16; i++) {
    const a = i * (Math.PI * 2 / 16);
    const dx = Math.sin(a), dz = Math.cos(a);
    for (const r of [3, 5, 7]) {
      const cx = me.x + dx * r, cz = me.z + dz * r;
      if (Math.abs(cx) > 18.4 || Math.abs(cz) > 18.4) continue;
      if (insideBlock(cx, cz, obs, me.radius + 0.25)) continue;
      if (segBlocked(me.x, me.z, cx, cz, obs, me.radius * 0.75)) continue;
      if (!segBlocked(cx, cz, e.x, e.z, obs, 0.05)) continue;
      const dToE = Math.hypot(cx - e.x, cz - e.z);
      if (dToE > here + maxOut) continue;
      const score = dToE + r * 0.3;
      if (score < bestScore) { bestScore = score; best = { x: cx, z: cz }; }
    }
  }
  return best;
}

function think(p, api) {
  const me = p.self, e = p.enemy;
  if (!me.alive || !e.alive) return;
  const obs = p.arena.obstacles;

  for (const ev of p.events) {
    if (ev.type === 'enemyStarted' && ev.skill === 'laser') lastLaserStart = p.t;
    if (ev.type === 'blocked') lastBlocked = p.t;
    if (ev.type === 'missed' && ev.skill === 'smash') smashThresh = Math.max(2.9, smashThresh - 0.2);
    if (ev.type === 'dealt' && ev.skill === 'smash') smashThresh = Math.min(4.0, smashThresh + 0.07);
  }

  const dist = e.dist;
  const predE = (dt) => ({ x: e.x + e.vx * dt, z: e.z + e.vz * dt });
  const toE = V.toward(me, e);

  if (me.stunned || me.airborne) return;

  // --- committed states: only steer facing / keep pressing forward
  const c = me.casting;
  if (c && c.skill === 'smash' && c.telegraph) {
    const q = predE(Math.max(0, Math.min(0.3, c.remaining)));
    api.faceAt(q.x, q.z);
    api.move(toE.x, toE.z);
    return;
  }
  if (c && c.skill === 'charge') {
    if (c.phase === 'windup') {
      const lead = Math.max(0, 0.34 - c.elapsed) + Math.min(0.8, dist / 15);
      const q = predE(lead);
      api.faceAt(q.x, q.z);
    }
    return;
  }
  if (me.busy) {
    api.faceAt(e.x, e.z);
    api.move(toE.x, toE.z);
    return;
  }

  const enemyLaser = e.casting && e.casting.skill === 'laser' && e.casting.telegraph;
  const smashReady = api.ready('smash');
  const chargeReady = api.ready('charge');
  const ang = Math.abs(V.angleTo(me.heading, toE));

  // predicted geometry at smash landing
  const sf = { x: me.x + me.vx * 0.18, z: me.z + me.vz * 0.18 };
  const ef = predE(0.26);
  const predDist = Math.hypot(sf.x - ef.x, sf.z - ef.z);

  let acted = false;

  // 1) charge into a laser cast: cancels it and hurts
  if (chargeReady && enemyLaser && e.visible && dist < 12.5 && dist > 1.6 && ang < 1.1 && !e.airborne) {
    const q = predE(0.34 + Math.min(0.8, dist / 15));
    api.faceAt(q.x, q.z);
    api.use('charge');
    acted = true;
  }

  // 2) smash whenever they are inside the cone
  if (!acted && smashReady && !e.airborne && !e.invulnerable && predDist <= (e.stunned || (e.casting && e.casting.telegraph) ? smashThresh + 0.5 : smashThresh)) {
    const q = predE(0.26);
    api.faceAt(q.x, q.z);
    api.use('smash');
    acted = true;
  }

  // 3) charge as a gap closer
  if (!acted && chargeReady && e.visible && !e.airborne && !e.invulnerable && dist > 3.6 && dist < 12.0 && ang < 0.95) {
    const q = predE(0.34 + Math.min(0.8, dist / 15));
    api.faceAt(q.x, q.z);
    api.use('charge');
    acted = true;
  }

  // --- facing
  if (!acted) {
    const q = predE(0.2);
    api.faceAt(q.x, q.z);
  }

  // --- movement
  const lp = V.lead(me, e, { x: e.vx, z: e.vz }, me.maxSpeed);
  const chaseDir = V.toward(me, { x: lp.x, z: lp.z });
  const dirOK = chaseDir.x !== 0 || chaseDir.z !== 0;
  const approach = dirOK ? chaseDir : toE;

  const wantCover = e.visible && !acted && (enemyLaser || (dist > 13 && !chargeReady)) && dist > 5.0;

  if (!e.visible) {
    api.moveTo(e.x, e.z);
  } else if (wantCover) {
    const cv = pickCover(me, e, obs, enemyLaser ? 5 : 2.5);
    if (cv) api.moveTo(cv.x, cv.z);
    else api.move(approach.x, approach.z);
  } else if (p.t - lastBlocked < 0.7) {
    api.moveTo(e.x, e.z);
  } else {
    if (dist < 2.3) {
      // shove them: heavier body wins contact, keep inside cone
      const side = V.perp(toE);
      const s = (Math.floor(p.t * 0.5) % 2 === 0) ? 0.35 : -0.35;
      api.move(toE.x + side.x * s, toE.z + side.z * s);
    } else {
      api.move(approach.x, approach.z);
    }
  }

  if (p.t - saidT > 6) {
    saidT = p.t;
    if (dist < 4) api.say("Inside your range now.");
    else if (enemyLaser) api.say("Beam charging — closing.");
    else api.say("Fists beat photons.");
  }
}
