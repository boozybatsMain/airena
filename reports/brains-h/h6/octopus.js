function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en.alive) return;

  const dist = en.dist;
  const toEn = V.toward(me, en);

  // ---- track enemy skill starts ----
  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      if (e.skill === 'charge') api.remember('chargeT', p.t);
      if (e.skill === 'smash') api.remember('smashT', p.t);
      if (e.skill === 'jump') api.remember('jumpT', p.t);
    }
    if (e.type === 'damaged') api.remember('hurtT', p.t);
  }
  const lastCharge = api.recall('chargeT', -99);
  const chargeReady = (p.t - lastCharge) > 3.9;

  // ---- helpers ----
  const clearAt = (x, z) => {
    if (Math.abs(x) > 18.6 || Math.abs(z) > 18.6) return false;
    for (const o of p.arena.obstacles) {
      if (Math.abs(x - o.x) < o.hx + 1.4 && Math.abs(z - o.z) < o.hz + 1.4) return false;
    }
    return true;
  };

  const enCast = en.casting;
  const enChargingWindup = enCast && enCast.skill === 'charge' && enCast.phase === 'windup';
  const enDashing = enCast && enCast.skill === 'charge' && enCast.phase === 'dash';
  const enSmashing = enCast && enCast.skill === 'smash' && enCast.telegraph;

  // ================= EMERGENCY: dodge charge =================
  if (enDashing || enChargingWindup) {
    // dodge perpendicular to their heading
    const eh = V.fromHeading(en.heading);
    const rel = V.sub(me, en);
    const along = V.dot(rel, eh);
    const side = V.perp(eh);
    let s = V.dot(rel, side) >= 0 ? 1 : -1;
    const lateral = Math.abs(V.dot(rel, side));
    const inLane = along > -1 && along < 14 && lateral < 3.2;
    if (inLane) {
      if (api.ready('blink')) {
        const d = V.scale(side, s);
        // pick side that lands clear
        let bx = me.x + d.x * 7, bz = me.z + d.z * 7;
        if (!clearAt(bx, bz)) { s = -s; }
        api.use('blink', side.x * s, side.z * s);
        api.face(en.x - me.x, en.z - me.z);
        api.say('slip');
        return;
      }
      api.move(side.x * s, side.z * s);
      api.faceAt(en.x, en.z);
      return;
    }
  }

  // ================= EMERGENCY: smash cone =================
  if (enSmashing && dist < 5.0) {
    if (!me.busy && api.ready('blink')) {
      const away = V.away(me, en);
      let dirs = [away, V.perp(away), V.scale(V.perp(away), -1)];
      for (const d of dirs) {
        if (clearAt(me.x + d.x * 7, me.z + d.z * 7)) {
          api.use('blink', d.x, d.z);
          api.faceAt(en.x, en.z);
          return;
        }
      }
      api.use('blink', away.x, away.z);
      return;
    }
    if (!me.busy && api.ready('jump') && enCast.remaining < 0.22) {
      const away = V.away(me, en);
      api.move(away.x, away.z);
      api.use('jump');
      api.faceAt(en.x, en.z);
      return;
    }
    const away = V.away(me, en);
    api.move(away.x, away.z);
    api.faceAt(en.x, en.z);
    return;
  }

  // ================= LASER =================
  const casting = me.casting && me.casting.skill === 'laser';
  const IDEAL = 11.5;

  if (casting) {
    // keep aiming at lead position; the beam is instant so aim at them
    const lead = { x: en.x + en.vx * 0.10, z: en.z + en.vz * 0.10 };
    api.faceAt(lead.x, lead.z);
    // kite slightly while casting
    if (dist < 8) {
      const away = V.away(me, en);
      api.move(away.x, away.z);
    } else if (dist > 20) {
      api.move(toEn.x, toEn.z);
    } else {
      const side = V.perp(toEn);
      const s = api.recall('strafe', 1);
      api.move(side.x * s, side.z * s);
    }
    return;
  }

  // strafe direction flip
  let strafe = api.recall('strafe', 1);
  if (p.tick % 45 === 0 || p.events.some(e => e.type === 'blocked')) {
    strafe = (api.rand() < 0.5 ? -1 : 1);
    api.remember('strafe', strafe);
  }

  const canShoot = api.ready('laser') && en.visible && dist < 22 && !me.airborne && !me.busy;
  if (canShoot) {
    // don't shoot if enemy is about to be at melee/charging into us at point blank
    api.use('laser');
    api.faceAt(en.x + en.vx * 0.7, en.z + en.vz * 0.7);
    api.say('beam');
    // movement below still applies
  }

  // ================= POSITIONING =================
  api.faceAt(en.x, en.z);

  // if no line of sight, get one
  if (!en.visible) {
    api.moveTo(en.x, en.z);
    return;
  }

  const side = V.perp(toEn);
  let desire;

  if (dist < IDEAL - 2.5) {
    // back off while strafing
    desire = V.norm(V.add(V.scale(V.away(me, en), 1.2), V.scale(side, strafe * 0.8)));
  } else if (dist > IDEAL + 3) {
    desire = V.norm(V.add(V.scale(toEn, 1.0), V.scale(side, strafe * 0.5)));
  } else {
    desire = V.norm(V.add(V.scale(side, strafe * 1.0), V.scale(toEn, dist > IDEAL ? 0.25 : -0.25)));
  }

  // avoid walls
  const nx = me.x + desire.x * 3.0, nz = me.z + desire.z * 3.0;
  if (Math.abs(nx) > 18 || Math.abs(nz) > 18 || !clearAt(nx, nz)) {
    strafe = -strafe;
    api.remember('strafe', strafe);
    const alt = V.norm(V.add(V.scale(side, strafe * 1.0), V.scale(V.toward(me, { x: 0, z: 0 }), 0.7)));
    desire = alt;
  }

  api.move(desire.x, desire.z);

  // reposition blink for escape when close and hurt
  if (!me.busy && dist < 4.5 && api.ready('blink') && !canShoot) {
    const away = V.away(me, en);
    for (const d of [away, V.norm(V.add(away, V.scale(side, strafe))), V.scale(side, strafe)]) {
      if (clearAt(me.x + d.x * 7, me.z + d.z * 7)) { api.use('blink', d.x, d.z); break; }
    }
  }
}
