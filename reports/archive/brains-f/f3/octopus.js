function think(p, api) {
  const s = p.self, e = p.enemy;
  if (!s || !s.alive) return;
  const obs = (p.arena && p.arena.obstacles) || [];

  // ---- event digest ----
  for (const ev of p.events) {
    if (ev.type === 'enemyStarted') {
      if (ev.skill === 'charge') { S.chargeReadyAt = p.t + 4.5; S.chargeSeen = p.t; }
      else if (ev.skill === 'smash') S.smashReadyAt = p.t + 1.1;
      else if (ev.skill === 'jump') S.enemyJumpAt = p.t + 1.6;
    } else if (ev.type === 'blocked') {
      S.spin = -S.spin; S.spinFlip = p.t;
    } else if (ev.type === 'damaged') {
      S.lastHurt = p.t;
      if (ev.skill === 'charge') S.chargeReadyAt = Math.max(S.chargeReadyAt, p.t + 4.0);
    } else if (ev.type === 'missed' && ev.skill === 'laser') {
      S.misses++;
    }
  }
  if (p.t - S.spinFlip > 3.0 + api.rand() * 2.0) { S.spinFlip = p.t; if (api.rand() < 0.5) S.spin = -S.spin; }

  const chargeReady = p.t >= S.chargeReadyAt;
  const dist = e.dist;

  // ---- threat: charge line ----
  const threat = chargeLine(p, s, e);

  // ---- aim point ----
  let lead = 0.55;
  if (s.casting && s.casting.skill === 'laser') lead = Math.max(0, Math.min(0.6, s.casting.remaining || 0));
  let aim = { x: e.x + e.vx * lead * 0.95, z: e.z + e.vz * lead * 0.95 };
  if (!losClear(s.x, s.z, aim.x, aim.z, obs, 0)) aim = { x: e.x, z: e.z };
  api.faceAt(aim.x, aim.z);

  // ---- reactive skills ----
  const canAct = !s.busy && !s.stunned && !s.airborne;

  if (canAct && threat.hit) {
    const esc = pickEscape(p, api, s, e, obs, threat);
    if (api.ready('blink') && (threat.time < 0.55 || threat.perp < 1.6)) {
      api.use('blink', esc.x, esc.z);
      api.move(esc.x, esc.z);
      S.lastDir = esc;
      api.say("slip");
      return;
    }
    api.move(esc.x, esc.z);
    S.lastDir = esc;
    return;
  }

  // smash dodge
  if (canAct && e.casting && e.casting.skill === 'smash' && e.casting.telegraph && dist < 5.2) {
    const rem = e.casting.remaining || 0.2;
    if (!chargeReady && api.ready('blink')) {
      const esc = pickEscape(p, api, s, e, obs, null);
      api.use('blink', esc.x, esc.z);
      api.move(esc.x, esc.z);
      return;
    }
    if (api.ready('jump') && rem > 0.13 && rem < 0.30) {
      api.use('jump');
      const away = V.away(s, e);
      api.move(away.x, away.z);
      return;
    }
    if (api.ready('blink')) {
      const esc = pickEscape(p, api, s, e, obs, null);
      api.use('blink', esc.x, esc.z);
      api.move(esc.x, esc.z);
      return;
    }
  }

  // panic blink if the ape is glued to us
  if (canAct && dist < 3.2 && api.ready('blink') && !e.stunned) {
    const esc = pickEscape(p, api, s, e, obs, null);
    api.use('blink', esc.x, esc.z);
    api.move(esc.x, esc.z);
    return;
  }

  // ---- laser ----
  if (canAct && api.ready('laser') && e.visible && !e.airborne && dist < 21.5) {
    const inboundCharge = e.casting && e.casting.skill === 'charge' && dist < 16;
    const err = Math.abs(V.angleTo(s.heading, V.toward(s, aim)));
    const safeClose = dist >= 5.0 || e.stunned || (e.casting && e.casting.phase === 'recover');
    if (!inboundCharge && err < 1.5 && safeClose) {
      api.use('laser');
    }
  }

  // ---- movement ----
  let desired = 12.0;
  if (!chargeReady) desired = 8.5;
  if (e.stunned || (e.casting && e.casting.phase === 'recover')) desired = Math.min(desired, 8.0);
  if (s.casting && s.casting.skill === 'laser') desired = Math.max(desired, 10.0);
  if (dist > 22) desired = 14.0;

  if (!e.visible && dist > 7) {
    const path = api.pathTo(e.x, e.z);
    if (path && path.points && path.points.length) {
      let wp = path.points[0];
      for (const q of path.points) { if (Math.hypot(q.x - s.x, q.z - s.z) > 2.0) { wp = q; break; } }
      const d = { x: wp.x - s.x, z: wp.z - s.z };
      const n = V.norm(d);
      api.move(n.x, n.z);
      S.lastDir = n;
      return;
    }
  }

  const dir = bestStep(p, api, s, e, obs, desired, threat);
  api.move(dir.x, dir.z);
  S.lastDir = dir;
}

const S = {
  chargeReadyAt: 0,
  smashReadyAt: 0,
  enemyJumpAt: 0,
  chargeSeen: -99,
  lastHurt: -99,
  spin: 1,
  spinFlip: 0,
  misses: 0,
  lastDir: { x: 0, z: 1 }
};

const STEPDIRS = (() => {
  const a = [];
  for (let i = 0; i < 20; i++) {
    const h = (i / 20) * Math.PI * 2;
    a.push({ x: Math.sin(h), z: Math.cos(h) });
  }
  return a;
})();

function segBox(ax, az, bx, bz, b, pad) {
  const minx = b.x - b.hx - pad, maxx = b.x + b.hx + pad;
  const minz = b.z - b.hz - pad, maxz = b.z + b.hz + pad;
  const dx = bx - ax, dz = bz - az;
  let t0 = 0, t1 = 1;
  if (Math.abs(dx) < 1e-9) { if (ax < minx || ax > maxx) return false; }
  else {
    let ta = (minx - ax) / dx, tb = (maxx - ax) / dx;
    if (ta > tb) { const t = ta; ta = tb; tb = t; }
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  if (Math.abs(dz) < 1e-9) { if (az < minz || az > maxz) return false; }
  else {
    let ta = (minz - az) / dz, tb = (maxz - az) / dz;
    if (ta > tb) { const t = ta; ta = tb; tb = t; }
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  return true;
}

function losClear(ax, az, bx, bz, obs, pad) {
  for (const b of obs) if (segBox(ax, az, bx, bz, b, pad)) return false;
  return true;
}

function pointFree(x, z, obs, pad) {
  if (Math.abs(x) > 19.2 || Math.abs(z) > 19.2) return false;
  for (const b of obs) {
    if (x > b.x - b.hx - pad && x < b.x + b.hx + pad && z > b.z - b.hz - pad && z < b.z + b.hz + pad) return false;
  }
  return true;
}

function blockGap(x, z, obs) {
  let m = 99;
  for (const b of obs) {
    const dx = Math.max(Math.abs(x - b.x) - b.hx, 0);
    const dz = Math.max(Math.abs(z - b.z) - b.hz, 0);
    m = Math.min(m, Math.hypot(dx, dz));
  }
  return m;
}

function chargeLine(p, s, e) {
  const out = { hit: false, perp: 99, time: 9, dir: { x: 0, z: 1 }, side: 1 };
  if (!e.casting || e.casting.skill !== 'charge') return out;
  const phase = e.casting.phase;
  let dir;
  const sp = Math.hypot(e.vx, e.vz);
  if (phase === 'dash' && sp > 6) dir = { x: e.vx / sp, z: e.vz / sp };
  else dir = V.fromHeading(e.heading);
  const rel = { x: s.x - e.x, z: s.z - e.z };
  const along = rel.x * dir.x + rel.z * dir.z;
  const px = rel.x - dir.x * along, pz = rel.z - dir.z * along;
  const perp = Math.hypot(px, pz);
  const traveled = phase === 'dash' ? Math.min(12, (e.casting.elapsed || 0) * 15) : 0;
  const reach = 12.5 - traveled;
  out.dir = dir; out.perp = perp;
  out.side = (dir.x * pz - dir.z * px) > 0 ? -1 : 1;
  const wind = phase === 'windup' ? (e.casting.remaining || 0.2) : 0;
  out.time = wind + Math.max(0, along) / 15;
  if (along > -1.5 && along < reach && perp < 2.8) out.hit = true;
  if (phase === 'windup' && along < 14 && perp < 4.0) out.hit = out.hit || perp < 3.2;
  return out;
}

function landSpot(s, dir, obs) {
  for (let t = 7.2; t >= 1.0; t -= 0.6) {
    const x = Math.max(-19, Math.min(19, s.x + dir.x * t));
    const z = Math.max(-19, Math.min(19, s.z + dir.z * t));
    if (pointFree(x, z, obs, 1.05)) return { x, z, t };
  }
  return { x: s.x, z: s.z, t: 0 };
}

function pickEscape(p, api, s, e, obs, threat) {
  let best = null, bestScore = -1e9;
  for (const d of STEPDIRS) {
    const lp = landSpot(s, d, obs);
    if (lp.t < 2) continue;
    let sc = 0;
    const de = Math.hypot(lp.x - e.x, lp.z - e.z);
    sc += Math.min(de, 15) * 1.0;
    const margin = Math.min(20 - Math.abs(lp.x), 20 - Math.abs(lp.z));
    if (margin < 5) sc -= (5 - margin) * 2.2;
    sc += blockGap(lp.x, lp.z, obs) > 1.6 ? 1.5 : -2.0;
    if (losClear(lp.x, lp.z, e.x, e.z, obs, 0)) sc += 2.0;
    if (threat) {
      const rel = { x: lp.x - e.x, z: lp.z - e.z };
      const along = rel.x * threat.dir.x + rel.z * threat.dir.z;
      const px = rel.x - threat.dir.x * along, pz = rel.z - threat.dir.z * along;
      sc += Math.min(Math.hypot(px, pz), 6) * 2.5;
    }
    if (sc > bestScore) { bestScore = sc; best = d; }
  }
  return best || V.away(s, e);
}

function bestStep(p, api, s, e, obs, desired, threat) {
  const R = 3.0;
  const toE = V.toward(s, e);
  let best = null, bestScore = -1e9;
  for (const d of STEPDIRS) {
    const cx = s.x + d.x * R, cz = s.z + d.z * R;
    if (!pointFree(cx, cz, obs, 1.15)) continue;
    if (!losClear(s.x, s.z, cx, cz, obs, 1.05)) continue;
    let sc = 0;
    const de = Math.hypot(cx - e.x, cz - e.z);
    sc -= Math.abs(de - desired) * 1.35;
    if (de < 4.5) sc -= (4.5 - de) * 3.0;
    if (losClear(cx, cz, e.x, e.z, obs, 0)) sc += 4.0; else sc -= 3.0;
    const margin = Math.min(20 - Math.abs(cx), 20 - Math.abs(cz));
    if (margin < 5.5) sc -= (5.5 - margin) * 2.0;
    const gap = blockGap(cx, cz, obs);
    if (gap < 1.8) sc -= (1.8 - gap) * 2.5;
    const cross = toE.x * d.z - toE.z * d.x;
    sc += cross * S.spin * 1.6;
    sc += (d.x * S.lastDir.x + d.z * S.lastDir.z) * 1.2;
    if (threat && threat.hit) {
      const rel = { x: cx - e.x, z: cz - e.z };
      const along = rel.x * threat.dir.x + rel.z * threat.dir.z;
      const px = rel.x - threat.dir.x * along, pz = rel.z - threat.dir.z * along;
      sc += Math.min(Math.hypot(px, pz), 5) * 2.0;
    }
    if (sc > bestScore) { bestScore = sc; best = d; }
  }
  if (!best) {
    const away = V.away(s, e);
    const c = { x: 0 - s.x, z: 0 - s.z };
    const n = V.norm({ x: away.x + c.x * 0.15, z: away.z + c.z * 0.15 });
    return n.x === 0 && n.z === 0 ? { x: 0, z: 1 } : n;
  }
  return best;
}
