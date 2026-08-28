function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en.alive) return;

  const dist = en.dist;
  const toEnemy = V.toward(me, en);
  const events = p.events || [];

  // ---- track enemy skill usage timings ----
  for (const e of events) {
    if (e.type === 'enemyStarted') {
      if (e.skill === 'laser') api.remember('lastLaser', p.t);
      if (e.skill === 'blink') api.remember('lastBlink', p.t);
      if (e.skill === 'jump') api.remember('lastJump', p.t);
    }
    if (e.type === 'damaged') api.remember('lastHurt', p.t);
  }

  const lastLaser = api.recall('lastLaser', -99);
  const laserReady = (p.t - lastLaser) >= 2.15;

  // ---- helpers ----
  const angTo = (dx, dz) => Math.abs(V.angleTo(me.heading, { x: dx, z: dz }));
  const angToEnemy = angTo(toEnemy.x, toEnemy.z);

  // smash reach: their surface within 2.9 of my surface
  const smashReach = me.radius + 2.9 + en.radius; // 5.15
  const halfAngle = 55 * Math.PI / 180;

  // ---- enemy casting laser: dodge sideways / break LOS ----
  const enemyCastingLaser = en.casting && en.casting.skill === 'laser' && en.casting.telegraph;

  // ================= COMBAT DECISIONS =================

  // 1) SMASH when in range and aimed
  if (!me.busy && !me.airborne && !me.stunned && api.ready('smash')) {
    // predict enemy position slightly ahead (0.3s windup)
    const px = en.x + en.vx * 0.3, pz = en.z + en.vz * 0.3;
    const pd = Math.hypot(px - me.x, pz - me.z);
    const dirP = { x: px - me.x, z: pz - me.z };
    // angle I can reach after turning during windup (turn 4*0.55=2.2 rad/s * 0.3 = 0.66)
    const curAng = Math.abs(V.angleTo(me.heading, dirP));
    const reachable = Math.max(0, curAng - 0.6);
    const bonus = pd > 0.01 ? Math.asin(Math.min(0.999, en.radius / Math.max(pd, en.radius))) : 1.4;
    if (pd <= smashReach - 0.15 && reachable < halfAngle + bonus * 0.8 && !en.airborne) {
      api.faceAt(px, pz);
      api.use('smash');
      api.move(toEnemy.x, toEnemy.z);
      return;
    }
  }

  // 2) CHARGE — main gap closer / interrupter
  if (!me.busy && !me.airborne && !me.stunned && api.ready('charge')) {
    // Lead their movement over windup(0.3)+travel
    const travelTime = Math.min(0.8, dist / 15);
    const lead = 0.3 + travelTime * 0.6;
    let tx = en.x + en.vx * lead, tz = en.z + en.vz * lead;
    // if they're casting laser they're slow — aim near actual pos
    if (enemyCastingLaser || en.stunned) { tx = en.x + en.vx * 0.15; tz = en.z + en.vz * 0.15; }
    const cd = Math.hypot(tx - me.x, tz - me.z);
    const clear = api.los(en.x, en.z);
    const aimAng = Math.abs(V.angleTo(me.heading, { x: tx - me.x, z: tz - me.z }));
    // can turn 4*0.85*0.3 = 1.02 rad during windup
    const canAim = aimAng < 1.0;
    const good = clear && cd >= 3.0 && cd <= 11.5 && !en.airborne;
    if (good && (canAim || aimAng < 2.0)) {
      // prefer charging when they're casting (interrupt) or when far enough that walking is slow
      if (enemyCastingLaser || dist > 4.5 || en.stunned) {
        api.faceAt(tx, tz);
        api.use('charge');
        api.move(tx - me.x, tz - me.z);
        return;
      }
    }
  }

  // ================= MOVEMENT =================

  // If mid-skill, keep facing enemy where possible
  if (me.busy) {
    const c = me.casting;
    if (c && c.skill === 'charge' && c.phase === 'windup') {
      // keep aiming; already ordered
      api.faceAt(en.x + en.vx * 0.4, en.z + en.vz * 0.4);
      return;
    }
    if (c && c.skill === 'smash') {
      api.faceAt(en.x + en.vx * 0.2, en.z + en.vz * 0.2);
      if (c.phase === 'windup') api.move(toEnemy.x, toEnemy.z);
      return;
    }
    api.faceAt(en.x, en.z);
    return;
  }

  // Always face the enemy while maneuvering
  api.faceAt(en.x + en.vx * 0.15, en.z + en.vz * 0.15);

  const visible = en.visible;

  // Dodge laser: strafe perpendicular hard, ideally toward cover
  if (enemyCastingLaser && visible && dist > 3.0) {
    const rem = en.casting.remaining;
    const perp = V.perp(toEnemy);
    // choose side that goes away from their facing sweep — pick side with more room
    const s1 = { x: me.x + perp.x * 4, z: me.z + perp.z * 4 };
    const s2 = { x: me.x - perp.x * 4, z: me.z - perp.z * 4 };
    const inArena = (q) => Math.abs(q.x) < 18.5 && Math.abs(q.z) < 18.5;
    let dir = perp;
    if (!inArena(s1) && inArena(s2)) dir = V.scale(perp, -1);
    else if (inArena(s1) && inArena(s2)) {
      // prefer breaking LOS
      const b1 = api.los(s1.x, s1.z) ? 0 : 1;
      const b2 = api.los(s2.x, s2.z) ? 0 : 1;
      if (b2 > b1) dir = V.scale(perp, -1);
      else if (b1 === b2) {
        // prefer side that closes distance a bit
        const mix1 = V.norm(V.add(V.scale(perp, 1), V.scale(toEnemy, 0.5)));
        dir = mix1;
      }
    }
    // still close ground while dodging
    const bias = dist > 8 ? 0.7 : 0.3;
    const mv = V.norm(V.add(V.scale(dir, 1), V.scale(toEnemy, bias)));
    api.move(mv.x, mv.z);
    return;
  }

  // Not visible: path to them
  if (!visible) {
    api.moveTo(en.x, en.z);
    return;
  }

  // Close range: stay engaged, orbit slightly to make smashes land
  if (dist <= smashReach + 0.6) {
    // press in
    const perp = V.perp(toEnemy);
    const jitter = api.rand() < 0.5 ? 1 : -1;
    const mv = V.norm(V.add(toEnemy, V.scale(perp, 0.35 * jitter)));
    api.move(mv.x, mv.z);
    return;
  }

  // Mid/long range: approach. Use cover-aware pathing when far.
  if (dist > 12) {
    api.moveTo(en.x, en.z);
  } else {
    // weave slightly to make lasers harder
    const perp = V.perp(toEnemy);
    const wob = Math.sin(p.t * 3.1) * (laserReady ? 0.55 : 0.2);
    const mv = V.norm(V.add(toEnemy, V.scale(perp, wob)));
    api.move(mv.x, mv.z);
  }
}
