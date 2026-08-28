const RING_NEAR = 12.5;

function insideObs(x, z, obs, pad) {
  for (const r of obs) {
    if (Math.abs(x - r.x) < r.hx + pad && Math.abs(z - r.z) < r.hz + pad) return true;
  }
  return false;
}

function segRect(ax, az, bx, bz, r) {
  const dx = bx - ax, dz = bz - az;
  let t0 = 0, t1 = 1;
  const minx = r.x - r.hx, maxx = r.x + r.hx, minz = r.z - r.hz, maxz = r.z + r.hz;
  if (Math.abs(dx) < 1e-9) {
    if (ax < minx || ax > maxx) return false;
  } else {
    let ta = (minx - ax) / dx, tb = (maxx - ax) / dx;
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return false;
  }
  if (Math.abs(dz) < 1e-9) {
    if (az < minz || az > maxz) return false;
  } else {
    let ta = (minz - az) / dz, tb = (maxz - az) / dz;
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return false;
  }
  return true;
}

function blockedAny(ax, az, bx, bz, obs) {
  for (const r of obs) if (segRect(ax, az, bx, bz, r)) return true;
  return false;
}

function pickBlink(S, E, p, pref) {
  const half = p.arena.half, obs = p.arena.obstacles;
  let best = pref || { x: 0, z: 1 }, bs = -1e9;
  for (let i = 0; i < 20; i++) {
    const a = i / 20 * Math.PI * 2;
    const d = { x: Math.sin(a), z: Math.cos(a) };
    const L = { x: S.x + d.x * 7.3, z: S.z + d.z * 7.3 };
    let s = 0;
    const m = half - 1.8;
    if (Math.abs(L.x) > m) s -= (Math.abs(L.x) - m) * 7;
    if (Math.abs(L.z) > m) s -= (Math.abs(L.z) - m) * 7;
    if (insideObs(L.x, L.z, obs, 1.5)) s -= 30;
    s += Math.min(V.dist(L, E), 17) * 1.3;
    if (pref) s += V.dot(d, pref) * 5.5;
    if (s > bs) { bs = s; best = d; }
  }
  return best;
}

let spin = 1;
let lastMoveDir = { x: 0, z: 1 };
let lastCharge = -99;
let lastSmash = -99;
let spinFlipT = -99;
let saidT = -99;

function think(p, api) {
  const S = p.self, E = p.enemy;
  if (!S || !E || !S.alive) return;
  const t = p.t;
  const obs = p.arena.obstacles;

  for (const ev of p.events) {
    if (ev.type === 'enemyStarted') {
      if (ev.skill === 'charge') lastCharge = t;
      else if (ev.skill === 'smash') lastSmash = t;
    } else if (ev.type === 'blocked') {
      if (t - spinFlipT > 0.7) { spin = -spin; spinFlipT = t; }
    } else if (ev.type === 'damaged') {
      if (t - spinFlipT > 1.2) { spin = -spin; spinFlipT = t; }
    }
  }

  const dist = E.dist;
  const away = V.away(S, E);
  const toE = V.toward(S, E);

  // aim point (lead)
  const myCast = S.casting;
  const aimT = (myCast && myCast.skill === 'laser' && myCast.telegraph) ? myCast.remaining : 0.16;
  let aim = { x: E.x + E.vx * aimT, z: E.z + E.vz * aimT };

  if (S.stunned || S.airborne) {
    api.faceAt(aim.x, aim.z);
    return;
  }

  const ec = E.casting;
  const eCharging = !!ec && ec.skill === 'charge';
  const eDashing = eCharging && ec.phase === 'dash';
  const eSmash = !!ec && ec.skill === 'smash' && ec.phase === 'windup';
  const smashReady = (t - lastSmash) > 1.25;
  const chargeReady = (t - lastCharge) > 3.95 && !eCharging;

  let mv = null, fc = aim, ordered = false;

  // ---------- charge dodge ----------
  if (eCharging) {
    let dir;
    if (eDashing && E.speed > 2) dir = V.norm({ x: E.vx, z: E.vz });
    else dir = V.fromHeading(E.heading);
    const rel = { x: S.x - E.x, z: S.z - E.z };
    const along = V.dot(rel, dir);
    const lat = rel.x * dir.z - rel.z * dir.x;
    const sg = lat >= 0 ? 1 : -1;
    let perp = { x: dir.z * sg, z: -dir.x * sg };
    const inPath = along > -2.5 && along < 15.5 && Math.abs(lat) < 3.6;
    if (inPath) {
      const r1 = api.ray(perp.x, perp.z, 3.0);
      if (r1.dist < 2.0) {
        const alt = { x: -perp.x, z: -perp.z };
        const r2 = api.ray(alt.x, alt.z, 3.0);
        if (r2.dist > r1.dist) perp = alt;
      }
      let esc = V.norm({ x: perp.x + away.x * 0.4, z: perp.z + away.z * 0.4 });
      if (eDashing && !S.busy && api.ready('blink')) {
        const bd = pickBlink(S, E, p, perp);
        api.use('blink', bd.x, bd.z);
        ordered = true;
      }
      mv = esc;
      lastMoveDir = esc;
      api.move(mv.x, mv.z);
      api.faceAt(aim.x, aim.z);
      return;
    }
  }

  // ---------- smash dodge ----------
  if (eSmash && dist < 7.2 && !S.busy) {
    const rem = ec.remaining;
    if (api.ready('blink')) {
      const bd = pickBlink(S, E, p, away);
      api.use('blink', bd.x, bd.z);
      ordered = true;
    } else if (api.ready('jump') && rem > 0.15 && rem < 0.5) {
      api.use('jump');
      ordered = true;
    }
    let esc = V.norm({ x: away.x + toE.z * spin * 0.5, z: away.z - toE.x * spin * 0.5 });
    api.move(esc.x, esc.z);
    lastMoveDir = esc;
    api.faceAt(aim.x, aim.z);
    return;
  }

  // ---------- panic reset ----------
  if (!ordered && !S.busy && dist < 5.3 && api.ready('blink') && smashReady) {
    const bd = pickBlink(S, E, p, away);
    api.use('blink', bd.x, bd.z);
    ordered = true;
  }

  // ---------- laser ----------
  if (!ordered && !S.busy && api.ready('laser') && E.visible && dist < 21.5) {
    let safe = dist >= 9.5;
    if (E.stunned) safe = dist > 3;
    if (E.airborne && ec && ec.remaining > 0.35) safe = safe || dist > 6.5;
    if (eCharging) {
      const impact = ec.remaining + Math.max(0, dist - 2.5) / 15;
      safe = impact > 0.9;
    }
    if (dist < 3.2) safe = false;
    if (safe) {
      api.use('laser');
      ordered = true;
    }
  }

  // ---------- kiting ----------
  const casting = !!(myCast && myCast.skill === 'laser' && myCast.telegraph);
  const laserSoon = api.cooldown('laser') < 0.55 || casting;
  const wantLOS = laserSoon || api.ready('laser');
  let ring = RING_NEAR;
  if (!api.ready('laser') && !casting) ring = 14.5;
  if (chargeReady) ring = Math.max(ring, 15.0);
  if (casting) ring = Math.max(ring, 11.0);

  const half = p.arena.half;
  const efut = { x: E.x + E.vx * 0.4, z: E.z + E.vz * 0.4 };
  let bestDir = null, bestScore = -1e9;
  const tang = { x: toE.z * spin, z: -toE.x * spin };

  for (let i = 0; i < 24; i++) {
    const a = i / 24 * Math.PI * 2;
    const d = { x: Math.sin(a), z: Math.cos(a) };
    const r = api.ray(d.x, d.z, 3.2);
    const clear = r.dist;
    if (clear < 1.3) continue;
    const step = Math.min(2.2, clear - 0.7);
    const f = { x: S.x + d.x * step, z: S.z + d.z * step };
    let s = 0;
    const nd = V.dist(f, efut);
    if (nd < ring) s -= (ring - nd) * 1.7; else s -= (nd - ring) * 0.4;
    if (nd < 6.5) s -= (6.5 - nd) * 4.5;
    const wall = half - Math.max(Math.abs(f.x), Math.abs(f.z));
    if (wall < 5.5) s -= (5.5 - wall) * 2.4;
    s += Math.min(clear, 3.2) * 0.8;
    s += V.dot(d, tang) * 1.4;
    s += V.dot(d, lastMoveDir) * 0.9;
    const seen = !blockedAny(f.x, f.z, E.x, E.z, obs);
    if (wantLOS) s += seen ? 1.7 : -1.8;
    else if (dist < 14) s += seen ? -1.5 : 2.0;
    if (s > bestScore) { bestScore = s; bestDir = d; }
  }

  if (!bestDir) {
    const c = V.norm({ x: -S.x, z: -S.z });
    bestDir = (V.len(c) > 0.01) ? c : away;
  }

  mv = bestDir;
  lastMoveDir = mv;
  api.move(mv.x, mv.z);
  api.faceAt(fc.x, fc.z);

  if (t - saidT > 7.5) {
    saidT = t;
    api.say(dist < 8 ? "too close, inking out" : "eight arms, one beam");
  }
}
