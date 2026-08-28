const SMASH_CONE = 0.96;
const enemyReady = { laser: 0, blink: 0, jump: 0 };
let strafeSign = 1;
let lastFlip = 0;
let saidHi = false;

function segHitsBox(ax, az, bx, bz, o) {
  const dx = bx - ax, dz = bz - az;
  let t0 = 0, t1 = 1;
  const minx = o.x - o.hx, maxx = o.x + o.hx, minz = o.z - o.hz, maxz = o.z + o.hz;
  if (Math.abs(dx) < 1e-9) { if (ax < minx || ax > maxx) return false; }
  else {
    let ta = (minx - ax) / dx, tb = (maxx - ax) / dx;
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  if (Math.abs(dz) < 1e-9) { if (az < minz || az > maxz) return false; }
  else {
    let ta = (minz - az) / dz, tb = (maxz - az) / dz;
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  return true;
}

function blockedSeg(ax, az, bx, bz, obs) {
  for (const o of obs) if (segHitsBox(ax, az, bx, bz, o)) return true;
  return false;
}

function insideBlock(c, obs, m) {
  for (const o of obs) {
    if (Math.abs(c.x - o.x) <= o.hx + m && Math.abs(c.z - o.z) <= o.hz + m) return true;
  }
  return false;
}

function tangent(me, en) {
  const th = Math.atan2(me.x - en.x, me.z - en.z);
  return { x: Math.cos(th), z: -Math.sin(th) };
}

function goTo(p, api, x, z) {
  const me = p.self;
  const path = api.pathTo(x, z);
  if (path && path.points && path.points.length && !path.direct) {
    let wp = path.points[path.points.length - 1];
    for (const q of path.points) {
      if (V.dist(q, me) > 0.9) { wp = q; break; }
    }
    api.move(wp.x - me.x, wp.z - me.z);
  } else {
    api.move(x - me.x, z - me.z);
  }
}

function findCover(p, me, en) {
  const obs = p.arena.obstacles;
  let best = null, bestScore = 1e9;
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8;
    const dir = { x: Math.sin(a), z: Math.cos(a) };
    for (const r of [2.5, 4.5, 6.5]) {
      const c = { x: me.x + dir.x * r, z: me.z + dir.z * r };
      if (Math.abs(c.x) > 18.4 || Math.abs(c.z) > 18.4) continue;
      if (insideBlock(c, obs, 1.6)) continue;
      if (!blockedSeg(en.x, en.z, c.x, c.z, obs)) continue;
      const score = V.dist(c, en) * 0.7 + r * 0.5;
      if (score < bestScore) { bestScore = score; best = c; }
    }
  }
  return best;
}

function safeStrafe(me, obs, base, sign) {
  for (const s of [sign, -sign]) {
    const d = { x: base.x * s, z: base.z * s };
    const c = { x: me.x + d.x * 2.6, z: me.z + d.z * 2.6 };
    if (Math.abs(c.x) > 18.6 || Math.abs(c.z) > 18.6) continue;
    if (insideBlock(c, obs, 1.4)) continue;
    return { dir: d, sign: s };
  }
  return { dir: { x: base.x * sign, z: base.z * sign }, sign: sign };
}

function think(p, api) {
  const me = p.self, en = p.enemy, t = p.t;
  if (!me.alive || !en) return;
  const obs = p.arena.obstacles;

  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      if (e.skill === 'laser') enemyReady.laser = t + 2.2;
      else if (e.skill === 'blink') enemyReady.blink = t + 3.9;
      else if (e.skill === 'jump') enemyReady.jump = t + 2.8;
    } else if (e.type === 'blocked') {
      strafeSign = -strafeSign;
      lastFlip = t;
    }
  }

  if (!saidHi) { saidHi = true; api.say("ape hands, squid problem"); }

  const d = en.dist;
  const casting = en.casting && en.casting.telegraph ? en.casting : null;
  const laserNow = casting && casting.skill === 'laser';
  const laserRem = laserNow ? casting.remaining : 99;
  const enAir = en.airborne;

  // ---- enemy prediction ----
  let evx = en.vx, evz = en.vz;
  if (en.stunned) { evx *= 0.3; evz *= 0.3; }
  const predAt = (dt) => ({ x: en.x + evx * dt, z: en.z + evz * dt });

  // ---- facing target (default) ----
  let faceP = predAt(0.22);

  // ---- charge geometry ----
  const leadT = 0.28 + Math.max(0, d - 2.25) / 15;
  let lp = predAt(leadT);
  lp = { x: Math.max(-19.4, Math.min(19.4, lp.x)), z: Math.max(-19.4, Math.min(19.4, lp.z)) };
  const dirC = V.toward(me, lp);
  const distC = V.dist(me, lp);
  const errC = Math.abs(V.angleTo(me.heading, dirC));
  let chargeClear = false;
  if (distC > 0.5 && distC < 14.5) {
    const r = api.ray(dirC.x, dirC.z, Math.min(15, distC + 0.5));
    chargeClear = !r.hit || r.dist >= distC - 1.5;
  }
  const chargeImpactT = 0.28 + Math.max(0, d - 2.25) / 15;

  const busy = me.busy || me.stunned || me.airborne;

  // ================= SKILLS =================
  let used = false;
  if (!busy) {
    // smash prediction
    const pe = predAt(0.28);
    const mp = { x: me.x + me.vx * 0.12, z: me.z + me.vz * 0.12 };
    const pdist = V.dist(mp, pe);
    const dirS = V.toward(me, pe);
    const errS = Math.abs(V.angleTo(me.heading, dirS));
    const smashOk = api.ready('smash') && pdist <= 4.75 && !enAir && !en.invulnerable &&
      errS < 1.35 && d < 6.0;

    const wantInterrupt = laserNow && laserRem > chargeImpactT + 0.06 && d < 9.5;
    const wantClose = d > 5.2 || (en.speed > 3.2 && d > 3.4 && !api.ready('smash'));
    const chargeOk = api.ready('charge') && chargeClear && !en.invulnerable && !enAir &&
      distC >= 2.6 && distC <= 13.0 && (wantInterrupt || wantClose);

    if (chargeOk && (wantInterrupt || !smashOk)) {
      if (errC < 0.42) {
        api.use('charge');
        used = true;
        faceP = lp;
      } else {
        faceP = lp; // turn into it, fire next thought
        if (smashOk && !wantInterrupt) { api.use('smash'); used = true; faceP = pe; }
      }
    } else if (smashOk) {
      api.use('smash');
      used = true;
      faceP = pe;
    }
  } else if (me.casting) {
    const c = me.casting;
    if (c.skill === 'smash' && c.phase === 'windup') {
      faceP = predAt(Math.max(0, c.remaining));
    } else if (c.skill === 'charge' && c.phase === 'windup') {
      faceP = lp;
    }
  }

  // ================= MOVEMENT =================
  if (t - lastFlip > 1.1) { lastFlip = t; if (api.rand() < 0.45) strafeSign = -strafeSign; }

  const tang = tangent(me, en);

  if (me.casting && me.casting.skill === 'charge' && me.casting.phase === 'dash') {
    // dash controls the body
  } else if (enAir) {
    const air = en.casting ? Math.max(0, en.casting.remaining) : 0.4;
    const land = { x: en.x + en.vx * air, z: en.z + en.vz * air };
    goTo(p, api, land.x, land.z);
  } else if (laserNow && d > 4.6 && !(me.casting && me.casting.skill === 'charge')) {
    // eat no beam: get behind something, or swing hard across their aim
    const cover = findCover(p, me, en);
    const eToMe = V.toward(en, me);
    const aimErr = V.angleTo(en.heading, eToMe);
    let s = aimErr > 0.05 ? 1 : (aimErr < -0.05 ? -1 : strafeSign);
    const st = safeStrafe(me, obs, tang, s);
    strafeSign = st.sign;
    if (cover && V.dist(me, cover) < 7.5) {
      goTo(p, api, cover.x, cover.z);
    } else {
      const inward = d > 8 ? 0.85 : 0.2;
      const toE = V.toward(me, en);
      api.move(st.dir.x + toE.x * inward, st.dir.z + toE.z * inward);
    }
  } else if (d <= 5.6) {
    // melee: stay glued, orbit a little
    const toE = V.toward(me, en);
    const st = safeStrafe(me, obs, tang, strafeSign);
    strafeSign = st.sign;
    const inward = d > 3.2 ? 1.0 : (d > 2.5 ? 0.45 : -0.25);
    api.move(toE.x * inward + st.dir.x * 0.75, toE.z * inward + st.dir.z * 0.75);
  } else {
    // approach
    const dangerous = d < 27 && en.visible && t >= enemyReady.laser - 0.35;
    if (dangerous && d > 7) {
      const cover = findCover(p, me, en);
      if (cover && V.dist(cover, en) < d - 1.0 && V.dist(me, cover) < 7.0) {
        goTo(p, api, cover.x, cover.z);
      } else {
        const path = api.pathTo(en.x, en.z);
        const st = safeStrafe(me, obs, tang, strafeSign);
        strafeSign = st.sign;
        if (path && !path.direct) {
          goTo(p, api, en.x, en.z);
        } else {
          const toE = V.toward(me, en);
          api.move(toE.x + st.dir.x * 0.5, toE.z + st.dir.z * 0.5);
        }
      }
    } else {
      goTo(p, api, en.x, en.z);
    }
  }

  api.faceAt(faceP.x, faceP.z);
}
