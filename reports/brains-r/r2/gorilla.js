const CD = { laser: 2.2, blink: 3.933, jump: 2.8 };
let eReady = { laser: 0, blink: 0, jump: 0 };
let prevE = null;
let obs = null;
let sayT = -9;

function segBox(ax, az, bx, bz, b, pad) {
  const minx = b.x - b.hx - pad, maxx = b.x + b.hx + pad;
  const minz = b.z - b.hz - pad, maxz = b.z + b.hz + pad;
  if (minx > maxx || minz > maxz) return false;
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dz = bz - az;
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

function walkClear(ax, az, bx, bz) {
  if (!obs) return true;
  for (const b of obs) if (segBox(ax, az, bx, bz, b, 1.45)) return false;
  return true;
}

function hidden(px, pz, ex, ez) {
  if (!obs) return false;
  for (const b of obs) if (segBox(px, pz, ex, ez, b, -0.3)) return true;
  return false;
}

function pickPoint(p, penalty) {
  const s = p.self, e = p.enemy;
  let best = null, bc = 1e9;
  const vh = Math.hypot(s.vx, s.vz);
  const vux = vh > 0.6 ? s.vx / vh : 0, vuz = vh > 0.6 ? s.vz / vh : 0;
  const radii = [3, 6, 9];
  for (const r of radii) {
    for (let i = 0; i < 24; i++) {
      const a = i * Math.PI / 12;
      const ux = Math.sin(a), uz = Math.cos(a);
      const px = s.x + ux * r, pz = s.z + uz * r;
      if (Math.abs(px) > 18.4 || Math.abs(pz) > 18.4) continue;
      if (!walkClear(s.x, s.z, px, pz)) continue;
      let cost = Math.hypot(px - e.x, pz - e.z);
      if (penalty > 0 && !hidden(px, pz, e.x, e.z)) cost += penalty;
      cost += 0.6 * (1 - (ux * vux + uz * vuz));
      if (cost < bc) { bc = cost; best = { x: px, z: pz }; }
    }
  }
  return best;
}

function think(p, api) {
  const s = p.self, e = p.enemy;
  if (!obs && p.arena && p.arena.obstacles) obs = p.arena.obstacles;
  if (!s || !s.alive) return;

  for (const ev of p.events) {
    if (ev.type === 'enemyStarted' && CD[ev.skill] != null) eReady[ev.skill] = p.t + CD[ev.skill];
  }
  if (!e || !e.alive) { api.stop(); return; }
  if (prevE) {
    const jump = Math.hypot(e.x - prevE.x, e.z - prevE.z);
    if (jump > 3.5) eReady.blink = p.t + CD.blink;
  }
  prevE = { x: e.x, z: e.z };

  const d = e.dist;
  const laserIn = Math.max(0, eReady.laser - p.t);
  const eLaserCast = !!(e.casting && e.casting.skill === 'laser' && e.casting.telegraph);
  const pred = (t) => ({ x: e.x + e.vx * t, z: e.z + e.vz * t });

  let penalty = 0;
  if ((eLaserCast || laserIn < 0.75) && !e.stunned) penalty = 6;
  if (p.t > 26) penalty = penalty > 0 ? 2.5 : 0;

  const canAct = !s.busy && !s.stunned && !s.airborne;
  const myCast = s.casting;

  // ---- facing / aiming ----
  const lead = pred(0.3);
  let faceX = lead.x - s.x, faceZ = lead.z - s.z;

  // ---- charge windup: lock aim on intercept ----
  if (myCast && myCast.skill === 'charge' && myCast.phase === 'windup') {
    const tt = myCast.remaining + Math.max(0, d - 2.25) / 15;
    const q = pred(tt);
    api.faceAt(q.x, q.z);
    api.move(q.x - s.x, q.z - s.z);
    return;
  }

  let acted = false;

  // ---- SMASH ----
  const dLead = Math.hypot(lead.x - s.x, lead.z - s.z);
  if (canAct && api.ready('smash') && !e.airborne && !e.invulnerable && dLead < 4.8) {
    const err = Math.abs(V.angleTo(s.heading, { x: lead.x - s.x, z: lead.z - s.z }));
    const allow = 0.96 + Math.asin(Math.min(0.95, 1 / Math.max(1.3, dLead))) + 0.6;
    if (err < allow) {
      api.use('smash');
      acted = true;
      faceX = lead.x - s.x; faceZ = lead.z - s.z;
    }
  }

  // ---- CHARGE ----
  if (!acted && canAct && api.ready('charge') && e.visible && !e.invulnerable && !e.airborne) {
    const tt = 0.3 + Math.max(0, d - 2.25) / 15;
    const q = pred(tt);
    const dirx = q.x - s.x, dirz = q.z - s.z;
    const dq = Math.hypot(dirx, dirz);
    if (dq > 2.7 && dq < 12.0) {
      const r = api.ray(dirx, dirz, Math.min(12, dq + 0.5));
      const clear = !r || !r.hit || r.dist > dq - 1.1;
      if (clear && (d > 4.6 || eLaserCast || !api.ready('smash'))) {
        api.use('charge');
        faceX = dirx; faceZ = dirz;
        acted = true;
      }
    }
  }

  api.face(faceX, faceZ);

  // ---- movement ----
  if (myCast && myCast.skill === 'charge' && myCast.phase === 'dash') return;

  const pressing = d < 5.4 || penalty === 0 || e.stunned || !e.visible;
  if (pressing) {
    const t = pred(0.22);
    if (e.visible || d < 6) {
      if (d < 2.6) {
        // stay glued, slight orbit to keep them pinned
        const away = V.toward({ x: s.x, z: s.z }, { x: e.x, z: e.z });
        api.move(away.x, away.z);
      } else {
        api.move(t.x - s.x, t.z - s.z);
      }
    } else {
      api.moveTo(e.x, e.z);
    }
  } else {
    const best = pickPoint(p, penalty);
    if (best) api.move(best.x - s.x, best.z - s.z);
    else if (e.visible) api.move(e.x - s.x, e.z - s.z);
    else api.moveTo(e.x, e.z);
  }

  if (p.t - sayT > 6) {
    sayT = p.t;
    if (d > 10) api.say("closing in");
    else api.say("no more beams for you");
  }
}
