const LASER_CAST = 0.55;

function insideBlock(obs, x, z, pad) {
  for (const o of obs) {
    if (Math.abs(x - o.x) < o.hx + pad && Math.abs(z - o.z) < o.hz + pad) return true;
  }
  return false;
}

function chooseDir(p, api, base) {
  const me = p.self;
  let best = null, bestS = -1e9;
  for (let i = 0; i < 12; i++) {
    const a = i * Math.PI / 6;
    const d = { x: Math.sin(a), z: Math.cos(a) };
    const r = api.ray(d.x, d.z, 5);
    const clear = Math.min(r && r.dist != null ? r.dist : 5, 5);
    let s = Math.min(clear, 3.5) * 1.1 + V.dot(d, base) * 6;
    if (clear < 1.3) s -= 14;
    const px = me.x + d.x * 4.0, pz = me.z + d.z * 4.0;
    const m = 18.0;
    if (Math.abs(px) > m) s -= (Math.abs(px) - m) * 5;
    if (Math.abs(pz) > m) s -= (Math.abs(pz) - m) * 5;
    const rad = Math.hypot(px, pz);
    if (rad > 16.5) s -= (rad - 16.5) * 2.0;
    if (s > bestS) { bestS = s; best = d; }
  }
  return best || base;
}

function blinkDir(p, api, prefer) {
  const me = p.self, en = p.enemy, obs = p.arena.obstacles;
  let best = prefer, bestS = -1e9;
  for (let i = 0; i < 12; i++) {
    const a = i * Math.PI / 6;
    const d = { x: Math.sin(a), z: Math.cos(a) };
    const x = me.x + d.x * 7.2, z = me.z + d.z * 7.2;
    let s = Math.hypot(x - en.x, z - en.z) * 0.9;
    if (Math.abs(x) > 18.2 || Math.abs(z) > 18.2) s -= 14;
    if (insideBlock(obs, x, z, 1.3)) s -= 9;
    s += V.dot(d, prefer) * 3.0;
    if (s > bestS) { bestS = s; best = d; }
  }
  return best;
}

function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive) return;

  // ---------- memory / event digest ----------
  let orbit = api.recall('orbit', 1);
  let flipped = false;
  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      if (e.skill === 'charge') api.remember('lastChargeT', p.t);
      else if (e.skill === 'smash') api.remember('lastSmashT', p.t);
    } else if (e.type === 'enemyCommitted') {
      api.remember('commitT', p.t);
    } else if (e.type === 'blocked' && !flipped) {
      orbit = -orbit; flipped = true;
    } else if (e.type === 'damaged') {
      api.remember('hurtT', p.t);
    }
  }
  if (!flipped && api.rand() < 0.012) { orbit = -orbit; flipped = true; }
  if (flipped) api.remember('orbit', orbit);

  if (me.airborne || me.stunned) return;

  const lastChargeT = api.recall('lastChargeT', -99);
  const lastSmashT = api.recall('lastSmashT', -99);
  const chargeAge = p.t - lastChargeT;
  const smashAge = p.t - lastSmashT;
  const chargeReady = chargeAge > 4.35;

  // ---------- enemy action state ----------
  let ecSkill = null, ecPhase = null, ecRem = 0;
  if (en.casting && en.casting.skill) {
    ecSkill = en.casting.skill;
    ecPhase = en.casting.phase;
    ecRem = en.casting.remaining || 0;
  } else {
    if (chargeAge < 0.34) { ecSkill = 'charge'; ecPhase = 'windup'; ecRem = 0.34 - chargeAge; }
    else if (chargeAge < 1.18 && en.speed > 9) { ecSkill = 'charge'; ecPhase = 'dash'; }
    else if (smashAge < 0.28) { ecSkill = 'smash'; ecPhase = 'windup'; ecRem = 0.28 - smashAge; }
  }
  if (en.speed > 9.5) { ecSkill = 'charge'; ecPhase = 'dash'; }

  const toEn = V.toward(me, en);
  const away = { x: -toEn.x, z: -toEn.z };
  const tangRaw = V.perp(toEn);
  const tang = { x: tangRaw.x * orbit, z: tangRaw.z * orbit };
  const d = en.dist;

  // ---------- CHARGE DODGE ----------
  if (ecSkill === 'charge' && ecPhase === 'dash') {
    const cd = V.fromHeading(en.heading);
    const rel = { x: me.x - en.x, z: me.z - en.z };
    const along = rel.x * cd.x + rel.z * cd.z;
    const lat = rel.x * cd.z - rel.z * cd.x;
    if (along > -1.5 && along < 14 && Math.abs(lat) < 3.2) {
      const sgn = lat >= 0 ? 1 : -1;
      const side = { x: cd.z * sgn, z: -cd.x * sgn };
      if (api.ready('blink')) {
        const bd = blinkDir(p, api, side);
        api.use('blink', bd.x, bd.z);
        api.face(cd.x, cd.z);
        return;
      }
      const dir = chooseDir(p, api, side);
      api.move(dir.x, dir.z);
      api.faceAt(en.x, en.z);
      return;
    }
    // out of the lane: strafe wider anyway
    const sgn2 = lat >= 0 ? 1 : -1;
    const side2 = { x: cd.z * sgn2, z: -cd.x * sgn2 };
    const dir2 = chooseDir(p, api, side2);
    api.move(dir2.x, dir2.z);
    api.faceAt(en.x, en.z);
    return;
  }

  if (ecSkill === 'charge' && ecPhase === 'windup') {
    // keep moving laterally so their locked heading misses
    const base = V.norm({ x: tang.x * 1.0 + away.x * 0.55, z: tang.z * 1.0 + away.z * 0.55 });
    const dir = chooseDir(p, api, base);
    api.move(dir.x, dir.z);
    api.faceAt(en.x, en.z);
    return;
  }

  // ---------- SMASH DODGE ----------
  const smashReach = 2.5 + en.radius + me.radius + 0.4;
  if (ecSkill === 'smash' && ecPhase === 'windup' && d < smashReach + 1.2 && !me.busy) {
    const base = V.norm({ x: away.x + tang.x * 0.7, z: away.z + tang.z * 0.7 });
    const dir = chooseDir(p, api, base);
    api.move(dir.x, dir.z);
    api.faceAt(en.x, en.z);
    if (api.ready('blink') && (!chargeReady || d < 3.6)) {
      const bd = blinkDir(p, api, base);
      api.use('blink', bd.x, bd.z);
    } else if (api.ready('jump')) {
      api.use('jump');
    }
    return;
  }

  // ---------- EMERGENCY SPACING ----------
  if (!me.busy && api.ready('blink') && (d < 4.2 || (d < 7.0 && !chargeReady))) {
    const base = V.norm({ x: away.x + tang.x * 0.5, z: away.z + tang.z * 0.5 });
    const bd = blinkDir(p, api, base);
    api.use('blink', bd.x, bd.z);
    api.move(base.x, base.z);
    api.faceAt(en.x, en.z);
    return;
  }

  // ---------- AIM ----------
  const casting = me.casting && me.casting.skill === 'laser';
  if (casting) {
    let T = 0;
    if (me.casting.telegraph) T = Math.max(0, Math.min(LASER_CAST, me.casting.remaining || 0));
    const lead = { x: en.x + en.vx * T * 0.85, z: en.z + en.vz * T * 0.85 };
    api.faceAt(lead.x, lead.z);
  } else {
    const lead = { x: en.x + en.vx * 0.35, z: en.z + en.vz * 0.35 };
    api.faceAt(lead.x, lead.z);
  }

  // ---------- FIRE ----------
  const myFrac = me.hp / me.maxHp, enFrac = en.hp / en.maxHp;
  const stalling = p.timeLeft < 15 && myFrac > enFrac + 0.05;
  if (!me.busy && api.ready('laser') && en.visible && d < 21.5) {
    const ang = Math.abs(V.angleTo(me.heading, toEn));
    const safeToCast = d > 6.0 && (!chargeReady || d > 9.0 || api.ready('blink'));
    if (ang < 1.5 && safeToCast && !(stalling && d < 12)) {
      api.use('laser');
    }
  }

  // ---------- MOVEMENT ----------
  let desired = 12.5;
  if (stalling) desired = 16;
  if (chargeReady) desired = Math.max(desired, 13.5);

  let base;
  if (!en.visible && d > 8) {
    let wp = null;
    const path = api.pathTo(en.x, en.z);
    if (path && path.points && path.points.length) {
      for (const q of path.points) {
        if (Math.hypot(q.x - me.x, q.z - me.z) > 1.5) { wp = q; break; }
      }
    }
    const t2 = wp ? V.toward(me, wp) : toEn;
    base = V.norm({ x: t2.x + tang.x * 0.25, z: t2.z + tang.z * 0.25 });
  } else if (d < desired - 1.5) {
    base = V.norm({ x: away.x * 1.0 + tang.x * 0.75, z: away.z * 1.0 + tang.z * 0.75 });
  } else if (d > desired + 3.5) {
    base = V.norm({ x: toEn.x * 1.0 + tang.x * 0.45, z: toEn.z * 1.0 + tang.z * 0.45 });
  } else {
    base = V.norm({ x: tang.x + away.x * 0.2, z: tang.z + away.z * 0.2 });
  }

  const dir = chooseDir(p, api, base);
  api.move(dir.x, dir.z);
}
