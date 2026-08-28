const BOXES = [
  { x: -7, z: -3, hx: 1.2, hz: 3.5 },
  { x: 7, z: 3, hx: 1.2, hz: 3.5 },
  { x: 0, z: -10, hx: 3.6, hz: 1.2 },
  { x: 0, z: 10, hx: 3.6, hz: 1.2 },
  { x: -12.5, z: 11, hx: 1.6, hz: 1.6 },
  { x: 12.5, z: -11, hx: 1.6, hz: 1.6 }
];

let lastLaser = -99;
let lastBlink = -99;
let escapeUntil = -1;
let escapeSign = 1;
let orbitSign = 1;
let lastOrbitFlip = -99;
let saidOnce = false;

function pointInBox(x, z, pad) {
  for (const b of BOXES) {
    if (Math.abs(x - b.x) < b.hx + pad && Math.abs(z - b.z) < b.hz + pad) return true;
  }
  return false;
}

function segAABB(ax, az, bx, bz, minx, minz, maxx, maxz) {
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dz = bz - az;
  const ps = [-dx, dx, -dz, dz];
  const qs = [ax - minx, maxx - ax, az - minz, maxz - az];
  for (let i = 0; i < 4; i++) {
    const p = ps[i], q = qs[i];
    if (Math.abs(p) < 1e-9) {
      if (q < 0) return false;
    } else {
      const r = q / p;
      if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
      else { if (r < t0) return false; if (r < t1) t1 = r; }
    }
  }
  return true;
}

function segBlocked(ax, az, bx, bz, pad) {
  for (const b of BOXES) {
    if (segAABB(ax, az, bx, bz, b.x - b.hx - pad, b.z - b.hz - pad, b.x + b.hx + pad, b.z + b.hz + pad)) return true;
  }
  return false;
}

function predict(en, t) {
  return { x: en.x + en.vx * t, z: en.z + en.vz * t };
}

function pickPoint(me, en, step, want) {
  let best = null, bs = -1e9;
  for (let i = 0; i < 20; i++) {
    const a = i * Math.PI * 2 / 20;
    const dx = Math.sin(a), dz = Math.cos(a);
    const cx = me.x + dx * step, cz = me.z + dz * step;
    if (Math.abs(cx) > 18.4 || Math.abs(cz) > 18.4) continue;
    if (pointInBox(cx, cz, 1.5)) continue;
    if (segBlocked(me.x, me.z, cx, cz, 0.9)) continue;
    const cov = segBlocked(cx, cz, en.x, en.z, 0.15);
    const d = Math.hypot(cx - en.x, cz - en.z);
    let s = (cov ? 40 : 0) + (want === 'close' ? -d * 2 : d * 1.5);
    s -= Math.max(0, Math.abs(cx) - 15) * 3 + Math.max(0, Math.abs(cz) - 15) * 3;
    if (s > bs) { bs = s; best = { x: cx, z: cz, cov: cov }; }
  }
  return best;
}

function think(p, api) {
  const me = p.self, en = p.enemy;

  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      if (e.skill === 'laser') lastLaser = p.t;
      else if (e.skill === 'blink') lastBlink = p.t;
    } else if (e.type === 'blocked') {
      escapeUntil = p.t + 0.4;
      escapeSign = -escapeSign;
    }
  }

  if (!me.alive || !en || !en.alive) return;
  if (!saidOnce) { saidOnce = true; api.say("come here, little squid"); }
  if (me.stunned) return;

  const dist = en.dist;
  const tx = en.x - me.x, tz = en.z - me.z;
  const toEn = { x: tx, z: tz };

  // ---- locked-in phases ----
  if (me.casting) {
    const c = me.casting;
    if (c.skill === 'charge' && c.phase === 'windup') {
      const tt = Math.min(0.9, 0.3 + Math.max(0, dist - 2.3) / 15);
      const lp = predict(en, tt);
      api.face(lp.x - me.x, lp.z - me.z);
      return;
    }
    if (c.skill === 'smash') {
      api.faceAt(en.x, en.z);
      if (c.phase === 'windup' && dist > 2.5) api.move(tx, tz);
      return;
    }
    if (me.airborne || c.phase === 'dash') {
      api.faceAt(en.x, en.z);
      return;
    }
  }

  const canAct = !me.busy && !me.stunned && !me.airborne;

  // ---- targeting maths ----
  const predT = 0.3;
  const ep = predict(en, predT);
  const mp = { x: me.x + me.vx * predT, z: me.z + me.vz * predT };
  const pdist = Math.hypot(ep.x - mp.x, ep.z - mp.z);
  const ang = Math.abs(V.angleTo(me.heading, toEn));

  const enCastingLaser = !!(en.casting && en.casting.skill === 'laser' && en.casting.telegraph);
  const laserReady = (p.t - lastLaser) >= 2.05;

  let faceTarget = { x: en.x, z: en.z };
  let acted = false;

  // ---- offense ----
  if (canAct) {
    const enemyAir = en.airborne && !(en.casting && en.casting.remaining < 0.22);
    if (api.ready('smash') && pdist <= 5.0 && ang < 1.35 && !enemyAir && en.visible) {
      api.use('smash');
      acted = true;
    } else if (api.ready('charge') && dist > 2.9 && dist < 12.5 && en.visible) {
      const tt = Math.min(0.9, 0.3 + Math.max(0, dist - 2.3) / 15);
      const lp = predict(en, tt);
      const la = Math.abs(V.angleTo(me.heading, { x: lp.x - me.x, z: lp.z - me.z }));
      if (la < 0.95 && !segBlocked(me.x, me.z, lp.x, lp.z, 0.35)) {
        api.use('charge');
        faceTarget = lp;
        acted = true;
      }
    } else if (api.ready('smash') && pdist <= 5.15 && dist < 5.6 && ang < 1.1 && !en.airborne) {
      api.use('smash');
      acted = true;
    }
  }

  // ---- movement ----
  const myFrac = me.hp / me.maxHp;
  const enFrac = en.hp / en.maxHp;
  const kiting = p.t > 31.5 && myFrac > enFrac + 0.05;

  let moved = false;

  if (p.t < escapeUntil) {
    const perp = V.perp(V.norm(toEn));
    api.move(perp.x * escapeSign + V.norm(toEn).x * 0.3, perp.z * escapeSign + V.norm(toEn).z * 0.3);
    moved = true;
  } else if (kiting && dist < 14) {
    const pt = pickPoint(me, en, 4.2, 'far');
    if (pt) { api.move(pt.x - me.x, pt.z - me.z); }
    else { api.move(-tx, -tz); }
    moved = true;
  } else if (dist <= 6.0) {
    // brawl: close in, orbit a little so the beam has to track hard
    const dirn = V.norm(toEn);
    if (p.t - lastOrbitFlip > 1.6) {
      lastOrbitFlip = p.t;
      const perp = V.perp(dirn);
      const a = { x: me.x + perp.x * 3, z: me.z + perp.z * 3 };
      const b = { x: me.x - perp.x * 3, z: me.z - perp.z * 3 };
      const aBad = Math.abs(a.x) > 18 || Math.abs(a.z) > 18 || pointInBox(a.x, a.z, 1.4);
      const bBad = Math.abs(b.x) > 18 || Math.abs(b.z) > 18 || pointInBox(b.x, b.z, 1.4);
      if (aBad && !bBad) orbitSign = -1;
      else if (bBad && !aBad) orbitSign = 1;
      else orbitSign = api.rand() < 0.5 ? -1 : 1;
    }
    const perp = V.perp(dirn);
    const push = dist > 3.2 ? 1.0 : 0.45;
    api.move(dirn.x * push + perp.x * orbitSign * 0.65, dirn.z * push + perp.z * orbitSign * 0.65);
    moved = true;
  } else if (!en.visible) {
    api.moveTo(en.x, en.z);
    moved = true;
  } else if (enCastingLaser || (laserReady && dist > 8.5)) {
    const step = enCastingLaser ? Math.max(2.0, Math.min(4.0, (en.casting.remaining + 0.1) * 5.35)) : 4.0;
    const pt = pickPoint(me, en, step, 'close');
    if (pt) {
      api.move(pt.x - me.x, pt.z - me.z);
    } else {
      const dirn = V.norm(toEn);
      const perp = V.perp(dirn);
      api.move(dirn.x * 0.8 + perp.x * orbitSign, dirn.z * 0.8 + perp.z * orbitSign);
    }
    moved = true;
  } else {
    const dirn = V.norm(toEn);
    const perp = V.perp(dirn);
    const w = Math.sin(p.t * 2.4) * 0.45;
    api.move(dirn.x + perp.x * w, dirn.z + perp.z * w);
    moved = true;
  }

  if (!moved) api.moveTo(en.x, en.z);

  if (acted && faceTarget !== null && faceTarget.x !== en.x) {
    api.face(faceTarget.x - me.x, faceTarget.z - me.z);
  } else {
    const lead = predict(en, 0.28);
    api.faceAt(lead.x, lead.z);
  }
}
