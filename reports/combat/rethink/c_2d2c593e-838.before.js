function segBlocked(ax, az, bx, bz, obs, pad) {
  const dx = bx - ax, dz = bz - az;
  for (const o of obs) {
    const minx = o.x - o.hx - pad, maxx = o.x + o.hx + pad;
    const minz = o.z - o.hz - pad, maxz = o.z + o.hz + pad;
    if (minx > maxx || minz > maxz) continue;
    let t0 = 0, t1 = 1, skip = false;
    if (Math.abs(dx) < 1e-9) {
      if (ax < minx || ax > maxx) skip = true;
    } else {
      let ta = (minx - ax) / dx, tb = (maxx - ax) / dx;
      if (ta > tb) { const s = ta; ta = tb; tb = s; }
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
      if (t0 > t1) skip = true;
    }
    if (skip) continue;
    if (Math.abs(dz) < 1e-9) {
      if (az < minz || az > maxz) skip = true;
    } else {
      let ta = (minz - az) / dz, tb = (maxz - az) / dz;
      if (ta > tb) { const s = ta; ta = tb; tb = s; }
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
      if (t0 > t1) skip = true;
    }
    if (skip) continue;
    return true;
  }
  return false;
}

function inBlock(x, z, obs, pad) {
  for (const o of obs) {
    if (x > o.x - o.hx - pad && x < o.x + o.hx + pad &&
        z > o.z - o.hz - pad && z < o.z + o.hz + pad) return true;
  }
  return false;
}

function findCover(S, E, obs) {
  let best = null, bestScore = 1e9;
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8;
    const dir = { x: Math.sin(a), z: Math.cos(a) };
    for (const step of [2.3, 3.6]) {
      const cx = S.x + dir.x * step, cz = S.z + dir.z * step;
      if (Math.abs(cx) > 18.5 || Math.abs(cz) > 18.5) continue;
      if (inBlock(cx, cz, obs, 1.45)) continue;
      if (segBlocked(S.x, S.z, cx, cz, obs, 1.3)) continue;
      if (!segBlocked(cx, cz, E.x, E.z, obs, -0.3)) continue;
      const sc = V.dist({ x: cx, z: cz }, { x: E.x, z: E.z });
      if (sc < bestScore) { bestScore = sc; best = { x: cx, z: cz }; }
    }
  }
  return best;
}

let lastLaser = -99;
let lastBlink = -99;
let lastSay = -99;
let jukeSide = 1;
let jukeUntil = -99;

function think(p, api) {
  const S = p.self, E = p.enemy;
  if (!S.alive) return;
  const obs = p.arena.obstacles;

  for (const ev of p.events) {
    if (ev.type === 'enemyStarted') {
      if (ev.skill === 'laser') lastLaser = p.t;
      else if (ev.skill === 'blink') lastBlink = p.t;
    } else if (ev.type === 'blinked') {
      lastBlink = p.t;
    }
  }
  if (!E || !E.alive) { api.stop(); return; }

  const eCast = E.casting;
  const eLaserCasting = !!(eCast && eCast.skill === 'laser' && eCast.telegraph);
  if (eLaserCasting) lastLaser = p.t - (eCast.elapsed || 0);

  const d = E.dist;
  const me = { x: S.x, z: S.z };
  const him = { x: E.x, z: E.z };
  const dirToE = V.toward(me, him);
  const predict = (t) => ({ x: E.x + E.vx * t, z: E.z + E.vz * t });

  // ---- locked into an ongoing skill ----
  if (S.casting) {
    const c = S.casting;
    if (c.skill === 'charge' && c.phase === 'windup') {
      const tArr = (c.remaining || 0) + Math.max(0, d - 2.3) / 15;
      const lp = predict(Math.min(tArr, 0.95));
      api.faceAt(lp.x, lp.z);
      api.move(dirToE.x, dirToE.z);
    } else if (c.skill === 'smash' && c.phase === 'windup') {
      const lp = predict(Math.min(c.remaining || 0.3, 0.35));
      api.faceAt(lp.x, lp.z);
      api.move(dirToE.x, dirToE.z);
    } else if (c.phase === 'air') {
      api.faceAt(E.x, E.z);
    } else {
      api.faceAt(E.x, E.z);
      if (d > 2.8) api.move(dirToE.x, dirToE.z);
      else api.move(dirToE.x * 0.4, dirToE.z * 0.4);
    }
    return;
  }

  if (S.airborne || S.stunned) { api.faceAt(E.x, E.z); return; }

  const eAir = E.airborne;
  const eInvuln = E.invulnerable || (p.t - lastBlink) < 0.28;
  const losNow = !segBlocked(S.x, S.z, E.x, E.z, obs, 0);

  // ---- SMASH ----
  const sLead = predict(0.3);
  const dPred = V.dist(me, sLead);
  const dirLead = V.toward(me, sLead);
  const angLead = Math.abs(V.angleTo(S.heading, dirLead));
  if (api.ready('smash') && !eAir && losNow && dPred <= 4.6 && angLead < 1.6) {
    api.use('smash');
    api.faceAt(sLead.x, sLead.z);
    api.move(dirToE.x, dirToE.z);
    if (p.t - lastSay > 4) { lastSay = p.t; api.say("fist meets calamari"); }
    return;
  }

  // ---- CHARGE ----
  if (api.ready('charge') && !eAir && !eInvuln) {
    const tArr = 0.3 + Math.max(0, d - 2.3) / 15;
    const lp = predict(Math.min(tArr, 1.0));
    const dl = V.dist(me, lp);
    const dirL = V.toward(me, lp);
    const angL = Math.abs(V.angleTo(S.heading, dirL));
    const clear = !segBlocked(S.x, S.z, lp.x, lp.z, obs, 0.85) && losNow;
    const aimable = angL < 1.0;
    let want = false;
    if (clear && aimable) {
      if (eLaserCasting && dl >= 1.4 && dl <= 11.5) want = true;
      else if (dl >= 5.0 && dl <= 11.0 && !E.stunned) want = true;
    }
    if (want) {
      api.use('charge');
      api.faceAt(lp.x, lp.z);
      api.move(dirL.x, dirL.z);
      if (p.t - lastSay > 4) { lastSay = p.t; api.say("incoming"); }
      return;
    }
  }

  // ---- LASER THREAT: duck behind cover, else angled juke ----
  if (eLaserCasting && d > 2.0) {
    const cover = findCover(S, E, obs);
    if (cover) {
      api.move(cover.x - S.x, cover.z - S.z);
      api.faceAt(E.x, E.z);
      return;
    }
    if (p.t > jukeUntil) {
      const dirEU = V.toward(him, me);
      const a = V.angleTo(E.heading, dirEU);
      jukeSide = a >= 0 ? 1 : -1;
      jukeUntil = p.t + 0.5;
    }
    const perp = V.scale(V.perp(dirToE), jukeSide);
    const ang = d > 6 ? 1.15 : 0.75;
    const mix = V.norm({
      x: dirToE.x * Math.cos(ang) + perp.x * Math.sin(ang),
      z: dirToE.z * Math.cos(ang) + perp.z * Math.sin(ang)
    });
    let tx = S.x + mix.x * 3, tz = S.z + mix.z * 3;
    if (Math.abs(tx) > 18.5 || Math.abs(tz) > 18.5 || inBlock(tx, tz, obs, 1.4)) {
      const mix2 = V.norm({
        x: dirToE.x * Math.cos(ang) - perp.x * Math.sin(ang),
        z: dirToE.z * Math.cos(ang) - perp.z * Math.sin(ang)
      });
      jukeSide = -jukeSide;
      api.move(mix2.x, mix2.z);
    } else {
      api.move(mix.x, mix.z);
    }
    api.faceAt(E.x, E.z);
    return;
  }

  // ---- CLOSE AND STAY GLUED ----
  api.faceAt(E.x + E.vx * 0.15, E.z + E.vz * 0.15);

  if (d <= 3.4) {
    api.move(dirToE.x, dirToE.z);
    return;
  }

  let moved = false;
  if (!losNow || !E.visible) {
    const path = api.pathTo(E.x, E.z);
    if (path && path.points && path.points.length > 1) {
      const wp = path.points[1];
      api.move(wp.x - S.x, wp.z - S.z);
      moved = true;
    } else if (path && path.points && path.points.length === 1) {
      const wp = path.points[0];
      api.move(wp.x - S.x, wp.z - S.z);
      moved = true;
    }
  }
  if (!moved) {
    const aim = predict(Math.min(d / 5.35, 0.6));
    api.move(aim.x - S.x, aim.z - S.z);
  }
}
