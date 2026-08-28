const CD = { smash: 1.3, charge: 4.0, jump: 2.8 };
const LASER_CAST = 0.65;

let strafe = 1;
let lastDir = null;
let lastT = 0;
let ecd = { smash: 0, charge: 0, jump: 0 };
let dodgeUntil = -1;
let dodgePerp = null;
let sayT = -9;
let blockedT = -9;

function clampArena(pt) {
  return { x: Math.max(-19, Math.min(19, pt.x)), z: Math.max(-19, Math.min(19, pt.z)) };
}

function predictEnemy(e, T) {
  let vx = e.vx || 0, vz = e.vz || 0;
  const sp = Math.hypot(vx, vz);
  const dashing = e.casting && e.casting.skill === 'charge' && e.casting.phase === 'dash';
  if (!dashing && sp > 5.5) { vx = vx / sp * 5.5; vz = vz / sp * 5.5; }
  let shx = vx * T, shz = vz * T;
  const m = Math.hypot(shx, shz);
  if (m > 6) { shx = shx / m * 6; shz = shz / m * 6; }
  return clampArena({ x: e.x + shx, z: e.z + shz });
}

function chargeInfo(p) {
  const e = p.enemy, s = p.self;
  const c = e.casting;
  if (!c || c.skill !== 'charge') return null;
  let dir;
  if (c.phase === 'dash') {
    const sp = Math.hypot(e.vx, e.vz);
    dir = sp > 1 ? { x: e.vx / sp, z: e.vz / sp } : V.fromHeading(e.heading);
  } else {
    dir = V.fromHeading(e.heading);
  }
  const rel = { x: s.x - e.x, z: s.z - e.z };
  const along = rel.x * dir.x + rel.z * dir.z;
  const tImp = Math.max(0, (along - 2.25)) / 15;
  const fut = { x: s.x + s.vx * tImp, z: s.z + s.vz * tImp };
  const rel2 = { x: fut.x - e.x, z: fut.z - e.z };
  const along2 = rel2.x * dir.x + rel2.z * dir.z;
  const lat = Math.abs(rel2.x * dir.z - rel2.z * dir.x);
  let side = (rel.x * dir.z - rel.z * dir.x);
  if (Math.abs(side) < 0.15) side = strafe;
  const sign = side >= 0 ? 1 : -1;
  const perp = { x: dir.z * sign, z: -dir.x * sign };
  const danger = along2 > -1 && along2 < 15 && lat < 3.2;
  return { dir, perp, danger, phase: c.phase, along: along2, lat };
}

function chooseMove(p, api, desired, enemyPt) {
  const s = p.self;
  let best = null, bestScore = -1e9;
  for (let i = 0; i < 20; i++) {
    const a = i * Math.PI * 2 / 20;
    const dx = Math.sin(a), dz = Math.cos(a);
    let clear;
    try { clear = api.ray(dx, dz, 5).dist; } catch (err) { clear = 5; }
    if (clear < 1.35) continue;
    const step = Math.min(3, clear - 0.6);
    const nx = s.x + dx * step, nz = s.z + dz * step;
    const nd = Math.hypot(nx - enemyPt.x, nz - enemyPt.z);
    let sc = -Math.abs(nd - desired) * 1.5;
    sc += Math.min(clear, 5) * 0.55;
    const wall = 20 - Math.max(Math.abs(nx), Math.abs(nz));
    sc += Math.min(wall, 7) * 0.6;
    if (lastDir) sc += (dx * lastDir.x + dz * lastDir.z) * 1.1;
    if (sc > bestScore) { bestScore = sc; best = { x: dx, z: dz }; }
  }
  if (!best) {
    const away = V.norm({ x: s.x - enemyPt.x, z: s.z - enemyPt.z });
    best = away.x === 0 && away.z === 0 ? { x: 0, z: 1 } : away;
  }
  lastDir = best;
  return best;
}

function think(p, api) {
  const s = p.self, e = p.enemy;
  if (!s.alive) return;

  const dt = Math.max(0, Math.min(0.5, p.t - lastT));
  lastT = p.t;
  for (const k in ecd) ecd[k] = Math.max(0, ecd[k] - dt);

  for (const ev of p.events) {
    if (ev.type === 'enemyStarted' && CD[ev.skill] != null) ecd[ev.skill] = CD[ev.skill];
    if (ev.type === 'blocked') { strafe = -strafe; blockedT = p.t; }
    if (ev.type === 'contact') { /* too close */ }
  }

  const dist = e.dist != null ? e.dist : V.dist(s, e);
  const myFrac = s.hp / s.maxHp;
  const hisFrac = e.hp / e.maxHp;
  const ahead = p.t > 26.5 && myFrac > hisFrac + 0.03;

  // ---------- aiming ----------
  const casting = s.casting;
  const isCastingLaser = casting && casting.skill === 'laser' && casting.telegraph;
  let aimT = 0.12;
  if (isCastingLaser) aimT = Math.max(0, casting.remaining);
  else if (api.cooldown('laser') < 0.35) aimT = LASER_CAST;
  const aimPt = predictEnemy(e, aimT);
  api.faceAt(aimPt.x, aimPt.z);

  // ---------- charge threat ----------
  const ci = chargeInfo(p);
  let dodging = false;

  if (ci && ci.danger) {
    dodging = true;
    dodgePerp = ci.perp;
    dodgeUntil = p.t + 0.55;
    if (ci.phase === 'dash' && !s.invulnerable && api.ready('blink')) {
      // pick the roomier side
      let d1 = 8, d2 = 8;
      try { d1 = api.ray(ci.perp.x, ci.perp.z, 8).dist; } catch (err) {}
      try { d2 = api.ray(-ci.perp.x, -ci.perp.z, 8).dist; } catch (err) {}
      let bd = ci.perp;
      if (d2 > d1 + 3.5) bd = { x: -ci.perp.x, z: -ci.perp.z };
      const back = V.norm({ x: -ci.dir.x, z: -ci.dir.z });
      const bx = bd.x * 1.0 + back.x * 0.25;
      const bz = bd.z * 1.0 + back.z * 0.25;
      api.use('blink', bx, bz);
      api.move(bd.x, bd.z);
      lastDir = bd;
      if (p.t - sayT > 3) { sayT = p.t; api.say("not there"); }
      return;
    }
    const mv = { x: ci.perp.x * 1.0 - ci.dir.x * 0.35, z: ci.perp.z * 1.0 - ci.dir.z * 0.35 };
    const n = V.norm(mv);
    api.move(n.x, n.z);
    lastDir = n;
    return;
  }

  if (p.t < dodgeUntil && dodgePerp) {
    api.move(dodgePerp.x, dodgePerp.z);
    lastDir = dodgePerp;
    if (!(s.busy)) {
      // keep dodging, no cast
    }
    return;
  }

  // ---------- smash dodge ----------
  const eSmash = e.casting && e.casting.skill === 'smash' && e.casting.telegraph;
  if (eSmash && dist < 6.1 && !s.airborne && !s.busy) {
    const away = V.norm({ x: s.x - e.x, z: s.z - e.z });
    api.move(away.x, away.z);
    lastDir = away;
    if (dist < 5.4 && api.ready('jump')) {
      api.use('jump');
      return;
    }
    return;
  }

  // ---------- panic blink ----------
  if (!s.busy && dist < 4.3 && api.ready('blink') && ecd.charge > 1.1) {
    const away = V.norm({ x: s.x - e.x, z: s.z - e.z });
    const towardC = V.norm({ x: -s.x, z: -s.z });
    let bx = away.x * 1.0 + towardC.x * 0.5;
    let bz = away.z * 1.0 + towardC.z * 0.5;
    api.use('blink', bx, bz);
    api.move(away.x, away.z);
    lastDir = away;
    return;
  }

  // ---------- desired spacing ----------
  const chargeReady = ecd.charge < 0.7;
  let desired;
  if (ahead) desired = 16;
  else if (chargeReady) desired = 12.5;
  else desired = 8.6;
  if (dist < 5.6) desired = Math.max(desired, 13);
  if (isCastingLaser) desired += 2.5;

  // ---------- movement ----------
  if (!e.visible) {
    const path = api.pathTo(e.x, e.z);
    if (path && !path.direct) {
      api.moveTo(e.x, e.z);
      lastDir = V.toward(s, e);
    } else {
      const dir = chooseMove(p, api, Math.min(desired, Math.max(4, dist - 2)), e);
      api.move(dir.x, dir.z);
    }
  } else {
    const dir = chooseMove(p, api, desired, e);
    api.move(dir.x, dir.z);
  }

  // ---------- laser ----------
  if (s.busy || s.airborne || s.stunned) return;
  if (!api.ready('laser')) return;
  if (!e.visible || e.airborne || e.invulnerable) return;
  if (e.casting && e.casting.skill === 'charge') return;
  if (dist > 21.5) return;

  const safeClose = e.stunned || (e.casting && e.casting.phase === 'recover');
  let minFire = 7.0;
  if (ahead) minFire = 11.0;
  if (safeClose) minFire = 2.5;
  if (dist < minFire) return;

  // don't fire straight into a block edge: check line to predicted point
  const pt = predictEnemy(e, LASER_CAST);
  const toPt = V.toward(s, pt);
  if (!api.los(pt.x, pt.z) && !api.los(e.x, e.z)) return;

  api.use('laser');
  if (p.t - sayT > 5) { sayT = p.t; api.say("hold still, ape"); }
}
