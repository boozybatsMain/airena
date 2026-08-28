function segHitsBox(ax, az, bx, bz, o, pad) {
  const minx = o.x - o.hx - pad, maxx = o.x + o.hx + pad;
  const minz = o.z - o.hz - pad, maxz = o.z + o.hz + pad;
  const dx = bx - ax, dz = bz - az;
  let t0 = 0, t1 = 1;
  if (Math.abs(dx) < 1e-9) {
    if (ax < minx || ax > maxx) return false;
  } else {
    let ta = (minx - ax) / dx, tb = (maxx - ax) / dx;
    if (ta > tb) { const tmp = ta; ta = tb; tb = tmp; }
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  if (Math.abs(dz) < 1e-9) {
    if (az < minz || az > maxz) return false;
  } else {
    let ta = (minz - az) / dz, tb = (maxz - az) / dz;
    if (ta > tb) { const tmp = ta; ta = tb; tb = tmp; }
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  return true;
}

function insideObs(p, x, z, pad) {
  for (const o of p.arena.obstacles) {
    if (x > o.x - o.hx - pad && x < o.x + o.hx + pad && z > o.z - o.hz - pad && z < o.z + o.hz + pad) return true;
  }
  return false;
}

function segBlocked(p, ax, az, bx, bz) {
  for (const o of p.arena.obstacles) if (segHitsBox(ax, az, bx, bz, o, 0)) return true;
  return false;
}

function beamBlocked(p, ax, az, bx, bz) {
  let dx = bx - ax, dz = bz - az;
  const L = Math.hypot(dx, dz);
  if (L < 1e-6) return false;
  dx /= L; dz /= L;
  const px = -dz, pz = dx;
  for (const off of [0, 1.35, -1.35]) {
    if (!segBlocked(p, ax, az, bx + px * off, bz + pz * off)) return false;
  }
  return true;
}

function findCover(p, me, e, r) {
  let best = null, bestD = 1e9;
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8;
    const cx = me.x + Math.sin(a) * r, cz = me.z + Math.cos(a) * r;
    if (Math.abs(cx) > 18.8 || Math.abs(cz) > 18.8) continue;
    if (insideObs(p, cx, cz, me.radius + 0.2)) continue;
    if (!beamBlocked(p, e.x, e.z, cx, cz)) continue;
    const d = Math.hypot(cx - e.x, cz - e.z);
    if (d < bestD) { bestD = d; best = { x: cx, z: cz }; }
  }
  return best;
}

let strafeSign = 1;
let nextFlip = 0;
let blockedUntil = -1;
let lastSay = -99;
let openingCharged = false;

function think(p, api) {
  const me = p.self, e = p.enemy;
  if (!me || !e || !me.alive || !e.alive) return;
  const t = p.t;
  const dist = e.dist;

  for (const ev of p.events) {
    if (ev.type === 'blocked') blockedUntil = t + 0.55;
  }

  if (t > nextFlip) {
    strafeSign = api.rand() < 0.5 ? 1 : -1;
    nextFlip = t + 0.45 + api.rand() * 0.7;
  }

  const cast = e.casting;
  const lasering = !!(cast && cast.skill === 'laser' && cast.telegraph);
  const laserRemain = lasering ? cast.remaining : 99;

  const pred = (tt) => ({ x: e.x + e.vx * tt, z: e.z + e.vz * tt });

  // ---------- FACING ----------
  let faceP = pred(0.22);
  const mc = me.casting;
  if (mc && mc.skill === 'charge' && mc.phase === 'windup') {
    const tt = (mc.remaining || 0.1) + Math.max(0, dist - 2.2) / 15;
    faceP = pred(tt);
  } else if (mc && mc.skill === 'smash' && mc.phase === 'windup') {
    faceP = pred(mc.remaining || 0.15);
  }

  // ---------- MOVEMENT ----------
  const dir = V.toward(me, e);
  const per = { x: -dir.z, z: dir.x };
  let mv = null;

  if (dist > 3.1) {
    if (lasering && laserRemain > 0.16 && dist > 5.5 && e.visible) {
      const r = Math.min(0.55, laserRemain + 0.1) * me.maxSpeed + 0.5;
      const c = findCover(p, me, e, r);
      if (c) mv = { k: 'm', x: c.x - me.x, z: c.z - me.z };
    }
    if (!mv) {
      if (!e.visible || t < blockedUntil) {
        mv = { k: 'to', x: e.x, z: e.z };
      } else {
        const w = lasering ? 0.85 : (dist > 8 ? 0.5 : 0.3);
        let v = { x: dir.x + per.x * strafeSign * w, z: dir.z + per.z * strafeSign * w };
        const probe = { x: me.x + v.x * 2.2, z: me.z + v.z * 2.2 };
        if (Math.abs(probe.x) > 18.6 || Math.abs(probe.z) > 18.6 || insideObs(p, probe.x, probe.z, me.radius + 0.3)) {
          strafeSign = -strafeSign;
          v = { x: dir.x + per.x * strafeSign * w, z: dir.z + per.z * strafeSign * w };
          const probe2 = { x: me.x + v.x * 2.2, z: me.z + v.z * 2.2 };
          if (Math.abs(probe2.x) > 18.6 || Math.abs(probe2.z) > 18.6 || insideObs(p, probe2.x, probe2.z, me.radius + 0.3)) {
            mv = { k: 'to', x: e.x, z: e.z };
          }
        }
        if (!mv) mv = { k: 'm', x: v.x, z: v.z };
      }
    }
  } else {
    const push = dist > 2.1 ? 1 : 0.35;
    let v = { x: dir.x * push + per.x * strafeSign * 0.55, z: dir.z * push + per.z * strafeSign * 0.55 };
    const probe = { x: me.x + v.x * 1.6, z: me.z + v.z * 1.6 };
    if (Math.abs(probe.x) > 18.8 || Math.abs(probe.z) > 18.8 || insideObs(p, probe.x, probe.z, me.radius + 0.2)) {
      strafeSign = -strafeSign;
      v = { x: dir.x * push + per.x * strafeSign * 0.55, z: dir.z * push + per.z * strafeSign * 0.55 };
    }
    mv = { k: 'm', x: v.x, z: v.z };
  }

  // ---------- SKILLS ----------
  let skill = null, sa = 0, sb = 0;
  if (!me.busy && !me.stunned && !me.airborne) {
    const land = pred(0.3);
    const ldx = land.x - me.x, ldz = land.z - me.z;
    const dPred = Math.hypot(ldx, ldz);
    const ang = Math.abs(V.angleTo(me.heading, { x: ldx, z: ldz }));

    if (api.ready('smash') && !e.airborne && dPred < 4.85 && ang < 1.25) {
      skill = 'smash';
    } else if (api.ready('charge') && !e.airborne && !me.stunned) {
      if (dist > 3.6 && dist < 11.0 && e.visible) {
        const tt = 0.3 + Math.max(0, dist - 2.2) / 15;
        const lp = pred(tt);
        const cd = V.toward(me, lp);
        const r = api.ray(cd.x, cd.z, Math.min(12.5, dist + 1.5));
        if (r.dist >= dist - 1.6) { skill = 'charge'; }
      } else if (dist >= 13 && !lasering) {
        const r = api.ray(dir.x, dir.z, 12.5);
        if (r.dist >= 11.8) skill = 'charge';
      }
    }
  }

  // ---------- ISSUE ----------
  api.faceAt(faceP.x, faceP.z);
  if (mv) {
    if (mv.k === 'to') api.moveTo(mv.x, mv.z);
    else api.move(mv.x, mv.z);
  }
  if (skill) api.use(skill, sa, sb);

  if (t - lastSay > 6.5) {
    lastSay = t;
    const lines = ['CLOSE THE DISTANCE.', 'NO BEAM AT ARM LENGTH.', 'BLINK ALL YOU LIKE.', 'FISTS BEAT PHYSICS.'];
    api.say(lines[Math.floor(api.rand() * lines.length) % lines.length]);
  }
}
