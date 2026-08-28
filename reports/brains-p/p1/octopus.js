const M = {
  lastCharge: -99, lastSmash: -99, lastJump: -99,
  chargeT: -99, chargeDir: null, lastBlink: -99, born: false
};

function inAnyBox(x, z, obs, pad) {
  for (const b of obs) {
    if (x > b.x - b.hx - pad && x < b.x + b.hx + pad && z > b.z - b.hz - pad && z < b.z + b.hz + pad) return true;
  }
  return false;
}

function segBox(ax, az, bx, bz, b, pad) {
  const minx = b.x - b.hx - pad, maxx = b.x + b.hx + pad;
  const minz = b.z - b.hz - pad, maxz = b.z + b.hz + pad;
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dz = bz - az;
  if (Math.abs(dx) < 1e-9) { if (ax < minx || ax > maxx) return false; }
  else {
    let ta = (minx - ax) / dx, tb = (maxx - ax) / dx;
    if (ta > tb) { const tmp = ta; ta = tb; tb = tmp; }
    if (ta > t0) t0 = ta; if (tb < t1) t1 = tb;
    if (t0 > t1) return false;
  }
  if (Math.abs(dz) < 1e-9) { if (az < minz || az > maxz) return false; }
  else {
    let ta = (minz - az) / dz, tb = (maxz - az) / dz;
    if (ta > tb) { const tmp = ta; ta = tb; tb = tmp; }
    if (ta > t0) t0 = ta; if (tb < t1) t1 = tb;
    if (t0 > t1) return false;
  }
  return true;
}

function hitsAny(ax, az, bx, bz, obs, pad) {
  for (const b of obs) if (segBox(ax, az, bx, bz, b, pad)) return true;
  return false;
}

function losSeg(ax, az, bx, bz, obs) {
  return !hitsAny(ax, az, bx, bz, obs, 0);
}

function chooseDir(p, ideal, wantLos, bias, biasW) {
  const s = p.self, e = p.enemy, obs = p.arena.obstacles, H = p.arena.half;
  const curDist = Math.hypot(s.x - e.x, s.z - e.z);
  let best = null, bestScore = -1e9;
  for (let i = 0; i < 24; i++) {
    const a = i * Math.PI / 12;
    const d = { x: Math.sin(a), z: Math.cos(a) };
    const step = 3.2;
    const qx = s.x + d.x * step, qz = s.z + d.z * step;
    if (Math.abs(qx) > H - 1.3 || Math.abs(qz) > H - 1.3) continue;
    if (hitsAny(s.x, s.z, qx, qz, obs, 1.15)) continue;
    const dq = Math.hypot(qx - e.x, qz - e.z);
    let sc = -Math.abs(dq - ideal) * 1.0;
    if (dq > curDist) sc += 0.4;
    const clear = Math.min(H - Math.abs(qx), H - Math.abs(qz));
    if (clear < 5.5) sc -= (5.5 - clear) * 1.1;
    const vis = losSeg(qx, qz, e.x, e.z, obs);
    sc += wantLos ? (vis ? 1.8 : -2.6) : (vis ? -2.2 : 2.4);
    if (s.speed > 0.6) sc += ((d.x * s.vx + d.z * s.vz) / s.speed) * 0.7;
    if (bias) sc += (d.x * bias.x + d.z * bias.z) * (biasW || 2);
    if (sc > bestScore) { bestScore = sc; best = d; }
  }
  return best;
}

function chooseBlink(p, prefer) {
  const s = p.self, e = p.enemy, obs = p.arena.obstacles, H = p.arena.half;
  let best = null, bs = -1e9;
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8;
    const d = { x: Math.sin(a), z: Math.cos(a) };
    let R = 7.5, lx = s.x + d.x * R, lz = s.z + d.z * R;
    let guard = 0;
    while (guard++ < 12 && (Math.abs(lx) > H - 1.2 || Math.abs(lz) > H - 1.2 || inAnyBox(lx, lz, obs, 1.15))) {
      R -= 0.7; lx = s.x + d.x * R; lz = s.z + d.z * R;
      if (R < 1.2) break;
    }
    if (R < 1.5) continue;
    let sc = Math.hypot(lx - e.x, lz - e.z);
    const clear = Math.min(H - Math.abs(lx), H - Math.abs(lz));
    if (clear < 4.5) sc -= (4.5 - clear) * 1.3;
    if (prefer) sc += (d.x * prefer.x + d.z * prefer.z) * 4.5;
    if (sc > bs) { bs = sc; best = d; }
  }
  if (best) return best;
  if (prefer) return prefer;
  return { x: -Math.sin(s.heading), z: -Math.cos(s.heading) };
}

function think(p, api) {
  const s = p.self, e = p.enemy;
  if (!s || !s.alive || !e) return;
  const obs = p.arena.obstacles;

  if (!M.born || p.tick <= 4) {
    M.born = true;
    M.lastCharge = -99; M.lastSmash = -99; M.lastJump = -99;
    M.chargeT = -99; M.chargeDir = null; M.lastBlink = -99;
    api.say("eight arms, one beam");
  }

  for (const ev of p.events) {
    if (ev.type === 'enemyStarted') {
      if (ev.skill === 'charge') { M.lastCharge = p.t; M.chargeDir = null; }
      else if (ev.skill === 'smash') M.lastSmash = p.t;
      else if (ev.skill === 'jump') M.lastJump = p.t;
    } else if (ev.type === 'enemyCommitted' && ev.skill === 'charge') {
      M.chargeDir = { x: Math.sin(e.heading), z: Math.cos(e.heading) };
      M.chargeT = p.t;
    } else if (ev.type === 'blinked') {
      M.lastBlink = p.t;
    }
  }

  const dist = (typeof e.dist === 'number') ? e.dist : Math.hypot(s.x - e.x, s.z - e.z);
  const chargeReady = (p.t - M.lastCharge) > 3.85;
  const myFrac = s.hp / s.maxHp, hisFrac = e.hp / e.maxHp;
  const evade = p.burn > 0 && myFrac > hisFrac + 0.02;

  let moveDir = null, skill = null, sa = 0, sb = 0;

  // --- facing: lead the target for the beam ---
  let tt = 0.30;
  if (s.casting && s.casting.skill === 'laser' && s.casting.telegraph) {
    tt = Math.min(s.casting.remaining || 0.4, 0.7);
  }
  let aimX = e.x + e.vx * tt * 0.85, aimZ = e.z + e.vz * tt * 0.85;
  api.faceAt(aimX, aimZ);

  if (s.stunned) return;

  // --- charge threat ---
  let threatDir = null, dashing = false;
  if (e.casting && e.casting.skill === 'charge') {
    dashing = (e.casting.phase === 'dash');
    threatDir = (dashing && M.chargeDir) ? M.chargeDir : { x: Math.sin(e.heading), z: Math.cos(e.heading) };
  } else if (M.chargeDir && (p.t - M.chargeT) < 0.85) {
    threatDir = M.chargeDir; dashing = true;
  }

  if (threatDir) {
    const rx = s.x - e.x, rz = s.z - e.z;
    const along = rx * threatDir.x + rz * threatDir.z;
    const lat = rx * threatDir.z - rz * threatDir.x;
    const inPath = along > -1.5 && along < 14.5 && Math.abs(lat) < 3.4;
    if (inPath) {
      const sgn = lat >= 0 ? 1 : -1;
      let esc = { x: threatDir.z * sgn, z: -threatDir.x * sgn };
      const H = p.arena.half;
      const tx = s.x + esc.x * 3.5, tz = s.z + esc.z * 3.5;
      if (Math.abs(tx) > H - 1.4 || Math.abs(tz) > H - 1.4 || hitsAny(s.x, s.z, tx, tz, obs, 1.1)) {
        esc = { x: -esc.x, z: -esc.z };
      }
      if (dashing && api.ready('blink') && !s.busy) {
        const bd = chooseBlink(p, esc);
        skill = 'blink'; sa = bd.x; sb = bd.z;
        moveDir = esc;
      } else {
        const back = { x: esc.x * 1.0 - threatDir.x * 0.25, z: esc.z * 1.0 - threatDir.z * 0.25 };
        moveDir = back;
      }
      api.move(moveDir.x, moveDir.z);
      if (skill) api.use(skill, sa, sb);
      return;
    }
  }

  // --- smash threat ---
  if (e.casting && e.casting.skill === 'smash' && e.casting.telegraph && dist < 6.4) {
    const away = V.norm({ x: s.x - e.x, z: s.z - e.z });
    let d2 = chooseDir(p, 20, false, away, 3.5) || away;
    api.move(d2.x, d2.z);
    if (api.ready('jump') && !s.busy && !s.airborne) api.use('jump');
    else if (api.ready('blink') && !s.busy) {
      const bd = chooseBlink(p, away);
      api.use('blink', bd.x, bd.z);
    }
    return;
  }

  // --- melee escape ---
  if (dist < 4.6 && !s.airborne) {
    const away = V.norm({ x: s.x - e.x, z: s.z - e.z });
    const d2 = chooseDir(p, 20, false, away, 3.0) || away;
    api.move(d2.x, d2.z);
    const desperate = dist < 3.0 || myFrac < 0.35;
    if (api.ready('blink') && !s.busy && (!chargeReady || desperate)) {
      const bd = chooseBlink(p, away);
      api.use('blink', bd.x, bd.z);
    }
    return;
  }

  // --- kiting ---
  let ideal = evade ? 18.5 : 13.5;
  if (dist > 24) ideal = 17;
  const laserCd = api.cooldown('laser');
  let wantLos = true;
  if (chargeReady && dist < 12.5 && laserCd > 0.45) wantLos = false;
  if (evade && laserCd > 0.5) wantLos = false;

  const kd = chooseDir(p, ideal, wantLos, null, 0);
  if (kd) moveDir = kd;
  else moveDir = V.norm({ x: s.x - e.x, z: s.z - e.z });
  api.move(moveDir.x, moveDir.z);

  // --- laser ---
  const enemyLocked = e.stunned || e.airborne ||
    (e.casting && ((e.casting.skill === 'charge' && e.casting.phase !== 'windup') || e.casting.phase === 'recover'));
  const minRange = evade ? 11.5 : 8.0;
  const safeCast = dist > minRange && dist < 23.5 &&
    (dist > 14 || !chargeReady || enemyLocked);

  if (!s.busy && !s.airborne && api.ready('laser') && e.visible && safeCast) {
    if (api.los(aimX, aimZ) || api.los(e.x, e.z)) {
      api.use('laser');
    }
  }
}
