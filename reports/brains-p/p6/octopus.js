let orbit = 1;
let lastSmash = -99, lastCharge = -99, lastFlip = 0;
let leadF = 0.85;
let chargeLock = null;
let faults = 0;

function clampA(v) { return Math.max(-19.2, Math.min(19.2, v)); }

function bestBlink(p, cands) {
  const s = p.self, e = p.enemy;
  let best = null, bs = -1e9;
  for (const c of cands) {
    const d = V.norm(c);
    if (!d.x && !d.z) continue;
    const nx = clampA(s.x + d.x * 7.4), nz = clampA(s.z + d.z * 7.4);
    const dd = Math.hypot(nx - e.x, nz - e.z);
    const wm = 20 - Math.max(Math.abs(nx), Math.abs(nz));
    const sc = dd + Math.min(wm, 6) * 0.7;
    if (sc > bs) { bs = sc; best = d; }
  }
  return best;
}

function ring(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = i * Math.PI * 2 / n;
    out.push({ x: Math.sin(a), z: Math.cos(a) });
  }
  return out;
}

function pickMove(p, api, want, D) {
  const s = p.self, e = p.enemy;
  let best = null, bs = -1e9;
  const dirs = ring(16);
  for (const d of dirs) {
    const r = api.ray(d.x, d.z, 4.5);
    const clear = r ? r.dist : 4.5;
    if (clear < 1.5) continue;
    let sc = Math.min(clear, 4.5) * 0.45;
    const qx = s.x + d.x * 2.6, qz = s.z + d.z * 2.6;
    const dq = Math.hypot(qx - e.x, qz - e.z);
    sc -= Math.abs(dq - D) * 1.1;
    const wm = 20 - Math.max(Math.abs(qx), Math.abs(qz));
    if (wm < 4.5) sc -= (4.5 - wm) * 2.2;
    sc += V.dot(d, want) * 1.6;
    if (sc > bs) { bs = sc; best = d; }
  }
  return best;
}

function think(p, api) {
  const s = p.self, e = p.enemy;

  for (const ev of p.events) {
    if (ev.type === 'enemyStarted') {
      if (ev.skill === 'smash') lastSmash = p.t;
      else if (ev.skill === 'charge') lastCharge = p.t;
    } else if (ev.type === 'enemyCommitted') {
      if (ev.skill === 'charge') chargeLock = { h: e.heading, x: e.x, z: e.z, t: p.t };
    } else if (ev.type === 'blocked') {
      orbit = -orbit; lastFlip = p.t;
    } else if (ev.type === 'damaged') {
      if (api.rand() < 0.6) { orbit = -orbit; lastFlip = p.t; }
    } else if (ev.type === 'missed' && ev.skill === 'laser') {
      if (ev.reason === 'aim') leadF = leadF > 0.8 ? 0.6 : 1.0;
    } else if (ev.type === 'dealt' && ev.skill === 'laser') {
      leadF = 0.85;
    }
  }
  if (chargeLock && p.t - chargeLock.t > 1.3) chargeLock = null;

  if (!s.alive) return;

  const dist = e.dist;
  const ec = e.casting;

  if (s.stunned) { api.faceAt(e.x, e.z); return; }
  if (s.airborne) {
    api.faceAt(e.x + e.vx * 0.35, e.z + e.vz * 0.35);
    return;
  }

  // ---------- charge threat ----------
  let dashing = false, dashDir = null;
  if (ec && ec.skill === 'charge' && ec.phase !== 'windup') {
    dashing = true;
    dashDir = V.fromHeading(chargeLock ? chargeLock.h : e.heading);
  }
  if (dashing && dashDir) {
    const rel = { x: s.x - e.x, z: s.z - e.z };
    const along = V.dot(rel, dashDir);
    const perpV = { x: rel.x - dashDir.x * along, z: rel.z - dashDir.z * along };
    const lat = V.len(perpV);
    const side = (lat > 0.2) ? V.norm(perpV) : V.perp(dashDir);
    if (along > -2 && along < 15 && lat < 3.6) {
      if (api.ready('blink')) {
        const cands = [side, V.norm(V.add(V.scale(side, 1), V.scale(dashDir, 0.5))),
                       V.norm(V.add(V.scale(side, 1), V.scale(dashDir, -0.5))),
                       V.scale(side, -1)];
        const bd = bestBlink(p, cands) || side;
        api.use('blink', bd.x, bd.z);
        api.faceAt(e.x, e.z);
        return;
      }
      const mv = pickMove(p, api, side, dist + 4) || side;
      api.move(mv.x, mv.z);
      api.faceAt(e.x, e.z);
      return;
    }
  }

  // charge wind-up: strafe hard so the lock misses
  if (ec && ec.skill === 'charge' && ec.phase === 'windup') {
    const away = V.norm({ x: s.x - e.x, z: s.z - e.z });
    const tang = V.scale(V.perp(away), orbit);
    const want = V.norm(V.add(V.scale(tang, 1.0), V.scale(away, 0.35)));
    const mv = pickMove(p, api, want, Math.max(dist + 3, 13)) || want;
    api.move(mv.x, mv.z);
    api.faceAt(e.x, e.z);
    return;
  }

  // ---------- smash threat ----------
  if (ec && ec.skill === 'smash' && ec.telegraph && dist < 6.6) {
    const away = V.norm({ x: s.x - e.x, z: s.z - e.z });
    const tang = V.scale(V.perp(away), orbit);
    const want = V.norm(V.add(V.scale(away, 1.0), V.scale(tang, 0.7)));
    const mv = pickMove(p, api, want, 14) || want;
    api.move(mv.x, mv.z);
    api.faceAt(e.x, e.z);
    if (!s.busy) {
      if (dist < 4.2 && api.ready('blink')) {
        const bd = bestBlink(p, ring(12)) || want;
        api.use('blink', bd.x, bd.z);
      } else if (api.ready('jump') && ec.remaining > 0.13) {
        api.use('jump');
      } else if (api.ready('blink')) {
        const bd = bestBlink(p, ring(12)) || want;
        api.use('blink', bd.x, bd.z);
      }
    }
    return;
  }

  // ---------- panic escape when mauled at point blank ----------
  if (dist < 3.6 && !s.busy && api.ready('blink') && !(ec && ec.skill === 'charge')) {
    const bd = bestBlink(p, ring(12));
    if (bd) {
      api.use('blink', bd.x, bd.z);
      api.faceAt(e.x, e.z);
      return;
    }
  }

  // ---------- desired range ----------
  const chargeReady = (p.t - lastCharge) > 3.6;
  let D = chargeReady ? 15.0 : 9.0;
  const myFrac = s.hp / s.maxHp, hisFrac = e.hp / e.maxHp;
  if (p.t > 33 && myFrac < hisFrac) D = Math.min(D, 11.0);

  // ---------- aiming ----------
  const tRem = (s.casting && s.casting.skill === 'laser' && s.casting.telegraph)
    ? s.casting.remaining : 0.667;
  const lf = e.airborne ? 1.0 : leadF;
  const aim = { x: e.x + e.vx * tRem * lf, z: e.z + e.vz * tRem * lf };
  api.faceAt(aim.x, aim.z);

  // ---------- movement ----------
  let want;
  if (!e.visible) {
    const path = api.pathTo(e.x, e.z);
    if (path && path.points && path.points.length) {
      want = V.toward(s, path.points[0]);
    } else {
      want = V.toward(s, e);
    }
    D = Math.min(D, Math.max(6, dist - 2));
  } else {
    const away = V.norm({ x: s.x - e.x, z: s.z - e.z });
    const tang = V.scale(V.perp(away), orbit);
    let radial = 0;
    if (dist < D - 1.5) radial = 0.85;
    else if (dist > D + 2.5) radial = -0.55;
    want = V.norm(V.add(V.scale(tang, 1.0), V.scale(away, radial)));
  }

  if (p.t - lastFlip > 2.6 && api.rand() < 0.06) { orbit = -orbit; lastFlip = p.t; }

  const mv = pickMove(p, api, want, D);
  if (mv) api.move(mv.x, mv.z);
  else api.move(want.x, want.z);

  // ---------- fire ----------
  if (!s.busy && api.ready('laser') && e.visible && dist < 23.0) {
    const enemyBusySafe = e.stunned || (e.casting && e.casting.phase === 'recover') || e.airborne;
    const closeRisk = dist < 6.0 && !enemyBusySafe;
    const dirAim = V.toward(s, aim);
    const err = Math.abs(V.angleTo(s.heading, dirAim));
    if (!closeRisk && err < 1.25 && dist > 2.5) {
      api.use('laser');
    }
  }
}
