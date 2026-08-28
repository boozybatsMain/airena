const OBS_PAD_LOS = 0.0;

let lastLaserStart = -99;
let lastBlinkStart = -99;
let prevInvuln = false;
let invulnStart = -99;
let strafeSide = 1;
let lastSaid = -99;
let saidOnce = false;

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

function blocked(p, ax, az, bx, bz, pad) {
  const obs = p.arena.obstacles;
  for (let i = 0; i < obs.length; i++) {
    if (segBox(ax, az, bx, bz, obs[i], pad)) return true;
  }
  return false;
}

function inBox(p, x, z, pad) {
  const obs = p.arena.obstacles;
  for (let i = 0; i < obs.length; i++) {
    const b = obs[i];
    if (x > b.x - b.hx - pad && x < b.x + b.hx + pad && z > b.z - b.hz - pad && z < b.z + b.hz + pad) return true;
  }
  return false;
}

function hiddenFrom(p, ex, ez, x, z) {
  if (!blocked(p, ex, ez, x, z, OBS_PAD_LOS)) return false;
  const dx = x - ex, dz = z - ez;
  const L = Math.hypot(dx, dz) || 1;
  const px = -dz / L * 1.35, pz = dx / L * 1.35;
  if (!blocked(p, ex, ez, x + px, z + pz, OBS_PAD_LOS)) return false;
  if (!blocked(p, ex, ez, x - px, z - pz, OBS_PAD_LOS)) return false;
  return true;
}

function predict(p, dt) {
  const e = p.enemy;
  let x = e.x + e.vx * dt;
  let z = e.z + e.vz * dt;
  if (x > 19.2) x = 19.2; if (x < -19.2) x = -19.2;
  if (z > 19.2) z = 19.2; if (z < -19.2) z = -19.2;
  return { x, z };
}

function findCover(p, me, en, maxR) {
  let best = null, bestScore = -1e9;
  const dEn = en.dist;
  for (let i = 0; i < 20; i++) {
    const a = i * Math.PI * 2 / 20;
    const sx = Math.sin(a), sz = Math.cos(a);
    for (let k = 0; k < 3; k++) {
      const r = 2.5 + k * 2.6;
      if (r > maxR) continue;
      const x = me.x + sx * r, z = me.z + sz * r;
      if (Math.abs(x) > 18.4 || Math.abs(z) > 18.4) continue;
      if (inBox(p, x, z, 1.5)) continue;
      if (blocked(p, me.x, me.z, x, z, 1.1)) continue;
      const d = Math.hypot(x - en.x, z - en.z);
      if (d > dEn + 4.5) continue;
      const hid = hiddenFrom(p, en.x, en.z, x, z);
      let sc = -d - r * 0.12;
      if (hid) sc += 7;
      if (sc > bestScore) { bestScore = sc; best = { x, z, hid }; }
    }
  }
  return best;
}

function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en || !en.alive) return;

  for (const ev of p.events) {
    if (ev.type === 'enemyStarted') {
      if (ev.skill === 'laser') lastLaserStart = p.t;
      else if (ev.skill === 'blink') lastBlinkStart = p.t;
    }
  }
  const ec = en.casting;
  const laserCasting = !!(ec && ec.skill === 'laser' && ec.telegraph);
  if (laserCasting) lastLaserStart = p.t - (ec.elapsed || 0);
  if (en.invulnerable && !prevInvuln) invulnStart = p.t;
  prevInvuln = en.invulnerable;

  if (!saidOnce) { saidOnce = true; api.say("come here, little squid"); }

  const dist = en.dist;

  if (me.stunned) return;

  const c = me.casting;
  if (c) {
    if (c.skill === 'charge' && c.phase === 'windup') {
      const travel = Math.min(0.8, Math.max(0, dist - 2) / 15);
      const pt = predict(p, (c.remaining || 0) + travel);
      api.faceAt(pt.x, pt.z);
      return;
    }
    if (c.skill === 'smash' && c.phase === 'windup') {
      const pt = predict(p, c.remaining || 0.15);
      api.faceAt(pt.x, pt.z);
      api.move(pt.x - me.x, pt.z - me.z);
      return;
    }
    api.faceAt(en.x, en.z);
    if (c.phase === 'recover' || c.phase === 'dash') {
      if (!blocked(p, me.x, me.z, en.x, en.z, 1.0)) api.move(en.x - me.x, en.z - me.z);
      else api.moveTo(en.x, en.z);
    }
    return;
  }

  // ---- enemy state helpers ----
  let enemyAir = en.airborne;
  if (ec && ec.skill === 'jump') {
    if (ec.phase === 'windup' || ec.phase === 'air') {
      if (!(ec.phase === 'air' && ec.remaining <= 0.34)) enemyAir = true;
      else enemyAir = false;
    }
  }
  const enemyInv = en.invulnerable && (p.t - invulnStart) < 0.16;

  // ---- SMASH ----
  const pE = predict(p, 0.3);
  const dSm = Math.hypot(pE.x - me.x, pE.z - me.z);
  if (api.ready('smash') && !enemyAir && !enemyInv && dSm <= 4.85) {
    const dir = { x: pE.x - me.x, z: pE.z - me.z };
    const ang = Math.abs(V.angleTo(me.heading, dir));
    if (ang < 1.15 && !blocked(p, me.x, me.z, en.x, en.z, 0)) {
      api.use('smash');
      api.faceAt(pE.x, pE.z);
      api.move(dir.x, dir.z);
      return;
    }
  }

  // ---- CHARGE ----
  if (api.ready('charge') && !enemyInv && dist > 2.6 && dist < 12.5) {
    const corridorClear = !blocked(p, me.x, me.z, en.x, en.z, 0.85);
    if (corridorClear) {
      const interrupt = laserCasting && dist <= 7.5;
      const closer = dist >= 4.4;
      const smashSoon = api.cooldown('smash') < 0.25 && dist <= 5.0;
      if ((interrupt || closer) && !(smashSoon && !interrupt)) {
        const travel = Math.min(0.8, Math.max(0, dist - 2) / 15);
        const pt = predict(p, 0.3 + travel);
        api.use('charge');
        api.faceAt(pt.x, pt.z);
        return;
      }
    }
  }

  // ---- MOVEMENT / POSITIONING ----
  api.faceAt(pE.x, pE.z);

  // melee band: glue to them
  if (dist <= 6.6) {
    if (!blocked(p, me.x, me.z, en.x, en.z, 1.0)) {
      let dx = en.x - me.x, dz = en.z - me.z;
      const L = Math.hypot(dx, dz) || 1;
      dx /= L; dz /= L;
      if (laserCasting && dist > 3.2) {
        const px = -dz * strafeSide, pz = dx * strafeSide;
        api.move(dx * 0.75 + px * 0.85, dz * 0.75 + pz * 0.85);
      } else {
        api.move(dx, dz);
      }
    } else {
      api.moveTo(en.x, en.z);
    }
    return;
  }

  const nextLaserReady = lastLaserStart + 2.2;
  const threatened = en.visible && (laserCasting || p.t >= nextLaserReady - 0.15);

  if (!en.visible || !threatened || dist <= 10.5) {
    api.moveTo(en.x, en.z);
    return;
  }

  // exposed at range with a laser available: use cover
  const budget = laserCasting ? Math.max(1.5, (ec.remaining || 0.3) * 5.35) : 7.6;
  const cover = findCover(p, me, en, budget);
  if (cover && cover.hid) {
    api.moveTo(cover.x, cover.z);
    return;
  }

  if (laserCasting) {
    let dx = en.x - me.x, dz = en.z - me.z;
    const L = Math.hypot(dx, dz) || 1;
    dx /= L; dz /= L;
    const px = -dz * strafeSide, pz = dx * strafeSide;
    let tx = me.x + (dx * 0.6 + px) * 4, tz = me.z + (dz * 0.6 + pz) * 4;
    if (Math.abs(tx) > 18.5 || Math.abs(tz) > 18.5 || inBox(p, tx, tz, 1.4)) {
      strafeSide = -strafeSide;
      tx = me.x + (dx * 0.6 - px) * 4; tz = me.z + (dz * 0.6 - pz) * 4;
    }
    api.move(tx - me.x, tz - me.z);
    return;
  }

  if (cover) api.moveTo(cover.x, cover.z);
  else api.moveTo(en.x, en.z);
}
