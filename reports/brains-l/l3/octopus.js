let chargeReadyAt = 0;
let smashReadyAt = 0;
let ejumpReadyAt = 0;
let blockedCount = 0;
let lastSay = -99;
let lastBlinkT = -99;
let lastLaserT = -99;

function insideBlock(p, x, z, m) {
  for (const o of p.arena.obstacles) {
    if (Math.abs(x - o.x) < o.hx + m && Math.abs(z - o.z) < o.hz + m) return true;
  }
  return false;
}

function trackEvents(p) {
  for (const ev of p.events) {
    if (ev.type === 'enemyStarted') {
      if (ev.skill === 'charge') chargeReadyAt = p.t + 4.0;
      else if (ev.skill === 'smash') smashReadyAt = p.t + 1.3;
      else if (ev.skill === 'jump') ejumpReadyAt = p.t + 2.8;
    } else if (ev.type === 'blocked') {
      blockedCount++;
    } else if (ev.type === 'blinked') {
      lastBlinkT = p.t;
      blockedCount = 0;
    }
  }
  if (blockedCount > 0 && p.tick % 30 === 0) blockedCount = Math.max(0, blockedCount - 1);
}

function predictEnemy(p, tAhead) {
  const e = p.enemy;
  const k = 0.85;
  let x = e.x + e.vx * tAhead * k;
  let z = e.z + e.vz * tAhead * k;
  if (x > 19.3) x = 19.3; if (x < -19.3) x = -19.3;
  if (z > 19.3) z = 19.3; if (z < -19.3) z = -19.3;
  return { x, z };
}

// pick a walkable direction close to `desired`, preferring open space,
// arena interior, and (weighted by fleeW) distance from the enemy
function refine(p, api, desired, fleeW) {
  const s = p.self, e = p.enemy;
  const d0 = V.norm(desired);
  if (d0.x === 0 && d0.z === 0) return d0;
  let best = null;
  for (let i = 0; i < 24; i++) {
    const a = i * Math.PI / 12;
    const d = { x: Math.sin(a), z: Math.cos(a) };
    let r;
    try { r = api.ray(d.x, d.z, 7); } catch (err) { r = { dist: 7 }; }
    const clear = Math.min(r.dist, 7);
    if (clear < 1.45) continue;
    const step = Math.min(Math.max(clear - 1.0, 0), 3.4);
    const fx = s.x + d.x * step, fz = s.z + d.z * step;
    const wall = 20 - Math.max(Math.abs(fx), Math.abs(fz));
    const fd = Math.hypot(fx - e.x, fz - e.z);
    let sc = V.dot(d, d0) * 3.2 + clear * 0.28 + Math.min(wall, 6) * 0.42;
    sc += Math.min(fd, 20) * 0.18 * fleeW;
    if (!best || sc > best.sc) best = { sc, d };
  }
  return best ? best.d : d0;
}

function bestBlinkDir(p, api, desired) {
  const s = p.self, e = p.enemy;
  const d0 = V.norm(desired);
  let best = null;
  for (let i = 0; i < 24; i++) {
    const a = i * Math.PI / 12;
    const d = { x: Math.sin(a), z: Math.cos(a) };
    let bx = s.x + d.x * 7.5, bz = s.z + d.z * 7.5;
    if (bx > 18.6) bx = 18.6; if (bx < -18.6) bx = -18.6;
    if (bz > 18.6) bz = 18.6; if (bz < -18.6) bz = -18.6;
    const dd = Math.hypot(bx - e.x, bz - e.z);
    const wall = 20 - Math.max(Math.abs(bx), Math.abs(bz));
    let sc = Math.min(dd, 22) * 0.9 + Math.min(wall, 7) * 0.5 + V.dot(d, d0) * 3.0;
    if (insideBlock(p, bx, bz, 1.3)) sc -= 6;
    if (!best || sc > best.sc) best = { sc, d };
  }
  return best ? best.d : d0;
}

function think(p, api) {
  const s = p.self, e = p.enemy;
  if (!s || !e || !s.alive) return;
  trackEvents(p);

  const dist = e.dist;
  const away = V.norm({ x: s.x - e.x, z: s.z - e.z });
  const toE = V.norm({ x: e.x - s.x, z: e.z - s.z });

  // ---------------- enemy threat analysis ----------------
  const ec = e.casting;
  const charging = !!(ec && ec.skill === 'charge');
  const dashing = charging && ec.phase === 'dash';
  const chargeWind = charging && ec.phase === 'windup';
  const smashWind = !!(ec && ec.skill === 'smash' && ec.phase === 'windup');
  const chargeReady = p.t >= chargeReadyAt && !charging;

  let dodgeDir = null;
  let onLine = false;
  if (charging) {
    let dir;
    if (dashing && (Math.abs(e.vx) + Math.abs(e.vz)) > 1.0) dir = V.norm({ x: e.vx, z: e.vz });
    else dir = V.fromHeading(e.heading);
    const rel = { x: s.x - e.x, z: s.z - e.z };
    const along = rel.x * dir.x + rel.z * dir.z;
    const cross = rel.x * dir.z - rel.z * dir.x;
    const perp = Math.abs(cross);
    onLine = along > -1.5 && along < 15 && perp < 3.6;
    if (onLine) {
      const side = cross >= 0 ? 1 : -1;
      let pd = { x: dir.z * side, z: -dir.x * side };
      // slight backward bias
      pd = V.norm({ x: pd.x + away.x * 0.35, z: pd.z + away.z * 0.35 });
      let clearA = 7, clearB = 7;
      try { clearA = api.ray(pd.x, pd.z, 5).dist; } catch (err) {}
      let alt = { x: -dir.z * side, z: dir.x * side };
      alt = V.norm({ x: alt.x + away.x * 0.35, z: alt.z + away.z * 0.35 });
      try { clearB = api.ray(alt.x, alt.z, 5).dist; } catch (err) {}
      dodgeDir = (clearA < 2.0 && clearB > clearA) ? alt : pd;
    }
  }

  // ---------------- reactions ----------------
  let acted = false;

  // 1) dodge a committed / imminent charge
  if (dodgeDir && (dashing || (chargeWind && ec.remaining < 0.14))) {
    if (!s.busy && !s.stunned && !s.airborne && api.ready('blink')) {
      const bd = bestBlinkDir(p, api, dodgeDir);
      api.use('blink', bd.x, bd.z);
      api.move(bd.x, bd.z);
      api.faceAt(e.x, e.z);
      lastBlinkT = p.t;
      return;
    }
    api.move(dodgeDir.x, dodgeDir.z);
    api.faceAt(e.x, e.z);
    acted = true;
  }

  // 2) dodge a smash by hopping (ground sweep passes under)
  if (!acted && smashWind && dist < 5.6 && !s.busy && !s.stunned && !s.airborne) {
    if (api.ready('blink') && dist < 5.0) {
      const bd = bestBlinkDir(p, api, away);
      api.use('blink', bd.x, bd.z);
      api.move(bd.x, bd.z);
      api.faceAt(e.x, e.z);
      lastBlinkT = p.t;
      return;
    }
    if (ec.remaining > 0.09 && ec.remaining < 0.32 && api.ready('jump') && !chargeReady) {
      const fd = refine(p, api, away, 1.5);
      api.move(fd.x, fd.z);
      api.use('jump');
      api.faceAt(e.x, e.z);
      return;
    }
  }

  // 3) emergency spacing
  if (!acted && !s.busy && !s.stunned && !s.airborne) {
    const cornered = blockedCount >= 3 && dist < 9;
    if ((dist < 5.2 || cornered) && api.ready('blink')) {
      const bd = bestBlinkDir(p, api, away);
      api.use('blink', bd.x, bd.z);
      api.move(bd.x, bd.z);
      api.faceAt(e.x, e.z);
      lastBlinkT = p.t;
      blockedCount = 0;
      return;
    }
  }

  // ---------------- if already casting the laser, steer the beam ----------------
  if (s.casting && s.casting.skill === 'laser' && s.casting.telegraph) {
    const tf = Math.max(0.02, s.casting.remaining);
    const pr = predictEnemy(p, tf);
    api.faceAt(pr.x, pr.z);
    if (!acted) {
      const w = dist < 12 ? 2.0 : 1.0;
      const desired = dist < 15
        ? V.norm({ x: away.x * 1.0 + (-toE.z) * 0.35, z: away.z * 1.0 + (toE.x) * 0.35 })
        : V.norm({ x: -toE.z, z: toE.x });
      const md = refine(p, api, desired, w);
      api.move(md.x, md.z);
    }
    return;
  }

  if (s.stunned || s.airborne) {
    api.faceAt(e.x, e.z);
    return;
  }

  // ---------------- offence ----------------
  const enemyHelpless = e.stunned || (ec && ec.phase === 'recover') ||
    (charging && ec.phase === 'dash');
  const safeFromCharge = dist > 14.2 || !chargeReady || enemyHelpless;
  const safeFromSmash = dist > 6.8 || enemyHelpless;

  let fired = false;
  if (!acted && !s.busy && api.ready('laser') && e.visible && e.alive &&
      dist < 23.0 && dist > 2.2 && safeFromCharge && safeFromSmash && !e.invulnerable) {
    const pr = predictEnemy(p, 0.65);
    if (api.los(pr.x, pr.z) || api.los(e.x, e.z)) {
      api.use('laser');
      api.faceAt(pr.x, pr.z);
      lastLaserT = p.t;
      fired = true;
    }
  }

  if (!fired && !acted) {
    const pr = predictEnemy(p, 0.35);
    api.faceAt(pr.x, pr.z);
  }

  // ---------------- movement ----------------
  if (!acted) {
    let desired;
    let fleeW = 1.0;
    if (dist < 8.0) {
      desired = away;
      fleeW = 2.4;
    } else if (dist < 15.5) {
      // retreat with a lateral component so charges are hard to aim
      const side = ((s.x * e.z - s.z * e.x) >= 0) ? 1 : -1;
      const perp = { x: -toE.z * side, z: toE.x * side };
      desired = V.norm({ x: away.x * 1.0 + perp.x * 0.55, z: away.z * 1.0 + perp.z * 0.55 });
      fleeW = 1.5;
    } else if (dist < 21.0) {
      const side = ((s.x * e.z - s.z * e.x) >= 0) ? 1 : -1;
      const perp = { x: -toE.z * side, z: toE.x * side };
      desired = V.norm({ x: perp.x + away.x * 0.25, z: perp.z + away.z * 0.25 });
      fleeW = 0.7;
    } else {
      // close in enough to bring the beam to bear
      const side = ((s.x * e.z - s.z * e.x) >= 0) ? 1 : -1;
      const perp = { x: -toE.z * side, z: toE.x * side };
      desired = V.norm({ x: toE.x + perp.x * 0.45, z: toE.z + perp.z * 0.45 });
      fleeW = 0.2;
    }
    const md = refine(p, api, desired, fleeW);
    api.move(md.x, md.z);
  }

  if (p.t - lastSay > 9.5) {
    lastSay = p.t;
    api.say(dist < 8 ? "too close, eight legs leaving" : "beam discipline");
  }
}
