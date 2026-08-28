const M = {
  jink: 1, jinkT: 0, dodging: false, flipped: false,
  lastBlink: -99, lastLaser: -99, stuck: 0, unstickUntil: 0,
  unstickDir: { x: 1, z: 0 }, lastPos: null, chargeAim: null, said: 0
};

function clampArena(pt) {
  const L = 18.8;
  return { x: Math.max(-L, Math.min(L, pt.x)), z: Math.max(-L, Math.min(L, pt.z)) };
}

function predictPos(en, t) {
  const k = Math.max(0, Math.min(0.9, t));
  return clampArena({ x: en.x + en.vx * k, z: en.z + en.vz * k });
}

function segAABB(ax, az, bx, bz, minx, minz, maxx, maxz) {
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dz = bz - az;
  for (let i = 0; i < 2; i++) {
    const d = i === 0 ? dx : dz;
    const a = i === 0 ? ax : az;
    const lo = i === 0 ? minx : minz;
    const hi = i === 0 ? maxx : maxz;
    if (Math.abs(d) < 1e-9) {
      if (a < lo || a > hi) return false;
    } else {
      let s = (lo - a) / d, e = (hi - a) / d;
      if (s > e) { const tmp = s; s = e; e = tmp; }
      if (s > t0) t0 = s;
      if (e < t1) t1 = e;
      if (t0 > t1) return false;
    }
  }
  return true;
}

function blockedSeg(ax, az, bx, bz, obs, pad) {
  for (const o of obs) {
    if (segAABB(ax, az, bx, bz, o.x - o.hx - pad, o.z - o.hz - pad, o.x + o.hx + pad, o.z + o.hz + pad)) return true;
  }
  return false;
}

function findCover(p, api, me, en) {
  let best = null, bestScore = Infinity;
  const obs = p.arena.obstacles;
  for (const o of obs) {
    const c = { x: o.x, z: o.z };
    const dir = V.norm({ x: c.x - en.x, z: c.z - en.z });
    if (dir.x === 0 && dir.z === 0) continue;
    const off = Math.max(o.hx, o.hz) + 2.3;
    for (const ang of [0, 0.55, -0.55]) {
      const d2 = V.rot(dir, ang);
      const pt = clampArena({ x: c.x + d2.x * off, z: c.z + d2.z * off });
      if (!blockedSeg(en.x, en.z, pt.x, pt.z, obs, 0.1)) continue;
      const path = api.pathTo(pt.x, pt.z);
      if (!path) continue;
      const score = path.dist - V.dist(pt, { x: en.x, z: en.z }) * 0.4;
      if (score < bestScore) { bestScore = score; best = pt; }
    }
  }
  return best;
}

function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me || !me.alive) return;
  const obs = p.arena.obstacles;

  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      if (e.skill === 'blink') M.lastBlink = p.t;
      else if (e.skill === 'laser') M.lastLaser = p.t;
    }
  }

  if (!en || !en.alive) { api.stop(); return; }

  const dist = en.dist;
  const myFrac = me.hp / me.maxHp;
  const enFrac = en.hp / en.maxHp;

  // ---- jink / dodge bookkeeping ----
  M.jinkT -= p.dt;
  const laserCast = !!(en.casting && en.casting.skill === 'laser' && en.casting.telegraph);
  if (laserCast) {
    if (!M.dodging) {
      M.dodging = true;
      M.flipped = false;
      M.jinkT = 99;
      const per = V.perp(V.toward(me, en));
      const a = { x: me.x + per.x * 5, z: me.z + per.z * 5 };
      const b = { x: me.x - per.x * 5, z: me.z - per.z * 5 };
      const okA = Math.abs(a.x) < 19 && Math.abs(a.z) < 19 && api.los(a.x, a.z);
      const okB = Math.abs(b.x) < 19 && Math.abs(b.z) < 19 && api.los(b.x, b.z);
      M.jink = okA ? 1 : (okB ? -1 : M.jink);
    }
    const rem = en.casting.remaining == null ? 0.3 : en.casting.remaining;
    if (!M.flipped && rem < 0.20) { M.jink = -M.jink; M.flipped = true; }
  } else {
    if (M.dodging) { M.dodging = false; M.jinkT = 0.35; }
    if (M.jinkT <= 0) { M.jinkT = 0.45 + api.rand() * 0.45; M.jink = -M.jink; }
  }

  // ---- stuck detection ----
  if (M.lastPos) {
    const moved = V.dist(M.lastPos, { x: me.x, z: me.z });
    if (moved < 0.035 && !me.busy && !me.stunned) M.stuck++; else M.stuck = 0;
  }
  M.lastPos = { x: me.x, z: me.z };
  if (M.stuck > 6) {
    M.stuck = 0;
    M.unstickUntil = p.t + 0.55;
    const per = V.perp(V.toward(me, en));
    M.unstickDir = { x: per.x * M.jink, z: per.z * M.jink };
  }

  // ---- locked states ----
  if (me.stunned) { api.faceAt(en.x, en.z); return; }

  if (me.casting) {
    const c = me.casting;
    if (c.skill === 'smash' && c.phase === 'windup') {
      const pt = predictPos(en, c.remaining || 0.1);
      const d = V.toward(me, pt);
      api.faceAt(pt.x, pt.z);
      api.move(d.x, d.z);
      return;
    }
    if (c.skill === 'charge' && c.phase === 'windup') {
      const tt = (c.remaining || 0.1) + Math.max(0, (dist - 2.3)) / 15;
      const pt = predictPos(en, tt);
      M.chargeAim = pt;
      api.faceAt(pt.x, pt.z);
      return;
    }
    if (c.phase === 'dash' || c.phase === 'air' || c.phase === 'strike') {
      api.faceAt(en.x, en.z);
      return;
    }
    if (c.phase === 'recover') {
      const pt = predictPos(en, 0.2);
      const d = V.toward(me, pt);
      api.faceAt(pt.x, pt.z);
      if (!me.airborne) api.move(d.x, d.z);
      return;
    }
  }
  if (me.airborne) { api.faceAt(en.x, en.z); return; }

  const enAirLong = en.airborne && (!en.casting || (en.casting.remaining == null ? 0.4 : en.casting.remaining) > 0.28);
  const enSafe = en.invulnerable || enAirLong;

  const hideMode = p.t > 43 && myFrac > enFrac + 0.12 && dist > 7;

  // ---- SMASH ----
  const pl = predictPos(en, 0.28);
  const dPl = V.dist(me, pl);
  if (api.ready('smash') && !enSafe && dPl < 4.3 && dist < 5.4) {
    const dir = V.toward(me, pl);
    const ang = Math.abs(V.angleTo(me.heading, dir));
    if (ang < 1.2) {
      api.use('smash');
      api.faceAt(pl.x, pl.z);
      api.move(dir.x, dir.z);
      return;
    }
    api.faceAt(pl.x, pl.z);
    api.move(dir.x, dir.z);
    return;
  }

  // ---- CHARGE ----
  if (api.ready('charge') && en.visible && !en.invulnerable && dist > 3.3 && dist < 13.5 &&
      (!hideMode || dist < 7)) {
    let tt = 0.28 + Math.max(0, dist - 2.3) / 15;
    let pt = predictPos(en, tt);
    tt = 0.28 + Math.max(0, V.dist(me, pt) - 2.3) / 15;
    pt = predictPos(en, tt);
    const d2 = V.dist(me, pt);
    if (d2 < 12.0 && !blockedSeg(me.x, me.z, pt.x, pt.z, obs, 0.5)) {
      const dir = V.toward(me, pt);
      const ang = Math.abs(V.angleTo(me.heading, dir));
      const blinkReady = (p.t - M.lastBlink) > 3.9;
      const worth = laserCast || dist > 5.0;
      const risky = blinkReady && dist > 9.5 && !laserCast;
      if (worth && !risky) {
        if (ang < 0.85) {
          M.chargeAim = pt;
          api.use('charge');
          api.faceAt(pt.x, pt.z);
          return;
        }
        api.faceAt(pt.x, pt.z);
        const dd = V.toward(me, pt);
        api.move(dd.x, dd.z);
        return;
      }
    }
  }

  // ---- unstick ----
  if (p.t < M.unstickUntil) {
    api.faceAt(en.x, en.z);
    api.move(M.unstickDir.x, M.unstickDir.z);
    return;
  }

  // ---- hide / endgame ----
  if (hideMode) {
    api.faceAt(en.x, en.z);
    const cov = findCover(p, api, me, en);
    if (cov) {
      api.moveTo(cov.x, cov.z);
    } else {
      const away = V.away(me, en);
      const t = clampArena({ x: me.x + away.x * 8, z: me.z + away.z * 8 });
      api.moveTo(t.x, t.z);
    }
    if (M.said < 1) { M.said = 1; api.say("holding the lead"); }
    return;
  }

  // ---- pursue ----
  api.faceAt(pl.x, pl.z);

  if (!en.visible) {
    const path = api.pathTo(en.x, en.z);
    if (path && path.points && path.points.length) {
      const wp = path.points[0];
      const d = V.toward(me, wp);
      api.move(d.x, d.z);
    } else {
      api.moveTo(en.x, en.z);
    }
    return;
  }

  const fwd = V.toward(me, pl);
  let amp = 0;
  if (dist > 5.0) {
    if (M.dodging) amp = 0.9;
    else if (dist > 9) amp = 0.45;
    else amp = 0.25;
  }
  const per = V.perp(fwd);
  let vx = fwd.x + per.x * amp * M.jink;
  let vz = fwd.z + per.z * amp * M.jink;

  // don't jink straight into a wall or block
  const probe = clampArena({ x: me.x + vx * 2.6, z: me.z + vz * 2.6 });
  if (Math.abs(me.x + vx * 2.6) > 18.6 || Math.abs(me.z + vz * 2.6) > 18.6 ||
      blockedSeg(me.x, me.z, probe.x, probe.z, obs, 0.9)) {
    vx = fwd.x - per.x * amp * M.jink;
    vz = fwd.z - per.z * amp * M.jink;
    const probe2 = clampArena({ x: me.x + vx * 2.6, z: me.z + vz * 2.6 });
    if (Math.abs(me.x + vx * 2.6) > 18.6 || Math.abs(me.z + vz * 2.6) > 18.6 ||
        blockedSeg(me.x, me.z, probe2.x, probe2.z, obs, 0.9)) {
      vx = fwd.x; vz = fwd.z;
    } else {
      M.jink = -M.jink;
    }
  }

  api.move(vx, vz);
}
