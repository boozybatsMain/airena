function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me || !en || !me.alive) return;

  // ---- event bookkeeping ----
  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      if (e.skill === 'laser') lastLaserT = p.t;
      if (e.skill === 'blink') lastBlinkT = p.t;
    }
    if (e.type === 'blocked') lastBlockT = p.t;
  }
  const enCast = en.casting;
  const enLasering = !!(enCast && enCast.skill === 'laser' && enCast.telegraph);
  if (enLasering) lastLaserT = p.t - (enCast.elapsed || 0);
  const laserReady = (p.t - lastLaserT) >= 2.05;

  const obs = p.arena.obstacles || [];
  const d = en.dist;
  const burning = p.burn > 0 || p.burnStartsIn < 2.5;

  // ---- targets we will issue at the end ----
  let faceT = null;      // {x,z} point
  let moveDir = null;    // {x,z} direction
  let movePt = null;     // {x,z} routed point
  let skill = null, sa = 0, sb = 0;

  const strikeAim = predictPos(en, 0.3);
  faceT = strikeAim;

  // ---- if already committed to something, just steer ----
  if (me.stunned) { issue(api, faceT, null, null, null); return; }
  if (me.busy) {
    const c = me.casting;
    if (c && c.skill === 'charge' && c.phase === 'windup') {
      const tt = 0.3 + Math.max(0, (d - me.radius - en.radius) / 15);
      faceT = predictPos(en, tt);
      moveDir = unit(en.x - me.x, en.z - me.z);
    } else if (c && c.skill === 'smash') {
      faceT = strikeAim;
      if (d > 2.4) moveDir = unit(en.x - me.x, en.z - me.z);
      else moveDir = { x: 0, z: 0 };
    } else if (me.airborne) {
      faceT = strikeAim;
    } else {
      moveDir = unit(en.x - me.x, en.z - me.z);
    }
    issue(api, faceT, moveDir, null, null);
    return;
  }

  const enemyUnhittable = en.invulnerable || en.airborne ||
    (en.casting && en.casting.skill === 'jump' && en.casting.phase === 'windup');

  const clearLOS = en.visible;
  const reach = 2.9 + me.radius + en.radius; // 5.15

  // ---------- SMASH ----------
  const dPred = dist(me, strikeAim);
  const angToPred = Math.abs(V.angleTo(me.heading, { x: strikeAim.x - me.x, z: strikeAim.z - me.z }));
  const enSlow = en.stunned || (en.casting && en.casting.skill === 'laser');
  const smashRange = enSlow ? reach - 0.25 : reach - 0.75;
  if (api.ready('smash') && !enemyUnhittable && clearLOS &&
      Math.min(dPred, d) <= smashRange && angToPred < 1.05) {
    skill = 'smash';
  }

  // ---------- CHARGE ----------
  if (!skill && api.ready('charge') && !en.invulnerable && clearLOS) {
    const gap = d - me.radius - en.radius;
    if (gap > 1.6 && d < 12.5) {
      const tt = 0.3 + Math.max(0, gap / 15);
      const ip = predictPos(en, tt);
      const dir = unit(ip.x - me.x, ip.z - me.z);
      const ray = api.ray(dir.x, dir.z, Math.min(14, d + 1.5));
      const wallOk = !ray.hit || ray.dist > d - 1.2;
      const aimed = Math.abs(V.angleTo(me.heading, dir)) < 0.55;
      if (wallOk && (aimed || d > 6)) {
        skill = 'charge';
        faceT = ip;
      }
    }
  }

  // ---------- movement ----------
  let wantCover = false;
  if (!burning && d > 6.5 && (enLasering || laserReady) && p.t > 0.4) wantCover = true;
  if (p.t < rushUntil) wantCover = false;
  if (wantCover) {
    if (coverStart < 0) coverStart = p.t;
    if (p.t - coverStart > 1.9) { coverStart = -1; rushUntil = p.t + 2.4; wantCover = false; }
  } else if (p.t >= rushUntil) coverStart = -1;

  if (skill === 'charge') {
    moveDir = unit(en.x - me.x, en.z - me.z);
  } else if (enLasering && d < 5.2 && !skill) {
    // out-turn the beam at close quarters, stay in melee
    const toMe = unit(me.x - en.x, me.z - en.z);
    const pA = { x: toMe.z, z: -toMe.x };
    const cand = [pA, { x: -pA.x, z: -pA.z }];
    let best = cand[0], bestS = -1;
    for (const c of cand) {
      const nx = me.x + c.x * 2.0, nz = me.z + c.z * 2.0;
      if (Math.abs(nx) > 19 || Math.abs(nz) > 19) continue;
      if (insideObs(nx, nz, obs, 1.5)) continue;
      const s = Math.abs(V.angleTo(en.heading, { x: nx - en.x, z: nz - en.z }));
      if (s > bestS) { bestS = s; best = c; }
    }
    const inward = unit(en.x - me.x, en.z - me.z);
    moveDir = unit(best.x * 1.0 + inward.x * (d > 3.4 ? 0.9 : 0.15),
                   best.z * 1.0 + inward.z * (d > 3.4 ? 0.9 : 0.15));
  } else if (wantCover) {
    const pt = pickCover(p, api, obs);
    if (pt) {
      if (api.los(pt.x, pt.z)) moveDir = unit(pt.x - me.x, pt.z - me.z);
      else movePt = pt;
    } else {
      movePt = { x: en.x, z: en.z };
    }
  } else {
    // straight pressure
    if (clearLOS) {
      const lead = predictPos(en, Math.min(0.5, d / 8));
      if (d > 2.3) moveDir = unit(lead.x - me.x, lead.z - me.z);
      else moveDir = unit(en.x - me.x, en.z - me.z);
    } else {
      movePt = { x: en.x, z: en.z };
    }
  }

  // keep away from arena edges when idling into them
  if (moveDir) {
    const nx = me.x + moveDir.x * 2.5, nz = me.z + moveDir.z * 2.5;
    if (Math.abs(nx) > 19.2 || Math.abs(nz) > 19.2) {
      const inward = unit(-me.x, -me.z);
      moveDir = unit(moveDir.x + inward.x * 0.8, moveDir.z + inward.z * 0.8);
    }
  }

  if (p.t - saidT > 6) { saidT = p.t; api.say(d > 8 ? "closing" : "smash time"); }

  issue(api, faceT, moveDir, movePt, skill);
}

// ================= helpers =================
let lastLaserT = -99, lastBlinkT = -99, lastBlockT = -99;
let coverStart = -1, rushUntil = -99, saidT = -99;

function issue(api, faceT, moveDir, movePt, skill) {
  if (faceT) api.faceAt(faceT.x, faceT.z);
  if (movePt) api.moveTo(movePt.x, movePt.z);
  else if (moveDir) api.move(moveDir.x, moveDir.z);
  if (skill) api.use(skill);
}

function unit(x, z) {
  const l = Math.hypot(x, z);
  if (l < 1e-6) return { x: 0, z: 0 };
  return { x: x / l, z: z / l };
}

function dist(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }

function predictPos(e, t) {
  return { x: e.x + (e.vx || 0) * t, z: e.z + (e.vz || 0) * t };
}

function insideObs(x, z, obs, pad) {
  for (const o of obs) {
    if (Math.abs(x - o.x) < o.hx + pad && Math.abs(z - o.z) < o.hz + pad) return true;
  }
  return false;
}

function segHitsRect(ax, az, bx, bz, o, pad) {
  const minx = o.x - o.hx - pad, maxx = o.x + o.hx + pad;
  const minz = o.z - o.hz - pad, maxz = o.z + o.hz + pad;
  const dx = bx - ax, dz = bz - az;
  let t0 = 0, t1 = 1;
  const ps = [-dx, dx, -dz, dz];
  const qs = [ax - minx, maxx - ax, az - minz, maxz - az];
  for (let i = 0; i < 4; i++) {
    const pp = ps[i], qq = qs[i];
    if (pp === 0) { if (qq < 0) return false; }
    else {
      const r = qq / pp;
      if (pp < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
      else { if (r < t0) return false; if (r < t1) t1 = r; }
    }
  }
  return true;
}

function lineBlocked(ax, az, bx, bz, obs) {
  for (const o of obs) if (segHitsRect(ax, az, bx, bz, o, 0)) return true;
  return false;
}

function pickCover(p, api, obs) {
  const me = p.self, en = p.enemy;
  let best = null, bestScore = -1e9;
  const radii = [3.0, 6.0];
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI * 2 / 16;
    const dx = Math.sin(a), dz = Math.cos(a);
    for (const r of radii) {
      const cx = me.x + dx * r, cz = me.z + dz * r;
      if (Math.abs(cx) > 18.5 || Math.abs(cz) > 18.5) continue;
      if (insideObs(cx, cz, obs, 1.6)) continue;
      const covered = lineBlocked(en.x, en.z, cx, cz, obs);
      const dEn = Math.hypot(cx - en.x, cz - en.z);
      let s = (covered ? 26 : 0) - dEn * 1.0;
      if (api.los(cx, cz)) s += 1.2;
      if (dEn < 4.0) s -= 6;
      if (s > bestScore) { bestScore = s; best = { x: cx, z: cz }; }
    }
  }
  return best;
}
