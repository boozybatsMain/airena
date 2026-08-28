function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive) return;
  const H = p.arena.half;
  const d = en.dist;

  // ---- events -------------------------------------------------------------
  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      if (e.skill === 'charge') lastCharge = p.t;
      else if (e.skill === 'smash') lastSmash = p.t;
    } else if (e.type === 'blocked') {
      if (p.t - lastFlip > 0.5) { strafeSign = -strafeSign; lastFlip = p.t; }
    } else if (e.type === 'damaged') {
      if (e.skill === 'charge') lastCharge = p.t - 0.9;
      if (p.t - lastFlip > 0.9) { strafeSign = -strafeSign; lastFlip = p.t; }
    } else if (e.type === 'blinked') {
      lastBlink = p.t;
    }
  }
  if (api.rand() < 0.012 && p.t - lastFlip > 2.2) { strafeSign = -strafeSign; lastFlip = p.t; }

  const chargeReady = (p.t - lastCharge) > 3.85;

  if (me.stunned) return;

  // ---- threats ------------------------------------------------------------
  const enC = en.casting;
  const charging = !!(enC && enC.skill === 'charge');
  const dashing = charging && enC.phase === 'dash';
  let chargeDir = null, chargeDanger = false;
  if (charging) {
    chargeDir = V.fromHeading(en.heading);
    const rel = { x: me.x - en.x, z: me.z - en.z };
    const along = V.dot(rel, chargeDir);
    const lat = Math.abs(rel.x * chargeDir.z - rel.z * chargeDir.x);
    if (along > -1.5 && along < 14.5 && lat < 3.5) chargeDanger = true;
    if (!dashing && d < 15.5) {
      const aim = Math.abs(V.angleTo(en.heading, V.toward(en, me)));
      if (aim < 0.7) chargeDanger = true;
    }
  }
  const smashDanger = !!(enC && enC.skill === 'smash' && enC.telegraph && d < 6.8);
  const enemySafe = en.stunned || (enC && enC.phase === 'recover');

  const blinkReady = api.ready('blink');

  // ---- emergency escapes --------------------------------------------------
  if ((dashing && chargeDanger) || smashDanger || (d < 4.0 && !enemySafe && !me.busy)) {
    if (blinkReady && !me.busy && !me.airborne) {
      const bd = bestBlink(p, api, dashing ? chargeDir : null);
      api.use('blink', bd.x, bd.z);
      api.move(bd.x, bd.z);
      api.faceAt(en.x, en.z);
      lastBlink = p.t;
      return;
    }
    if (smashDanger && api.ready('jump') && !me.airborne && !me.busy) {
      const aw = V.away(me, en);
      const mv0 = avoidDir(p, api, V.norm(V.add(aw, V.scale(V.perp(aw), strafeSign * 0.5))));
      api.move(mv0.x, mv0.z);
      api.use('jump');
      api.faceAt(en.x, en.z);
      return;
    }
  }

  // ---- laser --------------------------------------------------------------
  let fired = false;
  const castGateOk = enemySafe || (d > 5.8 && (!chargeReady || d > 13.5));
  if (!me.busy && !me.airborne && en.visible && d < 23 && d > 2.0 &&
      api.ready('laser') && castGateOk && !(charging && !dashing)) {
    const lp = predict(en, 0.667);
    const ang = Math.abs(V.angleTo(me.heading, V.toward(me, lp)));
    if (ang < 1.15 && (api.los(lp.x, lp.z) || api.los(en.x, en.z))) {
      api.use('laser');
      fired = true;
    }
  }

  // ---- movement -----------------------------------------------------------
  const away = V.away(me, en);
  const tang = V.scale(V.perp(away), strafeSign);
  let mv;

  if (!en.visible) {
    let wp = null;
    const path = api.pathTo(en.x, en.z);
    if (path && path.points && path.points.length) {
      wp = path.points[0];
      if (V.dist(me, wp) < 1.4 && path.points.length > 1) wp = path.points[1];
    }
    if (wp) {
      mv = V.toward(me, wp);
      if (d < 8.5) mv = V.norm(V.add(mv, V.scale(tang, 1.3)));
    } else {
      mv = V.toward(me, en);
    }
  } else {
    const desired = chargeReady ? 15.5 : 9.5;
    const err = d - desired;
    let radW = Math.max(-1, Math.min(1, -err / 3.5));
    let tw = 0.45 + Math.max(0, 1 - Math.abs(radW)) * 0.85;
    if (chargeDanger) { tw = 1.5; radW = Math.max(radW, 0.35); }
    if (smashDanger || d < 5.0) { radW = 1; tw = 0.7; }
    mv = V.norm(V.add(V.scale(away, radW * 1.35), V.scale(tang, tw)));
  }

  // wall repulsion
  const m = 5.0;
  let px = 0, pz = 0;
  if (me.x > H - m) px -= (me.x - (H - m)) / m;
  if (me.x < -H + m) px += ((-H + m) - me.x) / m;
  if (me.z > H - m) pz -= (me.z - (H - m)) / m;
  if (me.z < -H + m) pz += ((-H + m) - me.z) / m;
  if (px !== 0 || pz !== 0) mv = V.norm(V.add(mv, V.scale({ x: px, z: pz }, 1.4)));

  mv = avoidDir(p, api, mv);
  if (V.len(mv) < 0.001) mv = away;
  api.move(mv.x, mv.z);

  // ---- facing -------------------------------------------------------------
  if (me.casting && me.casting.skill === 'laser' && me.casting.telegraph) {
    const lp = predict(en, Math.max(0, me.casting.remaining));
    api.faceAt(lp.x, lp.z);
  } else if (fired) {
    const lp = predict(en, 0.667);
    api.faceAt(lp.x, lp.z);
  } else if (en.visible || d < 13) {
    api.faceAt(en.x, en.z);
  } else {
    api.face(mv.x, mv.z);
  }
}

let strafeSign = 1;
let lastCharge = -99;
let lastSmash = -99;
let lastBlink = -99;
let lastFlip = -99;

function predict(en, t) {
  const f = en.airborne ? 1.0 : 0.85;
  const tt = Math.min(t, 0.8);
  let x = en.x + en.vx * tt * f;
  let z = en.z + en.vz * tt * f;
  x = Math.max(-19.5, Math.min(19.5, x));
  z = Math.max(-19.5, Math.min(19.5, z));
  return { x, z };
}

function inObs(p, x, z, m) {
  for (const o of p.arena.obstacles) {
    if (Math.abs(x - o.x) < o.hx + m && Math.abs(z - o.z) < o.hz + m) return true;
  }
  return false;
}

function avoidDir(p, api, dir) {
  const probe = 2.7;
  const clear = (v) => {
    const r = api.ray(v.x, v.z, probe);
    if (!r) return true;
    if (r.hit === false || r.hit === null || r.hit === undefined) return true;
    return r.dist > probe - 0.35;
  };
  if (clear(dir)) return dir;
  const offs = [0.45, -0.45, 0.9, -0.9, 1.35, -1.35, 1.9, -1.9, 2.4, -2.4, Math.PI];
  for (const o of offs) {
    const nd = V.rot(dir, o);
    if (clear(nd)) {
      if (Math.abs(o) > 1.3 && p.t - lastFlip > 0.7) { strafeSign = -strafeSign; lastFlip = p.t; }
      return nd;
    }
  }
  return dir;
}

function bestBlink(p, api, avoidLine) {
  const me = p.self, en = p.enemy;
  let best = V.away(me, en), bestScore = -1e9;
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8;
    const dir = { x: Math.sin(a), z: Math.cos(a) };
    let lx = me.x + dir.x * 7.3;
    let lz = me.z + dir.z * 7.3;
    const cx = Math.max(-18.6, Math.min(18.6, lx));
    const cz = Math.max(-18.6, Math.min(18.6, lz));
    let s = -1.6 * (Math.abs(cx - lx) + Math.abs(cz - lz));
    lx = cx; lz = cz;
    if (inObs(p, lx, lz, 1.15)) s -= 6;
    s += Math.min(V.dist({ x: lx, z: lz }, en), 16);
    s -= 0.3 * Math.max(0, Math.hypot(lx, lz) - 13);
    if (avoidLine) {
      const rx = lx - en.x, rz = lz - en.z;
      const along = rx * avoidLine.x + rz * avoidLine.z;
      const lat = Math.abs(rx * avoidLine.z - rz * avoidLine.x);
      if (along > -2 && along < 15 && lat < 4.0) s -= 14;
      s += Math.min(lat, 7) * 0.8;
    }
    if (s > bestScore) { bestScore = s; best = dir; }
  }
  return best;
}
