const ARENA = 20;
let prevDir = { x: 0, z: 0 };
let orbit = 1;
let chargeReadyAt = 0;
let smashReadyAt = 0;
let lastLaserOrder = -99;

function insideBlock(p, x, z, pad) {
  for (const o of p.arena.obstacles) {
    if (Math.abs(x - o.x) < o.hx + pad && Math.abs(z - o.z) < o.hz + pad) return true;
  }
  return false;
}

function clampArena(v, m) {
  return Math.max(-ARENA + m, Math.min(ARENA - m, v));
}

function chooseOrbit(p, api) {
  const s = p.self, e = p.enemy;
  const toE = V.norm({ x: e.x - s.x, z: e.z - s.z });
  if (toE.x === 0 && toE.z === 0) return { x: 1, z: 0 };
  const t1 = V.perp(toE);
  let bestS = orbit, bestV = -1e9;
  for (const sg of [1, -1]) {
    const d = { x: t1.x * sg, z: t1.z * sg };
    const q = { x: s.x + d.x * 6, z: s.z + d.z * 6 };
    const r = api.ray(d.x, d.z, 6);
    let v = Math.min(r.dist, 6) + (ARENA - Math.max(Math.abs(q.x), Math.abs(q.z))) * 0.6;
    if (sg === orbit) v += 2.0;
    if (insideBlock(p, q.x, q.z, 0.8)) v -= 2.0;
    if (v > bestV) { bestV = v; bestS = sg; }
  }
  orbit = bestS;
  return { x: t1.x * bestS, z: t1.z * bestS };
}

function pickMove(p, api, targetD, tang, tangW) {
  const s = p.self, e = p.enemy;
  let best = { x: 0, z: 0 }, bs = -1e9;
  for (let k = 0; k < 24; k++) {
    const h = k * Math.PI / 12;
    const d = { x: Math.sin(h), z: Math.cos(h) };
    const q = { x: s.x + d.x * 4, z: s.z + d.z * 4 };
    let sc = 0;
    const nd = Math.hypot(q.x - e.x, q.z - e.z);
    if (nd < targetD) sc -= (targetD - nd) * 1.35;
    else sc -= (nd - targetD) * 0.40;
    const clr = ARENA - Math.max(Math.abs(q.x), Math.abs(q.z));
    if (clr < 4.5) sc -= (4.5 - clr) * 1.5;
    if (clr < 1.8) sc -= 8;
    const r = api.ray(d.x, d.z, 3.6);
    if (r.dist < 3.5) sc -= (3.5 - r.dist) * 2.0;
    sc += V.dot(d, prevDir) * 0.9;
    if (tang && tangW) sc += V.dot(d, tang) * tangW;
    if (sc > bs) { bs = sc; best = d; }
  }
  return best;
}

function safeSide(p, api, d) {
  const c = V.norm(d);
  if (c.x === 0 && c.z === 0) return { x: 0, z: 1 };
  const cand = [0, 0.45, -0.45, 0.95, -0.95, 1.6, -1.6, 2.4, -2.4, Math.PI];
  for (const a of cand) {
    const r = V.rot(c, a);
    const q = { x: p.self.x + r.x * 3.2, z: p.self.z + r.z * 3.2 };
    if (Math.max(Math.abs(q.x), Math.abs(q.z)) > ARENA - 1.3) continue;
    const ray = api.ray(r.x, r.z, 3.2);
    if (ray.dist > 3.0) return r;
  }
  return c;
}

function pickBlink(p, api, pref) {
  const s = p.self, e = p.enemy;
  const pr = V.norm(pref);
  let best = pr, bs = -1e9;
  for (let k = 0; k < 20; k++) {
    const h = k * Math.PI / 10;
    const d = { x: Math.sin(h), z: Math.cos(h) };
    const q = { x: s.x + d.x * 7.5, z: s.z + d.z * 7.5 };
    let sc = V.dot(d, pr) * 3.0;
    const over = Math.max(Math.abs(q.x), Math.abs(q.z)) - (ARENA - 1.4);
    if (over > 0) sc -= over * 1.6;
    if (insideBlock(p, q.x, q.z, 1.3)) sc -= 4.5;
    const nd = Math.hypot(q.x - e.x, q.z - e.z);
    sc += Math.min(nd, 15) * 0.3;
    if (sc > bs) { bs = sc; best = d; }
  }
  return best;
}

function think(p, api) {
  const s = p.self, e = p.enemy, t = p.t;
  if (!s.alive) return;

  for (const ev of p.events) {
    if (ev.type === 'enemyStarted') {
      if (ev.skill === 'charge') chargeReadyAt = t + 4.03;
      else if (ev.skill === 'smash') smashReadyAt = t + 1.3;
    } else if (ev.type === 'damaged' || ev.type === 'evaded') {
      if (ev.skill === 'smash') smashReadyAt = Math.max(smashReadyAt, t + 1.0);
      else if (ev.skill === 'charge') chargeReadyAt = Math.max(chargeReadyAt, t + 3.5);
    } else if (ev.type === 'blocked') {
      orbit = -orbit;
    }
  }

  const dist = e.dist;
  const eCast = e.casting;
  const eCharge = eCast && eCast.skill === 'charge';
  const eDash = eCharge && eCast.phase === 'dash';
  const eChW = eCharge && eCast.phase === 'windup';
  const eSm = eCast && eCast.skill === 'smash' && eCast.telegraph;
  const chargeReady = t >= chargeReadyAt - 0.15;
  const smashReady = t >= smashReadyAt - 0.1;
  const canAct = !s.busy && !s.stunned && !s.airborne;

  // ---- aiming prediction
  const myCast = s.casting && s.casting.skill === 'laser' && s.casting.telegraph;
  const T = myCast ? Math.max(0, Math.min(s.casting.remaining, 0.7)) : 0.28;
  const pe = { x: clampArena(e.x + e.vx * T, 0.6), z: clampArena(e.z + e.vz * T, 0.6) };

  const tang = chooseOrbit(p, api);
  let moveOut = null;
  let usedSkill = false;

  // ---- dodge an incoming dash
  if (eDash) {
    const dd = V.fromHeading(e.heading);
    const rel = { x: s.x - e.x, z: s.z - e.z };
    const along = V.dot(rel, dd);
    const lx = rel.x - dd.x * along, lz = rel.z - dd.z * along;
    const lat = Math.hypot(lx, lz);
    const perp = lat > 0.25 ? { x: lx / lat, z: lz / lat } : V.perp(dd);
    if (along > -2 && along < 15 && lat < 3.9) {
      if (canAct && !s.invulnerable && api.ready('blink')) {
        const bd = pickBlink(p, api, perp);
        api.use('blink', bd.x, bd.z);
        usedSkill = true;
      } else if (canAct && !s.invulnerable && lat < 2.6 && api.ready('jump') && dist < 6) {
        api.use('jump');
        usedSkill = true;
      }
      moveOut = safeSide(p, api, perp);
    } else {
      moveOut = pickMove(p, api, 12, tang, 1.0);
    }
  }
  // ---- charge wind-up: build lateral speed
  else if (eChW) {
    moveOut = safeSide(p, api, tang);
  }
  // ---- smash telegraph
  else if (eSm && dist < 6.4) {
    const away = V.norm({ x: s.x - e.x, z: s.z - e.z });
    const flee = V.norm({ x: away.x + tang.x * 0.7, z: away.z + tang.z * 0.7 });
    if (canAct && !s.invulnerable && api.ready('blink') && dist < 6.0) {
      const bd = pickBlink(p, api, flee);
      api.use('blink', bd.x, bd.z);
      usedSkill = true;
      moveOut = safeSide(p, api, flee);
    } else if (canAct && api.ready('jump') && eCast.phase === 'windup' && eCast.elapsed <= 0.15) {
      moveOut = safeSide(p, api, flee);
      api.use('jump');
      usedSkill = true;
    } else {
      moveOut = safeSide(p, api, flee);
    }
  }

  // ---- regain line of sight when we have a shot waiting
  if (!moveOut && !e.visible && api.ready('laser') && dist > 9) {
    const path = api.pathTo(e.x, e.z);
    if (path && path.points && path.points.length) {
      let wp = null;
      for (const q of path.points) {
        if (Math.hypot(q.x - s.x, q.z - s.z) > 1.6) { wp = q; break; }
      }
      if (wp) moveOut = V.norm({ x: wp.x - s.x, z: wp.z - s.z });
    }
  }

  // ---- default kiting
  if (!moveOut) {
    const emergency = dist < (smashReady ? 5.6 : 4.2);
    if (canAct && !usedSkill && emergency && !s.invulnerable && api.ready('blink')) {
      const away = V.norm({ x: s.x - e.x, z: s.z - e.z });
      const flee = V.norm({ x: away.x + tang.x * 0.7, z: away.z + tang.z * 0.7 });
      const bd = pickBlink(p, api, flee);
      api.use('blink', bd.x, bd.z);
      usedSkill = true;
    }
    const targetD = chargeReady ? 14.0 : 10.0;
    moveOut = pickMove(p, api, targetD, tang, dist < targetD + 3 ? 1.2 : 0.4);
  }

  // ---- laser
  if (!usedSkill && canAct && api.ready('laser')) {
    let safeD;
    if (eCharge) safeD = 999;
    else if (e.stunned) safeD = 2.6;
    else if (e.airborne) safeD = 4.0;
    else if (chargeReady) safeD = 9.5;
    else if (smashReady) safeD = 7.2;
    else safeD = 5.5;
    if (t - lastLaserOrder > 3.0 && !eCharge) safeD = Math.min(safeD, 6.5);
    if (t > 33 && !eCharge) safeD = Math.min(safeD, 7.0);
    if (e.hp <= 28 && !eCharge) safeD = Math.min(safeD, 3.5);

    const dirp = V.norm({ x: pe.x - s.x, z: pe.z - s.z });
    const ang = Math.abs(V.angleTo(s.heading, dirp));
    if (dist > safeD && dist < 25.5 && e.visible && ang < 1.1 && api.los(pe.x, pe.z)) {
      api.use('laser');
      lastLaserOrder = t;
      usedSkill = true;
    }
  }

  if (moveOut && (moveOut.x !== 0 || moveOut.z !== 0)) {
    api.move(moveOut.x, moveOut.z);
    prevDir = moveOut;
  }
  api.faceAt(pe.x, pe.z);
}