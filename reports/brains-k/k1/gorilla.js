const SMASH_REACH = 5.15;
let jinkSign = 1;
let jinkFlipAt = 0;
let laserReadyAt = 0;
let useMoveToUntil = 0;
let saidHello = false;
let lastChargeAt = -99;

function angErrTo(me, x, z) {
  const dir = { x: x - me.x, z: z - me.z };
  return Math.abs(V.angleTo(me.heading, dir));
}

function coverPoint(p, api) {
  const me = p.self, en = p.enemy;
  let best = null, bestCost = Infinity;
  for (const o of p.arena.obstacles) {
    const dx = o.x - en.x, dz = o.z - en.z;
    const L = Math.hypot(dx, dz) || 1;
    const ext = Math.max(o.hx, o.hz) + 2.0;
    const px = o.x + (dx / L) * ext, pz = o.z + (dz / L) * ext;
    if (Math.abs(px) > 18.5 || Math.abs(pz) > 18.5) continue;
    const path = api.pathTo(px, pz);
    if (!path) continue;
    const toEn = Math.hypot(px - en.x, pz - en.z);
    const cost = path.dist + toEn * 0.9;
    if (cost < bestCost) { bestCost = cost; best = { x: px, z: pz, dist: path.dist, toEn }; }
  }
  return best;
}

function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me || !en || !me.alive || !en.alive) return;
  const t = p.t;
  const d = en.dist;

  // ---- track enemy laser timing ----
  const ec = en.casting;
  if (ec && ec.skill === 'laser') {
    const start = t - (ec.elapsed || 0);
    if (start + 2.2 > laserReadyAt) laserReadyAt = start + 2.2;
  }
  for (const e of p.events) {
    if (e.type === 'enemyStarted' && e.skill === 'laser') laserReadyAt = t + 2.2;
    else if (e.type === 'blocked') useMoveToUntil = t + 0.7;
    else if (e.type === 'missed' && (e.reason === 'range' || e.reason === 'aim')) useMoveToUntil = 0;
  }

  if (!saidHello) { saidHello = true; api.say("Come here, little squid."); }

  const laserThreat = t >= laserReadyAt - 0.2;
  const enemyCastingLaser = !!(ec && ec.skill === 'laser' && ec.telegraph);

  // ---- aiming ----
  const leadT = 0.28;
  const lead = { x: en.x + en.vx * leadT * 0.6, z: en.z + en.vz * leadT * 0.6 };
  api.faceAt(lead.x, lead.z);

  // ---- if we are locked into something, just keep pushing forward ----
  if (me.busy) {
    const c = me.casting;
    if (c && (c.skill === 'smash' || c.skill === 'charge') && c.phase === 'windup') {
      const dir = V.toward(me, en);
      api.move(dir.x, dir.z);
    }
    return;
  }
  if (me.stunned || me.airborne) return;

  const myFrac = me.hp / me.maxHp, enFrac = en.hp / en.maxHp;
  const stalling = (t > 47 && myFrac > enFrac + 0.10);

  // ================= SKILLS =================
  let usedSkill = false;

  // --- SMASH ---
  if (api.ready('smash') && !en.invulnerable && !en.airborne) {
    const ep = { x: en.x + en.vx * 0.28 * 0.8, z: en.z + en.vz * 0.28 * 0.8 };
    const dp = V.dist(me, ep) - 0.35;
    const ae = angErrTo(me, ep.x, ep.z);
    if (dp <= 4.7 && ae < 0.95 && api.los(ep.x, ep.z)) {
      api.use('smash');
      const dir = V.toward(me, en);
      api.move(dir.x, dir.z);
      usedSkill = true;
    }
  }

  // --- CHARGE ---
  if (!usedSkill && api.ready('charge') && !en.invulnerable && en.visible) {
    const tImp = 0.28 + Math.max(0, d - me.radius - en.radius) / 15;
    const cp = { x: en.x + en.vx * tImp * 0.7, z: en.z + en.vz * tImp * 0.7 };
    const dir = V.toward(me, cp);
    let clear = true;
    if (dir.x !== 0 || dir.z !== 0) {
      const r = api.ray(dir.x, dir.z, Math.min(13, d + 1.5));
      if (r.hit && r.dist < d - 0.8) clear = false;
    } else clear = false;
    const interrupt = enemyCastingLaser && d < 11.5;
    const closer = d >= 3.0 && d <= 9.5 && !stalling;
    if (clear && (interrupt || closer) && d >= 2.2) {
      const ae = angErrTo(me, cp.x, cp.z);
      if (ae < 1.5) {
        api.use('charge', dir.x, dir.z);
        api.faceAt(cp.x, cp.z);
        lastChargeAt = t;
        usedSkill = true;
      }
    }
  }

  // ================= MOVEMENT =================
  let moved = false;

  // stalling: keep away, break line of sight, let the burn decide
  if (stalling && d > 4) {
    const cp = coverPoint(p, api);
    if (cp) { api.moveTo(cp.x, cp.z); moved = true; }
    else {
      const away = V.away(me, en);
      const tx = V.clamp ? me.x + away.x * 6 : me.x + away.x * 6;
      const tz = me.z + away.z * 6;
      api.moveTo(Math.max(-18, Math.min(18, tx)), Math.max(-18, Math.min(18, tz)));
      moved = true;
    }
  }

  // use cover while the laser is up and we are far
  if (!moved && d > 8.5 && laserThreat && en.visible) {
    const cp = coverPoint(p, api);
    if (cp && cp.toEn < d + 2.5 && cp.dist < d + 8) {
      api.moveTo(cp.x, cp.z);
      moved = true;
    }
  }

  if (!moved) {
    if (!en.visible || t < useMoveToUntil) {
      api.moveTo(en.x, en.z);
    } else {
      const jinking = laserThreat && d > 2.6;
      let dir = V.toward(me, en);
      if (jinking) {
        if (t > jinkFlipAt) { jinkSign = -jinkSign; jinkFlipAt = t + 0.35 + api.rand() * 0.45; }
        const ang = d > 7 ? 0.55 : (d > 3.5 ? 0.42 : 0.25);
        dir = V.rot(V.toward(me, en), jinkSign * ang);
        const r = api.ray(dir.x, dir.z, 2.6);
        if (r.hit && r.dist < 2.1) {
          jinkSign = -jinkSign;
          jinkFlipAt = t + 0.4;
          dir = V.rot(V.toward(me, en), jinkSign * ang);
          const r2 = api.ray(dir.x, dir.z, 2.6);
          if (r2.hit && r2.dist < 2.1) { api.moveTo(en.x, en.z); return; }
        }
      } else if (d < 2.4) {
        // stay glued, shoulder them around
        dir = V.rot(V.toward(me, en), jinkSign * 0.3);
      }
      api.move(dir.x, dir.z);
    }
  }
}
