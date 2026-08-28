function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en) return;

  const dist = en.dist;
  const toEn = { x: en.x - me.x, z: en.z - me.z };
  const enDir = V.norm(toEn);

  // ---- track enemy threat events ----
  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      api.remember('lastStart', e.skill);
      api.remember('lastStartT', p.t);
    }
    if (e.type === 'enemyCommitted') {
      api.remember('committed', p.t);
      api.remember('cdir', { x: Math.sin(en.heading), z: Math.cos(en.heading) });
    }
    if (e.type === 'damaged') {
      api.remember('lastHitT', p.t);
    }
  }

  const enCasting = en.casting;
  const enSkill = enCasting ? enCasting.skill : null;
  const enTele = enCasting ? enCasting.telegraph : false;

  // ---- danger assessment ----
  const chargeDanger = (enSkill === 'charge' && enTele) ||
    (enCasting && enCasting.skill === 'charge' && enCasting.phase === 'dash');
  const smashDanger = (enSkill === 'smash' && enTele && dist < 4.6);

  // ---- desired standoff ----
  const IDEAL = 11;

  // Perpendicular strafe direction, kept stable via memory
  let strafeSign = api.recall('strafe', 1);
  if (p.t - api.recall('strafeT', -9) > 1.6) {
    strafeSign = api.rand() < 0.5 ? 1 : -1;
    api.remember('strafe', strafeSign);
    api.remember('strafeT', p.t);
  }
  for (const e of p.events) {
    if (e.type === 'blocked') {
      strafeSign = -strafeSign;
      api.remember('strafe', strafeSign);
      api.remember('strafeT', p.t);
    }
  }

  const perp = V.perp(enDir);
  const strafe = V.scale(perp, strafeSign);

  // ---- helper: safe point check ----
  function keepInside(x, z) {
    const h = 18.2;
    return { x: Math.max(-h, Math.min(h, x)), z: Math.max(-h, Math.min(h, z)) };
  }

  // =========== EMERGENCY: dodge charge ===========
  if (chargeDanger) {
    // Blink sideways out of the lane if possible
    let cd = api.recall('cdir', null);
    const dirFace = cd ? cd : { x: Math.sin(en.heading), z: Math.cos(en.heading) };
    // lateral offset from charge line
    const rel = { x: me.x - en.x, z: me.z - en.z };
    const along = V.dot(rel, dirFace);
    const lat = rel.x * dirFace.z - rel.z * dirFace.x; // cross
    const side = lat >= 0 ? 1 : -1;
    const escape = V.scale(V.perp(dirFace), side);
    if (Math.abs(lat) < 3.0 && along > -1 && dist < 16) {
      if (api.ready('blink')) {
        const t = keepInside(me.x + escape.x * 7, me.z + escape.z * 7);
        api.use('blink', t.x - me.x, t.z - me.z);
        api.face(enDir.x, enDir.z);
        return;
      }
      const t = keepInside(me.x + escape.x * 6, me.z + escape.z * 6);
      api.move(t.x - me.x, t.z - me.z);
      api.faceAt(en.x, en.z);
      return;
    }
  }

  // =========== EMERGENCY: dodge smash ===========
  if (smashDanger && !me.busy) {
    if (api.ready('blink')) {
      const away = V.away(me, en);
      const t = keepInside(me.x + away.x * 7 + strafe.x * 2, me.z + away.z * 7 + strafe.z * 2);
      api.use('blink', t.x - me.x, t.z - me.z);
      api.faceAt(en.x, en.z);
      return;
    }
    if (api.ready('jump')) {
      const away = V.away(me, en);
      api.move(away.x, away.z);
      api.use('jump');
      return;
    }
    const away = V.away(me, en);
    api.move(away.x + strafe.x * 0.6, away.z + strafe.z * 0.6);
    api.faceAt(en.x, en.z);
    return;
  }

  // =========== LASER LOGIC ===========
  // Predict where enemy will be at fire time (~0.55s) and aim there.
  const castLead = 0.55;
  const predX = en.x + en.vx * castLead * 0.8;
  const predZ = en.z + en.vz * castLead * 0.8;

  const canSee = en.visible;
  const inRange = dist < 22.5;

  if (me.casting && me.casting.skill === 'laser') {
    // keep aiming at prediction, shuffle slightly to stay mobile
    api.faceAt(predX, predZ);
    // creep sideways while casting to keep distance
    if (dist < 7) {
      const away = V.away(me, en);
      api.move(away.x, away.z);
    } else {
      api.move(strafe.x, strafe.z);
    }
    return;
  }

  if (!me.busy && api.ready('laser') && canSee && inRange && dist > 2.2) {
    // Don't start a laser if a charge could land during the cast
    const chargeReady = en.cooldowns && (en.cooldowns.charge !== undefined ? en.cooldowns.charge <= 0.45 : false);
    const risky = chargeReady && dist < 13;
    // aim alignment
    const ang = Math.abs(V.angleTo(me.heading, V.norm({ x: predX - me.x, z: predZ - me.z })));
    if (!risky || dist > 9) {
      if (ang < 1.2) {
        api.use('laser');
        api.faceAt(predX, predZ);
        return;
      }
    }
  }

  // =========== POSITIONING ===========
  api.faceAt(predX, predZ);

  let mx, mz;

  if (!canSee) {
    // move to regain line of sight while keeping range
    const path = api.pathTo(en.x, en.z);
    if (path && path.points && path.points.length) {
      const wp = path.points[0];
      mx = wp.x - me.x; mz = wp.z - me.z;
    } else {
      mx = enDir.x; mz = enDir.z;
    }
  } else if (dist < IDEAL - 2) {
    // back away, orbiting
    const away = V.away(me, en);
    mx = away.x * 1.3 + strafe.x * 0.9;
    mz = away.z * 1.3 + strafe.z * 0.9;
  } else if (dist > IDEAL + 3) {
    mx = enDir.x * 1.0 + strafe.x * 0.6;
    mz = enDir.z * 1.0 + strafe.z * 0.6;
  } else {
    mx = strafe.x + enDir.x * 0.1;
    mz = strafe.z + enDir.z * 0.1;
  }

  // wall avoidance: push toward centre if near edge
  const h = p.arena.half;
  const edge = 4.5;
  if (Math.abs(me.x) > h - edge) mx += (me.x > 0 ? -1 : 1) * 1.4;
  if (Math.abs(me.z) > h - edge) mz += (me.z > 0 ? -1 : 1) * 1.4;

  // avoid walking straight into a block
  const mdir = V.norm({ x: mx, z: mz });
  if (mdir.x !== 0 || mdir.z !== 0) {
    const r = api.ray(mdir.x, mdir.z, 2.4);
    if (r && r.hit && r.dist < 2.0) {
      const alt1 = V.rot(mdir, 1.0);
      const alt2 = V.rot(mdir, -1.0);
      const r1 = api.ray(alt1.x, alt1.z, 2.4);
      const r2 = api.ray(alt2.x, alt2.z, 2.4);
      const d1 = r1 ? r1.dist : 3, d2 = r2 ? r2.dist : 3;
      const pick = d1 >= d2 ? alt1 : alt2;
      mx = pick.x; mz = pick.z;
    }
  }

  api.move(mx, mz);

  // Blink as an escape when low or too close and pressured
  if (!me.busy && api.ready('blink') && dist < 4.0 && me.hp < 100) {
    const away = V.away(me, en);
    const t = keepInside(me.x + away.x * 7, me.z + away.z * 7);
    api.use('blink', t.x - me.x, t.z - me.z);
  }
}
