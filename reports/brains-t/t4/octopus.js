const DIRS = (() => { const a = []; for (let i = 0; i < 24; i++) { const t = i * Math.PI / 12; a.push({ x: Math.sin(t), z: Math.cos(t) }); } return a; })();

let prevDir = { x: 0, z: 1 };
let tCharge = -99;
let tSmash = -99;
let lastCast = -99;
let lastSay = -99;

function segHitsBox(ax, az, bx, bz, o, pad) {
  const minx = o.x - o.hx - pad, maxx = o.x + o.hx + pad;
  const minz = o.z - o.hz - pad, maxz = o.z + o.hz + pad;
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dz = bz - az;
  if (Math.abs(dx) < 1e-9) { if (ax < minx || ax > maxx) return false; }
  else {
    let ta = (minx - ax) / dx, tb = (maxx - ax) / dx;
    if (ta > tb) { const t = ta; ta = tb; tb = t; }
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  if (Math.abs(dz) < 1e-9) { if (az < minz || az > maxz) return false; }
  else {
    let ta = (minz - az) / dz, tb = (maxz - az) / dz;
    if (ta > tb) { const t = ta; ta = tb; tb = t; }
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  return true;
}

function clearLine(p, ax, az, bx, bz) {
  for (const o of p.arena.obstacles) if (segHitsBox(ax, az, bx, bz, o, 0)) return false;
  return true;
}

function blockedAt(p, x, z, pad) {
  for (const o of p.arena.obstacles) if (Math.abs(x - o.x) < o.hx + pad && Math.abs(z - o.z) < o.hz + pad) return true;
  return false;
}

function pickMove(p, desired, wantLOS, chargeDir) {
  const me = p.self, en = p.enemy;
  const L = 3.0, half = p.arena.half;
  let best = prevDir, bestS = -1e9;
  for (const dir of DIRS) {
    let s = 0;
    let blocked = false;
    for (let f = 1; f <= 3; f++) {
      const px = me.x + dir.x * (L * f / 3), pz = me.z + dir.z * (L * f / 3);
      if (Math.abs(px) > half - 1.1 || Math.abs(pz) > half - 1.1) { blocked = true; break; }
      if (blockedAt(p, px, pz, 1.15)) { blocked = true; break; }
    }
    if (blocked) s -= 60;
    const qx = me.x + dir.x * L, qz = me.z + dir.z * L;
    const dd = Math.hypot(qx - en.x, qz - en.z);
    s -= 3.0 * Math.max(0, desired - dd);
    s -= 0.12 * Math.max(0, dd - desired - 4);
    const wd = half - Math.max(Math.abs(qx), Math.abs(qz));
    s -= 2.6 * Math.max(0, 5 - wd);
    const clear = clearLine(p, qx, qz, en.x, en.z);
    if (wantLOS) s += clear ? 2.0 : -3.0; else s += clear ? -1.0 : 2.0;
    s += 0.9 * (dir.x * prevDir.x + dir.z * prevDir.z);
    if (chargeDir) {
      const rx = qx - en.x, rz = qz - en.z;
      const fwd = chargeDir.x * rx + chargeDir.z * rz;
      const lat = Math.abs(chargeDir.x * rz - chargeDir.z * rx);
      if (fwd > -2 && fwd < 15 && lat < 3.5) s -= 4 + 10 * (3.5 - lat) / 3.5;
    }
    if (s > bestS) { bestS = s; best = dir; }
  }
  return best;
}

function bestBlink(p, chargeDir) {
  const me = p.self, en = p.enemy, half = p.arena.half;
  let best = null, bestS = -1e9;
  for (const dir of DIRS) {
    let r = 7.5;
    let guard = 0;
    while (r > 1.0 && guard < 16 && blockedAt(p, me.x + dir.x * r, me.z + dir.z * r, 1.05)) { r -= 0.5; guard++; }
    let lx = me.x + dir.x * r, lz = me.z + dir.z * r;
    const h = half - 1.05;
    let off = 0;
    if (Math.abs(lx) > h) { off += Math.abs(lx) - h; lx = Math.max(-h, Math.min(h, lx)); }
    if (Math.abs(lz) > h) { off += Math.abs(lz) - h; lz = Math.max(-h, Math.min(h, lz)); }
    const dd = Math.hypot(lx - en.x, lz - en.z);
    let s = Math.min(dd, 15) - 0.6 * off;
    const wd = half - Math.max(Math.abs(lx), Math.abs(lz));
    s -= 2.0 * Math.max(0, 5 - wd);
    if (chargeDir) {
      const rx = lx - en.x, rz = lz - en.z;
      const fwd = chargeDir.x * rx + chargeDir.z * rz;
      const lat = Math.abs(chargeDir.x * rz - chargeDir.z * rx);
      if (fwd > -2 && fwd < 16 && lat < 3.5) s -= 14;
    }
    if (clearLine(p, lx, lz, en.x, en.z)) s += 1.2;
    if (s > bestS) { bestS = s; best = dir; }
  }
  return best || { x: -1, z: 0 };
}

function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive) return;
  const d = en.dist;

  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      if (e.skill === 'charge') tCharge = p.t;
      else if (e.skill === 'smash') tSmash = p.t;
    }
  }

  const ec = en.casting;
  let chargeWind = false, chargeDash = false, smashWind = false, smashLeft = 0;
  if (ec && ec.skill === 'charge') {
    if (ec.phase === 'dash') chargeDash = true;
    else if (ec.telegraph) chargeWind = true;
  }
  if (ec && ec.skill === 'smash' && ec.telegraph) { smashWind = true; smashLeft = ec.remaining || 0; }
  const chargeActive = chargeWind || chargeDash;
  const chargeDir = chargeActive ? V.fromHeading(en.heading) : null;

  let inPath = false;
  if (chargeDir) {
    const rx = me.x - en.x, rz = me.z - en.z;
    const fwd = chargeDir.x * rx + chargeDir.z * rz;
    const lat = Math.abs(chargeDir.x * rz - chargeDir.z * rx);
    inPath = fwd > -1.5 && fwd < 15 && lat < 3.2;
  }

  // ---- facing: lead the target for the beam ----
  let lead = 0.3;
  if (me.casting && me.casting.skill === 'laser') lead = me.casting.remaining;
  else if (api.ready('laser')) lead = 0.72;
  let ax = en.x + en.vx * lead * 0.8;
  let az = en.z + en.vz * lead * 0.8;
  if (!clearLine(p, me.x, me.z, ax, az)) { ax = en.x; az = en.z; }
  api.faceAt(ax, az);

  const canAct = !me.busy && !me.airborne && !me.stunned;
  const chargeReady = (p.t - tCharge) >= 3.9;

  // ---- movement intent ----
  let desired = 15;
  if (chargeActive) desired = 16;
  else if (d < 6) desired = 16;
  const wantLOS = (api.cooldown('laser') < 1.1) || (me.casting && me.casting.skill === 'laser') || d > 17;
  let moveDir = pickMove(p, desired, wantLOS, chargeActive ? chargeDir : null);

  let used = false;

  // 1. break a committed charge with a sidestep teleport
  if (canAct && chargeDash && inPath && api.ready('blink')) {
    const b = bestBlink(p, chargeDir);
    api.use('blink', b.x, b.z);
    used = true;
  }
  // 2. late wind-up escape if he is right on top of us
  else if (canAct && chargeWind && inPath && d < 7.5 && api.ready('blink') && ec && ec.remaining < 0.14) {
    const b = bestBlink(p, chargeDir);
    api.use('blink', b.x, b.z);
    used = true;
  }
  // 3. hop over a smash, or teleport out of the cone
  else if (canAct && smashWind && d < 6.6) {
    if (api.ready('jump') && smashLeft > 0.13) {
      moveDir = V.norm(V.away(me, en));
      if (blockedAt(p, me.x + moveDir.x * 2.5, me.z + moveDir.z * 2.5, 1.15)) moveDir = pickMove(p, 17, false, null);
      api.use('jump');
      used = true;
    } else if (api.ready('blink')) {
      const b = bestBlink(p, null);
      api.use('blink', b.x, b.z);
      used = true;
    }
  }
  // 4. too close for comfort — reset the spacing
  else if (canAct && api.ready('blink') && d < 4.8) {
    const b = bestBlink(p, null);
    api.use('blink', b.x, b.z);
    used = true;
  }

  // 5. the beam
  if (!used && canAct && api.ready('laser') && en.visible && d <= 25 && !en.invulnerable && !smashWind && !(chargeActive && inPath)) {
    const stale = (p.t - lastCast) > 3.4;
    const safe = d >= 14.5 || en.stunned || (!chargeReady && d >= 7.5) || (stale && d >= 8.5);
    if (safe) {
      api.use('laser');
      lastCast = p.t;
      used = true;
    }
  }

  api.move(moveDir.x, moveDir.z);
  prevDir = moveDir;

  if (p.t - lastSay > 7) {
    lastSay = p.t;
    if (d < 6) api.say("eight arms, none of them yours");
    else if (en.hp < me.hp) api.say("hold still, ape");
    else api.say("ink and light");
  }
}
