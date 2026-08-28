function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me || !me.alive) return;

  // ---- event digestion ----
  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      mem.lastEnemySkill = e.skill;
      mem.lastEnemySkillT = p.t;
      if (e.skill === 'charge') mem.chargeSeenT = p.t;
      if (e.skill === 'smash') mem.smashSeenT = p.t;
    } else if (e.type === 'enemyCommitted') {
      mem.committedT = p.t;
    } else if (e.type === 'damaged') {
      mem.lastHitT = p.t;
    } else if (e.type === 'blocked') {
      mem.blockedT = p.t;
    }
  }

  const obs = (p.arena && p.arena.obstacles) ? p.arena.obstacles : [];
  const HALF = (p.arena && p.arena.half) ? p.arena.half : 20;
  const dist = en ? en.dist : 99;
  const hpFrac = me.hp / me.maxHp;

  if (!en || !en.alive) { api.stop(); return; }

  // predicted enemy position (short horizon)
  const enP = { x: en.x + en.vx * 0.35, z: en.z + en.vz * 0.35 };

  // ---------------- threat assessment ----------------
  const cast = en.casting || null;
  let dashing = false, dashDir = null, windingCharge = false, smashing = false;
  if (cast) {
    if (cast.skill === 'charge') {
      if (cast.phase === 'dash') {
        dashing = true;
        const sp = Math.hypot(en.vx, en.vz);
        dashDir = sp > 0.5 ? { x: en.vx / sp, z: en.vz / sp } : V.fromHeading(en.heading);
      } else if (cast.telegraph) {
        windingCharge = true;
      }
    } else if (cast.skill === 'smash' && cast.telegraph) {
      smashing = true;
    }
  }

  // am I on the dash line?
  let dashThreat = false, dashSide = 1;
  if (dashing && dashDir) {
    const rel = { x: me.x - en.x, z: me.z - en.z };
    const along = rel.x * dashDir.x + rel.z * dashDir.z;
    const cross = rel.x * dashDir.z - rel.z * dashDir.x; // signed lateral
    const lateral = Math.abs(cross);
    if (along > -1 && along < 14 && lateral < 3.2) {
      dashThreat = true;
      dashSide = cross >= 0 ? 1 : -1;
    }
  }

  const stunnedOrLocked = me.stunned || me.airborne;

  // ---------------- reactive defense ----------------
  if (!stunnedOrLocked) {
    // dodge an incoming charge with blink
    if (dashThreat && api.ready('blink') && !me.busy) {
      // perpendicular, pushed further off the line, choose the roomier side
      const perpA = { x: dashDir.z * dashSide, z: -dashDir.x * dashSide };
      const perpB = { x: -perpA.x, z: -perpA.z };
      const a = scoreBlink(me, perpA, en, obs, HALF);
      const b = scoreBlink(me, perpB, en, obs, HALF);
      const pick = a >= b ? perpA : perpB;
      api.use('blink', pick.x, pick.z);
      api.move(pick.x, pick.z);
      api.faceAt(enP.x, enP.z);
      return;
    }
    // smash about to land and I'm in range -> hop over the sweep
    if (smashing && dist < 6.4 && api.ready('jump') && !me.busy) {
      const away = V.away(me, en);
      api.move(away.x, away.z);
      api.use('jump');
      api.faceAt(en.x, en.z);
      return;
    }
    // he is on top of me: teleport out
    if (!dashing && dist < 5.6 && api.ready('blink') && !me.busy && !me.casting) {
      const dir = bestEscapeDir(me, en, obs, HALF, api);
      api.use('blink', dir.x, dir.z);
      api.move(dir.x, dir.z);
      api.faceAt(en.x, en.z);
      return;
    }
  }

  // ---------------- desired stand-off ----------------
  let desired = 16.5;
  if (hpFrac < 0.35) desired = 19;
  if (windingCharge || dashing) desired = 20;
  if (!en.visible) desired = 11;
  if (dist > 24) desired = 18;

  const laserCd = api.cooldown('laser');
  const wantLOS = laserCd < 0.75 && dist < 23.5;

  // ---------------- movement ----------------
  if (!stunnedOrLocked) {
    let mv = null;
    if (dashThreat && dashDir) {
      const perpA = { x: dashDir.z * dashSide, z: -dashDir.x * dashSide };
      const back = V.away(me, en);
      mv = V.norm({ x: perpA.x * 1.0 + back.x * 0.45, z: perpA.z * 1.0 + back.z * 0.45 });
      if (!openEnough(me, mv, obs, HALF)) mv = null;
    } else if (windingCharge && dist < 18) {
      // sidestep so the lock-in points at empty floor
      const t = V.toward(en, me);
      const side = (mem.sideBias || 1);
      const perp = { x: t.z * side, z: -t.x * side };
      mv = V.norm({ x: perp.x + t.x * 0.7, z: perp.z + t.z * 0.7 });
      if (!openEnough(me, mv, obs, HALF)) { mem.sideBias = -(mem.sideBias || 1); mv = null; }
    }
    if (!mv) mv = pickDirection(p, api, obs, HALF, desired, wantLOS, enP);
    mem.prev = mv;
    api.move(mv.x, mv.z);
  }

  // ---------------- facing ----------------
  let tFire = 0.667;
  if (me.casting && me.casting.skill === 'laser' && me.casting.phase === 'windup') {
    tFire = Math.max(0, me.casting.remaining);
  }
  const leadK = dashing ? 1.0 : 0.8;
  const aim = { x: en.x + en.vx * tFire * leadK, z: en.z + en.vz * tFire * leadK };
  api.faceAt(aim.x, aim.z);

  // ---------------- laser ----------------
  if (!stunnedOrLocked && !me.busy && api.ready('laser')) {
    const angErr = Math.abs(V.angleTo(me.heading, V.toward(me, aim)));
    const safe = dist > 6.2 || en.stunned || dashing === false && dist > 5.0;
    const notAboutToBeHit = !(smashing && dist < 6.5);
    if (en.visible && dist < 23.0 && dist > 2.0 && angErr < 1.15 && safe && notAboutToBeHit) {
      api.use('laser');
    }
  }

  if (p.tick % 150 === 0) {
    api.say(hpFrac > 0.6 ? "eight arms, one beam" : "still inking");
  }
}

// ------------------------------------------------------------------
const mem = { prev: { x: 0, z: 1 }, sideBias: 1 };

function segBox(ax, az, bx, bz, minx, minz, maxx, maxz) {
  const dx = bx - ax, dz = bz - az;
  let t0 = 0, t1 = 1;
  const ps = [-dx, dx, -dz, dz];
  const qs = [ax - minx, maxx - ax, az - minz, maxz - az];
  for (let i = 0; i < 4; i++) {
    const pp = ps[i], qq = qs[i];
    if (pp === 0) { if (qq < 0) return false; }
    else {
      const r = qq / pp;
      if (pp < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
      else { if (r < t0) return false; if (r < t1) t1 = r; }
    }
  }
  return true;
}

function clearLine(ax, az, bx, bz, obs, pad) {
  const q = pad || 0;
  for (const o of obs) {
    if (segBox(ax, az, bx, bz, o.x - o.hx - q, o.z - o.hz - q, o.x + o.hx + q, o.z + o.hz + q)) return false;
  }
  return true;
}

function insideBox(x, z, obs, pad) {
  for (const o of obs) {
    if (x > o.x - o.hx - pad && x < o.x + o.hx + pad && z > o.z - o.hz - pad && z < o.z + o.hz + pad) return true;
  }
  return false;
}

function openEnough(me, d, obs, HALF) {
  const nx = me.x + d.x * 3.0, nz = me.z + d.z * 3.0;
  if (Math.abs(nx) > HALF - 1.4 || Math.abs(nz) > HALF - 1.4) return false;
  if (insideBox(nx, nz, obs, 1.35)) return false;
  if (!clearLine(me.x, me.z, nx, nz, obs, 1.15)) return false;
  return true;
}

function scoreBlink(me, d, en, obs, HALF) {
  const L = 7.2;
  let nx = me.x + d.x * L, nz = me.z + d.z * L;
  nx = Math.max(-HALF + 1.3, Math.min(HALF - 1.3, nx));
  nz = Math.max(-HALF + 1.3, Math.min(HALF - 1.3, nz));
  let s = Math.hypot(en.x - nx, en.z - nz);
  if (insideBox(nx, nz, obs, 1.2)) s -= 6;
  const edge = HALF - Math.max(Math.abs(nx), Math.abs(nz));
  if (edge < 3.5) s -= (3.5 - edge) * 2.5;
  return s;
}

function bestEscapeDir(me, en, obs, HALF, api) {
  let best = V.away(me, en), bs = -1e9;
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI * 2 / 16;
    const d = { x: Math.sin(a), z: Math.cos(a) };
    const s = scoreBlink(me, d, en, obs, HALF);
    if (s > bs) { bs = s; best = d; }
  }
  return best;
}

function pickDirection(p, api, obs, HALF, desired, wantLOS, enP) {
  const me = p.self, en = p.enemy;
  const STEP = 3.2;
  let best = mem.prev || { x: 0, z: 1 }, bs = -1e9;
  const prev = mem.prev || { x: 0, z: 0 };
  const laserCd = api.cooldown('laser');
  const hiding = !wantLOS && laserCd > 0.9 && en.dist < 15;

  for (let i = 0; i < 24; i++) {
    const a = i * Math.PI * 2 / 24;
    const d = { x: Math.sin(a), z: Math.cos(a) };
    const nx = me.x + d.x * STEP, nz = me.z + d.z * STEP;
    let s = 0;

    // walls
    const edge = HALF - Math.max(Math.abs(nx), Math.abs(nz));
    if (edge < 4.5) s -= (4.5 - edge) * (4.5 - edge) * 2.2;
    if (edge < 1.2) s -= 300;

    // blocks
    if (insideBox(nx, nz, obs, 1.3)) s -= 400;
    if (!clearLine(me.x, me.z, nx, nz, obs, 1.1)) s -= 260;

    // range keeping
    const nd = Math.hypot(enP.x - nx, enP.z - nz);
    s -= Math.abs(nd - desired) * 4.0;

    // line of sight preference
    const clear = clearLine(nx, nz, en.x, en.z, obs, 0);
    if (wantLOS) s += clear ? 22 : -22;
    else if (hiding) s += clear ? -12 : 14;

    // pull toward the middle of the arena a little
    const cd = Math.hypot(nx, nz);
    s -= cd * 0.35;

    // momentum
    s += (d.x * prev.x + d.z * prev.z) * 7.0;

    if (s > bs) { bs = s; best = d; }
  }
  return best;
}
