// ===== Gorilla mind: close, pin, smash. =====

let lastLaser = -99;
let lastBlink = -99;
let prevDirX = 0, prevDirZ = 1;
let said = false;

function segBox(ax, az, bx, bz, box, pad) {
  const hx = Math.max(0.05, box.hx + pad), hz = Math.max(0.05, box.hz + pad);
  const minx = box.x - hx, maxx = box.x + hx, minz = box.z - hz, maxz = box.z + hz;
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dz = bz - az;
  if (Math.abs(dx) < 1e-9) { if (ax < minx || ax > maxx) return false; }
  else {
    let ta = (minx - ax) / dx, tb = (maxx - ax) / dx;
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    if (ta > t0) t0 = ta; if (tb < t1) t1 = tb;
    if (t0 > t1) return false;
  }
  if (Math.abs(dz) < 1e-9) { if (az < minz || az > maxz) return false; }
  else {
    let ta = (minz - az) / dz, tb = (maxz - az) / dz;
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    if (ta > t0) t0 = ta; if (tb < t1) t1 = tb;
    if (t0 > t1) return false;
  }
  return true;
}

function blocked(p, ax, az, bx, bz, pad) {
  const obs = p.arena.obstacles;
  for (let i = 0; i < obs.length; i++) {
    if (segBox(ax, az, bx, bz, obs[i], pad || 0)) return true;
  }
  return false;
}

function nearBlock(p, x, z, pad) {
  const obs = p.arena.obstacles;
  for (let i = 0; i < obs.length; i++) {
    const o = obs[i];
    if (Math.abs(x - o.x) < o.hx + pad && Math.abs(z - o.z) < o.hz + pad) return true;
  }
  return false;
}

function inArena(p, x, z, m) {
  const h = p.arena.half;
  return Math.abs(x) < h - m && Math.abs(z) < h - m;
}

function chargeAim(me, e) {
  let px = e.x, pz = e.z;
  for (let i = 0; i < 3; i++) {
    const dd = Math.hypot(px - me.x, pz - me.z);
    const t = 0.3 + Math.max(0, dd - 2.2) / 15;
    px = e.x + e.vx * t;
    pz = e.z + e.vz * t;
  }
  return { x: px, z: pz };
}

function pickApproach(p, me, e, exposePenalty) {
  const step = 2.6;
  const base = Math.atan2(e.x - me.x, e.z - me.z);
  let best = null, bestScore = -1e9;
  for (let i = 0; i < 16; i++) {
    const a = base + (i / 16) * Math.PI * 2;
    const dx = Math.sin(a), dz = Math.cos(a);
    const qx = me.x + dx * step, qz = me.z + dz * step;
    if (!inArena(p, qx, qz, 1.7)) continue;
    if (nearBlock(p, qx, qz, 1.55)) continue;
    if (blocked(p, me.x, me.z, qx, qz, 1.3)) continue;
    const nd = Math.hypot(qx - e.x, qz - e.z);
    let s = -nd;
    const exposed = !blocked(p, qx, qz, e.x, e.z, -0.3);
    if (exposed) s -= exposePenalty; else s += 2.0;
    s += 0.7 * (dx * prevDirX + dz * prevDirZ);
    if (s > bestScore) { bestScore = s; best = { x: dx, z: dz }; }
  }
  return best;
}

function think(p, api) {
  const me = p.self, e = p.enemy;
  if (!me || !me.alive) return;

  if (!said) { said = true; api.say("Come here, little squid."); }

  for (const ev of p.events) {
    if (ev.type === 'enemyStarted') {
      if (ev.skill === 'laser') lastLaser = p.t;
      else if (ev.skill === 'blink') lastBlink = p.t;
    }
  }
  if (e && e.casting && e.casting.skill === 'laser') {
    const st = p.t - (e.casting.elapsed || 0);
    if (st > lastLaser) lastLaser = st;
  }

  if (!e || !e.alive) { api.stop(); return; }

  const d = e.dist;
  const casting = me.casting;
  const phase = casting ? casting.phase : null;

  if (me.stunned) { api.faceAt(e.x, e.z); return; }

  // ---- committed phases ----
  if (casting && casting.skill === 'charge' && phase === 'windup') {
    const aim = chargeAim(me, e);
    api.faceAt(aim.x, aim.z);
    return;
  }
  if (casting && (phase === 'dash' || phase === 'air')) {
    api.faceAt(e.x, e.z);
    return;
  }
  if (casting && casting.skill === 'smash' && phase === 'windup') {
    const t = Math.max(0.03, Math.min(0.3, casting.remaining));
    const px = e.x + e.vx * t, pz = e.z + e.vz * t;
    api.faceAt(px, pz);
    if (d > 2.2) api.move(e.x - me.x, e.z - me.z); else api.stop();
    return;
  }

  const canAct = !me.busy && !me.airborne && !me.stunned;
  const angTo = (x, z) => Math.abs(V.angleTo(me.heading, { x: x - me.x, z: z - me.z }));
  const enemyTelegraphingLaser = !!(e.casting && e.casting.skill === 'laser' && e.casting.telegraph);

  if (canAct) {
    // ---- SMASH ----
    if (api.ready('smash') && !e.airborne && !e.invulnerable) {
      const px = e.x + e.vx * 0.3, pz = e.z + e.vz * 0.3;
      const pd = Math.hypot(px - me.x, pz - me.z);
      const closing = (me.vx * (e.x - me.x) + me.vz * (e.z - me.z)) > 0;
      const eff = pd - (closing ? 0.35 : 0);
      if (eff < 4.9 && d < 5.7 && angTo(px, pz) < 1.2 &&
          !blocked(p, me.x, me.z, e.x, e.z, 0)) {
        api.use('smash');
        api.faceAt(px, pz);
        return;
      }
    }

    // ---- CHARGE ----
    if (api.ready('charge') && !e.invulnerable && !(e.stunned && d < 5.5)) {
      const aim = chargeAim(me, e);
      const clear = !blocked(p, me.x, me.z, aim.x, aim.z, 0.85) &&
                    !blocked(p, me.x, me.z, e.x, e.z, 0.6);
      const wantClose = d > 5.0 && d < 11.5;
      const wantInterrupt = enemyTelegraphingLaser && d > 2.6 && d < 11.5;
      if (clear && (wantClose || wantInterrupt) && angTo(aim.x, aim.z) < 1.05) {
        api.use('charge');
        api.faceAt(aim.x, aim.z);
        return;
      }
    }
  }

  // ---- MOVEMENT ----
  const laserReady = (p.t - lastLaser) >= 2.1;
  const threat = (laserReady || enemyTelegraphingLaser) && e.visible;
  const straightClear = !blocked(p, me.x, me.z, e.x, e.z, 1.3);

  const myFrac = me.hp / me.maxHp;
  const hisFrac = e.hp / e.maxHp;
  let penalty = 5.0;
  if (myFrac < hisFrac) penalty = 2.2;
  if (p.t > 26) penalty = Math.min(penalty, 2.5);
  if (api.ready('charge') && d < 11.5) penalty = Math.min(penalty, 1.5);

  if (d < 6.8 || !threat) {
    if (straightClear) api.move(e.x - me.x, e.z - me.z);
    else api.moveTo(e.x, e.z);
    const n = V.norm({ x: e.x - me.x, z: e.z - me.z });
    prevDirX = n.x; prevDirZ = n.z;
  } else {
    const best = pickApproach(p, me, e, penalty);
    if (best) {
      api.move(best.x, best.z);
      prevDirX = best.x; prevDirZ = best.z;
    } else {
      api.moveTo(e.x, e.z);
    }
  }

  api.faceAt(e.x, e.z);
}
