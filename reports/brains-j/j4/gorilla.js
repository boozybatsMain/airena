const OBS_PAD_BODY = 1.45;
let strafeSign = 1;
let lastLaserStart = -99;
let lastBlinkT = -99;
let lastSmashT = -99;
let lastChargeT = -99;
let sayT = -99;

function segHitsBox(ax, az, bx, bz, o, pad) {
  const minx = o.x - o.hx - pad, maxx = o.x + o.hx + pad;
  const minz = o.z - o.hz - pad, maxz = o.z + o.hz + pad;
  if (maxx <= minx || maxz <= minz) return false;
  const dx = bx - ax, dz = bz - az;
  let t0 = 0, t1 = 1;
  if (Math.abs(dx) < 1e-9) {
    if (ax < minx || ax > maxx) return false;
  } else {
    let ta = (minx - ax) / dx, tb = (maxx - ax) / dx;
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  if (Math.abs(dz) < 1e-9) {
    if (az < minz || az > maxz) return false;
  } else {
    let ta = (minz - az) / dz, tb = (maxz - az) / dz;
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  return true;
}

function segBlocked(ax, az, bx, bz, obs, pad) {
  for (const o of obs) if (segHitsBox(ax, az, bx, bz, o, pad)) return true;
  return false;
}

function insideBox(x, z, o, pad) {
  return Math.abs(x - o.x) <= o.hx + pad && Math.abs(z - o.z) <= o.hz + pad;
}

function pointBlocked(x, z, obs, pad) {
  for (const o of obs) if (insideBox(x, z, o, pad)) return true;
  return false;
}

function findCover(s, e, obs, reach, half) {
  let best = null, bs = 1e9;
  const N = 20;
  for (let i = 0; i < N; i++) {
    const a = i * Math.PI * 2 / N;
    const dx = Math.sin(a), dz = Math.cos(a);
    for (let d = 1.6; d <= reach; d += 0.9) {
      const x = s.x + dx * d, z = s.z + dz * d;
      if (Math.abs(x) > half - 1.7 || Math.abs(z) > half - 1.7) break;
      if (segBlocked(s.x, s.z, x, z, obs, 0.35)) break;
      if (pointBlocked(x, z, obs, OBS_PAD_BODY)) continue;
      if (!segBlocked(x, z, e.x, e.z, obs, -0.12)) continue;
      const score = d + 0.3 * Math.hypot(x - e.x, z - e.z);
      if (score < bs) { bs = score; best = { x, z }; }
    }
  }
  return best;
}

function pickPerp(s, e, obs, half) {
  const t = V.toward(s, e);
  const pr = V.perp(t);
  for (const sg of [strafeSign, -strafeSign]) {
    const x = s.x + pr.x * sg * 3.2, z = s.z + pr.z * sg * 3.2;
    if (Math.abs(x) > half - 1.8 || Math.abs(z) > half - 1.8) continue;
    if (pointBlocked(x, z, obs, OBS_PAD_BODY)) continue;
    strafeSign = sg;
    return { x: pr.x * sg, z: pr.z * sg };
  }
  return { x: pr.x * strafeSign, z: pr.z * strafeSign };
}

function think(p, api) {
  const s = p.self, e = p.enemy;
  if (!s || !s.alive) return;
  const obs = p.arena.obstacles;
  const half = p.arena.half;

  for (const ev of p.events) {
    if (ev.type === 'enemyStarted') {
      if (ev.skill === 'laser') lastLaserStart = p.t;
      if (ev.skill === 'blink') lastBlinkT = p.t;
    } else if (ev.type === 'blocked') {
      strafeSign = -strafeSign;
    }
  }

  if (!e || !e.alive) { api.stop(); return; }

  const D = e.dist;
  const vis = e.visible;
  const toE = V.toward(s, e);
  const evx = e.vx || 0, evz = e.vz || 0;

  // default: face where they will be
  const faceX = e.x + evx * 0.22, faceZ = e.z + evz * 0.22;
  api.faceAt(faceX, faceZ);

  const cast = s.casting;
  if (s.stunned) return;
  if (s.airborne) return;

  if (cast) {
    if (cast.skill === 'charge') {
      if (cast.phase === 'windup') {
        const tt = Math.max(0.02, cast.remaining) + Math.max(0, D - 2.1) / 15;
        api.faceAt(e.x + evx * tt, e.z + evz * tt);
        api.move(toE.x, toE.z);
      }
      return;
    }
    if (cast.skill === 'smash') {
      if (cast.phase === 'windup') {
        const r = Math.max(0.02, cast.remaining);
        api.faceAt(e.x + evx * r, e.z + evz * r);
        api.move(toE.x, toE.z);
        return;
      }
      // recover: keep pressing
    }
    if (cast.skill === 'jump') return;
  }

  const enemyCastingLaser = !!(e.casting && e.casting.skill === 'laser' && e.casting.telegraph);
  const laserRemaining = enemyCastingLaser ? Math.max(0.03, e.casting.remaining) : 0;

  // ---------- SMASH ----------
  const busy = s.busy && !(cast && cast.phase === 'recover');
  const enemyAirLong = e.airborne && !(e.casting && e.casting.phase === 'air' && e.casting.remaining < 0.22);
  if (!busy && api.ready('smash') && !e.invulnerable && !enemyAirLong) {
    const willJump = e.casting && e.casting.skill === 'jump' && e.casting.phase === 'windup';
    const pe = e.stunned ? { x: e.x, z: e.z } : { x: e.x + evx * 0.28, z: e.z + evz * 0.28 };
    const ps = { x: s.x + s.vx * 0.12, z: s.z + s.vz * 0.12 };
    const pd = Math.hypot(pe.x - ps.x, pe.z - ps.z);
    const dir = { x: pe.x - ps.x, z: pe.z - ps.z };
    const ang = Math.abs(V.angleTo(s.heading, V.norm(dir)));
    if (!willJump && pd < 4.05 && D < 4.7 && ang < 1.25) {
      api.faceAt(pe.x, pe.z);
      api.move(toE.x, toE.z);
      api.use('smash');
      lastSmashT = p.t;
      return;
    }
  }

  // ---------- CHARGE ----------
  if (!busy && api.ready('charge') && vis) {
    const interrupt = enemyCastingLaser && D < 13.5 && D > 2.2;
    const closer = D > 4.2 && D < 11.5;
    if (interrupt || closer) {
      const travel = Math.max(0, D - 2.2) / 15;
      const tt = 0.28 + travel;
      let px = e.x + evx * tt, pz = e.z + evz * tt;
      px = Math.max(-half + 0.5, Math.min(half - 0.5, px));
      pz = Math.max(-half + 0.5, Math.min(half - 0.5, pz));
      const dir = V.norm({ x: px - s.x, z: pz - s.z });
      const ang = Math.abs(V.angleTo(s.heading, dir));
      if (ang < 0.95) {
        const r = api.ray(dir.x, dir.z, Math.min(13, D + 1));
        if (!r.hit || r.dist > D - 1.2) {
          api.face(dir.x, dir.z);
          api.use('charge');
          lastChargeT = p.t;
          if (p.t - sayT > 3) { sayT = p.t; api.say(interrupt ? "shut it" : "here i come"); }
          return;
        }
      } else {
        api.face(dir.x, dir.z);
      }
    }
  }

  // ---------- LASER RESPONSE ----------
  if (enemyCastingLaser && vis && D > 4.0) {
    const reach = 5.35 * laserRemaining + 0.8;
    const cov = reach > 2.0 ? findCover(s, e, obs, reach, half) : null;
    if (cov) {
      api.move(cov.x - s.x, cov.z - s.z);
      return;
    }
    const pr = pickPerp(s, e, obs, half);
    const mix = V.norm({ x: toE.x * 0.75 + pr.x * 1.1, z: toE.z * 0.75 + pr.z * 1.1 });
    api.move(mix.x, mix.z);
    return;
  }

  // ---------- CHASE ----------
  if (vis && D < 9.5) {
    let lead = { x: e.x + evx * 0.28, z: e.z + evz * 0.28 };
    let dir = V.norm({ x: lead.x - s.x, z: lead.z - s.z });
    if (D < 3.2 && api.cooldown('smash') > 0.35) {
      const pr = pickPerp(s, e, obs, half);
      dir = V.norm({ x: dir.x * 0.85 + pr.x * 0.7, z: dir.z * 0.85 + pr.z * 0.7 });
    }
    api.move(dir.x, dir.z);
  } else {
    const path = api.pathTo(e.x, e.z);
    if (path && path.points && path.points.length && !path.direct) {
      const w = path.points[0];
      api.move(w.x - s.x, w.z - s.z);
    } else {
      api.moveTo(e.x, e.z);
    }
  }
}
