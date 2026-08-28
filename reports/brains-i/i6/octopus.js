function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en.alive) return;

  // ---- event scanning ----
  let enemyCharging = false, enemyCommitted = false;
  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      api.remember('lastEnemySkill', e.skill);
      api.remember('lastEnemySkillT', p.t);
      if (e.skill === 'charge') api.remember('chargeStart', p.t);
      if (e.skill === 'smash') api.remember('smashStart', p.t);
    }
    if (e.type === 'enemyCommitted') api.remember('chargeCommitT', p.t);
    if (e.type === 'damaged') api.remember('lastHitT', p.t);
  }

  const cast = me.casting;
  const ecast = en.casting;
  const dist = en.dist;
  const toEn = V.toward(me, en);
  const away = V.away(me, en);

  // Enemy threat state
  const enSkill = ecast ? ecast.skill : null;
  const enPhase = ecast ? ecast.phase : null;
  const chargeWindup = enSkill === 'charge' && enPhase === 'windup';
  const chargeDash = enSkill === 'charge' && enPhase === 'dash';
  const smashWindup = enSkill === 'smash' && enPhase === 'windup';

  // ---- helpers ----
  const clampArena = (v) => {
    const lim = 18.5;
    return { x: Math.max(-lim, Math.min(lim, v.x)), z: Math.max(-lim, Math.min(lim, v.z)) };
  };

  function inBlock(x, z, pad) {
    for (const o of p.arena.obstacles) {
      if (Math.abs(x - o.x) < o.hx + pad && Math.abs(z - o.z) < o.hz + pad) return true;
    }
    return false;
  }

  function safePoint(x, z) {
    const lim = 18.5;
    x = Math.max(-lim, Math.min(lim, x));
    z = Math.max(-lim, Math.min(lim, z));
    return { x, z };
  }

  // ---- imminent danger: charge dash aimed at me ----
  let dashDanger = false;
  if (chargeDash || (chargeWindup && ecast.remaining < 0.09)) {
    const eh = en.heading;
    const dir = V.fromHeading(eh);
    const rel = { x: me.x - en.x, z: me.z - en.z };
    const along = V.dot(rel, dir);
    const lat = Math.abs(rel.x * dir.z - rel.z * dir.x);
    if (along > -1 && along < 13.5 && lat < 2.8) dashDanger = true;
  }

  // smash danger: in cone and close
  let smashDanger = false;
  if (smashWindup) {
    const ang = Math.abs(V.angleTo(en.heading, toEn.x || toEn.z ? { x: me.x - en.x, z: me.z - en.z } : { x: 1, z: 0 }));
    if (dist < 4.5 && ang < 1.5) smashDanger = true;
  }

  // ---- blink evasion ----
  const blinkReady = api.ready('blink');
  if (blinkReady && !me.busy && (dashDanger || smashDanger)) {
    // blink perpendicular to enemy facing / away
    const dir = chargeDash || chargeWindup ? V.fromHeading(en.heading) : toEn;
    const p1 = V.perp(dir);
    const cand1 = { x: me.x + p1.x * 7, z: me.z + p1.z * 7 };
    const cand2 = { x: me.x - p1.x * 7, z: me.z - p1.z * 7 };
    const score = (c) => {
      let s = 0;
      const cc = safePoint(c.x, c.z);
      s -= Math.max(0, 8 - V.dist(cc, en)) * 2;
      if (Math.abs(cc.x) > 17 || Math.abs(cc.z) > 17) s -= 6;
      s += V.dist(cc, en) * 0.4;
      return s;
    };
    const pick = score(cand1) >= score(cand2) ? p1 : V.scale(p1, -1);
    api.use('blink', pick.x, pick.z);
    api.move(pick.x, pick.z);
    api.faceAt(en.x, en.z);
    api.say('slip');
    return;
  }

  // ---- jump over smash if no blink ----
  if (smashDanger && !me.busy && api.ready('jump') && ecast && ecast.remaining < 0.2) {
    api.move(away.x, away.z);
    api.use('jump');
    api.faceAt(en.x, en.z);
    return;
  }

  // ---- if dash danger and no blink, dodge sideways hard ----
  if (dashDanger && !dashDangerHandled(me)) {
    const dir = V.fromHeading(en.heading);
    const pr = V.perp(dir);
    const rel = { x: me.x - en.x, z: me.z - en.z };
    const side = (rel.x * dir.z - rel.z * dir.x) >= 0 ? 1 : -1;
    const mv = V.scale(pr, side);
    api.move(mv.x, mv.z);
    api.faceAt(en.x, en.z);
    return;
  }

  // ---- LASER logic ----
  const laserReady = api.ready('laser');
  const casting = cast && cast.skill === 'laser';

  if (casting) {
    // keep aiming with lead; beam is instant so aim at predicted position
    const t = cast.remaining;
    const pred = { x: en.x + en.vx * t, z: en.z + en.vz * t };
    // blend: if enemy near, aim directly
    const aim = dist < 6 ? { x: en.x, z: en.z } : pred;
    api.faceAt(aim.x, aim.z);
    // strafe while casting to be a harder target
    const pr = V.perp(toEn);
    const s = api.recall('strafeSide', 1);
    let mv = V.scale(pr, s);
    // avoid closing into smash range
    if (dist < 6.5) mv = V.norm(V.add(mv, V.scale(away, 1.2)));
    else if (dist > 16) mv = V.norm(V.add(mv, V.scale(toEn, 0.9)));
    api.move(mv.x, mv.z);
    return;
  }

  // strafe side flip occasionally
  if (p.t - api.recall('sideT', -9) > 1.6) {
    api.remember('strafeSide', api.rand() < 0.5 ? 1 : -1);
    api.remember('sideT', p.t);
  }

  // Fire laser when we have line of sight and reasonable range, and enemy is
  // not about to punish us.
  if (laserReady && !me.busy && en.visible && dist < 23 && dist > 3.0 && !en.invulnerable) {
    // do not start a cast if the gorilla is charging at us or is very close
    const risky = chargeWindup || chargeDash || (dist < 5.5);
    if (!risky) {
      api.use('laser');
      api.faceAt(en.x, en.z);
      const pr = V.perp(toEn);
      const s = api.recall('strafeSide', 1);
      let mv = V.scale(pr, s);
      if (dist < 8) mv = V.norm(V.add(mv, V.scale(away, 1.0)));
      api.move(mv.x, mv.z);
      return;
    }
  }

  // ---- Kiting / positioning ----
  const desired = 12.5; // stay outside charge range (12m) when possible
  let mv;

  if (!en.visible) {
    // reposition to regain sight but from range
    const path = api.pathTo(en.x, en.z);
    if (path && path.points && path.points.length) {
      const wp = path.points[0];
      mv = V.toward(me, wp);
    } else {
      mv = toEn;
    }
    api.move(mv.x, mv.z);
    api.faceAt(en.x, en.z);
    return;
  }

  const pr = V.perp(toEn);
  const s = api.recall('strafeSide', 1);
  const strafe = V.scale(pr, s);

  if (dist < desired - 1.5) {
    mv = V.norm(V.add(V.scale(away, 1.3), V.scale(strafe, 0.85)));
  } else if (dist > desired + 3.5) {
    mv = V.norm(V.add(V.scale(toEn, 1.0), V.scale(strafe, 0.6)));
  } else {
    mv = V.norm(V.add(strafe, V.scale(away, 0.15)));
  }

  // wall avoidance: if the step would push us into a wall, rotate
  const probe = { x: me.x + mv.x * 3.0, z: me.z + mv.z * 3.0 };
  if (Math.abs(probe.x) > 18 || Math.abs(probe.z) > 18 || inBlock(probe.x, probe.z, 1.3)) {
    // try rotating the movement vector until clear
    let found = null;
    for (let k = 1; k <= 11; k++) {
      for (const sgn of [1, -1]) {
        const cand = V.rot(mv, sgn * k * 0.32);
        const q = { x: me.x + cand.x * 3.0, z: me.z + cand.z * 3.0 };
        if (Math.abs(q.x) < 18 && Math.abs(q.z) < 18 && !inBlock(q.x, q.z, 1.3)) {
          // prefer directions not straight into the enemy
          if (V.dot(cand, toEn) < 0.75) { found = cand; break; }
        }
      }
      if (found) break;
    }
    if (found) mv = found;
    else {
      api.remember('strafeSide', -s);
      mv = V.norm(V.add(V.scale(away, 1.0), V.scale(strafe, -0.8)));
    }
  }

  api.move(mv.x, mv.z);
  api.faceAt(en.x, en.z);

  // opportunistic blink to open distance when the gorilla is glued to us
  if (dist < 4.0 && api.ready('blink') && !me.busy) {
    api.use('blink', away.x, away.z);
  }
}

function dashDangerHandled(me) {
  return me.busy || me.airborne || me.stunned;
}
