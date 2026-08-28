function segBlocked(ax, az, bx, bz, obs, margin) {
  const dx = bx - ax, dz = bz - az;
  for (const o of obs) {
    const minx = o.x - o.hx - margin, maxx = o.x + o.hx + margin;
    const minz = o.z - o.hz - margin, maxz = o.z + o.hz + margin;
    let t0 = 0, t1 = 1, bad = false;
    if (Math.abs(dx) < 1e-9) {
      if (ax < minx || ax > maxx) bad = true;
    } else {
      let ta = (minx - ax) / dx, tb = (maxx - ax) / dx;
      if (ta > tb) { const q = ta; ta = tb; tb = q; }
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
      if (t0 > t1) bad = true;
    }
    if (bad) continue;
    if (Math.abs(dz) < 1e-9) {
      if (az < minz || az > maxz) bad = true;
    } else {
      let ta = (minz - az) / dz, tb = (maxz - az) / dz;
      if (ta > tb) { const q = ta; ta = tb; tb = q; }
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
      if (t0 > t1) bad = true;
    }
    if (bad) continue;
    return true;
  }
  return false;
}

function nrm(x, z) {
  const l = Math.hypot(x, z);
  if (l < 1e-9) return { x: 0, z: 0 };
  return { x: x / l, z: z / l };
}

function think(p, api) {
  const s = p.self, e = p.enemy;
  if (!s.alive) return;
  const t = p.t;
  const obs = p.arena.obstacles;
  const HALF = p.arena.half;

  // ---------- memory of enemy charge timing ----------
  let chgAt = api.recall('chgAt', -99);
  for (const ev of p.events) {
    if (ev.type === 'enemyStarted' && ev.skill === 'charge') { chgAt = t; }
    if (ev.type === 'enemyCommitted' && ev.skill === 'charge') { chgAt = Math.max(chgAt, t - 0.3); }
  }
  if (e.casting && e.casting.skill === 'charge') {
    const st = t - (e.casting.elapsed || 0);
    if (st > chgAt + 0.4) chgAt = st;
  }
  if (chgAt !== api.recall('chgAt', -99)) api.remember('chgAt', chgAt);
  const chargeCd = Math.max(0, 6 - (t - chgAt));

  const dist = e.dist;
  const eCast = e.casting;
  const chargeWind = !!(eCast && eCast.skill === 'charge' && eCast.phase === 'windup');
  const chargeDash = !!(eCast && eCast.skill === 'charge' && (eCast.phase === 'dash' || (eCast.phase !== 'windup' && eCast.phase !== 'recover' && eCast.skill === 'charge')));
  const smashTele = !!(eCast && eCast.skill === 'smash' && eCast.telegraph);
  const eHelpless = e.stunned || (eCast && eCast.phase === 'recover');

  // ---------- facing target (predict) ----------
  let lead = 0.15;
  if (s.casting && s.casting.skill === 'laser' && s.casting.telegraph) lead = Math.max(0, s.casting.remaining);
  else if (api.ready('laser')) lead = 0.5;
  let px = e.x + e.vx * lead, pz = e.z + e.vz * lead;
  api.faceAt(px, pz);

  const busy = s.busy || s.stunned || s.airborne;

  // ---------- dash threat geometry ----------
  let dashDir;
  if (chargeDash && (Math.abs(e.vx) + Math.abs(e.vz)) > 1) dashDir = nrm(e.vx, e.vz);
  else dashDir = { x: Math.sin(e.heading), z: Math.cos(e.heading) };
  const relx = s.x - e.x, relz = s.z - e.z;
  const along = relx * dashDir.x + relz * dashDir.z;
  const side = relx * dashDir.z - relz * dashDir.x;
  const dashThreat = along > -1.5 && along < 13.5 && Math.abs(side) < 3.2;

  // ---------- emergency reactions ----------
  if (!busy) {
    // dodge an incoming charge
    if (api.ready('blink') && ((chargeDash && dashThreat) || (chargeWind && eCast.remaining < 0.1 && dist < 8))) {
      const away = nrm(relx, relz);
      const c1 = nrm(dashDir.z * 1 + away.x * 0.45, -dashDir.x * 1 + away.z * 0.45);
      const c2 = nrm(-dashDir.z * 1 + away.x * 0.45, dashDir.x * 1 + away.z * 0.45);
      const score = (c) => {
        const lx = s.x + c.x * 6.5, lz = s.z + c.z * 6.5;
        let sc = 0;
        if (Math.abs(lx) > HALF - 1.5 || Math.abs(lz) > HALF - 1.5) sc -= 8;
        sc += Math.hypot(lx - e.x, lz - e.z) * 0.4;
        const dot = (lx - e.x) * dashDir.x + (lz - e.z) * dashDir.z;
        const sd = Math.abs((lx - e.x) * dashDir.z - (lz - e.z) * dashDir.x);
        sc += Math.min(sd, 8) * 1.2;
        if (dot < 0) sc += 2;
        return sc;
      };
      const best = score(c1) >= score(c2) ? c1 : c2;
      api.use('blink', best.x, best.z);
      api.move(best.x, best.z);
      return;
    }
    // dodge a smash by hopping over the sweep
    if (smashTele && dist < 5.6) {
      const rem = eCast.remaining;
      if (api.ready('jump') && rem >= 0.13 && rem <= 0.62) {
        const away = nrm(relx, relz);
        api.move(away.x, away.z);
        api.use('jump');
        return;
      }
      if (api.ready('blink') && chargeCd > 2.0) {
        const away = nrm(relx * 1 + dashDir.z * 0.5, relz * 1 - dashDir.x * 0.5);
        api.use('blink', away.x, away.z);
        api.move(away.x, away.z);
        return;
      }
    }
    // shove-off blink when cornered in melee
    if (dist < 3.0 && api.ready('blink') && chargeCd > 2.5 && !api.ready('laser')) {
      const away = nrm(relx, relz);
      api.use('blink', away.x, away.z);
      api.move(away.x, away.z);
      return;
    }
  }

  // ---------- endgame: protect an hp-fraction lead ----------
  const myFrac = s.hp / s.maxHp, hisFrac = e.hp / e.maxHp;
  const stalling = p.timeLeft < 14 && myFrac > hisFrac + 0.02;

  // ---------- laser ----------
  const safeCharge = chargeCd > 0.6 || dist > 13.5 || eHelpless;
  const safeSmash = dist > 5.7 || eHelpless;
  if (!busy && !stalling && api.ready('laser') && e.visible && dist <= 22.5 &&
      safeCharge && safeSmash && !chargeWind && !chargeDash && !e.airborne) {
    api.use('laser');
  }

  // ---------- movement ----------
  let desired;
  if (stalling) desired = 17;
  else if (chargeCd < 1.2) desired = 13.5;
  else if (chargeCd < 3.0) desired = 11.0;
  else desired = 9.0;
  if (dashDangerBoost(chargeDash, dashThreat)) desired = 16;

  const wantLos = !stalling && (api.ready('laser') || api.cooldown('laser') < 0.6) && chargeCd > 0.6;
  const hideLos = stalling || (api.cooldown('laser') > 0.9 && dist < 9 && chargeCd < 1.5);

  // seek line of sight if we cannot see them and want to shoot
  if (!e.visible && !stalling && dist > 6.5 && (api.cooldown('laser') < 1.0 || dist > 13)) {
    let bestPt = null, bestSc = -1e9;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const tx = e.x + Math.sin(a) * 9.5, tz = e.z + Math.cos(a) * 9.5;
      if (Math.abs(tx) > HALF - 1.6 || Math.abs(tz) > HALF - 1.6) continue;
      if (segBlocked(tx, tz, e.x, e.z, obs, 0)) continue;
      const d = Math.hypot(tx - s.x, tz - s.z);
      const sc = -d;
      if (sc > bestSc) { bestSc = sc; bestPt = { x: tx, z: tz }; }
    }
    if (bestPt) {
      api.moveTo(bestPt.x, bestPt.z);
      api.remember('pdir', nrm(bestPt.x - s.x, bestPt.z - s.z));
      return;
    }
  }

  const prev = api.recall('pdir', { x: 0, z: 0 });
  let bestDir = null, bestScore = -1e9;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const d = { x: Math.sin(a), z: Math.cos(a) };
    const probe = api.ray(d.x, d.z, 4.2);
    const clear = Math.max(0, probe.dist - s.radius);
    if (clear < 0.35) continue;
    const step = Math.min(3.0, clear);
    const fx = s.x + d.x * step, fz = s.z + d.z * step;
    const ed = Math.hypot(fx - e.x, fz - e.z);
    let sc = -Math.abs(ed - desired) * 1.25;
    const edge = HALF - Math.max(Math.abs(fx), Math.abs(fz));
    if (edge < 5) sc -= (5 - edge) * 1.6;
    sc += Math.min(clear, 4) * 0.4;
    sc += (d.x * prev.x + d.z * prev.z) * 1.1;
    const losF = !segBlocked(fx, fz, e.x, e.z, obs, 0);
    if (wantLos && losF) sc += 1.4;
    if (hideLos && !losF) sc += 2.2;
    // avoid walking into the charge lane
    if ((chargeWind || chargeDash) && dist < 14) {
      const sd = Math.abs((fx - e.x) * dashDir.z - (fz - e.z) * dashDir.x);
      const fo = (fx - e.x) * dashDir.x + (fz - e.z) * dashDir.z;
      if (fo > 0 && fo < 13) sc += Math.min(sd, 5) * 0.9;
    }
    if (sc > bestScore) { bestScore = sc; bestDir = d; }
  }

  if (bestDir) {
    api.move(bestDir.x, bestDir.z);
    api.remember('pdir', bestDir);
  } else {
    const away = nrm(relx, relz);
    api.move(away.x, away.z);
  }
}

function dashDangerBoost(chargeDash, dashThreat) {
  return chargeDash && dashThreat;
}
