const M = { orbit: 1, flipT: -9, mode: 'kite', lastBlink: -9, lastJump: -9 };

function nrm(v) { const l = Math.hypot(v.x, v.z) || 1; return { x: v.x / l, z: v.z / l }; }
function rot(v, a) { const c = Math.cos(a), s = Math.sin(a); return { x: v.x * c - v.z * s, z: v.x * s + v.z * c }; }

function enemyReady(skill, t) {
  const base = { charge: 4.033, smash: 1.3, jump: 2.8 }[skill] || 0;
  const last = M['e_' + skill];
  if (last === undefined) return true;
  return (t - last) >= base - 0.06;
}

function closestOnRay(ex, ez, dx, dz, px, pz, maxLen) {
  const wx = px - ex, wz = pz - ez;
  let t = wx * dx + wz * dz;
  if (t < 0) t = 0; if (t > maxLen) t = maxLen;
  const cx = ex + dx * t, cz = ez + dz * t;
  return { d: Math.hypot(px - cx, pz - cz), t: t };
}

function pickSafeDir(p, api, desired) {
  const S = p.self;
  const d0 = nrm(desired);
  if (d0.x === 0 && d0.z === 0) return { x: 0, z: 1 };
  const offs = [0, 0.35, -0.35, 0.7, -0.7, 1.05, -1.05, 1.45, -1.45, 1.9, -1.9, 2.4, -2.4, 3.1416];
  let best = d0, bestScore = -1e9;
  const probe = 3.2;
  for (const o of offs) {
    const dn = rot(d0, o);
    let score = -Math.abs(o) * 1.15;
    let cl = probe + 1.2;
    try { const r = api.ray(dn.x, dn.z, probe + 1.2); cl = Math.min(r.dist, probe + 1.2); } catch (e) { }
    score += cl * 1.7;
    const nx = S.x + dn.x * probe, nz = S.z + dn.z * probe;
    const m = Math.max(Math.abs(nx), Math.abs(nz));
    if (m > 18.0) score -= (m - 18.0) * 7;
    if (score > bestScore) { bestScore = score; best = dn; }
  }
  return best;
}

function blinkDir(p, prefer) {
  const S = p.self, E = p.enemy;
  const pf = nrm(prefer);
  let best = pf, bs = -1e9;
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    const d = { x: Math.sin(a), z: Math.cos(a) };
    const dot = d.x * pf.x + d.z * pf.z;
    const tx = S.x + d.x * 7.5, tz = S.z + d.z * 7.5;
    const cx = Math.max(-19, Math.min(19, tx)), cz = Math.max(-19, Math.min(19, tz));
    const de = Math.hypot(cx - E.x, cz - E.z);
    let score = dot * 5 + de * 0.45;
    const m = Math.max(Math.abs(tx), Math.abs(tz));
    if (m > 19) score -= (m - 19) * 4;
    if (score > bs) { bs = score; best = d; }
  }
  return best;
}

function think(p, api) {
  const S = p.self, E = p.enemy;
  if (!S.alive) return;

  for (const ev of p.events) {
    if (ev.type === 'enemyStarted') M['e_' + ev.skill] = p.t;
    if (ev.type === 'blocked' && p.t - M.flipT > 0.6) { M.orbit = -M.orbit; M.flipT = p.t; }
    if (ev.type === 'blinked') M.lastBlink = p.t;
  }

  const dist = E.dist;
  const toE = nrm({ x: E.x - S.x, z: E.z - S.z });
  const away = { x: -toE.x, z: -toE.z };
  let perp = { x: toE.z * M.orbit, z: -toE.x * M.orbit };

  // corner escape: flip orbit if we are hugging a wall and orbiting into it
  const nearWall = Math.max(Math.abs(S.x), Math.abs(S.z)) > 16.5;
  if (nearWall && p.t - M.flipT > 0.8) {
    const ahead = { x: S.x + perp.x * 4, z: S.z + perp.z * 4 };
    if (Math.max(Math.abs(ahead.x), Math.abs(ahead.z)) > 18.5) { M.orbit = -M.orbit; M.flipT = p.t; perp = { x: toE.z * M.orbit, z: -toE.x * M.orbit }; }
  }

  const ec = E.casting;
  const canAct = !S.busy && !S.stunned && !S.airborne;
  let mode = 'kite';
  let moveDir = null;
  let didSkill = false;

  // ---- threat: charge ----
  if (ec && ec.skill === 'charge') {
    let cd;
    if (E.speed > 4) cd = nrm({ x: E.vx, z: E.vz });
    else cd = { x: Math.sin(E.heading), z: Math.cos(E.heading) };
    const committed = (ec.phase === 'dash') || (ec.phase === 'windup' && ec.remaining <= 0.1);
    const info = closestOnRay(E.x, E.z, cd.x, cd.z, S.x, S.z, ec.phase === 'dash' ? 12 : 13.5);
    const side1 = { x: cd.z, z: -cd.x };
    const wx = S.x - E.x, wz = S.z - E.z;
    let side = (side1.x * wx + side1.z * wz) >= 0 ? side1 : { x: -side1.x, z: -side1.z };
    if (Math.max(Math.abs(S.x + side.x * 5), Math.abs(S.z + side.z * 5)) > 18.5) side = { x: -side.x, z: -side.z };

    if (committed && info.d < 3.1 && dist < 14.5) {
      mode = 'dodge-charge';
      if (canAct && api.ready('blink')) {
        const bd = blinkDir(p, side);
        api.use('blink', bd.x, bd.z);
        didSkill = true;
        M.lastBlink = p.t;
      }
      moveDir = { x: side.x + away.x * 0.35, z: side.z + away.z * 0.35 };
    } else if (!committed) {
      mode = 'pre-charge';
      moveDir = { x: side.x * 1.0 + away.x * 0.6, z: side.z * 1.0 + away.z * 0.6 };
    }
  }

  // ---- threat: smash ----
  if (!didSkill && mode === 'kite' && ec && ec.skill === 'smash' && ec.telegraph && dist < 6.2) {
    mode = 'dodge-smash';
    moveDir = { x: away.x * 1.0 + perp.x * 0.7, z: away.z * 1.0 + perp.z * 0.7 };
    if (canAct && api.ready('jump')) {
      api.move(moveDir.x, moveDir.z);
      api.use('jump');
      didSkill = true;
      M.lastJump = p.t;
    } else if (canAct && api.ready('blink') && !enemyReady('charge', p.t)) {
      const bd = blinkDir(p, moveDir);
      api.use('blink', bd.x, bd.z);
      didSkill = true;
    }
  }

  // ---- melee pressure escape ----
  if (!didSkill && mode === 'kite' && dist < 6.4 && canAct && api.ready('blink') && !enemyReady('charge', p.t)) {
    mode = 'disengage';
    const pref = { x: away.x + perp.x * 0.5, z: away.z + perp.z * 0.5 };
    const bd = blinkDir(p, pref);
    api.use('blink', bd.x, bd.z);
    didSkill = true;
  }

  // ---- attack ----
  const chargeTelegraph = ec && ec.skill === 'charge';
  const laserOk = canAct && !didSkill && api.ready('laser') && E.visible && E.alive &&
    dist > 4.2 && dist < 24.0 && !E.invulnerable && !chargeTelegraph &&
    !(dist < 5.6 && enemyReady('smash', p.t));

  if (laserOk) {
    api.use('laser');
    didSkill = true;
    if (mode === 'kite') mode = 'fire';
  }

  // ---- aim ----
  let lead = 0.16;
  if (S.casting && S.casting.skill === 'laser' && S.casting.telegraph) lead = S.casting.remaining;
  else if (laserOk) lead = 0.72;
  let ax = E.x + E.vx * lead * 0.95, az = E.z + E.vz * lead * 0.95;
  const dm = Math.hypot(ax - S.x, az - S.z);
  if (dm > 0.5 && lead > 0.3) {
    // don't over-lead into a block edge; blend with real position
    if (!api.los(ax, az) && api.los(E.x, E.z)) { ax = (ax + E.x) / 2; az = (az + E.z) / 2; }
  }
  api.faceAt(ax, az);

  // ---- movement ----
  if (!moveDir) {
    if (!E.visible) {
      if (dist > 17) moveDir = { x: toE.x * 1.0 + perp.x * 0.5, z: toE.z * 1.0 + perp.z * 0.5 };
      else moveDir = { x: toE.x * 0.55 + perp.x * 1.0, z: toE.z * 0.55 + perp.z * 1.0 };
    } else {
      const want = enemyReady('charge', p.t) ? 15.0 : 11.0;
      let radial = (dist - want) / 5.5;
      if (radial > 1) radial = 1; if (radial < -1) radial = -1;
      let tang = 0.9;
      if (dist < 8) tang = 0.55;
      if (dist > 20) tang = 0.35;
      moveDir = { x: toE.x * radial + perp.x * tang, z: toE.z * radial + perp.z * tang };
      const cdist = Math.hypot(S.x, S.z);
      if (cdist > 12) {
        const w = Math.min(1.6, (cdist - 12) / 5);
        moveDir.x += (-S.x / (cdist || 1)) * w;
        moveDir.z += (-S.z / (cdist || 1)) * w;
      }
    }
  }

  if (!S.airborne) {
    const safe = pickSafeDir(p, api, moveDir);
    api.move(safe.x, safe.z);
  }

  M.mode = mode;
  api.remember('mode', mode);
}
