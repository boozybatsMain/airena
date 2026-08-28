function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me || !en || !me.alive) return;

  // ---- event bookkeeping ----
  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      if (e.skill === 'laser') lastLaserStart = p.t;
      if (e.skill === 'blink') lastBlinkStart = p.t;
      if (e.skill === 'jump') lastJumpStart = p.t;
    }
    if (e.type === 'blocked') blockedCount++;
  }

  if (me.stunned) return;

  const dist = en.dist;
  const ec = en.casting;
  const enemyLaser = !!(ec && ec.skill === 'laser' && ec.telegraph);
  const laserRem = enemyLaser ? Math.max(0.05, ec.remaining) : 0;

  // enemy airborne remaining
  let airRem = 0;
  if (en.airborne) airRem = 0.45;
  if (ec && ec.skill === 'jump') {
    if (ec.phase === 'windup') airRem = ec.remaining + 0.567;
    else if (ec.phase === 'air') airRem = ec.remaining;
    else airRem = 0;
  }

  // ---- if already committed to something, just steer ----
  if (me.busy && me.casting) {
    const ph = me.casting;
    if (ph.skill === 'smash') {
      const pr = predict(en, 0.3);
      api.faceAt(pr.x, pr.z);
      if (dist > 2.6) api.move(en.x - me.x, en.z - me.z);
      else api.stop();
      return;
    }
    if (ph.skill === 'charge' && ph.phase === 'windup') {
      const aim = chargeAim(me, en, ph.remaining);
      api.faceAt(aim.x, aim.z);
      return;
    }
    // dash / recover / air : keep facing them
    api.faceAt(en.x, en.z);
    return;
  }

  // ---- default facing ----
  const lead = predict(en, 0.18);
  api.faceAt(lead.x, lead.z);

  const angErr = Math.abs(angDiff(me.heading, Math.atan2(lead.x - me.x, lead.z - me.z)));

  // ---- SMASH ----
  const smashReady = api.ready('smash');
  const ps = predict(en, 0.3);
  const pdist = Math.hypot(ps.x - me.x, ps.z - me.z);
  const angToPred = Math.atan2(ps.x - me.x, ps.z - me.z);
  const turnNeed = Math.abs(angDiff(me.heading, angToPred));
  const coneOk = turnNeed - 0.62 < 0.85;
  if (smashReady && pdist <= 4.6 && coneOk && airRem <= 0.28 && !en.invulnerable) {
    api.use('smash');
    if (dist > 2.7) api.move(en.x - me.x, en.z - me.z);
    else api.stop();
    return;
  }

  // ---- CHARGE ----
  const chargeReady = api.ready('charge');
  if (chargeReady && dist >= 2.5 && dist <= 12.6 && en.visible) {
    const aim = chargeAim(me, en, 0.3);
    const dx = aim.x - me.x, dz = aim.z - me.z;
    const adist = Math.hypot(dx, dz) || 1;
    const r = api.ray(dx / adist, dz / adist, Math.min(12.5, adist + 1));
    const clear = (!r.hit) || r.dist >= Math.min(adist, 12) - 0.6;
    const wantClose = dist >= 4.9;
    const wantInterrupt = enemyLaser;
    const wantFinish = en.hp <= 70;
    const notPreemptingSmash = !(smashReady && dist <= 4.6);
    if (clear && notPreemptingSmash && (wantClose || wantInterrupt || wantFinish)) {
      api.use('charge');
      api.faceAt(aim.x, aim.z);
      return;
    }
  }

  // ---- defensive cover vs laser we cannot punish ----
  if (enemyLaser && dist > 5.5 && en.visible && laserRem > 0.15) {
    const spot = findCover(p, api, laserRem);
    if (spot) {
      api.moveTo(spot.x, spot.z);
      return;
    }
  }

  // ---- movement: pressure ----
  const dxE = en.x - me.x, dzE = en.z - me.z;
  if (dist <= 4.4) {
    // stay glued, shove them
    api.move(dxE, dzE);
  } else if (en.visible) {
    let mx = dxE / (dist || 1), mz = dzE / (dist || 1);
    if (dist > 7) {
      const s = Math.sin(p.t * 2.3) * 0.5;
      mx += -mz * s * 0 + (-dzE / dist) * s;
      mz += (dxE / dist) * s;
    }
    const tx = me.x + mx * 4, tz = me.z + mz * 4;
    if (Math.abs(tx) > 19.2 || Math.abs(tz) > 19.2) api.moveTo(en.x, en.z);
    else api.move(mx, mz);
  } else {
    api.moveTo(en.x, en.z);
  }

  if (p.t - saidAt > 6.5) {
    saidAt = p.t;
    const lines = ["come here, ink sack", "no beam beats fists", "closing in", "smash first, ask later"];
    api.say(lines[Math.floor(api.rand() * lines.length) % lines.length]);
  }
}

let lastLaserStart = -99;
let lastBlinkStart = -99;
let lastJumpStart = -99;
let blockedCount = 0;
let saidAt = -99;

function angDiff(h, target) {
  let d = target - h;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

function predict(en, t) {
  const sp = Math.hypot(en.vx || 0, en.vz || 0);
  const cap = Math.min(sp, en.maxSpeed || 4.22);
  const ux = sp > 0.01 ? (en.vx / sp) * cap : 0;
  const uz = sp > 0.01 ? (en.vz / sp) * cap : 0;
  let x = en.x + ux * t, z = en.z + uz * t;
  if (x > 19.5) x = 19.5; if (x < -19.5) x = -19.5;
  if (z > 19.5) z = 19.5; if (z < -19.5) z = -19.5;
  return { x, z };
}

function chargeAim(me, en, windupRem) {
  let t = Math.max(0, windupRem);
  let px = en.x, pz = en.z;
  for (let i = 0; i < 3; i++) {
    const q = predict(en, t);
    px = q.x; pz = q.z;
    const d = Math.hypot(px - me.x, pz - me.z);
    t = Math.max(0, windupRem) + Math.max(0, d - 2.1) / 15;
    if (t > 1.1) t = 1.1;
  }
  return { x: px, z: pz };
}

function segBox(ax, az, bx, bz, box, pad) {
  const minx = box.x - box.hx - pad, maxx = box.x + box.hx + pad;
  const minz = box.z - box.hz - pad, maxz = box.z + box.hz + pad;
  const dx = bx - ax, dz = bz - az;
  let t0 = 0, t1 = 1;
  if (Math.abs(dx) < 1e-9) { if (ax < minx || ax > maxx) return false; }
  else {
    let ta = (minx - ax) / dx, tb = (maxx - ax) / dx;
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  if (Math.abs(dz) < 1e-9) { if (az < minz || az > maxz) return false; }
  else {
    let ta = (minz - az) / dz, tb = (maxz - az) / dz;
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  return true;
}

function segBlocked(p, ax, az, bx, bz) {
  const obs = (p.arena && p.arena.obstacles) || [];
  for (const o of obs) if (segBox(ax, az, bx, bz, o, 0)) return true;
  return false;
}

function insideBlock(p, x, z, pad) {
  const obs = (p.arena && p.arena.obstacles) || [];
  for (const o of obs) {
    if (x > o.x - o.hx - pad && x < o.x + o.hx + pad && z > o.z - o.hz - pad && z < o.z + o.hz + pad) return true;
  }
  return false;
}

function coveredFrom(p, ex, ez, px, pz, half) {
  const dx = px - ex, dz = pz - ez;
  const d = Math.hypot(dx, dz) || 1;
  const nx = -dz / d, nz = dx / d;
  if (!segBlocked(p, ex, ez, px, pz)) return false;
  if (!segBlocked(p, ex, ez, px + nx * half, pz + nz * half)) return false;
  if (!segBlocked(p, ex, ez, px - nx * half, pz - nz * half)) return false;
  return true;
}

function findCover(p, api, timeAvail) {
  const me = p.self, en = p.enemy;
  const reach = Math.min(6.5, Math.max(1.8, me.maxSpeed * timeAvail * 0.95));
  let best = null, bestScore = 1e9;
  for (let i = 0; i < 16; i++) {
    const a = (i * Math.PI) / 8;
    const sx = Math.sin(a), sz = Math.cos(a);
    for (const f of [1.0, 0.62]) {
      const px = me.x + sx * reach * f, pz = me.z + sz * reach * f;
      if (Math.abs(px) > 18.8 || Math.abs(pz) > 18.8) continue;
      if (insideBlock(p, px, pz, me.radius + 0.25)) continue;
      if (!coveredFrom(p, en.x, en.z, px, pz, 1.7)) continue;
      const path = api.pathTo(px, pz);
      if (!path) continue;
      const walk = path.dist;
      if (walk > me.maxSpeed * timeAvail * 1.15 + 0.5) continue;
      const score = walk * 1.0 + Math.hypot(px - en.x, pz - en.z) * 0.45;
      if (score < bestScore) { bestScore = score; best = { x: px, z: pz }; }
    }
  }
  return best;
}
