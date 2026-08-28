function think(p, api) {
  const s = p.self, e = p.enemy;
  if (!s || !e || !s.alive) return;

  const me = { x: s.x, z: s.z }, en = { x: e.x, z: e.z };
  const dist = e.dist != null ? e.dist : V.dist(me, en);

  // ---------- digest events ----------
  for (const ev of p.events || []) {
    if (ev.type === 'enemyStarted') {
      if (ev.skill === 'charge') { chargeReadyAt = p.t + 4.05; chargeSeenT = p.t; chargeDir = null; }
      else if (ev.skill === 'smash') smashReadyAt = p.t + 1.32;
      else if (ev.skill === 'jump') enemyJumpT = p.t;
    } else if (ev.type === 'enemyCommitted') {
      chargeDir = V.fromHeading(e.heading); chargeSeenT = p.t;
    } else if (ev.type === 'blocked') {
      if (p.t - lastFlip > 0.8) { strafe = -strafe; lastFlip = p.t; }
    } else if (ev.type === 'damaged') {
      if (ev.skill === 'charge') { chargeReadyAt = Math.max(chargeReadyAt, p.t + 3.9); }
      if (ev.skill === 'smash') smashReadyAt = p.t + 1.32;
    } else if (ev.type === 'interrupted') {
      lastInterruptT = p.t;
    }
  }
  if (p.t < 0.3) { chargeReadyAt = Math.max(chargeReadyAt, 0); }

  const chargeCd = Math.max(0, chargeReadyAt - p.t);
  const smashCd = Math.max(0, smashReadyAt - p.t);

  // ---------- basic frames ----------
  const away = safeNorm(V.sub(me, en));
  const toE = V.scale(away, -1);

  // pick strafe side with more room (hysteresis)
  const pA = V.perp(away);
  const rA = api.ray(pA.x, pA.z, 7);
  const rB = api.ray(-pA.x, -pA.z, 7);
  const dA = rA.hit ? rA.dist : 7, dB = rB.hit ? rB.dist : 7;
  if (p.t - lastFlip > 0.5) {
    if (strafe > 0 && dB > dA + 2.5) { strafe = -1; lastFlip = p.t; }
    else if (strafe < 0 && dA > dB + 2.5) { strafe = 1; lastFlip = p.t; }
  }
  const tang = V.scale(pA, strafe);

  let desired = null;
  let faceAtPt = null;
  let acted = false;

  // ---------- aim prediction ----------
  const aim = aimPoint(p);

  // ---------- 0. locked out ----------
  if (s.airborne || s.stunned) {
    api.faceAt(aim.x, aim.z);
    return;
  }

  // ---------- 1. charge dodge ----------
  const chargingNow = e.casting && e.casting.skill === 'charge';
  const recentCharge = chargeDir && (p.t - chargeSeenT) < 1.0;
  if (chargingNow || recentCharge) {
    let cdir;
    if (e.casting && e.casting.phase === 'dash') cdir = V.fromHeading(e.heading);
    else if (chargeDir) cdir = chargeDir;
    else cdir = V.norm(V.add(toE.x || toE.z ? V.scale(toE, -1) : toE, { x: 0, z: 0 })) , cdir = V.fromHeading(e.heading);
    cdir = safeNorm(cdir);
    const rel = V.sub(me, en);
    const along = V.dot(rel, cdir);
    const latV = V.sub(rel, V.scale(cdir, along));
    const latL = V.len(latV);
    const side = latL > 0.3 ? V.norm(latV) : V.perp(cdir);
    const danger = along > -2 && along < 15 && latL < 3.6;
    if (danger) {
      if (!s.busy && api.ready('blink')) {
        const b = bestBlink(p, api, cdir, en);
        api.use('blink', b.x, b.z);
        api.faceAt(aim.x, aim.z);
        api.move(side.x, side.z);
        return;
      }
      desired = V.add(V.scale(side, 1.4), V.scale(away, 0.5));
      acted = true;
    }
  }

  // ---------- 2. smash dodge ----------
  if (!acted && e.casting && e.casting.skill === 'smash' && e.casting.telegraph && dist < 7.0) {
    if (!s.busy && api.ready('jump') && !s.airborne) {
      api.use('jump');
      api.move(away.x, away.z);
      api.faceAt(aim.x, aim.z);
      return;
    }
    if (!s.busy && api.ready('blink')) {
      const b = bestBlink(p, api, null, en);
      api.use('blink', b.x, b.z);
      api.faceAt(aim.x, aim.z);
      api.move(away.x, away.z);
      return;
    }
    desired = V.add(V.scale(away, 1.5), V.scale(tang, 0.7));
    acted = true;
  }

  // ---------- 3. panic reset ----------
  if (!acted && !s.busy && dist < 6.0 && api.ready('blink')) {
    const b = bestBlink(p, api, null, en);
    api.use('blink', b.x, b.z);
    api.faceAt(aim.x, aim.z);
    api.move(away.x, away.z);
    return;
  }

  // ---------- 4. laser ----------
  const meleeSafe = dist > 8.6 || e.stunned || e.airborne;
  const chargeSafe = chargeCd > 0.85 || dist > 14.6 || e.stunned ||
    (e.casting && e.casting.skill === 'charge' && e.casting.phase === 'dash' &&
      Math.abs(V.angleTo(e.heading, V.toward(en, me))) > 0.6);
  if (!acted && !s.busy && !s.airborne && api.ready('laser') && e.visible &&
      dist > 2.0 && dist < 20.5 && meleeSafe && chargeSafe && api.los(aim.x, aim.z)) {
    api.use('laser');
    shotsFired++;
  }

  // ---------- 5. kite ----------
  if (!acted) {
    let ideal = chargeCd > 1.2 ? 10.5 : 15.5;
    if (!e.visible) ideal = Math.min(ideal, 11.5);
    if (s.casting && s.casting.skill === 'laser') ideal += 1.5;

    let w;
    if (dist < ideal - 1.5) w = V.add(V.scale(away, 1.35), V.scale(tang, 0.85));
    else if (dist > ideal + 2.5) w = V.add(V.scale(toE, 0.95), V.scale(tang, 0.55));
    else w = V.add(V.scale(tang, 1.0), V.scale(away, 0.3));

    if (!e.visible && api.cooldown('laser') < 0.6) {
      w = V.add(w, V.scale(tang, 0.6));
      w = V.add(w, V.scale(toE, 0.25));
    }
    desired = w;
  }

  // repulsion from walls and blocks
  desired = V.add(desired || away, repulse(p, me));

  const dirOut = pickDir(api, desired);
  api.move(dirOut.x, dirOut.z);
  api.faceAt(aim.x, aim.z);

  if (p.t - saidT > 9) {
    saidT = p.t;
    api.say(shotsFired > 0 ? `beams: ${shotsFired}` : 'eight arms, one beam');
  }
}

// ------------- state -------------
let strafe = 1;
let lastFlip = -9;
let chargeReadyAt = 0;
let smashReadyAt = 0;
let chargeDir = null;
let chargeSeenT = -9;
let enemyJumpT = -9;
let lastInterruptT = -9;
let saidT = -9;
let shotsFired = 0;

// ------------- helpers -------------
function safeNorm(v) {
  const L = Math.hypot(v.x, v.z);
  if (L < 1e-6) return { x: 0, z: 1 };
  return { x: v.x / L, z: v.z / L };
}

function aimPoint(p) {
  const s = p.self, e = p.enemy;
  let tRem = 0.5;
  if (s.casting && s.casting.skill === 'laser') {
    tRem = (s.casting.phase === 'windup' && s.casting.remaining != null)
      ? Math.max(0, s.casting.remaining) : 0.05;
  } else {
    tRem = 0.72;
  }
  let k = 0.6;
  if (e.casting && e.casting.skill === 'charge' && e.casting.phase === 'dash') k = 1.0;
  if (e.stunned) k = 0.2;
  const t = Math.min(tRem, 0.75);
  return { x: e.x + (e.vx || 0) * t * k, z: e.z + (e.vz || 0) * t * k };
}

function repulse(p, me) {
  let r = { x: 0, z: 0 };
  const h = p.arena.half, m = 5.0;
  if (me.x > h - m) r.x -= ((me.x - (h - m)) / m) * 2.2;
  if (me.x < -h + m) r.x += (((-h + m) - me.x) / m) * 2.2;
  if (me.z > h - m) r.z -= ((me.z - (h - m)) / m) * 2.2;
  if (me.z < -h + m) r.z += (((-h + m) - me.z) / m) * 2.2;
  for (const o of p.arena.obstacles) {
    const cx = Math.max(o.x - o.hx, Math.min(me.x, o.x + o.hx));
    const cz = Math.max(o.z - o.hz, Math.min(me.z, o.z + o.hz));
    const dx = me.x - cx, dz = me.z - cz;
    const L = Math.hypot(dx, dz);
    if (L < 3.0) {
      const w = (3.0 - L) / 3.0;
      const n = L > 1e-4 ? { x: dx / L, z: dz / L } : { x: 1, z: 0 };
      r = V.add(r, V.scale(n, w * 1.5));
    }
  }
  return r;
}

function pickDir(api, desired) {
  const d0 = safeNorm(desired);
  const base = Math.atan2(d0.x, d0.z);
  const offs = [0, 0.35, -0.35, 0.7, -0.7, 1.05, -1.05, 1.4, -1.4, 1.8, -1.8, 2.3, -2.3, 3.14];
  for (const o of offs) {
    const h = base + o;
    const d = { x: Math.sin(h), z: Math.cos(h) };
    const r = api.ray(d.x, d.z, 3.0);
    if (!r.hit || r.dist > 2.1) return d;
  }
  return d0;
}

function insideBox(pt, o, m) {
  return Math.abs(pt.x - o.x) < o.hx + m && Math.abs(pt.z - o.z) < o.hz + m;
}

function bestBlink(p, api, chargeDirVec, en) {
  const s = p.self;
  const lim = p.arena.half - 1.4;
  let best = null, bs = -1e9;
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8;
    const d = { x: Math.sin(a), z: Math.cos(a) };
    let lx = s.x + d.x * 7.5, lz = s.z + d.z * 7.5;
    lx = Math.max(-lim, Math.min(lim, lx));
    lz = Math.max(-lim, Math.min(lim, lz));
    const land = { x: lx, z: lz };
    let bad = false;
    for (const o of p.arena.obstacles) if (insideBox(land, o, 1.25)) { bad = true; break; }
    if (bad) continue;
    let sc = V.dist(land, en) * 1.0;
    sc -= Math.hypot(land.x, land.z) * 0.32;
    if (chargeDirVec) {
      const rel = V.sub(land, en);
      const along = V.dot(rel, chargeDirVec);
      const lat = Math.abs(rel.x * chargeDirVec.z - rel.z * chargeDirVec.x);
      if (along > -2 && along < 15 && lat < 4.0) sc -= (4.0 - lat) * 5.0;
    }
    if (sc > bs) { bs = sc; best = d; }
  }
  if (!best) {
    const aw = safeNorm(V.sub({ x: s.x, z: s.z }, en));
    return aw;
  }
  return best;
}
