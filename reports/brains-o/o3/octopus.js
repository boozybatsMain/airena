const CHARGE_CD = 4.033;
const SMASH_CD = 1.3;

let lastCharge = -99;
let lastSmash = -99;
let prevDir = { x: 0, z: 1 };
let saidOnce = false;

function wallMargin(x, z) {
  return 20 - Math.max(Math.abs(x), Math.abs(z));
}

function blockPenalty(obs, x, z, m) {
  let pen = 0;
  for (const o of obs) {
    const dx = Math.abs(x - o.x) - o.hx;
    const dz = Math.abs(z - o.z) - o.hz;
    const d = Math.max(dx, dz);
    if (d < m) pen += (m - d) * 2;
  }
  return pen;
}

function bestBlinkDir(p, pref) {
  const me = p.self, en = p.enemy;
  let best = null, bs = -1e9;
  for (let k = 0; k < 16; k++) {
    const a = k * Math.PI / 8;
    const d = { x: Math.sin(a), z: Math.cos(a) };
    const lp = { x: me.x + d.x * 7.3, z: me.z + d.z * 7.3 };
    let s = 0;
    const cx = Math.max(-19.0, Math.min(19.0, lp.x));
    const cz = Math.max(-19.0, Math.min(19.0, lp.z));
    s -= (Math.abs(lp.x - cx) + Math.abs(lp.z - cz)) * 2.5;
    s += Math.hypot(cx - en.x, cz - en.z) * 1.0;
    s += V.dot(d, pref) * 4.5;
    s -= blockPenalty(p.arena.obstacles, cx, cz, 1.8) * 2.0;
    const wm = wallMargin(cx, cz);
    if (wm < 3.5) s -= (3.5 - wm) * 3.0;
    if (s > bs) { bs = s; best = d; }
  }
  return best || pref;
}

function pickMoveDir(p, api, desired, biasDir, biasW, avoidTowardEnemy) {
  const me = p.self, en = p.enemy;
  const obs = p.arena.obstacles;
  const toEn = V.toward(me, en);
  let bestDir = prevDir, bestScore = -1e9;
  for (let k = 0; k < 24; k++) {
    const a = k * Math.PI / 12;
    const d = { x: Math.sin(a), z: Math.cos(a) };
    let r;
    try { r = api.ray(d.x, d.z, 5.0); } catch (e) { r = { dist: 5.0 }; }
    const step = Math.min(r.dist - 1.05, 3.2);
    if (step < 0.4) continue;
    const fx = me.x + d.x * step, fz = me.z + d.z * step;
    const fd = Math.hypot(fx - en.x, fz - en.z);
    let s = -Math.abs(fd - desired) * 1.2;
    s += Math.min(r.dist, 5) * 0.4;
    const wm = wallMargin(fx, fz);
    if (wm < 4.5) s -= (4.5 - wm) * 1.8;
    s -= blockPenalty(obs, fx, fz, 1.4) * 0.8;
    s += V.dot(d, prevDir) * 0.9;
    if (biasDir && biasW) s += V.dot(d, biasDir) * biasW;
    if (avoidTowardEnemy) s -= Math.max(0, V.dot(d, toEn)) * 2.5;
    if (s > bestScore) { bestScore = s; bestDir = d; }
  }
  prevDir = bestDir;
  return bestDir;
}

function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive) return;

  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      if (e.skill === 'charge') lastCharge = p.t;
      else if (e.skill === 'smash') lastSmash = p.t;
    }
  }

  if (!saidOnce) { saidOnce = true; api.say("eight arms, one beam"); }

  const dist = en.dist;
  const toEn = V.toward(me, en);
  const awayEn = { x: -toEn.x, z: -toEn.z };
  const canAct = !me.busy && !me.stunned && !me.airborne;

  // ---- aim point for the beam ----
  const castLeft = (me.casting && me.casting.skill === 'laser') ? me.casting.remaining : 0.667;
  const aim = { x: en.x + en.vx * castLeft * 0.75, z: en.z + en.vz * castLeft * 0.75 };
  const aimDir = V.norm({ x: aim.x - me.x, z: aim.z - me.z });

  // ---- charge state ----
  const cast = en.casting;
  const chargeWind = cast && cast.skill === 'charge' && cast.phase === 'windup';
  const chargeDash = (cast && cast.skill === 'charge' && (cast.phase === 'dash')) || (en.speed > 9.5);
  const smashTele = cast && cast.skill === 'smash' && cast.telegraph;

  // ================= EMERGENCY: incoming dash =================
  if (chargeDash) {
    let dd;
    if (en.speed > 6) dd = { x: en.vx / en.speed, z: en.vz / en.speed };
    else dd = V.fromHeading(en.heading);
    const rx = me.x - en.x, rz = me.z - en.z;
    const along = rx * dd.x + rz * dd.z;
    const cross = rx * dd.z - rz * dd.x;
    if (along > -1.5 && along < 15 && Math.abs(cross) < 3.2) {
      const s = cross >= 0 ? 1 : -1;
      let perp = { x: dd.z * s, z: -dd.x * s };
      const lp = { x: me.x + perp.x * 4.5, z: me.z + perp.z * 4.5 };
      if (Math.abs(lp.x) > 19 || Math.abs(lp.z) > 19) perp = { x: -perp.x, z: -perp.z };
      api.move(perp.x, perp.z);
      api.faceAt(aim.x, aim.z);
      if (canAct && api.ready('blink') && Math.abs(cross) < 2.6 && along > 0.0) {
        const bd = bestBlinkDir(p, perp);
        api.use('blink', bd.x, bd.z);
      }
      prevDir = perp;
      return;
    }
  }

  // ================= EMERGENCY: smash about to land =================
  if (smashTele && dist < 6.6) {
    const s = ((me.x - en.x) * Math.sin(en.heading + Math.PI / 2) >= 0) ? 1 : -1;
    const perp = { x: toEn.z * s, z: -toEn.x * s };
    const esc = V.norm({ x: awayEn.x * 1.2 + perp.x * 0.8, z: awayEn.z * 1.2 + perp.z * 0.8 });
    api.move(esc.x, esc.z);
    api.faceAt(aim.x, aim.z);
    prevDir = esc;
    if (canAct) {
      if (api.ready('blink')) {
        const bd = bestBlinkDir(p, esc);
        api.use('blink', bd.x, bd.z);
      } else if (api.ready('jump') && cast.remaining <= 0.28) {
        api.use('jump');
      }
    }
    return;
  }

  // ================= charge wind-up: strafe hard =================
  if (chargeWind && dist < 16) {
    const s = (api.rand() < 0.5 && p.tick % 2 === 0) ? 1 : 1;
    let perp = { x: toEn.z, z: -toEn.x };
    const lp1 = { x: me.x + perp.x * 5, z: me.z + perp.z * 5 };
    const lp2 = { x: me.x - perp.x * 5, z: me.z - perp.z * 5 };
    const sc1 = wallMargin(lp1.x, lp1.z) - blockPenalty(p.arena.obstacles, lp1.x, lp1.z, 1.4);
    const sc2 = wallMargin(lp2.x, lp2.z) - blockPenalty(p.arena.obstacles, lp2.x, lp2.z, 1.4);
    if (sc2 > sc1) perp = { x: -perp.x, z: -perp.z };
    const mv = V.norm({ x: perp.x * 1.0 + awayEn.x * 0.45, z: perp.z * 1.0 + awayEn.z * 0.45 });
    api.move(mv.x, mv.z);
    api.faceAt(aim.x, aim.z);
    prevDir = mv;
    return;
  }

  // ================= normal fighting =================
  const hpF = me.hp / me.maxHp, ehpF = en.hp / en.maxHp;
  let desired = 12.5;
  if (p.burn > 0 && hpF > ehpF + 0.03) desired = 15.5;
  if (dist > 21) desired = 12.0;
  if (me.casting && me.casting.skill === 'laser') desired = Math.max(desired, dist + 1.5);

  let biasDir = null, biasW = 0;
  if (!en.visible) {
    const path = api.pathTo(en.x, en.z);
    if (path && path.points && path.points.length) {
      const wp = path.points[0];
      const dv = { x: wp.x - me.x, z: wp.z - me.z };
      if (V.len(dv) > 0.6) { biasDir = V.norm(dv); biasW = dist > 9 ? 2.6 : 1.0; }
    }
    if (dist > 12) desired = Math.min(desired, 10.5);
  }

  const mv = pickMoveDir(p, api, desired, biasDir, biasW, dist < 8.5);
  api.move(mv.x, mv.z);
  api.faceAt(aim.x, aim.z);

  if (!canAct) return;

  // escape blink when the ape is on top of us
  if (dist < 6.8 && api.ready('blink')) {
    const pref = V.norm({ x: awayEn.x * 1.0 + mv.x * 0.9, z: awayEn.z * 1.0 + mv.z * 0.9 });
    const bd = bestBlinkDir(p, pref);
    api.use('blink', bd.x, bd.z);
    return;
  }

  // fire
  const enHelpless = en.stunned || (en.casting && en.casting.phase === 'recover');
  const minD = enHelpless ? 3.0 : 6.2;
  const angErr = Math.abs(V.angleTo(me.heading, aimDir));
  if (api.ready('laser') && en.visible && dist >= minD && dist <= 22.5 &&
      angErr < 1.05 && !chargeWind && !chargeDash && api.los(aim.x, aim.z)) {
    api.use('laser');
  }
}
