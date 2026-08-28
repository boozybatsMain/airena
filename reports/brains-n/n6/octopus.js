const OBS_PAD_BODY = 1.05;

function segAabb(ax, az, bx, bz, o, pad) {
  const minx = o.x - o.hx - pad, maxx = o.x + o.hx + pad;
  const minz = o.z - o.hz - pad, maxz = o.z + o.hz + pad;
  const dx = bx - ax, dz = bz - az;
  let t0 = 0, t1 = 1;
  if (Math.abs(dx) < 1e-9) {
    if (ax < minx || ax > maxx) return false;
  } else {
    let ta = (minx - ax) / dx, tb = (maxx - ax) / dx;
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return false;
  }
  if (Math.abs(dz) < 1e-9) {
    if (az < minz || az > maxz) return false;
  } else {
    let ta = (minz - az) / dz, tb = (maxz - az) / dz;
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return false;
  }
  return true;
}

function pathBlocked(ax, az, bx, bz, obs, pad) {
  for (const o of obs) if (segAabb(ax, az, bx, bz, o, pad)) return true;
  return false;
}

function insideObs(x, z, obs, pad) {
  for (const o of obs) {
    if (x > o.x - o.hx - pad && x < o.x + o.hx + pad &&
        z > o.z - o.hz - pad && z < o.z + o.hz + pad) return true;
  }
  return false;
}

let prevDir = { x: 0, z: 1 };
let eCharge = -99, eSmash = -99, eJump = -99;
let lastLaser = -99;
let saidAt = -99;

function bestBlink(p, bias) {
  const s = p.self, e = p.enemy, obs = p.arena.obstacles;
  let best = null, bs = -1e9;
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8;
    const d = { x: Math.sin(a), z: Math.cos(a) };
    const lx = s.x + d.x * 7.4, lz = s.z + d.z * 7.4;
    const cx = Math.max(-18.6, Math.min(18.6, lx));
    const cz = Math.max(-18.6, Math.min(18.6, lz));
    let sc = 0;
    sc -= (Math.abs(lx - cx) + Math.abs(lz - cz)) * 1.6;
    sc += Math.hypot(cx - e.x, cz - e.z) * 1.0;
    if (insideObs(cx, cz, obs, 1.15)) sc -= 14;
    const wd = 20 - Math.max(Math.abs(cx), Math.abs(cz));
    if (wd < 3.5) sc -= (3.5 - wd) * 2.2;
    if (bias) sc += (d.x * bias.x + d.z * bias.z) * 7;
    if (sc > bs) { bs = sc; best = d; }
  }
  return best || { x: 0, z: 1 };
}

function chooseMove(p, targetDist, wantLos) {
  const s = p.self, e = p.enemy, obs = p.arena.obstacles;
  let best = null, bs = -1e9;
  const L = 3.2;
  for (let i = 0; i < 24; i++) {
    const a = i * Math.PI / 12;
    const d = { x: Math.sin(a), z: Math.cos(a) };
    const cx = s.x + d.x * L, cz = s.z + d.z * L;
    let sc = 0;
    const ox = Math.abs(cx) - 18.8, oz = Math.abs(cz) - 18.8;
    if (ox > 0) sc -= ox * 10;
    if (oz > 0) sc -= oz * 10;
    const wd = 20 - Math.max(Math.abs(cx), Math.abs(cz));
    if (wd < 4.5) sc -= (4.5 - wd) * 1.8;
    if (pathBlocked(s.x, s.z, cx, cz, obs, OBS_PAD_BODY)) sc -= 15;
    const nd = Math.hypot(cx - e.x, cz - e.z);
    if (nd < targetDist) sc -= (targetDist - nd) * 2.3;
    else sc -= (nd - targetDist) * 0.5;
    const clear = !pathBlocked(cx, cz, e.x, e.z, obs, 0);
    if (wantLos) { if (!clear) sc -= 4.0; }
    else { if (clear) sc -= 3.0; }
    sc += (d.x * prevDir.x + d.z * prevDir.z) * 1.3;
    if (sc > bs) { bs = sc; best = d; }
  }
  return best || V.away(s, e);
}

function think(p, api) {
  const s = p.self, e = p.enemy;
  if (!s.alive) return;
  const t = p.t;
  const obs = p.arena.obstacles;

  let committedEvent = false;
  for (const ev of p.events) {
    if (ev.type === 'enemyStarted') {
      if (ev.skill === 'charge') eCharge = t;
      else if (ev.skill === 'smash') eSmash = t;
      else if (ev.skill === 'jump') eJump = t;
    } else if (ev.type === 'enemyCommitted') {
      committedEvent = true;
    }
  }

  const dist = e.dist;
  const chargeReady = (t - eCharge) >= 3.85;
  const laserCd = api.cooldown('laser');
  const busy = s.busy;
  const ec = e.casting;
  let handled = false;
  let dodgeDir = null;

  const myFrac = s.hp / s.maxHp;
  const hisFrac = e.hp / e.maxHp;
  const fleeMode = (p.timeLeft < 5.5 && myFrac > hisFrac + 0.015);

  // ---- charge reaction ----
  if (ec && ec.skill === 'charge') {
    const D = V.fromHeading(e.heading);
    const rel = { x: s.x - e.x, z: s.z - e.z };
    const along = rel.x * D.x + rel.z * D.z;
    const lat = rel.x * D.z - rel.z * D.x;
    const side = lat >= 0 ? 1 : -1;
    const perp = { x: D.z * side, z: -D.x * side };
    dodgeDir = perp;
    const committed = committedEvent || ec.phase === 'dash' ||
      (ec.phase === 'windup' && ec.remaining < 0.16);
    const tImp = along > 0.5 ? along / 15 : 99;
    const latVel = s.vx * perp.x + s.vz * perp.z;
    const predLat = Math.abs(lat) + latVel * Math.min(tImp, 1.0);
    if (committed && along > 0 && along < 14 && predLat < 3.0 &&
        !busy && !s.airborne && api.ready('blink')) {
      const bd = bestBlink(p, perp);
      api.use('blink', bd.x, bd.z);
      handled = true;
    }
  }

  // ---- smash reaction ----
  if (!handled && ec && ec.skill === 'smash' && ec.telegraph && dist < 6.6 && !s.airborne) {
    if (!busy && api.ready('blink')) {
      const bd = bestBlink(p, V.away(s, e));
      api.use('blink', bd.x, bd.z);
      handled = true;
    } else if (!busy && api.ready('jump')) {
      api.use('jump');
      handled = true;
    }
  }

  // ---- emergency escape ----
  if (!handled && !busy && !s.airborne && dist < 5.9 && api.ready('blink')) {
    const bd = bestBlink(p, V.away(s, e));
    api.use('blink', bd.x, bd.z);
    handled = true;
  }

  // ---- laser ----
  if (!handled && !busy && !s.airborne && !s.stunned && !fleeMode &&
      api.ready('laser') && e.visible && dist > 2.0 && dist < 23) {
    const safeDist = chargeReady ? 13.8 : 8.6;
    const enemyRecovering = ec && (ec.phase === 'recover' ||
      (ec.skill === 'charge' && ec.phase === 'dash'));
    const starving = (t - lastLaser) > 3.0 && dist > 9.2;
    if (dist > safeDist || e.stunned || enemyRecovering || starving) {
      const ang = Math.abs(V.angleTo(s.heading, V.toward(s, e)));
      if (ang < 1.0) {
        api.use('laser');
        lastLaser = t;
        handled = true;
      }
    }
  }

  // ---- movement ----
  let mv;
  if (dodgeDir) {
    const away = V.away(s, e);
    let cand = V.norm({ x: dodgeDir.x + away.x * 0.5, z: dodgeDir.z + away.z * 0.5 });
    const nx = s.x + cand.x * 3.4, nz = s.z + cand.z * 3.4;
    if (Math.abs(nx) > 18.4 || Math.abs(nz) > 18.4 ||
        pathBlocked(s.x, s.z, nx, nz, obs, OBS_PAD_BODY)) {
      const alt = V.norm({ x: -dodgeDir.x + away.x * 0.5, z: -dodgeDir.z + away.z * 0.5 });
      const ax = s.x + alt.x * 3.4, az = s.z + alt.z * 3.4;
      if (Math.abs(ax) < 18.4 && Math.abs(az) < 18.4 &&
          !pathBlocked(s.x, s.z, ax, az, obs, OBS_PAD_BODY)) cand = alt;
    }
    mv = cand;
  } else {
    let targetDist = chargeReady ? 15.5 : 10.5;
    if (fleeMode) targetDist = 21;
    let wantLos = (laserCd < 1.05) || !chargeReady;
    if (fleeMode) wantLos = false;
    if (chargeReady && dist < 12 && laserCd > 0.6) wantLos = false;
    mv = chooseMove(p, targetDist, wantLos);
  }
  if (mv && (mv.x !== 0 || mv.z !== 0)) prevDir = { x: mv.x, z: mv.z };
  api.move(prevDir.x, prevDir.z);

  // ---- facing ----
  let ax = e.x, az = e.z;
  if (s.casting && s.casting.skill === 'laser' && s.casting.telegraph) {
    const r = Math.max(0, s.casting.remaining);
    ax = e.x + e.vx * r * 0.85;
    az = e.z + e.vz * r * 0.85;
  }
  api.faceAt(ax, az);

  if (t - saidAt > 7) {
    saidAt = t;
    api.say(chargeReady ? "eight arms, one beam — keep your distance" : "your charge is spent");
  }
}
