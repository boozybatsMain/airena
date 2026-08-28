function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive) return;

  const dist = en.dist;
  const toEn = { x: en.x - me.x, z: en.z - me.z };
  const away = { x: -toEn.x, z: -toEn.z };

  // ---- read enemy state ----
  let enemyCharging = false, enemyCommitted = false, enemySmashing = false;
  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      api.remember('lastEnemySkill', e.skill);
      api.remember('lastEnemySkillT', p.t);
    }
    if (e.type === 'enemyCommitted') {
      api.remember('committedT', p.t);
      api.remember('committedHeading', en.heading);
    }
  }
  const ec = en.casting;
  if (ec) {
    if (ec.skill === 'charge') { enemyCharging = true; enemyCommitted = ec.phase === 'dash'; }
    if (ec.skill === 'smash') enemySmashing = ec.telegraph;
  }

  const committedT = api.recall('committedT', -99);
  const inChargeDanger = (enemyCharging || (p.t - committedT < 1.0)) && dist < 15;

  // ---- helpers ----
  const clampArena = (x, z) => {
    const h = 18.5;
    return { x: Math.max(-h, Math.min(h, x)), z: Math.max(-h, Math.min(h, z)) };
  };

  // ---- dodge charge: blink or strafe sideways ----
  if (enemyCharging || enemySmashing) {
    // perpendicular escape
    const perp = V.perp(V.norm(toEn));
    const sign = api.recall('dodgeSign', 1);
    let d1 = V.scale(perp, sign);
    // pick side with more room
    const r1 = api.ray(perp.x, perp.z, 8);
    const r2 = api.ray(-perp.x, -perp.z, 8);
    if (r2.dist > r1.dist + 1) { d1 = V.scale(perp, -1); api.remember('dodgeSign', -1); }
    else api.remember('dodgeSign', 1);

    if (enemyCharging) {
      // charge: dash direction locked at end of windup; sidestep hard
      const willHit = Math.abs(V.angleTo(en.heading, V.norm(toEn) && { x: me.x - en.x, z: me.z - en.z })) < 0.5;
      if (api.ready('blink') && dist < 14 && (ec && (ec.phase === 'dash' || ec.remaining < 0.22))) {
        const bd = V.add(V.scale(d1, 1.0), V.scale(V.norm(away), 0.3));
        api.use('blink', bd.x, bd.z);
        api.face(toEn.x, toEn.z);
        return;
      }
      const t = clampArena(me.x + d1.x * 6, me.z + d1.z * 6);
      api.move(t.x - me.x, t.z - me.z);
      api.face(toEn.x, toEn.z);
      return;
    }
    if (enemySmashing && dist < 5.0) {
      if (ec && ec.remaining < 0.16 && api.ready('jump')) { api.use('jump'); api.face(toEn.x, toEn.z); return; }
      if (api.ready('blink') && dist < 3.6) {
        const bd = V.add(V.scale(d1, 0.6), V.scale(V.norm(away), 1.0));
        api.use('blink', bd.x, bd.z);
        api.face(toEn.x, toEn.z);
        return;
      }
      const t = clampArena(me.x + away.x * 0.9 + d1.x * 4, me.z + away.z * 0.9 + d1.z * 4);
      api.move(t.x - me.x, t.z - me.z);
      api.face(toEn.x, toEn.z);
      return;
    }
  }

  // ---- kiting distance ----
  const IDEAL = 12;
  const MIN = 8;

  // ---- laser logic ----
  const casting = me.casting && me.casting.skill === 'laser' && me.casting.telegraph;
  if (casting) {
    // keep aiming with lead; beam fires along facing at fire instant
    const rem = me.casting.remaining;
    const lead = { x: en.x + en.vx * rem, z: en.z + en.vz * rem };
    api.faceAt(lead.x, lead.z);
    // shuffle slowly away while casting
    if (dist < MIN) api.move(away.x, away.z);
    else api.stop();
    return;
  }

  if (!me.busy && api.ready('laser') && en.visible && dist < 22 && dist > 2.0 && !en.airborne) {
    // predict where enemy will be at fire time (0.55s)
    const rem = 0.55;
    const lead = { x: en.x + en.vx * rem * 0.8, z: en.z + en.vz * rem * 0.8 };
    const ang = Math.abs(V.angleTo(me.heading, V.toward(me, lead)));
    // only start when roughly aimed (turn rate while casting is reduced)
    if (ang < 1.4 && !inChargeDanger) {
      api.use('laser');
      api.faceAt(lead.x, lead.z);
      return;
    }
    api.faceAt(lead.x, lead.z);
  } else {
    api.faceAt(en.x, en.z);
  }

  // ---- movement: maintain range, strafe ----
  let dir;
  if (dist < MIN) {
    // back off with a strafe component
    const perp = V.perp(V.norm(toEn));
    const s = api.recall('orbit', 1);
    dir = V.norm(V.add(V.scale(V.norm(away), 1.2), V.scale(perp, s * 0.8)));
  } else if (dist > IDEAL + 3 || !en.visible) {
    dir = V.norm(toEn);
  } else {
    const perp = V.perp(V.norm(toEn));
    let s = api.recall('orbit', 1);
    if (p.t - api.recall('orbitT', 0) > 2.2) {
      s = api.rand() < 0.5 ? -1 : 1;
      api.remember('orbit', s);
      api.remember('orbitT', p.t);
    }
    dir = V.norm(V.add(V.scale(perp, s), V.scale(V.norm(away), 0.15)));
  }

  // avoid walls
  const target = clampArena(me.x + dir.x * 5, me.z + dir.z * 5);
  const nx = target.x - me.x, nz = target.z - me.z;
  const probe = api.ray(nx, nz, 2.5);
  if (probe.hit && probe.dist < 2.0) {
    const perp = V.perp(V.norm({ x: nx, z: nz }));
    const alt = V.add(V.norm({ x: nx, z: nz }), V.scale(perp, 1.5));
    const t2 = clampArena(me.x + alt.x * 4, me.z + alt.z * 4);
    api.move(t2.x - me.x, t2.z - me.z);
    api.remember('orbit', -api.recall('orbit', 1));
  } else {
    api.move(nx, nz);
  }

  // ---- emergency blink if enemy very close and laser down ----
  if (!me.busy && dist < 3.2 && api.ready('blink') && !enemyCharging) {
    const perp = V.perp(V.norm(toEn));
    const s = api.recall('orbit', 1);
    const bd = V.add(V.scale(V.norm(away), 1.0), V.scale(perp, s * 0.7));
    api.use('blink', bd.x, bd.z);
  }
}
