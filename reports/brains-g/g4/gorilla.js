const OBS_PAD = 0.05;

let lastLaserStart = -99;
let lastBlinkStart = -99;
let forcePathUntil = -99;
let weavePhase = 0;
let weaveDir = 1;
let lastSay = -99;

function segAabb(ax, az, bx, bz, minx, minz, maxx, maxz) {
  const dx = bx - ax, dz = bz - az;
  let t0 = 0, t1 = 1;
  const ps = [-dx, dx, -dz, dz];
  const qs = [ax - minx, maxx - ax, az - minz, maxz - az];
  for (let i = 0; i < 4; i++) {
    const pp = ps[i], qq = qs[i];
    if (Math.abs(pp) < 1e-9) {
      if (qq < 0) return false;
    } else {
      const r = qq / pp;
      if (pp < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
      else { if (r < t0) return false; if (r < t1) t1 = r; }
    }
  }
  return true;
}

function segBlocked(ax, az, bx, bz, obs, pad) {
  for (const o of obs) {
    if (segAabb(ax, az, bx, bz, o.x - o.hx - pad, o.z - o.hz - pad, o.x + o.hx + pad, o.z + o.hz + pad)) return true;
  }
  return false;
}

function inObstacle(x, z, obs, pad) {
  for (const o of obs) {
    if (x > o.x - o.hx - pad && x < o.x + o.hx + pad && z > o.z - o.hz - pad && z < o.z + o.hz + pad) return true;
  }
  return false;
}

function findCover(p, s, e) {
  const obs = p.arena.obstacles;
  const half = p.arena.half;
  let best = null, bestScore = Infinity;
  for (const o of obs) {
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4;
      const cx = o.x + Math.sin(a) * (o.hx + 2.1);
      const cz = o.z + Math.cos(a) * (o.hz + 2.1);
      if (Math.abs(cx) > half - 1.6 || Math.abs(cz) > half - 1.6) continue;
      if (inObstacle(cx, cz, obs, 1.35)) continue;
      if (!segBlocked(e.x, e.z, cx, cz, obs, OBS_PAD)) continue;
      const dSelf = Math.hypot(cx - s.x, cz - s.z);
      const dEn = Math.hypot(cx - e.x, cz - e.z);
      if (dEn > e.dist + 1.5) continue;
      const score = dSelf + dEn * 0.55;
      if (score < bestScore) { bestScore = score; best = { x: cx, z: cz, dSelf }; }
    }
  }
  return best;
}

function think(p, api) {
  const s = p.self, e = p.enemy;
  if (!s.alive) return;
  const t = p.t;
  const obs = p.arena.obstacles;

  for (const ev of p.events) {
    if (ev.type === 'enemyStarted') {
      if (ev.skill === 'laser') lastLaserStart = t;
      else if (ev.skill === 'blink') lastBlinkStart = t;
    } else if (ev.type === 'blocked') {
      if (ev.by === 'obstacle') forcePathUntil = t + 0.9;
    } else if (ev.type === 'damaged' && ev.skill === 'laser') {
      if (t - lastLaserStart > 1.0) lastLaserStart = t - 0.7;
    }
  }

  const d = e.dist;
  const ec = e.casting;
  const eLaser = !!(ec && ec.skill === 'laser' && ec.telegraph);
  const laserSoon = (t - lastLaserStart) > 1.55;

  // ---------- facing ----------
  const myCast = s.casting;
  const chargingUp = !!(myCast && myCast.skill === 'charge' && myCast.phase === 'windup');
  if (chargingUp) {
    const wr = Math.max(0, myCast.remaining || 0);
    const tgt = { x: e.x + e.vx * wr, z: e.z + e.vz * wr };
    const aim = V.lead({ x: s.x, z: s.z }, tgt, { x: e.vx, z: e.vz }, 15);
    api.faceAt(aim.x, aim.z);
  } else {
    const lt = d < 5 ? 0.22 : 0.12;
    api.faceAt(e.x + e.vx * lt, e.z + e.vz * lt);
  }

  // ---------- skills ----------
  const canAct = !s.busy && !s.stunned && !s.airborne;
  if (canAct) {
    const lt = 0.28;
    const px = s.x + s.vx * lt, pz = s.z + s.vz * lt;
    const qx = e.x + e.vx * lt, qz = e.z + e.vz * lt;
    const dPred = Math.hypot(qx - px, qz - pz);

    const smashOk = api.ready('smash') && !e.airborne && d <= 5.2 && (dPred <= 4.05 || d <= 3.1);
    const chargeOk = api.ready('charge') && e.visible && d >= 3.3 && d <= 11.8 &&
      !e.invulnerable && !(e.stunned && d < 5.0);

    if (smashOk && (d < 4.5 || !chargeOk)) api.use('smash');
    else if (chargeOk) api.use('charge');
    else if (smashOk) api.use('smash');
  }

  // ---------- movement ----------
  weavePhase += p.dt;
  if (weavePhase > 0.65) { weavePhase = 0; weaveDir = -weaveDir; }

  if (!s.airborne) {
    const me = { x: s.x, z: s.z };
    const toE = V.toward(me, { x: e.x, z: e.z });
    const perp = V.perp(toE);

    if (d < 3.1) {
      // press: stay glued, heavier body wins the shove
      api.move(toE.x + perp.x * 0.3 * weaveDir, toE.z + perp.z * 0.3 * weaveDir);
    } else if (eLaser && d > 5.0) {
      const cov = findCover(p, s, e);
      if (cov && cov.dSelf < 6.5) {
        api.moveTo(cov.x, cov.z);
      } else {
        api.move(toE.x * 0.85 + perp.x * 1.15 * weaveDir, toE.z * 0.85 + perp.z * 1.15 * weaveDir);
      }
    } else if (!e.visible || t < forcePathUntil) {
      api.moveTo(e.x, e.z);
    } else {
      const path = api.pathTo(e.x, e.z);
      if (path && !path.direct && d > 4) {
        api.moveTo(e.x, e.z);
      } else if (d > 7 && laserSoon) {
        const cov = findCover(p, s, e);
        if (cov && cov.dSelf < 5.0 && cov.dSelf < d * 0.7) {
          api.moveTo(cov.x, cov.z);
        } else {
          api.move(toE.x + perp.x * 0.6 * weaveDir, toE.z + perp.z * 0.6 * weaveDir);
        }
      } else {
        const w = d > 5 ? 0.35 : 0.15;
        api.move(toE.x + perp.x * w * weaveDir, toE.z + perp.z * w * weaveDir);
      }
    }
  }

  if (t - lastSay > 6) {
    lastSay = t;
    api.remember('dist', Math.round(d * 10) / 10);
    api.remember('hp', s.hp);
    if (d < 4) api.say("calamari.");
    else if (eLaser) api.say("beam telegraphed. closing.");
    else api.say("eight arms, one gorilla.");
  }
}
