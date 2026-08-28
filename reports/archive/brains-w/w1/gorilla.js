const OBS_PAD_LOS = 0.0;

let M = null;

function resetMem() {
  M = {
    lastLaser: -99,
    lastBlink: -99,
    ePrev: null,
    prevDir: { x: 0, z: 1 },
    unstickUntil: -1,
    unstickDir: { x: 1, z: 0 },
    hitsTaken: 0,
    lastHit: -99,
    started: true
  };
}

function segBox(ax, az, bx, bz, ob, pad) {
  const minx = ob.x - ob.hx - pad, maxx = ob.x + ob.hx + pad;
  const minz = ob.z - ob.hz - pad, maxz = ob.z + ob.hz + pad;
  const dx = bx - ax, dz = bz - az;
  let t0 = 0, t1 = 1;
  if (Math.abs(dx) < 1e-9) {
    if (ax < minx || ax > maxx) return false;
  } else {
    let ta = (minx - ax) / dx, tb = (maxx - ax) / dx;
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  if (Math.abs(dz) < 1e-9) {
    if (az < minz || az > maxz) return false;
  } else {
    let ta = (minz - az) / dz, tb = (maxz - az) / dz;
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  return true;
}

function blockedSeg(ax, az, bx, bz, obs, pad) {
  for (const ob of obs) if (segBox(ax, az, bx, bz, ob, pad)) return true;
  return false;
}

function clampArena(v, lim) {
  return Math.max(-lim, Math.min(lim, v));
}

function think(p, api) {
  if (!M || p.t < 0.2) resetMem();

  const me = p.self;
  const e = p.enemy;
  if (!me || !e) return;
  const obs = (p.arena && p.arena.obstacles) ? p.arena.obstacles : [];
  const dist = e.dist;

  // ---- digest events -------------------------------------------------
  for (const ev of p.events) {
    if (ev.type === 'enemyStarted') {
      if (ev.skill === 'laser') M.lastLaser = p.t;
      else if (ev.skill === 'blink') M.lastBlink = p.t;
    } else if (ev.type === 'damaged') {
      M.hitsTaken++;
      M.lastHit = p.t;
      if (ev.skill === 'laser') M.lastLaser = p.t - 0.55;
    } else if (ev.type === 'blocked') {
      M.unstickUntil = p.t + 0.45;
      const perp = V.perp(M.prevDir);
      const s = api.rand() < 0.5 ? -1 : 1;
      M.unstickDir = { x: perp.x * s, z: perp.z * s };
    }
  }

  // detect enemy teleport (blink)
  if (M.ePrev) {
    const jump = Math.hypot(e.x - M.ePrev.x, e.z - M.ePrev.z);
    if (jump > e.maxSpeed * Math.max(p.dt, 0.066) * 2 + 1.2) M.lastBlink = p.t;
  }
  M.ePrev = { x: e.x, z: e.z };

  const eCd = e.cooldowns || {};
  const laserCd = (typeof eCd.laser === 'number')
    ? eCd.laser : Math.max(0, 2.0 - (p.t - M.lastLaser));
  const blinkCd = (typeof eCd.blink === 'number')
    ? eCd.blink : Math.max(0, 3.5 - (p.t - M.lastBlink));

  const eCasting = e.casting && e.casting.telegraph ? e.casting.skill : null;
  const laserComing = (eCasting === 'laser') || laserCd < 0.35;

  const myFrac = me.hp / me.maxHp;
  const eFrac = e.hp / e.maxHp;

  // ---- lead prediction ----------------------------------------------
  const leadT = 0.30;
  const lx = clampArena(e.x + (e.vx || 0) * leadT, 19.5);
  const lz = clampArena(e.z + (e.vz || 0) * leadT, 19.5);

  const canAct = me.alive && !me.busy && !me.stunned && !me.airborne;

  // ---- endgame turtle mode -------------------------------------------
  const turtle = (p.t > 44) && (myFrac > eFrac + 0.10);

  // ---- facing ---------------------------------------------------------
  if (e.visible || dist < 8) {
    api.faceAt(lx, lz);
  } else {
    const d = M.prevDir;
    if (d.x || d.z) api.face(d.x, d.z); else api.faceAt(e.x, e.z);
  }

  // ---- skills ---------------------------------------------------------
  let usedSkill = false;

  if (canAct) {
    const angToEnemy = Math.abs(V.angleTo(me.heading, V.toward(me, { x: lx, z: lz })));
    // distance at smash landing time
    const myFx = me.x + (me.vx || 0) * 0.28;
    const myFz = me.z + (me.vz || 0) * 0.28;
    const smashDist = Math.hypot(lx - myFx, lz - myFz);
    const smashReach = 2.5 + me.radius + e.radius - 0.55;

    if (api.ready('smash') && !e.airborne && smashDist < smashReach && angToEnemy < 1.25) {
      api.use('smash');
      usedSkill = true;
    } else if (
      !turtle &&
      api.ready('charge') &&
      dist > 3.4 && dist < 11.5 &&
      e.visible && !e.airborne &&
      !blockedSeg(me.x, me.z, lx, lz, obs, 0.75) &&
      (blinkCd > 0.35 || dist < 6.5 || eCasting === 'laser')
    ) {
      api.faceAt(
        clampArena(e.x + (e.vx || 0) * (0.34 + dist / 15), 19.5),
        clampArena(e.z + (e.vz || 0) * (0.34 + dist / 15), 19.5)
      );
      api.use('charge');
      usedSkill = true;
    }
  }

  // charge windup: keep aiming at where they'll be
  if (me.casting && me.casting.skill === 'charge' && me.casting.phase === 'windup') {
    const tt = me.casting.remaining + dist / 15;
    api.faceAt(
      clampArena(e.x + (e.vx || 0) * tt, 19.5),
      clampArena(e.z + (e.vz || 0) * tt, 19.5)
    );
  }

  // ---- movement --------------------------------------------------------
  if (me.airborne) return;

  if (p.t < M.unstickUntil) {
    api.move(M.unstickDir.x, M.unstickDir.z);
    M.prevDir = M.unstickDir;
    return;
  }

  // attraction point: route around cover when there is no straight line
  let attract = { x: lx, z: lz };
  if (blockedSeg(me.x, me.z, e.x, e.z, obs, 0.2)) {
    const path = api.pathTo(e.x, e.z);
    if (path && path.points && path.points.length) {
      let wp = path.points[0];
      if (Math.hypot(wp.x - me.x, wp.z - me.z) < 1.8 && path.points[1]) wp = path.points[1];
      attract = wp;
    }
  }

  // weights per mode
  let closeW = 1.0;
  let coverW = 0.4;
  let ringR = 0;

  if (turtle) {
    coverW = 14.0;
    closeW = 0.0;
    ringR = 11.0;
  } else if (laserComing && dist > 5.5 && e.visible) {
    coverW = 5.0;
    closeW = 1.0;
  } else if (dist > 13 && laserCd > 0.9) {
    coverW = 1.0;
    closeW = 1.2;
  }

  const N = 24;
  let best = null;
  const step = 2.6;
  for (let i = 0; i < N; i++) {
    const a = (i * 2 * Math.PI) / N;
    const dir = { x: Math.sin(a), z: Math.cos(a) };
    const nx = me.x + dir.x * step;
    const nz = me.z + dir.z * step;
    if (Math.abs(nx) > 19.0 || Math.abs(nz) > 19.0) continue;
    if (blockedSeg(me.x, me.z, nx, nz, obs, me.radius + 0.1)) continue;

    let s = 0;
    const nd = Math.hypot(nx - attract.x, nz - attract.z);
    if (ringR > 0) {
      const ed = Math.hypot(nx - e.x, nz - e.z);
      s -= Math.abs(ed - ringR) * 0.7;
    } else {
      s -= nd * closeW;
    }

    const hidden = blockedSeg(nx, nz, e.x, e.z, obs, OBS_PAD_LOS);
    if (hidden) s += coverW;

    // stay off the beam line while they are casting
    if (eCasting === 'laser' && !hidden) {
      const toMe = V.norm({ x: nx - e.x, z: nz - e.z });
      const ef = V.fromHeading(e.heading);
      const al = Math.abs(V.angleTo(e.heading, toMe));
      s += Math.min(al, 1.2) * 1.6 * (V.dot(toMe, ef) > 0 ? 1 : 0.3);
    }

    // hug the middle-ish, corners are death
    const edge = Math.min(19 - Math.abs(nx), 19 - Math.abs(nz));
    if (edge < 4) s -= (4 - edge) * 0.9;

    // momentum, kills dithering
    s += 0.55 * (dir.x * M.prevDir.x + dir.z * M.prevDir.z);

    if (!best || s > best.s) best = { s, dir };
  }

  if (best) {
    api.move(best.dir.x, best.dir.z);
    M.prevDir = best.dir;
  } else {
    api.moveTo(clampArena(e.x, 18.5), clampArena(e.z, 18.5));
  }

  if (usedSkill && api.rand() < 0.08) api.say("come here, little squid");
}
