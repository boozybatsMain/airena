const AIM_LAG = 0.06;

let prevDir = { x: 0, z: 1 };
let strafeSign = 1;
let lastChargeStart = -99;
let lastSmashStart = -99;
let lastFlip = 0;
let lastBlink = -99;
let lastSay = -99;

function boxHit(x, z, o, pad) {
  return Math.abs(x - o.x) < o.hx + pad && Math.abs(z - o.z) < o.hz + pad;
}

function segHitsBox(ax, az, bx, bz, o, pad) {
  const minx = o.x - o.hx - pad, maxx = o.x + o.hx + pad;
  const minz = o.z - o.hz - pad, maxz = o.z + o.hz + pad;
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

function clearLine(obs, ax, az, bx, bz, pad) {
  for (const o of obs) if (segHitsBox(ax, az, bx, bz, o, pad)) return false;
  return true;
}

function clampArena(pt, half, pad) {
  return {
    x: Math.max(-half + pad, Math.min(half - pad, pt.x)),
    z: Math.max(-half + pad, Math.min(half - pad, pt.z))
  };
}

function angErr(heading, dx, dz) {
  return Math.abs(V.angleTo(heading, { x: dx, z: dz }));
}

function think(p, api) {
  const me = p.self;
  const en = p.enemy;
  if (!me.alive) return;

  const obs = p.arena.obstacles;
  const half = p.arena.half;
  const dist = en.dist;

  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      if (e.skill === 'charge') lastChargeStart = p.t;
      else if (e.skill === 'smash') lastSmashStart = p.t;
    } else if (e.type === 'blocked') {
      if (p.t - lastFlip > 0.4) { strafeSign = -strafeSign; lastFlip = p.t; }
    } else if (e.type === 'blinked') {
      lastBlink = p.t;
    }
  }

  const chargeReady = (p.t - lastChargeStart) > 3.95;
  const smashReady = (p.t - lastSmashStart) > 1.25;

  const enCast = en.casting;
  const enCharging = !!(enCast && enCast.skill === 'charge');
  const enSmashing = !!(enCast && enCast.skill === 'smash' && enCast.telegraph);
  const enDashing = !!(enCharging && enCast.phase === 'dash');

  // ---------- if stunned or airborne, only facing is worth spending ----------
  const toEn = V.toward(me, en);

  // ---------- threat: incoming charge line ----------
  let chargeThreat = 0; // 0 none, 1 windup aimed, 2 committed/dashing
  let chargeDir = { x: 0, z: 1 };
  if (enCharging) {
    chargeDir = enDashing && en.speed > 3
      ? V.norm({ x: en.vx, z: en.vz })
      : V.fromHeading(en.heading);
    const rel = { x: me.x - en.x, z: me.z - en.z };
    const along = V.dot(rel, chargeDir);
    const lat = Math.abs(rel.x * chargeDir.z - rel.z * chargeDir.x);
    if (along > -1 && along < 14 && lat < 3.4) chargeThreat = enDashing ? 2 : 1;
    else if (along > -1 && along < 14 && lat < 5.5) chargeThreat = 1;
  }

  // ---------- emergency blink ----------
  const blinkReady = api.ready('blink');
  if (blinkReady && !me.airborne && !me.stunned && !me.busy) {
    if (chargeThreat === 2 || (chargeThreat === 1 && enCast.remaining < 0.12)) {
      // sidestep hard, perpendicular to the dash line
      const perp = V.perp(chargeDir);
      let best = null, bestScore = -1e9;
      for (const s of [1, -1]) {
        const dir = V.scale(perp, s);
        const land = clampArena({ x: me.x + dir.x * 7.2, z: me.z + dir.z * 7.2 }, half, 1.4);
        let sc = 0;
        const rel = { x: land.x - en.x, z: land.z - en.z };
        const lat = Math.abs(rel.x * chargeDir.z - rel.z * chargeDir.x);
        sc += lat * 2;
        for (const o of obs) if (boxHit(land.x, land.z, o, 1.6)) sc -= 25;
        sc -= Math.max(0, 4 - (half - Math.max(Math.abs(land.x), Math.abs(land.z)))) * 4;
        if (clearLine(obs, land.x, land.z, en.x, en.z, 0.1)) sc += 4;
        if (sc > bestScore) { bestScore = sc; best = dir; }
      }
      api.use('blink', best.x, best.z);
      api.move(best.x, best.z);
      api.faceAt(en.x, en.z);
      return;
    }
    if (dist < 3.4 && (enSmashing || smashReady) && !me.invulnerable) {
      const away = V.away(me, en);
      let dir = away;
      const land = { x: me.x + away.x * 7.2, z: me.z + away.z * 7.2 };
      if (Math.abs(land.x) > half - 2 || Math.abs(land.z) > half - 2) {
        const perp = V.perp(away);
        const cand = [V.norm(V.add(away, perp)), V.norm(V.sub(away, perp))];
        let bs = -1e9;
        for (const c of cand) {
          const l = { x: me.x + c.x * 7.2, z: me.z + c.z * 7.2 };
          let sc = -Math.max(0, 3 - (half - Math.max(Math.abs(l.x), Math.abs(l.z)))) * 5;
          for (const o of obs) if (boxHit(l.x, l.z, o, 1.6)) sc -= 20;
          if (sc > bs) { bs = sc; dir = c; }
        }
      }
      api.use('blink', dir.x, dir.z);
      api.move(dir.x, dir.z);
      api.faceAt(en.x, en.z);
      return;
    }
  }

  // ---------- jump over a smash ----------
  if (!me.busy && !me.airborne && !me.stunned && api.ready('jump') && enSmashing &&
      dist < 6.4 && enCast.remaining > 0.13) {
    const away = V.away(me, en);
    api.move(away.x, away.z);
    api.use('jump');
    api.faceAt(en.x, en.z);
    return;
  }

  // ---------- aiming ----------
  const casting = me.casting;
  const lasering = !!(casting && casting.skill === 'laser' && casting.telegraph);
  let aimT = lasering ? Math.max(0, casting.remaining) : 0.667 + AIM_LAG;
  if (aimT > 0.85) aimT = 0.85;
  let aim = { x: en.x + en.vx * aimT, z: en.z + en.vz * aimT };
  if (!en.airborne && en.speed < 6) {
    aim = V.lerp({ x: en.x, z: en.z }, aim, 0.85);
  }
  aim = clampArena(aim, half, 0.6);
  if (!clearLine(obs, me.x, me.z, aim.x, aim.z, 0.05)) {
    aim = { x: en.x, z: en.z };
  }

  // ---------- fire the laser ----------
  const wantFace = { x: aim.x - me.x, z: aim.z - me.z };
  let ordered = false;
  if (!me.busy && !me.airborne && !me.stunned && api.ready('laser') &&
      en.visible && dist < 23.5) {
    const err = angErr(me.heading, wantFace.x, wantFace.z);
    const risky =
      (enCharging && dist < 16) ||
      (enSmashing && dist < 7.5) ||
      (dist < 5.6 && smashReady && !en.stunned);
    if (err < 0.75 && !risky) {
      api.use('laser');
      ordered = true;
    }
  }

  api.face(wantFace.x, wantFace.z);

  // ---------- movement: keep the ring, strafe, respect cover ----------
  let D;
  if (en.stunned || (enCast && enCast.phase === 'recover')) D = 9.0;
  else if (chargeReady || enCharging) D = 14.0;
  else D = 8.0;
  if (dist < 4.0) D = Math.max(D, 9.0);

  if (p.t - lastFlip > 2.6) { strafeSign = -strafeSign; lastFlip = p.t; }

  const radial = V.toward(me, en);
  const tangent = V.perp(radial);
  const look = 2.2;

  let bestDir = null, bestScore = -1e9;
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    const dir = { x: Math.sin(a), z: Math.cos(a) };
    const nx = me.x + dir.x * look;
    const nz = me.z + dir.z * look;
    let sc = 0;
    const nd = Math.hypot(nx - en.x, nz - en.z);
    sc -= Math.abs(nd - D) * 1.4;
    for (const o of obs) {
      if (boxHit(nx, nz, o, 1.5)) sc -= 60;
      else if (boxHit(nx, nz, o, 2.6)) sc -= 8;
    }
    const wallGap = half - Math.max(Math.abs(nx), Math.abs(nz));
    if (wallGap < 2.0) sc -= (2.0 - wallGap) * 14;
    else if (wallGap < 4.0) sc -= (4.0 - wallGap) * 2.5;
    // want to be able to shoot
    if (clearLine(obs, nx, nz, en.x, en.z, 0.05)) sc += 5; else sc -= 5;
    // keep off the charge lane
    if (chargeThreat > 0) {
      const rel = { x: nx - en.x, z: nz - en.z };
      const lat = Math.abs(rel.x * chargeDir.z - rel.z * chargeDir.x);
      sc += Math.min(lat, 6) * 2.2;
    } else if (chargeReady) {
      sc += Math.abs(V.dot(dir, tangent)) * 1.6;
    }
    sc += V.dot(dir, V.scale(tangent, strafeSign)) * 1.1;
    sc += V.dot(dir, prevDir) * 1.3;
    if (sc > bestScore) { bestScore = sc; bestDir = dir; }
  }

  if (!en.visible && !ordered && !lasering && dist > 6) {
    const path = api.pathTo(en.x, en.z);
    if (path && path.points && path.points.length && !path.direct) {
      const wp = path.points[0];
      const d = V.toward(me, wp);
      if (V.len(d) > 0) bestDir = d;
    }
  }

  if (bestDir && (bestDir.x !== 0 || bestDir.z !== 0)) {
    prevDir = bestDir;
    api.move(bestDir.x, bestDir.z);
  }

  if (p.t - lastSay > 7) {
    lastSay = p.t;
    api.say(dist > 12 ? "eight arms, one beam" : "too close, ape");
  }
}
