const ECD = { laser: 2.2, blink: 3.9, jump: 2.8 };
let enemyReady = { laser: 0, blink: 0, jump: 0 };
let lastSay = -99;
let chargeAt = -99;

function segAABB(ax, az, bx, bz, minx, minz, maxx, maxz) {
  const dx = bx - ax, dz = bz - az;
  let t0 = 0, t1 = 1;
  for (let i = 0; i < 2; i++) {
    const pd = i ? dz : dx;
    const st = i ? az : ax;
    const mn = i ? minz : minx;
    const mx = i ? maxz : maxx;
    if (Math.abs(pd) < 1e-9) {
      if (st < mn || st > mx) return false;
    } else {
      let ta = (mn - st) / pd, tb = (mx - st) / pd;
      if (ta > tb) { const q = ta; ta = tb; tb = q; }
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
      if (t0 > t1) return false;
    }
  }
  return true;
}

function blockedSeg(ax, az, bx, bz, obs, shrink) {
  for (const o of obs) {
    const hx = o.hx - shrink, hz = o.hz - shrink;
    if (hx <= 0.05 || hz <= 0.05) continue;
    if (segAABB(ax, az, bx, bz, o.x - hx, o.z - hz, o.x + hx, o.z + hz)) return true;
  }
  return false;
}

function predict(e, t) {
  return { x: e.x + e.vx * t, z: e.z + e.vz * t };
}

function rayOffset(px, pz, ox, oz, dx, dz) {
  const vx = px - ox, vz = pz - oz;
  const along = vx * dx + vz * dz;
  if (along < 0.2) return 6;
  return Math.abs(vx * dz - vz * dx);
}

function wrap(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function think(p, api) {
  const s = p.self, e = p.enemy;
  if (!s.alive) return;

  for (const ev of p.events) {
    if (ev.type === 'enemyStarted' && ECD[ev.skill] !== undefined) {
      enemyReady[ev.skill] = p.t + ECD[ev.skill];
    }
  }

  const obs = p.arena.obstacles;
  const canAct = !s.busy && !s.stunned && !s.airborne;

  // ---- threat model: incoming laser ----
  let threat = null;
  if (e.casting && e.casting.skill === 'laser' && e.casting.telegraph) {
    const rem = Math.max(0.03, e.casting.remaining);
    const fh = e.heading;
    const toUs = Math.atan2(s.x - e.x, s.z - e.z);
    const d = wrap(toUs - fh);
    const maxTurn = 6 * 0.35 * rem;
    const dd = Math.max(-maxTurn, Math.min(maxTurn, d));
    const ah = fh + dd;
    threat = {
      mx: e.x + Math.sin(ah) * 1.2,
      mz: e.z + Math.cos(ah) * 1.2,
      dx: Math.sin(ah), dz: Math.cos(ah),
      rem: rem
    };
  }
  const laserSoon = (p.t >= enemyReady.laser - 0.35) && e.visible;

  // ---- offensive decisions ----
  let acted = false;
  let orderedCharge = false;

  if (canAct) {
    const enemySafe = e.invulnerable || e.airborne ||
      (e.casting && e.casting.skill === 'jump');

    // SMASH
    if (api.ready('smash')) {
      const pe = predict(e, 0.28);
      const dPred = Math.hypot(pe.x - s.x, pe.z - s.z);
      if (dPred <= 4.8 && !enemySafe) {
        const ang = Math.abs(wrap(Math.atan2(pe.x - s.x, pe.z - s.z) - s.heading));
        if (ang < 1.2) {
          api.use('smash');
          acted = true;
        }
      }
    }

    // CHARGE
    if (!acted && api.ready('charge') && e.visible && !e.invulnerable) {
      const dn = e.dist;
      const wantIt = threat ? (dn >= 2.6 && dn <= 12.0)
                            : (dn >= 4.6 && dn <= 11.5);
      if (wantIt) {
        api.use('charge');
        acted = true;
        orderedCharge = true;
        chargeAt = p.t;
      }
    }
  }

  // ---- facing ----
  let faceP = predict(e, 0.16);
  const chargingWindup = (s.casting && s.casting.skill === 'charge' && s.casting.phase === 'windup');
  if (chargingWindup || orderedCharge) {
    const rem = chargingWindup ? Math.max(0.02, s.casting.remaining) : 0.28;
    let tt = rem + e.dist / 15;
    let ip = predict(e, tt);
    tt = rem + Math.hypot(ip.x - s.x, ip.z - s.z) / 15;
    ip = predict(e, tt);
    ip.x = Math.max(-19.5, Math.min(19.5, ip.x));
    ip.z = Math.max(-19.5, Math.min(19.5, ip.z));
    faceP = ip;
  }
  api.faceAt(faceP.x, faceP.z);

  // ---- movement ----
  if (s.airborne || s.stunned) return;

  if (!e.visible) {
    const path = api.pathTo(e.x, e.z);
    if (path && path.points && path.points.length > 0) {
      const wp = path.points[0];
      const d0 = Math.hypot(wp.x - s.x, wp.z - s.z);
      if (d0 < 0.8 && path.points.length > 1) {
        api.moveTo(path.points[1].x, path.points[1].z);
      } else {
        api.moveTo(wp.x, wp.z);
      }
    } else {
      api.move(e.x - s.x, e.z - s.z);
    }
    return;
  }

  const LA = threat ? Math.max(0.22, Math.min(0.55, threat.rem)) : 0.45;
  let spd = s.maxSpeed;
  if (s.casting) {
    const ph = s.casting.phase;
    if (s.casting.skill === 'charge' && ph === 'windup') spd *= 0.2;
    else if (s.casting.skill === 'smash' && ph === 'windup') spd *= 0.3;
  }
  const step = Math.max(0.6, spd * LA);
  const target = predict(e, LA * 0.8);
  const desired = 2.0;
  const lim = 19.4 - s.radius;

  let bestScore = -1e9, bx = 0, bz = 0;
  for (let i = 0; i < 24; i++) {
    const a = i * Math.PI * 2 / 24;
    const dx = Math.sin(a), dz = Math.cos(a);
    const fx = s.x + dx * step, fz = s.z + dz * step;
    let sc = 0;

    if (Math.abs(fx) > lim || Math.abs(fz) > lim) sc -= 55;
    const ox = Math.min(19.9, Math.max(-19.9, fx));
    const oz = Math.min(19.9, Math.max(-19.9, fz));

    let hitBox = false;
    for (const o of obs) {
      if (Math.abs(ox - o.x) < o.hx + s.radius + 0.2 && Math.abs(oz - o.z) < o.hz + s.radius + 0.2) {
        hitBox = true; break;
      }
    }
    if (hitBox) sc -= 70;

    const d = Math.hypot(ox - target.x, oz - target.z);
    sc -= Math.abs(d - desired) * 3.4;

    if (threat) {
      if (blockedSeg(threat.mx, threat.mz, ox, oz, obs, 0.5)) {
        sc += 38;
      } else {
        const off = rayOffset(ox, oz, threat.mx, threat.mz, threat.dx, threat.dz);
        const w = 9 * Math.max(0.35, Math.min(2.2, 4.5 / Math.max(1, e.dist)));
        sc += Math.min(off, 3.6) * w;
      }
    } else if (laserSoon && e.dist > 3.0) {
      const mdx = Math.sin(e.heading), mdz = Math.cos(e.heading);
      const off = rayOffset(ox, oz, e.x + mdx * 1.2, e.z + mdz * 1.2, mdx, mdz);
      sc += Math.min(off, 3.0) * 2.2;
      if (blockedSeg(e.x, e.z, ox, oz, obs, 0.5) && e.dist > 9) sc += 10;
    }

    // small preference for continuing current motion (less jitter)
    if (s.speed > 0.4) {
      const cvx = s.vx / s.speed, cvz = s.vz / s.speed;
      sc += (dx * cvx + dz * cvz) * 1.6;
    }

    if (sc > bestScore) { bestScore = sc; bx = dx; bz = dz; }
  }

  api.move(bx, bz);

  if (p.t - lastSay > 7) {
    lastSay = p.t;
    if (e.dist < 4) api.say("close enough.");
    else if (threat) api.say("beam telegraphed.");
    else api.say("closing.");
  }
}
