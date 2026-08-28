const OBST = [
  { x: -7, z: -3, hx: 1.2, hz: 3.5 },
  { x: 7, z: 3, hx: 1.2, hz: 3.5 },
  { x: 0, z: -10, hx: 3.6, hz: 1.2 },
  { x: 0, z: 10, hx: 3.6, hz: 1.2 },
  { x: -12.5, z: 11, hx: 1.6, hz: 1.6 },
  { x: 12.5, z: -11, hx: 1.6, hz: 1.6 }
];

let jukeSign = 1;
let lastSay = -9;
let stuckN = 0;
let lastLaser = -9;

function segBox(ax, az, bx, bz, o, pad) {
  const dx = bx - ax, dz = bz - az;
  let t0 = 0, t1 = 1;
  const minx = o.x - o.hx - pad, maxx = o.x + o.hx + pad;
  const minz = o.z - o.hz - pad, maxz = o.z + o.hz + pad;
  if (Math.abs(dx) < 1e-9) {
    if (ax < minx || ax > maxx) return false;
  } else {
    let ta = (minx - ax) / dx, tb = (maxx - ax) / dx;
    if (ta > tb) { const t = ta; ta = tb; tb = t; }
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  if (Math.abs(dz) < 1e-9) {
    if (az < minz || az > maxz) return false;
  } else {
    let ta = (minz - az) / dz, tb = (maxz - az) / dz;
    if (ta > tb) { const t = ta; ta = tb; tb = t; }
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  return true;
}

function clearLine(a, b, pad) {
  const q = pad || 0;
  for (const o of OBST) if (segBox(a.x, a.z, b.x, b.z, o, q)) return false;
  return true;
}

function predict(e, t) {
  return {
    x: Math.max(-19.4, Math.min(19.4, e.x + e.vx * t)),
    z: Math.max(-19.4, Math.min(19.4, e.z + e.vz * t))
  };
}

function angDiff(heading, dir) {
  return V.angleTo(heading, dir);
}

function hidePoint(p, api) {
  const me = p.self, e = p.enemy;
  let best = null, bestScore = -1e9;
  for (const o of OBST) {
    const dir = V.norm({ x: o.x - e.x, z: o.z - e.z });
    if (dir.x === 0 && dir.z === 0) continue;
    const ext = Math.max(o.hx, o.hz) + 2.4;
    for (const mul of [1, 1.6]) {
      const cand = { x: o.x + dir.x * ext * mul, z: o.z + dir.z * ext * mul };
      if (Math.abs(cand.x) > 18.4 || Math.abs(cand.z) > 18.4) continue;
      const hidden = !clearLine(cand, { x: e.x, z: e.z }, 0);
      const path = api.pathTo(cand.x, cand.z);
      const pd = path ? path.dist : 400;
      const ed = V.dist(cand, { x: e.x, z: e.z });
      const s = (hidden ? 70 : 0) - pd * 1.1 + ed * 0.6;
      if (s > bestScore) { bestScore = s; best = cand; }
    }
  }
  return best;
}

function think(p, api) {
  const me = p.self, e = p.enemy;
  if (!me.alive) return;

  for (const ev of p.events) {
    if (ev.type === 'enemyStarted' && ev.skill === 'laser') {
      lastLaser = p.t;
      jukeSign = -jukeSign;
    }
    if (ev.type === 'blocked') stuckN++;
    if (ev.type === 'damaged' && ev.skill === 'laser') jukeSign = -jukeSign;
  }
  if (stuckN > 0 && p.tick % 30 === 0) stuckN = 0;

  const d = e.dist;
  const casting = me.casting;

  // ---- locked in an action ----
  if (me.stunned || me.airborne) return;
  if (me.busy && casting) {
    if (casting.skill === 'charge' && casting.phase === 'windup') {
      const tt = casting.remaining + Math.max(0, d - 2.2) / 15;
      const aim = predict(e, tt);
      api.faceAt(aim.x, aim.z);
      api.move(aim.x - me.x, aim.z - me.z);
    } else if (casting.skill === 'smash' && casting.phase === 'windup') {
      const aim = predict(e, casting.remaining);
      api.faceAt(aim.x, aim.z);
      api.move(aim.x - me.x, aim.z - me.z);
    }
    return;
  }
  if (me.busy) return;

  const myFrac = me.hp / me.maxHp;
  const eFrac = e.hp / Math.max(1, e.maxHp);
  const kite = p.t > 43 && myFrac > eFrac + 0.05 && d > 5.5;

  // ---- SMASH ----
  const landT = 0.28;
  const ep = predict(e, landT);
  const mp = { x: me.x + me.vx * landT, z: me.z + me.vz * landT };
  const pd = V.dist(ep, mp);
  const enemyWillHop = e.casting && e.casting.skill === 'jump';
  if (api.ready('smash') && !e.airborne && !e.invulnerable && !enemyWillHop &&
      pd < 3.5 && d < 5.0) {
    api.faceAt(ep.x, ep.z);
    api.use('smash');
    api.move(e.x - me.x, e.z - me.z);
    return;
  }

  // ---- CHARGE ----
  if (api.ready('charge') && !kite && !e.invulnerable && d > 2.0 && d < 13.5 && e.visible) {
    const tt = 0.34 + Math.max(0, d - 2.2) / 15;
    const aim = predict(e, tt);
    const dir = { x: aim.x - me.x, z: aim.z - me.z };
    const ang = Math.abs(angDiff(me.heading, dir));
    const lineOk = clearLine({ x: me.x, z: me.z }, aim, 0.5);
    const enemyCasting = e.casting && e.casting.telegraph;
    const worth = enemyCasting || d > 4.6 || api.cooldown('smash') > 0.45 || e.hp <= 36;
    if (ang < 0.85 && lineOk && worth) {
      api.faceAt(aim.x, aim.z);
      api.use('charge');
      return;
    }
    if (ang >= 0.85 && d > 4.0) {
      api.faceAt(aim.x, aim.z);
    }
  }

  // ---- KITE / HIDE (winning on fraction, late) ----
  if (kite) {
    const spot = hidePoint(p, api);
    const hiddenNow = !clearLine({ x: me.x, z: me.z }, { x: e.x, z: e.z }, 0);
    if (spot && (!hiddenNow || d < 9)) {
      api.moveTo(spot.x, spot.z);
    } else {
      const away = V.away({ x: me.x, z: me.z }, { x: e.x, z: e.z });
      const tx = Math.max(-18, Math.min(18, me.x + away.x * 6));
      const tz = Math.max(-18, Math.min(18, me.z + away.z * 6));
      api.moveTo(tx, tz);
    }
    api.faceAt(e.x, e.z);
    if (p.t - lastSay > 6) { lastSay = p.t; api.say("Let it burn."); }
    return;
  }

  // ---- APPROACH / PRESSURE ----
  api.faceAt(ep.x, ep.z);

  if (d <= 3.6) {
    // stay glued, drift a little sideways to break their aim while pushing in
    const toE = V.toward({ x: me.x, z: me.z }, { x: e.x, z: e.z });
    const per = V.perp(toE);
    api.move(toE.x + per.x * jukeSign * 0.55, toE.z + per.z * jukeSign * 0.55);
    if (p.tick % 45 === 0) jukeSign = -jukeSign;
    return;
  }

  const direct = clearLine({ x: me.x, z: me.z }, { x: e.x, z: e.z }, 0.9);
  const beingLasered = e.casting && e.casting.skill === 'laser' && e.casting.telegraph;

  if (direct && stuckN < 3) {
    const toE = V.toward({ x: me.x, z: me.z }, { x: e.x, z: e.z });
    let mx = toE.x, mz = toE.z;
    if (beingLasered && d > 5) {
      const per = V.perp(toE);
      mx = toE.x + per.x * jukeSign * 0.85;
      mz = toE.z + per.z * jukeSign * 0.85;
    } else if (d > 8 && api.cooldown('charge') > 0.8) {
      const per = V.perp(toE);
      const w = Math.sin(p.t * 2.2) * 0.45;
      mx = toE.x + per.x * w;
      mz = toE.z + per.z * w;
    }
    api.move(mx, mz);
  } else {
    api.moveTo(e.x, e.z);
  }

  if (p.t - lastSay > 8 && d < 10) { lastSay = p.t; api.say("Come here, little squid."); }
}
