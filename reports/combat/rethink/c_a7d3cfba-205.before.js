const R_ME = 1.25;

function slab(p0, d, mn, mx, t) {
  if (Math.abs(d) < 1e-9) return p0 >= mn && p0 <= mx;
  let ta = (mn - p0) / d, tb = (mx - p0) / d;
  if (ta > tb) { const s = ta; ta = tb; tb = s; }
  if (ta > t[0]) t[0] = ta;
  if (tb < t[1]) t[1] = tb;
  return t[0] <= t[1];
}

function segBlocked(a, b, obs, pad) {
  for (const r of obs) {
    const t = [0, 1];
    if (slab(a.x, b.x - a.x, r.x - r.hx - pad, r.x + r.hx + pad, t) &&
        slab(a.z, b.z - a.z, r.z - r.hz - pad, r.z + r.hz + pad, t)) return true;
  }
  return false;
}

function pointClear(pt, obs, pad) {
  if (Math.abs(pt.x) > 18.6 || Math.abs(pt.z) > 18.6) return false;
  for (const r of obs) {
    if (Math.abs(pt.x - r.x) < r.hx + pad && Math.abs(pt.z - r.z) < r.hz + pad) return false;
  }
  return true;
}

function predict(en, dt, f) {
  return { x: en.x + en.vx * dt * f, z: en.z + en.vz * dt * f };
}

function findCover(me, en, obs, d0) {
  let best = null, bestScore = 1e9;
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8;
    const sa = Math.sin(a), ca = Math.cos(a);
    for (const r of [3, 5.5]) {
      const pt = { x: me.x + sa * r, z: me.z + ca * r };
      if (!pointClear(pt, obs, 1.5)) continue;
      if (segBlocked(me, pt, obs, 0.8)) continue;
      if (!segBlocked(en, pt, obs, 0.0)) continue;
      const de = Math.hypot(pt.x - en.x, pt.z - en.z);
      if (de < bestScore) { bestScore = de; best = pt; }
    }
  }
  if (best && bestScore < d0 + 1.0) return best;
  return null;
}

const lastSkill = { laser: -99, blink: -99, jump: -99 };
let blockedUntil = -99;
let bestD = 999;
let bestDTime = 0;
let saidAt = -99;

function think(p, api) {
  const me = p.self, en = p.enemy, obs = p.arena.obstacles, t = p.t;

  for (const e of p.events) {
    if (e.type === 'enemyStarted' && lastSkill[e.skill] !== undefined) lastSkill[e.skill] = t;
    if (e.type === 'blocked') blockedUntil = t + 0.5;
  }

  if (!me.alive || !en.alive) return;
  if (me.stunned) return;

  const d = en.dist;

  // stall tracking
  bestD += 0.4 * (p.dt || 0.066);
  if (d < bestD) { bestD = d; bestDTime = t; }
  const stalling = (t - bestDTime) > 2.4;

  // ---- currently mid-skill: only steer/aim ----
  if (me.casting) {
    const c = me.casting;
    if (c.skill === 'smash' && c.phase === 'windup') {
      const pe = predict(en, Math.max(0, c.remaining), 0.9);
      api.faceAt(pe.x, pe.z);
      api.move(en.x - me.x, en.z - me.z);
    } else if (c.skill === 'charge' && c.phase === 'windup') {
      const lead = Math.max(0, c.remaining) + Math.max(0, d - 2.25) / 15;
      const cp = predict(en, lead, 0.65);
      api.faceAt(cp.x, cp.z);
    }
    return;
  }
  if (me.airborne || me.busy) return;

  const enJumping = en.airborne || (en.casting && en.casting.skill === 'jump');
  const enIframe = en.invulnerable && (t - lastSkill.blink) < 0.25;

  // ---- SMASH ----
  const pe = predict(en, 0.3, 0.9);
  const pd = Math.hypot(pe.x - me.x, pe.z - me.z);
  const dirS = V.toward({ x: me.x, z: me.z }, pe);
  const angS = Math.abs(V.angleTo(me.heading, dirS));
  if (api.ready('smash') && pd <= 4.6 && angS < 1.35 && !enJumping && !enIframe &&
      !segBlocked(me, pe, obs, 0.0)) {
    api.use('smash');
    api.faceAt(pe.x, pe.z);
    api.move(en.x - me.x, en.z - me.z);
    if (t - saidAt > 4) { saidAt = t; api.say("fists first"); }
    return;
  }

  // ---- CHARGE ----
  const casting = en.casting;
  const theyCast = casting && casting.telegraph && casting.skill === 'laser';
  if (api.ready('charge') && en.visible && !enIframe && d >= 3.0 && d <= 11.2) {
    const lead = 0.3 + Math.max(0, d - 2.25) / 15;
    const cp = predict(en, lead, 0.6);
    const dirC = V.norm({ x: cp.x - me.x, z: cp.z - me.z });
    const dcp = Math.hypot(cp.x - me.x, cp.z - me.z);
    const angC = Math.abs(V.angleTo(me.heading, dirC));
    const rc = api.ray(dirC.x, dirC.z, Math.min(12.4, dcp + 0.6));
    const clear = !rc || rc.dist >= dcp - 0.6;
    const worth = theyCast || d > 4.2 || enJumping === false;
    if (angC < 0.6 && clear && worth) {
      api.use('charge');
      api.faceAt(cp.x, cp.z);
      api.move(dirC.x, dirC.z);
      if (t - saidAt > 4) { saidAt = t; api.say("here I come"); }
      return;
    }
    if (angC >= 0.6 && d > 5) {
      api.faceAt(cp.x, cp.z);
      api.move(en.x - me.x, en.z - me.z);
      return;
    }
  }

  // ---- MOVEMENT ----
  const laserThreat = (t >= lastSkill.laser + 2.05) || theyCast;
  let target = { x: en.x, z: en.z };
  let useCover = false;

  if (en.visible && laserThreat && d > 6.0 && !stalling) {
    const cov = findCover(me, en, obs, d);
    if (cov) { target = cov; useCover = true; }
  }

  if (!en.visible && !useCover) {
    api.moveTo(en.x, en.z);
  } else if (t < blockedUntil || segBlocked(me, target, obs, 0.9)) {
    api.moveTo(target.x, target.z);
  } else {
    api.move(target.x - me.x, target.z - me.z);
  }

  // facing: keep the enemy in front so smash/charge are always available
  api.faceAt(en.x, en.z);
}
