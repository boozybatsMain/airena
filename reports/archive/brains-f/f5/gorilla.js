let lastLaser = -99;
let lastBlink = -99;
let lastDir = { x: 0, z: 1 };
let smashRange = 3.7;
let saidHi = false;

function clampA(v) { return Math.max(-19.4, Math.min(19.4, v)); }

function predict(en, t) {
  return { x: clampA(en.x + en.vx * t), z: clampA(en.z + en.vz * t) };
}

function segAABB(x0, z0, x1, z1, minx, minz, maxx, maxz) {
  const dx = x1 - x0, dz = z1 - z0;
  let t0 = 0, t1 = 1;
  for (let i = 0; i < 2; i++) {
    const p0 = i ? z0 : x0;
    const d = i ? dz : dx;
    const lo = i ? minz : minx;
    const hi = i ? maxz : maxx;
    if (Math.abs(d) < 1e-9) {
      if (p0 < lo || p0 > hi) return false;
    } else {
      let ta = (lo - p0) / d, tb = (hi - p0) / d;
      if (ta > tb) { const s = ta; ta = tb; tb = s; }
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
      if (t0 > t1) return false;
    }
  }
  return true;
}

function losFree(ax, az, bx, bz, obs) {
  for (const o of obs) {
    if (segAABB(ax, az, bx, bz, o.x - o.hx, o.z - o.hz, o.x + o.hx, o.z + o.hz)) return false;
  }
  return true;
}

function chargeIntercept(me, en) {
  let tt = 0.34 + en.dist / 15;
  for (let i = 0; i < 3; i++) {
    const px = en.x + en.vx * tt, pz = en.z + en.vz * tt;
    tt = 0.34 + Math.hypot(px - me.x, pz - me.z) / 15;
    if (tt > 1.15) tt = 1.15;
  }
  return { x: clampA(en.x + en.vx * tt), z: clampA(en.z + en.vz * tt) };
}

function steer(p, api, goal, coverW, horizon) {
  const me = p.self, en = p.enemy, obs = p.arena.obstacles;
  const ep = { x: en.x + en.vx * horizon, z: en.z + en.vz * horizon };
  let best = null, bs = -1e9;
  for (let i = 0; i < 24; i++) {
    const a = i * (Math.PI * 2 / 24);
    const dx = Math.sin(a), dz = Math.cos(a);
    const r = api.ray(dx, dz, 3.4);
    const free = (r && typeof r.dist === 'number') ? r.dist : 3.4;
    const room = Math.min(free - 1.35, 5.2 * horizon);
    if (room < 0.35) continue;
    const nx = me.x + dx * room, nz = me.z + dz * room;
    let s = -Math.hypot(nx - goal.x, nz - goal.z);
    if (coverW > 0 && !losFree(nx, nz, ep.x, ep.z, obs)) s += coverW;
    if (Math.abs(nx) > 18.6 || Math.abs(nz) > 18.6) s -= 3;
    s += 0.6 * (dx * lastDir.x + dz * lastDir.z);
    if (s > bs) { bs = s; best = { x: dx, z: dz }; }
  }
  if (best) { lastDir = best; api.move(best.x, best.z); }
  else api.moveTo(goal.x, goal.z);
}

function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me || !me.alive) return;

  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      if (e.skill === 'laser') lastLaser = p.t;
      else if (e.skill === 'blink') lastBlink = p.t;
    } else if (e.type === 'missed' && e.skill === 'smash') {
      if (e.reason === 'range') smashRange = Math.max(2.9, smashRange - 0.25);
    } else if (e.type === 'dealt' && e.skill === 'smash') {
      smashRange = Math.min(3.9, smashRange + 0.06);
    }
  }

  if (!saidHi) { saidHi = true; api.say("Come here, little squid."); }

  if (!en || !en.alive) { api.stop(); return; }

  const dist = en.dist;
  const toE = V.norm({ x: en.x - me.x, z: en.z - me.z });
  const laserRem = (en.casting && en.casting.skill === 'laser' && en.casting.telegraph)
    ? en.casting.remaining : -1;

  // --- keep aiming through our own telegraphs ---
  if (me.casting && me.casting.telegraph) {
    const c = me.casting;
    if (c.skill === 'smash') {
      const fp = predict(en, Math.max(0, c.remaining || 0));
      api.faceAt(fp.x, fp.z);
      if (dist > 1.7) api.move(toE.x, toE.z); else api.stop();
    } else if (c.skill === 'charge' && c.phase === 'windup') {
      const ip = chargeIntercept(me, en);
      api.faceAt(ip.x, ip.z);
    }
    return;
  }

  if (me.stunned || me.airborne) return;

  let acted = false;

  if (!me.busy) {
    const fp = predict(en, 0.28);
    const closeAmt = dist > 2.2 ? 0.42 : 0;
    const sx = me.x + toE.x * closeAmt, sz = me.z + toE.z * closeAmt;
    const dLand = Math.hypot(fp.x - sx, fp.z - sz);
    const ang = Math.abs(V.angleTo(me.heading, { x: fp.x - me.x, z: fp.z - me.z }));

    if (api.ready('smash') && !en.airborne && !en.invulnerable && dLand <= smashRange && ang < 1.25) {
      api.use('smash');
      api.faceAt(fp.x, fp.z);
      acted = true;
    } else if (api.ready('charge') && !en.airborne && en.visible && dist > 2.3 && dist < 11.5 &&
               (dist > 4.2 || api.cooldown('smash') > 0.4)) {
      const ip = chargeIntercept(me, en);
      const d = Math.hypot(ip.x - me.x, ip.z - me.z);
      const dir = V.norm({ x: ip.x - me.x, z: ip.z - me.z });
      const r = api.ray(dir.x, dir.z, Math.min(d + 1.5, 13));
      const clear = !r || typeof r.dist !== 'number' || r.dist >= d - 1.3;
      if (clear && d > 1.5) {
        api.use('charge');
        api.faceAt(ip.x, ip.z);
        acted = true;
      }
    }
  }

  // --- movement ---
  let goal = { x: en.x, z: en.z };
  if (!en.visible) {
    const path = api.pathTo(en.x, en.z);
    if (path && path.points && path.points.length) {
      for (const q of path.points) {
        if (Math.hypot(q.x - me.x, q.z - me.z) > 1.2) { goal = { x: q.x, z: q.z }; break; }
      }
    }
  }

  let coverW = 0;
  let horizon = 0.45;
  const myFrac = me.hp / me.maxHp, enFrac = en.hp / en.maxHp;

  if (laserRem > 0.05 && en.visible && dist > 2.6) {
    coverW = 30;
    horizon = Math.min(0.55, Math.max(0.18, laserRem));
  } else if (en.visible && dist > 6.5 && (p.t - lastLaser) > 1.4) {
    coverW = 5;
  }
  if (p.burn > 0 && myFrac > enFrac + 0.15 && dist > 5) coverW += 8;

  if (dist < 4.0 && en.visible) {
    lastDir = toE;
    api.move(toE.x, toE.z);
  } else {
    steer(p, api, goal, coverW, horizon);
  }

  if (!acted) {
    const fp = predict(en, 0.2);
    api.faceAt(fp.x, fp.z);
  }
}
