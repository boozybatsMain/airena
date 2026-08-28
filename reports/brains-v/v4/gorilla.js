// ---- Gorilla mind ----
let lastLaser = -99, lastBlink = -99, lastEJump = -99;
let saidOnce = false;
let strafeSign = 1, strafeT = 0;

function segBox(ax, az, bx, bz, o, pad) {
  const minx = o.x - o.hx - pad, maxx = o.x + o.hx + pad;
  const minz = o.z - o.hz - pad, maxz = o.z + o.hz + pad;
  const dx = bx - ax, dz = bz - az;
  let t0 = 0, t1 = 1;
  if (Math.abs(dx) < 1e-9) {
    if (ax < minx || ax > maxx) return false;
  } else {
    let ta = (minx - ax) / dx, tb = (maxx - ax) / dx;
    if (ta > tb) { const t = ta; ta = tb; tb = t; }
    if (ta > t0) t0 = ta; if (tb < t1) t1 = tb;
    if (t0 > t1) return false;
  }
  if (Math.abs(dz) < 1e-9) {
    if (az < minz || az > maxz) return false;
  } else {
    let ta = (minz - az) / dz, tb = (maxz - az) / dz;
    if (ta > tb) { const t = ta; ta = tb; tb = t; }
    if (ta > t0) t0 = ta; if (tb < t1) t1 = tb;
    if (t0 > t1) return false;
  }
  return true;
}

function losFree(obs, ax, az, bx, bz, pad) {
  for (const o of obs) if (segBox(ax, az, bx, bz, o, pad)) return false;
  return true;
}

function inBlock(obs, x, z, pad) {
  for (const o of obs) {
    if (Math.abs(x - o.x) <= o.hx + pad && Math.abs(z - o.z) <= o.hz + pad) return true;
  }
  return false;
}

function predict(e, t) {
  let x = e.x + (e.vx || 0) * t;
  let z = e.z + (e.vz || 0) * t;
  if (x > 19.2) x = 19.2; if (x < -19.2) x = -19.2;
  if (z > 19.2) z = 19.2; if (z < -19.2) z = -19.2;
  return { x, z };
}

function angDiff(heading, dx, dz) {
  const a = V.angleTo(heading, { x: dx, z: dz });
  return Math.abs(a);
}

function pickSpot(p, mode, urgentTime) {
  const s = p.self, e = p.enemy, obs = p.arena.obstacles;
  const R = [2.2, 4.0, 6.0, 8.5];
  let best = null, bestSc = -1e9;
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8;
    const ux = Math.sin(a), uz = Math.cos(a);
    for (let k = 0; k < R.length; k++) {
      const r = R[k];
      const x = s.x + ux * r, z = s.z + uz * r;
      if (Math.abs(x) > 18.5 || Math.abs(z) > 18.5) continue;
      if (inBlock(obs, x, z, s.radius + 0.2)) continue;
      const straight = losFree(obs, s.x, s.z, x, z, s.radius * 0.55);
      const de = Math.hypot(x - e.x, z - e.z);
      const hidden = !losFree(obs, x, z, e.x, e.z, 0);
      let sc = 0;
      if (hidden) {
        let b = 13;
        if (urgentTime > 0) {
          const reach = 5.35 * urgentTime + 0.6;
          if (r > reach) b = 3.5;
        }
        sc += b;
      }
      if (mode === 'hide') sc += Math.min(de, 16) * 0.55;
      else sc -= de * 0.85;
      sc -= r * 0.12;
      if (!straight) sc -= 3.0;
      const wm = 20 - Math.max(Math.abs(x), Math.abs(z));
      if (wm < 2.2) sc -= (2.2 - wm) * 1.6;
      if (sc > bestSc) { bestSc = sc; best = { x, z, hidden, straight }; }
    }
  }
  return best;
}

function goTo(api, p, x, z, straightHint) {
  const s = p.self;
  if (straightHint) api.move(x - s.x, z - s.z);
  else api.moveTo(x, z);
}

function think(p, api) {
  const s = p.self, e = p.enemy;
  if (!s || !e || !s.alive) return;

  // --- digest events ---
  for (const ev of p.events) {
    if (ev.type === 'enemyStarted') {
      if (ev.skill === 'laser') lastLaser = p.t;
      else if (ev.skill === 'blink') lastBlink = p.t;
      else if (ev.skill === 'jump') lastEJump = p.t;
    }
  }

  if (!saidOnce) {
    saidOnce = true;
    api.say("come here, little squid");
  }

  const obs = p.arena.obstacles;
  const dist = e.dist;
  const laserCd = Math.max(0, lastLaser + 2.2 - p.t);
  const eCastLaser = e.casting && e.casting.skill === 'laser' && e.casting.telegraph;
  const castRem = eCastLaser ? (e.casting.remaining || 0) : 0;
  const canAct = !s.busy && !s.stunned && !s.airborne;
  const visible = e.visible;

  const myFrac = s.hp / s.maxHp, eFrac = e.hp / e.maxHp;

  // ---------- FACING ----------
  let faceP = predict(e, 0.32);
  if (s.casting && s.casting.skill === 'charge' && s.casting.phase === 'windup') {
    const tt = (s.casting.remaining || 0.15) + Math.min(dist / 15, 0.8);
    faceP = predict(e, tt);
  } else if (s.casting && s.casting.skill === 'smash' && s.casting.phase === 'windup') {
    faceP = predict(e, s.casting.remaining || 0.15);
  }
  api.faceAt(faceP.x, faceP.z);

  // ---------- SKILLS ----------
  let usedSkill = false;
  if (canAct && e.alive) {
    const eInv = e.invulnerable;
    const eAir = e.airborne || (e.casting && e.casting.skill === 'jump');

    // ---- SMASH ----
    const sp = predict(e, 0.31);
    let mx = s.x, mz = s.z;
    if (dist > 1.6) {
      const tw = V.toward({ x: s.x, z: s.z }, { x: e.x, z: e.z });
      mx += tw.x * 0.45; mz += tw.z * 0.45;
    }
    const dPred = Math.hypot(sp.x - mx, sp.z - mz);
    const aErr = angDiff(s.heading, sp.x - s.x, sp.z - s.z);
    if (!usedSkill && api.ready('smash') && !eInv && !eAir &&
        dPred <= 4.85 && dist <= 5.6 && aErr < 1.25 &&
        losFree(obs, s.x, s.z, e.x, e.z, 0)) {
      api.use('smash');
      usedSkill = true;
    }

    // ---- CHARGE ----
    if (!usedSkill && api.ready('charge') && !eInv) {
      const tt = 0.3 + Math.min(dist / 15, 0.8);
      const cp = predict(e, tt * 0.85);
      const cErr = angDiff(s.heading, cp.x - s.x, cp.z - s.z);
      const clear = losFree(obs, s.x, s.z, cp.x, cp.z, 0);
      const smashCd = api.cooldown('smash');
      const rangeOk = dist <= 11.5 && (dist >= 2.6 || smashCd > 0.9);
      if (rangeOk && clear && cErr < 0.55) {
        api.use('charge');
        usedSkill = true;
      }
    }
  }

  // ---------- MOVEMENT ----------
  const endgame = p.t > 36.5 && myFrac > eFrac + 0.04;
  let mode;
  if (endgame) mode = 'hide';
  else if (dist < 7.0) mode = 'chase';
  else if (eCastLaser && visible) mode = 'cover';
  else if (laserCd < 0.55 && visible && dist > 8.0) mode = 'cover';
  else mode = 'chase';

  if (s.casting && (s.casting.phase === 'dash' || s.casting.phase === 'air')) {
    // nothing useful to steer
  } else if (mode === 'chase') {
    const tgt = predict(e, Math.min(0.35, dist / 12));
    const direct = losFree(obs, s.x, s.z, tgt.x, tgt.z, s.radius * 0.5);
    if (direct) {
      let dx = tgt.x - s.x, dz = tgt.z - s.z;
      const L = Math.hypot(dx, dz) || 1;
      dx /= L; dz /= L;
      if (dist > 3.5 && dist < 12 && (eCastLaser || laserCd < 0.6)) {
        if (p.t - strafeT > 1.4) { strafeT = p.t; strafeSign = api.rand() < 0.5 ? -1 : 1; }
        const px = dz * strafeSign, pz = -dx * strafeSign;
        dx += px * 0.42; dz += pz * 0.42;
      }
      api.move(dx, dz);
    } else {
      api.moveTo(e.x, e.z);
    }
  } else {
    const spot = pickSpot(p, mode, eCastLaser ? castRem : 0);
    if (spot) {
      goTo(api, p, spot.x, spot.z, spot.straight);
    } else {
      api.moveTo(e.x, e.z);
    }
  }
}
