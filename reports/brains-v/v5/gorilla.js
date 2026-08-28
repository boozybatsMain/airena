const SMASH_MAX = 5.15;

function segHitsBox(ax, az, bx, bz, cx, cz, hx, hz) {
  const dx = bx - ax, dz = bz - az;
  let t0 = 0, t1 = 1;
  const minx = cx - hx, maxx = cx + hx, minz = cz - hz, maxz = cz + hz;
  if (Math.abs(dx) < 1e-9) {
    if (ax < minx || ax > maxx) return false;
  } else {
    let ta = (minx - ax) / dx, tb = (maxx - ax) / dx;
    if (ta > tb) { const q = ta; ta = tb; tb = q; }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return false;
  }
  if (Math.abs(dz) < 1e-9) {
    if (az < minz || az > maxz) return false;
  } else {
    let ta = (minz - az) / dz, tb = (maxz - az) / dz;
    if (ta > tb) { const q = ta; ta = tb; tb = q; }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return false;
  }
  return true;
}

function clearLine(ax, az, bx, bz, obs, pad) {
  for (const o of obs) {
    if (segHitsBox(ax, az, bx, bz, o.x, o.z, o.hx + pad, o.hz + pad)) return false;
  }
  return true;
}

function clampArena(pt) {
  const L = 18.6;
  return { x: Math.max(-L, Math.min(L, pt.x)), z: Math.max(-L, Math.min(L, pt.z)) };
}

let blockedUntil = -99;
let coverPt = null;
let coverAt = -99;
let saidOnce = false;
let lastChargeT = -99;

function think(p, api) {
  const s = p.self, e = p.enemy;
  if (!s.alive || !e.alive) return;
  const obs = p.arena.obstacles;
  const d = e.dist;

  for (const ev of p.events) {
    if (ev.type === 'blocked' && ev.by === 'obstacle') blockedUntil = p.t + 0.6;
  }

  if (!saidOnce) { saidOnce = true; api.say("come here, little squid"); }

  const pe = (t) => clampArena({ x: e.x + e.vx * t, z: e.z + e.vz * t });

  if (s.stunned) return;

  // ---- locked in charge wind-up: aim the dash at the intercept point
  if (s.casting && s.casting.skill === 'charge' && s.casting.phase === 'windup') {
    const tt = (s.casting.remaining || 0) + Math.min(d / 15, 0.8);
    const q = pe(tt);
    api.faceAt(q.x, q.z);
    api.move(q.x - s.x, q.z - s.z);
    return;
  }
  // ---- mid dash / air / recovery: just keep facing them
  if (s.busy && s.casting && s.casting.skill !== 'smash') {
    const q = pe(0.2);
    api.faceAt(q.x, q.z);
    return;
  }

  const eLasering = !!(e.casting && e.casting.skill === 'laser' && e.casting.telegraph);
  const visible = e.visible;

  let faceTarget = pe(0.22);
  let moveOrder = null;   // {type:'move'|'moveTo', x, z}
  let skill = null;

  // ---------- SMASH ----------
  const smashLand = 0.3;
  const qs = pe(smashLand);
  const mySelf = { x: s.x + s.vx * 0.14, z: s.z + s.vz * 0.14 };
  const dq = Math.hypot(qs.x - mySelf.x, qs.z - mySelf.z);
  const dirq = V.toward(mySelf, qs);
  const angErr = Math.abs(V.angleTo(s.heading, dirq));
  const softTarget = !e.airborne && !e.invulnerable;

  const smashReady = api.ready('smash');
  const chargeReady = api.ready('charge');

  if (!s.busy && smashReady && softTarget && dq <= 4.6 && angErr < 0.95) {
    skill = { name: 'smash' };
    faceTarget = qs;
  }

  // ---------- CHARGE ----------
  if (!skill && !s.busy && chargeReady && !e.invulnerable && !e.airborne) {
    const lo = 3.4, hi = 11.4;
    if (d >= lo && d <= hi) {
      const tt = 0.3 + Math.min(d / 15, 0.8);
      const q = pe(tt);
      const lineOk = clearLine(s.x, s.z, q.x, q.z, obs, 0.35) &&
        Math.abs(q.x) < 19.5 && Math.abs(q.z) < 19.5 &&
        clearLine(s.x, s.z, e.x, e.z, obs, 0.35);
      if (lineOk) {
        skill = { name: 'charge' };
        faceTarget = q;
        lastChargeT = p.t;
      }
    }
  }

  // ---------- MOVEMENT ----------
  if (d <= 5.2) {
    // brawl: stay glued, heavier body wins the shove
    if (p.t < blockedUntil && d > 3.0) {
      moveOrder = { type: 'moveTo', x: e.x, z: e.z };
    } else {
      const aim = pe(0.15);
      moveOrder = { type: 'move', x: aim.x - s.x, z: aim.z - s.z };
    }
  } else if (e.airborne) {
    // meet them where they land
    const q = pe(0.4);
    moveOrder = { type: 'moveTo', x: q.x, z: q.z };
  } else if (!visible || d <= 12.5 || chargeReady || e.stunned) {
    // close in hard: either they can't see us, or we're in charge band
    const q = pe(0.35);
    moveOrder = { type: 'moveTo', x: q.x, z: q.z };
    coverPt = null;
  } else {
    // exposed at long range with no charge available: advance through cover
    let want = coverPt;
    const stale = !want || (p.t - coverAt) > 0.55 ||
      Math.hypot(want.x - s.x, want.z - s.z) < 1.6 ||
      clearLine(want.x, want.z, e.x, e.z, obs, 0.15);
    if (stale) {
      want = pickCover(api, obs, s, e);
      coverPt = want;
      coverAt = p.t;
    }
    if (want) moveOrder = { type: 'moveTo', x: want.x, z: want.z };
    else {
      const q = pe(0.35);
      moveOrder = { type: 'moveTo', x: q.x, z: q.z };
    }
  }

  // if they are winding a laser at us and we are close-ish, sprint straight in
  if (eLasering && d <= 9 && !skill) {
    moveOrder = { type: 'move', x: e.x - s.x, z: e.z - s.z };
  }

  // ---------- ISSUE ----------
  api.faceAt(faceTarget.x, faceTarget.z);
  if (moveOrder) {
    if (moveOrder.type === 'move') api.move(moveOrder.x, moveOrder.z);
    else api.moveTo(moveOrder.x, moveOrder.z);
  }
  if (skill) api.use(skill.name);
}

function pickCover(api, obs, s, e) {
  let best = null, bestScore = 1e9;
  for (const o of obs) {
    const dir = V.norm({ x: o.x - e.x, z: o.z - e.z });
    if (dir.x === 0 && dir.z === 0) continue;
    const off = Math.max(o.hx, o.hz) + 2.0;
    for (const lat of [0, 1.6, -1.6]) {
      const per = V.perp(dir);
      const cand = clampArena({
        x: o.x + dir.x * off + per.x * lat,
        z: o.z + dir.z * off + per.z * lat
      });
      if (!clearLine(cand.x, cand.z, e.x, e.z, obs, 0.15)) {
        const pt = api.pathTo(cand.x, cand.z);
        if (!pt) continue;
        const score = pt.dist * 0.9 + Math.hypot(cand.x - e.x, cand.z - e.z) * 1.1;
        if (score < bestScore) { bestScore = score; best = cand; }
      }
    }
  }
  return best;
}
