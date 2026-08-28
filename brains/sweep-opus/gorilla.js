const OB = [
  { x: -7, z: -3, hx: 1.2, hz: 3.5 },
  { x: 7, z: 3, hx: 1.2, hz: 3.5 },
  { x: 0, z: -10, hx: 3.6, hz: 1.2 },
  { x: 0, z: 10, hx: 3.6, hz: 1.2 },
  { x: -12.5, z: 11, hx: 1.6, hz: 1.6 },
  { x: 12.5, z: -11, hx: 1.6, hz: 1.6 }
];

let lastLaser = -99;
let lastBlink = -99;
let stuckAt = -99;
let stuckSign = 1;
let saidOpen = false;

function segBox(ax, az, bx, bz, o, e) {
  const minx = o.x - o.hx - e, maxx = o.x + o.hx + e;
  const minz = o.z - o.hz - e, maxz = o.z + o.hz + e;
  const dx = bx - ax, dz = bz - az;
  let t0 = 0, t1 = 1;
  if (Math.abs(dx) < 1e-9) {
    if (ax < minx || ax > maxx) return false;
  } else {
    let ta = (minx - ax) / dx, tb = (maxx - ax) / dx;
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return false;
  }
  if (Math.abs(dz) < 1e-9) {
    if (az < minz || az > maxz) return false;
  } else {
    let ta = (minz - az) / dz, tb = (maxz - az) / dz;
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return false;
  }
  return true;
}

function clearSeg(ax, az, bx, bz, e) {
  for (const o of OB) if (segBox(ax, az, bx, bz, o, e || 0)) return false;
  return true;
}

function inBox(x, z, e) {
  for (const o of OB) {
    if (x > o.x - o.hx - e && x < o.x + o.hx + e && z > o.z - o.hz - e && z < o.z + o.hz + e) return true;
  }
  return false;
}

function pathClear(ax, az, bx, bz) {
  const e = inBox(ax, az, 1.05) ? 0.05 : 1.0;
  return clearSeg(ax, az, bx, bz, e);
}

function hiddenFrom(ex, ez, x, z) {
  return !clearSeg(ex, ez, x, z, 0.25);
}

function ringGoal(me, e, wProg, wHide, radius, api) {
  let best = null, bs = -1e9;
  const d0 = Math.hypot(e.x - me.x, e.z - me.z);
  for (let i = 0; i < 24; i++) {
    const a = i * Math.PI / 12;
    const cx = me.x + Math.sin(a) * radius;
    const cz = me.z + Math.cos(a) * radius;
    if (Math.abs(cx) > 18.6 || Math.abs(cz) > 18.6) continue;
    if (inBox(cx, cz, 1.5)) continue;
    if (!pathClear(me.x, me.z, cx, cz)) continue;
    const dc = Math.hypot(e.x - cx, e.z - cz);
    let s = (d0 - dc) * wProg;
    if (hiddenFrom(e.x, e.z, cx, cz)) s += wHide;
    const edge = Math.max(Math.abs(cx), Math.abs(cz));
    if (edge > 16.5) s -= (edge - 16.5) * 2.0;
    if (s > bs) { bs = s; best = { x: cx, z: cz }; }
  }
  return best;
}

function shadowGoal(me, e) {
  let best = null, bs = -1e9;
  for (const o of OB) {
    const dx = o.x - e.x, dz = o.z - e.z;
    const L = Math.hypot(dx, dz) || 1;
    const off = Math.max(o.hx, o.hz) + 2.0;
    const cx = o.x + (dx / L) * off;
    const cz = o.z + (dz / L) * off;
    if (Math.abs(cx) > 18.5 || Math.abs(cz) > 18.5) continue;
    if (inBox(cx, cz, 1.5)) continue;
    if (!hiddenFrom(e.x, e.z, cx, cz)) continue;
    const myD = Math.hypot(cx - me.x, cz - me.z);
    const eD = Math.hypot(cx - e.x, cz - e.z);
    const s = -myD * 0.7 - eD * 1.0;
    if (s > bs) { bs = s; best = { x: cx, z: cz }; }
  }
  return best;
}

function think(p, api) {
  const me = p.self, e = p.enemy;
  if (!me || !me.alive) return;

  for (const ev of p.events) {
    if (ev.type === 'enemyStarted') {
      if (ev.skill === 'laser') lastLaser = p.t;
      else if (ev.skill === 'blink') lastBlink = p.t;
    } else if (ev.type === 'blocked') {
      stuckAt = p.t;
      stuckSign = api.rand() < 0.5 ? -1 : 1;
    }
  }

  if (!saidOpen) { saidOpen = true; api.say("Come here, little squid."); }

  if (!e || !e.alive) { api.stop(); return; }

  const d = e.dist;
  const eLead = (t) => ({ x: e.x + e.vx * t, z: e.z + e.vz * t });
  const casting = !!(e.casting && e.casting.skill === 'laser' && e.casting.telegraph);
  const laserCd = lastLaser < 0 ? 0 : Math.max(0, lastLaser + 2.2 - p.t);

  // ---------- facing ----------
  let facePt = eLead(0.25);
  if (me.casting && me.casting.skill === 'charge' && me.casting.phase === 'windup') {
    const rem = me.casting.remaining || 0.1;
    const lead = rem + d / 15;
    facePt = { x: e.x + e.vx * lead * 0.85, z: e.z + e.vz * lead * 0.85 };
  } else if (me.casting && me.casting.skill === 'smash' && me.casting.phase === 'windup') {
    facePt = eLead(me.casting.remaining || 0.15);
  }

  // ---------- skills ----------
  let acted = false;
  if (!me.busy && !me.stunned && !me.airborne) {
    const sp = eLead(0.3);
    const mp = { x: me.x + me.vx * 0.15, z: me.z + me.vz * 0.15 };
    const dd = Math.hypot(sp.x - mp.x, sp.z - mp.z);
    const dir = { x: sp.x - mp.x, z: sp.z - mp.z };
    const ang = Math.abs(V.angleTo(me.heading, dir));
    const turnable = 4 * 0.55 * 0.3;
    const half = 0.96 + Math.asin(Math.min(0.95, e.radius / Math.max(dd, 1.05)));
    const eAir = e.airborne && (!e.casting || (e.casting.remaining || 1) > 0.22);
    const smashOk = api.ready('smash') && dd < 4.9 && (ang - turnable) < half * 0.92 &&
      !e.invulnerable && !eAir && clearSeg(mp.x, mp.z, sp.x, sp.z, 0);

    if (smashOk) {
      api.use('smash');
      facePt = sp;
      acted = true;
    } else if (api.ready('charge') && e.visible && !e.invulnerable && !e.airborne && d > 3.4 && d < 12.2) {
      const lead = 0.3 + d / 15;
      const ap = { x: e.x + e.vx * lead * 0.8, z: e.z + e.vz * lead * 0.8 };
      const worth = casting || d > 4.6 || api.cooldown('smash') > 0.55;
      if (worth && clearSeg(me.x, me.z, ap.x, ap.z, 0.25)) {
        api.use('charge');
        facePt = ap;
        acted = true;
      }
    }
  }

  api.faceAt(facePt.x, facePt.z);

  // ---------- movement ----------
  const myFrac = me.hp / me.maxHp, eFrac = e.hp / e.maxHp;
  const kite = p.t > 32 && (myFrac - eFrac) > 0.10;
  let goal;

  if (kite && d > 3.5) {
    const g = ringGoal(me, e, -1.0, 7, 4.2, api);
    goal = g || { x: me.x + (me.x - e.x), z: me.z + (me.z - e.z) };
  } else if (!e.visible) {
    goal = { x: e.x, z: e.z };
  } else if (casting && d > 4.5) {
    const g = ringGoal(me, e, 0.7, 9, 3.6, api);
    goal = g || eLead(0.3);
  } else if (d > 5.6 && (laserCd < 0.85 || casting)) {
    if (d > 10.5) {
      const s = shadowGoal(me, e);
      goal = s || { x: e.x, z: e.z };
    } else {
      const g = ringGoal(me, e, 1.0, 5.5, 3.6, api);
      goal = g || { x: e.x, z: e.z };
    }
  } else {
    goal = eLead(Math.min(0.45, d / 9));
  }

  let gx = goal.x - me.x, gz = goal.z - me.z;
  if (p.t - stuckAt < 0.55) {
    const r = V.rot({ x: gx, z: gz }, stuckSign * 1.15);
    gx = r.x; gz = r.z;
    api.move(gx, gz);
  } else if (pathClear(me.x, me.z, goal.x, goal.z)) {
    api.move(gx, gz);
  } else {
    const pt = api.pathTo(goal.x, goal.z);
    if (pt && pt.points && pt.points.length) {
      let q = null;
      for (const pnt of pt.points) {
        if (Math.hypot(pnt.x - me.x, pnt.z - me.z) > 1.3) { q = pnt; break; }
      }
      if (!q) q = pt.points[pt.points.length - 1];
      api.move(q.x - me.x, q.z - me.z);
    } else {
      api.move(gx, gz);
    }
  }
}
