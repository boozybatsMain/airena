const CD_CHARGE = 4.033, CD_SMASH = 1.3, CD_JUMP = 2.8;

let spin = 1;
let lastDir = { x: 0, z: 1 };
let eReady = { smash: 0, charge: 0, jump: 0 };
let leadScale = 1.0;
let lastBlink = -99;

function inObstacle(x, z, obs, pad) {
  for (const o of obs) {
    if (Math.abs(x - o.x) <= o.hx + pad && Math.abs(z - o.z) <= o.hz + pad) return true;
  }
  return false;
}

function segBlocked(ax, az, bx, bz, obs, pad) {
  const dx = bx - ax, dz = bz - az;
  for (const o of obs) {
    const minx = o.x - o.hx - pad, maxx = o.x + o.hx + pad;
    const minz = o.z - o.hz - pad, maxz = o.z + o.hz + pad;
    let t0 = 0, t1 = 1, ok = true;
    if (Math.abs(dx) < 1e-9) {
      if (ax < minx || ax > maxx) ok = false;
    } else {
      let ta = (minx - ax) / dx, tb = (maxx - ax) / dx;
      if (ta > tb) { const t = ta; ta = tb; tb = t; }
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
      if (t0 > t1) ok = false;
    }
    if (ok) {
      if (Math.abs(dz) < 1e-9) {
        if (az < minz || az > maxz) ok = false;
      } else {
        let ta = (minz - az) / dz, tb = (maxz - az) / dz;
        if (ta > tb) { const t = ta; ta = tb; tb = t; }
        if (ta > t0) t0 = ta;
        if (tb < t1) t1 = tb;
        if (t0 > t1) ok = false;
      }
    }
    if (ok) return true;
  }
  return false;
}

function clampArena(v, R) {
  return Math.max(-R + 1.2, Math.min(R - 1.2, v));
}

function blinkDir(p, api, base) {
  const s = p.self, e = p.enemy, obs = p.arena.obstacles, R = p.arena.half;
  let best = null, bs = -1e9;
  const bl = Math.hypot(base.x, base.z) || 1;
  const bx = base.x / bl, bz = base.z / bl;
  for (let i = 0; i < 20; i++) {
    const a = i * Math.PI / 10;
    const d = { x: Math.sin(a), z: Math.cos(a) };
    const cos = d.x * bx + d.z * bz;
    if (cos < -0.1) continue;
    let lx = s.x + d.x * 7.3, lz = s.z + d.z * 7.3;
    lx = clampArena(lx, R); lz = clampArena(lz, R);
    if (inObstacle(lx, lz, obs, 1.3)) continue;
    let sc = cos * 12;
    const de = Math.hypot(lx - e.x, lz - e.z);
    sc += Math.min(de, 15) * 1.6;
    if (!segBlocked(lx, lz, e.x, e.z, obs, 0.2)) sc += 10;
    sc -= (Math.max(0, Math.abs(lx) - 14) + Math.max(0, Math.abs(lz) - 14)) * 5;
    if (sc > bs) { bs = sc; best = d; }
  }
  return best || { x: bx, z: bz };
}

function chooseMove(p, api, ideal, dodgeLine) {
  const s = p.self, e = p.enemy, obs = p.arena.obstacles, R = p.arena.half;
  const te = V.toward(s, e);
  const toC = V.norm({ x: -s.x, z: -s.z });
  let sp = spin;
  if (Math.abs(s.x) > 15 || Math.abs(s.z) > 15) {
    const t1 = { x: te.z, z: -te.x };
    const a1 = t1.x * toC.x + t1.z * toC.z;
    sp = a1 >= 0 ? 1 : -1;
    spin = sp;
  }
  const tang = { x: te.z * sp, z: -te.x * sp };
  let best = null, bs = -1e9;
  const step = 3.0;
  for (let i = 0; i < 24; i++) {
    const a = i * Math.PI / 12;
    const d = { x: Math.sin(a), z: Math.cos(a) };
    const cx = s.x + d.x * step, cz = s.z + d.z * step;
    if (Math.abs(cx) > R - 1.15 || Math.abs(cz) > R - 1.15) continue;
    if (inObstacle(cx, cz, obs, 1.25)) continue;
    if (!api.los(cx, cz)) continue;
    let sc = 0;
    const de = Math.hypot(cx - e.x, cz - e.z);
    sc -= Math.abs(de - ideal) * 3.2;
    if (!segBlocked(cx, cz, e.x, e.z, obs, 0.2)) sc += 45;
    const ox = Math.max(0, Math.abs(cx) - 13.5), oz = Math.max(0, Math.abs(cz) - 13.5);
    sc -= (ox * ox + oz * oz) * 1.8;
    sc += (d.x * tang.x + d.z * tang.z) * 7;
    sc += (d.x * lastDir.x + d.z * lastDir.z) * 5;
    if (dodgeLine) {
      const rel = { x: cx - e.x, z: cz - e.z };
      const along = rel.x * dodgeLine.x + rel.z * dodgeLine.z;
      const lat = Math.abs(rel.x * dodgeLine.z - rel.z * dodgeLine.x);
      if (along > -1.5 && along < 14 && lat < 3.6) sc -= 40;
    }
    if (sc > bs) { bs = sc; best = d; }
  }
  if (!best) best = toC.x === 0 && toC.z === 0 ? { x: 0, z: 1 } : toC;
  lastDir = best;
  return best;
}

function think(p, api) {
  const s = p.self, e = p.enemy, obs = p.arena.obstacles, R = p.arena.half;

  for (const ev of p.events) {
    if (ev.type === 'enemyStarted') {
      if (ev.skill === 'charge') eReady.charge = p.t + CD_CHARGE;
      else if (ev.skill === 'smash') eReady.smash = p.t + CD_SMASH;
      else if (ev.skill === 'jump') eReady.jump = p.t + CD_JUMP;
    } else if (ev.type === 'missed' && ev.skill === 'laser') {
      if (ev.reason === 'aim') leadScale = Math.max(0.3, leadScale - 0.2);
    } else if (ev.type === 'dealt' && ev.skill === 'laser') {
      leadScale = Math.min(1.1, leadScale + 0.06);
    } else if (ev.type === 'blocked') {
      spin = -spin;
    } else if (ev.type === 'blinked') {
      lastBlink = p.t;
    }
  }

  if (!s.alive || !e) return;
  if (api.rand() < 0.008) spin = -spin;

  const dist = e.dist;
  const chargeReady = p.t >= eReady.charge;
  const toE = V.toward(s, e);
  const away = { x: -toE.x, z: -toE.z };
  const eh = V.fromHeading(e.heading);

  const cast = e.casting;
  const dashing = !!(cast && cast.skill === 'charge' && cast.phase === 'dash');
  const chargeWind = !!(cast && cast.skill === 'charge' && cast.phase === 'windup');
  const smashTel = !!(cast && cast.skill === 'smash' && cast.telegraph);

  const rel = { x: s.x - e.x, z: s.z - e.z };
  const along = rel.x * eh.x + rel.z * eh.z;
  const cross = rel.x * eh.z - rel.z * eh.x;
  const inCorridor = along > -2 && along < 14.5 && Math.abs(cross) < 3.4;

  // aim point
  let tf = 0.77;
  if (s.casting && s.casting.skill === 'laser') tf = Math.max(0, Math.min(0.8, s.casting.remaining));
  const aimX = clampArena(e.x + e.vx * tf * leadScale, R);
  const aimZ = clampArena(e.z + e.vz * tf * leadScale, R);

  // ---- emergency: incoming charge dash ----
  if (dashing && inCorridor && !s.invulnerable) {
    const sgn = cross >= 0 ? 1 : -1;
    const perp = { x: eh.z * sgn, z: -eh.x * sgn };
    const esc = V.norm({ x: perp.x + away.x * 0.35, z: perp.z + away.z * 0.35 });
    if (api.ready('blink') && !s.busy && !s.stunned) {
      const d = blinkDir(p, api, esc);
      api.use('blink', d.x, d.z);
      api.move(esc.x, esc.z);
      api.faceAt(e.x, e.z);
      return;
    }
    api.move(esc.x, esc.z);
    api.faceAt(aimX, aimZ);
    return;
  }

  // ---- incoming smash ----
  if (smashTel && dist < 6.1 && !s.airborne && !s.stunned) {
    if (api.ready('jump') && !s.busy) {
      api.use('jump');
      api.move(away.x, away.z);
      api.faceAt(e.x, e.z);
      return;
    }
    if (api.ready('blink') && !s.busy) {
      const d = blinkDir(p, api, away);
      api.use('blink', d.x, d.z);
      api.move(away.x, away.z);
      api.faceAt(e.x, e.z);
      return;
    }
    api.move(away.x, away.z);
    api.faceAt(aimX, aimZ);
    return;
  }

  // ---- melee escape ----
  if (dist < 4.3 && !s.busy && !s.stunned && !s.airborne && api.ready('blink') && !e.stunned) {
    const d = blinkDir(p, api, away);
    api.use('blink', d.x, d.z);
    api.move(away.x, away.z);
    api.faceAt(e.x, e.z);
    return;
  }

  // ---- ranged desire ----
  let ideal = 13.5;
  if (!chargeReady) ideal = 10.0;
  else if (!api.ready('blink')) ideal = 15.5;
  if (e.stunned || (e.casting && e.casting.phase === 'recover')) ideal = Math.min(ideal, 10.5);
  if (!e.visible) ideal = Math.min(ideal, 11.0);
  const frac = s.hp / s.maxHp, efrac = e.hp / e.maxHp;
  if (p.t > 32 && frac > efrac + 0.04) ideal = Math.max(ideal, 16.5);
  if (s.hp < 50) ideal = Math.max(ideal, 15.0);

  // ---- laser ----
  if (!s.busy && !s.airborne && !s.stunned && api.ready('laser') && e.visible && dist <= 22.5) {
    const cl = ((s.x - e.x) * e.vx + (s.z - e.z) * e.vz) / (dist || 1);
    const pred = dist - Math.max(0, cl) * 0.8;
    const safe = e.stunned || e.airborne || pred > 6.2;
    if (safe && !chargeWind && !(dashing && inCorridor)) {
      api.use('laser');
    }
  }

  const dodgeLine = (chargeWind || dashing) ? eh : null;
  const mv = chooseMove(p, api, ideal, dodgeLine);
  api.move(mv.x, mv.z);
  api.faceAt(aimX, aimZ);
}
