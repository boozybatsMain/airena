const MEM = {
  laserAt: -99,
  blinkAt: -99,
  jumpAt: -99,
  lastDir: { x: 0, z: 1 },
  orbit: 1,
  orbitAt: 0,
  lastT: -1
};

function resetMem() {
  MEM.laserAt = -99;
  MEM.blinkAt = -99;
  MEM.jumpAt = -99;
  MEM.lastDir = { x: 0, z: 1 };
  MEM.orbit = 1;
  MEM.orbitAt = 0;
}

function segHitsBox(ax, az, bx, bz, box, pad) {
  const minx = box.x - box.hx - pad, maxx = box.x + box.hx + pad;
  const minz = box.z - box.hz - pad, maxz = box.z + box.hz + pad;
  const dx = bx - ax, dz = bz - az;
  let t0 = 0, t1 = 1;
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

function clearPath(obs, ax, az, bx, bz, pad) {
  for (const o of obs) {
    if (segHitsBox(ax, az, bx, bz, o, pad)) return false;
  }
  return true;
}

function predict(en, t) {
  return { x: en.x + en.vx * t, z: en.z + en.vz * t };
}

function angDiff(heading, dir) {
  return V.angleTo(heading, dir);
}

function chooseDir(p, opts) {
  const me = p.self, en = p.enemy;
  const half = p.arena.half, obs = p.arena.obstacles;
  const step = opts.step;
  const beam = V.fromHeading(en.heading);
  let best = null, bestS = -1e9;
  for (let i = 0; i < 24; i++) {
    const a = i * Math.PI * 2 / 24;
    const dir = { x: Math.sin(a), z: Math.cos(a) };
    const f = { x: me.x + dir.x * step, z: me.z + dir.z * step };
    if (Math.abs(f.x) > half - 1.6 || Math.abs(f.z) > half - 1.6) continue;
    if (!clearPath(obs, me.x, me.z, f.x, f.z, me.radius * 0.85)) continue;
    let s = 0;
    const nd = Math.hypot(f.x - en.x, f.z - en.z);
    s += opts.progW * (en.dist - nd);
    if (opts.hideW > 0 && !clearPath(obs, en.x, en.z, f.x, f.z, 0)) s += opts.hideW;
    if (opts.latW > 0) {
      const rx = f.x - en.x, rz = f.z - en.z;
      const along = rx * beam.x + rz * beam.z;
      const lat = Math.abs(rx * beam.z - rz * beam.x);
      if (along > 0) s += opts.latW * Math.min(lat, 4.5);
      else s += opts.latW * 2;
    }
    s += 0.7 * (dir.x * MEM.lastDir.x + dir.z * MEM.lastDir.z);
    if (s > bestS) { bestS = s; best = dir; }
  }
  return best;
}

function chargeSolution(p) {
  const me = p.self, en = p.enemy;
  let t = 0.35;
  let f = { x: en.x, z: en.z };
  for (let i = 0; i < 4; i++) {
    f = predict(en, t);
    const dd = Math.hypot(f.x - me.x, f.z - me.z) - 2.15;
    t = 0.3 + Math.max(0, dd) / 15;
  }
  const dir = V.toward({ x: me.x, z: me.z }, f);
  return { dir, t, target: f, travel: Math.hypot(f.x - me.x, f.z - me.z) - 2.15 };
}

function chargeUsable(p, api, sol, maxDist) {
  if (sol.travel > maxDist) return false;
  if (sol.travel > 11.6) return false;
  const need = Math.max(0.5, sol.travel);
  const r = api.ray(sol.dir.x, sol.dir.z, need + 1.2);
  if (r && r.hit && r.dist + 0.4 < need) return false;
  return true;
}

function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive) return;
  if (p.t < MEM.lastT) resetMem();
  MEM.lastT = p.t;

  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      if (e.skill === 'laser') MEM.laserAt = p.t;
      else if (e.skill === 'blink') MEM.blinkAt = p.t;
      else if (e.skill === 'jump') MEM.jumpAt = p.t;
    } else if (e.type === 'blocked') {
      MEM.orbit = -MEM.orbit;
      MEM.orbitAt = p.t;
    }
  }

  const obs = p.arena.obstacles;
  const d = en.dist;
  const mePos = { x: me.x, z: me.z };
  const toE = V.toward(mePos, { x: en.x, z: en.z });

  // ---- while busy: only facing (and gentle movement) matter ----
  if (me.busy) {
    const c = me.casting;
    if (c && c.skill === 'charge' && c.phase === 'windup') {
      const sol = chargeSolution(p);
      api.face(sol.dir.x, sol.dir.z);
      return;
    }
    if (c && c.skill === 'smash' && c.phase === 'windup') {
      const f = predict(en, Math.max(0, c.remaining));
      api.faceAt(f.x, f.z);
      api.move(toE.x, toE.z);
      return;
    }
    api.faceAt(en.x, en.z);
    if (!me.airborne && c && c.phase === 'recover') api.move(toE.x, toE.z);
    return;
  }

  if (me.stunned || me.airborne) {
    api.faceAt(en.x, en.z);
    return;
  }

  const enCast = en.casting;
  const laserCasting = !!(enCast && enCast.skill === 'laser' && enCast.telegraph);
  const laserReady = (p.t - MEM.laserAt) >= 2.15;

  const smashReady = api.ready('smash');
  const chargeReady = api.ready('charge');

  const pE = predict(en, 0.3);
  const pd = Math.hypot(pE.x - me.x, pE.z - me.z);
  const aimAng = Math.abs(angDiff(me.heading, V.toward(mePos, pE)));
  const canSmash = smashReady && !en.invulnerable && !en.airborne &&
                   pd <= 4.75 && aimAng < 1.55;

  // ---- their laser is in the air: punish or evade ----
  if (laserCasting) {
    if (canSmash) {
      api.faceAt(pE.x, pE.z);
      api.use('smash');
      api.move(toE.x, toE.z);
      return;
    }
    if (chargeReady && !en.invulnerable) {
      const sol = chargeSolution(p);
      if (sol.travel <= 9.5 && chargeUsable(p, api, sol, 9.5) &&
          Math.abs(angDiff(me.heading, sol.dir)) < 0.95) {
        api.face(sol.dir.x, sol.dir.z);
        api.use('charge');
        return;
      }
    }
    const dir = chooseDir(p, { hideW: 26, progW: 0.55, latW: 2.2, step: 3.0 });
    if (dir) { MEM.lastDir = dir; api.move(dir.x, dir.z); }
    else api.moveTo(en.x, en.z);
    api.faceAt(en.x, en.z);
    return;
  }

  // ---- melee ----
  if (canSmash) {
    api.faceAt(pE.x, pE.z);
    api.use('smash');
    api.move(toE.x, toE.z);
    return;
  }

  // ---- charge as gap closer / punish ----
  if (chargeReady && !en.invulnerable && d > 4.4 && en.visible) {
    const sol = chargeSolution(p);
    if (sol.travel > 1.5 && chargeUsable(p, api, sol, 11.2)) {
      if (Math.abs(angDiff(me.heading, sol.dir)) < 0.9) {
        api.face(sol.dir.x, sol.dir.z);
        api.use('charge');
        return;
      } else {
        api.face(sol.dir.x, sol.dir.z);
        api.move(toE.x, toE.z);
        return;
      }
    }
  }

  // ---- movement ----
  if (!en.visible) {
    api.moveTo(en.x, en.z);
    api.faceAt(en.x, en.z);
    return;
  }

  if (d > 6.2) {
    const hideW = laserReady && d > 7 ? 11 : 0;
    const dir = chooseDir(p, { hideW, progW: 1.7, latW: 0, step: 3.3 });
    if (dir) { MEM.lastDir = dir; api.move(dir.x, dir.z); }
    else api.moveTo(en.x, en.z);
    api.faceAt(en.x, en.z);
    return;
  }

  // close quarters: stick to them, drift around a little
  if (p.t - MEM.orbitAt > 1.4) {
    MEM.orbitAt = p.t;
    if (api.rand() < 0.35) MEM.orbit = -MEM.orbit;
  }
  const perp = V.perp(toE);
  const s = MEM.orbit;
  let dir;
  if (d < 2.5) dir = V.norm({ x: toE.x * 0.15 + perp.x * s, z: toE.z * 0.15 + perp.z * s });
  else dir = V.norm({ x: toE.x + perp.x * 0.5 * s, z: toE.z + perp.z * 0.5 * s });

  const f = { x: me.x + dir.x * 2.2, z: me.z + dir.z * 2.2 };
  const half = p.arena.half;
  if (Math.abs(f.x) > half - 1.5 || Math.abs(f.z) > half - 1.5 ||
      !clearPath(obs, me.x, me.z, f.x, f.z, me.radius * 0.8)) {
    MEM.orbit = -MEM.orbit;
    dir = V.norm({ x: toE.x + perp.x * 0.5 * MEM.orbit, z: toE.z + perp.z * 0.5 * MEM.orbit });
  }
  MEM.lastDir = dir;
  api.move(dir.x, dir.z);
  api.faceAt(pE.x, pE.z);
}
