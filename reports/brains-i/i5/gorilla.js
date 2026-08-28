const PAD_BODY = 1.15;

function segHitsBox(ax, az, bx, bz, box, pad) {
  const minx = box.x - box.hx - pad, maxx = box.x + box.hx + pad;
  const minz = box.z - box.hz - pad, maxz = box.z + box.hz + pad;
  const dx = bx - ax, dz = bz - az;
  let t0 = 0, t1 = 1;
  if (Math.abs(dx) < 1e-9) {
    if (ax < minx || ax > maxx) return false;
  } else {
    let ta = (minx - ax) / dx, tb = (maxx - ax) / dx;
    if (ta > tb) { const t = ta; ta = tb; tb = t; }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return false;
  }
  if (Math.abs(dz) < 1e-9) {
    if (az < minz || az > maxz) return false;
  } else {
    let ta = (minz - az) / dz, tb = (maxz - az) / dz;
    if (ta > tb) { const t = ta; ta = tb; tb = t; }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return false;
  }
  return true;
}

function clearLine(ax, az, bx, bz, obs, pad) {
  for (let i = 0; i < obs.length; i++) {
    if (segHitsBox(ax, az, bx, bz, obs[i], pad)) return false;
  }
  return true;
}

function insideArena(x, z, half, m) {
  return Math.abs(x) < half - m && Math.abs(z) < half - m;
}

function angDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

let side = 1;
let sideSwitchT = -10;
let lastSay = -10;
let lastLaserSeen = -10;

function chooseDir(p, api, target, w) {
  const s = p.self, e = p.enemy, obs = p.arena.obstacles, half = p.arena.half;
  const probe = 3.2;
  const toE = { x: e.x - s.x, z: e.z - s.z };
  const L = Math.hypot(toE.x, toE.z) || 1;
  const perp = { x: toE.z / L, z: -toE.x / L };
  let vdx = 0, vdz = 0;
  if (s.speed > 0.4) { vdx = s.vx / s.speed; vdz = s.vz / s.speed; }
  let best = { x: toE.x / L, z: toE.z / L }, bestScore = -1e9;
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8;
    const dir = { x: Math.sin(a), z: Math.cos(a) };
    const cx = s.x + dir.x * probe, cz = s.z + dir.z * probe;
    let sc = 0;
    const lim = half - 1.8;
    const ox = Math.max(0, Math.abs(cx) - lim), oz = Math.max(0, Math.abs(cz) - lim);
    sc -= (ox + oz) * 16;
    if (!clearLine(s.x, s.z, cx, cz, obs, PAD_BODY)) sc -= 45;
    const dT = Math.hypot(cx - target.x, cz - target.z);
    sc -= dT * w.approach;
    if (w.hide > 0 && !clearLine(e.x, e.z, cx, cz, obs, 0)) sc += w.hide;
    if (w.strafe > 0) {
      const pd = dir.x * perp.x + dir.z * perp.z;
      sc += Math.abs(pd) * w.strafe + pd * side * w.strafe * 0.5;
    }
    sc += (dir.x * vdx + dir.z * vdz) * w.momentum;
    if (sc > bestScore) { bestScore = sc; best = dir; }
  }
  return best;
}

function think(p, api) {
  try {
    const s = p.self, e = p.enemy;
    if (!s.alive) return;
    const obs = p.arena.obstacles, half = p.arena.half;

    for (const ev of p.events) {
      if (ev.type === 'enemyStarted' && ev.skill === 'laser') lastLaserSeen = p.t;
      if (ev.type === 'blocked') { side = -side; sideSwitchT = p.t; }
      if (ev.type === 'damaged' && ev.skill === 'laser') { side = -side; sideSwitchT = p.t; }
    }
    if (p.t - sideSwitchT > 1.3) { side = api.rand() < 0.5 ? -side : side; sideSwitchT = p.t; }

    const d = e.dist;
    const enemyCastLaser = !!(e.casting && e.casting.skill === 'laser' && e.casting.telegraph);
    const castLeft = enemyCastLaser ? (e.casting.remaining || 0.3) : 0;

    // ---- while our own skill is running ----
    if (s.casting) {
      const c = s.casting;
      if (c.skill === 'smash') {
        const th = Math.max(0, c.remaining || 0);
        api.faceAt(e.x + e.vx * th, e.z + e.vz * th);
        if (c.phase === 'windup' || c.phase === 'strike') {
          api.move(e.x - s.x, e.z - s.z);
          return;
        }
      } else if (c.skill === 'charge') {
        const tf = (c.phase === 'windup' ? (c.remaining || 0.2) : 0) + d / 15;
        const ix = e.x + e.vx * tf, iz = e.z + e.vz * tf;
        api.faceAt(ix, iz);
        if (c.phase === 'windup' || c.phase === 'dash') return;
      } else if (c.skill === 'jump') {
        api.faceAt(e.x, e.z);
        return;
      }
    }
    if (s.stunned || s.airborne) {
      api.faceAt(e.x, e.z);
      return;
    }

    // ---- default facing: lead for the smash cone ----
    api.faceAt(e.x + e.vx * 0.28, e.z + e.vz * 0.28);

    const canAct = !s.busy && !s.stunned && !s.airborne;

    // ---- SMASH ----
    if (canAct && api.ready('smash')) {
      const px = e.x + e.vx * 0.28, pz = e.z + e.vz * 0.28;
      const pd = Math.hypot(px - s.x, pz - s.z);
      const ang = Math.abs(angDiff(Math.atan2(px - s.x, pz - s.z), s.heading));
      const reach = e.stunned ? 4.9 : 4.35;
      if (pd < reach && ang < 1.35 && !e.airborne && !e.invulnerable) {
        api.use('smash');
        api.move(e.x - s.x, e.z - s.z);
        return;
      }
    }

    // ---- CHARGE ----
    if (canAct && api.ready('charge') && !e.invulnerable) {
      const tf = 0.28 + d / 15;
      const ix = e.x + e.vx * tf, iz = e.z + e.vz * tf;
      const dd = Math.hypot(ix - s.x, iz - s.z);
      const pathOk = clearLine(s.x, s.z, ix, iz, obs, 0.85) && insideArena(ix, iz, half, 0.6);
      const worth = enemyCastLaser || d > 5.2 || !api.ready('smash');
      if (dd > 2.9 && dd < 11.2 && pathOk && worth && !e.airborne) {
        api.faceAt(ix, iz);
        api.use('charge');
        if (p.t - lastSay > 6) { lastSay = p.t; api.say("come here, squid"); }
        return;
      }
    }

    // ---- movement target ----
    const directClear = clearLine(s.x, s.z, e.x, e.z, obs, 0);
    let target;
    if (directClear) {
      target = { x: e.x + e.vx * 0.35, z: e.z + e.vz * 0.35 };
    } else {
      const path = api.pathTo(e.x, e.z);
      target = { x: e.x, z: e.z };
      if (path && path.points && path.points.length) {
        let wp = path.points[path.points.length - 1];
        for (const q of path.points) {
          if (Math.hypot(q.x - s.x, q.z - s.z) > 1.3) { wp = q; break; }
        }
        target = wp;
      }
    }

    let w;
    if (enemyCastLaser && directClear && d > 3.2) {
      w = { approach: 1.7, hide: 11, strafe: 4.2, momentum: 1.4 };
    } else if (d > 9) {
      w = { approach: 2.3, hide: 3.0, strafe: 1.0, momentum: 1.3 };
    } else if (d > 4.6) {
      w = { approach: 2.5, hide: 1.2, strafe: 1.8, momentum: 1.0 };
    } else {
      w = { approach: 3.0, hide: 0, strafe: 1.3, momentum: 0.8 };
    }
    if (!directClear) { w.hide = 0; w.strafe *= 0.4; w.approach += 0.6; }

    const dir = chooseDir(p, api, target, w);
    api.move(dir.x, dir.z);

    if (p.t - lastSay > 12 && d < 6) { lastSay = p.t; api.say("smash"); }
  } catch (err) {
    // keep standing orders
  }
}
