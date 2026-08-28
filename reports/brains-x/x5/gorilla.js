function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en.alive) return;

  const d = en.dist;
  const toEn = V.toward(me, en);
  const enemyCasting = en.casting && en.casting.skill === 'laser' && en.casting.telegraph;

  // ---- memory / bookkeeping ----
  let lastBlink = api.recall('lastBlink', -99);
  let lastLaser = api.recall('lastLaser', -99);
  let hitCount = api.recall('hits', 0);
  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      if (e.skill === 'blink') { api.remember('lastBlink', p.t); lastBlink = p.t; }
      if (e.skill === 'laser') { api.remember('lastLaser', p.t); lastLaser = p.t; }
    }
    if (e.type === 'dealt') { hitCount++; api.remember('hits', hitCount); }
  }

  // ---- if we're locked into something, just steer facing ----
  if (me.casting) {
    const c = me.casting;
    if (c.skill === 'smash') {
      // aim at where they'll be when it lands
      const lead = { x: en.x + en.vx * c.remaining, z: en.z + en.vz * c.remaining };
      api.faceAt(lead.x, lead.z);
      if (c.phase === 'windup') api.move(toEn.x, toEn.z);
      return;
    }
    if (c.skill === 'charge' && c.phase === 'windup') {
      // aim charge at intercept point
      const t = 0.3 + Math.max(0, (d - me.radius - en.radius)) / 15;
      const lead = { x: en.x + en.vx * t, z: en.z + en.vz * t };
      api.faceAt(lead.x, lead.z);
      return;
    }
    api.faceAt(en.x, en.z);
    return;
  }

  if (me.stunned) { api.faceAt(en.x, en.z); return; }

  // ---- constants ----
  const SMASH_MAX = 2.9 + me.radius + en.radius; // 5.15
  const SMASH_GOOD = 4.3;

  // face the enemy generally
  api.faceAt(en.x, en.z);

  // ---- SMASH: highest priority when in range ----
  if (api.ready('smash') && !en.airborne) {
    // predict enemy position at land time (0.3s)
    const land = { x: en.x + en.vx * 0.3, z: en.z + en.vz * 0.3 };
    const dLand = V.dist({ x: me.x + me.vx * 0.3, z: me.z + me.vz * 0.3 }, land);
    if (dLand < SMASH_MAX - 0.35 || d < SMASH_GOOD) {
      // check angle feasibility: can we turn there in 0.3s at 0.55 rate?
      const dir = V.toward(me, land);
      const ang = Math.abs(V.angleTo(me.heading, dir));
      if (ang < 0.3 + 4 * 0.55 * 0.3 + 0.7) {
        api.use('smash');
        api.faceAt(land.x, land.z);
        api.move(toEn.x, toEn.z);
        return;
      }
    }
  }

  // ---- CHARGE: main gap closer & laser interrupt ----
  if (api.ready('charge') && en.visible) {
    const flightT = 0.3 + Math.max(0, (d - me.radius - en.radius)) / 15;
    const good = d > 4.0 && d < 12.5 && flightT < 1.1;
    // extra eager if they're casting laser (interrupt) or far
    if (good) {
      // don't charge into a block: check ray along predicted direction
      const lead = { x: en.x + en.vx * (flightT - 0.3), z: en.z + en.vz * (flightT - 0.3) };
      const dir = V.toward(me, lead);
      const r = api.ray(dir.x, dir.z, Math.min(13, d + 1));
      if (!r.hit || r.dist > d - en.radius - 0.5) {
        api.use('charge');
        api.faceAt(lead.x, lead.z);
        return;
      }
    }
  }

  // ---- movement ----
  // Dodge laser: strafe hard perpendicular while they cast.
  if (enemyCasting) {
    const rem = en.casting.remaining;
    if (d < SMASH_MAX + 1.2) {
      // close: just get in and smash — charge/smash handled above; keep closing
      api.moveTo(en.x, en.z);
      return;
    }
    // break line of sight or strafe
    const perp = V.perp(toEn);
    const side = api.recall('side', 1);
    // pick side that moves us away from walls
    let s = side;
    const cand = { x: me.x + perp.x * s * 4, z: me.z + perp.z * s * 4 };
    if (Math.abs(cand.x) > 18.5 || Math.abs(cand.z) > 18.5) { s = -s; api.remember('side', s); }
    // move perpendicular plus a bit of closing
    const mv = V.norm({ x: perp.x * s * 1.5 + toEn.x * 0.85, z: perp.z * s * 1.5 + toEn.z * 0.85 });
    api.move(mv.x, mv.z);
    if (rem < 0.12 && me.speed > 2 && api.ready('jump')) {
      // hop is useless vs laser; skip
    }
    return;
  }

  // switch strafe side occasionally
  if (p.tick % 90 === 0) api.remember('side', api.rand() < 0.5 ? 1 : -1);

  if (!en.visible) {
    const path = api.pathTo(en.x, en.z);
    if (path && path.points && path.points.length) {
      const wp = path.points[0];
      api.moveTo(en.x, en.z);
    } else {
      api.move(toEn.x, toEn.z);
    }
    return;
  }

  // Visible: close the distance, weaving slightly to spoil aim
  if (d > SMASH_GOOD) {
    const side = api.recall('side', 1);
    const perp = V.perp(toEn);
    const weave = d > 7 ? 0.55 : 0.3;
    let mv = { x: toEn.x + perp.x * side * weave, z: toEn.z + perp.z * side * weave };
    // avoid walls
    const nx = me.x + mv.x * 2.5, nz = me.z + mv.z * 2.5;
    if (Math.abs(nx) > 19 || Math.abs(nz) > 19) {
      api.remember('side', -side);
      mv = toEn;
    }
    if (api.pathTo(en.x, en.z) && !api.los(en.x, en.z)) api.moveTo(en.x, en.z);
    else api.move(mv.x, mv.z);
  } else {
    // In smash range but smash on cooldown: stay glued, orbit slightly
    const side = api.recall('side', 1);
    const perp = V.perp(toEn);
    const mv = { x: toEn.x * 0.9 + perp.x * side * 0.6, z: toEn.z * 0.9 + perp.z * side * 0.6 };
    api.move(mv.x, mv.z);
  }
}
