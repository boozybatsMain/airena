const ARENA_HALF = 20;
let prevDir = { x: 0, z: 1 };
let strafe = 1;
let strafeFlipT = 0;
let ecd = { smash: 0, charge: 0, jump: 0 };
let saidOnce = false;

function segAABB(x0, z0, x1, z1, minx, minz, maxx, maxz) {
  const dx = x1 - x0, dz = z1 - z0;
  let t0 = 0, t1 = 1;
  const ps = [-dx, dx, -dz, dz];
  const qs = [x0 - minx, maxx - x0, z0 - minz, maxz - z0];
  for (let i = 0; i < 4; i++) {
    const P = ps[i], Q = qs[i];
    if (P === 0) { if (Q < 0) return false; }
    else {
      const r = Q / P;
      if (P < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
      else { if (r < t0) return false; if (r < t1) t1 = r; }
    }
  }
  return true;
}

function blockedSeg(ax, az, bx, bz, obs, pad) {
  if (!obs) return false;
  for (let i = 0; i < obs.length; i++) {
    const o = obs[i];
    if (segAABB(ax, az, bx, bz, o.x - o.hx - pad, o.z - o.hz - pad, o.x + o.hx + pad, o.z + o.hz + pad)) return true;
  }
  return false;
}

function inBlock(x, z, obs, pad) {
  if (!obs) return false;
  for (const o of obs) if (Math.abs(x - o.x) < o.hx + pad && Math.abs(z - o.z) < o.hz + pad) return true;
  return false;
}

function blinkScore(me, en, dir, obs) {
  const d = 7.5;
  const lx = me.x + dir.x * d, lz = me.z + dir.z * d;
  let s = 0;
  const cl = ARENA_HALF - Math.max(Math.abs(lx), Math.abs(lz));
  s += Math.min(cl, 6) * 1.1;
  s += Math.min(Math.hypot(lx - en.x, lz - en.z), 17) * 0.9;
  if (inBlock(lx, lz, obs, 1.3)) s -= 5;
  return s;
}

function bestOf(me, en, obs, cands) {
  let bd = null, bs = -Infinity;
  for (const c of cands) {
    const n = V.norm(c);
    if (n.x === 0 && n.z === 0) continue;
    const s = blinkScore(me, en, n, obs);
    if (s > bs) { bs = s; bd = n; }
  }
  return bd;
}

function think(p, api) {
  const me = p.self, en = p.enemy;
  const obs = p.arena && p.arena.obstacles ? p.arena.obstacles : [];
  const t = p.t;
  if (!me || !en || !me.alive || !en.alive) return;

  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      if (e.skill === 'smash') ecd.smash = t + 1.3;
      else if (e.skill === 'charge') ecd.charge = t + 4.033;
      else if (e.skill === 'jump') ecd.jump = t + 2.8;
    } else if (e.type === 'blocked') {
      strafe = -strafe; strafeFlipT = t;
    }
  }
  if (t - strafeFlipT > 3.2) { strafe = -strafe; strafeFlipT = t; }

  const ec = en.casting;
  if (ec) {
    const el = ec.elapsed || 0;
    if (ec.skill === 'charge') ecd.charge = Math.max(ecd.charge, t - el + 4.033);
    else if (ec.skill === 'smash') ecd.smash = Math.max(ecd.smash, t - el + 1.3);
    else if (ec.skill === 'jump') ecd.jump = Math.max(ecd.jump, t - el + 2.8);
  }
  const chargeIn = Math.max(0, ecd.charge - t);
  const smashIn = Math.max(0, ecd.smash - t);

  const mePos = { x: me.x, z: me.z };
  const dist = en.dist;
  const toEn = V.toward(mePos, en);
  const away = V.scale(toEn, -1);
  const enDir = V.fromHeading(en.heading);

  // ---- aiming (lead the beam's fire instant)
  const castLeft = (me.casting && me.casting.skill === 'laser') ? me.casting.remaining : 0.667;
  const lead = Math.min(Math.max(castLeft, 0), 0.7);
  let faceVec = { x: en.x + en.vx * lead * 0.85 - me.x, z: en.z + en.vz * lead * 0.85 - me.z };
  if (V.len(faceVec) < 1e-4) faceVec = toEn;

  let skill = null;
  let moveVec = null;

  // ---- threat clocks
  let tSmash, tCharge;
  if (ec && ec.skill === 'smash' && ec.telegraph) {
    tSmash = ec.remaining + Math.max(0, dist - 5.6) / 5.35;
  } else {
    tSmash = smashIn + 0.3 + Math.max(0, dist - 5.15) / 5.35;
  }
  if (ec && ec.skill === 'charge') {
    const rem = ec.phase === 'windup' ? ec.remaining : 0;
    tCharge = rem + Math.max(0, dist - 2.25) / 15;
  } else {
    tCharge = chargeIn + 0.3 + Math.max(0, dist - 2.25) / 15;
  }
  if (ec && ec.phase === 'recover') { tSmash += ec.remaining; tCharge += ec.remaining; }
  if (en.stunned) { tSmash += 0.4; tCharge += 0.4; }
  if (en.airborne) { tSmash += 0.3; tCharge += 0.3; }

  // ---- charge dodge
  let chargeDanger = false;
  let dodgeDir = null;
  if (ec && ec.skill === 'charge') {
    const rel = { x: me.x - en.x, z: me.z - en.z };
    const along = rel.x * enDir.x + rel.z * enDir.z;
    const cross = rel.x * enDir.z - rel.z * enDir.x;
    const latD = Math.abs(cross);
    if (along > -1.5 && latD < 3.6 && dist < 15.5) {
      chargeDanger = true;
      const s1 = cross >= 0 ? 1 : -1;
      const pA = { x: enDir.z * s1, z: -enDir.x * s1 };
      const pB = { x: -pA.x, z: -pA.z };
      dodgeDir = bestOf(me, en, obs, [
        V.add(pA, V.scale(away, 0.35)),
        V.add(pB, V.scale(away, 0.35)),
        V.add(pA, V.scale(away, -0.15)),
        V.add(pB, V.scale(away, -0.15))
      ]) || pA;
    }
  }

  if (chargeDanger && (ec.phase === 'dash' || (ec.phase === 'windup' && ec.remaining < 0.10))) {
    moveVec = dodgeDir;
    if (!me.busy && !me.airborne && !me.stunned && api.ready('blink')) {
      skill = ['blink', dodgeDir.x, dodgeDir.z];
    }
  }

  // ---- smash dodge
  const smashing = ec && ec.skill === 'smash' && ec.telegraph;
  if (!skill && smashing && dist < 6.0 && !me.airborne && !me.stunned) {
    const esc = bestOf(me, en, obs, [
      away,
      V.norm(V.add(away, V.scale(V.perp(toEn), 0.8))),
      V.norm(V.add(away, V.scale(V.perp(toEn), -0.8)))
    ]) || away;
    moveVec = esc;
    if (!me.busy) {
      if (dist < 5.5 && api.ready('jump')) skill = ['jump'];
      else if (dist < 5.4 && api.ready('blink')) skill = ['blink', esc.x, esc.z];
    }
  }

  // ---- panic blink when smothered
  if (!skill && !me.busy && !me.airborne && !me.stunned && api.ready('blink') && dist < 3.8 && !chargeDanger) {
    const esc = bestOf(me, en, obs, [
      away,
      V.norm(V.add(away, V.scale(V.perp(toEn), 1.0))),
      V.norm(V.add(away, V.scale(V.perp(toEn), -1.0)))
    ]) || away;
    skill = ['blink', esc.x, esc.z];
    moveVec = esc;
  }

  // ---- laser
  const aimDir = V.norm(faceVec);
  const angErr = Math.abs(V.angleTo(me.heading, aimDir));
  const threatT = Math.min(tSmash, tCharge);
  const safeCast = threatT > 0.78 || en.stunned;

  if (!skill && !me.busy && !me.airborne && !me.stunned && api.ready('laser') &&
      en.visible && dist < 22.0 && dist > 1.8 && angErr < 0.55 && safeCast) {
    skill = ['laser'];
  }

  // ---- blink to open a firing window
  if (!skill && !me.busy && !me.airborne && !me.stunned && api.ready('laser') && api.ready('blink') &&
      !safeCast && dist < 9.5 && !(ec && ec.skill === 'charge')) {
    const esc = bestOf(me, en, obs, [
      away,
      V.norm(V.add(away, V.scale(V.perp(toEn), 0.7))),
      V.norm(V.add(away, V.scale(V.perp(toEn), -0.7)))
    ]);
    if (esc) { skill = ['blink', esc.x, esc.z]; moveVec = moveVec || esc; }
  }

  // ---- kiting
  if (!moveVec) {
    let dPref = chargeIn > 1.6 ? 11.5 : 15.5;
    if (ec && ec.skill === 'charge') dPref = 16.5;
    if (me.hp < me.maxHp * 0.35) dPref += 2;
    if (dist > 26) dPref = 15.0;

    const wantLos = api.cooldown('laser') < 1.1;
    const STEP = 3.0;
    let bestDir = null, bestScore = -Infinity;
    for (let i = 0; i < 24; i++) {
      const a = i * Math.PI * 2 / 24;
      const dir = { x: Math.sin(a), z: Math.cos(a) };
      const cx = me.x + dir.x * STEP, cz = me.z + dir.z * STEP;
      if (Math.abs(cx) > 19.0 || Math.abs(cz) > 19.0) continue;
      if (blockedSeg(me.x, me.z, cx, cz, obs, me.radius + 0.25)) continue;
      let s = 0;
      const dNew = Math.hypot(cx - en.x, cz - en.z);
      s -= Math.abs(dNew - dPref) * 1.3;
      const sees = !blockedSeg(cx, cz, en.x, en.z, obs, 0);
      s += sees ? (wantLos ? 3.0 : 1.2) : (wantLos ? -3.0 : -0.6);
      const edge = ARENA_HALF - Math.max(Math.abs(cx), Math.abs(cz));
      if (edge < 5) s -= (5 - edge) * (5 - edge) * 0.55;
      s += 1.2 * (dir.x * prevDir.x + dir.z * prevDir.z);
      const lat = dir.x * toEn.z - dir.z * toEn.x;
      s += 1.0 * lat * strafe;
      if (chargeIn < 0.6 && dist < 17) s += 0.7 * Math.abs(lat);
      if (s > bestScore) { bestScore = s; bestDir = dir; }
    }
    if (!bestDir) {
      const alt = bestOf(me, en, obs, [away, V.perp(toEn), V.scale(V.perp(toEn), -1), toEn]);
      bestDir = alt || away;
    }
    moveVec = bestDir;
  }

  if (!moveVec || (moveVec.x === 0 && moveVec.z === 0)) moveVec = away;
  prevDir = V.norm(moveVec);

  api.move(moveVec.x, moveVec.z);
  api.face(faceVec.x, faceVec.z);
  if (skill) {
    if (skill.length === 3) api.use(skill[0], skill[1], skill[2]);
    else api.use(skill[0]);
  }
  if (!saidOnce) { saidOnce = true; api.say("eight arms, one beam."); }
}
