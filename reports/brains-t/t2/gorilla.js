function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en.alive) return;

  const dist = en.dist;
  const toEnemy = V.toward(me, en);
  const now = p.t;

  // ---- event bookkeeping ----
  let enemyCastingLaser = en.casting && en.casting.skill === 'laser' && en.casting.telegraph;
  for (const e of p.events) {
    if (e.type === 'enemyStarted' && e.skill === 'laser') lastLaserStart = now;
    if (e.type === 'enemyStarted' && e.skill === 'blink') lastBlinkStart = now;
    if (e.type === 'damaged') lastDamaged = now;
    if (e.type === 'blocked') lastBlocked = now;
  }

  // ---- helpers ----
  const inBlock = (x, z, pad) => {
    for (const o of p.arena.obstacles) {
      if (Math.abs(x - o.x) < o.hx + pad && Math.abs(z - o.z) < o.hz + pad) return true;
    }
    return false;
  };
  const clampArena = (v) => Math.max(-19, Math.min(19, v));

  // predicted enemy position a short time ahead
  const predict = (tt) => ({ x: en.x + en.vx * tt, z: en.z + en.vz * tt });

  // ---- smash decision ----
  // smash lands 0.3s after order. Enemy centre must be within 2.9 + myR + enR = 5.15
  const SMASH_REACH = 2.9 + me.radius + en.radius;
  const smashReady = api.ready('smash');
  const futureEn = predict(0.3);
  const futureDist = Math.hypot(futureEn.x - me.x, futureEn.z - me.z);

  if (smashReady && !me.busy && !me.airborne && !en.airborne && futureDist < SMASH_REACH - 0.35 && dist < SMASH_REACH + 0.4) {
    api.faceAt(futureEn.x, futureEn.z);
    api.use('smash');
    api.move(toEnemy.x, toEnemy.z);
    return;
  }

  // If already winding up smash, keep tracking with facing and creep closer
  if (me.casting && me.casting.skill === 'smash') {
    const t2 = predict(Math.max(0, me.casting.remaining));
    api.faceAt(t2.x, t2.z);
    api.move(toEnemy.x, toEnemy.z);
    return;
  }

  // ---- charge decision ----
  const chargeReady = api.ready('charge');
  const canSee = en.visible;
  // Charge travels up to 12m at 15 m/s after 0.3s windup.
  // Good when enemy in 4..12m, visible, and path roughly clear.
  if (chargeReady && !me.busy && !me.airborne && canSee && dist > 3.6 && dist < 12.5) {
    // aim at where they'll be when we arrive
    const travelT = 0.3 + Math.max(0, (dist - me.radius - en.radius)) / 15;
    const aim = predict(travelT * 0.8);
    aim.x = clampArena(aim.x); aim.z = clampArena(aim.z);
    const dir = V.norm(V.sub(aim, { x: me.x, z: me.z }));
    // check the lane is not blocked short
    const r = api.ray(dir.x, dir.z, Math.min(13, dist + 1));
    const laneOk = !r.hit || r.dist > dist - 1.2;
    // Prefer charging when they are casting laser (interrupt) or just generally to close
    if (laneOk) {
      api.face(dir.x, dir.z);
      api.use('charge');
      api.move(dir.x, dir.z);
      return;
    }
  }

  // If charge is winding up, steer facing to lead target
  if (me.casting && me.casting.skill === 'charge' && me.casting.phase === 'windup') {
    const travelT = 0.3 + dist / 15;
    const aim = predict(travelT * 0.7);
    api.faceAt(clampArena(aim.x), clampArena(aim.z));
    return;
  }

  // ---- dodging the laser ----
  // If the octopus is casting laser and we're in the open, sidestep hard perpendicular.
  if (enemyCastingLaser && canSee) {
    const rem = en.casting.remaining;
    const perp = V.perp(toEnemy);
    // choose side that moves us away from their facing sweep and stays in arena
    let side = api.recall('dodgeSide', 1);
    const cand1 = { x: me.x + perp.x * 3, z: me.z + perp.z * 3 };
    const cand2 = { x: me.x - perp.x * 3, z: me.z - perp.z * 3 };
    const score = (c) => {
      let s = 0;
      if (Math.abs(c.x) > 18 || Math.abs(c.z) > 18) s -= 10;
      if (inBlock(c.x, c.z, me.radius + 0.2)) s -= 20;
      return s;
    };
    if (score(cand2) > score(cand1)) side = -1; else side = 1;
    api.remember('dodgeSide', side);
    const strafe = V.scale(perp, side);
    // blend a little forward so we keep closing
    const mix = V.norm({ x: strafe.x * 1.0 + toEnemy.x * 0.55, z: strafe.z * 1.0 + toEnemy.z * 0.55 });
    if (rem < 0.5 && !me.busy && !me.airborne && dist > 5) {
      // strafe hard
      api.move(mix.x, mix.z);
      api.faceAt(en.x, en.z);
      return;
    }
    api.move(mix.x, mix.z);
    api.faceAt(en.x, en.z);
    return;
  }

  // ---- approach ----
  // Default: close the distance. Use cover when far and they can shoot.
  api.faceAt(en.x, en.z);

  if (dist > SMASH_REACH - 0.6) {
    const path = api.pathTo(en.x, en.z);
    if (path && !path.direct && path.points && path.points.length) {
      const wp = path.points[0];
      api.move(wp.x - me.x, wp.z - me.z);
    } else {
      // add slight weave so the beam has to lead us
      const weave = Math.sin(now * 3.1) * 0.45;
      const perp = V.perp(toEnemy);
      api.move(toEnemy.x + perp.x * weave, toEnemy.z + perp.z * weave);
    }
  } else {
    // in range but smash on cooldown: hover, keep pressure, circle slightly
    const perp = V.perp(toEnemy);
    const s = api.recall('dodgeSide', 1);
    api.move(toEnemy.x * 0.6 + perp.x * s * 0.8, toEnemy.z * 0.6 + perp.z * s * 0.8);
  }
}

let lastLaserStart = -99;
let lastBlinkStart = -99;
let lastDamaged = -99;
let lastBlocked = -99;
