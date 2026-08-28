function think(p, api) {
  try { brain(p, api); }
  catch (e) {
    try { api.moveTo(p.enemy.x, p.enemy.z); api.faceAt(p.enemy.x, p.enemy.z); } catch (e2) {}
  }
}

let lastLaser = -99;
let lastBlink = -99;
let prevDir = { x: 0, z: 1 };
let side = 1;
let sideT = 0;
let saidT = -99;

function segBox(ax, az, bx, bz, b, pad) {
  const minx = b.x - b.hx - pad, maxx = b.x + b.hx + pad;
  const minz = b.z - b.hz - pad, maxz = b.z + b.hz + pad;
  const dx = bx - ax, dz = bz - az;
  let t0 = 0, t1 = 1;
  if (Math.abs(dx) < 1e-9) { if (ax < minx || ax > maxx) return false; }
  else {
    let ta = (minx - ax) / dx, tb = (maxx - ax) / dx;
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    if (ta > t0) t0 = ta; if (tb < t1) t1 = tb;
    if (t0 > t1) return false;
  }
  if (Math.abs(dz) < 1e-9) { if (az < minz || az > maxz) return false; }
  else {
    let ta = (minz - az) / dz, tb = (maxz - az) / dz;
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    if (ta > t0) t0 = ta; if (tb < t1) t1 = tb;
    if (t0 > t1) return false;
  }
  return true;
}

function blockedSeg(obs, ax, az, bx, bz, pad) {
  for (const b of obs) if (segBox(ax, az, bx, bz, b, pad)) return true;
  return false;
}

function inBox(x, z, b, pad) {
  return Math.abs(x - b.x) <= b.hx + pad && Math.abs(z - b.z) <= b.hz + pad;
}

function bestSpot(p, mode) {
  const me = p.self, en = p.enemy, obs = p.arena.obstacles, H = p.arena.half;
  const step = mode === 'attack' ? 4.0 : 4.5;
  let best = null, bestScore = -1e9;
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8;
    const dir = { x: Math.sin(a), z: Math.cos(a) };
    const cx = me.x + dir.x * step, cz = me.z + dir.z * step;
    if (Math.abs(cx) > H - 1.5 || Math.abs(cz) > H - 1.5) continue;
    let bad = false;
    for (const b of obs) if (inBox(cx, cz, b, me.radius + 0.2)) { bad = true; break; }
    if (bad) continue;
    if (blockedSeg(obs, me.x, me.z, cx, cz, me.radius + 0.05)) continue;
    const d = Math.hypot(cx - en.x, cz - en.z);
    const cover = blockedSeg(obs, cx, cz, en.x, en.z, 0.12);
    const dw = Math.min(H - Math.abs(cx), H - Math.abs(cz));
    let s = 0;
    if (mode === 'attack') s = -d * 1.0 + (cover ? 5.0 : 0);
    else if (mode === 'hide') s = (cover ? 22.0 : 0) - d * 0.25;
    else s = Math.min(d, 17) * 0.95 + (cover ? 8.0 : 0);
    if (dw < 3.5) s -= (3.5 - dw) * 2.0;
    s += 2.2 * (dir.x * prevDir.x + dir.z * prevDir.z);
    if (s > bestScore) { bestScore = s; best = dir; }
  }
  return best;
}

function steer(api, me, dir) {
  if (!dir) return;
  let d = dir;
  const r = api.ray(d.x, d.z, 2.4);
  if (r && r.hit && r.dist < 2.1) {
    const a = V.rot(d, 0.95), b = V.rot(d, -0.95);
    const ra = api.ray(a.x, a.z, 3.0), rb = api.ray(b.x, b.z, 3.0);
    d = ((ra ? ra.dist : 3) >= (rb ? rb.dist : 3)) ? a : b;
  }
  prevDir = { x: d.x, z: d.z };
  api.move(d.x, d.z);
}

function brain(p, api) {
  const me = p.self, en = p.enemy;
  if (!me || !en || !me.alive) return;
  const t = p.t;
  const obs = p.arena.obstacles;

  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      if (e.skill === 'laser') lastLaser = t;
      else if (e.skill === 'blink') lastBlink = t;
    } else if (e.type === 'blocked') {
      side = -side; sideT = t;
    }
  }
  if (en.casting && en.casting.skill === 'laser') lastLaser = t - (en.casting.elapsed || 0);
  if (t - sideT > 2.2) { side = (api.rand() < 0.5) ? 1 : -1; sideT = t; }

  const dist = en.dist;
  const myFrac = me.hp / me.maxHp, enFrac = en.hp / en.maxHp;
  const laserIn = Math.max(0, (lastLaser + 2.2) - t);
  const casting = en.casting && en.casting.telegraph;
  const laserCast = casting && en.casting.skill === 'laser';
  const smashReach = me.radius + 2.9 + en.radius;

  if (me.stunned) { api.faceAt(en.x, en.z); return; }

  const predAt = (s) => ({ x: en.x + en.vx * s, z: en.z + en.vz * s });

  // ---- endgame: if ahead on hp fraction when burn bites, deny contact ----
  const turtle = (t > 45.5 && myFrac > enFrac + 0.03);

  // ---------------- facing ----------------
  const facePt = predAt(0.22);
  api.faceAt(facePt.x, facePt.z);

  // ---------------- while busy ----------------
  if (me.busy && me.casting) {
    const ph = me.casting.phase;
    if (ph === 'windup' && me.casting.skill === 'smash') {
      const pe = predAt(me.casting.remaining || 0.2);
      api.faceAt(pe.x, pe.z);
      steer(api, me, V.toward(me, pe));
      return;
    }
    if (ph === 'windup' && me.casting.skill === 'charge') {
      const rem = me.casting.remaining || 0.1;
      const lead = rem + Math.max(0, dist - 2.2) / 15;
      const aim = { x: en.x + en.vx * Math.min(lead, 0.8), z: en.z + en.vz * Math.min(lead, 0.8) };
      api.faceAt(aim.x, aim.z);
      api.move(V.toward(me, aim).x, V.toward(me, aim).z);
      return;
    }
    if (ph === 'dash' || ph === 'air') return;
    // recovery: keep pressing
  }

  // ---------------- offense ----------------
  const notHittable = en.invulnerable || (en.airborne && !(en.casting && en.casting.remaining < 0.16));

  if (!me.busy && !me.airborne) {
    // SMASH
    if (api.ready('smash') && !notHittable) {
      const pe = predAt(0.28);
      const mp = { x: me.x + me.vx * 0.16, z: me.z + me.vz * 0.16 };
      const dHit = Math.hypot(pe.x - mp.x, pe.z - mp.z);
      const ang = Math.abs(V.angleTo(me.heading, V.toward(mp, pe)));
      if (dHit <= smashReach - 0.35 && ang < 1.25) {
        api.use('smash');
        if (t - saidT > 3) { api.say("SMASH"); saidT = t; }
        steer(api, me, V.toward(me, pe));
        return;
      }
    }
    // CHARGE
    if (api.ready('charge') && !en.invulnerable && !en.airborne && !turtle) {
      const lead = Math.min(0.8, 0.28 + Math.max(0, dist - 2.2) / 15);
      const aim = { x: en.x + en.vx * lead, z: en.z + en.vz * lead };
      const d = Math.hypot(aim.x - me.x, aim.z - me.z);
      const dir = V.toward(me, aim);
      const ang = Math.abs(V.angleTo(me.heading, dir));
      const clear = !blockedSeg(obs, me.x, me.z, aim.x, aim.z, 0.5);
      const timeToHit = 0.28 + Math.max(0, d - 2.2) / 15;
      const wantInterrupt = laserCast && en.casting.remaining > timeToHit - 0.12;
      if (clear && d >= 3.0 && d <= 11.0 && ang < 1.05 && (wantInterrupt || dist > 4.6 || !api.ready('smash'))) {
        api.use('charge');
        api.faceAt(aim.x, aim.z);
        api.move(dir.x, dir.z);
        if (t - saidT > 3) { api.say("CHARGE"); saidT = t; }
        return;
      }
    }
  }

  // ---------------- movement ----------------
  if (me.airborne) return;

  if (turtle) {
    if (dist < smashReach - 0.4 && api.ready('smash')) {
      // they closed on us anyway: punish
      steer(api, me, V.toward(me, en));
    } else {
      const d = bestSpot(p, 'flee');
      if (d) steer(api, me, d);
      else api.move(V.away(me, en).x, V.away(me, en).z);
    }
    if (t - saidT > 5) { api.say("clock's mine"); saidT = t; }
    return;
  }

  if (!en.visible) {
    const path = api.pathTo(en.x, en.z);
    if (path && path.points && path.points.length && !path.direct) {
      const w = path.points[0];
      steer(api, me, V.toward(me, { x: w.x, z: w.z }));
    } else {
      api.moveTo(en.x, en.z);
    }
    return;
  }

  if (laserCast && dist > 5.5) {
    const d = bestSpot(p, 'hide');
    if (d) steer(api, me, d); else steer(api, me, V.toward(me, en));
    return;
  }

  if (dist > 7.5 && laserIn < 0.75) {
    const d = bestSpot(p, 'attack');
    if (d) steer(api, me, d); else steer(api, me, V.toward(me, en));
    return;
  }

  // close quarters: hug and circle
  const toE = V.toward(me, en);
  if (dist < 3.4) {
    const pr = V.perp(toE);
    steer(api, me, V.norm({ x: toE.x * 0.75 + pr.x * side * 0.8, z: toE.z * 0.75 + pr.z * side * 0.8 }));
  } else {
    steer(api, me, toE);
  }
}
