function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en.alive) return;

  const d = en.dist;
  const toEn = V.toward(me, en);
  const now = p.t;

  // ---- track enemy laser casts / blinks ----
  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      api.remember('lastEnemySkill', e.skill);
      api.remember('lastEnemySkillT', now);
      if (e.skill === 'laser') lastLaserT = now;
      if (e.skill === 'blink') lastBlinkT = now;
    }
    if (e.type === 'damaged') lastHitT = now;
  }

  const enemyCasting = en.casting && en.casting.skill === 'laser' && en.casting.telegraph;

  // ---- facing: always at enemy (predict a little) ----
  const lead = { x: en.x + en.vx * 0.15, z: en.z + en.vz * 0.15 };
  api.faceAt(lead.x, lead.z);

  // ---------- SMASH ----------
  // land within 5.15 m centre-to-centre. Order it when we predict contact.
  const smashReach = 2.9 + me.radius + en.radius; // 5.15
  if (!me.busy && api.ready('smash')) {
    // where will they be in 0.3s?
    const fx = en.x + en.vx * 0.3, fz = en.z + en.vz * 0.3;
    const fd = Math.hypot(fx - me.x, fz - me.z);
    const ang = Math.abs(V.angleTo(me.heading, V.toward(me, { x: fx, z: fz })));
    if ((fd < smashReach - 0.35 || d < smashReach - 0.6) && ang < 1.0 && !en.airborne && !en.invulnerable) {
      api.use('smash');
      api.say('SMASH');
      return;
    }
  }

  // ---------- CHARGE ----------
  // Great closer and interrupts the laser cast.
  if (!me.busy && api.ready('charge')) {
    const dirOK = api.los(en.x, en.z);
    const good = d > 4.2 && d < 12.5 && dirOK;
    // extra-eager when they're casting a laser (interrupt) or stunned
    if (good && (enemyCasting || en.stunned || d < 11)) {
      // predict their position at end of windup + travel
      const travelT = Math.max(0, (d - me.radius - en.radius) / 15);
      const tt = 0.3 + travelT * 0.6;
      const px = en.x + en.vx * tt, pz = en.z + en.vz * tt;
      api.faceAt(px, pz);
      api.use('charge');
      api.say('CHARGE');
      return;
    }
  }

  // ---------- DODGE LASER ----------
  // If they're casting and we can't reach, break line of sight or strafe hard.
  if (enemyCasting && d > 5.5) {
    const rem = en.casting.remaining;
    // strafe perpendicular — beam aims where we are at fire time
    const perp = V.perp(toEn);
    const side = api.recall('strafeSide', 1);
    let sx = me.x + perp.x * side * 4, sz = me.z + perp.z * side * 4;
    if (Math.abs(sx) > 18.5 || Math.abs(sz) > 18.5) {
      api.remember('strafeSide', -side);
      sx = me.x - perp.x * side * 4; sz = me.z - perp.z * side * 4;
    }
    // Prefer hiding behind cover if very close to one
    const cover = findCover(p, api);
    if (cover && rem > 0.25) {
      api.moveTo(cover.x, cover.z);
    } else {
      api.move(sx - me.x + toEn.x * 1.2, sz - me.z + toEn.z * 1.2);
    }
    api.faceAt(en.x, en.z);
    return;
  }

  // ---------- JUMP: not much use vs laser (height not consulted). Use to close gaps ----
  // Use jump only to escape a smash-less situation: skip mostly.

  // ---------- APPROACH ----------
  // Close aggressively, zig-zag slightly to make laser aim harder.
  if (d > smashReach - 0.8) {
    let tx = en.x, tz = en.z;
    const path = api.pathTo(tx, tz);
    if (path && !path.direct && path.points && path.points.length) {
      const wp = path.points[0];
      api.move(wp.x - me.x, wp.z - me.z);
    } else {
      // weave: add perpendicular oscillation when far
      const perp = V.perp(toEn);
      let amp = 0;
      if (d > 8 && api.los(en.x, en.z)) amp = 0.55 * Math.sin(now * 3.1);
      api.move(toEn.x + perp.x * amp, toEn.z + perp.z * amp);
    }
    return;
  }

  // ---------- IN MELEE RANGE, smash on cooldown ----------
  // Stay glued to them.
  if (d < 2.4) {
    // slight orbit to stay in cone, keep pressure
    const perp = V.perp(toEn);
    const side = api.recall('strafeSide', 1);
    api.move(toEn.x * 0.8 + perp.x * side * 0.5, toEn.z * 0.8 + perp.z * side * 0.5);
  } else {
    api.move(toEn.x, toEn.z);
  }
}

let lastLaserT = -99, lastBlinkT = -99, lastHitT = -99;

function findCover(p, api) {
  const me = p.self, en = p.enemy;
  let best = null, bestD = 1e9;
  for (const o of p.arena.obstacles) {
    // point on far side of block relative to enemy
    const dir = V.toward({ x: en.x, z: en.z }, { x: o.x, z: o.z });
    const ext = Math.max(o.hx, o.hz) + 1.9;
    const cx = o.x + dir.x * ext, cz = o.z + dir.z * ext;
    if (Math.abs(cx) > 19 || Math.abs(cz) > 19) continue;
    const dd = Math.hypot(cx - me.x, cz - me.z);
    if (dd < bestD && dd < 6.5) { bestD = dd; best = { x: cx, z: cz }; }
  }
  return best;
}
