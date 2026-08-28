const CAST = 0.667;
const ECD = { charge: 4.033, smash: 1.3, jump: 2.8 };

let lastT = -1;
let lastDir = { x: 0, z: 1 };
let eUse = { charge: -99, smash: -99, jump: -99 };
let hurtT = -99;

function resetMind() {
  lastDir = { x: 0, z: 1 };
  eUse = { charge: -99, smash: -99, jump: -99 };
  hurtT = -99;
}

function segHitsBox(ax, az, bx, bz, x, z, hx, hz) {
  const dx = bx - ax, dz = bz - az;
  let t0 = 0, t1 = 1;
  const minx = x - hx, maxx = x + hx, minz = z - hz, maxz = z + hz;
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

function clearLine(a, b, obs, pad) {
  const q = pad || 0;
  for (const o of obs) {
    if (segHitsBox(a.x, a.z, b.x, b.z, o.x, o.z, o.hx + q, o.hz + q)) return false;
  }
  return true;
}

function inObstacle(q, obs, pad) {
  for (const o of obs) {
    if (Math.abs(q.x - o.x) < o.hx + pad && Math.abs(q.z - o.z) < o.hz + pad) return true;
  }
  return false;
}

function inArena(q, half, pad) {
  return Math.abs(q.x) < half - pad && Math.abs(q.z) < half - pad;
}

function blinkLanding(me, dir, obs, half) {
  for (let t = 7.5; t >= 2.0; t -= 0.5) {
    const q = { x: me.x + dir.x * t, z: me.z + dir.z * t };
    if (inArena(q, half, 1.2) && !inObstacle(q, obs, 1.15)) return { q, t };
  }
  return { q: { x: me.x, z: me.z }, t: 0 };
}

function landScore(land, en, half) {
  if (land.t < 1.5) return -999;
  const q = land.q;
  let s = Math.min(V.dist(q, en), 20) * 1.0;
  const m = half - Math.max(Math.abs(q.x), Math.abs(q.z));
  if (m < 6) s -= (6 - m) * 1.1;
  s += land.t * 0.25;
  return s;
}

function escapeDir(p) {
  const me = p.self, en = p.enemy, obs = p.arena.obstacles, half = p.arena.half;
  const away = V.away({ x: me.x, z: me.z }, { x: en.x, z: en.z });
  let best = away, bestS = -1e9;
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI * 2 / 16;
    const dir = { x: Math.sin(a), z: Math.cos(a) };
    if (V.dot(dir, away) < -0.1) continue;
    const land = blinkLanding(me, dir, obs, half);
    let s = landScore(land, en, half);
    s += V.dot(dir, away) * 2.0;
    if (s > bestS) { bestS = s; best = dir; }
  }
  return best;
}

function perpDodge(p, chargeDir) {
  const me = p.self, en = p.enemy, obs = p.arena.obstacles, half = p.arena.half;
  const a = V.perp(chargeDir);
  const b = { x: -a.x, z: -a.z };
  const la = blinkLanding(me, a, obs, half);
  const lb = blinkLanding(me, b, obs, half);
  const sa = landScore(la, en, half);
  const sb = landScore(lb, en, half);
  if (sa < -100 && sb < -100) return escapeDir(p);
  return sa >= sb ? a : b;
}

function chooseMove(p, D, wantLOS) {
  const me = p.self, en = p.enemy, obs = p.arena.obstacles, half = p.arena.half;
  const ep = { x: en.x, z: en.z };
  let best = null, bestS = -1e9;
  for (let i = 0; i < 24; i++) {
    const a = i * Math.PI * 2 / 24;
    const dir = { x: Math.sin(a), z: Math.cos(a) };
    const q = { x: me.x + dir.x * 3.0, z: me.z + dir.z * 3.0 };
    if (!inArena(q, half, 1.5)) continue;
    if (inObstacle(q, obs, 1.3)) continue;
    if (!clearLine({ x: me.x, z: me.z }, q, obs, 1.05)) continue;
    const nd = V.dist(q, ep);
    let s = -Math.abs(nd - D) * 1.0;
    if (nd < 4.5) s -= (4.5 - nd) * 4;
    const m = half - Math.max(Math.abs(q.x), Math.abs(q.z));
    if (m < 5.5) s -= (5.5 - m) * 1.2;
    const los = clearLine(q, ep, obs, 0);
    s += wantLOS ? (los ? 2.6 : -3.0) : (los ? -2.2 : 2.2);
    s += V.dot(dir, lastDir) * 1.3;
    if (s > bestS) { bestS = s; best = dir; }
  }
  return best;
}

function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive) return;
  if (p.t < lastT) resetMind();
  lastT = p.t;

  const obs = p.arena.obstacles;
  const half = p.arena.half;

  for (const e of p.events) {
    if (e.type === 'enemyStarted' && ECD[e.skill] !== undefined) eUse[e.skill] = p.t;
    if (e.type === 'damaged' || e.type === 'knockback' || e.type === 'interrupted') hurtT = p.t;
  }

  const d = en.dist;
  const ec = en.casting;
  const chargeReady = (p.t - eUse.charge) >= ECD.charge - 0.15;
  const dashing = !!(ec && ec.skill === 'charge' && (ec.phase === 'dash' || ec.phase === 'charge'));
  const chargeWind = !!(ec && ec.skill === 'charge' && !dashing && ec.telegraph);

  // ---------- facing ----------
  let aimT = CAST;
  if (me.casting && me.casting.skill === 'laser' && me.casting.telegraph) aimT = me.casting.remaining;
  const lf = dashing ? 0.95 : 0.55;
  let pred = { x: en.x + en.vx * aimT * lf, z: en.z + en.vz * aimT * lf };
  if (Math.abs(pred.x) > half) pred.x = Math.sign(pred.x) * half;
  if (Math.abs(pred.z) > half) pred.z = Math.sign(pred.z) * half;
  api.faceAt(pred.x, pred.z);

  // ---------- skills ----------
  let acted = false;
  const blinkOk = api.ready('blink');
  const canAct = !me.stunned && !me.airborne && !me.busy;

  if (canAct) {
    // 1. dodge an incoming charge
    if (dashing && d < 16 && blinkOk) {
      const hd = V.fromHeading(en.heading);
      const rel = V.norm({ x: me.x - en.x, z: me.z - en.z });
      if (V.dot(hd, rel) > 0.55) {
        const dir = perpDodge(p, hd);
        api.use('blink', dir.x, dir.z);
        acted = true;
      }
    }

    // 2. smash telegraphed at close range
    if (!acted && ec && ec.skill === 'smash' && ec.telegraph && d < 6.4) {
      if (blinkOk && !chargeReady) {
        const dir = escapeDir(p);
        api.use('blink', dir.x, dir.z);
        acted = true;
      } else if (api.ready('jump') && ec.remaining > 0.1 && ec.remaining < 0.62) {
        api.use('jump');
        acted = true;
      } else if (blinkOk) {
        const dir = escapeDir(p);
        api.use('blink', dir.x, dir.z);
        acted = true;
      }
    }

    // 3. simply too close, or just got hit while they are on top of us
    if (!acted && blinkOk && (d < 5.6 || (d < 7.5 && p.t - hurtT < 0.6))) {
      const dir = escapeDir(p);
      api.use('blink', dir.x, dir.z);
      acted = true;
    }

    // 4. charge wind-up aimed at us and we are inside its reach: pre-empt by blinking wide
    if (!acted && chargeWind && d < 8.5 && blinkOk && ec.remaining < 0.12) {
      const hd = V.fromHeading(en.heading);
      const dir = perpDodge(p, hd);
      api.use('blink', dir.x, dir.z);
      acted = true;
    }

    // 5. laser
    if (!acted && api.ready('laser') && en.visible && !en.invulnerable && d >= 5.5 && d <= 22.5) {
      const risky = (chargeReady && d < 12.0) || (ec && ec.skill === 'charge' && d < 16);
      if (!risky) {
        const ang = Math.abs(V.angleTo(me.heading, V.toward({ x: me.x, z: me.z }, pred)));
        if (ang < 1.1) {
          api.use('laser');
          acted = true;
        }
      }
    }
  }

  // ---------- movement ----------
  let D;
  if (chargeReady) D = 15.5;
  else D = 10.0;
  if (dashing) D = 18;
  if (d < 6) D = Math.max(D, 12);

  const laserCd = api.cooldown('laser');
  let wantLOS = laserCd < 0.55 || !chargeReady;
  if (dashing || chargeWind) wantLOS = false;
  if (me.casting && me.casting.skill === 'laser') wantLOS = true;

  const dir = chooseMove(p, D, wantLOS);
  if (dir) {
    lastDir = dir;
    api.move(dir.x, dir.z);
  } else {
    api.moveTo(0, 0);
  }
}
