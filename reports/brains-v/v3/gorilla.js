const R_SELF = 1.25;
const R_ENEMY = 1.0;
const ARENA = 20;

let stuck = 0;
let pathUntil = -1;
let sayCool = 0;
let lastSaid = "";

function boxHit(ax, az, bx, bz, o, pad) {
  const minx = o.x - o.hx - pad, maxx = o.x + o.hx + pad;
  const minz = o.z - o.hz - pad, maxz = o.z + o.hz + pad;
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dz = bz - az;
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

function blocked(obs, ax, az, bx, bz, pad) {
  for (let i = 0; i < obs.length; i++) {
    if (boxHit(ax, az, bx, bz, obs[i], pad || 0)) return true;
  }
  return false;
}

function clampA(v, lim) {
  if (v > lim) return lim;
  if (v < -lim) return -lim;
  return v;
}

function predictEnemy(e, t) {
  return {
    x: clampA(e.x + (e.vx || 0) * t, ARENA - 0.6),
    z: clampA(e.z + (e.vz || 0) * t, ARENA - 0.6)
  };
}

function interceptCharge(s, e) {
  let t = 0.3;
  let pt = predictEnemy(e, t);
  for (let i = 0; i < 3; i++) {
    const dd = Math.hypot(pt.x - s.x, pt.z - s.z);
    t = 0.3 + Math.max(0, dd - (R_SELF + R_ENEMY)) / 15;
    pt = predictEnemy(e, t);
  }
  return pt;
}

function talk(api, txt) {
  if (sayCool > 0 || txt === lastSaid) return;
  sayCool = 45;
  lastSaid = txt;
  api.say(txt);
}

function think(p, api) {
  const s = p.self, e = p.enemy;
  if (!s.alive) return;
  if (sayCool > 0) sayCool--;
  const obs = p.arena.obstacles;
  const d = e.dist;

  for (const ev of p.events) {
    if (ev.type === 'blocked') stuck += 4;
    if (ev.type === 'dealt' && ev.skill === 'smash') talk(api, "STAY DOWN");
    if (ev.type === 'dealt' && ev.skill === 'charge') talk(api, "RUN THEN");
    if (ev.type === 'interruptedEnemy') talk(api, "no beams for you");
  }
  if (!s.busy && !s.stunned && !s.airborne && s.speed < 0.7) stuck += 1;
  else stuck = Math.max(0, stuck - 1);
  if (stuck > 10) { pathUntil = p.tick + 24; stuck = 0; }

  if (!e.alive) { api.stop(); return; }

  const eCast = e.casting;
  const laserCast = !!(eCast && eCast.skill === 'laser' && eCast.telegraph);
  const laserLeft = laserCast ? Math.max(0.05, eCast.remaining) : 0;
  const eAirSoon = e.airborne || !!(eCast && eCast.skill === 'jump' && eCast.phase !== 'recover');

  // ---------- facing ----------
  let faceP = null;

  if (s.casting && s.casting.skill === 'smash' && s.casting.telegraph) {
    faceP = predictEnemy(e, Math.max(0.05, s.casting.remaining));
  } else if (s.casting && s.casting.skill === 'charge' && s.casting.phase === 'windup') {
    faceP = interceptCharge(s, e);
  } else {
    faceP = predictEnemy(e, 0.18);
  }
  api.faceAt(faceP.x, faceP.z);

  // ---------- skills ----------
  const canAct = !s.busy && !s.stunned && !s.airborne;
  let ordered = false;

  if (canAct) {
    const smashReady = api.ready('smash');
    const chargeReady = api.ready('charge');

    // smash evaluation
    const sp = predictEnemy(e, 0.3);
    const spd = Math.hypot(sp.x - s.x, sp.z - s.z);
    const sAng = Math.abs(V.angleTo(s.heading, { x: sp.x - s.x, z: sp.z - s.z }));
    const smashOk = smashReady && !eAirSoon && !e.invulnerable &&
      (spd - 0.45) <= 4.6 && sAng < 1.35 &&
      !blocked(obs, s.x, s.z, sp.x, sp.z, 0);

    // charge evaluation
    const ip = interceptCharge(s, e);
    const ipd = Math.hypot(ip.x - s.x, ip.z - s.z);
    const cAng = Math.abs(V.angleTo(s.heading, { x: ip.x - s.x, z: ip.z - s.z }));
    const chargeOk = chargeReady && !e.invulnerable &&
      ipd <= 11.5 && ipd >= 2.1 && cAng < 0.85 &&
      !blocked(obs, s.x, s.z, ip.x, ip.z, 1.0);

    // interrupt a laser cast with a charge whenever possible
    if (chargeOk && laserCast && d > 3.4) {
      api.use('charge');
      ordered = true;
    } else if (smashOk && d <= 5.3) {
      api.use('smash');
      ordered = true;
    } else if (chargeOk) {
      api.use('charge');
      ordered = true;
    } else if (smashOk) {
      api.use('smash');
      ordered = true;
    }
  }

  // ---------- movement ----------
  if (s.airborne) return;

  const chargingWind = s.casting && s.casting.skill === 'charge' && s.casting.phase === 'windup';
  if (chargingWind || (ordered && s.busy === false)) {
    // keep drifting at the target while committing
  }

  if (p.tick < pathUntil && !e.visible) {
    api.moveTo(e.x, e.z);
    return;
  }

  if (!e.visible) {
    const path = api.pathTo(e.x, e.z);
    if (path && path.points && path.points.length > 0) {
      const w = path.points[0];
      api.move(w.x - s.x, w.z - s.z);
    } else {
      api.moveTo(e.x, e.z);
    }
    return;
  }

  if (d < 6.0 || chargingWind) {
    // melee cling: push into them, heavier body wins the shove
    const tgt = predictEnemy(e, 0.15);
    let dx = tgt.x - s.x, dz = tgt.z - s.z;
    const L = Math.hypot(dx, dz) || 1;
    dx /= L; dz /= L;
    // slight orbit component to avoid being pinned against walls/blocks
    const nx = -dz, nz = dx;
    const side = (s.x * nx + s.z * nz) > 0 ? -1 : 1;
    let mx = dx + nx * 0.22 * side, mz = dz + nz * 0.22 * side;
    const px = s.x + mx * 1.6, pz = s.z + mz * 1.6;
    if (Math.abs(px) > ARENA - 1.4 || Math.abs(pz) > ARENA - 1.4) { mx = dx; mz = dz; }
    api.move(mx, mz);
    return;
  }

  // ranged approach with cover preference
  const horizon = laserCast ? Math.max(0.25, laserLeft) : 0.5;
  const step = Math.max(1.3, Math.min(s.maxSpeed * horizon + 0.5, Math.max(1.3, d - 2.0)));
  const coverW = laserCast ? 9.0 : (d > 8 ? 2.2 : 0.6);

  let best = null;
  const N = 20;
  for (let i = 0; i < N; i++) {
    const a = (i * Math.PI * 2) / N;
    const dirx = Math.sin(a), dirz = Math.cos(a);
    const Px = s.x + dirx * step, Pz = s.z + dirz * step;
    if (Math.abs(Px) > ARENA - 1.5 || Math.abs(Pz) > ARENA - 1.5) continue;
    if (blocked(obs, s.x, s.z, Px, Pz, R_SELF * 0.95)) continue;
    const nd = Math.hypot(e.x - Px, e.z - Pz);
    let score = (d - nd) * 2.0;
    if (blocked(obs, Px, Pz, e.x, e.z, 0)) score += coverW;
    score += 0.35 * ((dirx * (s.vx || 0) + dirz * (s.vz || 0)) / Math.max(1, s.maxSpeed));
    const edge = Math.max(Math.abs(Px), Math.abs(Pz));
    if (edge > 16.5) score -= (edge - 16.5) * 1.2;
    if (!best || score > best.score) best = { score, dirx, dirz };
  }

  if (best) api.move(best.dirx, best.dirz);
  else api.moveTo(e.x, e.z);
}
