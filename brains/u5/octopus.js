function segBox(ax, az, bx, bz, b, pad) {
  const minX = b.x - b.hx - pad, maxX = b.x + b.hx + pad;
  const minZ = b.z - b.hz - pad, maxZ = b.z + b.hz + pad;
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dz = bz - az;
  if (Math.abs(dx) < 1e-9) { if (ax < minX || ax > maxX) return false; }
  else {
    let ta = (minX - ax) / dx, tb = (maxX - ax) / dx;
    if (ta > tb) { const q = ta; ta = tb; tb = q; }
    if (ta > t0) t0 = ta; if (tb < t1) t1 = tb;
    if (t0 > t1) return false;
  }
  if (Math.abs(dz) < 1e-9) { if (az < minZ || az > maxZ) return false; }
  else {
    let ta = (minZ - az) / dz, tb = (maxZ - az) / dz;
    if (ta > tb) { const q = ta; ta = tb; tb = q; }
    if (ta > t0) t0 = ta; if (tb < t1) t1 = tb;
    if (t0 > t1) return false;
  }
  return true;
}

function clearLine(obs, ax, az, bx, bz) {
  for (const b of obs) if (segBox(ax, az, bx, bz, b, 0)) return false;
  return true;
}

function inBlock(obs, x, z, pad) {
  for (const b of obs) if (Math.abs(x - b.x) < b.hx + pad && Math.abs(z - b.z) < b.hz + pad) return true;
  return false;
}

let circle = 1;
let chargeReadyAt = 0;
let lastFlip = 0;
let lastMove = { x: 0, z: 1 };
let blinkAt = -99;

function pickMove(p, want, prefer, preferW) {
  const s = p.self, e = p.enemy, obs = p.arena.obstacles, H = p.arena.half;
  let best = { x: 0, z: 0 }, bs = -1e9;
  for (let i = 0; i < 32; i++) {
    const a = i * Math.PI / 16;
    const d = { x: Math.sin(a), z: Math.cos(a) };
    const nx = s.x + d.x * 1.4, nz = s.z + d.z * 1.4;
    const px = s.x + d.x * 3.0, pz = s.z + d.z * 3.0;
    let sc = 0;
    if (inBlock(obs, nx, nz, 1.15)) sc -= 120;
    if (inBlock(obs, px, pz, 1.15)) sc -= 45;
    if (Math.abs(nx) > H - 1.1 || Math.abs(nz) > H - 1.1) sc -= 120;
    if (Math.abs(px) > H - 1.1 || Math.abs(pz) > H - 1.1) sc -= 45;
    const wd = Math.min(H - Math.abs(px), H - Math.abs(pz));
    sc += Math.min(wd, 6) * 2.0;
    const dd = Math.hypot(px - e.x, pz - e.z);
    sc -= Math.abs(dd - want) * 3.5;
    if (clearLine(obs, px, pz, e.x, e.z)) sc += 5;
    if (prefer) sc += (d.x * prefer.x + d.z * prefer.z) * (preferW || 4);
    sc += (d.x * lastMove.x + d.z * lastMove.z) * 1.6;
    if (sc > bs) { bs = sc; best = d; }
  }
  return best;
}

function pickBlink(p, pref, spread) {
  const s = p.self, e = p.enemy, H = p.arena.half, obs = p.arena.obstacles;
  const base = Math.atan2(pref.x, pref.z);
  let best = pref, bs = -1e9;
  const steps = 5;
  for (let k = -steps; k <= steps; k++) {
    const a = base + k * (spread / steps);
    const d = { x: Math.sin(a), z: Math.cos(a) };
    let px = 0, pz = 0, ok = false, R = 0;
    for (let r = 7.5; r >= 2.0; r -= 0.6) {
      const cx = s.x + d.x * r, cz = s.z + d.z * r;
      if (Math.abs(cx) <= H - 1.1 && Math.abs(cz) <= H - 1.1 && !inBlock(obs, cx, cz, 1.15)) {
        px = cx; pz = cz; ok = true; R = r; break;
      }
    }
    if (!ok) continue;
    let sc = Math.min(Math.hypot(px - e.x, pz - e.z), 19) * 2.2;
    sc += Math.min(H - Math.abs(px), H - Math.abs(pz)) * 1.1;
    sc += R * 0.5;
    sc -= Math.abs(k) * 0.5;
    if (clearLine(obs, px, pz, e.x, e.z)) sc += 3;
    if (sc > bs) { bs = sc; best = d; }
  }
  return best;
}

function think(p, api) {
  const s = p.self, e = p.enemy, obs = p.arena.obstacles, H = p.arena.half, t = p.t;

  for (const ev of p.events) {
    if (ev.type === 'enemyStarted' && ev.skill === 'charge') chargeReadyAt = t + 4.033;
    if (ev.type === 'damaged' && ev.skill === 'charge') chargeReadyAt = Math.max(chargeReadyAt, t + 3.7);
    if (ev.type === 'blocked') { if (t - lastFlip > 0.5) { circle = -circle; lastFlip = t; } }
    if (ev.type === 'blinked') blinkAt = t;
  }
  if (!s.alive || !e.alive) return;

  const dist = e.dist;
  const uToE = V.norm({ x: e.x - s.x, z: e.z - s.z });
  const ec = e.casting;
  const charging = !!(ec && ec.skill === 'charge');
  const smashing = !!(ec && ec.skill === 'smash' && ec.telegraph);
  if (charging) chargeReadyAt = Math.max(chargeReadyAt, t + 4.033 - (ec.elapsed || 0));

  const casting = !!(s.casting && s.casting.skill === 'laser' && s.casting.telegraph);

  // periodic circle flip to stay unpredictable
  if (t - lastFlip > 3.2 && api.rand() < 0.25) { circle = -circle; lastFlip = t; }

  const perpE = { x: uToE.z * circle, z: -uToE.x * circle };

  // ---- facing: always track the enemy (with a small lead) ----
  let lead = 0.12;
  if (casting) lead = Math.min(s.casting.remaining, 0.4);
  api.faceAt(e.x + e.vx * lead, e.z + e.vz * lead);

  // ---------- CHARGE DODGE ----------
  if (charging) {
    const ed = V.fromHeading(e.heading);
    const rx = s.x - e.x, rz = s.z - e.z;
    const along = rx * ed.x + rz * ed.z;
    const lat = rx * ed.z - rz * ed.x;
    const threat = along > -1.5 && along < 15.5 && Math.abs(lat) < 3.4;
    if (threat) {
      let sg = lat >= 0 ? 1 : -1;
      if (Math.abs(lat) < 0.4) {
        const ax = s.x + ed.z * 4, az = s.z - ed.x * 4;
        const bx = s.x - ed.z * 4, bz = s.z + ed.x * 4;
        const sa = Math.min(H - Math.abs(ax), H - Math.abs(az)) - (inBlock(obs, ax, az, 1.2) ? 20 : 0);
        const sb = Math.min(H - Math.abs(bx), H - Math.abs(bz)) - (inBlock(obs, bx, bz, 1.2) ? 20 : 0);
        sg = sa >= sb ? 1 : -1;
      }
      const perp = { x: ed.z * sg, z: -ed.x * sg };
      const soon = (ec.phase !== 'windup') || ec.remaining < 0.2;
      if (soon && !s.busy && !s.airborne && api.ready('blink') && dist < 16 && Math.abs(lat) < 3.0) {
        const bd = pickBlink(p, perp, 0.8);
        api.use('blink', bd.x, bd.z);
      }
      const mv = pickMove(p, 18, perp, 9);
      lastMove = mv;
      api.move(mv.x, mv.z);
      return;
    }
  }

  // ---------- MELEE PANIC ----------
  const awayDir = { x: -uToE.x, z: -uToE.z };
  if (smashing && dist < 6.6 && !s.airborne) {
    if (!s.busy && api.ready('blink')) {
      const bd = pickBlink(p, { x: awayDir.x * 0.75 + perpE.x * 0.66, z: awayDir.z * 0.75 + perpE.z * 0.66 }, 1.1);
      api.use('blink', bd.x, bd.z);
      const mv = pickMove(p, 17, awayDir, 7);
      lastMove = mv; api.move(mv.x, mv.z);
      return;
    }
    const mv = pickMove(p, 17, { x: awayDir.x * 0.7 + perpE.x, z: awayDir.z * 0.7 + perpE.z }, 7);
    lastMove = mv; api.move(mv.x, mv.z);
    if (!s.busy && api.ready('jump')) api.use('jump');
    return;
  }

  // ---------- BLINK TO MAKE ROOM ----------
  if (!s.busy && !s.airborne && api.ready('blink')) {
    const chargeSoon = chargeReadyAt <= t + 1.4;
    if (dist < 6.2 || (dist < 9.0 && !chargeSoon)) {
      const bd = pickBlink(p, { x: awayDir.x + perpE.x * 0.5, z: awayDir.z + perpE.z * 0.5 }, 1.3);
      api.use('blink', bd.x, bd.z);
      const mv = pickMove(p, 17, awayDir, 6);
      lastMove = mv; api.move(mv.x, mv.z);
      return;
    }
  }

  // ---------- LASER ----------
  const chargeReady = chargeReadyAt <= t + 0.7;
  const safeCast = dist > 10.0 || !chargeReady || e.busy;
  if (!s.busy && !s.airborne && !s.stunned && api.ready('laser') && e.visible &&
      dist > 6.4 && dist < 22.5 && safeCast) {
    const err = Math.abs(V.angleTo(s.heading, uToE));
    if (err < 1.05) api.use('laser');
  }

  // ---------- MOVEMENT ----------
  let want = 15.5;
  if (casting) want = Math.min(dist + 6, 20);
  else if (dist > 23) want = 17.5;
  else if (dist < 8) want = 16.5;

  let pref = perpE;
  let pw = 3.5;
  if (dist < 11) { pref = { x: awayDir.x * 1.1 + perpE.x * 0.5, z: awayDir.z * 1.1 + perpE.z * 0.5 }; pw = 6; }
  else if (casting) { pref = { x: awayDir.x * 0.9 + perpE.x * 0.5, z: awayDir.z * 0.9 + perpE.z * 0.5 }; pw = 5; }

  const mv = pickMove(p, want, pref, pw);
  lastMove = mv;
  api.move(mv.x, mv.z);

  if (p.tick % 300 === 0) api.say(dist > 12 ? "eight arms, one beam" : "too close, ape");
}
