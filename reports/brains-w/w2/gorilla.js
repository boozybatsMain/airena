function think(p, api) {
  const s = p.self, e = p.enemy;
  if (!s || !s.alive) return;
  const obs = p.arena.obstacles;

  // ---- event bookkeeping ----
  for (const ev of p.events) {
    if (ev.type === 'enemyStarted') {
      if (ev.skill === 'laser') { M.laserReadyAt = p.t + 2.2; M.sawLaser = true; }
      else if (ev.skill === 'blink') { M.blinkReadyAt = p.t + 3.933; }
      else if (ev.skill === 'jump') { M.enemyJumpAt = p.t; }
    } else if (ev.type === 'damaged') {
      if (ev.skill === 'laser') M.laserReadyAt = Math.max(M.laserReadyAt, p.t + 2.15);
    } else if (ev.type === 'blocked') {
      M.blockedAt = p.t;
    }
  }
  if (p.t < 0.2) { api.say("come here, little squid"); }

  const dist = e.dist;
  const telegraph = !!(e.casting && e.casting.telegraph && e.casting.skill === 'laser');
  const laserThreat = telegraph || (p.t >= M.laserReadyAt - 0.30);

  // ---- predicted enemy positions ----
  const ev_x = clampNum(e.vx, -6, 6), ev_z = clampNum(e.vz, -6, 6);
  const pred = (dt) => ({ x: e.x + ev_x * dt, z: e.z + ev_z * dt });

  let moveOrder = null;   // {type:'dir'|'to', x, z}
  let faceOrder = null;   // {x,z} direction
  let skillOrder = null;

  // ================= SKILLS =================
  const canAct = !s.busy && !s.stunned && !s.airborne;
  const enemyHittable = !e.invulnerable && !e.airborne;

  // keep charge aim updated during its wind-up
  if (s.casting && s.casting.skill === 'charge' && s.casting.phase === 'windup') {
    const tc = 0.3 + Math.max(0, dist - 2.2) / 15;
    const aim = pred(tc * 0.85);
    faceOrder = { x: aim.x - s.x, z: aim.z - s.z };
    moveOrder = { type: 'dir', x: aim.x - s.x, z: aim.z - s.z };
  }

  if (canAct) {
    // ---- SMASH ----
    const smashT = 0.3;
    const sp = pred(smashT);
    const myx = s.x + s.vx * smashT * 0.35, myz = s.z + s.vz * smashT * 0.35;
    const d2 = Math.hypot(sp.x - myx, sp.z - myz);
    const angNow = angDiff(s.heading, Math.atan2(sp.x - s.x, sp.z - s.z));
    const smashReach = 2.9 + s.radius + e.radius - 0.35;
    if (api.ready('smash') && enemyHittable && d2 <= smashReach && Math.abs(angNow) < 1.05) {
      skillOrder = ['smash'];
      faceOrder = { x: sp.x - s.x, z: sp.z - s.z };
    }

    // ---- CHARGE ----
    if (!skillOrder && api.ready('charge') && enemyHittable && dist >= 3.6 && dist <= 12.2) {
      const tc = 0.3 + Math.max(0, dist - 2.2) / 15;
      const aim = pred(tc * 0.85);
      const ax = clampNum(aim.x, -19.3, 19.3), az = clampNum(aim.z, -19.3, 19.3);
      const clear = !boxHit(s.x, s.z, ax, az, obs, s.radius * 0.75);
      const worth = telegraph || dist > 5.0 || !api.ready('smash');
      if (clear && worth && e.visible) {
        skillOrder = ['charge'];
        faceOrder = { x: ax - s.x, z: az - s.z };
        moveOrder = { type: 'dir', x: ax - s.x, z: az - s.z };
      }
    }
  }

  // ================= MOVEMENT =================
  if (!moveOrder) {
    if (dist <= 6.8 && e.visible) {
      // melee: press them, drift slightly to their open side
      const t = V.toward({ x: s.x, z: s.z }, { x: e.x, z: e.z });
      let mx = t.x, mz = t.z;
      if (dist < 2.9) {
        // slight orbit so we don't just shove into a corner
        const per = V.perp(t);
        const sgn = M.orbit;
        mx += per.x * 0.55 * sgn; mz += per.z * 0.55 * sgn;
      }
      moveOrder = { type: 'dir', x: mx, z: mz };
    } else if (!e.visible) {
      moveOrder = { type: 'to', x: e.x, z: e.z };
    } else if (!laserThreat) {
      moveOrder = { type: 'to', x: e.x, z: e.z };
    } else {
      // cover-seeking advance
      let goal = { x: e.x, z: e.z };
      const path = api.pathTo(e.x, e.z);
      if (path && !path.direct && path.points && path.points.length) {
        for (const pt of path.points) {
          if (Math.hypot(pt.x - s.x, pt.z - s.z) > 1.3) { goal = pt; break; }
        }
      }
      let coverW = dist > 14 ? 7.0 : (dist > 9.5 ? 5.0 : 2.6);
      if (telegraph) coverW *= 2.0;
      if (p.t > 22) coverW *= 0.35;
      const d = pickDir(s, e, obs, goal, coverW);
      if (d) moveOrder = { type: 'dir', x: d.x, z: d.z };
      else moveOrder = { type: 'to', x: e.x, z: e.z };
    }
  }

  if (!faceOrder) {
    const fp = pred(0.14);
    faceOrder = { x: fp.x - s.x, z: fp.z - s.z };
  }

  // flip orbit direction now and then
  if (p.t - M.orbitAt > 1.7) { M.orbitAt = p.t; M.orbit = api.rand() < 0.5 ? -1 : 1; }

  // ---- issue orders (one each) ----
  if (moveOrder) {
    if (moveOrder.type === 'dir') {
      M.lastDir = V.norm({ x: moveOrder.x, z: moveOrder.z });
      api.move(moveOrder.x, moveOrder.z);
    } else {
      M.lastDir = V.toward({ x: s.x, z: s.z }, { x: moveOrder.x, z: moveOrder.z });
      api.moveTo(moveOrder.x, moveOrder.z);
    }
  }
  if (faceOrder) api.face(faceOrder.x, faceOrder.z);
  if (skillOrder) api.use(skillOrder[0]);
}

const M = {
  laserReadyAt: 0,
  blinkReadyAt: 0,
  sawLaser: false,
  blockedAt: -99,
  enemyJumpAt: -99,
  lastDir: { x: 0, z: 1 },
  orbit: 1,
  orbitAt: 0
};

function clampNum(v, lo, hi) {
  if (!(v === v)) return 0;
  return v < lo ? lo : (v > hi ? hi : v);
}

function angDiff(heading, target) {
  let d = target - heading;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function segAabb(ax, az, bx, bz, cx, cz, hx, hz) {
  const minx = cx - hx, maxx = cx + hx, minz = cz - hz, maxz = cz + hz;
  let t0 = 0, t1 = 1;
  const dx = bx - ax;
  if (Math.abs(dx) < 1e-9) {
    if (ax < minx || ax > maxx) return false;
  } else {
    let ta = (minx - ax) / dx, tb = (maxx - ax) / dx;
    if (ta > tb) { const tt = ta; ta = tb; tb = tt; }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return false;
  }
  const dz = bz - az;
  if (Math.abs(dz) < 1e-9) {
    if (az < minz || az > maxz) return false;
  } else {
    let ta = (minz - az) / dz, tb = (maxz - az) / dz;
    if (ta > tb) { const tt = ta; ta = tb; tb = tt; }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return false;
  }
  return true;
}

function boxHit(ax, az, bx, bz, obs, pad) {
  for (const o of obs) {
    if (segAabb(ax, az, bx, bz, o.x, o.z, o.hx + pad, o.hz + pad)) return true;
  }
  return false;
}

function pickDir(s, e, obs, goal, coverW) {
  const step = Math.min(3.6, Math.max(1.6, e.dist * 0.5));
  let best = null, bestScore = -1e9;
  const N = 24;
  for (let i = 0; i < N; i++) {
    const a = i * Math.PI * 2 / N;
    const dx = Math.sin(a), dz = Math.cos(a);
    const cx = s.x + dx * step, cz = s.z + dz * step;
    if (Math.abs(cx) > 19.2 || Math.abs(cz) > 19.2) continue;
    if (boxHit(s.x, s.z, cx, cz, obs, s.radius * 0.85)) continue;
    let sc = -Math.hypot(cx - goal.x, cz - goal.z);
    if (coverW > 0) {
      const exposed = !boxHit(cx, cz, e.x, e.z, obs, 0.0);
      if (!exposed) sc += coverW;
    }
    const m = 19.6 - Math.max(Math.abs(cx), Math.abs(cz));
    if (m < 2.5) sc -= (2.5 - m) * 1.6;
    sc += (dx * M.lastDir.x + dz * M.lastDir.z) * 0.7;
    if (sc > bestScore) { bestScore = sc; best = { x: dx, z: dz }; }
  }
  return best;
}
