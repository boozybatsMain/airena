const OBS = [
  { x: -7, z: -3, hx: 1.2, hz: 3.5 },
  { x: 7, z: 3, hx: 1.2, hz: 3.5 },
  { x: 0, z: -10, hx: 3.6, hz: 1.2 },
  { x: 0, z: 10, hx: 3.6, hz: 1.2 },
  { x: -12.5, z: 11, hx: 1.6, hz: 1.6 },
  { x: 12.5, z: -11, hx: 1.6, hz: 1.6 }
];

let enemyLaserStart = -99;
let laserReadyAt = 0;
let enemyBlinkAt = -99;
let orbitSign = 1;
let lastFlip = 0;
let saidAt = -99;

function hitBox(ax, az, bx, bz, o) {
  const dx = bx - ax, dz = bz - az;
  let tmin = 0, tmax = 1;
  const minx = o.x - o.hx, maxx = o.x + o.hx, minz = o.z - o.hz, maxz = o.z + o.hz;
  if (Math.abs(dx) < 1e-9) {
    if (ax < minx || ax > maxx) return false;
  } else {
    let t1 = (minx - ax) / dx, t2 = (maxx - ax) / dx;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return false;
  }
  if (Math.abs(dz) < 1e-9) {
    if (az < minz || az > maxz) return false;
  } else {
    let t1 = (minz - az) / dz, t2 = (maxz - az) / dz;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return false;
  }
  return true;
}

function segBlocked(ax, az, bx, bz, obs) {
  for (const o of obs) if (hitBox(ax, az, bx, bz, o)) return true;
  return false;
}

function nearBox(x, z, obs, m) {
  for (const o of obs) {
    if (x > o.x - o.hx - m && x < o.x + o.hx + m && z > o.z - o.hz - m && z < o.z + o.hz + m) return true;
  }
  return false;
}

function predictPos(en, t) {
  let x = en.x + en.vx * t, z = en.z + en.vz * t;
  if (x > 19.5) x = 19.5; if (x < -19.5) x = -19.5;
  if (z > 19.5) z = 19.5; if (z < -19.5) z = -19.5;
  return { x, z };
}

function chargeAimPoint(me, en, obs) {
  const d = Math.hypot(en.x - me.x, en.z - me.z);
  const tt = 0.3 + Math.max(0, d - 2.2) / 15;
  let lead = 1;
  if (en.casting && en.casting.skill === 'laser') lead = 0.7;
  let aim = predictPos({ x: en.x, z: en.z, vx: en.vx * lead, vz: en.vz * lead }, tt);
  if (segBlocked(me.x, me.z, aim.x, aim.z, obs)) aim = { x: en.x, z: en.z };
  return aim;
}

function pickStep(me, en, obs, wantCover, away, reach) {
  const base = away
    ? { x: me.x - en.x, z: me.z - en.z }
    : { x: en.x - me.x, z: en.z - me.z };
  const bl = Math.hypot(base.x, base.z) || 1;
  const b = { x: base.x / bl, z: base.z / bl };
  let best = null, bestS = -1e9;
  for (let i = -7; i <= 7; i++) {
    const a = i * 0.26;
    const d = V.rot(b, a);
    const cx = me.x + d.x * reach, cz = me.z + d.z * reach;
    if (Math.abs(cx) > 18.6 || Math.abs(cz) > 18.6) continue;
    if (nearBox(cx, cz, obs, 1.5)) continue;
    if (segBlocked(me.x, me.z, cx, cz, obs)) continue;
    const dd = Math.hypot(en.x - cx, en.z - cz);
    let s = away ? Math.min(dd, 16) : -dd;
    const covered = segBlocked(cx, cz, en.x, en.z, obs);
    if (wantCover && covered) s += away ? 9 : 6.5;
    s -= Math.abs(i) * 0.18;
    const wallPen = Math.max(0, Math.abs(cx) - 16) + Math.max(0, Math.abs(cz) - 16);
    s -= wallPen * 0.8;
    if (s > bestS) { bestS = s; best = { x: cx, z: cz }; }
  }
  return best;
}

function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me || !me.alive) return;
  const obs = (p.arena && p.arena.obstacles && p.arena.obstacles.length) ? p.arena.obstacles : OBS;
  const t = p.t;

  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      if (e.skill === 'laser') { enemyLaserStart = t; laserReadyAt = t + 2.2; }
      if (e.skill === 'blink') enemyBlinkAt = t;
    }
  }

  if (!en || !en.alive) { api.stop(); return; }

  const dx = en.x - me.x, dz = en.z - me.z;
  const dist = (typeof en.dist === 'number') ? en.dist : Math.hypot(dx, dz);
  const dl = Math.hypot(dx, dz) || 1;
  const dirE = { x: dx / dl, z: dz / dl };
  const los = en.visible;

  const c = me.casting;

  if (me.stunned) return;

  if (me.airborne || (c && (c.phase === 'dash' || c.phase === 'air'))) {
    api.faceAt(en.x, en.z);
    return;
  }

  if (c && c.phase === 'windup') {
    if (c.skill === 'charge') {
      const aim = chargeAimPoint(me, en, obs);
      api.faceAt(aim.x, aim.z);
      api.move(aim.x - me.x, aim.z - me.z);
    } else if (c.skill === 'smash') {
      const pe = predictPos(en, Math.max(0.05, c.remaining));
      api.faceAt(pe.x, pe.z);
      api.move(dirE.x, dirE.z);
    } else {
      api.faceAt(en.x, en.z);
    }
    return;
  }

  const myF = me.hp / me.maxHp, enF = en.hp / en.maxHp;
  const defensive = (t > 31 && myF > enF + 0.10) || (t > 44 && myF > enF + 0.02);

  const enAirRemain = en.airborne
    ? ((en.casting && en.casting.phase === 'air') ? en.casting.remaining : 0.5)
    : ((en.casting && en.casting.skill === 'jump' && en.casting.phase === 'windup') ? en.casting.remaining + 0.55 : 0);

  const laserThreat = t >= laserReadyAt - 0.25;
  const enemyCastingLaser = !!(en.casting && en.casting.skill === 'laser' && en.casting.telegraph);

  // ---------- skills ----------
  let usedCharge = false, usedSkill = false;

  const pe03 = predictPos(en, 0.3);
  const sdx = pe03.x - me.x, sdz = pe03.z - me.z;
  const dPred = Math.hypot(sdx, sdz);
  const angPred = Math.abs(V.angleTo(me.heading, { x: sdx / (dPred || 1), z: sdz / (dPred || 1) }));

  const smashOk = api.ready('smash') && dPred < 4.55 && angPred < 1.15 && enAirRemain < 0.26;

  const aim = chargeAimPoint(me, en, obs);
  const clear = !segBlocked(me.x, me.z, aim.x, aim.z, obs);
  const chargeOk = api.ready('charge') && !defensive && los && clear &&
    dist > 2.9 && dist < 11.5 && enAirRemain < 0.35 && !en.invulnerable;

  if (!defensive && smashOk && dist < 4.1) {
    api.use('smash');
    usedSkill = true;
  } else if (chargeOk && (dist > 4.1 || enemyCastingLaser)) {
    api.use('charge');
    api.faceAt(aim.x, aim.z);
    api.move(aim.x - me.x, aim.z - me.z);
    usedCharge = true;
    usedSkill = true;
  } else if (!defensive && smashOk) {
    api.use('smash');
    usedSkill = true;
  }

  if (usedCharge) return;

  // ---------- facing ----------
  const face = predictPos(en, 0.18);
  api.faceAt(face.x, face.z);

  // ---------- movement ----------
  if (t - lastFlip > 1.7) { lastFlip = t; if (api.rand() < 0.45) orbitSign = -orbitSign; }

  if (defensive) {
    const step = pickStep(me, en, obs, true, true, 4.2);
    if (step) api.move(step.x - me.x, step.z - me.z);
    else api.move(-dirE.x, -dirE.z);
    if (t - saidAt > 6) { saidAt = t; api.say("ahead on health. let the fire do it."); }
    return;
  }

  if (!los) {
    api.moveTo(en.x, en.z);
    return;
  }

  if (dist > 5.0) {
    const wantCover = laserThreat && dist > 6.5 && api.cooldown('charge') > 0.7;
    const step = pickStep(me, en, obs, wantCover, false, 3.6);
    if (step) api.move(step.x - me.x, step.z - me.z);
    else api.moveTo(en.x, en.z);
    return;
  }

  // close quarters: press, with a little orbit so the beam has to track
  const perp = { x: -dirE.z * orbitSign, z: dirE.x * orbitSign };
  let w = enemyCastingLaser ? 1.1 : 0.4;
  if (dist < 2.6) w += 0.3;
  let mvx = dirE.x + perp.x * w, mvz = dirE.z + perp.z * w;
  const px = me.x + mvx * 2.2, pz = me.z + mvz * 2.2;
  if (Math.abs(px) > 18.5 || Math.abs(pz) > 18.5 || nearBox(px, pz, obs, 1.35)) {
    mvx = dirE.x - perp.x * w; mvz = dirE.z - perp.z * w;
    orbitSign = -orbitSign;
  }
  api.move(mvx, mvz);

  if (!usedSkill && t - saidAt > 8) { saidAt = t; api.say("get in reach. stay in reach."); }
}
