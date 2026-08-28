const LASER_CAST = 0.667;
const SAFE_RING = 13.5;

let enemyLast = {};
let strafeSign = 1;
let strafeFlipT = 0;
let lastBlinkT = -99;
let lastJumpT = -99;
let sayT = -99;

function dirAt(a) { return { x: Math.sin(a), z: Math.cos(a) }; }

function pickMoveDir(p, api, base, toE) {
  let best = null, bestScore = -1e9;
  const s = p.self;
  for (let i = 0; i < 16; i++) {
    const d = dirAt(i * Math.PI / 8);
    let clear = 8;
    try {
      const r = api.ray(d.x, d.z, 8);
      clear = Math.min(r.dist, 8);
    } catch (err) { clear = 8; }
    if (clear < 1.4) continue;
    let score = Math.min(clear, 6) * 1.1 + V.dot(d, base) * 8;
    const nx = s.x + d.x * 3.5, nz = s.z + d.z * 3.5;
    const ax = Math.abs(nx), az = Math.abs(nz);
    if (ax > 17) score -= (ax - 17) * 4;
    if (az > 17) score -= (az - 17) * 4;
    if (V.dot(d, toE) > 0.6) score -= 2;
    if (score > bestScore) { bestScore = score; best = d; }
  }
  return best || base;
}

function pickBlinkDir(p, api, prefer) {
  const s = p.self, e = p.enemy;
  let best = prefer, bestScore = -1e9;
  for (let i = 0; i < 16; i++) {
    const d = dirAt(i * Math.PI / 8);
    const lx = s.x + d.x * 7.5, lz = s.z + d.z * 7.5;
    let score = V.dot(d, prefer) * 6;
    const ax = Math.abs(lx), az = Math.abs(lz);
    if (ax > 18.5) score -= (ax - 18.5) * 5;
    if (az > 18.5) score -= (az - 18.5) * 5;
    const nd = Math.hypot(lx - e.x, lz - e.z);
    score += Math.min(nd, 16) * 0.45;
    if (score > bestScore) { bestScore = score; best = d; }
  }
  return best;
}

function think(p, api) {
  const s = p.self, e = p.enemy;
  if (!s || !s.alive) return;
  const t = p.t;

  for (const ev of p.events) {
    if (ev.type === 'enemyStarted') enemyLast[ev.skill] = t;
    else if (ev.type === 'enemyCommitted') enemyLast.commit = t;
    else if (ev.type === 'blocked') strafeSign = -strafeSign;
    else if (ev.type === 'blinked') lastBlinkT = t;
  }

  if (!e || !e.alive) { api.stop(); return; }

  const dist = e.dist;
  const toE = V.toward(s, e);
  const away = { x: -toE.x, z: -toE.z };

  if (t - strafeFlipT > 2.6) {
    strafeFlipT = t;
    const pr = V.perp(toE);
    const a = Math.hypot(s.x + pr.x * 6, s.z + pr.z * 6);
    const b = Math.hypot(s.x - pr.x * 6, s.z - pr.z * 6);
    strafeSign = (a <= b) ? 1 : -1;
  }
  const per = V.perp(toE);
  const tangent = { x: per.x * strafeSign, z: per.z * strafeSign };

  // ---- threat reading ----
  const ec = e.casting;
  const enemyCharging = !!(ec && ec.skill === 'charge');
  const chargeDashing = enemyCharging && (ec.phase === 'dash' || !ec.telegraph === false && ec.phase === 'dash');
  const chargeWindup = enemyCharging && ec.phase === 'windup';
  const smashTele = !!(ec && ec.skill === 'smash' && ec.telegraph);
  const chargeMaybeReady = !(enemyLast.charge && (t - enemyLast.charge) < 4.0);

  // ---- facing: predict where they are when the beam leaves ----
  let leadT = 0.0;
  if (s.casting && s.casting.skill === 'laser' && s.casting.telegraph) leadT = Math.min(s.casting.remaining, 0.6);
  else if (api.ready('laser')) leadT = LASER_CAST;
  const aimX = e.x + e.vx * leadT * 0.75;
  const aimZ = e.z + e.vz * leadT * 0.75;
  api.faceAt(aimX, aimZ);

  // ---- emergency: charge dash incoming ----
  if (chargeDashing && !s.busy && api.ready('blink')) {
    const h = V.fromHeading(e.heading);
    const sidePerp = V.perp(h);
    const s1 = { x: sidePerp.x, z: sidePerp.z };
    const s2 = { x: -sidePerp.x, z: -sidePerp.z };
    const prefer = (V.dot(s1, away) >= V.dot(s2, away)) ? s1 : s2;
    const bd = pickBlinkDir(p, api, { x: prefer.x * 0.8 + away.x * 0.35, z: prefer.z * 0.8 + away.z * 0.35 });
    api.use('blink', bd.x, bd.z);
    api.move(bd.x, bd.z);
    return;
  }

  // ---- emergency: smash about to land on us ----
  if (smashTele && dist < 6.2 && !s.busy) {
    if (api.ready('jump')) {
      api.move(away.x, away.z);
      api.use('jump');
      lastJumpT = t;
      return;
    }
    if (api.ready('blink')) {
      const bd = pickBlinkDir(p, api, { x: away.x * 0.8 + tangent.x * 0.5, z: away.z * 0.8 + tangent.z * 0.5 });
      api.use('blink', bd.x, bd.z);
      api.move(bd.x, bd.z);
      return;
    }
  }

  // ---- create space when they get close ----
  if (!s.busy && dist < 7.0 && api.ready('blink') && !e.stunned) {
    const bd = pickBlinkDir(p, api, { x: away.x * 0.85 + tangent.x * 0.45, z: away.z * 0.85 + tangent.z * 0.45 });
    api.use('blink', bd.x, bd.z);
    api.move(bd.x, bd.z);
    return;
  }

  // ---- laser ----
  let castOk = false;
  if (api.ready('laser') && !s.busy && !s.airborne && !s.stunned && e.visible && dist < 22.5) {
    if (api.los(aimX, aimZ)) {
      if (dist > 15) castOk = true;
      else if (dist > 8.5 && chargeMaybeReady === false) castOk = true;
      else if (dist > 8.5 && !chargeWindup && !smashTele) castOk = true;
      else if (e.stunned && dist > 3) castOk = true;
    }
  }
  if (castOk) api.use('laser');

  // ---- movement ----
  const ahead = p.burn > 0 && (s.hp / s.maxHp) > (e.hp / e.maxHp) + 0.03;
  let base;
  if (!e.visible && dist > 9) {
    const path = api.pathTo(e.x, e.z);
    if (path && path.points && path.points.length) {
      const wp = path.points[0];
      base = V.norm({ x: wp.x - s.x, z: wp.z - s.z });
    } else base = toE;
  } else if (dist < 10.5 || smashTele || chargeWindup || ahead) {
    base = V.norm({ x: away.x * 1.0 + tangent.x * 0.65, z: away.z * 1.0 + tangent.z * 0.65 });
  } else if (dist > 17) {
    base = V.norm({ x: toE.x * 0.9 + tangent.x * 0.4, z: toE.z * 0.9 + tangent.z * 0.4 });
  } else {
    const drift = (dist - SAFE_RING) * 0.12;
    base = V.norm({ x: tangent.x + toE.x * drift, z: tangent.z + toE.z * drift });
  }

  // stay off the walls
  const cx = -s.x, cz = -s.z;
  const rad = Math.hypot(s.x, s.z);
  if (rad > 15) {
    const c = V.norm({ x: cx, z: cz });
    const w = Math.min((rad - 15) / 4, 1) * 1.2;
    base = V.norm({ x: base.x + c.x * w, z: base.z + c.z * w });
  }

  const dir = pickMoveDir(p, api, base, toE);
  api.move(dir.x, dir.z);

  if (t - sayT > 7) {
    sayT = t;
    api.say(dist > 12 ? "eight arms, one beam" : "too close, ape");
  }
}
