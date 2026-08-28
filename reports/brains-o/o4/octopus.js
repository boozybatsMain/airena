function think(p, api) {
  const me = p.self, e = p.enemy;

  // ---- event digest ----
  for (const ev of p.events) {
    if (ev.type === 'enemyStarted') {
      if (ev.skill === 'charge') lastCharge = p.t;
      else if (ev.skill === 'smash') lastSmash = p.t;
      else if (ev.skill === 'jump') lastJump = p.t;
    } else if (ev.type === 'blocked') {
      sideSign = -sideSign; sideT = p.t;
    } else if (ev.type === 'damaged') {
      if (ev.skill === 'charge') lastCharge = p.t;
      else if (ev.skill === 'smash') lastSmash = p.t;
    }
  }

  if (p.t < 0.35 && !greeted) { greeted = true; api.say("Eight arms. One beam. Keep up."); }
  if (!me.alive || !e || !e.alive) return;
  if (me.stunned) return;

  const obs = p.arena.obstacles || [];
  const half = p.arena.half || 20;
  const dist = e.dist;

  if (me.airborne) { api.faceAt(e.x, e.z); return; }

  const toE = unit(e.x - me.x, e.z - me.z);
  const away = { x: -toE.x, z: -toE.z };
  let tan = { x: toE.z * sideSign, z: -toE.x * sideSign };

  // flip strafe side if it runs into something, or periodically toward open space
  if (!dirOk(me, tan, 3.4, obs, half) || (p.t - sideT > 3.2 && !dirOk(me, tan, 5.0, obs, half))) {
    sideSign = -sideSign; sideT = p.t;
    tan = { x: toE.z * sideSign, z: -toE.x * sideSign };
  }

  const ec = e.casting || null;
  const chargeReady = (p.t - lastCharge) > 3.95;
  const smashReady = (p.t - lastSmash) > 1.25;

  let desired = null;
  let handled = false;

  // ---------- dodging a charge ----------
  if (ec && ec.skill === 'charge') {
    const dir = (e.speed > 2.5) ? unit(e.vx, e.vz) : { x: Math.sin(e.heading), z: Math.cos(e.heading) };
    const rx = me.x - e.x, rz = me.z - e.z;
    const along = rx * dir.x + rz * dir.z;
    const lx = rx - dir.x * along, lz = rz - dir.z * along;
    const lat = Math.hypot(lx, lz);
    const dashing = ec.phase === 'dash';
    const threat = along > -2 && along < (dashing ? 13.5 : 15) && lat < (dashing ? 3.0 : 5.0);
    if (threat) {
      let side = lat > 0.5 ? { x: lx / lat, z: lz / lat } : { x: dir.z, z: -dir.x };
      if (dashing && api.ready('blink')) {
        const bd = pickBlink(me, [side, { x: -side.x, z: -side.z }, away], obs, half);
        api.use('blink', bd.x, bd.z);
        api.move(bd.x, bd.z);
        api.faceAt(e.x, e.z);
        return;
      }
      desired = mix(side, away, 1.0, 0.45);
      handled = true;
    }
  }

  // ---------- dodging a smash ----------
  if (!handled && ec && ec.skill === 'smash' && ec.telegraph && dist < 7.0) {
    if (dist < 5.9 && api.ready('jump')) {
      api.move(away.x, away.z);
      api.faceAt(e.x, e.z);
      api.use('jump');
      return;
    }
    if (dist < 5.2 && api.ready('blink')) {
      const bd = pickBlink(me, [away, mix(away, tan, 1, 1), { x: tan.x, z: tan.z }], obs, half);
      api.use('blink', bd.x, bd.z);
      api.move(bd.x, bd.z);
      api.faceAt(e.x, e.z);
      return;
    }
    desired = mix(away, tan, 1.0, 0.3);
    handled = true;
  }

  // ---------- panic distance ----------
  if (!handled && dist < 4.4 && !me.casting) {
    if (dist < 3.3 && api.ready('blink') && smashReady) {
      const bd = pickBlink(me, [away, mix(away, tan, 1, 0.8), tan], obs, half);
      api.use('blink', bd.x, bd.z);
      api.move(bd.x, bd.z);
      api.faceAt(e.x, e.z);
      return;
    }
    desired = mix(away, tan, 1.0, 0.55);
    handled = true;
  }

  // ---------- already casting the beam ----------
  if (me.casting && me.casting.skill === 'laser') {
    let lead = 0;
    if (me.casting.phase === 'windup') lead = Math.min(me.casting.remaining || 0.3, 0.7);
    api.faceAt(e.x + e.vx * lead, e.z + e.vz * lead);
    let d = desired || mix(away, tan, 0.75, 1.0);
    d = steer(me, d, 3.0, obs, half);
    api.move(d.x, d.z);
    return;
  }

  if (me.busy) { api.faceAt(e.x, e.z); return; }

  // ---------- fire ----------
  const enemyTelegraphing = !!(ec && ec.telegraph);
  const chargeIncoming = !!(ec && ec.skill === 'charge');
  const minCast = e.stunned ? 3.2 : (chargeReady ? 6.6 : 5.4);
  const wantShoot = api.ready('laser') && e.visible && !e.invulnerable &&
    dist > minCast && dist < 23.0 && !chargeIncoming &&
    !(ec && ec.skill === 'smash' && enemyTelegraphing && dist < 8) && !handled;

  if (wantShoot) {
    const aimX = e.x + e.vx * 0.55, aimZ = e.z + e.vz * 0.55;
    const ang = Math.abs(angDiff(me.heading, Math.atan2(aimX - me.x, aimZ - me.z)));
    if (ang < 1.15) {
      api.use('laser');
      api.faceAt(aimX, aimZ);
      let d = mix(away, tan, 0.6, 1.0);
      d = steer(me, d, 3.0, obs, half);
      api.move(d.x, d.z);
      return;
    } else {
      api.faceAt(aimX, aimZ);
      let d = mix(away, tan, 0.5, 1.0);
      d = steer(me, d, 3.0, obs, half);
      api.move(d.x, d.z);
      return;
    }
  }

  // ---------- positioning ----------
  const myFrac = me.hp / me.maxHp, hisFrac = e.hp / e.maxHp;
  let D = chargeReady ? 13.0 : 8.5;
  if (p.timeLeft < 10 && myFrac > hisFrac + 0.03) D = 16.0;
  if (p.burn > 0 && myFrac < hisFrac) D = Math.min(D, 11.0);

  if (!desired) {
    if (!e.visible) {
      if (dist > 9) {
        const path = api.pathTo(e.x, e.z);
        if (path && path.points && path.points.length) {
          const wp = path.points[0];
          const dd = unit(wp.x - me.x, wp.z - me.z);
          desired = mix(dd, tan, 1.0, 0.35);
        } else desired = mix(toE, tan, 1.0, 0.4);
      } else {
        desired = mix(tan, away, 1.0, 0.4);
      }
    } else if (dist < D - 1.5) {
      desired = mix(away, tan, 1.0, 0.8);
    } else if (dist > D + 2.5) {
      desired = mix(toE, tan, 1.0, 0.5);
    } else {
      desired = mix(tan, away, 1.0, 0.25);
    }
  }

  // pull away from walls/corners
  const edge = 15.0;
  if (Math.abs(me.x) > edge || Math.abs(me.z) > edge) {
    const inward = unit(-me.x, -me.z);
    desired = mix(desired, inward, 1.0, 0.85);
  }

  const d = steer(me, desired, 3.2, obs, half);
  api.move(d.x, d.z);
  api.faceAt(e.x + e.vx * 0.3, e.z + e.vz * 0.3);
}

// ================= helpers / state =================
let sideSign = 1;
let sideT = 0;
let lastCharge = -99;
let lastSmash = -99;
let lastJump = -99;
let greeted = false;

function unit(x, z) {
  const l = Math.hypot(x, z);
  if (l < 1e-9) return { x: 0, z: 1 };
  return { x: x / l, z: z / l };
}

function mix(a, b, wa, wb) {
  return unit(a.x * wa + b.x * wb, a.z * wa + b.z * wb);
}

function angDiff(h, target) {
  let d = target - h;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

function segHitsBox(ax, az, bx, bz, b, m) {
  const minx = b.x - b.hx - m, maxx = b.x + b.hx + m;
  const minz = b.z - b.hz - m, maxz = b.z + b.hz + m;
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dz = bz - az;
  if (Math.abs(dx) < 1e-9) { if (ax < minx || ax > maxx) return false; }
  else {
    let ta = (minx - ax) / dx, tb = (maxx - ax) / dx;
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  if (Math.abs(dz) < 1e-9) { if (az < minz || az > maxz) return false; }
  else {
    let ta = (minz - az) / dz, tb = (maxz - az) / dz;
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  return true;
}

function pathBlocked(ax, az, bx, bz, obs, m) {
  for (const b of obs) if (segHitsBox(ax, az, bx, bz, b, m)) return true;
  return false;
}

function inBox(x, z, b, m) {
  return x > b.x - b.hx - m && x < b.x + b.hx + m && z > b.z - b.hz - m && z < b.z + b.hz + m;
}

function pointOk(x, z, obs, half) {
  if (Math.abs(x) > half - 1.6 || Math.abs(z) > half - 1.6) return false;
  for (const b of obs) if (inBox(x, z, b, 1.4)) return false;
  return true;
}

function dirOk(me, dir, len, obs, half) {
  const ex = me.x + dir.x * len, ez = me.z + dir.z * len;
  if (Math.abs(ex) > half - 1.2 || Math.abs(ez) > half - 1.2) return false;
  if (pathBlocked(me.x, me.z, ex, ez, obs, 1.15)) return false;
  return true;
}

const OFFSETS = [0, 0.35, -0.35, 0.7, -0.7, 1.05, -1.05, 1.4, -1.4, 1.8, -1.8, 2.2, -2.2, 2.7, -2.7, 3.14159];

function steer(me, dir, len, obs, half) {
  const base = Math.atan2(dir.x, dir.z);
  for (const off of OFFSETS) {
    const h = base + off;
    const d = { x: Math.sin(h), z: Math.cos(h) };
    if (dirOk(me, d, len, obs, half)) return d;
  }
  return dir;
}

function pickBlink(me, cands, obs, half) {
  for (const c of cands) {
    if (!c) continue;
    const u = unit(c.x, c.z);
    let best = null;
    for (const r of [7.4, 6.2, 5.0, 3.8]) {
      const x = me.x + u.x * r, z = me.z + u.z * r;
      if (pointOk(x, z, obs, half)) { best = u; break; }
    }
    if (best) return best;
  }
  const c0 = cands[0] ? unit(cands[0].x, cands[0].z) : { x: 0, z: 1 };
  return c0;
}
