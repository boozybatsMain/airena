const OBS_PAD = 0;
let prevMove = { x: 0, z: 1 };
let enemyLast = { charge: -99, smash: -99, jump: -99 };
let hitsTaken = 0;
let lastHitT = -99;
let saidOnce = false;

function blockedPt(x, z, obs, pad) {
  for (const o of obs) {
    if (Math.abs(x - o.x) < o.hx + pad && Math.abs(z - o.z) < o.hz + pad) return true;
  }
  return false;
}

function segBox(ax, az, bx, bz, o, pad) {
  const dx = bx - ax, dz = bz - az;
  let t0 = 0, t1 = 1;
  const minx = o.x - o.hx - pad, maxx = o.x + o.hx + pad;
  const minz = o.z - o.hz - pad, maxz = o.z + o.hz + pad;
  if (Math.abs(dx) < 1e-9) {
    if (ax < minx || ax > maxx) return false;
  } else {
    let ta = (minx - ax) / dx, tb = (maxx - ax) / dx;
    if (ta > tb) { const tt = ta; ta = tb; tb = tt; }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return false;
  }
  if (Math.abs(dz) < 1e-9) {
    if (az < minz || az > maxz) return false;
  } else {
    let ta = (minz - az) / dz, tb = (maxz - az) / dz;
    if (ta > tb) { const tt = ta; ta = tb; tb = tt; }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return false;
  }
  return true;
}

function segBlocked(ax, az, bx, bz, obs, pad) {
  for (const o of obs) if (segBox(ax, az, bx, bz, o, pad)) return true;
  return false;
}

function predict(en, tt) {
  let k = 0.85;
  if (en.stunned) k = 0;
  let px = en.vx * tt * k, pz = en.vz * tt * k;
  const m = Math.hypot(px, pz);
  if (m > 6) { px = px * 6 / m; pz = pz * 6 / m; }
  return { x: en.x + px, z: en.z + pz };
}

function pickMove(p, api, desired, wantLos, avoidDir) {
  const me = p.self, en = p.enemy, obs = p.arena.obstacles;
  let best = null, bestScore = -1e9;
  const step = 3.2;
  for (let i = 0; i < 24; i++) {
    const a = i * Math.PI * 2 / 24;
    const d = { x: Math.sin(a), z: Math.cos(a) };
    const cx = me.x + d.x * step, cz = me.z + d.z * step;
    if (Math.abs(cx) > 18.8 || Math.abs(cz) > 18.8) continue;
    if (blockedPt(cx, cz, obs, 1.35)) continue;
    if (segBlocked(me.x, me.z, cx, cz, obs, 1.05)) continue;
    const dd = Math.hypot(cx - en.x, cz - en.z);
    let s = -1.4 * Math.abs(dd - desired);
    const wall = 20 - Math.max(Math.abs(cx), Math.abs(cz));
    if (wall < 5.5) s -= (5.5 - wall) * 1.8;
    const los = !segBlocked(cx, cz, en.x, en.z, obs, OBS_PAD);
    if (wantLos) { if (los) s += 3.5; } else { if (!los) s += 3.0; }
    s += 1.8 * (d.x * prevMove.x + d.z * prevMove.z);
    if (avoidDir) {
      const al = d.x * avoidDir.x + d.z * avoidDir.z;
      if (al > 0) s -= 3.0 * al;
    }
    if (s > bestScore) { bestScore = s; best = d; }
  }
  if (!best) {
    best = V.norm({ x: -me.x, z: -me.z });
    if (best.x === 0 && best.z === 0) best = { x: 1, z: 0 };
  }
  return best;
}

function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me || !me.alive || !en) return;
  const obs = p.arena.obstacles;
  const t = p.t;

  for (const e of p.events) {
    if (e.type === 'enemyStarted') { if (enemyLast[e.skill] !== undefined) enemyLast[e.skill] = t; }
    else if (e.type === 'damaged') {
      hitsTaken++; lastHitT = t;
      if (e.skill && enemyLast[e.skill] !== undefined) enemyLast[e.skill] = t - 0.3;
    }
  }

  const ec = en.casting;
  const enSkill = ec ? ec.skill : null;
  const enPhase = ec ? ec.phase : null;
  if (enSkill && enemyLast[enSkill] !== undefined && t - enemyLast[enSkill] > 0.5) enemyLast[enSkill] = t - (ec.elapsed || 0);

  const dist = en.dist;
  const chargeReadyIn = Math.max(0, 4.033 - (t - enemyLast.charge));
  const smashReadyIn = Math.max(0, 1.3 - (t - enemyLast.smash));

  let moveDir = null, moveToPt = null, faceDir = null, skillCall = null;

  const away = V.away(me, en);
  const toEn = V.toward(me, en);

  // ---------- threat: charge dash in flight ----------
  let dodging = false;
  if (enSkill === 'charge' && (enPhase === 'dash' || enPhase === 'windup')) {
    let dir;
    if (enPhase === 'dash' && en.speed > 3) dir = V.norm({ x: en.vx, z: en.vz });
    else dir = V.fromHeading(en.heading);
    const rel = { x: me.x - en.x, z: me.z - en.z };
    const along = rel.x * dir.x + rel.z * dir.z;
    const lat = rel.x * dir.z - rel.z * dir.x;
    let u = { x: dir.z, z: -dir.x };
    if (lat < 0) u = { x: -u.x, z: -u.z };
    const lx = me.x + u.x * 7.4, lz = me.z + u.z * 7.4;
    if (Math.abs(lx) > 19 || Math.abs(lz) > 19) {
      const ax2 = me.x - u.x * 7.4, az2 = me.z - u.z * 7.4;
      if (Math.abs(ax2) < 19 && Math.abs(az2) < 19) u = { x: -u.x, z: -u.z };
    }
    const inLine = along > -1.5 && along < 15 && Math.abs(lat) < 3.4;
    if (enPhase === 'dash' && inLine) {
      dodging = true;
      if (!me.busy && !me.stunned && !me.airborne && api.ready('blink')) {
        skillCall = ['blink', u.x, u.z];
      }
      moveDir = { x: u.x * 0.8 + away.x * 0.4, z: u.z * 0.8 + away.z * 0.4 };
    } else if (enPhase === 'windup') {
      dodging = true;
      moveDir = { x: u.x * 0.75 + away.x * 0.65, z: u.z * 0.75 + away.z * 0.65 };
      const cx = me.x + moveDir.x * 3, cz = me.z + moveDir.z * 3;
      if (Math.abs(cx) > 18.5 || Math.abs(cz) > 18.5 || blockedPt(cx, cz, obs, 1.3)) {
        moveDir = pickMove(p, api, 15, false, toEn);
      }
    }
  }

  // ---------- threat: smash landing on us ----------
  if (!dodging && enSkill === 'smash' && ec && ec.telegraph && dist < 6.6) {
    dodging = true;
    moveDir = { x: away.x, z: away.z };
    const cx = me.x + away.x * 3, cz = me.z + away.z * 3;
    if (Math.abs(cx) > 18.5 || Math.abs(cz) > 18.5 || blockedPt(cx, cz, obs, 1.2)) {
      moveDir = pickMove(p, api, 14, false, toEn);
    }
    if (!me.busy && !me.stunned && !me.airborne) {
      if (api.ready('jump') && ec.remaining > 0.11) skillCall = ['jump'];
      else if (api.ready('blink') && chargeReadyIn > 0.6) skillCall = ['blink', away.x, away.z];
      else if (api.ready('blink') && dist < 3.4) skillCall = ['blink', away.x, away.z];
    }
  }

  // ---------- panic distance ----------
  if (!dodging && dist < 3.2 && !me.busy && !me.stunned && !me.airborne && api.ready('blink') && chargeReadyIn > 0.8) {
    skillCall = ['blink', away.x, away.z];
  }

  // ---------- desired spacing ----------
  let desired;
  if (chargeReadyIn > 1.3) desired = 8.5;
  else desired = 13.6;
  if (hitsTaken >= 2 && chargeReadyIn < 1.3) desired = 15.0;
  if (dist < 6.0 && smashReadyIn < 0.5) desired = Math.max(desired, 9.5);

  // ---------- laser ----------
  const laserSafe = dist > 12.8 || chargeReadyIn > 0.95;
  const enemyThreatNow = (enSkill === 'charge') || (enSkill === 'smash' && ec && ec.telegraph && dist < 7);
  const castTime = 0.667;
  const aimT = me.casting && me.casting.skill === 'laser' && me.casting.telegraph
    ? Math.max(0, me.casting.remaining)
    : castTime + 0.07;
  const aim = predict(en, aimT);

  if (!skillCall && !me.busy && !me.stunned && !me.airborne && api.ready('laser')) {
    if (en.visible && dist > 2.5 && dist < 21.5 && laserSafe && !enemyThreatNow) {
      if (!segBlocked(me.x, me.z, aim.x, aim.z, obs, OBS_PAD)) {
        skillCall = ['laser'];
      }
    }
  }

  // ---------- facing ----------
  faceDir = { x: aim.x - me.x, z: aim.z - me.z };

  // ---------- default movement ----------
  if (!moveDir && !moveToPt) {
    const casting = me.casting && me.casting.skill === 'laser' && me.casting.telegraph;
    if (!en.visible && dist > 10) {
      const pt = api.pathTo(en.x, en.z);
      if (pt && pt.points && pt.points.length) {
        const wp = pt.points[0];
        moveDir = V.toward(me, { x: wp.x, z: wp.z });
      } else {
        moveDir = pickMove(p, api, Math.min(desired, dist - 1.5), true, null);
      }
    } else if (casting) {
      // keep spacing while beam charges, prefer backing off if close
      const d2 = Math.max(desired, dist + 0.5);
      moveDir = pickMove(p, api, d2, true, null);
    } else {
      moveDir = pickMove(p, api, desired, true, null);
    }
  }

  if (moveDir) {
    const L = Math.hypot(moveDir.x, moveDir.z);
    if (L > 1e-6) {
      moveDir = { x: moveDir.x / L, z: moveDir.z / L };
      prevMove = moveDir;
      api.move(moveDir.x, moveDir.z);
    }
  } else if (moveToPt) {
    api.moveTo(moveToPt.x, moveToPt.z);
  }

  if (faceDir && (faceDir.x !== 0 || faceDir.z !== 0)) api.face(faceDir.x, faceDir.z);

  if (skillCall) {
    if (skillCall.length === 3) api.use(skillCall[0], skillCall[1], skillCall[2]);
    else api.use(skillCall[0]);
  }

  if (!saidOnce && t > 1) { saidOnce = true; api.say("eight arms, one beam"); }
}
