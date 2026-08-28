const ARENA = 19.4;
const VF = 0.8;

let strafeSide = 1;
let lastFlip = -9;
let saidHi = false;

function pred(en, t) {
  return { x: en.x + en.vx * VF * t, z: en.z + en.vz * VF * t };
}

function chargeAim(me, en) {
  let t = 0.3;
  for (let i = 0; i < 3; i++) {
    const x = en.x + en.vx * VF * t, z = en.z + en.vz * VF * t;
    const dd = Math.max(0, Math.hypot(x - me.x, z - me.z) - 2.1);
    t = 0.3 + Math.min(0.8, dd / 15);
  }
  let x = en.x + en.vx * VF * t, z = en.z + en.vz * VF * t;
  x = Math.max(-ARENA, Math.min(ARENA, x));
  z = Math.max(-ARENA, Math.min(ARENA, z));
  return { x, z };
}

function segRectHit(ax, az, bx, bz, o, pad) {
  const minx = o.x - o.hx - pad, maxx = o.x + o.hx + pad;
  const minz = o.z - o.hz - pad, maxz = o.z + o.hz + pad;
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dz = bz - az;
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

function hiddenFrom(p, x, z, ex, ez) {
  for (const o of p.arena.obstacles) if (segRectHit(ex, ez, x, z, o, 0.3)) return true;
  return false;
}

function insideBlock(p, x, z, pad) {
  for (const o of p.arena.obstacles) {
    if (x > o.x - o.hx - pad && x < o.x + o.hx + pad && z > o.z - o.hz - pad && z < o.z + o.hz + pad) return true;
  }
  return false;
}

function coverSpot(p, api, me, en, radius) {
  let best = null, bestScore = -1e9;
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8;
    const x = me.x + Math.sin(a) * radius, z = me.z + Math.cos(a) * radius;
    if (Math.abs(x) > ARENA || Math.abs(z) > ARENA) continue;
    if (insideBlock(p, x, z, 1.45)) continue;
    if (!api.los(x, z)) continue;
    const hid = hiddenFrom(p, x, z, en.x, en.z);
    if (!hid) continue;
    const de = Math.hypot(x - en.x, z - en.z);
    const score = 100 - de;
    if (score > bestScore) { bestScore = score; best = { x, z }; }
  }
  return best;
}

function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en.alive) return;
  if (!saidHi) { saidHi = true; api.say("come here, little squid"); }

  const d = en.dist;
  const toE = V.toward(me, en);
  const myFrac = me.hp / me.maxHp, enFrac = en.hp / en.maxHp;

  for (const e of p.events) {
    if (e.type === 'blocked' && p.t - lastFlip > 0.4) { strafeSide = -strafeSide; lastFlip = p.t; }
  }

  // ---- already committed to something ----
  if (me.busy) {
    const c = me.casting;
    if (c && c.skill === 'charge' && c.phase === 'windup') {
      const aim = chargeAim(me, en);
      api.face(aim.x - me.x, aim.z - me.z);
      api.move(aim.x - me.x, aim.z - me.z);
    } else if (c && c.skill === 'smash' && c.phase === 'windup') {
      const pe = pred(en, Math.max(0.03, c.remaining || 0.12));
      api.faceAt(pe.x, pe.z);
      api.move(pe.x - me.x, pe.z - me.z);
    } else {
      api.faceAt(en.x, en.z);
      if (!me.airborne) api.move(toE.x, toE.z);
    }
    return;
  }
  if (me.stunned) { api.faceAt(en.x, en.z); return; }

  const laserCast = !!(en.casting && en.casting.skill === 'laser' && en.casting.telegraph);
  const smashReady = api.ready('smash');
  const chargeReady = api.ready('charge');
  const airRem = en.airborne ? ((en.casting && en.casting.phase === 'air') ? (en.casting.remaining || 0.25) : 0.25) : 0;

  const pe = pred(en, 0.3);
  let dPred = Math.hypot(pe.x - me.x, pe.z - me.z);
  if (me.speed > 1.2) dPred -= 0.3;

  // ---- SMASH ----
  let smashOk = smashReady && !en.invulnerable && dPred <= 4.85 && d <= 5.7;
  if (smashOk && en.airborne && airRem > 0.34) smashOk = false;
  if (smashOk && !api.los(en.x, en.z)) smashOk = false;
  if (smashOk) {
    const ang = Math.abs(V.angleTo(me.heading, V.toward(me, pe)));
    if (ang > 1.5) smashOk = false;
  }
  if (smashOk) {
    api.faceAt(pe.x, pe.z);
    api.move(toE.x, toE.z);
    api.use('smash');
    return;
  }

  // ---- CHARGE ----
  let chargeOk = chargeReady && !en.invulnerable && !en.airborne && en.visible && d >= 2.2 && d <= 12.4;
  let aim = null, cdir = null, cang = 0;
  if (chargeOk) {
    aim = chargeAim(me, en);
    cdir = V.norm({ x: aim.x - me.x, z: aim.z - me.z });
    if (cdir.x === 0 && cdir.z === 0) chargeOk = false;
    else {
      cang = Math.abs(V.angleTo(me.heading, cdir));
      const r = api.ray(cdir.x, cdir.z, Math.min(13.5, d + 2.5));
      const need = Math.max(0, d - 2.4);
      if (r && r.hit && r.dist < need) chargeOk = false;
    }
  }
  if (chargeOk) {
    if (cang > 1.1) {
      api.face(cdir.x, cdir.z);
      api.move(toE.x, toE.z);
      return;
    }
    api.face(cdir.x, cdir.z);
    api.move(cdir.x, cdir.z);
    api.use('charge');
    return;
  }

  // ---- positioning ----
  api.faceAt(pe.x, pe.z);

  // endgame stall if ahead on fraction
  if (p.timeLeft < 3.2 && myFrac > enFrac + 0.005) {
    const away = V.away(me, en);
    let fx = me.x + away.x * 5, fz = me.z + away.z * 5;
    const cov = coverSpot(p, api, me, en, 4.0);
    if (cov) { fx = cov.x; fz = cov.z; }
    fx = Math.max(-ARENA, Math.min(ARENA, fx));
    fz = Math.max(-ARENA, Math.min(ARENA, fz));
    api.moveTo(fx, fz);
    return;
  }

  // duck behind something while the beam charges
  if (laserCast && d > 5.4) {
    const cov = coverSpot(p, api, me, en, 3.6);
    if (cov) { api.move(cov.x - me.x, cov.z - me.z); return; }
  }

  if (!en.visible || d > 7.5) {
    if (en.airborne) {
      const land = { x: en.x + en.vx * airRem, z: en.z + en.vz * airRem };
      api.moveTo(Math.max(-ARENA, Math.min(ARENA, land.x)), Math.max(-ARENA, Math.min(ARENA, land.z)));
    } else {
      api.moveTo(en.x, en.z);
    }
    return;
  }

  // close quarters: press, with anti-tracking orbit
  let w = 1.0, sw = 0.35;
  if (laserCast) { w = 0.3; sw = 1.0; }
  const r0 = V.toward(en, me);
  const theta = Math.atan2(r0.x, r0.z);
  const a = V.angleTo(en.heading, r0);
  let side = (Math.abs(a) > 0.12) ? (a > 0 ? 1 : -1) : strafeSide;
  const tang = { x: Math.cos(theta), z: -Math.sin(theta) };

  let dir = { x: toE.x * w + tang.x * side * sw, z: toE.z * w + tang.z * side * sw };
  let nd = V.norm(dir);
  let px = me.x + nd.x * 2.4, pz = me.z + nd.z * 2.4;
  let bad = Math.abs(px) > ARENA || Math.abs(pz) > ARENA || insideBlock(p, px, pz, 1.4) || !api.los(px, pz);
  if (bad) {
    side = -side;
    strafeSide = side;
    dir = { x: toE.x * w + tang.x * side * sw, z: toE.z * w + tang.z * side * sw };
    nd = V.norm(dir);
    px = me.x + nd.x * 2.4; pz = me.z + nd.z * 2.4;
    bad = Math.abs(px) > ARENA || Math.abs(pz) > ARENA || insideBlock(p, px, pz, 1.4) || !api.los(px, pz);
    if (bad) { nd = toE; }
  } else {
    strafeSide = side;
  }
  api.move(nd.x, nd.z);
}