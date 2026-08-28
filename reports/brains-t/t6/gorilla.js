function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en.alive) return;

  const d = en.dist;
  const toEnemy = V.toward(me, en);

  // ---- track enemy laser casts / blinks ----
  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      api.remember('lastEnemySkill', e.skill);
      api.remember('lastEnemySkillT', p.t);
      if (e.skill === 'laser') api.remember('lastLaserT', p.t);
      if (e.skill === 'blink') api.remember('lastBlinkT', p.t);
    }
    if (e.type === 'damaged' && e.skill === 'laser') api.remember('laserHitT', p.t);
  }

  const enemyCasting = en.casting && en.casting.skill === 'laser' && en.casting.telegraph;

  // ---------- helper: is a point safe from walls/blocks ----------
  const inBlock = (x, z) => {
    for (const o of p.arena.obstacles) {
      if (Math.abs(x - o.x) < o.hx + me.radius + 0.35 && Math.abs(z - o.z) < o.hz + me.radius + 0.35) return true;
    }
    return Math.abs(x) > p.arena.half - me.radius - 0.35 || Math.abs(z) > p.arena.half - me.radius - 0.35;
  };

  // ---------- SMASH ----------
  // land the smash when it will connect: predict where they'll be in 0.3s
  const smashReach = 2.9 + me.radius + en.radius; // 5.15
  const predX = en.x + en.vx * 0.30;
  const predZ = en.z + en.vz * 0.30;
  const predDist = Math.hypot(predX - me.x, predZ - me.z);

  if (api.ready('smash') && !me.busy && !me.airborne && !en.airborne) {
    // only if they're likely still there and not invulnerable
    if (predDist < smashReach - 0.35 && d < smashReach + 0.4) {
      api.faceAt(predX, predZ);
      api.use('smash');
      api.move(toEnemy.x, toEnemy.z);
      return;
    }
  }

  // ---------- CHARGE ----------
  // Charge is the main gap-closer and interrupter. Use when at range and LOS.
  if (api.ready('charge') && !me.busy && !me.airborne && en.visible && !en.invulnerable) {
    // dash covers up to 12m from surface contact; want 3.5..12.5 centre dist
    if (d > 3.2 && d < 12.5) {
      // aim where they'll be ~0.3 windup + travel time
      const travel = Math.max(0, (d - me.radius - en.radius)) / 15;
      const lt = 0.30 + travel * 0.6;
      let tx = en.x + en.vx * lt;
      let tz = en.z + en.vz * lt;
      // if they're casting laser they're slow; aim direct
      if (enemyCasting) { tx = en.x + en.vx * 0.15; tz = en.z + en.vz * 0.15; }
      api.faceAt(tx, tz);
      api.remember('chargeT', p.t);
      api.use('charge');
      api.move(toEnemy.x, toEnemy.z);
      return;
    }
  }

  // ---------- if busy (windup/dash/recover) just keep facing well ----------
  if (me.busy) {
    if (me.casting && me.casting.skill === 'smash') {
      api.faceAt(en.x + en.vx * 0.15, en.z + en.vz * 0.15);
      if (d > me.radius + en.radius + 0.5) api.move(toEnemy.x, toEnemy.z);
      else api.move(toEnemy.x, toEnemy.z);
    } else if (me.casting && me.casting.skill === 'charge' && me.casting.phase === 'windup') {
      // keep refining aim during windup
      const travel = Math.max(0, (d - me.radius - en.radius)) / 15;
      const lt = Math.max(0, me.casting.remaining) + travel * 0.6;
      api.faceAt(en.x + en.vx * lt, en.z + en.vz * lt);
    } else {
      api.faceAt(en.x, en.z);
    }
    return;
  }

  // ---------- DODGE THE LASER ----------
  // If they're casting and we're in the beam line, strafe hard perpendicular.
  if (enemyCasting && en.visible) {
    const rem = en.casting.remaining;
    // perpendicular to their facing
    const ef = V.fromHeading(en.heading);
    const perp = V.perp(ef);
    // pick side away from their turn... choose side that increases our angular offset
    const rel = { x: me.x - en.x, z: me.z - en.z };
    const side = V.dot(rel, perp) >= 0 ? 1 : -1;
    let dodge = V.scale(perp, side);
    // blend a bit toward them so we still close distance
    let mv = V.norm(V.add(V.scale(dodge, 1.0), V.scale(toEnemy, d > 7 ? 0.55 : 0.15)));
    const px = me.x + mv.x * 2.2, pz = me.z + mv.z * 2.2;
    if (inBlock(px, pz)) {
      mv = V.norm(V.add(V.scale(dodge, -1.0), V.scale(toEnemy, 0.3)));
    }
    // jump only doesn't help (laser ignores height). Just strafe.
    api.move(mv.x, mv.z);
    api.faceAt(en.x, en.z);
    // if we can smash them right after, that's handled next tick
    if (rem < 0.09 && api.ready('charge') && d > 3.2 && d < 12.5) {
      // too late to matter, skip
    }
    return;
  }

  // ---------- CLOSE AND KILL ----------
  api.faceAt(en.x + en.vx * 0.2, en.z + en.vz * 0.2);

  const contactRange = me.radius + en.radius + 0.2;

  if (d < smashReach - 0.4) {
    // in smash range but on cooldown: stay glued, circle slightly to avoid being lasered point blank
    const orbit = V.perp(toEnemy);
    const s = (Math.floor(p.t * 0.7) % 2 === 0) ? 1 : -1;
    let mv = V.norm(V.add(V.scale(toEnemy, 1.0), V.scale(orbit, 0.45 * s)));
    if (inBlock(me.x + mv.x * 1.8, me.z + mv.z * 1.8)) mv = toEnemy;
    api.move(mv.x, mv.z);
    return;
  }

  // approach
  if (en.visible) {
    // use jump to cover ground fast? jump freezes velocity — only useful to dodge ground sweeps (octopus has none). Skip.
    const lead = 0.25;
    const tx = en.x + en.vx * lead, tz = en.z + en.vz * lead;
    const path = api.pathTo(tx, tz);
    if (path && !path.direct) {
      api.moveTo(tx, tz);
    } else {
      // strafe-approach: weave so a laser cast started now misses
      const orbit = V.perp(toEnemy);
      const s = (Math.floor(p.t * 1.3) % 2 === 0) ? 1 : -1;
      const weave = d > 6 ? 0.5 : 0.25;
      let mv = V.norm(V.add(toEnemy, V.scale(orbit, weave * s)));
      if (inBlock(me.x + mv.x * 2.0, me.z + mv.z * 2.0)) {
        mv = V.norm(V.add(toEnemy, V.scale(orbit, -weave * s)));
        if (inBlock(me.x + mv.x * 2.0, me.z + mv.z * 2.0)) mv = toEnemy;
      }
      api.move(mv.x, mv.z);
    }
  } else {
    api.moveTo(en.x, en.z);
  }
}
