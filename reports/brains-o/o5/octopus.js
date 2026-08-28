function think(p, api) {
  const s = p.self, e = p.enemy;
  if (!s || !s.alive || !e) return;

  // ---- digest events ----
  for (const ev of p.events) {
    if (ev.type === 'enemyStarted') {
      if (ev.skill === 'charge') { lastChargeStart = p.t; }
      else if (ev.skill === 'smash') { lastSmashStart = p.t; }
    } else if (ev.type === 'enemyCommitted') {
      if (ev.skill === 'charge') lastCommit = p.t;
    } else if (ev.type === 'blocked') {
      if (p.t - lastFlip > 0.5) { circSign = -circSign; lastFlip = p.t; }
    } else if (ev.type === 'damaged') {
      if (ev.skill === 'charge') lastChargeStart = p.t - 0.7;
      if (ev.skill === 'smash') lastSmashStart = p.t - 0.3;
    } else if (ev.type === 'missed') {
      if (ev.reason === 'aim') leadFactor = Math.max(0.3, leadFactor - 0.15);
    } else if (ev.type === 'dealt') {
      if (ev.skill === 'laser') leadFactor = Math.min(0.9, leadFactor + 0.05);
    }
  }
  if (p.t - lastFlip > 3.2) { circSign = -circSign; lastFlip = p.t; }
  if (p.t < 0.25) api.say("Eight arms. One beam. Stay away.");

  const dist = e.dist;
  const eCast = e.casting;
  const away = V.norm({ x: s.x - e.x, z: s.z - e.z });
  const chargeReady = (p.t - lastChargeStart) > 3.85;

  // ---------- 1. charge dodge ----------
  const dashing = eCast && eCast.skill === 'charge' && eCast.phase === 'dash';
  const committed = (p.t - lastCommit) < 0.85;
  if ((dashing || committed) && dist < 16) {
    const dir = V.fromHeading(e.heading);
    const rel = { x: s.x - e.x, z: s.z - e.z };
    const along = V.dot(rel, dir);
    const lat = rel.x * dir.z - rel.z * dir.x;
    if (along > -1.5 && Math.abs(lat) < 3.6) {
      const sgn = lat >= 0 ? 1 : -1;
      let side = { x: dir.z * sgn, z: -dir.x * sgn };
      // do not dodge straight into a wall
      const rr = api.ray(side.x, side.z, 4.0);
      if (rr && rr.dist < 2.2) side = { x: -side.x, z: -side.z };
      if (!s.busy && !s.stunned && !s.airborne && api.ready('blink')) {
        const bd = blinkDir(p, api, side);
        api.use('blink', bd.x, bd.z);
        api.move(bd.x, bd.z);
        api.faceAt(e.x, e.z);
        return;
      }
      const mix = V.norm({ x: side.x * 1.0 + away.x * 0.45, z: side.z * 1.0 + away.z * 0.45 });
      api.move(mix.x, mix.z);
      api.faceAt(e.x, e.z);
      return;
    }
  }

  // ---------- 2. smash dodge ----------
  const smashTele = eCast && eCast.skill === 'smash' && eCast.telegraph;
  if (smashTele && dist < 6.6) {
    if (!s.busy && !s.stunned && !s.airborne && api.ready('jump')) {
      api.move(away.x, away.z);
      api.use('jump');
      api.faceAt(e.x, e.z);
      return;
    }
    if (!s.busy && !s.stunned && !s.airborne && api.ready('blink')) {
      const bd = blinkDir(p, api, away);
      api.use('blink', bd.x, bd.z);
      api.move(bd.x, bd.z);
      api.faceAt(e.x, e.z);
      return;
    }
    const d = bestDir(p, api, 14, 0.6);
    api.move(d.x || away.x, d.z || away.z);
    api.faceAt(e.x, e.z);
    return;
  }

  // ---------- 3. too close: get out ----------
  if (dist < 4.3 && !s.busy && !s.stunned && !s.airborne && api.ready('blink') && !e.stunned) {
    const bd = blinkDir(p, api, away);
    api.use('blink', bd.x, bd.z);
    api.move(bd.x, bd.z);
    api.faceAt(e.x, e.z);
    return;
  }

  // ---------- 4. aim ----------
  let tFire = 0.667;
  if (s.casting && s.casting.skill === 'laser' && s.casting.telegraph) tFire = s.casting.remaining;
  const aim = aimPoint(p, tFire);
  if (api.los(aim.x, aim.z)) api.faceAt(aim.x, aim.z);
  else api.faceAt(e.x, e.z);

  // ---------- 5. laser ----------
  const facingErr = Math.abs(V.angleTo(s.heading, V.toward(s, e)));
  const safeToCast = !(dist < 7.2 && (smashTele || dist < 5.6));
  if (!s.busy && !s.stunned && !s.airborne && api.ready('laser') &&
      e.visible && !e.invulnerable && dist > 3.2 && dist < 22.5 &&
      safeToCast && facingErr < 1.5) {
    api.use('laser');
  }

  // ---------- 6. movement ----------
  let D = chargeReady ? 15.0 : 10.5;
  if (s.hp < 45) D = Math.max(D, 16.0);
  if (!e.visible) {
    if (api.ready('laser') || api.cooldown('laser') < 0.7) {
      // seek a firing line
      if (dist > 7) { api.moveTo(e.x, e.z); return; }
    }
    D = Math.max(D, 12);
  }
  const casting = s.casting && s.casting.skill === 'laser';
  const d2 = bestDir(p, api, D, casting ? 0.8 : 1.5);
  if (d2.x === 0 && d2.z === 0) api.move(away.x, away.z);
  else api.move(d2.x, d2.z);
}

// ---------------- state ----------------
let circSign = 1;
let lastChargeStart = -99;
let lastSmashStart = -99;
let lastCommit = -99;
let lastFlip = 0;
let leadFactor = 0.75;

function aimPoint(p, tFire) {
  const e = p.enemy;
  let lx = e.vx * tFire * leadFactor;
  let lz = e.vz * tFire * leadFactor;
  const L = Math.hypot(lx, lz);
  if (L > 4) { lx = lx * 4 / L; lz = lz * 4 / L; }
  return { x: e.x + lx, z: e.z + lz };
}

function inBlock(p, x, z, m) {
  const obs = p.arena && p.arena.obstacles ? p.arena.obstacles : [];
  for (const o of obs) {
    if (Math.abs(x - o.x) <= o.hx + m && Math.abs(z - o.z) <= o.hz + m) return true;
  }
  return false;
}

function bestDir(p, api, D, tangentBias) {
  const s = p.self, e = p.enemy;
  const away = V.norm({ x: s.x - e.x, z: s.z - e.z });
  const tang = { x: away.z * circSign, z: -away.x * circSign };
  let best = { x: 0, z: 0 }, bestScore = -1e9;
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8;
    const d = { x: Math.sin(a), z: Math.cos(a) };
    let clear = 4.5;
    const r = api.ray(d.x, d.z, 4.5);
    if (r && typeof r.dist === 'number') clear = r.dist;
    const step = Math.min(clear - 1.15, 3.5);
    if (step < 0.7) continue;
    const q = { x: s.x + d.x * step, z: s.z + d.z * step };
    let sc = -Math.abs(V.dist(q, { x: e.x, z: e.z }) - D) * 1.7;
    const m = Math.min(20 - Math.abs(q.x), 20 - Math.abs(q.z));
    if (m < 6) sc -= (6 - m) * (6 - m) * 0.4;
    sc += V.dot(d, tang) * tangentBias;
    sc += V.dot(d, away) * 0.3;
    if (clear < 2.2) sc -= 5;
    sc -= Math.hypot(q.x, q.z) * 0.06;
    if (sc > bestScore) { bestScore = sc; best = d; }
  }
  return best;
}

function blinkDir(p, api, prefer) {
  const s = p.self, e = p.enemy;
  let best = prefer || { x: 0, z: 1 }, bs = -1e9;
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8;
    const d = { x: Math.sin(a), z: Math.cos(a) };
    let dd = 7.5;
    let q = { x: s.x + d.x * dd, z: s.z + d.z * dd };
    let guard = 0;
    while (guard++ < 6 && (Math.abs(q.x) > 18.8 || Math.abs(q.z) > 18.8 || inBlock(p, q.x, q.z, 1.15))) {
      dd -= 1.3;
      q = { x: s.x + d.x * dd, z: s.z + d.z * dd };
    }
    if (dd < 2.5) continue;
    let sc = V.dist(q, { x: e.x, z: e.z }) * 1.0 + dd * 0.35;
    const m = Math.min(20 - Math.abs(q.x), 20 - Math.abs(q.z));
    if (m < 5) sc -= (5 - m) * 2.2;
    if (prefer) sc += V.dot(d, prefer) * 4.5;
    if (sc > bs) { bs = sc; best = d; }
  }
  return best;
}
