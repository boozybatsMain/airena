function segBlocked(ax, az, bx, bz, obs) {
  const dx = bx - ax, dz = bz - az;
  for (const o of obs) {
    const minx = o.x - o.hx, maxx = o.x + o.hx, minz = o.z - o.hz, maxz = o.z + o.hz;
    let tmin = 0, tmax = 1, hit = true;
    if (Math.abs(dx) < 1e-9) { if (ax < minx || ax > maxx) hit = false; }
    else {
      let t1 = (minx - ax) / dx, t2 = (maxx - ax) / dx;
      if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) hit = false;
    }
    if (hit) {
      if (Math.abs(dz) < 1e-9) { if (az < minz || az > maxz) hit = false; }
      else {
        let t1 = (minz - az) / dz, t2 = (maxz - az) / dz;
        if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
        if (t1 > tmin) tmin = t1;
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) hit = false;
      }
    }
    if (hit) return true;
  }
  return false;
}

function unit(v) {
  const l = Math.hypot(v.x, v.z);
  if (l < 1e-9) return { x: 0, z: 1 };
  return { x: v.x / l, z: v.z / l };
}

function pickDir(p, api, pref) {
  const me = p.self;
  let best = pref, bs = -1e9;
  for (let k = 0; k < 16; k++) {
    const ang = k * Math.PI / 8;
    const d = { x: Math.sin(ang), z: Math.cos(ang) };
    const r = api.ray(d.x, d.z, 5.5);
    const clear = r ? r.dist : 5.5;
    let s = 2.2 * (d.x * pref.x + d.z * pref.z) + 1.1 * Math.min(clear, 4) / 4;
    const fx = me.x + d.x * 4.5, fz = me.z + d.z * 4.5;
    const m = 20 - Math.max(Math.abs(fx), Math.abs(fz));
    if (m < 2.5) s -= (2.5 - m) * 1.3;
    if (clear < 1.7) s -= 3.5;
    if (s > bs) { bs = s; best = d; }
  }
  return best;
}

function pickBlink(p, pref) {
  const me = p.self, en = p.enemy;
  let best = pref, bs = -1e9;
  for (let k = 0; k < 16; k++) {
    const ang = k * Math.PI / 8;
    const d = { x: Math.sin(ang), z: Math.cos(ang) };
    const tx = me.x + d.x * 7.5, tz = me.z + d.z * 7.5;
    const cx = Math.max(-18.2, Math.min(18.2, tx));
    const cz = Math.max(-18.2, Math.min(18.2, tz));
    const dEn = Math.hypot(cx - en.x, cz - en.z);
    let s = Math.min(dEn, 16) + 3.0 * (d.x * pref.x + d.z * pref.z);
    s -= (Math.abs(tx - cx) + Math.abs(tz - cz)) * 0.8;
    s -= 0.12 * Math.hypot(cx, cz);
    if (s > bs) { bs = s; best = d; }
  }
  return best;
}

let strafeSign = 1;
let enemyLast = { smash: -99, charge: -99, jump: -99 };
let flipTimer = 0;
let saidHello = false;

function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive) return;
  const obs = p.arena.obstacles || [];

  for (const e of p.events) {
    if (e.type === 'enemyStarted' && enemyLast[e.skill] !== undefined) enemyLast[e.skill] = p.t;
    if (e.type === 'blocked') { strafeSign = -strafeSign; flipTimer = p.t; }
    if (e.type === 'damaged' && e.skill === 'smash') { strafeSign = -strafeSign; }
  }

  if (!saidHello) { saidHello = true; api.say("eight arms, one beam"); }

  const dist = en.dist;
  const toEn = unit({ x: en.x - me.x, z: en.z - me.z });
  const away = { x: -toEn.x, z: -toEn.z };
  const tang = { x: toEn.z * strafeSign, z: -toEn.x * strafeSign };

  // ---- aim prediction ----
  let tAhead = 0.15;
  if (me.casting && me.casting.skill === 'laser' && me.casting.telegraph) {
    tAhead = Math.max(0.05, Math.min(0.75, me.casting.remaining));
  } else if (api.cooldown('laser') < 0.25) {
    tAhead = 0.7;
  }
  let lead = 0.85;
  if (en.casting && en.casting.skill === 'charge' && en.casting.phase === 'dash') lead = 1.0;
  let ax = en.x + en.vx * tAhead * lead;
  let az = en.z + en.vz * tAhead * lead;
  const ld = Math.hypot(ax - en.x, az - en.z);
  if (ld > 4.5) { ax = en.x + (ax - en.x) * 4.5 / ld; az = en.z + (az - en.z) * 4.5 / ld; }
  api.faceAt(ax, az);

  // ---- threat assessment ----
  const enCast = en.casting;
  const chargeThreat = enCast && enCast.skill === 'charge' &&
    (enCast.phase === 'dash' || (enCast.phase === 'windup' && enCast.remaining <= 0.14));
  const smashThreat = enCast && enCast.skill === 'smash' && enCast.telegraph;

  let onLine = false, dodgeDir = tang;
  if (chargeThreat) {
    const h = { x: Math.sin(en.heading), z: Math.cos(en.heading) };
    const rx = me.x - en.x, rz = me.z - en.z;
    const along = rx * h.x + rz * h.z;
    const cross = rx * h.z - rz * h.x;
    const perpD = Math.abs(cross);
    if (along > -1 && perpD < 4.0 && dist < 16) {
      onLine = true;
      const sgn = cross >= 0 ? 1 : -1;
      dodgeDir = { x: h.z * sgn, z: -h.x * sgn };
      dodgeDir = unit({ x: dodgeDir.x * 1.0 + away.x * 0.35, z: dodgeDir.z * 1.0 + away.z * 0.35 });
    }
  }

  const blinkReady = api.ready('blink');
  const jumpReady = api.ready('jump');
  const laserReady = api.ready('laser');

  let acted = false;

  // ---- 1. dodge a committed charge ----
  if (onLine && !me.stunned) {
    if (blinkReady && !me.busy) {
      const d = pickBlink(p, dodgeDir);
      api.use('blink', d.x, d.z);
      acted = true;
      api.move(dodgeDir.x, dodgeDir.z);
      return;
    }
    api.move(dodgeDir.x, dodgeDir.z);
    if (!me.busy && jumpReady && dist < 6) { /* no help vs charge */ }
    return;
  }

  // ---- 2. dodge a smash ----
  if (smashThreat && dist < 6.6 && !me.stunned) {
    const esc = pickDir(p, api, unit({ x: away.x + tang.x * 0.7, z: away.z + tang.z * 0.7 }));
    api.move(esc.x, esc.z);
    if (!me.busy) {
      if (jumpReady) { api.use('jump'); return; }
      if (blinkReady && dist < 5.6) { const d = pickBlink(p, away); api.use('blink', d.x, d.z); return; }
    }
    return;
  }

  // ---- 3. emergency separation ----
  if (!me.busy && !me.stunned && blinkReady && dist < 5.0 && !en.stunned) {
    const d = pickBlink(p, unit({ x: away.x + tang.x * 0.5, z: away.z + tang.z * 0.5 }));
    api.use('blink', d.x, d.z);
    api.move(away.x, away.z);
    return;
  }

  // ---- 4. laser ----
  const clearShot = en.visible && !segBlocked(me.x, me.z, ax, az, obs);
  const angErr = Math.abs(V.angleTo(me.heading, { x: ax - me.x, z: az - me.z }));
  let castMin = 7.2;
  if (en.stunned) castMin = 2.0;
  else if (en.airborne) castMin = 3.5;
  else if (enCast && enCast.phase === 'recover') castMin = 3.0;
  else if (enCast && enCast.skill === 'charge' && enCast.phase === 'dash') castMin = 99;
  if (me.invulnerable) castMin = Math.min(castMin, 5.0);

  if (!acted && laserReady && !me.busy && !me.stunned && !me.airborne &&
      clearShot && dist >= castMin && dist <= 22.5 && angErr < 0.85 && !en.invulnerable) {
    api.use('laser');
    acted = true;
  }

  // ---- 5. movement ----
  let pref;
  if (!en.visible && dist > 10) {
    const path = api.pathTo(en.x, en.z);
    if (path && path.points && path.points.length) {
      const wp = path.points[0];
      const d = unit({ x: wp.x - me.x, z: wp.z - me.z });
      pref = d;
    } else {
      pref = toEn;
    }
  } else if (dist < 8) {
    pref = unit({ x: away.x * 1.0 + tang.x * 0.55, z: away.z * 1.0 + tang.z * 0.55 });
  } else if (dist < 14) {
    pref = unit({ x: away.x * 0.85 + tang.x * 0.75, z: away.z * 0.85 + tang.z * 0.75 });
  } else if (dist < 19) {
    pref = unit({ x: away.x * 0.2 + tang.x * 1.0, z: away.z * 0.2 + tang.z * 1.0 });
  } else if (dist < 23) {
    pref = unit({ x: tang.x * 1.0, z: tang.z * 1.0 });
  } else {
    pref = unit({ x: toEn.x * 1.0 + tang.x * 0.4, z: toEn.z * 1.0 + tang.z * 0.4 });
  }

  const dir = pickDir(p, api, pref);
  api.move(dir.x, dir.z);

  // occasional strafe flip to break predictable circling
  if (p.t - flipTimer > 3.2 && api.rand() < 0.06) { strafeSign = -strafeSign; flipTimer = p.t; }
}
