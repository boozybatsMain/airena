function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me || !me.alive) return;
  const t = p.t;

  // ---- events ----
  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      if (e.skill === 'charge') S.lastCharge = t;
      else if (e.skill === 'smash') S.lastSmash = t;
      else if (e.skill === 'jump') S.lastJump = t;
    } else if (e.type === 'blocked') {
      if (t - S.flipT > 0.4) { S.strafe = -S.strafe; S.flipT = t; }
    } else if (e.type === 'missed' && e.skill === 'laser') {
      S.miss++;
    } else if (e.type === 'dealt') {
      S.miss = 0;
    } else if (e.type === 'damaged') {
      S.lastHurt = t;
    }
  }

  if (!en || !en.alive) { api.stop(); return; }

  const dist = en.dist;
  const chargeUp = (t - S.lastCharge) > 3.9;
  const enCast = en.casting;
  const enCharging = !!(enCast && enCast.skill === 'charge');
  const enSmashing = !!(enCast && enCast.skill === 'smash' && enCast.telegraph);
  const enHelpless = !!(en.stunned || (enCast && enCast.phase === 'recover'));

  // ---- aim point (lead) ----
  const casting = me.casting && me.casting.skill === 'laser' && me.casting.telegraph;
  let lead = casting ? clampN(me.casting.remaining || 0, 0, 0.75) : 0.72;
  const aim = { x: en.x + en.vx * lead, z: en.z + en.vz * lead };
  api.faceAt(aim.x, aim.z);

  // if mid-cast: just steer, keep aiming
  if (casting) { moveKite(p, api, chargeUp ? 16.5 : 13, true); return; }

  if (me.stunned) return;
  if (me.airborne) return;

  // ---------- DODGES ----------
  const threat = chargeThreat(p);
  if (!me.busy) {
    if (threat && api.ready('blink')) {
      const d = blinkAway(p, api, threat.escape);
      if (d) { api.use('blink', d.x, d.z); moveKite(p, api, 16, false); return; }
    }
    if (enSmashing && dist < 6.6) {
      if (api.ready('blink')) {
        const d = blinkAway(p, api, V.away(me, en));
        if (d) { api.use('blink', d.x, d.z); moveKite(p, api, 15, false); return; }
      }
      if (api.ready('jump') && (!enCast || enCast.remaining > 0.06)) {
        moveKite(p, api, 18, false);
        api.use('jump');
        return;
      }
    }
    // pre-emptive escape when the ape is on top of us
    if (dist < 6.2 && api.ready('blink') && !me.invulnerable) {
      const d = blinkAway(p, api, V.away(me, en));
      if (d) { api.use('blink', d.x, d.z); moveKite(p, api, 15, false); return; }
    }
  }

  // ---------- LASER ----------
  if (!me.busy && api.ready('laser') && en.visible && !en.invulnerable) {
    const dir = V.toward(me, aim);
    const angErr = Math.abs(V.angleTo(me.heading, dir));
    const safe = (dist > 6.8 || enHelpless) && !(enCharging && dist < 16);
    if (dist > 2.2 && dist < 23.5 && angErr < 0.55 && safe && api.los(aim.x, aim.z)) {
      api.use('laser');
      moveKite(p, api, chargeUp ? 16.5 : 13, true);
      return;
    }
  }

  // ---------- MOVE ----------
  let td = chargeUp ? 15.0 : 10.5;
  if (enCharging) td = 18;
  if (!en.visible && dist > 20) td = 13;
  moveKite(p, api, td, false);

  if (t - S.sayT > 6) {
    S.sayT = t;
    api.say(dist < 8 ? "too close, ape" : "eight arms, one beam");
  }
}

// ================= state =================
const S = {
  strafe: 1, flipT: 0, lastCharge: -99, lastSmash: -99, lastJump: -99,
  miss: 0, lastHurt: -99, sayT: -99, reroll: 0
};

function clampN(v, a, b) { return v < a ? a : (v > b ? b : v); }

function insideBlock(p, x, z, m) {
  for (const o of p.arena.obstacles) {
    if (Math.abs(x - o.x) < o.hx + m && Math.abs(z - o.z) < o.hz + m) return true;
  }
  return false;
}

// is a charge (windup near end, or dash) aimed at us?
function chargeThreat(p) {
  const me = p.self, en = p.enemy;
  const c = en.casting;
  if (!c || c.skill !== 'charge') return null;
  if (c.phase === 'windup' && (c.remaining === undefined || c.remaining > 0.14)) return null;
  let d;
  if (en.speed > 4) d = V.norm({ x: en.vx, z: en.vz });
  else d = V.fromHeading(en.heading);
  if (d.x === 0 && d.z === 0) return null;
  const r = { x: me.x - en.x, z: me.z - en.z };
  const along = r.x * d.x + r.z * d.z;
  const cross = r.x * d.z - r.z * d.x;
  if (along < -1.5 || along > 14.5) return null;
  if (Math.abs(cross) > 3.4) return null;
  const perp = { x: d.z, z: -d.x };
  const sgn = cross >= 0 ? 1 : -1;
  // push sideways off the lane, plus a little backwards
  const escape = V.norm({
    x: perp.x * sgn + (r.x / (Math.hypot(r.x, r.z) || 1)) * 0.45,
    z: perp.z * sgn + (r.z / (Math.hypot(r.x, r.z) || 1)) * 0.45
  });
  return { escape, along };
}

function blinkAway(p, api, prefer) {
  const me = p.self, en = p.enemy;
  if (!prefer || (prefer.x === 0 && prefer.z === 0)) prefer = V.away(me, en);
  const base = Math.atan2(prefer.x, prefer.z);
  let best = null, bestS = -1e9;
  for (let i = 0; i < 17; i++) {
    const off = (i === 0) ? 0 : ((i % 2 ? 1 : -1) * Math.ceil(i / 2) * 0.38);
    const ang = base + off;
    const d = V.fromHeading(ang);
    const lx = me.x + d.x * 7.3, lz = me.z + d.z * 7.3;
    if (Math.abs(lx) > 18.7 || Math.abs(lz) > 18.7) continue;
    if (insideBlock(p, lx, lz, 1.2)) continue;
    const de = Math.hypot(lx - en.x, lz - en.z);
    const wm = Math.min(20 - Math.abs(lx), 20 - Math.abs(lz));
    const s = Math.min(de, 17) * 1.0 + Math.min(wm, 7) * 0.55 - Math.abs(off) * 0.9;
    if (s > bestS) { bestS = s; best = d; }
  }
  return best;
}

function moveKite(p, api, targetDist, slow) {
  const me = p.self, en = p.enemy;
  const t = p.t;

  // occasional strafe reroll
  if (t - S.flipT > 2.4 && api.rand() < 0.25) { S.strafe = -S.strafe; S.flipT = t; }

  const away = V.away(me, en);
  const toEn = { x: -away.x, z: -away.z };
  const dist = en.dist;

  let dir;
  if (!en.visible && dist > targetDist + 1) {
    const path = api.pathTo(en.x, en.z);
    if (path && path.points && path.points.length) {
      const wp = path.points[0];
      dir = V.norm({ x: wp.x - me.x, z: wp.z - me.z });
    } else {
      dir = toEn;
    }
  } else {
    const radial = clampN((dist - targetDist) / 4.5, -1.25, 1.0);
    let tang = 0.85;
    if (dist < 11) tang = 1.25;
    if (!en.visible) tang = 1.35;
    const pv = V.perp(toEn);
    dir = {
      x: toEn.x * radial + pv.x * S.strafe * tang,
      z: toEn.z * radial + pv.z * S.strafe * tang
    };
  }

  // wall repulsion
  const mgn = 6.5, lim = 20;
  let wx = 0, wz = 0;
  if (me.x > lim - mgn) wx -= (me.x - (lim - mgn)) / mgn;
  if (me.x < -(lim - mgn)) wx += ((-(lim - mgn)) - me.x) / mgn;
  if (me.z > lim - mgn) wz -= (me.z - (lim - mgn)) / mgn;
  if (me.z < -(lim - mgn)) wz += ((-(lim - mgn)) - me.z) / mgn;
  dir.x += wx * 2.1; dir.z += wz * 2.1;

  // block repulsion
  for (const o of p.arena.obstacles) {
    const cx = clampN(me.x, o.x - o.hx, o.x + o.hx);
    const cz = clampN(me.z, o.z - o.hz, o.z + o.hz);
    const dx = me.x - cx, dz = me.z - cz;
    const d = Math.hypot(dx, dz);
    if (d < 2.6) {
      const w = (2.6 - d) / 2.6 * 1.6;
      if (d > 0.001) { dir.x += (dx / d) * w; dir.z += (dz / d) * w; }
      else { dir.x += away.x * w; dir.z += away.z * w; }
    }
  }

  const dev = steerClear(p, api, dir);
  if (Math.abs(dev) > 1.5 && t - S.flipT > 0.5) { S.strafe = -S.strafe; S.flipT = t; }
}

function steerClear(p, api, desired) {
  const me = p.self;
  const L = Math.hypot(desired.x, desired.z);
  if (L < 1e-6) { api.stop(); return 0; }
  const d0 = { x: desired.x / L, z: desired.z / L };
  const base = Math.atan2(d0.x, d0.z);
  const probe = 2.7;
  const offs = [0, 0.35, -0.35, 0.7, -0.7, 1.05, -1.05, 1.45, -1.45, 1.9, -1.9, 2.35, -2.35, 2.8, -2.8, 3.14];
  for (const off of offs) {
    const d = V.fromHeading(base + off);
    const nx = me.x + d.x * probe, nz = me.z + d.z * probe;
    if (Math.abs(nx) > 18.6 || Math.abs(nz) > 18.6) continue;
    const r = api.ray(d.x, d.z, probe);
    if (r && r.hit && r.dist < probe - 0.35) continue;
    api.move(d.x, d.z);
    return off;
  }
  api.move(d0.x, d0.z);
  return 0;
}
