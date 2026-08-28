function think(p, api) {
  const me = p.self, e = p.enemy;
  if (!me || !e || !me.alive) return;
  if (me.stunned) return;
  const obs = p.arena.obstacles;
  const dist = e.dist;

  // ---- blink / teleport detection ----
  const prev = api.recall('epos', null);
  let blinked = false;
  if (prev) {
    const d = Math.hypot(e.x - prev.x, e.z - prev.z);
    if (d > 4.0) blinked = true;
  }
  api.remember('epos', { x: e.x, z: e.z });

  // ---- while a skill of ours is running ----
  if (me.busy) {
    const c = me.casting;
    if (c && c.telegraph) {
      if (c.skill === 'charge' && c.phase === 'windup') {
        const aim = chargeAim(me, e);
        api.faceAt(aim.x, aim.z);
        const d = V.toward(me, aim);
        api.move(d.x, d.z);
      } else if (c.skill === 'smash' && c.phase === 'windup') {
        const aim = predictPos(e, c.remaining);
        api.faceAt(aim.x, aim.z);
        const d = V.toward(me, aim);
        api.move(d.x, d.z);
      }
    }
    return;
  }

  const eCast = !!(e.casting && e.casting.telegraph && e.casting.skill === 'laser');
  const eAir = !!(e.airborne || (e.casting && e.casting.skill === 'jump'));
  const eInv = !!e.invulnerable;

  api.faceAt(e.x, e.z);

  // ---- SMASH: the bread and butter ----
  const pe = predictPos(e, 0.28);
  const predD = Math.hypot(pe.x - me.x, pe.z - me.z);
  if (api.ready('smash') && !eAir && !eInv && predD < 4.25) {
    api.faceAt(pe.x, pe.z);
    if (api.use('smash')) {
      const d = V.toward(me, pe);
      api.move(d.x, d.z);
      return;
    }
  }

  // ---- CHARGE: gap closer and cast breaker ----
  if (api.ready('charge') && !eAir && !eInv && dist > 3.2 && dist < 13.5) {
    const aim = chargeAim(me, e);
    const adist = Math.hypot(aim.x - me.x, aim.z - me.z);
    const pathClear = !blockedSeg(me.x, me.z, aim.x, aim.z, obs, 0.85);
    const worth = eCast || blinked || dist > 4.2;
    if (adist < 12.2 && pathClear && (e.visible || adist < 7.5) && worth) {
      api.faceAt(aim.x, aim.z);
      if (api.use('charge')) return;
    }
  }

  // ---- endgame stalling when ahead on hp ----
  const myFrac = me.hp / me.maxHp, eFrac = e.hp / Math.max(1, e.maxHp);
  if (p.timeLeft < 13 && myFrac > eFrac + 0.03 && dist > 4.5) {
    const spot = findHidden(p, api, me, e, obs, true);
    if (spot) { api.moveTo(spot.x, spot.z); return; }
    const away = V.away(me, e);
    api.move(away.x, away.z);
    return;
  }

  // ---- melee cling ----
  if (dist <= 3.4) {
    const t = V.toward(me, e);
    const pr = V.perp(t);
    const s = api.recall('side', 1);
    api.move(t.x + pr.x * 0.25 * s, t.z + pr.z * 0.25 * s);
    return;
  }

  // ---- out of sight: walk them down ----
  if (!e.visible) {
    api.moveTo(e.x, e.z);
    return;
  }

  // ---- laser threat: use cover to advance ----
  const laserCd = e.cooldowns && typeof e.cooldowns.laser === 'number' ? e.cooldowns.laser : 0;
  const threat = eCast || laserCd < 0.4;
  if (dist > 6.0 && threat && api.cooldown('charge') > 0.4) {
    const spot = findHidden(p, api, me, e, obs, false);
    if (spot) { api.moveTo(spot.x, spot.z); return; }
  }

  // ---- strafing approach ----
  let side = api.recall('side', 1);
  const sideT = api.recall('sideT', -9);
  if (p.t - sideT > 1.1) {
    if (api.rand() < 0.45) side = -side;
    api.remember('side', side);
    api.remember('sideT', p.t);
  }
  for (const ev of p.events) {
    if (ev.type === 'blocked') {
      api.remember('side', -side);
      api.remember('sideT', p.t);
    }
  }
  const t = V.toward(me, e);
  const pr = V.perp(t);
  const lat = dist > 9 ? 0.55 : 0.35;
  let mx = t.x + pr.x * lat * side;
  let mz = t.z + pr.z * lat * side;
  const nx = me.x + mx * 2.2, nz = me.z + mz * 2.2;
  if (Math.abs(nx) > 19 || Math.abs(nz) > 19) { mx = t.x; mz = t.z; }
  api.move(mx, mz);
}

function predictPos(e, t) {
  return { x: e.x + (e.vx || 0) * t, z: e.z + (e.vz || 0) * t };
}

function chargeAim(me, e) {
  let t = 0.34 + Math.hypot(e.x - me.x, e.z - me.z) / 15;
  for (let i = 0; i < 3; i++) {
    const q = predictPos(e, t);
    t = 0.34 + Math.hypot(q.x - me.x, q.z - me.z) / 15;
    if (t > 1.14) t = 1.14;
  }
  const a = predictPos(e, t);
  return { x: Math.max(-19.5, Math.min(19.5, a.x)), z: Math.max(-19.5, Math.min(19.5, a.z)) };
}

function segBox(ax, az, bx, bz, b, pad) {
  const minx = b.x - b.hx - pad, maxx = b.x + b.hx + pad;
  const minz = b.z - b.hz - pad, maxz = b.z + b.hz + pad;
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dz = bz - az;
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

function blockedSeg(ax, az, bx, bz, obs, pad) {
  for (const b of obs) if (segBox(ax, az, bx, bz, b, pad)) return true;
  return false;
}

function boxGap(x, z, b) {
  const dx = Math.max(Math.abs(x - b.x) - b.hx, 0);
  const dz = Math.max(Math.abs(z - b.z) - b.hz, 0);
  return Math.hypot(dx, dz);
}

function clearSpot(x, z, obs, r) {
  if (Math.abs(x) > 18.6 || Math.abs(z) > 18.6) return false;
  for (const b of obs) if (boxGap(x, z, b) < r) return false;
  return true;
}

function findHidden(p, api, me, e, obs, away) {
  const old = api.recall('cover', null);
  const oldT = api.recall('coverT', -9);
  if (old && p.t - oldT < 0.7) {
    if (clearSpot(old.x, old.z, obs, 1.5) && blockedSeg(e.x, e.z, old.x, old.z, obs, 0)) {
      return old;
    }
  }
  let best = null, bestScore = 1e9;
  const radii = [3, 5.5, 8.5];
  for (const r of radii) {
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2;
      const x = me.x + Math.sin(a) * r;
      const z = me.z + Math.cos(a) * r;
      if (!clearSpot(x, z, obs, 1.6)) continue;
      if (!blockedSeg(e.x, e.z, x, z, obs, 0)) continue;
      const de = Math.hypot(x - e.x, z - e.z);
      const dm = r;
      const score = away ? (-de * 1.0 + dm * 0.4) : (de * 1.0 + dm * 0.55);
      if (score < bestScore) { bestScore = score; best = { x: x, z: z }; }
    }
  }
  if (best) {
    api.remember('cover', best);
    api.remember('coverT', p.t);
  }
  return best;
}
