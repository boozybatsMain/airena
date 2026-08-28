function think(p, api) {
  const s = p.self, e = p.enemy;
  if (!s || !e || !s.alive) return;
  const obs = (p.arena && p.arena.obstacles) || [];
  const dist = e.dist;

  // ---------- helpers ----------
  const predict = (ent, t) => ({ x: ent.x + (ent.vx || 0) * t, z: ent.z + (ent.vz || 0) * t });

  // ---------- facing / aim targets ----------
  const aimSmash = predict(e, 0.30);
  const dSmash = Math.hypot(aimSmash.x - s.x, aimSmash.z - s.z);
  const chargeLead = 0.34 + Math.min(dist, 12) / 15;
  const aimCharge = predict(e, chargeLead * 0.85);

  // ---------- mid-skill handling ----------
  if (s.casting && s.casting.telegraph) {
    if (s.casting.skill === 'smash') {
      const t = Math.max(0, s.casting.remaining || 0.1);
      const a = predict(e, t);
      api.faceAt(a.x, a.z);
      if (dist > 2.4) api.move(e.x - s.x, e.z - s.z); else api.move(0, 0);
      return;
    }
    if (s.casting.skill === 'charge') {
      const t = Math.max(0, s.casting.remaining || 0.1);
      const a = predict(e, t + Math.min(dist, 12) / 15);
      api.faceAt(a.x, a.z);
      api.move(e.x - s.x, e.z - s.z);
      return;
    }
  }

  const canAct = !s.busy && !s.stunned && !s.airborne;
  const laserIncoming = !!(e.casting && e.casting.skill === 'laser' && e.casting.telegraph && e.visible);

  // ---------- movement ----------
  let moveSet = false;

  if (laserIncoming) {
    const tRem = Math.max(0.12, (e.casting.remaining !== undefined ? e.casting.remaining : 0.3));
    const step = Math.min(s.maxSpeed * tRem + 0.6, 3.4);
    const perpW = Math.min(6, 18 / Math.max(dist, 1.2));
    const base = { x: e.x - s.x, z: e.z - s.z };
    const bl = Math.hypot(base.x, base.z) || 1;
    const bn = { x: base.x / bl, z: base.z / bl };
    let best = null, bestScore = -1e9;
    for (let i = 0; i < 16; i++) {
      const h = (i * Math.PI) / 8;
      const d = { x: Math.sin(h), z: Math.cos(h) };
      const cx = s.x + d.x * step, cz = s.z + d.z * step;
      if (Math.abs(cx) > 19.0 || Math.abs(cz) > 19.0) continue;
      if (pointBlocked(cx, cz, obs, s.radius + 0.15)) continue;
      if (segBlocked(s.x, s.z, cx, cz, obs, s.radius * 0.85)) continue;
      let score = 0;
      if (segBlocked(e.x, e.z, cx, cz, obs, 0)) score += 120;
      // perpendicular offset from the enemy->us line
      const rx = cx - e.x, rz = cz - e.z;
      const perp = Math.abs(rx * bn.z - rz * bn.x);
      score += perp * perpW;
      const dNew = Math.hypot(rx, rz);
      score += (dist - dNew) * 3.2;
      // stay off walls
      const wall = Math.min(19.5 - Math.abs(cx), 19.5 - Math.abs(cz));
      if (wall < 3) score -= (3 - wall) * 4;
      if (score > bestScore) { bestScore = score; best = d; }
    }
    if (best) { api.move(best.x, best.z); moveSet = true; }
  }

  if (!moveSet) {
    if (!e.visible || segBlocked(s.x, s.z, e.x, e.z, obs, 1.35)) {
      api.moveTo(e.x, e.z);
    } else if (dist > 3.2) {
      const t = { x: e.x - s.x, z: e.z - s.z };
      const l = Math.hypot(t.x, t.z) || 1;
      const tn = { x: t.x / l, z: t.z / l };
      const sign = Math.sin(p.t * 3.3) >= 0 ? 1 : -1;
      const amt = dist > 8 ? 0.5 : (dist > 5 ? 0.32 : 0.12);
      let dx = tn.x + sign * amt * tn.z;
      let dz = tn.z - sign * amt * tn.x;
      const cx = s.x + dx * 2.2, cz = s.z + dz * 2.2;
      if (Math.abs(cx) > 19 || Math.abs(cz) > 19 || pointBlocked(cx, cz, obs, s.radius + 0.1)) {
        api.moveTo(e.x, e.z);
      } else {
        api.move(dx, dz);
      }
    } else {
      api.move(e.x - s.x, e.z - s.z);
    }
  }

  // ---------- facing ----------
  api.faceAt(aimSmash.x, aimSmash.z);

  // ---------- skills ----------
  if (!canAct) return;

  const angTo = (tx, tz) => Math.abs(V.angleTo(s.heading, V.norm({ x: tx - s.x, z: tz - s.z })));

  const smashOK =
    api.ready('smash') &&
    !e.airborne && !e.invulnerable &&
    dSmash <= 3.7 &&
    angTo(aimSmash.x, aimSmash.z) < 1.35;

  if (smashOK) {
    api.use('smash');
    return;
  }

  const chargePathClear = !segBlocked(s.x, s.z, aimCharge.x, aimCharge.z, obs, 1.15);
  const chargeAng = angTo(aimCharge.x, aimCharge.z);
  const chargeWorth =
    api.ready('charge') &&
    !e.invulnerable &&
    e.visible &&
    chargePathClear &&
    dist > 2.6 && dist < 11.5 &&
    chargeAng < 0.85;

  if (chargeWorth) {
    api.face(aimCharge.x - s.x, aimCharge.z - s.z);
    api.use('charge');
    return;
  }

  // if charge is wanted but we're badly aimed, prioritise turning onto the line
  if (api.ready('charge') && e.visible && chargePathClear && dist > 3.2 && dist < 11.5 && !e.invulnerable) {
    api.face(aimCharge.x - s.x, aimCharge.z - s.z);
  }

  if (p.t - lastSay > 6) {
    lastSay = p.t;
    api.say(dist < 4 ? 'CLOSE. SMASH.' : 'no beam saves you');
  }
}

let lastSay = -99;

function pointBlocked(x, z, obs, pad) {
  for (const o of obs) {
    if (x > o.x - o.hx - pad && x < o.x + o.hx + pad && z > o.z - o.hz - pad && z < o.z + o.hz + pad) return true;
  }
  return false;
}

function segBlocked(ax, az, bx, bz, obs, pad) {
  for (const o of obs) {
    if (segBox(ax, az, bx, bz, o.x - o.hx - pad, o.z - o.hz - pad, o.x + o.hx + pad, o.z + o.hz + pad)) return true;
  }
  return false;
}

function segBox(ax, az, bx, bz, minx, minz, maxx, maxz) {
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dz = bz - az;
  if (Math.abs(dx) < 1e-9) {
    if (ax < minx || ax > maxx) return false;
  } else {
    let ta = (minx - ax) / dx, tb = (maxx - ax) / dx;
    if (ta > tb) { const t = ta; ta = tb; tb = t; }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return false;
  }
  if (Math.abs(dz) < 1e-9) {
    if (az < minz || az > maxz) return false;
  } else {
    let ta = (minz - az) / dz, tb = (maxz - az) / dz;
    if (ta > tb) { const t = ta; ta = tb; tb = t; }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return false;
  }
  return true;
}
