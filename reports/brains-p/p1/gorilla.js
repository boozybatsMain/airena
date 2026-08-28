const OBST_DEF = [
  { x: -7, z: -3, hx: 1.2, hz: 3.5 },
  { x: 7, z: 3, hx: 1.2, hz: 3.5 },
  { x: 0, z: -10, hx: 3.6, hz: 1.2 },
  { x: 0, z: 10, hx: 3.6, hz: 1.2 },
  { x: -12.5, z: 11, hx: 1.6, hz: 1.6 },
  { x: 12.5, z: -11, hx: 1.6, hz: 1.6 }
];

let laserReady = 0;
let blinkReady = 0;
let lastDodge = 1;
let lastApproach = null;
let stuckUntil = -1;
let saidHello = false;

function segBox(ax, az, bx, bz, b, pad) {
  const minx = b.x - b.hx - pad, maxx = b.x + b.hx + pad;
  const minz = b.z - b.hz - pad, maxz = b.z + b.hz + pad;
  const dx = bx - ax, dz = bz - az;
  let t0 = 0, t1 = 1;
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

function blocked(ax, az, bx, bz, pad, obs) {
  for (const b of obs) if (segBox(ax, az, bx, bz, b, pad)) return true;
  return false;
}

function inArena(x, z, m) {
  return Math.abs(x) < 20 - m && Math.abs(z) < 20 - m;
}

function pickDodge(obs, me, en, toE) {
  const per = V.perp(toE);
  let best = null;
  for (const s of [1, -1]) {
    for (const mix of [-0.25, 0.25, 0.75]) {
      const dir = V.norm({ x: per.x * s + toE.x * mix, z: per.z * s + toE.z * mix });
      if (dir.x === 0 && dir.z === 0) continue;
      const px = me.x + dir.x * 3.4, pz = me.z + dir.z * 3.4;
      let sc = 0;
      if (!inArena(px, pz, 1.6)) sc -= 7;
      if (blocked(me.x, me.z, px, pz, me.radius + 0.15, obs)) sc -= 9;
      if (blocked(px, pz, en.x, en.z, 0, obs)) sc += 11;
      sc += mix * 1.4;
      if (s === lastDodge) sc += 1.0;
      if (!best || sc > best.sc) best = { sc, dir, s };
    }
  }
  if (best) lastDodge = best.s;
  return best ? best.dir : toE;
}

function pickApproach(obs, me, en, wantCover) {
  const d0 = Math.hypot(en.x - me.x, en.z - me.z);
  let best = null;
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8;
    const dir = { x: Math.sin(a), z: Math.cos(a) };
    for (const r of [3.2, 6.5]) {
      const px = me.x + dir.x * r, pz = me.z + dir.z * r;
      if (!inArena(px, pz, 1.7)) continue;
      if (blocked(me.x, me.z, px, pz, me.radius + 0.2, obs)) continue;
      const dToE = Math.hypot(en.x - px, en.z - pz);
      if (dToE > d0 + 1.5) continue;
      let sc = -dToE * 1.0;
      if (wantCover && blocked(px, pz, en.x, en.z, 0, obs)) sc += 6.5;
      if (r > 5) sc += 0.6;
      if (lastApproach && (dir.x * lastApproach.x + dir.z * lastApproach.z) > 0.75) sc += 1.2;
      if (!best || sc > best.sc) best = { sc, dir };
    }
  }
  if (best) lastApproach = best.dir;
  return best ? best.dir : null;
}

function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en.alive) return;
  const t = p.t;

  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      if (e.skill === 'laser') laserReady = t + 2.2;
      else if (e.skill === 'blink') blinkReady = t + 3.933;
    } else if (e.type === 'blocked') {
      stuckUntil = t + 0.7;
    }
  }

  if (!saidHello) { saidHello = true; api.say("come here, little squid"); }

  const obs = (p.arena && p.arena.obstacles && p.arena.obstacles.length) ? p.arena.obstacles : OBST_DEF;
  const d = en.dist;
  const toE = V.toward(me, en);
  const lasering = !!(en.casting && en.casting.skill === 'laser' && en.casting.telegraph);
  const laserArmed = t >= laserReady - 0.25;

  const enAirLong = en.airborne && !(en.casting && en.casting.phase === 'air' && en.casting.remaining < 0.28);

  // ---- while busy: keep steering, no new skills ----
  if (me.busy) {
    const c = me.casting;
    if (c && c.skill === 'charge' && c.phase === 'windup') {
      const tImp = c.remaining + Math.max(0, d - me.radius - en.radius) / 15;
      api.faceAt(en.x + en.vx * tImp, en.z + en.vz * tImp);
      api.move(toE.x, toE.z);
    } else if (me.airborne) {
      api.faceAt(en.x, en.z);
    } else {
      api.faceAt(en.x + en.vx * 0.18, en.z + en.vz * 0.18);
      if (lasering && d > 3.2 && en.visible) {
        const dd = pickDodge(obs, me, en, toE);
        api.move(dd.x, dd.z);
      } else {
        api.move(toE.x, toE.z);
      }
    }
    return;
  }

  // ---- facing ----
  api.faceAt(en.x + en.vx * 0.2, en.z + en.vz * 0.2);

  // ---- smash ----
  const ex = en.x + en.vx * 0.3, ez = en.z + en.vz * 0.3;
  const mx = me.x + me.vx * 0.16, mz = me.z + me.vz * 0.16;
  const pd = Math.hypot(ex - mx, ez - mz);
  const ang = Math.abs(V.angleTo(me.heading, V.toward(me, en)));
  const smashOK = api.ready('smash') && !enAirLong && !en.invulnerable &&
    pd <= 4.5 && ang < 1.25 && !blocked(me.x, me.z, en.x, en.z, 0, obs);

  if (smashOK) {
    api.use('smash');
    api.move(toE.x, toE.z);
    return;
  }

  // ---- charge ----
  if (api.ready('charge') && !en.invulnerable && d > 3.0 && d < 12.0 && en.visible) {
    const tImp = 0.3 + Math.max(0, d - me.radius - en.radius) / 15;
    const px = en.x + en.vx * tImp, pz = en.z + en.vz * tImp;
    const dir = V.norm({ x: px - me.x, z: pz - me.z });
    const need = Math.abs(V.angleTo(me.heading, dir));
    const clear = !blocked(me.x, me.z, px, pz, 1.0, obs);
    const worth = lasering || d < 9.5 || !laserArmed;
    if (clear && worth) {
      if (need < 0.85) {
        api.use('charge');
        api.faceAt(px, pz);
        api.move(toE.x, toE.z);
        return;
      } else {
        api.faceAt(px, pz);
      }
    }
  }

  // ---- movement ----
  if (lasering && en.visible && d > 3.0) {
    const dd = pickDodge(obs, me, en, toE);
    api.move(dd.x, dd.z);
    return;
  }

  if (d < 6.0) {
    // stay glued in melee
    if (d < 2.2) {
      const side = V.perp(toE);
      api.move(toE.x * 0.6 + side.x * lastDodge * 0.5, toE.z * 0.6 + side.z * lastDodge * 0.5);
    } else {
      api.move(toE.x, toE.z);
    }
    return;
  }

  if (t < stuckUntil || !en.visible) {
    api.moveTo(en.x, en.z);
    return;
  }

  const wantCover = laserArmed && d > 7.5;
  const ap = pickApproach(obs, me, en, wantCover);
  if (ap) api.move(ap.x, ap.z);
  else api.moveTo(en.x, en.z);
}
