function segRect(ax, az, bx, bz, o, pad) {
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

function clearLine(ax, az, bx, bz, obs, pad) {
  for (const o of obs) if (segRect(ax, az, bx, bz, o, pad)) return false;
  return true;
}

function blockedPath(ax, az, bx, bz, obs, pad) {
  for (const o of obs) if (segRect(ax, az, bx, bz, o, pad)) return true;
  return false;
}

function lineOffset(sx, sz, ex, ez, dx, dz) {
  const rx = sx - ex, rz = sz - ez;
  const proj = rx * dx + rz * dz;
  const perp = rx * dz - rz * dx;
  return { proj, perp };
}

function pickBlink(s, e, obs) {
  let best = { x: 0, z: 1 }, bs = -1e9;
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8;
    const d = { x: Math.sin(a), z: Math.cos(a) };
    const nx = s.x + d.x * 7.2, nz = s.z + d.z * 7.2;
    let sc = 0;
    sc -= Math.max(0, Math.abs(nx) - 17) * 6;
    sc -= Math.max(0, Math.abs(nz) - 17) * 6;
    const nd = Math.hypot(nx - e.x, nz - e.z);
    sc += Math.min(nd, 15) * 1.2;
    if (clearLine(nx, nz, e.x, e.z, obs, 0.2)) sc += 2.5;
    if (sc > bs) { bs = sc; best = d; }
  }
  return best;
}

const eReady = { charge: 0, smash: 0, jump: 0 };
let strafe = 1;
let strafeTimer = 2.0;
let leadF = 0.95;
let chargeCommitT = -1;
let lastMove = { x: 0, z: 1 };
let saidOnce = false;

function think(p, api) {
  const s = p.self, e = p.enemy;
  if (!s || !s.alive || !e) return;
  const obs = p.arena.obstacles || [];
  const t = p.t;

  for (const ev of p.events) {
    if (ev.type === 'enemyStarted') {
      if (ev.skill === 'charge') { eReady.charge = t + 4.033; chargeCommitT = -1; }
      else if (ev.skill === 'smash') eReady.smash = t + 1.3;
      else if (ev.skill === 'jump') eReady.jump = t + 2.8;
    } else if (ev.type === 'enemyCommitted' && ev.skill === 'charge') {
      chargeCommitT = t;
    } else if (ev.type === 'blocked') {
      strafe = -strafe; strafeTimer = 1.2;
    } else if (ev.type === 'missed' && ev.skill === 'laser') {
      if (ev.reason === 'aim') leadF = Math.max(0.4, leadF - 0.2);
    } else if (ev.type === 'dealt' && ev.skill === 'laser') {
      leadF = Math.min(1.1, leadF + 0.07);
    }
  }

  if (s.stunned) return;

  const dist = e.dist;
  const ec = e.casting;
  const eCharging = !!ec && ec.skill === 'charge';
  const eDashing = eCharging && ec.phase === 'dash';
  const eCommitting = eCharging && (chargeCommitT >= 0 || (ec.phase === 'windup' && ec.remaining !== undefined && ec.remaining < 0.09));
  const eSmashing = !!ec && ec.skill === 'smash' && ec.telegraph;
  const chargeAvail = t >= eReady.charge;
  const smashAvail = t >= eReady.smash;

  const toE = V.toward(s, e);
  const awayE = { x: -toE.x, z: -toE.z };
  const tangBase = V.perp(toE);
  const tang = { x: tangBase.x * strafe, z: tangBase.z * strafe };

  strafeTimer -= p.dt;
  if (strafeTimer <= 0) { strafeTimer = 1.6 + api.rand() * 2.2; if (api.rand() < 0.55) strafe = -strafe; }

  if (!saidOnce) { saidOnce = true; api.say("eight arms, one beam"); }

  // ---------- emergency: incoming charge ----------
  let handled = false;
  if (eCharging || eDashing) {
    let dx, dz;
    if (eDashing && (Math.abs(e.vx) + Math.abs(e.vz)) > 1) {
      const l = Math.hypot(e.vx, e.vz); dx = e.vx / l; dz = e.vz / l;
    } else {
      dx = Math.sin(e.heading); dz = Math.cos(e.heading);
    }
    const off = lineOffset(s.x, s.z, e.x, e.z, dx, dz);
    const corridor = 2.6;
    const threat = off.proj > -1.5 && off.proj < 14.5 && Math.abs(off.perp) < corridor;
    let side = off.perp >= 0 ? 1 : -1;
    if (Math.abs(off.perp) < 0.35) side = strafe;
    let nx = dz * side, nz = -dx * side;
    if (Math.abs(s.x + nx * 6) > 18.5 || Math.abs(s.z + nz * 6) > 18.5) { nx = -nx; nz = -nz; }
    if (threat && (eDashing || eCommitting)) {
      if (api.ready('blink') && !s.busy && !s.airborne) {
        api.use('blink', nx, nz);
        api.face(toE.x, toE.z);
        handled = true;
      } else {
        const mx = nx * 1.0 + awayE.x * 0.35, mz = nz * 1.0 + awayE.z * 0.35;
        api.move(mx, mz);
        api.face(toE.x, toE.z);
        lastMove = V.norm({ x: mx, z: mz });
        handled = true;
      }
    } else if (eCharging && !eDashing) {
      // sidestep during their wind-up
      const mx = nx + awayE.x * 0.4, mz = nz + awayE.z * 0.4;
      api.move(mx, mz);
      api.face(toE.x, toE.z);
      lastMove = V.norm({ x: mx, z: mz });
      handled = true;
    }
  }

  // ---------- emergency: incoming smash ----------
  if (!handled && eSmashing && dist < 6.6 && !s.busy && !s.airborne) {
    if (api.ready('jump')) {
      api.move(awayE.x + tang.x * 0.6, awayE.z + tang.z * 0.6);
      api.use('jump');
      api.face(toE.x, toE.z);
      lastMove = awayE;
      handled = true;
    } else if (api.ready('blink')) {
      const d = pickBlink(s, e, obs);
      api.use('blink', d.x, d.z);
      api.face(toE.x, toE.z);
      handled = true;
    }
  }

  // ---------- panic distance blink ----------
  if (!handled && !s.busy && !s.airborne && dist < 5.4 && api.ready('blink') && !e.stunned) {
    const d = pickBlink(s, e, obs);
    api.use('blink', d.x, d.z);
    api.face(toE.x, toE.z);
    handled = true;
  }

  // ---------- facing / laser ----------
  const casting = s.casting && s.casting.skill === 'laser' && s.casting.telegraph;
  if (casting) {
    let rem = s.casting.remaining;
    if (rem === undefined || rem === null) rem = 0.3;
    const lead = Math.min(Math.max(rem, 0), 0.72) * leadF;
    api.faceAt(e.x + e.vx * lead, e.z + e.vz * lead);
  } else if (!handled) {
    const lead = 0.6 * leadF;
    api.faceAt(e.x + e.vx * lead, e.z + e.vz * lead);
  }

  if (!handled && !s.busy && !s.airborne && api.ready('laser') && e.visible && dist < 23.5) {
    const aimDir = V.toward(s, e);
    const ang = Math.abs(V.angleTo(s.heading, aimDir));
    let safe = true;
    if (chargeAvail && dist < 10.5) safe = false;
    if (smashAvail && dist < 7.2) safe = false;
    if (eCharging || eDashing) safe = dist > 17;
    if (eSmashing && dist < 8) safe = false;
    if (e.stunned || e.airborne) safe = true;
    if (ec && ec.phase === 'recover') safe = true;
    if (safe && ang < 1.15) {
      api.use('laser');
    }
  }

  // ---------- movement ----------
  if (!handled) {
    let desired = chargeAvail ? 12.5 : 9.0;
    if (!e.visible) desired = 9.0;
    if (p.burn > 0 && s.hp / s.maxHp > e.hp / e.maxHp) desired += 2.0;

    let waypoint = null;
    if (!e.visible) {
      const path = api.pathTo(e.x, e.z);
      if (path && path.points && path.points.length) {
        for (const pt of path.points) {
          if (Math.hypot(pt.x - s.x, pt.z - s.z) > 1.2) { waypoint = pt; break; }
        }
        if (!waypoint) waypoint = path.points[path.points.length - 1];
      }
    }

    const wantLos = api.cooldown('laser') < 0.65;
    const look = 3.2;
    let best = null, bestSc = -1e9;
    for (let i = 0; i < 24; i++) {
      const a = i * Math.PI / 12;
      const d = { x: Math.sin(a), z: Math.cos(a) };
      const nx = s.x + d.x * look, nz = s.z + d.z * look;
      let sc = 0;
      sc -= Math.max(0, Math.abs(nx) - 15.5) * 5;
      sc -= Math.max(0, Math.abs(nz) - 15.5) * 5;
      if (Math.abs(nx) > 19 || Math.abs(nz) > 19) sc -= 60;
      if (blockedPath(s.x, s.z, nx, nz, obs, 1.15)) sc -= 40;
      const nd = Math.hypot(nx - e.x, nz - e.z);
      sc -= Math.abs(nd - desired) * 1.1;
      if (nd < 6.5) sc -= (6.5 - nd) * 5;
      sc += (d.x * tang.x + d.z * tang.z) * 1.3;
      sc += (d.x * lastMove.x + d.z * lastMove.z) * 0.9;
      const seen = clearLine(nx, nz, e.x, e.z, obs, 0.15);
      if (wantLos) { if (seen) sc += 3.0; }
      else if (dist < 12 && !seen) sc += 2.0;
      if (waypoint) {
        const wd = V.norm({ x: waypoint.x - s.x, z: waypoint.z - s.z });
        sc += (d.x * wd.x + d.z * wd.z) * 4.0;
      }
      if (chargeAvail) {
        const hx = Math.sin(e.heading), hz = Math.cos(e.heading);
        const off = lineOffset(nx, nz, e.x, e.z, hx, hz);
        if (off.proj > 0 && off.proj < 14 && Math.abs(off.perp) < 3.0) sc -= (3.0 - Math.abs(off.perp)) * 1.2;
      }
      if (sc > bestSc) { bestSc = sc; best = d; }
    }
    if (best) {
      api.move(best.x, best.z);
      lastMove = best;
    }
  }
}
