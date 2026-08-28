const HALF = 20;

function boxSeg(ax, az, bx, bz, o, pad) {
  const minx = o.x - o.hx - pad, maxx = o.x + o.hx + pad;
  const minz = o.z - o.hz - pad, maxz = o.z + o.hz + pad;
  const dx = bx - ax, dz = bz - az;
  let t0 = 0, t1 = 1;
  if (Math.abs(dx) < 1e-9) { if (ax < minx || ax > maxx) return false; }
  else {
    let ta = (minx - ax) / dx, tb = (maxx - ax) / dx;
    if (ta > tb) { const t = ta; ta = tb; tb = t; }
    if (ta > t0) t0 = ta; if (tb < t1) t1 = tb;
    if (t0 > t1) return false;
  }
  if (Math.abs(dz) < 1e-9) { if (az < minz || az > maxz) return false; }
  else {
    let ta = (minz - az) / dz, tb = (maxz - az) / dz;
    if (ta > tb) { const t = ta; ta = tb; tb = t; }
    if (ta > t0) t0 = ta; if (tb < t1) t1 = tb;
    if (t0 > t1) return false;
  }
  return true;
}

function clearLine(obs, ax, az, bx, bz, pad) {
  for (let i = 0; i < obs.length; i++) if (boxSeg(ax, az, bx, bz, obs[i], pad)) return false;
  return true;
}

function inBlock(obs, x, z, pad) {
  for (let i = 0; i < obs.length; i++) {
    const o = obs[i];
    if (Math.abs(x - o.x) < o.hx + pad && Math.abs(z - o.z) < o.hz + pad) return true;
  }
  return false;
}

function predict(e, t) {
  return {
    x: Math.max(-19.3, Math.min(19.3, e.x + e.vx * t)),
    z: Math.max(-19.3, Math.min(19.3, e.z + e.vz * t))
  };
}

let orbitDir = 1;
let lastFlip = -9;
let enemyLaserT = -99;
let enemyBlinkT = -99;
let lastDir = { x: 0, z: 1 };
let sayT = -99;
let lastHitT = -99;

function pickDir(me, e, obs, threat) {
  let best = null, bestScore = -1e9;
  const step = 3.0;
  for (let i = 0; i < 20; i++) {
    const a = i * Math.PI * 2 / 20;
    const dx = Math.sin(a), dz = Math.cos(a);
    const cx = me.x + dx * step, cz = me.z + dz * step;
    if (Math.abs(cx) > HALF - 1.6 || Math.abs(cz) > HALF - 1.6) continue;
    if (inBlock(obs, cx, cz, me.radius + 0.35)) continue;
    if (!clearLine(obs, me.x, me.z, cx, cz, me.radius * 0.7)) continue;
    let s = -Math.hypot(cx - e.x, cz - e.z);
    if (threat > 0) {
      const exposed = clearLine(obs, cx, cz, e.x, e.z, 0);
      if (exposed) s -= threat; else s += threat * 0.6;
    }
    s += (dx * lastDir.x + dz * lastDir.z) * 0.7;
    const wallD = Math.min(HALF - Math.abs(cx), HALF - Math.abs(cz));
    if (wallD < 3) s -= (3 - wallD) * 0.9;
    if (s > bestScore) { bestScore = s; best = { x: dx, z: dz }; }
  }
  return best;
}

function think(p, api) {
  const me = p.self, e = p.enemy, obs = p.arena.obstacles;
  if (!me.alive) return;

  for (let i = 0; i < p.events.length; i++) {
    const ev = p.events[i];
    if (ev.type === 'enemyStarted') {
      if (ev.skill === 'laser') enemyLaserT = p.t;
      else if (ev.skill === 'blink') enemyBlinkT = p.t;
    } else if (ev.type === 'blocked') {
      if (p.t - lastFlip > 0.6) { orbitDir = -orbitDir; lastFlip = p.t; }
    } else if (ev.type === 'dealt') {
      lastHitT = p.t;
    } else if (ev.type === 'missed' && ev.skill === 'smash' && ev.reason === 'aim') {
      if (p.t - lastFlip > 0.6) { orbitDir = -orbitDir; lastFlip = p.t; }
    }
  }

  if (!e || !e.alive) { api.stop(); return; }

  const dist = e.dist;
  const enemyCasting = !!(e.casting && e.casting.telegraph && e.casting.skill === 'laser');
  const castLeft = enemyCasting ? e.casting.remaining : 0;

  // ---- facing ----
  if (me.casting && me.casting.skill === 'charge' && me.casting.phase === 'windup') {
    const T = (me.casting.remaining || 0.1) + Math.max(0, dist - 2.2) / 15;
    const pe = predict(e, T * 0.85);
    api.faceAt(pe.x, pe.z);
    api.move(pe.x - me.x, pe.z - me.z);
    return;
  }
  if (me.casting && (me.casting.phase === 'dash' || me.casting.phase === 'air')) return;
  if (me.stunned) return;

  const aim = predict(e, 0.22);
  api.faceAt(aim.x, aim.z);

  // ---- charge ----
  if (api.ready('charge') && !me.busy && !me.airborne && e.visible && !e.invulnerable) {
    const T = 0.28 + Math.max(0, dist - 2.2) / 15;
    const pe = predict(e, T * 0.8);
    const dd = Math.hypot(pe.x - me.x, pe.z - me.z);
    const pathOk = clearLine(obs, me.x, me.z, pe.x, pe.z, 0.55) &&
      Math.abs(pe.x) < HALF - 0.8 && Math.abs(pe.z) < HALF - 0.8;
    const blinkOnCd = (p.t - enemyBlinkT) < 2.9;
    const lo = enemyCasting ? 2.0 : 3.4;
    if (pathOk && dd > lo && dd < 11.2) {
      const worth = enemyCasting || e.stunned || e.busy || blinkOnCd || dd > 6.0;
      if (worth) {
        api.use('charge');
        api.faceAt(pe.x, pe.z);
        api.move(pe.x - me.x, pe.z - me.z);
        if (p.t - sayT > 5) { sayT = p.t; api.say("come here, squid"); }
        return;
      }
    }
  }

  // ---- smash ----
  if (api.ready('smash') && !me.busy && !me.airborne && !e.airborne && !e.invulnerable) {
    const pe = predict(e, 0.25);
    const pd = Math.hypot(pe.x - me.x, pe.z - me.z);
    const limit = e.stunned ? 4.4 : 4.05;
    if (pd < limit && dist < 5.0 && clearLine(obs, me.x, me.z, e.x, e.z, 0)) {
      api.use('smash');
      api.faceAt(pe.x, pe.z);
    }
  }

  // ---- movement ----
  const smashing = !!(me.casting && me.casting.skill === 'smash' && me.casting.phase === 'windup');

  if (dist <= 5.4 && e.visible) {
    const to = V.toward(me, e);
    const per = V.perp(to);
    let radial;
    if (smashing || dist > 3.6) radial = 1.15;
    else if (dist < 2.5) radial = -0.55;
    else radial = 0.25;
    let dir = V.norm({ x: per.x * orbitDir + to.x * radial, z: per.z * orbitDir + to.z * radial });
    let cx = me.x + dir.x * 2.4, cz = me.z + dir.z * 2.4;
    if (Math.abs(cx) > HALF - 1.5 || Math.abs(cz) > HALF - 1.5 || inBlock(obs, cx, cz, me.radius + 0.25)) {
      if (p.t - lastFlip > 0.35) { orbitDir = -orbitDir; lastFlip = p.t; }
      dir = V.norm({ x: per.x * orbitDir + to.x * (radial + 0.4), z: per.z * orbitDir + to.z * (radial + 0.4) });
      cx = me.x + dir.x * 2.4; cz = me.z + dir.z * 2.4;
      if (Math.abs(cx) > HALF - 1.4 || Math.abs(cz) > HALF - 1.4 || inBlock(obs, cx, cz, me.radius + 0.25)) {
        dir = to;
      }
    }
    lastDir = dir;
    api.move(dir.x, dir.z);
    return;
  }

  if (!e.visible) {
    if (dist > 3.0) {
      const path = api.pathTo(e.x, e.z);
      if (path && path.points && path.points.length) {
        const w = path.points[0];
        const d = V.norm({ x: w.x - me.x, z: w.z - me.z });
        lastDir = d;
        api.moveTo(e.x, e.z);
      } else {
        api.move(e.x - me.x, e.z - me.z);
      }
    } else {
      api.move(e.x - me.x, e.z - me.z);
    }
    return;
  }

  let threat = 0;
  if (enemyCasting && castLeft > 0.05 && dist > 4.0) threat = 11;
  else if ((p.t - enemyLaserT) > 1.9 && dist > 6.5) threat = 3.5;

  const dir = pickDir(me, e, obs, threat);
  if (dir) {
    lastDir = dir;
    api.move(dir.x, dir.z);
  } else {
    api.moveTo(e.x, e.z);
  }

  if (p.t - sayT > 8) { sayT = p.t; api.say("no beam through stone"); }
}
