function angdiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function segAABB(ax, az, bx, bz, minx, minz, maxx, maxz) {
  const dx = bx - ax, dz = bz - az;
  let t0 = 0, t1 = 1;
  if (Math.abs(dx) < 1e-9) {
    if (ax < minx || ax > maxx) return false;
  } else {
    let ta = (minx - ax) / dx, tb = (maxx - ax) / dx;
    if (ta > tb) { const t = ta; ta = tb; tb = t; }
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  if (Math.abs(dz) < 1e-9) {
    if (az < minz || az > maxz) return false;
  } else {
    let ta = (minz - az) / dz, tb = (maxz - az) / dz;
    if (ta > tb) { const t = ta; ta = tb; tb = t; }
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  return true;
}

function segBlocked(ax, az, bx, bz, obs, pad) {
  for (const o of obs) {
    if (segAABB(ax, az, bx, bz, o.x - o.hx - pad, o.z - o.hz - pad, o.x + o.hx + pad, o.z + o.hz + pad)) return true;
  }
  return false;
}

function predict(en, t, arena) {
  const lim = arena.half - 1.4;
  let x = en.x + en.vx * t;
  let z = en.z + en.vz * t;
  if (x > lim) x = lim; if (x < -lim) x = -lim;
  if (z > lim) z = lim; if (z < -lim) z = -lim;
  return { x, z };
}

function coverPoint(p, api) {
  const me = p.self, en = p.enemy, obs = p.arena.obstacles;
  const lim = p.arena.half - 1.6;
  let best = null, bestScore = 1e9;
  const here = Math.hypot(en.x - me.x, en.z - me.z);
  for (const o of obs) {
    const ox = o.hx + 2.0, oz = o.hz + 2.0;
    const cands = [
      { x: o.x + ox, z: o.z }, { x: o.x - ox, z: o.z },
      { x: o.x, z: o.z + oz }, { x: o.x, z: o.z - oz },
      { x: o.x + ox, z: o.z + oz }, { x: o.x - ox, z: o.z + oz },
      { x: o.x + ox, z: o.z - oz }, { x: o.x - ox, z: o.z - oz }
    ];
    for (const c of cands) {
      if (c.x > lim || c.x < -lim || c.z > lim || c.z < -lim) continue;
      const dE = Math.hypot(en.x - c.x, en.z - c.z);
      if (dE > here - 2.0) continue;
      if (dE < 4.0) continue;
      if (!segBlocked(en.x, en.z, c.x, c.z, obs, 0)) continue;
      const pth = api.pathTo(c.x, c.z);
      if (!pth) continue;
      if (pth.dist > here * 2.0 + 6) continue;
      const score = pth.dist + 1.1 * dE;
      if (score < bestScore) { bestScore = score; best = c; }
    }
  }
  return best;
}

let saidOnce = false;

function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en.alive) return;
  const arena = p.arena;
  const dist = en.dist;
  const touchD = me.radius + en.radius;

  if (!saidOnce) { saidOnce = true; api.say("come here, little squid"); }

  // --- locked / busy states -------------------------------------------------
  if (me.airborne) {
    api.faceAt(en.x, en.z);
    return;
  }
  const c = me.casting;
  if (c) {
    if (c.skill === 'charge' && c.phase === 'windup') {
      const tt = Math.max(0, 0.3 - c.elapsed) + Math.max(0, dist - touchD) / 15;
      const ip = predict(en, Math.min(1.1, tt), arena);
      api.faceAt(ip.x, ip.z);
      api.move(ip.x - me.x, ip.z - me.z);
      return;
    }
    if (c.skill === 'smash' && c.telegraph) {
      const rem = Math.min(0.3, Math.max(0, c.remaining));
      const sp = predict(en, rem, arena);
      api.faceAt(sp.x, sp.z);
      api.move(sp.x - me.x, sp.z - me.z);
      return;
    }
    if (c.phase === 'dash') {
      return;
    }
    // recovery: keep pressing
  }

  // --- aiming ---------------------------------------------------------------
  const face = predict(en, 0.16, arena);
  api.faceAt(face.x, face.z);

  // --- smash ----------------------------------------------------------------
  let ordered = false;
  const landPt = predict(en, 0.3, arena);
  const ldx = landPt.x - me.x, ldz = landPt.z - me.z;
  const ld = Math.hypot(ldx, ldz) || 0.001;
  const desired = Math.atan2(ldx, ldz);
  const err = Math.abs(angdiff(desired, me.heading));
  const canTurn = 0.55 * me.turnRate * 0.3;
  const residual = Math.max(0, err - canTurn);
  const spread = 0.90 + Math.asin(Math.min(0.99, en.radius / Math.max(en.radius + 0.2, ld)));
  const enemyUp = en.airborne && !(en.casting && en.casting.remaining <= 0.18);

  if (!ordered && api.ready('smash') && !enemyUp && ld <= touchD + 2.55 && residual <= spread - 0.22 && api.los(landPt.x, landPt.z)) {
    api.use('smash');
    ordered = true;
  }

  // --- charge ---------------------------------------------------------------
  if (!ordered && api.ready('charge') && en.visible && !en.invulnerable && !enemyUp) {
    const flight = Math.max(0, dist - touchD) / 15;
    const tImp = 0.3 + flight;
    const ip = predict(en, tImp, arena);
    const dx = ip.x - me.x, dz = ip.z - me.z;
    const travel = Math.hypot(dx, dz);
    const smashSoon = api.cooldown('smash') < 0.25 && dist < touchD + 2.6;
    if (travel > 3.0 && travel < 11.5 && !smashSoon) {
      const nx = dx / travel, nz = dz / travel;
      const r = api.ray(nx, nz, Math.min(13, travel + 1.2));
      const clear = (!r.hit) || r.dist >= travel - 0.6;
      const turnNeed = Math.abs(angdiff(Math.atan2(dx, dz), me.heading));
      if (clear && turnNeed < 0.85 * me.turnRate * 0.3 + 0.35) {
        api.use('charge');
        api.faceAt(ip.x, ip.z);
        ordered = true;
      }
    }
  }

  // --- movement -------------------------------------------------------------
  let moveSet = false;
  const useCover = dist > 10.5 && en.visible && p.t < 33 && me.hp > 45;
  if (useCover) {
    const cp = coverPoint(p, api);
    if (cp) { api.moveTo(cp.x, cp.z); moveSet = true; }
  }

  if (!moveSet) {
    if (!en.visible) {
      api.moveTo(en.x, en.z);
    } else {
      const lead = Math.min(0.55, Math.max(0.12, (dist - touchD) / 8));
      const tgt = predict(en, lead, arena);
      const pth = api.pathTo(tgt.x, tgt.z);
      if (pth && !pth.direct && pth.points && pth.points.length) {
        api.moveTo(tgt.x, tgt.z);
      } else {
        let dx = tgt.x - me.x, dz = tgt.z - me.z;
        const dl = Math.hypot(dx, dz) || 1;
        dx /= dl; dz /= dl;
        // slight orbit when hugging, to keep out of walls and off their nose
        if (dist < touchD + 1.4 && api.cooldown('smash') > 0.35) {
          const side = ((p.tick >> 5) & 1) ? 1 : -1;
          dx += side * -dz * 0.55;
          dz += side * dx * 0.0;
        }
        api.move(dx, dz);
      }
    }
  }
}
