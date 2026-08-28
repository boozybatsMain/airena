const OBS = [
  { x: -7, z: -3, hx: 1.2, hz: 3.5 },
  { x: 7, z: 3, hx: 1.2, hz: 3.5 },
  { x: 0, z: -10, hx: 3.6, hz: 1.2 },
  { x: 0, z: 10, hx: 3.6, hz: 1.2 },
  { x: -12.5, z: 11, hx: 1.6, hz: 1.6 },
  { x: 12.5, z: -11, hx: 1.6, hz: 1.6 }
];

let zigSign = 1;
let zigUntil = 0;
let smashReach = 3.75;
let lastLaser = -99;
let lastBlink = -99;
let lastSay = -99;
let blockedRecent = 0;

function predict(e, v, t) {
  return { x: e.x + v.x * t, z: e.z + v.z * t };
}

function chargeAim(me, en, ev) {
  let t = 0.34;
  let pt = predict(en, ev, t);
  for (let i = 0; i < 3; i++) {
    const d = Math.hypot(pt.x - me.x, pt.z - me.z);
    t = 0.34 + Math.min(0.8, d / 15);
    pt = predict(en, ev, t);
  }
  return pt;
}

function clampArena(pt) {
  return {
    x: Math.max(-18.6, Math.min(18.6, pt.x)),
    z: Math.max(-18.6, Math.min(18.6, pt.z))
  };
}

function angleTo(me, pt) {
  const d = { x: pt.x - me.x, z: pt.z - me.z };
  return Math.abs(V.angleTo(me.heading, d));
}

function coverPoint(p) {
  const en = p.enemy, me = p.self;
  let best = null, bd = 1e9;
  for (const o of OBS) {
    const d = V.norm({ x: o.x - en.x, z: o.z - en.z });
    if (d.x === 0 && d.z === 0) continue;
    const ext = Math.abs(d.x) * o.hx + Math.abs(d.z) * o.hz;
    const pt = clampArena({ x: o.x + d.x * (ext + 1.9), z: o.z + d.z * (ext + 1.9) });
    const dd = Math.hypot(pt.x - me.x, pt.z - me.z);
    if (dd < bd) { bd = dd; best = pt; }
  }
  if (best && bd < 5.0) return best;
  return null;
}

function goTo(p, api, tx, tz, allowZig) {
  const me = p.self;
  const dx = tx - me.x, dz = tz - me.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.15) { api.move(dx, dz); return; }
  let path = null;
  try { path = api.pathTo(tx, tz); } catch (err) { path = null; }
  if (path && !path.direct) {
    api.moveTo(tx, tz);
    return;
  }
  let ux = dx / d, uz = dz / d;
  if (allowZig && d > 4.0) {
    if (p.t > zigUntil) {
      zigSign = -zigSign;
      zigUntil = p.t + 0.30 + api.rand() * 0.35;
    }
    const px = uz * zigSign, pz = -ux * zigSign;
    const w = 0.65;
    ux += px * w; uz += pz * w;
  }
  api.move(ux, uz);
}

function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me || !en || !me.alive) return;

  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      if (e.skill === 'laser') lastLaser = p.t;
      else if (e.skill === 'blink') lastBlink = p.t;
    } else if (e.type === 'missed' && e.skill === 'smash') {
      if (e.reason === 'range' || e.reason === 'aim') {
        smashReach = Math.max(3.0, smashReach - 0.18);
      }
    } else if (e.type === 'blocked') {
      blockedRecent = p.t;
    }
  }

  if (me.stunned) return;

  const cast = me.casting;
  const ev = { x: en.vx || 0, z: en.vz || 0 };
  const evs = Math.hypot(ev.x, ev.z);
  if (evs > 6) { ev.x *= 6 / evs; ev.z *= 6 / evs; }
  const dist = en.dist;

  // --- locked in an action -------------------------------------------------
  if (me.airborne) return;
  if (cast) {
    if (cast.skill === 'charge' && cast.phase === 'windup') {
      const aim = chargeAim(me, en, ev);
      api.faceAt(aim.x, aim.z);
      api.move(aim.x - me.x, aim.z - me.z);
      return;
    }
    if (cast.phase === 'dash') return;
    if (cast.skill === 'smash' && cast.phase === 'windup') {
      const pt = predict(en, ev, Math.max(0, cast.remaining || 0.15));
      api.faceAt(pt.x, pt.z);
      const d = Math.hypot(pt.x - me.x, pt.z - me.z);
      if (d > 1.6) api.move(pt.x - me.x, pt.z - me.z);
      else api.move(0, 0);
      return;
    }
  }

  const enemyCasting = en.casting && en.casting.telegraph;
  const enemyLaser = enemyCasting && en.casting.skill === 'laser';
  const enemyAirRemain = (en.casting && en.casting.phase === 'air') ? (en.casting.remaining || 0.4) : (en.airborne ? 0.4 : 0);

  // --- aim point -----------------------------------------------------------
  const smashLand = 0.28;
  const smashPt = predict(en, ev, smashLand);
  const myPt = { x: me.x + (me.vx || 0) * smashLand, z: me.z + (me.vz || 0) * smashLand };
  const dPred = Math.hypot(smashPt.x - myPt.x, smashPt.z - myPt.z);

  api.faceAt(smashPt.x, smashPt.z);

  // --- SMASH ---------------------------------------------------------------
  const canHit = dPred < smashReach + (en.stunned ? 0.5 : 0)
    && enemyAirRemain < 0.22
    && !(en.invulnerable && dist < 3.0)
    && angleTo(me, smashPt) < 1.35;

  if (!me.busy && canHit && api.ready('smash')) {
    api.use('smash');
    api.move(smashPt.x - me.x, smashPt.z - me.z);
    return;
  }

  // --- CHARGE --------------------------------------------------------------
  if (!me.busy && api.ready('charge') && en.visible && !me.busy) {
    const aim = chargeAim(me, en, ev);
    const adist = Math.hypot(aim.x - me.x, aim.z - me.z);
    const ang = angleTo(me, aim);
    let want = false;
    if (adist >= 3.6 && adist <= 11.5) want = true;
    if (enemyLaser && adist >= 2.4 && adist <= 11.5) want = true;
    if (en.stunned && adist >= 2.8 && adist <= 11.5) want = true;
    if (p.t - lastBlink < 0.8 && adist <= 11.5 && adist >= 2.5) want = true;
    if (enemyAirRemain > 0.3) want = false;
    if (want && ang < 1.0) {
      let clear = true;
      try {
        const r = api.ray(aim.x - me.x, aim.z - me.z, adist + 1.0);
        if (r && r.hit && r.dist < adist - 1.2) clear = false;
      } catch (err) { clear = true; }
      if (clear) {
        api.use('charge');
        api.faceAt(aim.x, aim.z);
        api.move(aim.x - me.x, aim.z - me.z);
        if (p.t - lastSay > 6) { lastSay = p.t; api.say('SMASH THE SQUID'); }
        return;
      }
    }
  }

  // --- MOVEMENT ------------------------------------------------------------
  // take cover only if a laser is winding up, we are far, and cover is close
  if (enemyLaser && dist > 5.5 && !api.ready('charge')) {
    const cp = coverPoint(p);
    if (cp) {
      goTo(p, api, cp.x, cp.z, false);
      return;
    }
  }

  if (dist < 2.4) {
    // glued: shove into them, slight orbit so we do not stall on a wall
    const t = predict(en, ev, 0.2);
    const u = V.norm({ x: t.x - me.x, z: t.z - me.z });
    if (p.t > zigUntil) { zigSign = -zigSign; zigUntil = p.t + 0.5 + api.rand() * 0.5; }
    const px = u.z * zigSign * 0.35, pz = -u.x * zigSign * 0.35;
    api.move(u.x + px, u.z + pz);
    return;
  }

  const tgt = predict(en, ev, Math.min(0.45, dist / 9));
  const c = clampArena(tgt);
  goTo(p, api, c.x, c.z, dist > 4.5 && en.visible);
}
