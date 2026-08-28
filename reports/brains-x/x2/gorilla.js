const OBS_SHRINK = 0.35;

let lastLaserStart = -99;
let lastBlinkStart = -99;
let chargeAimPt = null;
let blockedUntil = -99;
let lastSayT = -99;

function segHitsBox(ax, az, bx, bz, box, pad) {
  const minx = box.x - box.hx - pad, maxx = box.x + box.hx + pad;
  const minz = box.z - box.hz - pad, maxz = box.z + box.hz + pad;
  if (minx >= maxx || minz >= maxz) return false;
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

function lineBlocked(ax, az, bx, bz, obs, pad) {
  for (const o of obs) if (segHitsBox(ax, az, bx, bz, o, pad)) return true;
  return false;
}

function isCovered(x, z, ex, ez, obs) {
  const dx = x - ex, dz = z - ez;
  const l = Math.hypot(dx, dz);
  if (l < 0.001) return false;
  const px = -dz / l * 1.5, pz = dx / l * 1.5;
  if (!lineBlocked(ex, ez, x, z, obs, -OBS_SHRINK)) return false;
  if (!lineBlocked(ex, ez, x + px, z + pz, obs, -OBS_SHRINK)) return false;
  if (!lineBlocked(ex, ez, x - px, z - pz, obs, -OBS_SHRINK)) return false;
  return true;
}

function insideBlock(x, z, obs, pad) {
  for (const o of obs) {
    if (x > o.x - o.hx - pad && x < o.x + o.hx + pad &&
        z > o.z - o.hz - pad && z < o.z + o.hz + pad) return true;
  }
  return false;
}

function predict(e, t) {
  let vx = e.vx, vz = e.vz;
  const s = Math.hypot(vx, vz);
  if (s > 6) { vx = vx / s * 6; vz = vz / s * 6; }
  let x = e.x + vx * t, z = e.z + vz * t;
  if (x > 19.5) x = 19.5; if (x < -19.5) x = -19.5;
  if (z > 19.5) z = 19.5; if (z < -19.5) z = -19.5;
  return { x, z };
}

function willBeAirborne(en, t) {
  const c = en.casting;
  if (c && c.skill === 'jump') {
    if (c.phase === 'windup') return t > c.remaining - 0.03 && t < c.remaining + 0.57;
    if (c.phase === 'air') return t < c.remaining - 0.02;
    return false;
  }
  if (en.airborne) return t < 0.35;
  return false;
}

function findCover(p, me, en) {
  const obs = p.arena.obstacles;
  let best = null, bestScore = Infinity;
  const radii = [2.5, 4.5, 7, 10];
  for (let i = 0; i < 20; i++) {
    const a = i * Math.PI / 10;
    const sx = Math.sin(a), sz = Math.cos(a);
    for (const r of radii) {
      const x = me.x + sx * r, z = me.z + sz * r;
      if (Math.abs(x) > 18.5 || Math.abs(z) > 18.5) continue;
      if (insideBlock(x, z, obs, 1.6)) continue;
      if (!isCovered(x, z, en.x, en.z, obs)) continue;
      const d = Math.hypot(x - en.x, z - en.z);
      const score = d + r * 0.12;
      if (score < bestScore) { bestScore = score; best = { x, z, score }; }
    }
  }
  return best;
}

function think(p, api) {
  const me = p.self, en = p.enemy;

  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      if (e.skill === 'laser') lastLaserStart = p.t;
      else if (e.skill === 'blink') lastBlinkStart = p.t;
    } else if (e.type === 'blocked') {
      blockedUntil = p.t + 0.6;
    }
  }

  if (!me.alive || !en.alive) return;
  if (me.stunned) return;

  const obs = p.arena.obstacles;
  const dist = en.dist;
  const enSoon = predict(en, 0.3);
  const meP = { x: me.x, z: me.z };

  // ---- busy: keep steering, no new orders ----
  if (me.busy) {
    const c = me.casting;
    if (c && c.skill === 'charge' && c.phase === 'windup' && chargeAimPt) {
      api.face(chargeAimPt.x - me.x, chargeAimPt.z - me.z);
      api.move(chargeAimPt.x - me.x, chargeAimPt.z - me.z);
    } else if (c && (c.phase === 'dash')) {
      // committed, nothing to do
    } else {
      api.faceAt(enSoon.x, enSoon.z);
      if (!me.airborne) {
        const t = V.toward(meP, enSoon);
        api.move(t.x, t.z);
      }
    }
    return;
  }

  // ---- threat model ----
  const laserReadyIn = Math.max(0, lastLaserStart + 2.2 - p.t);
  const laserThreat = laserReadyIn < 0.45;
  const enemyCastingLaser = !!(en.casting && en.casting.skill === 'laser' && en.casting.telegraph);
  const lateGame = p.burnStartsIn < 6 || p.burn > 0;

  // ---- aiming ----
  api.faceAt(enSoon.x, enSoon.z);

  // ---- SMASH ----
  const selfFut = { x: me.x + me.vx * 0.18, z: me.z + me.vz * 0.18 };
  const sepAtLand = V.dist(selfFut, enSoon);
  const airLater = willBeAirborne(en, 0.3);

  if (api.ready('smash') && !airLater && sepAtLand <= 4.55) {
    api.use('smash');
    const t = V.toward(meP, enSoon);
    api.move(t.x, t.z);
    api.faceAt(enSoon.x, enSoon.z);
    return;
  }

  // ---- CHARGE ----
  if (api.ready('charge') && en.visible && !en.airborne && dist > 2.6 && dist < 12.2) {
    const tt = 0.3 + Math.max(0, dist - 2.25) / 15;
    const aim = predict(en, tt);
    const dv = { x: aim.x - me.x, z: aim.z - me.z };
    const dl = V.len(dv);
    if (dl > 0.5) {
      const ang = Math.abs(V.angleTo(me.heading, V.norm(dv)));
      const canTurn = ang <= 3.3 * 0.3 + 0.12;
      const r = api.ray(dv.x, dv.z, Math.min(dl + 0.5, 14));
      const clear = r.dist >= Math.min(dl, 13.5) - 2.6;
      const worthIt = enemyCastingLaser || dist > 4.4 || !api.ready('smash');
      if (canTurn && clear && worthIt && !en.invulnerable) {
        chargeAimPt = aim;
        api.use('charge');
        api.face(dv.x, dv.z);
        api.move(dv.x, dv.z);
        return;
      }
    }
  }

  // ---- MOVEMENT ----
  let goal = null;
  let useCover = false;

  if (en.airborne && en.casting && en.casting.skill === 'jump') {
    goal = predict(en, Math.max(0, en.casting.remaining));
  } else if (dist <= 9.5 || lateGame || !en.visible) {
    goal = enSoon;
  } else if ((laserThreat || enemyCastingLaser) && en.visible) {
    const c = findCover(p, me, en);
    if (c && c.score < dist + 3.5) { goal = c; useCover = true; }
    else goal = enSoon;
  } else {
    goal = enSoon;
  }

  if (!goal) goal = enSoon;

  const straight = !lineBlocked(me.x, me.z, goal.x, goal.z, obs, 1.15);
  if (straight && p.t > blockedUntil && !useCover) {
    const d = V.toward(meP, goal);
    if (dist < 2.4) {
      // hug: keep pressure but don't grind into them
      api.move(d.x * 0.6, d.z * 0.6);
    } else {
      api.move(d.x, d.z);
    }
  } else {
    api.moveTo(goal.x, goal.z);
  }

  if (p.t - lastSayT > 6) {
    lastSayT = p.t;
    if (dist < 5) api.say("stay still, squid");
    else if (useCover) api.say("walls are for hiding behind, both ways");
    else api.say("closing");
  }
}
