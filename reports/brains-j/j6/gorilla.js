const CONE = 0.96; // 55 degrees in radians
const SMASH_EXTRA = 2.9;

let laserReadyAt = 0;
let blinkReadyAt = 0;
let strafeSign = 1;
let lastFlip = -9;
let lastChargeAt = -9;
let lastSay = -9;
let stuckT = 0;

function segBox(ax, az, bx, bz, b, pad) {
  const minx = b.x - b.hx - pad, maxx = b.x + b.hx + pad;
  const minz = b.z - b.hz - pad, maxz = b.z + b.hz + pad;
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dz = bz - az;
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

function segBlocked(ax, az, bx, bz, obs, pad) {
  for (const b of obs) if (segBox(ax, az, bx, bz, b, pad)) return true;
  return false;
}

function inBox(x, z, b, pad) {
  return x > b.x - b.hx - pad && x < b.x + b.hx + pad && z > b.z - b.hz - pad && z < b.z + b.hz + pad;
}

function freePoint(x, z, obs, pad, half) {
  if (Math.abs(x) > half - 1.4 || Math.abs(z) > half - 1.4) return false;
  for (const b of obs) if (inBox(x, z, b, pad)) return false;
  return true;
}

function angDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

function findCover(me, en, obs, half) {
  let best = null, bestScore = -1e9;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const dx = Math.sin(a), dz = Math.cos(a);
    for (const r of [2.5, 4.5, 6.5]) {
      const x = me.x + dx * r, z = me.z + dz * r;
      if (!freePoint(x, z, obs, me.radius + 0.35, half)) continue;
      if (segBlocked(me.x, me.z, x, z, obs, me.radius + 0.2)) continue;
      if (!segBlocked(x, z, en.x, en.z, obs, 0.15)) continue;
      const dEn = Math.hypot(x - en.x, z - en.z);
      const score = -dEn * 0.8 - r * 0.5;
      if (score > bestScore) { bestScore = score; best = { x, z }; }
    }
  }
  return best;
}

function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me || !me.alive || !en) return;
  const obs = p.arena.obstacles;
  const half = p.arena.half;

  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      if (e.skill === 'laser') laserReadyAt = p.t + 2.2;
      else if (e.skill === 'blink') blinkReadyAt = p.t + 3.9;
    } else if (e.type === 'blocked') {
      if (p.t - lastFlip > 0.7) { strafeSign = -strafeSign; lastFlip = p.t; }
    }
  }

  const d = en.dist;
  const toEn = { x: en.x - me.x, z: en.z - me.z };
  const enCast = en.casting;
  const enemyLasering = !!(enCast && enCast.skill === 'laser' && enCast.telegraph);
  const enemyAir = en.airborne || !!(enCast && enCast.skill === 'jump' && enCast.phase === 'windup');

  // predicted enemy positions
  const evx = en.vx || 0, evz = en.vz || 0;
  const pSmash = { x: en.x + evx * 0.28, z: en.z + evz * 0.28 };
  const dSmash = Math.hypot(pSmash.x - me.x, pSmash.z - me.z);
  const smashReach = me.radius + SMASH_EXTRA + en.radius * 0.55;

  // charge intercept
  const commit = { x: en.x + evx * 0.30, z: en.z + evz * 0.30 };
  let icp = commit;
  {
    const dc = Math.hypot(commit.x - me.x, commit.z - me.z);
    const tt = dc / 15;
    icp = { x: commit.x + evx * tt, z: commit.z + evz * tt };
  }
  const icDir = { x: icp.x - me.x, z: icp.z - me.z };
  const icDist = Math.hypot(icDir.x, icDir.z) || 0.001;
  const icHead = Math.atan2(icDir.x, icDir.z);

  let chargeLaneClear = false;
  if (icDist < 13.5) {
    const r = api.ray(icDir.x, icDir.z, Math.min(icDist + 1.2, 20));
    chargeLaneClear = (!r || !r.hit || r.dist >= icDist - 0.9);
    if (segBlocked(me.x, me.z, icp.x, icp.z, obs, 0.9)) chargeLaneClear = false;
  }

  const facingErrEn = Math.abs(angDiff(Math.atan2(toEn.x, toEn.z), me.heading));
  const facingErrIc = Math.abs(angDiff(icHead, me.heading));

  // ---------- BUSY: only steer / turn ----------
  if (me.busy) {
    const c = me.casting;
    if (c && c.skill === 'smash' && c.phase === 'windup') {
      api.faceAt(pSmash.x, pSmash.z);
      if (dSmash > me.radius + en.radius + 0.4) api.move(pSmash.x - me.x, pSmash.z - me.z);
      else api.move(0, 0);
    } else if (c && c.skill === 'charge' && c.phase === 'windup') {
      api.face(icDir.x, icDir.z);
      api.move(icDir.x, icDir.z);
    } else if (c && c.skill === 'charge' && c.phase === 'dash') {
      api.faceAt(en.x, en.z);
    } else {
      api.faceAt(en.x, en.z);
      if (!me.airborne) {
        if (d > me.radius + en.radius + 0.6) api.move(toEn.x, toEn.z);
        else api.move(0, 0);
      }
    }
    return;
  }

  if (me.stunned || me.airborne) {
    api.faceAt(en.x, en.z);
    return;
  }

  // ---------- SKILL CHOICE ----------
  const chargeReady = api.ready('charge');
  const smashReady = api.ready('smash');
  let acted = false;

  // 1. free smash on a stunned / helpless enemy
  if (smashReady && !enemyAir && dSmash <= smashReach && facingErrEn < 1.25 && !en.invulnerable) {
    api.use('smash');
    api.faceAt(pSmash.x, pSmash.z);
    api.move(pSmash.x - me.x, pSmash.z - me.z);
    acted = true;
  }

  // 2. charge: gap close, interrupt, big damage + stun
  if (!acted && chargeReady && !en.invulnerable && icDist > 1.2 && icDist < 11.5 &&
      chargeLaneClear && facingErrIc < 0.75 && !enemyAir) {
    api.use('charge');
    api.face(icDir.x, icDir.z);
    api.move(icDir.x, icDir.z);
    lastChargeAt = p.t;
    acted = true;
  }

  // 3. smash even if the aim is a bit wide / enemy invulnerable window closing
  if (!acted && smashReady && !enemyAir && dSmash <= smashReach && facingErrEn < 1.35) {
    api.use('smash');
    api.faceAt(pSmash.x, pSmash.z);
    acted = true;
  }

  if (acted) return;

  // ---------- MOVEMENT ----------
  // strafe basis
  const dirToEn = V.norm(toEn);
  let perp = { x: dirToEn.z * strafeSign, z: -dirToEn.x * strafeSign };
  {
    const tx = me.x + perp.x * 3.2, tz = me.z + perp.z * 3.2;
    if (!freePoint(tx, tz, obs, me.radius + 0.2, half) && p.t - lastFlip > 0.35) {
      strafeSign = -strafeSign; lastFlip = p.t;
      perp = { x: dirToEn.z * strafeSign, z: -dirToEn.x * strafeSign };
    }
  }

  let mv = null;
  let faceP = { x: en.x, z: en.z };

  if (enemyLasering && en.visible) {
    if (d < 6.2) {
      // too close for them to track: hard circle-strafe, stay in melee
      mv = V.norm({ x: perp.x * 1.0 + dirToEn.x * 0.35, z: perp.z * 1.0 + dirToEn.z * 0.35 });
    } else {
      const cov = findCover(me, en, obs, half);
      if (cov) {
        mv = { x: cov.x - me.x, z: cov.z - me.z };
      } else {
        // no cover: close the gap fast at an angle
        mv = V.norm({ x: dirToEn.x * 1.0 + perp.x * 0.55, z: dirToEn.z * 1.0 + perp.z * 0.55 });
      }
    }
  } else if (!en.visible) {
    const path = api.pathTo(en.x, en.z);
    if (path && path.points && path.points.length && !path.direct) {
      let wp = path.points[0];
      if (path.points.length > 1 && Math.hypot(wp.x - me.x, wp.z - me.z) < 1.3) wp = path.points[1];
      mv = { x: wp.x - me.x, z: wp.z - me.z };
      faceP = { x: wp.x, z: wp.z };
    } else {
      mv = { x: toEn.x, z: toEn.z };
    }
  } else {
    // visible, not being lasered right now: press the attack
    const gap = me.radius + en.radius;
    if (d > gap + 0.5) {
      const path = api.pathTo(en.x, en.z);
      if (path && path.points && path.points.length && !path.direct) {
        let wp = path.points[0];
        if (path.points.length > 1 && Math.hypot(wp.x - me.x, wp.z - me.z) < 1.3) wp = path.points[1];
        mv = { x: wp.x - me.x, z: wp.z - me.z };
      } else {
        // lead them slightly so we arrive where they will be
        const lead = V.lead({ x: me.x, z: me.z }, { x: en.x, z: en.z }, { x: evx, z: evz }, me.maxSpeed);
        mv = { x: lead.x - me.x, z: lead.z - me.z };
      }
      // if a laser could come and we are far, weave
      if (d > 6.5 && p.t >= laserReadyAt - 0.35) {
        const n = V.norm(mv);
        mv = { x: n.x + perp.x * 0.45, z: n.z + perp.z * 0.45 };
      }
    } else {
      // in contact: shove and orbit so a snap-cast beam has to chase us
      mv = V.norm({ x: perp.x * 0.85 + dirToEn.x * 0.6, z: perp.z * 0.85 + dirToEn.z * 0.6 });
    }
  }

  // keep off the walls
  const wallPad = half - 2.2;
  let push = { x: 0, z: 0 };
  if (me.x > wallPad) push.x -= (me.x - wallPad);
  if (me.x < -wallPad) push.x += (-wallPad - me.x);
  if (me.z > wallPad) push.z -= (me.z - wallPad);
  if (me.z < -wallPad) push.z += (-wallPad - me.z);
  if (push.x || push.z) {
    const n = V.norm(mv || { x: 0, z: 0 });
    mv = { x: n.x + push.x * 0.6, z: n.z + push.z * 0.6 };
  }

  if (mv) api.move(mv.x, mv.z);
  api.faceAt(faceP.x, faceP.z);

  if (p.t - lastSay > 6.5) {
    lastSay = p.t;
    const lines = ['come closer, squid', 'fists beat beams', 'no beam through stone', 'I am the wall'];
    api.say(lines[Math.floor(api.rand() * lines.length) % lines.length]);
  }
}
