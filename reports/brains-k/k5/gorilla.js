function think(p, api) {
  const me = p.self, e = p.enemy;
  if (!me.alive) return;

  if (p.t < 0.2 && !S.init) {
    S.init = true;
    S.laser = -99; S.blink = -99; S.jump = -99;
    S.side = api.rand() < 0.5 ? 1 : -1;
    S.zigT = 0; S.zig = api.rand() < 0.5 ? 1 : -1;
    S.wasCasting = false;
    api.say("Gorilla says: come here, squid.");
  }

  for (const ev of p.events) {
    if (ev.type === 'enemyStarted') { S[ev.skill] = p.t; }
    if (ev.type === 'blocked') { S.zig = -S.zig; S.side = -S.side; }
  }

  if (!e || !e.alive) { api.stop(); return; }

  const obs = p.arena.obstacles;
  const dist = e.dist;
  const canAct = !me.busy && !me.stunned && !me.airborne;
  const eLaser = e.casting && e.casting.skill === 'laser' && e.casting.telegraph;
  const remain = eLaser ? Math.max(0.05, e.casting.remaining) : 0;

  // pick a dodge side at the start of each laser cast
  if (eLaser && !S.wasCasting) {
    const a = api.ray(Math.sin(V.heading(V.toward(me, e)) + 1.57), Math.cos(V.heading(V.toward(me, e)) + 1.57), 8);
    const b = api.ray(Math.sin(V.heading(V.toward(me, e)) - 1.57), Math.cos(V.heading(V.toward(me, e)) - 1.57), 8);
    S.side = (a.dist >= b.dist) ? 1 : -1;
  }
  S.wasCasting = eLaser;

  // ---- prediction ----
  const smashT = 0.28;
  const pS = fut(e, smashT);
  const myS = { x: me.x + me.vx * smashT * 0.5, z: me.z + me.vz * smashT * 0.5 };
  const dS = V.dist(myS, pS);
  const dirS = V.toward(myS, pS);
  const angS = Math.abs(V.angleTo(me.heading, dirS));

  // charge intercept
  let ct = 0.28;
  for (let i = 0; i < 3; i++) {
    const q = fut(e, ct);
    ct = 0.28 + Math.max(0, V.dist(me, q) - 2.2) / 15;
  }
  const pC = fut(e, Math.min(ct, 1.05));
  const dirC = V.toward(me, pC);
  const angC = Math.abs(V.angleTo(me.heading, dirC));
  const chargeClear = !segBlocked(me.x, me.z, pC.x, pC.z, obs, 0.9);

  // ---- skills ----
  let acted = false;

  if (canAct) {
    // 1. SMASH when they are in the cone
    const allowed = 0.96 + Math.asin(Math.min(0.98, e.radius / Math.max(1.4, dS)));
    const effAng = Math.max(0, angS - 2.2 * smashT);
    if (api.ready('smash') && dS <= 4.85 && !e.airborne && effAng < allowed - 0.12 && e.visible) {
      api.use('smash');
      acted = true;
    }
  }

  if (canAct && !acted && api.ready('charge') && e.visible && chargeClear &&
      dist >= 3.0 && dist <= 11.5 && !e.airborne) {
    const worth = eLaser || dist >= 4.6 || !api.ready('smash');
    if (worth && angC < 0.45) {
      api.use('charge');
      acted = true;
    }
  }

  // ---- facing ----
  if (me.casting && me.casting.skill === 'charge' && me.casting.phase === 'windup') {
    api.faceAt(pC.x, pC.z);
  } else if (dist < 7) {
    api.faceAt(pS.x, pS.z);
  } else {
    api.faceAt(e.x + e.vx * 0.25, e.z + e.vz * 0.25);
  }

  // ---- movement ----
  if (me.airborne) return;

  const toE = V.toward(me, e);

  // very close: press in, gorilla is heavier
  if (dist < 2.9) {
    api.move(toE.x, toE.z);
    return;
  }

  if (eLaser && e.visible && dist >= 2.9) {
    // try to find cover, else strafe hard across their aim
    const reach = Math.min(4.2, Math.max(1.6, remain * 5.35));
    const eF = fut(e, remain);
    let best = null, bestScore = -1e9;
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const cx = me.x + Math.sin(a) * reach, cz = me.z + Math.cos(a) * reach;
      if (Math.abs(cx) > 18.6 || Math.abs(cz) > 18.6) continue;
      if (inBox(cx, cz, obs, 1.5)) continue;
      if (segBlocked(me.x, me.z, cx, cz, obs, 1.0)) continue;
      const hidden = segBlocked(cx, cz, eF.x, eF.z, obs, 0.15);
      const d2 = Math.hypot(cx - eF.x, cz - eF.z);
      const sc = (hidden ? 140 : 0) - d2 * 1.6;
      if (sc > bestScore) { bestScore = sc; best = { x: cx, z: cz }; }
    }
    if (best && bestScore > 100) {
      api.move(best.x - me.x, best.z - me.z);
      return;
    }
    const strafe = V.rot(toE, S.side * 1.15);
    api.move(strafe.x, strafe.z);
    return;
  }

  // approach
  const path = api.pathTo(e.x, e.z);
  if (!e.visible || (path && !path.direct)) {
    if (path && path.points && path.points.length) {
      const wp = path.points[0];
      api.move(wp.x - me.x, wp.z - me.z);
    } else {
      api.moveTo(e.x, e.z);
    }
    return;
  }

  // direct line: zigzag in to spoil their aim
  if (p.t - S.zigT > 0.45) { S.zigT = p.t; S.zig = -S.zig; }
  let lat = 0.55;
  if (dist < 5.5) lat = 0.25;
  const per = V.perp(toE);
  let mv = { x: toE.x + per.x * lat * S.zig, z: toE.z + per.z * lat * S.zig };
  const probe = { x: me.x + mv.x * 2.4, z: me.z + mv.z * 2.4 };
  if (Math.abs(probe.x) > 18.8 || Math.abs(probe.z) > 18.8 || inBox(probe.x, probe.z, obs, 1.4)) {
    S.zig = -S.zig;
    mv = { x: toE.x + per.x * lat * S.zig, z: toE.z + per.z * lat * S.zig };
  }
  api.move(mv.x, mv.z);
}

const S = { init: false, laser: -99, blink: -99, jump: -99, side: 1, zig: 1, zigT: 0, wasCasting: false };

function fut(e, t) {
  const x = Math.max(-19.4, Math.min(19.4, e.x + e.vx * t));
  const z = Math.max(-19.4, Math.min(19.4, e.z + e.vz * t));
  return { x, z };
}

function inBox(x, z, obs, pad) {
  for (const o of obs) {
    if (x > o.x - o.hx - pad && x < o.x + o.hx + pad && z > o.z - o.hz - pad && z < o.z + o.hz + pad) return true;
  }
  return false;
}

function segBlocked(ax, az, bx, bz, obs, pad) {
  const dx = bx - ax, dz = bz - az;
  for (const o of obs) {
    const minx = o.x - o.hx - pad, maxx = o.x + o.hx + pad;
    const minz = o.z - o.hz - pad, maxz = o.z + o.hz + pad;
    let t0 = 0, t1 = 1, ok = true;
    if (Math.abs(dx) < 1e-9) {
      if (ax < minx || ax > maxx) ok = false;
    } else {
      let ta = (minx - ax) / dx, tb = (maxx - ax) / dx;
      if (ta > tb) { const s = ta; ta = tb; tb = s; }
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
      if (t0 > t1) ok = false;
    }
    if (ok) {
      if (Math.abs(dz) < 1e-9) {
        if (az < minz || az > maxz) ok = false;
      } else {
        let ta = (minz - az) / dz, tb = (maxz - az) / dz;
        if (ta > tb) { const s = ta; ta = tb; tb = s; }
        t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
        if (t0 > t1) ok = false;
      }
    }
    if (ok) return true;
  }
  return false;
}
