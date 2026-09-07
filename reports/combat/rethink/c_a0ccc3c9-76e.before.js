const CD = { smash: 1.3, charge: 4.033, jump: 2.8 };
let enemyUse = { smash: -99, charge: -99, jump: -99 };
let chargeCommit = null;
let prevDir = { x: 0, z: 1 };
let lastSay = -99;

function pointBlocked(x, z, obs, pad) {
  for (const b of obs) {
    if (Math.abs(x - b.x) <= b.hx + pad && Math.abs(z - b.z) <= b.hz + pad) return true;
  }
  return false;
}

function segBox(ax, az, bx, bz, b, pad) {
  const dx = bx - ax, dz = bz - az;
  let tmin = 0, tmax = 1;
  const minx = b.x - b.hx - pad, maxx = b.x + b.hx + pad;
  const minz = b.z - b.hz - pad, maxz = b.z + b.hz + pad;
  if (Math.abs(dx) < 1e-9) { if (ax < minx || ax > maxx) return false; }
  else {
    let t1 = (minx - ax) / dx, t2 = (maxx - ax) / dx;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  if (Math.abs(dz) < 1e-9) { if (az < minz || az > maxz) return false; }
  else {
    let t1 = (minz - az) / dz, t2 = (maxz - az) / dz;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  return true;
}

function blockedSeg(ax, az, bx, bz, pad, obs) {
  for (const b of obs) if (segBox(ax, az, bx, bz, b, pad)) return true;
  return false;
}

function wallPen(x, z) {
  const w = Math.max(Math.abs(x), Math.abs(z));
  return w > 14.5 ? (w - 14.5) * 1.6 : 0;
}

function resolveBlink(mx, mz, dx, dz, len, obs) {
  let L = len;
  for (let k = 0; k < 18; k++) {
    let x = mx + dx * L, z = mz + dz * L;
    x = Math.max(-18.9, Math.min(18.9, x));
    z = Math.max(-18.9, Math.min(18.9, z));
    if (!pointBlocked(x, z, obs, 1.1)) return { x, z, len: L };
    L -= 0.5;
    if (L <= 0.4) break;
  }
  return { x: mx, z: mz, len: 0 };
}

function bestBlink(p, obs, mode, line) {
  const me = p.self, en = p.enemy;
  let best = null, bestS = -1e9;
  for (let i = 0; i < 20; i++) {
    const a = i * Math.PI * 2 / 20;
    const d = { x: Math.sin(a), z: Math.cos(a) };
    const land = resolveBlink(me.x, me.z, d.x, d.z, 7.3, obs);
    if (land.len < 2.5) continue;
    const de = Math.hypot(land.x - en.x, land.z - en.z);
    let s = 0;
    if (mode === 'charge' && line) {
      const rx = land.x - line.x, rz = land.z - line.z;
      const perp = Math.abs(rx * line.dir.z - rz * line.dir.x);
      const along = rx * line.dir.x + rz * line.dir.z;
      s += Math.min(perp, 8) * 2.2;
      if (along < 0) s += 2.0;
      s += Math.min(de, 15) * 0.55;
    } else {
      s += Math.min(de, 16) * 1.0;
    }
    s -= wallPen(land.x, land.z);
    if (!blockedSeg(land.x, land.z, en.x, en.z, 0, obs)) s += 0.8;
    if (s > bestS) { bestS = s; best = d; }
  }
  return best;
}

function kiteDir(p, obs, desired, wantLos) {
  const me = p.self, en = p.enemy;
  let best = null, bestS = -1e9;
  const R = 3.6;
  for (let i = 0; i < 24; i++) {
    const a = i * Math.PI * 2 / 24;
    const d = { x: Math.sin(a), z: Math.cos(a) };
    const cx = me.x + d.x * R, cz = me.z + d.z * R;
    if (Math.abs(cx) > 18.5 || Math.abs(cz) > 18.5) continue;
    if (blockedSeg(me.x, me.z, cx, cz, 1.15, obs)) continue;
    const dd = Math.hypot(cx - en.x, cz - en.z);
    let s = -Math.abs(dd - desired) * 1.0;
    const los = !blockedSeg(cx, cz, en.x, en.z, 0, obs);
    s += wantLos ? (los ? 2.2 : -2.2) : (los ? 0 : 1.2);
    s -= wallPen(cx, cz);
    s += (d.x * prevDir.x + d.z * prevDir.z) * 1.4;
    if (dd < 6) s -= 3.0;
    if (s > bestS) { bestS = s; best = d; }
  }
  if (!best) {
    const aw = V.away({ x: p.self.x, z: p.self.z }, { x: en.x, z: en.z });
    best = (aw.x === 0 && aw.z === 0) ? { x: 0, z: 1 } : aw;
  }
  return best;
}

function think(p, api) {
  const me = p.self, en = p.enemy, now = p.t, obs = p.arena.obstacles;
  if (!me.alive) return;

  for (const e of p.events) {
    if (e.type === 'enemyStarted') { if (e.skill in enemyUse) enemyUse[e.skill] = now; }
    else if (e.type === 'enemyCommitted') {
      if (e.skill === 'charge') chargeCommit = { x: en.x, z: en.z, dir: V.fromHeading(en.heading), t: now };
    }
  }

  const ec = en.casting;
  if (ec && (ec.skill in enemyUse) && enemyUse[ec.skill] < now - 1.2) {
    enemyUse[ec.skill] = now - (ec.elapsed || 0);
  }
  if (ec && ec.skill === 'charge' && ec.phase === 'dash' && (!chargeCommit || now - chargeCommit.t > 1.0)) {
    chargeCommit = { x: en.x, z: en.z, dir: V.fromHeading(en.heading), t: now };
  }
  if (chargeCommit && now - chargeCommit.t > 1.3) chargeCommit = null;

  const enCd = (s) => Math.max(0, enemyUse[s] + CD[s] - now);
  const dist = en.dist;

  const chargeWindup = !!(ec && ec.skill === 'charge' && ec.phase === 'windup');
  const chargeDash = !!(ec && ec.skill === 'charge' && ec.phase === 'dash');
  const smashTele = !!(ec && ec.skill === 'smash' && ec.telegraph);

  // ---- facing / aim ----
  const casting = me.casting && me.casting.skill === 'laser' && me.casting.telegraph;
  const leadT = casting ? Math.max(0, me.casting.remaining) : 0.45;
  const aim = { x: en.x + en.vx * leadT * 0.92, z: en.z + en.vz * leadT * 0.92 };
  api.faceAt(aim.x, aim.z);

  // ---- desired range ----
  const fMe = me.hp / me.maxHp, fEn = en.hp / en.maxHp;
  let desired = 13.5;
  if (api.cooldown('laser') > 0.9) desired = 15.5;
  if (fMe > fEn + 0.06 && now > 26) desired = 17.5;
  if (dist > 24) desired = 15;

  // ---- actions ----
  let acted = false;
  if (!me.busy && !me.stunned && !me.airborne) {
    const chargeThreat = chargeDash || (chargeWindup && ec.remaining < 0.16);
    if (chargeThreat && dist < 18 && api.ready('blink')) {
      const line = chargeCommit || { x: en.x, z: en.z, dir: V.fromHeading(en.heading) };
      const d = bestBlink(p, obs, 'charge', line);
      if (d) { api.use('blink', d.x, d.z); acted = true; }
    } else if (smashTele && dist < 6.4) {
      if (ec.remaining > 0.15 && api.ready('jump') && enCd('charge') > 0.9) {
        api.use('jump'); acted = true;
      } else if (api.ready('blink')) {
        const d = bestBlink(p, obs, 'away', null);
        if (d) { api.use('blink', d.x, d.z); acted = true; }
      }
    } else if (dist < 5.0 && api.ready('blink') && enCd('charge') > 0.7 && !chargeWindup) {
      const d = bestBlink(p, obs, 'away', null);
      if (d) { api.use('blink', d.x, d.z); acted = true; }
    }

    if (!acted && api.ready('laser') && en.visible && dist < 21.5 && !chargeWindup && !chargeDash) {
      const safe = (dist >= 9.6 && enCd('smash') > 0.2) ||
                   (enCd('charge') > 1.1 && dist > 6.0 && enCd('smash') > 0.6);
      if (safe && api.los(aim.x, aim.z)) { api.use('laser'); acted = true; }
    }
  }

  // ---- movement ----
  let dir;
  if ((chargeDash || chargeWindup) && dist < 19) {
    const line = chargeCommit || { x: en.x, z: en.z, dir: V.fromHeading(en.heading) };
    let bestS = -1e9, bestD = null;
    for (let i = 0; i < 24; i++) {
      const a = i * Math.PI * 2 / 24;
      const d = { x: Math.sin(a), z: Math.cos(a) };
      const cx = me.x + d.x * 3.2, cz = me.z + d.z * 3.2;
      if (Math.abs(cx) > 18.4 || Math.abs(cz) > 18.4) continue;
      if (blockedSeg(me.x, me.z, cx, cz, 1.15, obs)) continue;
      const rx = cx - line.x, rz = cz - line.z;
      const perp = Math.abs(rx * line.dir.z - rz * line.dir.x);
      const along = rx * line.dir.x + rz * line.dir.z;
      let s = perp * 2.0 + (along < 0 ? 1.5 : 0);
      s -= wallPen(cx, cz);
      s += (d.x * prevDir.x + d.z * prevDir.z) * 0.8;
      if (s > bestS) { bestS = s; bestD = d; }
    }
    dir = bestD || kiteDir(p, obs, desired, false);
  } else {
    const wantLos = api.cooldown('laser') < 1.2 && !(fMe > fEn + 0.06 && now > 26);
    dir = kiteDir(p, obs, desired, wantLos);
  }
  prevDir = { x: prevDir.x * 0.4 + dir.x * 0.6, z: prevDir.z * 0.4 + dir.z * 0.6 };
  api.move(dir.x, dir.z);

  if (now - lastSay > 9) {
    lastSay = now;
    api.say(dist > 12 ? "eight arms, one beam" : "too close, ape");
  }
}
