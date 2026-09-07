const OBST = [
  { x: -7, z: -3, hx: 1.2, hz: 3.5 },
  { x: 7, z: 3, hx: 1.2, hz: 3.5 },
  { x: 0, z: -10, hx: 3.6, hz: 1.2 },
  { x: 0, z: 10, hx: 3.6, hz: 1.2 },
  { x: -12.5, z: 11, hx: 1.6, hz: 1.6 },
  { x: 12.5, z: -11, hx: 1.6, hz: 1.6 }
];

const MY_R = 1.25;
const EN_R = 1.0;
const SMASH_REACH = MY_R + 2.9 + EN_R; // 5.15

let strafeSign = 1;
let lastFlip = 0;
let lastLaser = -99;
let lastBlink = -99;
let lastSayT = -99;
let blockedT = -99;

function clampArena(v) {
  return Math.max(-19.4, Math.min(19.4, v));
}

function segHitsBox(ax, az, bx, bz, b, pad) {
  const minx = b.x - b.hx - pad, maxx = b.x + b.hx + pad;
  const minz = b.z - b.hz - pad, maxz = b.z + b.hz + pad;
  if (maxx <= minx || maxz <= minz) return false;
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

function segBlocked(ax, az, bx, bz, pad) {
  for (let i = 0; i < OBST.length; i++) {
    if (segHitsBox(ax, az, bx, bz, OBST[i], pad)) return true;
  }
  return false;
}

function coveredFrom(cx, cz, mx, mz) {
  // is a body of radius 1.25 at (cx,cz) fully shielded from a beam origin (mx,mz)?
  if (!segBlocked(cx, cz, mx, mz, 0)) return false;
  let dx = cx - mx, dz = cz - mz;
  const l = Math.hypot(dx, dz);
  if (l < 0.001) return false;
  dx /= l; dz /= l;
  const px = -dz, pz = dx;
  const off = 1.5;
  if (!segBlocked(cx + px * off, cz + pz * off, mx, mz, 0)) return false;
  if (!segBlocked(cx - px * off, cz - pz * off, mx, mz, 0)) return false;
  return true;
}

function predict(e, t) {
  const s = Math.max(0, Math.min(t, 0.7));
  return { x: clampArena(e.x + e.vx * s), z: clampArena(e.z + e.vz * s) };
}

function chargeIntercept(me, en) {
  let tc = 0.3 + Math.max(0, (en.dist - 2.3)) / 15;
  for (let i = 0; i < 3; i++) {
    const px = en.x + en.vx * tc, pz = en.z + en.vz * tc;
    const d = Math.hypot(px - me.x, pz - me.z);
    tc = 0.3 + Math.max(0, (d - 2.3)) / 15;
    if (tc > 1.1) tc = 1.1;
  }
  return { x: clampArena(en.x + en.vx * tc), z: clampArena(en.z + en.vz * tc), t: tc };
}

function steer(p, api, dir) {
  let d = V.norm(dir);
  if (d.x === 0 && d.z === 0) { api.stop(); return; }
  const r = api.ray(d.x, d.z, 3.2);
  if (r.hit && r.dist < 2.3) {
    const opts = [0.7, -0.7, 1.25, -1.25, 1.9, -1.9, 2.6, -2.6];
    let best = null, bestD = r.dist;
    for (const a of opts) {
      const nd = V.rot(d, a * (strafeSign > 0 ? 1 : 1));
      const rr = api.ray(nd.x, nd.z, 3.2);
      const dd = rr.hit ? rr.dist : 3.2;
      if (dd > 3.0) { best = nd; bestD = dd; break; }
      if (dd > bestD + 0.3) { best = nd; bestD = dd; }
    }
    if (best) d = best;
  }
  api.move(d.x, d.z);
}

function approach(p, api) {
  const me = p.self, en = p.enemy;
  if (!en.visible) {
    const path = api.pathTo(en.x, en.z);
    if (path && !path.direct && path.points && path.points.length) {
      const wp = path.points[0];
      steer(p, api, { x: wp.x - me.x, z: wp.z - me.z });
      return;
    }
    api.moveTo(en.x, en.z);
    return;
  }
  const to = V.toward(me, en);
  const per = V.perp(to);
  let s;
  if (en.dist > 9) s = 0.5;
  else if (en.dist > 4.5) s = 0.42;
  else if (en.dist > 2.6) s = 0.25;
  else s = 0.1;
  const dir = { x: to.x + per.x * s * strafeSign, z: to.z + per.z * s * strafeSign };
  // stay off the walls a little
  const nx = me.x + dir.x * 3, nz = me.z + dir.z * 3;
  if (Math.abs(nx) > 19) dir.x -= Math.sign(nx) * 0.8;
  if (Math.abs(nz) > 19) dir.z -= Math.sign(nz) * 0.8;
  steer(p, api, dir);
}

function findCover(p, api, R) {
  const me = p.self, en = p.enemy;
  const mux = en.x + Math.sin(en.heading) * 1.2;
  const muz = en.z + Math.cos(en.heading) * 1.2;
  const maxTravel = Math.min(me.maxSpeed * R * 0.85, 5.0);
  if (maxTravel < 0.9) return null;
  let best = null, bestScore = -1e9;
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8;
    const d = { x: Math.sin(a), z: Math.cos(a) };
    const r = api.ray(d.x, d.z, maxTravel + 1.2);
    const travel = Math.min(maxTravel, r.hit ? r.dist - 1.45 : maxTravel);
    if (travel < 0.8) continue;
    const cx = clampArena(me.x + d.x * travel), cz = clampArena(me.z + d.z * travel);
    if (!coveredFrom(cx, cz, mux, muz)) continue;
    const nd = Math.hypot(cx - en.x, cz - en.z);
    const score = -nd * 0.35 - travel * 0.05;
    if (score > bestScore) { bestScore = score; best = { x: cx, z: cz }; }
  }
  return best;
}

function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive) return;
  const t = p.t;

  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      if (e.skill === 'laser') lastLaser = t;
      else if (e.skill === 'blink') lastBlink = t;
    } else if (e.type === 'blocked') {
      blockedT = t;
      strafeSign = -strafeSign;
    } else if (e.type === 'damaged' && e.skill === 'laser') {
      strafeSign = -strafeSign;
      lastFlip = t;
    }
  }
  if (t - lastFlip > 0.9 + api.rand() * 1.1) {
    lastFlip = t;
    if (api.rand() < 0.55) strafeSign = -strafeSign;
  }

  const cast = me.casting;
  const casting = cast && cast.telegraph;

  // ---------- FACING ----------
  if (cast && cast.skill === 'charge' && cast.phase === 'windup') {
    const ip = chargeIntercept(me, en);
    api.faceAt(ip.x, ip.z);
  } else if (cast && cast.skill === 'smash' && cast.telegraph) {
    const pe = predict(en, cast.remaining);
    api.faceAt(pe.x, pe.z);
  } else {
    const pe = predict(en, Math.min(0.25, en.dist / 14 + 0.1));
    api.faceAt(pe.x, pe.z);
  }

  const canAct = !me.busy && !me.stunned && !me.airborne;
  const toEn = V.toward(me, en);
  let ordered = false;

  // ---------- SKILLS ----------
  if (canAct) {
    // SMASH
    if (api.ready('smash')) {
      const pe = predict(en, 0.3);
      const mp = { x: me.x + me.vx * 0.15, z: me.z + me.vz * 0.15 };
      const dx = pe.x - mp.x, dz = pe.z - mp.z;
      const pd = Math.hypot(dx, dz);
      const enemyUp = en.airborne && !(en.casting && en.casting.phase !== 'air');
      const stillUp = en.airborne && en.casting && en.casting.remaining > 0.3;
      if (pd <= 4.95 && !en.invulnerable && !stillUp && !(enemyUp && pd > 3)) {
        const want = V.angleTo(me.heading, { x: dx / (pd || 1), z: dz / (pd || 1) });
        const residual = Math.max(0, Math.abs(want) - 0.62);
        const half = 0.96 + Math.asin(Math.min(0.95, EN_R / Math.max(pd, EN_R + 0.05)));
        if (residual < half * 0.8) {
          api.use('smash');
          ordered = true;
        }
      }
    }
    // CHARGE
    if (!ordered && api.ready('charge') && en.visible && !en.invulnerable) {
      const ip = chargeIntercept(me, en);
      const dx = ip.x - me.x, dz = ip.z - me.z;
      const d = Math.hypot(dx, dz);
      if (d > 2.4 && d < 12.5) {
        const dir = { x: dx / d, z: dz / d };
        const r = api.ray(dir.x, dir.z, d + 0.5);
        const clear = !r.hit || r.dist > d - 1.6;
        const enemyLaser = en.casting && en.casting.skill === 'laser' && en.casting.telegraph;
        const airRisk = en.airborne && en.casting && en.casting.remaining > ip.t;
        const want = enemyLaser || en.dist > 4.6 || en.stunned;
        if (clear && want && !airRisk) {
          api.use('charge');
          ordered = true;
        }
      }
    }
  }

  // ---------- MOVEMENT ----------
  if (me.stunned || me.airborne) {
    // nothing useful to order
  } else if (cast && cast.skill === 'charge' && cast.phase === 'dash') {
    // locked
  } else if (ordered && me.casting === null) {
    // skill starts after this thought; keep pressing in
    if (en.dist > 2.2) steer(p, api, toEn);
    else api.move(toEn.x * 0.5, toEn.z * 0.5);
  } else if (cast && cast.skill === 'smash' && cast.phase === 'windup') {
    steer(p, api, toEn);
  } else {
    const enemyLaser = en.casting && en.casting.skill === 'laser' && en.casting.telegraph;
    let handled = false;
    if (enemyLaser && en.dist > 3.2) {
      const spot = findCover(p, api, en.casting.remaining);
      if (spot) {
        steer(p, api, { x: spot.x - me.x, z: spot.z - me.z });
        handled = true;
      }
    }
    if (!handled) approach(p, api);
  }

  if (t - lastSayT > 6.5) {
    lastSayT = t;
    const lines = ['no line of sight, no laser', 'come here, little squid', 'fists beat photons', 'closing'];
    api.say(lines[Math.floor(api.rand() * lines.length) % lines.length]);
  }
}
