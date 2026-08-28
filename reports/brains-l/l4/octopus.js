const BOXES = [
  { x: -7, z: -3, hx: 1.2, hz: 3.5 },
  { x: 7, z: 3, hx: 1.2, hz: 3.5 },
  { x: 0, z: -10, hx: 3.6, hz: 1.2 },
  { x: 0, z: 10, hx: 3.6, hz: 1.2 },
  { x: -12.5, z: 11, hx: 1.6, hz: 1.6 },
  { x: 12.5, z: -11, hx: 1.6, hz: 1.6 }
];

function segHitsBox(ax, az, bx, bz, o, pad) {
  const minx = o.x - o.hx - pad, maxx = o.x + o.hx + pad;
  const minz = o.z - o.hz - pad, maxz = o.z + o.hz + pad;
  const dx = bx - ax, dz = bz - az;
  let t0 = 0, t1 = 1;
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

function blocked(ax, az, bx, bz, pad) {
  for (const o of BOXES) if (segHitsBox(ax, az, bx, bz, o, pad)) return true;
  return false;
}

function clampArena(v) {
  return { x: Math.max(-19, Math.min(19, v.x)), z: Math.max(-19, Math.min(19, v.z)) };
}

// choose a walking direction by sampling the circle
function chooseMove(p, api, en, desired, wantLos) {
  const me = p.self;
  let best = null, bs = -1e9;
  for (let i = 0; i < 20; i++) {
    const a = i * Math.PI / 10;
    const dir = { x: Math.sin(a), z: Math.cos(a) };
    let clear;
    try {
      const r = api.ray(dir.x, dir.z, 5.5);
      clear = r && typeof r.dist === 'number' ? r.dist : 5.5;
    } catch (e) { clear = 5.5; }
    if (clear < 1.5) continue;
    const step = Math.min(clear - 1.0, 3.4);
    const px = me.x + dir.x * step, pz = me.z + dir.z * step;
    if (Math.abs(px) > 19.2 || Math.abs(pz) > 19.2) continue;
    const nd = Math.hypot(px - en.x, pz - en.z);
    let s = -Math.abs(nd - desired) * 1.6;
    s += Math.min(clear, 5.5) * 0.35;
    const wm = 19 - Math.max(Math.abs(px), Math.abs(pz));
    s += Math.min(wm, 5) * 1.1;
    const los = !blocked(px, pz, en.x, en.z, 0);
    if (wantLos) s += los ? 2.2 : -2.6;
    else s += los ? -1.6 : 2.4;
    // keep some continuity with current velocity
    if (me.speed > 0.5) s += (dir.x * me.vx + dir.z * me.vz) / me.speed * 0.7;
    if (s > bs) { bs = s; best = dir; }
  }
  if (!best) {
    const aw = V.away(me, en);
    best = (aw.x === 0 && aw.z === 0) ? { x: 1, z: 0 } : aw;
  }
  return best;
}

function sidestepDir(p, api, hd, rel) {
  let side = V.perp(hd);
  if (V.dot(side, rel) < 0) side = V.scale(side, -1);
  let d1 = 8, d2 = 8;
  try { d1 = api.ray(side.x, side.z, 8).dist; } catch (e) {}
  try { d2 = api.ray(-side.x, -side.z, 8).dist; } catch (e) {}
  if (d1 < 3.2 && d2 > d1) side = V.scale(side, -1);
  const out = V.norm(V.add(side, V.scale(hd, -0.3)));
  return (out.x === 0 && out.z === 0) ? side : out;
}

let lastSay = -99;

function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me || !en || !me.alive) return;
  if (!en.alive) { api.stop(); return; }

  const d = en.dist;
  const toEn = V.toward(me, en);

  if (me.stunned) { api.faceAt(en.x, en.z); return; }
  if (me.airborne) { api.faceAt(en.x, en.z); return; }

  const ec = en.casting;
  const evel = { x: en.vx, z: en.vz };
  const approach = V.dot(evel, V.toward(en, me));

  // ---- predicted aim point ----
  const aimAt = (lead) => {
    const t = Math.max(0, Math.min(lead, 0.7));
    return clampArena({ x: en.x + en.vx * t * 0.85, z: en.z + en.vz * t * 0.85 });
  };

  // ---- if already casting the laser: hold the aim, drift away ----
  if (me.casting && me.casting.skill === 'laser') {
    const pt = aimAt(me.casting.remaining);
    api.faceAt(pt.x, pt.z);
    const dir = chooseMove(p, api, en, Math.max(d + 2, 14), true);
    api.move(dir.x, dir.z);
    return;
  }
  if (me.busy) { api.faceAt(en.x, en.z); return; }

  // ---- charge evasion ----
  if (ec && ec.skill === 'charge') {
    const hd = V.fromHeading(en.heading);
    const rel = V.sub(me, en);
    const along = V.dot(rel, hd);
    const cross = rel.x * hd.z - rel.z * hd.x;
    const lat = Math.abs(cross);
    const inLine = along > -2 && along < 15 && lat < 3.4;
    if (inLine || d < 15) {
      const dodge = sidestepDir(p, api, hd, rel);
      api.move(dodge.x, dodge.z);
      api.faceAt(en.x, en.z);
      if (api.ready('blink')) {
        if (ec.phase === 'dash' && inLine) api.use('blink', dodge.x, dodge.z);
        else if (inLine && ec.remaining < 0.09 && d < 13) api.use('blink', dodge.x, dodge.z);
      }
      return;
    }
  }

  // ---- smash evasion ----
  if (ec && ec.skill === 'smash' && ec.telegraph && d < 7.5) {
    const dir = chooseMove(p, api, en, 20, false);
    api.move(dir.x, dir.z);
    api.faceAt(en.x, en.z);
    if (d < 6.2) {
      if (api.ready('blink')) api.use('blink', dir.x, dir.z);
      else if (api.ready('jump') && ec.remaining < 0.24) api.use('jump');
    }
    return;
  }

  // ---- panic gap: too close, make room ----
  const laserReady = api.ready('laser');
  if (d < 6.0 && api.ready('blink')) {
    const dir = chooseMove(p, api, en, 20, true);
    api.use('blink', dir.x, dir.z);
    api.move(dir.x, dir.z);
    api.faceAt(en.x, en.z);
    return;
  }
  if (laserReady && en.visible && d < 9.5 && d >= 6.0 && api.ready('blink')) {
    const dir = chooseMove(p, api, en, 20, true);
    api.use('blink', dir.x, dir.z);
    api.move(dir.x, dir.z);
    api.faceAt(en.x, en.z);
    return;
  }

  // ---- fire the laser ----
  const angErr = Math.abs(V.angleTo(me.heading, toEn));
  const dPred = d - (approach - 2.0) * 0.72;
  const freeShot = en.stunned || en.airborne || (en.casting && en.casting.skill === 'smash');
  const safeShot = dPred > 6.4 || freeShot;
  const losToPred = !blocked(me.x, me.z, en.x + en.vx * 0.55, en.z + en.vz * 0.55, 0);

  if (laserReady && en.visible && losToPred && d <= 23.5 && angErr < 1.25 && safeShot) {
    api.use('laser');
    const pt = aimAt(0.65);
    api.faceAt(pt.x, pt.z);
    const dir = chooseMove(p, api, en, Math.max(d + 2, 14), true);
    api.move(dir.x, dir.z);
    if (p.t - lastSay > 6) { lastSay = p.t; api.say('eight arms, one beam'); }
    return;
  }

  // ---- kiting ----
  const cd = api.cooldown('laser');
  let desired = 15.5;
  if (cd > 1.1) desired = 17.5;
  if (d > 26) desired = 20;

  const wantLos = cd < 0.9 || d > 18;
  api.faceAt(en.x, en.z);

  if (!en.visible && d > 17) {
    api.moveTo(en.x, en.z);
    return;
  }

  const dir = chooseMove(p, api, en, desired, wantLos);
  api.move(dir.x, dir.z);
}
