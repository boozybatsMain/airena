function segBlocked(ax, az, bx, bz, obs) {
  const dx = bx - ax, dz = bz - az;
  for (const o of obs) {
    const minx = o.x - o.hx, maxx = o.x + o.hx, minz = o.z - o.hz, maxz = o.z + o.hz;
    let t0 = 0, t1 = 1, ok = true;
    if (Math.abs(dx) < 1e-9) {
      if (ax < minx || ax > maxx) ok = false;
    } else {
      let ta = (minx - ax) / dx, tb = (maxx - ax) / dx;
      if (ta > tb) { const tmp = ta; ta = tb; tb = tmp; }
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
      if (t0 > t1) ok = false;
    }
    if (ok) {
      if (Math.abs(dz) < 1e-9) {
        if (az < minz || az > maxz) ok = false;
      } else {
        let ta = (minz - az) / dz, tb = (maxz - az) / dz;
        if (ta > tb) { const tmp = ta; ta = tb; tb = tmp; }
        t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
        if (t0 > t1) ok = false;
      }
    }
    if (ok && t0 <= t1) return true;
  }
  return false;
}

let prevDir = { x: 0, z: 1 };
let orbit = 1;
let enemyLast = { charge: -99, smash: -99, jump: -99 };
let chargeInfo = null;
let lastFlip = -99;
let lastSay = -99;

function enemyCd(name, t) {
  const cds = { charge: 4.0, smash: 1.3, jump: 2.8 };
  return Math.max(0, enemyLast[name] + cds[name] - t);
}

function pickMove(p, api, desired, wantLOS, avoidDir) {
  const S = p.self, E = p.enemy, obs = p.arena.obstacles;
  const twd = V.toward(S, E);
  const tang = { x: -twd.z * orbit, z: twd.x * orbit };
  let best = null, bestS = -1e9;
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    const d = { x: Math.sin(a), z: Math.cos(a) };
    let free = 7;
    try { free = api.ray(d.x, d.z, 7).dist; } catch (e) { free = 7; }
    if (free < 1.1) continue;
    const step = Math.min(3, Math.max(0.6, free - 0.5));
    const cx = S.x + d.x * step, cz = S.z + d.z * step;
    const de = Math.hypot(cx - E.x, cz - E.z);
    let s = -1.5 * Math.abs(de - desired);
    s += 0.45 * Math.min(free, 6);
    if (de < 3.4) s -= 9;
    const marg = 20 - Math.max(Math.abs(cx), Math.abs(cz));
    if (marg < 5.5) s -= (5.5 - marg) * 1.9;
    const vis = !segBlocked(cx, cz, E.x, E.z, obs);
    s += wantLOS ? (vis ? 1.7 : -3.2) : (vis ? -1.1 : 2.2);
    s += 1.3 * (d.x * prevDir.x + d.z * prevDir.z);
    s += 0.9 * (d.x * tang.x + d.z * tang.z);
    if (avoidDir) s -= 3.0 * Math.max(0, d.x * avoidDir.x + d.z * avoidDir.z);
    if (s > bestS) { bestS = s; best = d; }
  }
  return best || prevDir;
}

function think(p, api) {
  const S = p.self, E = p.enemy, t = p.t, obs = p.arena.obstacles;
  if (!S.alive) return;

  for (const ev of p.events) {
    if (ev.type === 'enemyStarted') {
      if (enemyLast[ev.skill] !== undefined) enemyLast[ev.skill] = t;
      if (ev.skill === 'charge') chargeInfo = { t: t, dir: null };
    } else if (ev.type === 'enemyCommitted') {
      if (ev.skill === 'charge') chargeInfo = { t: t, dir: V.fromHeading(E.heading) };
    } else if (ev.type === 'blocked') {
      if (t - lastFlip > 0.7) { orbit = -orbit; lastFlip = t; }
    } else if (ev.type === 'damaged') {
      if (t - lastFlip > 1.2) { orbit = -orbit; lastFlip = t; }
    }
  }

  if (chargeInfo && t - chargeInfo.t > 1.4) chargeInfo = null;
  const eCast = E.casting;
  if (eCast && eCast.skill === 'charge' && eCast.phase === 'dash' && E.speed > 8) {
    chargeInfo = { t: t, dir: V.norm({ x: E.vx, z: E.vz }) };
  }

  const dist = E.dist;
  const canAct = !S.stunned && !S.airborne && !S.busy;

  // ---------- aim point ----------
  let castRemain = 0;
  if (S.casting && S.casting.skill === 'laser' && S.casting.telegraph) castRemain = S.casting.remaining || 0;
  const leadT = S.casting ? Math.min(0.7, castRemain) : 0.62;
  let evx = E.vx, evz = E.vz;
  const espd = Math.hypot(evx, evz);
  if (espd > 5.8) { evx = evx / espd * 5.8; evz = evz / espd * 5.8; }
  let aimX = E.x + evx * leadT * 0.85;
  let aimZ = E.z + evz * leadT * 0.85;
  if (segBlocked(S.x, S.z, aimX, aimZ, obs)) { aimX = E.x; aimZ = E.z; }
  api.faceAt(aimX, aimZ);

  if (S.stunned || S.airborne) return;

  // ---------- charge dodge ----------
  let dangerDir = null;
  if (chargeInfo) {
    const cd = chargeInfo.dir || V.fromHeading(E.heading);
    const rel = { x: S.x - E.x, z: S.z - E.z };
    const along = rel.x * cd.x + rel.z * cd.z;
    const px = -cd.z, pz = cd.x;
    const lat = rel.x * px + rel.z * pz;
    if (along > -1.5 && along < 14.5 && Math.abs(lat) < 3.6) {
      let sgn = lat >= 0 ? 1 : -1;
      let e1 = { x: px * sgn, z: pz * sgn };
      let e2 = { x: -e1.x, z: -e1.z };
      let f1 = 8, f2 = 8;
      try { f1 = api.ray(e1.x, e1.z, 8).dist; f2 = api.ray(e2.x, e2.z, 8).dist; } catch (e) {}
      if (f1 < 3 && f2 > f1 + 1.5) { const tm = e1; e1 = e2; }
      const tti = Math.max(0, along - 2.4) / 15;
      dangerDir = e1;
      if (canAct && api.ready('blink') && (tti < 0.5 || Math.abs(lat) < 2.0)) {
        api.use('blink', e1.x * 0.85 + cd.x * -0.3, e1.z * 0.85 + cd.z * -0.3);
        api.move(e1.x, e1.z);
        prevDir = e1;
        return;
      }
      api.move(e1.x, e1.z);
      prevDir = e1;
      return;
    }
  }

  // ---------- smash dodge ----------
  const smashTele = eCast && eCast.skill === 'smash' && eCast.telegraph;
  const away = V.away(S, E);
  if (smashTele && dist < 6.4) {
    if (canAct && api.ready('jump')) {
      api.move(away.x, away.z);
      prevDir = away;
      api.use('jump');
      return;
    }
    if (canAct && api.ready('blink') && dist < 5.0) {
      api.use('blink', away.x, away.z);
      api.move(away.x, away.z);
      prevDir = away;
      return;
    }
  }

  // ---------- emergency spacing ----------
  if (canAct && dist < 3.4 && api.ready('blink') && !S.invulnerable) {
    let bx = away.x, bz = away.z;
    api.use('blink', bx, bz);
    api.move(bx, bz);
    prevDir = away;
    return;
  }

  // ---------- laser ----------
  const chargeCd = enemyCd('charge', t);
  const enemyHelpless = E.stunned || (eCast && eCast.skill === 'charge' && eCast.phase === 'recover');
  const enemyJumping = E.airborne || (eCast && eCast.skill === 'jump');
  const visAim = !segBlocked(S.x, S.z, aimX, aimZ, obs) && E.visible;
  const dirToAim = V.toward(S, { x: aimX, z: aimZ });
  const aimErr = Math.abs(V.angleTo(S.heading, dirToAim));

  let safeToCast = false;
  if (dist >= 12.0) safeToCast = true;
  else if (dist >= 6.0 && chargeCd > 0.85) safeToCast = true;
  if (enemyHelpless && dist > 4.5) safeToCast = true;
  if (dist < 5.0) safeToCast = false;
  if (smashTele && dist < 7.0) safeToCast = false;

  if (canAct && api.ready('laser') && visAim && dist < 19.5 && !enemyJumping &&
      !E.invulnerable && safeToCast && aimErr < 0.9) {
    api.use('laser');
  }

  // ---------- movement ----------
  const laserCd = api.cooldown('laser');
  const casting = !!(S.casting && S.casting.skill === 'laser');
  let desired;
  if (casting) desired = 13.0;
  else if (laserCd < 0.45) desired = 13.5;
  else desired = 15.5;
  if (chargeCd > 1.2 && !smashTele) desired = Math.max(9.5, desired - 3.5);
  if (dist > 22) desired = 15.0;

  const wantLOS = (laserCd < 0.55 || casting) && !(dist < 8 && chargeCd < 0.6);
  const mv = pickMove(p, api, desired, wantLOS, dangerDir);
  prevDir = mv;
  api.move(mv.x, mv.z);

  if (t - lastSay > 6.5) {
    lastSay = t;
    const frac = (S.hp / S.maxHp) - (E.hp / E.maxHp);
    api.say(frac >= 0 ? "eight arms, one beam" : "keep swimming");
  }
}
