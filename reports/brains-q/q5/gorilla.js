function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en.alive) return;

  // ---- memory / state ----
  let lastLaser = api.recall('lastLaser', -99);
  let lastBlink = api.recall('lastBlink', -99);
  let hitsTaken = api.recall('hitsTaken', 0);

  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      if (e.skill === 'laser') { lastLaser = p.t; api.remember('lastLaser', p.t); }
      if (e.skill === 'blink') { lastBlink = p.t; api.remember('lastBlink', p.t); }
    }
    if (e.type === 'damaged') { hitsTaken++; api.remember('hitsTaken', hitsTaken); }
  }

  const dist = en.dist;
  const toE = V.toward(me, en);
  const fromE = V.away(me, en);

  // ---- always face the enemy unless committed otherwise ----
  let faceX = toE.x, faceZ = toE.z;
  let moveSet = false;

  // predicted enemy position a little ahead (for smash timing)
  const lead = { x: en.x + en.vx * 0.30, z: en.z + en.vz * 0.30 };
  const leadDist = V.dist(me, lead);

  // ---- helper: is a point inside the arena and clear ----
  const clampArena = (v) => ({
    x: Math.max(-19, Math.min(19, v.x)),
    z: Math.max(-19, Math.min(19, v.z))
  });

  // ---- if busy with a committed skill, only manage facing ----
  if (me.casting && me.casting.skill === 'charge' && me.casting.phase === 'dash') {
    api.faceAt(en.x, en.z);
    return;
  }

  // ================= SMASH =================
  // Effective smash reach: 2.9 + their radius = 3.9 from my surface... actually
  // range measured to their surface from my radius: centre-to-centre max 5.15
  const SMASH_MAX = 5.15;
  if (api.ready('smash') && !me.airborne && !en.airborne) {
    // will they be in the cone when it lands (0.3s later)?
    if (leadDist < SMASH_MAX - 0.35 && !en.invulnerable) {
      api.use('smash');
      api.faceAt(lead.x, lead.z);
      // keep pressing in slowly
      api.move(toE.x, toE.z);
      api.say('SMASH');
      return;
    }
  }
  // If smashing already, aim the cone at the predicted spot
  if (me.casting && me.casting.skill === 'smash' && me.casting.phase === 'windup') {
    const t = me.casting.remaining;
    const pt = { x: en.x + en.vx * t, z: en.z + en.vz * t };
    api.faceAt(pt.x, pt.z);
    api.move(toE.x, toE.z);
    return;
  }

  // ================= CHARGE =================
  // Charge is the closer. Great range (12m), stuns, interrupts laser.
  const enemyCasting = en.casting && en.casting.skill === 'laser' && en.casting.telegraph;
  if (api.ready('charge') && !me.busy && !me.airborne && en.visible && !en.invulnerable) {
    // Aim point: where they'll be at end of windup + travel
    const eta = 0.3 + Math.max(0, (dist - 2) / 15);
    const aim = { x: en.x + en.vx * eta * 0.8, z: en.z + en.vz * eta * 0.8 };
    const d = V.dist(me, aim);
    const clearRay = api.ray(V.toward(me, aim).x, V.toward(me, aim).z, Math.min(13, d + 1));
    const pathClear = !clearRay.hit || clearRay.dist > d - 1.6;
    if (d > 3.0 && d < 12.5 && pathClear) {
      // Prefer to charge when: they're casting laser, or they're far and we need to close
      if (enemyCasting || dist > 4.5) {
        api.use('charge');
        api.faceAt(aim.x, aim.z);
        api.say(enemyCasting ? 'NO BEAM' : 'CHARGE');
        return;
      }
    }
  }
  // steer the charge windup
  if (me.casting && me.casting.skill === 'charge' && me.casting.phase === 'windup') {
    const t = me.casting.remaining + Math.max(0, (dist - 2) / 15);
    const pt = { x: en.x + en.vx * t * 0.85, z: en.z + en.vz * t * 0.85 };
    api.faceAt(pt.x, pt.z);
    return;
  }

  // ================= JUMP (dodge nothing useful; laser hits airborne) =================
  // Jump is not a dodge vs laser. Use it only to gap-close over distance? No.
  // Use jump rarely: to close last meters fast is not possible (speed frozen).
  // Skip jump entirely except when it would carry us at full speed toward enemy
  // while a smash cone would otherwise whiff. Actually: avoid jumping — it disables smash.

  // ================= MOVEMENT =================
  // Core plan: get and stay inside smash range, strafing so the laser is hard to aim.
  // The octopus laser wants line of sight and 0.667s of aim. We break that with
  // lateral movement and by hugging close.

  // Laser dodge: if they're casting, move perpendicular hard, and break LOS if possible.
  if (enemyCasting) {
    const rem = en.casting.remaining;
    // perpendicular direction, pick the side we're already drifting to
    const perp = V.perp(toE);
    const side = (me.vx * perp.x + me.vz * perp.z) >= 0 ? 1 : -1;
    let dodge = V.scale(perp, side);
    // bias slightly inward so we keep closing
    const mix = dist > 8 ? 0.45 : 0.15;
    let dir = V.norm({ x: dodge.x + toE.x * mix, z: dodge.z + toE.z * mix });
    const target = clampArena({ x: me.x + dir.x * 6, z: me.z + dir.z * 6 });
    // avoid running into a wall while dodging
    const r = api.ray(dir.x, dir.z, 3.0);
    if (r.hit && r.dist < 2.2) {
      dir = V.scale(dir, -1);
    }
    api.move(dir.x, dir.z);
    moveSet = true;
    api.faceAt(en.x, en.z);
    if (rem < 0.12) api.say('sidestep');
  }

  if (!moveSet) {
    if (!en.visible) {
      // Chase via pathing
      const path = api.pathTo(en.x, en.z);
      if (path && path.points && path.points.length) {
        const nx = path.points[0];
        api.moveTo(en.x, en.z);
      } else {
        api.move(toE.x, toE.z);
      }
      api.faceAt(en.x, en.z);
      moveSet = true;
    } else {
      const ideal = 2.6;
      if (dist > ideal + 1.0) {
        // close, with a slight spiral so beams lead wrong
        const perp = V.perp(toE);
        const s = ((Math.floor(p.t * 0.9) % 2) === 0) ? 1 : -1;
        const spiral = dist > 7 ? 0.25 : 0.55;
        let dir = V.norm({ x: toE.x + perp.x * s * spiral, z: toE.z + perp.z * s * spiral });
        const r = api.ray(dir.x, dir.z, 2.5);
        if (r.hit && r.dist < 1.8) dir = V.norm({ x: toE.x - perp.x * s * spiral, z: toE.z - perp.z * s * spiral });
        api.move(dir.x, dir.z);
      } else if (dist < ideal - 0.8) {
        // too close/overlapping: hold ground, we want them in cone anyway
        api.move(toE.x * 0.3, toE.z * 0.3);
      } else {
        // orbit at kill range waiting for smash cooldown
        const perp = V.perp(toE);
        const s = ((Math.floor(p.t * 1.3) % 2) === 0) ? 1 : -1;
        let dir = V.norm({ x: perp.x * s + toE.x * 0.35, z: perp.z * s + toE.z * 0.35 });
        const r = api.ray(dir.x, dir.z, 2.5);
        if (r.hit && r.dist < 1.8) dir = { x: -dir.x, z: -dir.z };
        api.move(dir.x, dir.z);
      }
      moveSet = true;
    }
  }

  api.faceAt(faceX + me.x, faceZ + me.z);
}
