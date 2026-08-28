const CHARGE_CD = 4.0, SMASH_CD = 1.3, JUMP_CD = 2.8;
const LASER_CAST = 0.65;

let eReady = { charge: 0, smash: 0, jump: 0 };
let orbitSign = 1;
let lastFlip = -9;
let lastSay = -9;

function clampArena(pt) {
  return { x: Math.max(-19, Math.min(19, pt.x)), z: Math.max(-19, Math.min(19, pt.z)) };
}

function predict(p, api, tRem) {
  const e = p.enemy;
  let f = 0.8;
  if (e.casting && e.casting.skill === 'charge' && e.casting.phase === 'dash') f = 1.0;
  else if (e.casting && e.casting.skill === 'smash') f = 0.25;
  else if (e.stunned) f = 0.2;
  let pt = clampArena({ x: e.x + e.vx * tRem * f, z: e.z + e.vz * tRem * f });
  if (!api.los(pt.x, pt.z)) pt = { x: e.x, z: e.z };
  return pt;
}

function pickRetreat(p, api) {
  const me = p.self, e = p.enemy;
  const away = V.away(me, e);
  let best = null;
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8;
    const d = { x: Math.sin(a), z: Math.cos(a) };
    let clear = 7;
    try { const r = api.ray(d.x, d.z, 7); clear = Math.min(r.dist, 7); } catch (err) { clear = 7; }
    if (clear < 1.8) continue;
    const step = Math.min(clear - 0.6, 4.5);
    const cand = { x: me.x + d.x * step, z: me.z + d.z * step };
    const de = V.dist(cand, e);
    const wall = 20 - Math.max(Math.abs(cand.x), Math.abs(cand.z));
    let s = V.dot(d, away) * 3.2 + clear * 0.55 + Math.min(de, 16) * 0.45 + Math.min(wall, 7) * 0.8;
    if (!best || s > best.s) best = { s, d };
  }
  return best ? best.d : away;
}

function approachDir(p, api) {
  const me = p.self, e = p.enemy;
  let path = null;
  try { path = api.pathTo(e.x, e.z); } catch (err) { path = null; }
  if (path && path.points && path.points.length) {
    let wp = path.points[0];
    if (V.dist(me, wp) < 0.8 && path.points.length > 1) wp = path.points[1];
    return V.norm({ x: wp.x - me.x, z: wp.z - me.z });
  }
  return V.toward(me, e);
}

function wallBias(me, dir) {
  let bx = 0, bz = 0;
  if (me.x > 16.5) bx -= (me.x - 16.5) * 0.5;
  if (me.x < -16.5) bx += (-16.5 - me.x) * 0.5;
  if (me.z > 16.5) bz -= (me.z - 16.5) * 0.5;
  if (me.z < -16.5) bz += (-16.5 - me.z) * 0.5;
  return V.norm({ x: dir.x + bx, z: dir.z + bz });
}

function think(p, api) {
  const me = p.self, e = p.enemy, t = p.t;
  if (!me || !e) return;
  const dist = e.dist;

  for (const ev of p.events) {
    if (ev.type === 'enemyStarted') {
      if (ev.skill === 'charge') eReady.charge = t + CHARGE_CD;
      else if (ev.skill === 'smash') eReady.smash = t + SMASH_CD;
      else if (ev.skill === 'jump') eReady.jump = t + JUMP_CD;
    } else if (ev.type === 'blocked') {
      if (t - lastFlip > 0.5) { orbitSign = -orbitSign; lastFlip = t; }
    } else if (ev.type === 'damaged' && ev.skill === 'smash') {
      eReady.smash = Math.max(eReady.smash, t + SMASH_CD - 0.3);
    } else if (ev.type === 'contact') {
      if (t - lastFlip > 0.8) { orbitSign = -orbitSign; lastFlip = t; }
    }
  }

  if (!me.alive) return;

  const away = V.away(me, e);

  if (me.airborne || me.stunned) {
    api.faceAt(e.x, e.z);
    return;
  }

  // ---- keep aiming while the beam is charging ----
  if (me.casting && me.casting.skill === 'laser' && me.casting.telegraph) {
    let tRem = (me.casting.remaining != null) ? me.casting.remaining : 0.3;
    tRem = Math.max(0, Math.min(tRem, LASER_CAST));
    const pt = predict(p, api, tRem);
    api.faceAt(pt.x, pt.z);
    const d = wallBias(me, dist < 13 ? away : { x: away.x * 0.3, z: away.z * 0.3 });
    api.move(d.x, d.z);
    return;
  }

  // ---- charge threat ----
  const ch = (e.casting && e.casting.skill === 'charge') ? e.casting : null;
  if (ch) {
    let dir;
    if (ch.phase === 'dash' && e.speed > 6) dir = V.norm({ x: e.vx, z: e.vz });
    else dir = V.fromHeading(e.heading);
    const rel = { x: me.x - e.x, z: me.z - e.z };
    const along = V.dot(rel, dir);
    const lat = rel.x * dir.z - rel.z * dir.x;
    const alat = Math.abs(lat);
    const committed = ch.phase !== 'windup';
    if (along > -1.5 && along < 14.5 && alat < 3.4) {
      let s = lat >= 0 ? 1 : -1;
      let perp = { x: dir.z * s, z: -dir.x * s };
      const probe = { x: me.x + perp.x * 6.5, z: me.z + perp.z * 6.5 };
      if (Math.abs(probe.x) > 18.5 || Math.abs(probe.z) > 18.5) {
        s = -s; perp = { x: dir.z * s, z: -dir.x * s };
      }
      if (committed && !me.busy && api.ready('blink')) {
        const bd = { x: perp.x * 1.0 - dir.x * 0.25, z: perp.z * 1.0 - dir.z * 0.25 };
        api.use('blink', bd.x, bd.z);
        api.move(perp.x, perp.z);
        api.faceAt(e.x, e.z);
        if (t - lastSay > 3) { lastSay = t; api.say("eight arms, none of them yours"); }
        return;
      }
      if (!me.busy) {
        const mv = wallBias(me, V.norm({ x: perp.x - dir.x * 0.35, z: perp.z - dir.z * 0.35 }));
        api.move(mv.x, mv.z);
        api.faceAt(e.x, e.z);
        return;
      }
    }
  }

  // ---- smash threat ----
  const sm = (e.casting && e.casting.skill === 'smash' && e.casting.telegraph) ? e.casting : null;
  if (sm && dist < 6.0 && !me.busy) {
    const esc = wallBias(me, pickRetreat(p, api));
    api.move(esc.x, esc.z);
    api.faceAt(e.x, e.z);
    if (api.ready('jump')) { api.use('jump'); return; }
    if (api.ready('blink')) { api.use('blink', esc.x, esc.z); return; }
    return;
  }

  const chargeReady = t >= eReady.charge;
  const desired = chargeReady ? 12.0 : 8.5;

  // ---- emergency disengage ----
  if (!me.busy && dist < 5.2 && api.ready('blink')) {
    const esc = wallBias(me, pickRetreat(p, api));
    api.use('blink', esc.x, esc.z);
    api.move(esc.x, esc.z);
    api.faceAt(e.x, e.z);
    return;
  }

  // ---- laser ----
  let fired = false;
  if (!me.busy && api.ready('laser') && e.visible && dist < 22.5 && dist > 1.2) {
    const dashing = !!(e.casting && e.casting.skill === 'charge' && e.casting.phase === 'dash');
    const safeToCast = (!chargeReady) || dist > 10.2 || dashing || e.stunned;
    const airDodge = e.airborne && e.casting && e.casting.remaining != null && e.casting.remaining > 0.45;
    if (safeToCast && !airDodge) {
      const pt = predict(p, api, LASER_CAST);
      const dv = V.norm({ x: pt.x - me.x, z: pt.z - me.z });
      const ang = Math.abs(V.angleTo(me.heading, dv));
      api.faceAt(pt.x, pt.z);
      if (ang < 1.05) {
        api.use('laser');
        fired = true;
        if (t - lastSay > 6) { lastSay = t; api.say("ink is optional; the beam is not"); }
      }
    } else {
      api.faceAt(e.x, e.z);
    }
  } else {
    const pt = e.visible ? predict(p, api, 0.35) : { x: e.x, z: e.z };
    api.faceAt(pt.x, pt.z);
  }

  // ---- movement ----
  let mv;
  if (!e.visible) {
    mv = approachDir(p, api);
  } else if (dist < desired - 1.5) {
    mv = pickRetreat(p, api);
  } else if (dist > desired + 2.5) {
    mv = approachDir(p, api);
  } else {
    const rad = V.toward(me, e);
    const perp = { x: rad.z * orbitSign, z: -rad.x * orbitSign };
    const corr = (dist - desired) * 0.25;
    mv = V.norm({ x: perp.x + rad.x * corr, z: perp.z + rad.z * corr });
    let clear = 5;
    try { clear = api.ray(mv.x, mv.z, 4).dist; } catch (err) { clear = 5; }
    if (clear < 1.7 && t - lastFlip > 0.4) { orbitSign = -orbitSign; lastFlip = t; mv = { x: -perp.x, z: -perp.z }; }
  }

  if (fired) {
    mv = dist < 13 ? away : { x: away.x * 0.2 + mv.x * 0.8, z: away.z * 0.2 + mv.z * 0.8 };
  }
  mv = wallBias(me, V.norm(mv));
  api.move(mv.x, mv.z);
}
