const HALF = 20;
let prevMove = null;
let lastChargeT = -99;
let lastSmashT = -99;
let lastVisT = 0;
let sayT = -99;

function boxHit(ax, az, bx, bz, minx, minz, maxx, maxz) {
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dz = bz - az;
  const ps = [-dx, dx, -dz, dz];
  const qs = [ax - minx, maxx - ax, az - minz, maxz - az];
  for (let i = 0; i < 4; i++) {
    const pp = ps[i], qq = qs[i];
    if (Math.abs(pp) < 1e-9) { if (qq < 0) return false; continue; }
    const r = qq / pp;
    if (pp < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
    else { if (r < t0) return false; if (r < t1) t1 = r; }
  }
  return true;
}

function lineClear(obs, ax, az, bx, bz, m) {
  for (const o of obs) {
    if (boxHit(ax, az, bx, bz, o.x - o.hx - m, o.z - o.hz - m, o.x + o.hx + m, o.z + o.hz + m)) return false;
  }
  return true;
}

function pointBlocked(obs, x, z, m) {
  if (Math.abs(x) > HALF - m || Math.abs(z) > HALF - m) return true;
  for (const o of obs) {
    if (Math.abs(x - o.x) < o.hx + m && Math.abs(z - o.z) < o.hz + m) return true;
  }
  return false;
}

function blinkLand(obs, me, dir) {
  for (let d = 7.5; d >= 1.5; d -= 0.6) {
    const x = me.x + dir.x * d, z = me.z + dir.z * d;
    if (!pointBlocked(obs, x, z, 1.15)) return { x, z, d };
  }
  return null;
}

function pickBlink(obs, me, en, prefer) {
  const pf = prefer ? V.norm(prefer) : null;
  let best = pf || { x: 1, z: 0 }, bestS = -1e9;
  for (let i = 0; i < 16; i++) {
    const d = V.fromHeading(i * Math.PI / 8);
    const land = blinkLand(obs, me, d);
    if (!land) continue;
    let s = Math.min(V.dist(land, en), 13) * 1.0;
    const wall = HALF - Math.max(Math.abs(land.x), Math.abs(land.z));
    s += Math.min(wall, 5) * 0.7;
    if (lineClear(obs, land.x, land.z, en.x, en.z, 0.2)) s += 1.5;
    if (pf) s += (d.x * pf.x + d.z * pf.z) * 3.0;
    s += land.d * 0.25;
    if (s > bestS) { bestS = s; best = d; }
  }
  return best;
}

function sanitizeDir(obs, me, dir) {
  if (!dir) return null;
  const n = V.norm(dir);
  if (n.x === 0 && n.z === 0) return null;
  for (let k = 0; k <= 6; k++) {
    const signs = k === 0 ? [0] : [1, -1];
    for (const s of signs) {
      const d = V.rot(n, s * k * 0.36);
      const ok = !pointBlocked(obs, me.x + d.x * 1.8, me.z + d.z * 1.8, me.radius + 0.05) &&
                 !pointBlocked(obs, me.x + d.x * 0.9, me.z + d.z * 0.9, me.radius + 0.02);
      if (ok) return d;
    }
  }
  return n;
}

function chooseMove(me, en, obs, R, losW, toE) {
  let best = null, bestS = -1e9;
  const N = 24;
  for (let i = 0; i < N; i++) {
    const d = V.fromHeading(i * 2 * Math.PI / N);
    const step = 2.4;
    if (pointBlocked(obs, me.x + d.x * 1.2, me.z + d.z * 1.2, me.radius + 0.05)) continue;
    const nx = me.x + d.x * step, nz = me.z + d.z * step;
    if (pointBlocked(obs, nx, nz, me.radius + 0.05)) continue;
    const nd = Math.hypot(nx - en.x, nz - en.z);
    let s = -Math.abs(nd - R) * 1.0;
    const wall = HALF - Math.max(Math.abs(nx), Math.abs(nz));
    s += Math.min(wall, 6) * 0.6;
    const seen = lineClear(obs, nx, nz, en.x, en.z, 0.2);
    s += seen ? losW : -losW;
    s += Math.abs(d.x * toE.z - d.z * toE.x) * 0.7;
    if (prevMove) s += (d.x * prevMove.x + d.z * prevMove.z) * 0.9;
    if (s > bestS) { bestS = s; best = d; }
  }
  return best;
}

function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me || !me.alive || !en) return;
  const obs = p.arena.obstacles || [];

  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      if (e.skill === 'charge') lastChargeT = p.t;
      else if (e.skill === 'smash') lastSmashT = p.t;
    }
  }
  if (en.visible) lastVisT = p.t;

  const dist = en.dist;
  const away = V.norm({ x: me.x - en.x, z: me.z - en.z });
  const toE = { x: -away.x, z: -away.z };
  const cast = me.casting;
  const castingLaser = !!(cast && cast.skill === 'laser' && cast.telegraph);

  // ---- aim point ----
  let leadT = castingLaser ? Math.min(cast.remaining || 0.3, 0.75) : 0.6;
  let ax = en.x + en.vx * leadT * 0.9;
  let az = en.z + en.vz * leadT * 0.9;
  ax = Math.max(-HALF + 0.4, Math.min(HALF - 0.4, ax));
  az = Math.max(-HALF + 0.4, Math.min(HALF - 0.4, az));

  const canAct = !me.busy && !me.stunned && !me.airborne;
  const enCast = en.casting;
  const dashing = !!(enCast && enCast.skill === 'charge' && enCast.phase === 'dash');
  const chgWind = !!(enCast && enCast.skill === 'charge' && enCast.telegraph && enCast.phase !== 'dash');
  const smashTele = !!(enCast && enCast.skill === 'smash' && enCast.telegraph);
  const chargeReady = (p.t - lastChargeT) > 3.85;

  let didAct = false;
  let handled = false;
  let moveDir = null;

  // ---- 1. dodge an active charge ----
  if (dashing) {
    const hd = V.fromHeading(en.heading);
    const rel = { x: me.x - en.x, z: me.z - en.z };
    const along = rel.x * hd.x + rel.z * hd.z;
    const lat = rel.x * hd.z - rel.z * hd.x;
    if (along > -2.5 && along < 14 && Math.abs(lat) < 3.8) {
      const perp = lat >= 0 ? { x: hd.z, z: -hd.x } : { x: -hd.z, z: hd.x };
      if (canAct && api.ready('blink')) {
        const d = pickBlink(obs, me, en, perp);
        api.use('blink', d.x, d.z);
        didAct = true;
      }
      moveDir = perp;
      handled = true;
    }
  }

  // ---- 2. charge wind-up: build lateral speed ----
  if (!handled && chgWind && dist < 15) {
    const p1 = { x: toE.z, z: -toE.x };
    const p2 = { x: -toE.z, z: toE.x };
    const s1 = pointBlocked(obs, me.x + p1.x * 3, me.z + p1.z * 3, me.radius + 0.1) ? 0 : 1;
    const s2 = pointBlocked(obs, me.x + p2.x * 3, me.z + p2.z * 3, me.radius + 0.1) ? 0 : 1;
    let pick = s1 >= s2 ? p1 : p2;
    if (prevMove && ((prevMove.x * p2.x + prevMove.z * p2.z) > (prevMove.x * p1.x + prevMove.z * p1.z)) && s2 >= s1) pick = p2;
    moveDir = { x: pick.x * 0.85 + away.x * 0.5, z: pick.z * 0.85 + away.z * 0.5 };
    handled = true;
  }

  // ---- 3. smash telegraph at close range ----
  if (!handled && smashTele && dist < 6.7 && canAct) {
    if (api.ready('jump') && (chargeReady || !api.ready('blink'))) {
      moveDir = away;
      api.use('jump');
      didAct = true;
      handled = true;
    } else if (api.ready('blink')) {
      const d = pickBlink(obs, me, en, away);
      api.use('blink', d.x, d.z);
      didAct = true;
      moveDir = away;
      handled = true;
    } else {
      moveDir = away;
      handled = true;
    }
  }

  // ---- 4. too close: teleport out ----
  if (!handled && !didAct && canAct && dist < 4.9 && api.ready('blink')) {
    const d = pickBlink(obs, me, en, away);
    api.use('blink', d.x, d.z);
    didAct = true;
    moveDir = away;
  }

  // ---- 5. laser ----
  if (!didAct && canAct && api.ready('laser') && en.visible && dist < 22.5 && !en.invulnerable) {
    const sinceSmash = p.t - lastSmashT;
    const safe = dist > 7.2 || en.stunned || (sinceSmash >= 0 && sinceSmash < 0.5 && dist > 3.5) ||
                 (p.t > 26 && dist > 5.0);
    const noInterrupt = !(smashTele && dist < 7.5) && !(chgWind && dist < 15.5) && !dashing;
    const aimDir = V.norm({ x: ax - me.x, z: az - me.z });
    const angErr = Math.abs(V.angleTo(me.heading, aimDir));
    if (safe && noInterrupt && angErr < 1.15) {
      api.use('laser');
      didAct = true;
    }
  }

  // ---- 6. movement ----
  if (!handled) {
    const lcd = api.cooldown('laser');
    let R = lcd > 1.0 ? 13.0 : 10.5;
    if (dist > 24) R = 13.0;
    if (castingLaser) R = Math.max(9.5, Math.min(dist, 13));
    const losW = lcd < 0.95 || dist > 12 ? 1.6 : (dist < 8.5 ? -0.9 : 0.4);
    moveDir = chooseMove(me, en, obs, R, losW, toE);
    if (!en.visible && (p.t - lastVisT) > 1.2) {
      const tx = Math.max(-HALF + 2, Math.min(HALF - 2, en.x + away.x * 9));
      const tz = Math.max(-HALF + 2, Math.min(HALF - 2, en.z + away.z * 9));
      api.moveTo(tx, tz);
      moveDir = null;
      prevMove = null;
    }
  }

  if (moveDir) {
    const d = sanitizeDir(obs, me, moveDir);
    if (d) {
      api.move(d.x, d.z);
      prevMove = d;
    }
  }

  api.faceAt(ax, az);

  if (p.t - sayT > 7.5) {
    sayT = p.t;
    api.say(dist > 12 ? "eight arms, one beam" : "too close, ape");
  }
}
