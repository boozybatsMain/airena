function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me || !me.alive) return;

  const obs = p.arena.obstacles;
  const dist = en.dist;
  const eCast = en.casting;

  let committedNow = false;
  for (const e of p.events) {
    if (e.type === 'enemyCommitted' && e.skill === 'charge') committedNow = true;
    if (e.type === 'blocked') blockedCount++;
  }

  const charging = !!(eCast && eCast.skill === 'charge');
  const dashing = (charging && (eCast.phase === 'dash' || !eCast.telegraph)) || committedNow;
  const chargeWind = charging && eCast.phase === 'windup';
  const smashTele = !!(eCast && eCast.skill === 'smash' && eCast.telegraph);

  // --- enemy travel direction for lane math ---
  let edir;
  if (en.speed > 6) edir = V.norm({ x: en.vx, z: en.vz });
  else edir = V.fromHeading(en.heading);

  const inLane = laneThreat(me, en, edir, dashing ? 1.4 : 0.9);

  const casting = me.casting && me.casting.skill === 'laser' ? me.casting : null;

  // ---------------- FACING ----------------
  let lead = casting ? Math.min(casting.remaining, 0.7) : 0.12;
  const aim = { x: en.x + en.vx * lead * 0.85, z: en.z + en.vz * lead * 0.85 };

  // ---------------- SKILL DECISION ----------------
  let acted = false;

  if (dashing && inLane && api.ready('blink')) {
    const perp = V.perp(edir);
    const cands = [
      perp, V.scale(perp, -1),
      V.norm(V.add(perp, V.scale(edir, -0.55))),
      V.norm(V.add(V.scale(perp, -1), V.scale(edir, -0.55)))
    ];
    const d = bestBlink(me, en, cands, obs);
    api.use('blink', d.x, d.z);
    acted = true;
  } else if (smashTele && dist < 6.8) {
    if (api.ready('blink')) {
      const d = bestBlink(me, en, escapeDirs(me, en), obs);
      api.use('blink', d.x, d.z);
      acted = true;
    } else if (api.ready('jump')) {
      api.use('jump');
      acted = true;
    }
  } else if (chargeWind && dist < 4.8 && api.ready('blink')) {
    const d = bestBlink(me, en, escapeDirs(me, en), obs);
    api.use('blink', d.x, d.z);
    acted = true;
  } else if (dist < 4.6 && api.ready('blink') && !casting) {
    const d = bestBlink(me, en, escapeDirs(me, en), obs);
    api.use('blink', d.x, d.z);
    acted = true;
  } else if (
    api.ready('laser') && en.visible && dist >= 5.6 && dist <= 21.5 &&
    !dashing && !(smashTele && dist < 7.5) && !(charging && dist < 12.5) &&
    !en.invulnerable
  ) {
    api.use('laser');
    acted = true;
  }

  // ---------------- MOVEMENT ----------------
  const laserSoon = api.cooldown('laser') < 0.55;
  let desired = 12.5, maxWant = 19.5;
  if (dist > 24) { desired = 17; maxWant = 20.5; }

  let best = null, bestScore = -1e9;
  const N = 24;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const dir = { x: Math.sin(a), z: Math.cos(a) };
    const cx = me.x + dir.x * STEP, cz = me.z + dir.z * STEP;
    let s = 0;

    const ox = Math.abs(cx) - 18.6, oz = Math.abs(cz) - 18.6;
    if (ox > 0) s -= ox * 12;
    if (oz > 0) s -= oz * 12;

    const r = api.ray(dir.x, dir.z, STEP + 1.4);
    if (r.dist < STEP + 1.4) s -= (STEP + 1.4 - r.dist) * 3.0;

    if (insideBlock(cx, cz, 1.3, obs)) s -= 25;

    const nd = Math.hypot(cx - en.x, cz - en.z);
    s -= Math.max(0, desired - nd) * 2.4;
    s -= Math.max(0, nd - maxWant) * 0.7;

    const wallRoom = 20 - Math.max(Math.abs(cx), Math.abs(cz));
    s -= Math.max(0, 6.5 - wallRoom) * 1.1;
    s -= 0.06 * Math.hypot(cx, cz);

    const vis = !segBlocked(cx, cz, en.x, en.z, obs);
    if (laserSoon && dist < 22) s += vis ? 2.2 : -2.2;
    else s += vis ? -0.7 : 1.2;

    if (charging || dashing) {
      const rx = cx - en.x, rz = cz - en.z;
      const t = rx * edir.x + rz * edir.z;
      const px = rx - edir.x * t, pz = rz - edir.z * t;
      const lat = Math.hypot(px, pz);
      if (t > -1 && t < 14) s += Math.min(lat, 5.5) * 0.9;
    }

    s += 0.7 * (dir.x * prevDir.x + dir.z * prevDir.z);
    if (blockedCount > 0) s += (api.rand() - 0.5) * 1.2;

    if (s > bestScore) { bestScore = s; best = dir; }
  }

  if (best) {
    prevDir = best;
    api.move(best.x, best.z);
  }

  api.faceAt(aim.x, aim.z);

  if (!said && p.t > 0.5) { said = true; api.say("eight arms, one beam"); }
  if (blockedCount > 0) blockedCount--;
  if (acted) lastAct = p.t;
}

const STEP = 4.0;
let prevDir = { x: 0, z: 1 };
let blockedCount = 0;
let said = false;
let lastAct = 0;

function escapeDirs(me, en) {
  const away = V.away(me, en);
  const c = V.norm({ x: -me.x, z: -me.z });
  const base = V.norm(V.add(away, V.scale(c, 0.55)));
  const out = [];
  for (let k = -3; k <= 3; k++) out.push(V.rot(base, k * 0.42));
  out.push(V.perp(away));
  out.push(V.scale(V.perp(away), -1));
  return out;
}

function bestBlink(me, en, cands, obs) {
  let best = cands[0], bs = -1e9;
  for (const d0 of cands) {
    const d = V.norm(d0);
    if (d.x === 0 && d.z === 0) continue;
    let lx = me.x + d.x * 7.5, lz = me.z + d.z * 7.5;
    let s = 0;
    if (Math.abs(lx) > 19.2) s -= (Math.abs(lx) - 19.2) * 8;
    if (Math.abs(lz) > 19.2) s -= (Math.abs(lz) - 19.2) * 8;
    lx = Math.max(-19.2, Math.min(19.2, lx));
    lz = Math.max(-19.2, Math.min(19.2, lz));
    if (insideBlock(lx, lz, 1.2, obs)) s -= 10;
    const nd = Math.hypot(lx - en.x, lz - en.z);
    s += Math.min(nd, 16) * 1.0;
    const wallRoom = 20 - Math.max(Math.abs(lx), Math.abs(lz));
    s -= Math.max(0, 6 - wallRoom) * 1.2;
    s -= 0.05 * Math.hypot(lx, lz);
    if (!segBlocked(lx, lz, en.x, en.z, obs)) s += 1.0;
    if (s > bs) { bs = s; best = d; }
  }
  return best;
}

function laneThreat(me, en, dir, extra) {
  const rx = me.x - en.x, rz = me.z - en.z;
  const t = rx * dir.x + rz * dir.z;
  if (t < -1.5 || t > 14) return false;
  const px = rx - dir.x * t, pz = rz - dir.z * t;
  return Math.hypot(px, pz) < (2.4 + extra);
}

function insideBlock(x, z, pad, obs) {
  for (const o of obs) {
    if (Math.abs(x - o.x) < o.hx + pad && Math.abs(z - o.z) < o.hz + pad) return true;
  }
  return false;
}

function segBlocked(ax, az, bx, bz, obs) {
  for (const o of obs) {
    if (segAABB(ax, az, bx, bz, o.x - o.hx, o.z - o.hz, o.x + o.hx, o.z + o.hz)) return true;
  }
  return false;
}

function segAABB(x0, z0, x1, z1, minx, minz, maxx, maxz) {
  let t0 = 0, t1 = 1;
  const dx = x1 - x0, dz = z1 - z0;
  const ps = [-dx, dx, -dz, dz];
  const qs = [x0 - minx, maxx - x0, z0 - minz, maxz - z0];
  for (let i = 0; i < 4; i++) {
    const pp = ps[i], qq = qs[i];
    if (pp === 0) { if (qq < 0) return false; }
    else {
      const r = qq / pp;
      if (pp < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
      else { if (r < t0) return false; if (r < t1) t1 = r; }
    }
  }
  return true;
}
