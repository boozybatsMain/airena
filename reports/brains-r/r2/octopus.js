function segBox(ax, az, bx, bz, o, pad) {
  const minx = o.x - o.hx - pad, maxx = o.x + o.hx + pad;
  const minz = o.z - o.hz - pad, maxz = o.z + o.hz + pad;
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

function clearSeg(p, ax, az, bx, bz, pad) {
  for (const o of p.arena.obstacles) if (segBox(ax, az, bx, bz, o, pad)) return false;
  return true;
}

function inBlock(p, x, z, pad) {
  for (const o of p.arena.obstacles) {
    if (Math.abs(x - o.x) < o.hx + pad && Math.abs(z - o.z) < o.hz + pad) return true;
  }
  return Math.abs(x) > 19.3 || Math.abs(z) > 19.3;
}

let lastUse = {};
let lastDir = { x: 0, z: 1 };
let saidOnce = false;

function chooseMove(p, api, desired, hide, wantLos) {
  const s = p.self, e = p.enemy;
  const spd = (s.casting ? s.maxSpeed * 0.45 : s.maxSpeed);
  const T = 0.8;
  let best = null, bestScore = -1e9;
  for (let i = 0; i < 24; i++) {
    const a = i * Math.PI * 2 / 24;
    const d = { x: Math.sin(a), z: Math.cos(a) };
    const nx = s.x + d.x * spd * T, nz = s.z + d.z * spd * T;
    let sc = 0;
    const bx = Math.max(0, Math.abs(nx) - 15.5), bz = Math.max(0, Math.abs(nz) - 15.5);
    sc -= (bx + bz) * 2.2;
    if (Math.abs(nx) > 18.8 || Math.abs(nz) > 18.8) sc -= 40;
    let bad = false;
    for (const o of p.arena.obstacles) {
      if (Math.abs(nx - o.x) < o.hx + 1.35 && Math.abs(nz - o.z) < o.hz + 1.35) { bad = true; break; }
      if (segBox(s.x, s.z, nx, nz, o, 1.15)) { bad = true; break; }
    }
    if (bad) sc -= 35;
    const nd = Math.hypot(nx - e.x, nz - e.z);
    sc -= Math.abs(nd - desired) * 0.85;
    if (nd < desired) sc -= (desired - nd) * 1.3;
    const vis = clearSeg(p, nx, nz, e.x, e.z, 0.2);
    if (hide && !vis) sc += 2.2;
    if (wantLos && vis) sc += 1.4;
    sc += (d.x * lastDir.x + d.z * lastDir.z) * 0.6;
    sc += api.rand() * 0.15;
    if (sc > bestScore) { bestScore = sc; best = d; }
  }
  return best || { x: 0, z: 0 };
}

function chooseBlink(p, base) {
  const s = p.self, e = p.enemy;
  let best = base, bs = -1e9;
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8;
    const d = { x: Math.sin(a), z: Math.cos(a) };
    let nx = s.x + d.x * 7.5, nz = s.z + d.z * 7.5;
    nx = Math.max(-18.6, Math.min(18.6, nx));
    nz = Math.max(-18.6, Math.min(18.6, nz));
    let sc = Math.hypot(nx - e.x, nz - e.z) * 1.0;
    if (inBlock(p, nx, nz, 1.3)) sc -= 12;
    sc += (d.x * base.x + d.z * base.z) * 3.0;
    if (!clearSeg(p, nx, nz, e.x, e.z, 0.2)) sc += 1.5;
    sc -= (Math.max(0, Math.abs(nx) - 15) + Math.max(0, Math.abs(nz) - 15)) * 1.2;
    if (sc > bs) { bs = sc; best = d; }
  }
  return best;
}

function think(p, api) {
  const s = p.self, e = p.enemy;
  const t = p.t;
  for (const ev of p.events) {
    if (ev.type === 'enemyStarted' && ev.skill) lastUse[ev.skill] = t;
    if (ev.type === 'enemyCommitted' && ev.skill === 'charge') lastUse.charge = t;
  }
  if (!s.alive || !e || !e.alive) return;

  if (!saidOnce) { saidOnce = true; api.say("eight arms, one beam"); }

  const dist = Math.max(0.001, e.dist);
  const away = { x: (s.x - e.x) / dist, z: (s.z - e.z) / dist };
  const chargeReady = (lastUse.charge === undefined) || (t - lastUse.charge >= 3.85);
  const eCast = e.casting;
  const eTele = !!(eCast && eCast.telegraph);
  const myFrac = s.hp / s.maxHp, eFrac = e.hp / e.maxHp;
  const defensive = (myFrac > eFrac + 0.06) && t > 33;

  let desired = chargeReady ? 16.0 : 11.0;
  if (defensive) desired = 18.0;
  if (dist > 24) desired = 18.0;

  let moveDir = null;
  let used = false;
  const canAct = !s.busy && !s.stunned && !s.airborne;

  // ---- charge wind-up: sidestep / blink perpendicular to their aim
  if (eCast && eCast.skill === 'charge' && eTele) {
    const perp = { x: Math.cos(e.heading), z: -Math.sin(e.heading) };
    const scoreSide = (d) => {
      const nx = s.x + d.x * 6.5, nz = s.z + d.z * 6.5;
      let sc = 0;
      if (inBlock(p, nx, nz, 1.4)) sc -= 12;
      sc -= Math.max(0, Math.abs(nx) - 14) + Math.max(0, Math.abs(nz) - 14);
      return sc;
    };
    const alt = { x: -perp.x, z: -perp.z };
    const side = scoreSide(perp) >= scoreSide(alt) ? perp : alt;
    if (dist < 16.5) {
      const esc = { x: side.x + away.x * 0.45, z: side.z + away.z * 0.45 };
      if (canAct && api.ready('blink') && (eCast.remaining === undefined || eCast.remaining <= 0.14)) {
        const bd = chooseBlink(p, esc);
        api.use('blink', bd.x, bd.z);
        used = true;
      }
      moveDir = esc;
    }
  }

  // ---- charge dash inbound: get off the line
  if (!moveDir && eCast && eCast.skill === 'charge' && !eTele && eCast.phase === 'dash') {
    const evl = Math.max(0.001, Math.hypot(e.vx, e.vz));
    const dirE = { x: e.vx / evl, z: e.vz / evl };
    const rel = { x: s.x - e.x, z: s.z - e.z };
    const along = rel.x * dirE.x + rel.z * dirE.z;
    const cross = rel.x * dirE.z - rel.z * dirE.x;
    if (along > 0 && along < 14 && Math.abs(cross) < 3.4) {
      const perp = { x: dirE.z, z: -dirE.x };
      const side = cross >= 0 ? perp : { x: -perp.x, z: -perp.z };
      const tImpact = (along - 2.3) / 15;
      if (canAct && tImpact < 0.25 && api.ready('blink')) {
        const bd = chooseBlink(p, side);
        api.use('blink', bd.x, bd.z);
        used = true;
      }
      moveDir = side;
    }
  }

  // ---- smash wind-up in range: hop over it
  if (!used && eCast && eCast.skill === 'smash' && eTele && dist < 7.0) {
    if (canAct && api.ready('jump')) {
      api.use('jump');
      used = true;
    } else if (canAct && api.ready('blink')) {
      const bd = chooseBlink(p, away);
      api.use('blink', bd.x, bd.z);
      used = true;
    }
    if (!moveDir) moveDir = { x: away.x, z: away.z };
  }

  // ---- too close for comfort: blink out
  if (!used && canAct && dist < 4.4 && api.ready('blink')) {
    const bd = chooseBlink(p, away);
    api.use('blink', bd.x, bd.z);
    used = true;
  }

  // ---- laser
  if (!used && canAct && api.ready('laser') && e.visible && dist < 23.0 && !e.invulnerable) {
    const chargeThreat = chargeReady && !eCast && dist < 15.5 && !e.stunned && !e.airborne;
    const meleeThreat = dist < 8.3 && !e.stunned && !e.airborne;
    const free = e.stunned || e.airborne ||
      (eCast && eCast.skill === 'charge' && eCast.phase !== 'windup') ||
      (eCast && eCast.skill === 'smash' && dist > 7.5);
    const okDefensive = !defensive || dist > 12;
    if ((free || (!chargeThreat && !meleeThreat)) && okDefensive) {
      api.use('laser');
      used = true;
    }
  }

  // ---- movement
  if (!moveDir) {
    const laserCd = api.cooldown('laser');
    const hide = (laserCd > 0.55 || defensive) && dist < 17.5;
    moveDir = chooseMove(p, api, desired, hide, !hide);
  }
  const ml = Math.hypot(moveDir.x, moveDir.z);
  if (ml > 1e-6) {
    lastDir = { x: moveDir.x / ml, z: moveDir.z / ml };
    api.move(moveDir.x, moveDir.z);
  } else {
    api.stop();
  }

  // ---- facing: lead the shot
  let tf = 0.12;
  if (s.casting && s.casting.skill === 'laser' && s.casting.phase === 'windup') {
    tf = Math.max(0, Math.min(0.7, s.casting.remaining || 0));
  }
  const ax = e.x + e.vx * tf * 0.85;
  const az = e.z + e.vz * tf * 0.85;
  api.faceAt(ax, az);
}
