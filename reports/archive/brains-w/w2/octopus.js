const DIRS24 = [];
for (let i = 0; i < 24; i++) {
  const a = i * Math.PI / 12;
  DIRS24.push({ x: Math.sin(a), z: Math.cos(a) });
}
const DIRS16 = [];
for (let i = 0; i < 16; i++) {
  const a = i * Math.PI / 8;
  DIRS16.push({ x: Math.sin(a), z: Math.cos(a) });
}

let lastCharge = -99;
let lastSmash = -99;
let prevDir = { x: 0, z: 1 };
let saidOnce = false;

function insideBlock(p, x, z, pad) {
  for (const o of p.arena.obstacles) {
    if (Math.abs(x - o.x) < o.hx + pad && Math.abs(z - o.z) < o.hz + pad) return true;
  }
  return false;
}

function segBox(ax, az, bx, bz, o, pad) {
  const minx = o.x - o.hx - pad, maxx = o.x + o.hx + pad;
  const minz = o.z - o.hz - pad, maxz = o.z + o.hz + pad;
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dz = bz - az;
  if (Math.abs(dx) < 1e-9) {
    if (ax < minx || ax > maxx) return false;
  } else {
    let ta = (minx - ax) / dx, tb = (maxx - ax) / dx;
    if (ta > tb) { const tmp = ta; ta = tb; tb = tmp; }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return false;
  }
  if (Math.abs(dz) < 1e-9) {
    if (az < minz || az > maxz) return false;
  } else {
    let ta = (minz - az) / dz, tb = (maxz - az) / dz;
    if (ta > tb) { const tmp = ta; ta = tb; tb = tmp; }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return false;
  }
  return true;
}

function clearLine(p, ax, az, bx, bz) {
  for (const o of p.arena.obstacles) {
    if (segBox(ax, az, bx, bz, o, 0.05)) return false;
  }
  return true;
}

function predictEnemy(e, lead) {
  let damp = 0.85;
  if (e.casting && (e.casting.phase === 'windup')) damp = 0.35;
  if (e.stunned) damp = 0.2;
  let x = e.x + e.vx * lead * damp;
  let z = e.z + e.vz * lead * damp;
  if (x > 19.4) x = 19.4; if (x < -19.4) x = -19.4;
  if (z > 19.4) z = 19.4; if (z < -19.4) z = -19.4;
  return { x, z };
}

function blinkLand(p, s, d) {
  for (let f = 7.5; f >= 1.5; f -= 0.75) {
    const x = s.x + d.x * f, z = s.z + d.z * f;
    if (Math.abs(x) > 19.0 || Math.abs(z) > 19.0) continue;
    if (insideBlock(p, x, z, 1.2)) continue;
    return { x, z, f };
  }
  return null;
}

function bestBlink(p, api, e, prefer) {
  const s = p.self;
  let best = null;
  for (const d of DIRS16) {
    const land = blinkLand(p, s, d);
    if (!land) continue;
    const dn = Math.hypot(land.x - e.x, land.z - e.z);
    let sc = 2.0 * Math.min(dn, 14);
    const edge = 20 - Math.max(Math.abs(land.x), Math.abs(land.z));
    if (edge < 5) sc -= (5 - edge) * 1.5;
    sc += land.f * 0.25;
    if (prefer) sc += 6.0 * (d.x * prefer.x + d.z * prefer.z);
    if (dn < 4.5) sc -= 25;
    if (!best || sc > best.sc) best = { sc, d, land };
  }
  return best;
}

function chooseMove(p, api, e, ideal, wantLos) {
  const s = p.self;
  let best = null;
  for (const d of DIRS24) {
    const probe = api.ray(d.x, d.z, 7);
    const free = probe.dist;
    if (free < 1.7) continue;
    const step = Math.min(4.5, free - 1.2);
    const tx = s.x + d.x * step, tz = s.z + d.z * step;
    const dn = Math.hypot(tx - e.x, tz - e.z);
    let sc = -1.7 * Math.abs(Math.min(dn, 22) - ideal);
    sc += 0.40 * Math.min(free, 7);
    const edge = 20 - Math.max(Math.abs(tx), Math.abs(tz));
    if (edge < 5.5) sc -= (5.5 - edge) * 1.3;
    if (dn < 5) sc -= (5 - dn) * 4.0;
    if (wantLos && clearLine(p, tx, tz, e.x, e.z)) sc += 1.2;
    sc += 0.8 * (d.x * prevDir.x + d.z * prevDir.z);
    if (!best || sc > best.sc) best = { sc, d, tx, tz };
  }
  return best;
}

function think(p, api) {
  const s = p.self, e = p.enemy;
  if (!s.alive) return;

  if (p.t < 0.12) { lastCharge = -99; lastSmash = -99; saidOnce = false; prevDir = { x: 0, z: 1 }; }

  for (const ev of p.events) {
    if (ev.type === 'enemyStarted') {
      if (ev.skill === 'charge') lastCharge = p.t;
      else if (ev.skill === 'smash') lastSmash = p.t;
    } else if (ev.type === 'damaged') {
      if (ev.skill === 'charge') lastCharge = p.t;
      else if (ev.skill === 'smash') lastSmash = p.t;
    }
  }

  if (!saidOnce) { saidOnce = true; api.say("eight arms, one beam"); }

  if (s.stunned || s.airborne) return;

  const dist = e.dist;
  const chargeReadyIn = Math.max(0, lastCharge + 4.5 - p.t);
  const ec = e.casting;
  const chargeDash = !!(ec && ec.skill === 'charge' && (ec.phase === 'dash'));
  const chargeWind = !!(ec && ec.skill === 'charge' && ec.phase === 'windup');
  const smashWind = !!(ec && ec.skill === 'smash' && ec.telegraph);

  // --- keep aiming through a laser cast ---
  if (s.casting && s.casting.skill === 'laser') {
    const rem = typeof s.casting.remaining === 'number' ? s.casting.remaining : 0.3;
    const pt = predictEnemy(e, Math.max(0, Math.min(rem, 0.6)));
    api.faceAt(pt.x, pt.z);
    const ideal = chargeReadyIn > 1.2 ? 8.5 : 13.5;
    const mv = chooseMove(p, api, e, ideal, true);
    if (mv) { prevDir = mv.d; api.move(mv.d.x, mv.d.z); }
    return;
  }

  // --- dodge an incoming charge dash ---
  if (chargeDash) {
    let u = { x: e.vx, z: e.vz };
    const ul = Math.hypot(u.x, u.z);
    if (ul < 1) u = { x: Math.sin(e.heading), z: Math.cos(e.heading) };
    else u = { x: u.x / ul, z: u.z / ul };
    const rx = s.x - e.x, rz = s.z - e.z;
    const along = rx * u.x + rz * u.z;
    const lat = u.x * rz - u.z * rx;
    if (along > -1.0 && along < 14 && Math.abs(lat) < 3.6) {
      let side = { x: -u.z, z: u.x };
      if (lat < 0) side = { x: u.z, z: -u.x };
      const r1 = api.ray(side.x, side.z, 5);
      if (r1.dist < 3.0) {
        const other = { x: -side.x, z: -side.z };
        const r2 = api.ray(other.x, other.z, 5);
        if (r2.dist > r1.dist) side = other;
      }
      if (api.ready('blink') && (along < 9 || Math.abs(lat) < 2.2)) {
        const b = bestBlink(p, api, e, side);
        if (b) { api.use('blink', b.d.x, b.d.z); api.faceAt(e.x, e.z); return; }
        api.use('blink', side.x, side.z);
        api.faceAt(e.x, e.z);
        return;
      }
      prevDir = side;
      api.move(side.x, side.z);
      api.faceAt(e.x, e.z);
      return;
    }
  }

  // --- dodge a smash ---
  if (smashWind && dist < 5.6) {
    const away = { x: s.x - e.x, z: s.z - e.z };
    const al = Math.hypot(away.x, away.z) || 1;
    const aw = { x: away.x / al, z: away.z / al };
    if (api.ready('blink')) {
      const b = bestBlink(p, api, e, aw);
      if (b) api.use('blink', b.d.x, b.d.z); else api.use('blink', aw.x, aw.z);
      api.faceAt(e.x, e.z);
      return;
    }
    if (api.ready('jump')) {
      api.move(aw.x, aw.z);
      api.use('jump');
      api.faceAt(e.x, e.z);
      return;
    }
    prevDir = aw;
    api.move(aw.x, aw.z);
    api.faceAt(e.x, e.z);
    return;
  }

  // --- too close: teleport out ---
  if (dist < 5.2 && api.ready('blink') && !s.busy) {
    const away = { x: s.x - e.x, z: s.z - e.z };
    const al = Math.hypot(away.x, away.z) || 1;
    const b = bestBlink(p, api, e, { x: away.x / al, z: away.z / al });
    if (b) {
      api.use('blink', b.d.x, b.d.z);
      api.faceAt(e.x, e.z);
      return;
    }
  }

  // --- shoot ---
  const lead = 0.55;
  const pt = predictEnemy(e, lead);
  const safeRange = dist >= 12.8 || chargeReadyIn > 1.05;
  const enemyAir = e.airborne && !(ec && ec.phase === 'recover');
  let fired = false;
  if (!s.busy && api.ready('laser') && dist <= 22 && dist > 3.0 && safeRange && !enemyAir &&
      e.visible && clearLine(p, s.x, s.z, pt.x, pt.z)) {
    const dir = { x: pt.x - s.x, z: pt.z - s.z };
    const ang = Math.abs(V.angleTo(s.heading, dir));
    if (ang < 1.5) {
      api.use('laser');
      api.faceAt(pt.x, pt.z);
      fired = true;
    }
  }

  // --- movement ---
  let ideal;
  if (chargeWind || chargeReadyIn < 0.8) ideal = 13.5;
  else if (chargeReadyIn > 2.0) ideal = 8.0;
  else ideal = 11.0;

  if (chargeWind && dist < 12) {
    let u = { x: Math.sin(e.heading), z: Math.cos(e.heading) };
    let side = { x: -u.z, z: u.x };
    const rx = s.x - e.x, rz = s.z - e.z;
    const lat = u.x * rz - u.z * rx;
    if (lat < 0) side = { x: u.z, z: -u.x };
    const r1 = api.ray(side.x, side.z, 5);
    if (r1.dist < 2.6) side = { x: -side.x, z: -side.z };
    const awayx = s.x - e.x, awayz = s.z - e.z;
    const al = Math.hypot(awayx, awayz) || 1;
    const mix = { x: side.x * 0.8 + (awayx / al) * 0.6, z: side.z * 0.8 + (awayz / al) * 0.6 };
    prevDir = V.norm(mix);
    api.move(mix.x, mix.z);
  } else {
    const mv = chooseMove(p, api, e, ideal, true);
    if (mv) {
      prevDir = mv.d;
      api.move(mv.d.x, mv.d.z);
    } else {
      const away = V.norm({ x: s.x - e.x, z: s.z - e.z });
      api.move(away.x, away.z);
    }
  }

  if (!fired) {
    const aim = predictEnemy(e, 0.4);
    api.faceAt(aim.x, aim.z);
  }
}
