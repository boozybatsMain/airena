function think(p, api) {
  const s = p.self, e = p.enemy;
  if (!s || !e || !s.alive || !e.alive) return;

  const me = { x: s.x, z: s.z }, en = { x: e.x, z: e.z };
  const d = e.dist;

  // ---------- events ----------
  for (const ev of p.events) {
    if (ev.type === 'enemyCommitted') {
      chargeDir = V.fromHeading(e.heading);
      chargeOrigin = { x: e.x, z: e.z };
      chargeT = p.t;
    } else if (ev.type === 'blocked') {
      orbitSign = -orbitSign;
    } else if (ev.type === 'blinked') {
      lastBlinkT = p.t;
    }
  }

  // ---------- read enemy state ----------
  const ec = e.casting;
  const dashing = !!(ec && ec.skill === 'charge' && ec.phase === 'dash');
  const chargeWind = !!(ec && ec.skill === 'charge' && ec.phase === 'windup');
  const smashWind = !!(ec && ec.skill === 'smash' && ec.telegraph);
  if (dashing && e.speed > 3) {
    chargeDir = V.norm({ x: e.vx, z: e.vz });
    chargeOrigin = { x: e.x, z: e.z };
    chargeT = p.t;
  }

  // ---------- geometry ----------
  const away = V.toward(en, me);
  const toE = V.scale(away, -1);
  const cdist = Math.hypot(s.x, s.z);
  const cen = cdist > 0.01 ? V.norm({ x: -s.x, z: -s.z }) : { x: 1, z: 0 };
  let tan = V.scale(V.perp(away), orbitSign);
  if (V.dot(tan, cen) < -0.55) { orbitSign = -orbitSign; tan = V.scale(tan, -1); }

  // ---------- incoming dash ----------
  let dashIncoming = false;
  let dodgeDir = tan;
  if (dashing && chargeDir && chargeOrigin && (p.t - chargeT) < 1.2) {
    const rel = V.sub(me, chargeOrigin);
    const along = V.dot(rel, chargeDir);
    const pv = V.perp(chargeDir);
    const perp = V.dot(rel, pv);
    if (along > -1.5 && along < 14 && Math.abs(perp) < 3.6) {
      dashIncoming = true;
      dodgeDir = perp >= 0 ? pv : V.scale(pv, -1);
      // bias slightly backwards so we clear the corridor
      dodgeDir = V.norm(V.add(dodgeDir, V.scale(away, 0.35)));
    }
  }

  // ---------- aim point ----------
  let lead = 0.55;
  if (s.casting && s.casting.skill === 'laser' && s.casting.telegraph) lead = s.casting.remaining;
  let off = { x: e.vx * lead * 0.85, z: e.vz * lead * 0.85 };
  const ol = V.len(off);
  if (ol > 6) off = V.scale(off, 6 / ol);
  let aim = { x: e.x + off.x, z: e.z + off.z };
  if (Math.abs(aim.x) > 19.5 || Math.abs(aim.z) > 19.5 || !api.los(aim.x, aim.z)) aim = en;

  // ---------- desired travel direction ----------
  const myFrac = s.hp / s.maxHp, hisFrac = e.hp / e.maxHp;
  const winning = myFrac > hisFrac + 0.02;
  const nearEnd = p.timeLeft < 7;

  let desired;
  if (dashIncoming) {
    desired = dodgeDir;
  } else if (smashWind && d < 7.5) {
    desired = V.norm(V.add(V.scale(away, 1.6), V.scale(tan, 0.45)));
  } else if (nearEnd && winning) {
    desired = V.norm(V.add(V.add(V.scale(away, 1.4), V.scale(tan, 0.8)), V.scale(cen, 0.5)));
  } else if (d < 11.5 || (chargeWind && d < 14)) {
    desired = V.norm(V.add(V.add(V.scale(away, 1.4), V.scale(tan, 0.85)), V.scale(cen, 0.55)));
  } else if (d > 18.5) {
    desired = V.norm(V.add(V.scale(toE, 1.0), V.scale(tan, 0.45)));
  } else {
    desired = V.norm(V.add(V.add(V.scale(tan, 1.0), V.scale(away, 0.5)), V.scale(cen, 0.35)));
  }

  // if we cannot see them and they are far, take a route toward line of sight
  if (!e.visible && d > 10.5 && !dashIncoming) {
    const path = api.pathTo(e.x, e.z);
    if (path && path.points && path.points.length) {
      let wp = path.points[0];
      if (V.dist(wp, me) < 1.0 && path.points.length > 1) wp = path.points[1];
      const dd = V.norm({ x: wp.x - s.x, z: wp.z - s.z });
      if (V.len(dd) > 0.01) desired = V.norm(V.add(V.scale(dd, 1.0), V.scale(tan, 0.3)));
    }
  }

  const mv = pickStep(p, api, desired);

  // ---------- skills ----------
  let acted = false;
  if (!s.busy && !s.stunned && !s.airborne) {

    if (dashIncoming && !s.invulnerable && api.ready('blink')) {
      const bd = bestBlink(p, dodgeDir, -0.1);
      api.use('blink', bd.x, bd.z);
      acted = true;
    } else if (smashWind && d < 7.0) {
      const rem = ec ? ec.remaining : 0.15;
      const proj = d + 2.5 * rem;
      if (proj < 5.9) {
        if (api.ready('blink')) {
          const bd = bestBlink(p, away, 0.15);
          api.use('blink', bd.x, bd.z);
          acted = true;
        } else if (api.ready('jump')) {
          api.use('jump');
          acted = true;
        }
      }
    } else if (d < 5.6 && api.ready('blink')) {
      const bd = bestBlink(p, away, 0.1);
      api.use('blink', bd.x, bd.z);
      acted = true;
    }

    if (!acted && api.ready('laser') && e.visible && d < 23.5 && !e.invulnerable) {
      const harmless = e.stunned || (ec && ec.phase === 'recover');
      const threat = !!(ec && ec.skill === 'charge' && ec.phase !== 'recover');
      const safeD = harmless || (!threat && d >= 10.5) || d >= 16.5;
      const want = V.toward(me, aim);
      const ang = Math.abs(V.angleTo(s.heading, want));
      if (safeD && ang < 1.05) {
        api.use('laser');
        acted = true;
      }
    }
  }

  // ---------- standing orders ----------
  api.move(mv.x, mv.z);
  api.faceAt(aim.x, aim.z);
}

let orbitSign = 1;
let chargeDir = null;
let chargeOrigin = null;
let chargeT = -99;
let lastBlinkT = -99;

function pickStep(p, api, desired) {
  const s = p.self;
  if (!desired || (desired.x === 0 && desired.z === 0)) return { x: 0, z: 0 };
  let best = desired, bs = -1e9;
  const N = 20;
  for (let i = 0; i < N; i++) {
    const a = (i * 2 * Math.PI) / N;
    const dir = { x: Math.sin(a), z: Math.cos(a) };
    const r = api.ray(dir.x, dir.z, 5);
    const clear = Math.min(r.dist, 5);
    let sc = 3.0 * V.dot(dir, desired) + 0.8 * (clear / 5);
    if (clear < 2.2) sc -= (2.2 - clear) * 2.6;
    const px = s.x + dir.x * 3.0, pz = s.z + dir.z * 3.0;
    const margin = 20 - Math.max(Math.abs(px), Math.abs(pz));
    if (margin < 4.5) sc -= (4.5 - margin) * 0.7;
    if (sc > bs) { bs = sc; best = dir; }
  }
  return best;
}

function bestBlink(p, pref, minDot) {
  const s = p.self, e = p.enemy;
  let best = pref, bs = -1e9;
  for (let i = 0; i < 16; i++) {
    const a = (i * Math.PI) / 8;
    const dir = { x: Math.sin(a), z: Math.cos(a) };
    if (V.dot(dir, pref) < minDot) continue;
    let px = s.x + dir.x * 7.5, pz = s.z + dir.z * 7.5;
    let pen = 0;
    const lim = 18.4;
    if (px > lim) { pen += px - lim; px = lim; }
    if (px < -lim) { pen += -lim - px; px = -lim; }
    if (pz > lim) { pen += pz - lim; pz = lim; }
    if (pz < -lim) { pen += -lim - pz; pz = -lim; }
    let sc = V.dist({ x: px, z: pz }, { x: e.x, z: e.z }) - 1.5 * pen + 1.5 * V.dot(dir, pref);
    const margin = 20 - Math.max(Math.abs(px), Math.abs(pz));
    if (margin < 3.5) sc -= (3.5 - margin) * 1.2;
    if (sc > bs) { bs = sc; best = dir; }
  }
  return best;
}
