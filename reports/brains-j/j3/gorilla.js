const OBS = [
  { x: -7, z: -3, hx: 1.2, hz: 3.5 },
  { x: 7, z: 3, hx: 1.2, hz: 3.5 },
  { x: 0, z: -10, hx: 3.6, hz: 1.2 },
  { x: 0, z: 10, hx: 3.6, hz: 1.2 },
  { x: -12.5, z: 11, hx: 1.6, hz: 1.6 },
  { x: 12.5, z: -11, hx: 1.6, hz: 1.6 }
];

let dodgeSign = 1;
let dodgeFlipped = false;
let laserSeen = false;
let lastSay = -9;
let stuckT = 0;

function segHitsBox(ax, az, bx, bz, b, pad) {
  const minx = b.x - b.hx - pad, maxx = b.x + b.hx + pad;
  const minz = b.z - b.hz - pad, maxz = b.z + b.hz + pad;
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dz = bz - az;
  if (Math.abs(dx) < 1e-9) {
    if (ax < minx || ax > maxx) return false;
  } else {
    let ta = (minx - ax) / dx, tb = (maxx - ax) / dx;
    if (ta > tb) { const q = ta; ta = tb; tb = q; }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return false;
  }
  if (Math.abs(dz) < 1e-9) {
    if (az < minz || az > maxz) return false;
  } else {
    let ta = (minz - az) / dz, tb = (maxz - az) / dz;
    if (ta > tb) { const q = ta; ta = tb; tb = q; }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return false;
  }
  return true;
}

function blockedLine(ax, az, bx, bz, pad) {
  for (const b of OBS) if (segHitsBox(ax, az, bx, bz, b, pad || 0)) return true;
  return false;
}

function insideBlock(x, z, pad) {
  for (const b of OBS) {
    if (Math.abs(x - b.x) < b.hx + pad && Math.abs(z - b.z) < b.hz + pad) return true;
  }
  return false;
}

function inArena(x, z, m) {
  return Math.abs(x) < 20 - m && Math.abs(z) < 20 - m;
}

function safeDir(me, dir) {
  if (!dir || (dir.x === 0 && dir.z === 0)) return dir;
  const base = V.norm(dir);
  const cand = [0, 0.35, -0.35, 0.7, -0.7, 1.1, -1.1, 1.6, -1.6, 2.2, -2.2, 2.8, -2.8, Math.PI];
  for (const a of cand) {
    const d = V.rot(base, a);
    const px = me.x + d.x * 2.4, pz = me.z + d.z * 2.4;
    if (!inArena(px, pz, 1.5)) continue;
    if (insideBlock(px, pz, 1.45)) continue;
    return d;
  }
  return base;
}

function angDiff(heading, dir) {
  return Math.abs(V.angleTo(heading, dir));
}

function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive) return;
  if (!en || !en.alive) { api.stop(); return; }

  const dist = en.dist;
  const toEn = V.toward(me, en);
  const cast = me.casting;
  const ecast = en.casting;

  // ---- event scan ----
  let justHitCharge = false;
  for (const e of p.events) {
    if (e.type === 'blocked') stuckT += 0.1;
    if (e.type === 'dealt' && e.skill === 'charge') justHitCharge = true;
    if (e.type === 'chargeStopped') justHitCharge = true;
  }
  if (me.speed > 1.5) stuckT = Math.max(0, stuckT - 0.05);

  // ---- enemy laser tracking ----
  const enemyLasering = !!(ecast && ecast.skill === 'laser' && ecast.telegraph);
  const laserRem = enemyLasering ? ecast.remaining : 0;
  if (enemyLasering && !laserSeen) {
    laserSeen = true;
    dodgeFlipped = false;
    // choose a strafe side with more room
    const perp = V.perp(toEn);
    const pA = { x: me.x + perp.x * 4, z: me.z + perp.z * 4 };
    const pB = { x: me.x - perp.x * 4, z: me.z - perp.z * 4 };
    const okA = inArena(pA.x, pA.z, 2) && !insideBlock(pA.x, pA.z, 1.6);
    const okB = inArena(pB.x, pB.z, 2) && !insideBlock(pB.x, pB.z, 1.6);
    if (okA && !okB) dodgeSign = 1;
    else if (okB && !okA) dodgeSign = -1;
    else dodgeSign = api.rand() < 0.5 ? 1 : -1;
  }
  if (!enemyLasering) laserSeen = false;

  // ---- helpers ----
  const smashReach = me.radius + 2.9 + en.radius; // ~5.15
  const predict = (t) => ({ x: en.x + en.vx * t, z: en.z + en.vz * t });

  // ================= currently busy =================
  if (me.busy && cast) {
    if (cast.skill === 'charge') {
      if (cast.phase === 'windup') {
        const tt = 0.28 + Math.max(0, dist - me.radius - en.radius) / 15;
        const q = predict(Math.min(tt, 0.9));
        api.faceAt(q.x, q.z);
        api.move(toEn.x, toEn.z);
      }
      return;
    }
    if (cast.skill === 'smash') {
      if (cast.phase === 'windup') {
        const q = predict(Math.max(0, cast.remaining));
        api.faceAt(q.x, q.z);
        if (dist > 2.2) {
          const d = safeDir(me, V.toward(me, q));
          api.move(d.x, d.z);
        } else {
          api.stop();
        }
      } else {
        api.faceAt(en.x, en.z);
      }
      return;
    }
    if (cast.skill === 'jump') {
      api.faceAt(en.x, en.z);
      return;
    }
  }
  if (me.stunned) { api.faceAt(en.x, en.z); return; }

  const visible = en.visible;
  const angToEn = angDiff(me.heading, toEn);

  // ================= ATTACK: SMASH =================
  const landPos = predict(0.28);
  const landDist = V.dist(me, landPos);
  const canSmashHit =
    api.ready('smash') &&
    !en.invulnerable &&
    !en.airborne &&
    !(ecast && ecast.skill === 'jump') &&
    landDist < smashReach - 0.35 &&
    (visible || dist < 3.2) &&
    angDiff(me.heading, V.toward(me, landPos)) < 1.15;

  if (canSmashHit) {
    api.use('smash');
    api.faceAt(landPos.x, landPos.z);
    if (dist > 2.4) { const d = safeDir(me, toEn); api.move(d.x, d.z); }
    else api.stop();
    return;
  }

  // ================= ATTACK: CHARGE =================
  const chargeReady = api.ready('charge');
  const tt = 0.28 + Math.max(0, dist - me.radius - en.radius) / 15;
  const ip = predict(Math.min(tt, 0.95));
  const toIp = V.toward(me, ip);
  const clearLane = !blockedLine(me.x, me.z, ip.x, ip.z, 0.2);

  let wantCharge = false;
  if (chargeReady && !en.invulnerable && clearLane && visible) {
    if (enemyLasering && dist < 11.5) wantCharge = true;
    else if (dist > 3.2 && dist < 11.0) wantCharge = true;
    else if (dist >= 11.0 && dist < 12.5 && en.speed < 1.0) wantCharge = true;
  }

  if (wantCharge) {
    api.faceAt(ip.x, ip.z);
    if (angDiff(me.heading, toIp) < 0.30) {
      api.use('charge');
      api.move(toIp.x, toIp.z);
      if (p.t - lastSay > 4) { lastSay = p.t; api.say('CHARGE'); }
      return;
    }
    // turning into it — keep pressure
    const d = safeDir(me, toEn);
    api.move(d.x, d.z);
    return;
  }

  // ================= DEFENCE: enemy laser cast =================
  if (enemyLasering && visible) {
    // 1. try to break line of sight behind a block
    if (laserRem > 0.28) {
      const reach = Math.min(3.0, Math.max(1.4, laserRem * 5.0));
      let best = null, bestScore = -1e9;
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const dir = { x: Math.sin(a), z: Math.cos(a) };
        const px = me.x + dir.x * reach, pz = me.z + dir.z * reach;
        if (!inArena(px, pz, 1.6)) continue;
        if (insideBlock(px, pz, 1.5)) continue;
        if (!blockedLine(px, pz, en.x, en.z, 0.15)) continue;
        const score = -V.dist({ x: px, z: pz }, en) * 0.15 + V.dot(dir, toEn) * 0.4;
        if (score > bestScore) { bestScore = score; best = dir; }
      }
      if (best) {
        api.move(best.x, best.z);
        api.faceAt(en.x, en.z);
        return;
      }
    }
    // 2. strafe with a late reversal to break their tracking
    if (!dodgeFlipped && laserRem <= 0.30) { dodgeSign = -dodgeSign; dodgeFlipped = true; }
    const perp = V.perp(toEn);
    let want = {
      x: perp.x * dodgeSign * 1.0 + toEn.x * (dist > 5 ? 0.45 : -0.15),
      z: perp.z * dodgeSign * 1.0 + toEn.z * (dist > 5 ? 0.45 : -0.15)
    };
    const px = me.x + want.x * 2.5, pz = me.z + want.z * 2.5;
    if (!inArena(px, pz, 1.6) || insideBlock(px, pz, 1.4)) {
      dodgeSign = -dodgeSign;
      want = {
        x: perp.x * dodgeSign + toEn.x * 0.2,
        z: perp.z * dodgeSign + toEn.z * 0.2
      };
    }
    const d = safeDir(me, want);
    api.move(d.x, d.z);
    api.faceAt(en.x, en.z);
    return;
  }

  // ================= CLOSE / PRESSURE =================
  api.faceAt(en.x, en.z);

  if (dist < smashReach + 0.9) {
    // hover inside strike range, orbiting so the laser cannot settle
    const smashCd = api.cooldown('smash');
    const perp = V.perp(toEn);
    let sgn = dodgeSign;
    const orbit = {
      x: perp.x * sgn * 0.9 + toEn.x * (dist > 3.2 ? 0.8 : -0.1),
      z: perp.z * sgn * 0.9 + toEn.z * (dist > 3.2 ? 0.8 : -0.1)
    };
    const px = me.x + orbit.x * 2.4, pz = me.z + orbit.z * 2.4;
    if (!inArena(px, pz, 1.6) || insideBlock(px, pz, 1.4)) dodgeSign = -dodgeSign;
    if (smashCd < 0.20) {
      const d = safeDir(me, toEn);
      api.move(d.x, d.z);
    } else {
      const d = safeDir(me, orbit);
      api.move(d.x, d.z);
    }
    return;
  }

  // approach
  const straight = !blockedLine(me.x, me.z, en.x, en.z, 1.05);
  const aim = V.lead(me, en, { x: en.vx, z: en.vz }, me.maxSpeed * 1.05);
  if (straight && stuckT < 0.5) {
    const d = safeDir(me, V.toward(me, aim));
    api.move(d.x, d.z);
  } else {
    const path = api.pathTo(en.x, en.z);
    if (path && path.points && path.points.length) {
      const wp = path.points[0];
      const dd = V.dist(me, wp) < 1.2 && path.points.length > 1 ? path.points[1] : wp;
      const d = safeDir(me, V.toward(me, dd));
      api.move(d.x, d.z);
    } else {
      api.moveTo(en.x, en.z);
    }
    if (stuckT > 1.2) stuckT = 0;
  }

  if (p.t - lastSay > 8) { lastSay = p.t; api.say('come here, squid'); }
}
