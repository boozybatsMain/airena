function segBox(ax, az, bx, bz, minx, minz, maxx, maxz) {
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dz = bz - az;
  const P = [-dx, dx, -dz, dz];
  const Q = [ax - minx, maxx - ax, az - minz, maxz - az];
  for (let i = 0; i < 4; i++) {
    if (P[i] === 0) {
      if (Q[i] < 0) return false;
    } else {
      const r = Q[i] / P[i];
      if (P[i] < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
      else { if (r < t0) return false; if (r < t1) t1 = r; }
    }
  }
  return true;
}

function segBlocked(ax, az, bx, bz, obs, grow) {
  for (const o of obs) {
    const hx = o.hx + grow, hz = o.hz + grow;
    if (hx <= 0.05 || hz <= 0.05) continue;
    if (segBox(ax, az, bx, bz, o.x - hx, o.z - hz, o.x + hx, o.z + hz)) return true;
  }
  return false;
}

let lastLaser = -99;
let lastBlink = -99;
let chargeAim = null;
let hitCount = 0;
let saidOnce = false;

function predictEnemy(e, t) {
  let x = e.x + e.vx * t;
  let z = e.z + e.vz * t;
  if (x > 19.5) x = 19.5; if (x < -19.5) x = -19.5;
  if (z > 19.5) z = 19.5; if (z < -19.5) z = -19.5;
  return { x, z };
}

function chooseDir(p, api, me, e, urgency) {
  const base = V.toward(me, e);
  if (base.x === 0 && base.z === 0) return { x: 0, z: 1 };
  const obs = p.arena.obstacles;
  let best = null, bs = -1e9;
  for (let i = -7; i <= 7; i++) {
    const off = i * 0.3;
    const dir = V.rot(base, off);
    let clear = 4.5;
    const ray = api.ray(dir.x, dir.z, 4.5);
    if (ray && ray.hit) clear = ray.dist;
    if (clear < 1.9) continue;
    const step = Math.min(3.0, clear - 1.5);
    const px = me.x + dir.x * step, pz = me.z + dir.z * step;
    if (Math.abs(px) > 19.3 || Math.abs(pz) > 19.3) continue;
    const nd = Math.hypot(e.x - px, e.z - pz);
    const exposed = !segBlocked(px, pz, e.x, e.z, obs, -0.45);
    let s = -nd;
    if (exposed) s -= urgency;
    s -= Math.abs(off) * 0.45;
    const wall = Math.max(Math.abs(px), Math.abs(pz));
    if (wall > 17) s -= (wall - 17) * 2.5;
    if (s > bs) { bs = s; best = dir; }
  }
  return best || base;
}

function think(p, api) {
  const me = p.self, e = p.enemy;

  for (const ev of p.events) {
    if (ev.type === 'enemyStarted') {
      if (ev.skill === 'laser') lastLaser = p.t;
      else if (ev.skill === 'blink') lastBlink = p.t;
    } else if (ev.type === 'dealt') {
      hitCount++;
    }
  }

  if (!me.alive || !e.alive) return;
  if (!saidOnce) { saidOnce = true; api.say("Come here, little squid."); }
  if (me.stunned) return;

  // --- locked states ---
  if (me.casting) {
    const c = me.casting;
    if (c.skill === 'charge') {
      if (c.phase === 'windup') {
        const t = Math.max(0.05, c.remaining) + Math.max(0, e.dist - 2.2) / 15;
        const pe = predictEnemy(e, t);
        chargeAim = pe;
        api.faceAt(pe.x, pe.z);
      }
      return;
    }
    if (c.phase === 'air' || me.airborne) {
      api.faceAt(e.x, e.z);
      return;
    }
    if (c.skill === 'smash' && c.phase === 'windup') {
      const pe = predictEnemy(e, Math.max(0.03, c.remaining));
      api.faceAt(pe.x, pe.z);
      const d = Math.hypot(pe.x - me.x, pe.z - me.z);
      if (d > 2.2) api.move(pe.x - me.x, pe.z - me.z);
      else api.move(0, 0);
      return;
    }
    if (c.phase === 'recover') {
      api.faceAt(e.x, e.z);
      // keep the standing move order
    }
  }

  const dist = e.dist;
  const enemyCastingLaser = !!(e.casting && e.casting.skill === 'laser' && e.casting.telegraph);
  const laserThreat = (p.t - lastLaser) > 2.0;

  // --- facing ---
  const facePt = predictEnemy(e, Math.min(0.3, dist / 12));
  api.faceAt(facePt.x, facePt.z);

  // --- offense ---
  let acted = false;

  if (!me.busy && !me.airborne) {
    // SMASH
    const tS = 0.36;
    const pe = predictEnemy(e, tS);
    const mx = me.x + me.vx * tS * 0.6, mz = me.z + me.vz * tS * 0.6;
    const dS = Math.hypot(pe.x - mx, pe.z - mz);
    const ang = Math.abs(V.angleTo(me.heading, V.toward({ x: mx, z: mz }, pe)));
    const enemyGone = e.airborne || (e.casting && e.casting.skill === 'jump');
    if (api.ready('smash') && dS <= 4.75 && ang < 1.05 && !enemyGone && !e.invulnerable) {
      api.use('smash');
      acted = true;
    }
  }

  if (!acted && !me.busy && !me.airborne && api.ready('charge')) {
    const tHit = 0.32 + Math.max(0, dist - 2.2) / 15;
    const pe2 = predictEnemy(e, tHit);
    const dv = { x: pe2.x - me.x, z: pe2.z - me.z };
    const d2 = V.len(dv);
    if (d2 > 0.5) {
      const dir = V.norm(dv);
      const r = api.ray(dir.x, dir.z, Math.min(d2 + 1.0, 13));
      const clearOK = !r.hit || r.dist >= d2 - 1.8;
      const worth = (enemyCastingLaser && d2 <= 11.5) || (d2 >= 4.2 && d2 <= 11.0);
      if (clearOK && d2 >= 2.8 && worth && e.visible && !e.invulnerable && !e.airborne) {
        chargeAim = pe2;
        api.faceAt(pe2.x, pe2.z);
        api.use('charge');
        acted = true;
      }
    }
  }

  // --- movement ---
  if (!e.visible) {
    if (dist > 3) api.moveTo(e.x, e.z);
    else api.move(e.x - me.x, e.z - me.z);
    return;
  }

  let urgency = 0;
  if (enemyCastingLaser) urgency = 14;
  else if (laserThreat && dist > 6.5) urgency = 5;

  if (dist <= 6.0 || urgency === 0) {
    // straight aggression
    const path = api.pathTo(e.x, e.z);
    let dir = V.toward(me, e);
    if (path && !path.direct && path.points && path.points.length) {
      for (const wp of path.points) {
        const dd = Math.hypot(wp.x - me.x, wp.z - me.z);
        if (dd > 1.0) { dir = V.norm({ x: wp.x - me.x, z: wp.z - me.z }); break; }
      }
    }
    if (dist < 1.9) {
      const side = V.perp(dir);
      api.move(dir.x * 0.4 + side.x * 0.6, dir.z * 0.4 + side.z * 0.6);
    } else {
      api.move(dir.x, dir.z);
    }
  } else {
    const dir = chooseDir(p, api, me, e, urgency);
    api.move(dir.x, dir.z);
  }
}
