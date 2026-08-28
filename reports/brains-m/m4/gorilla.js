function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en.alive) return;

  const dist = en.dist;
  const toEnemy = V.toward(me, en);
  const now = p.t;

  // ---- event bookkeeping ----
  let enemyLaserStarted = false;
  for (const e of p.events) {
    if (e.type === 'enemyStarted' && e.skill === 'laser') enemyLaserStarted = true;
    if (e.type === 'enemyStarted' && e.skill === 'blink') lastBlink = now;
    if (e.type === 'damaged' && e.skill === 'laser') lastLaserHitMe = now;
  }
  if (enemyLaserStarted) lastLaserStart = now;

  // enemy casting laser?
  const enCast = en.casting;
  const enemyCasting = enCast && enCast.telegraph;
  const enemyLasering = enemyCasting && enCast.skill === 'laser';

  // ---- if busy with an uninterruptible thing, only manage facing ----
  if (me.casting) {
    const c = me.casting;
    if (c.skill === 'smash') {
      // keep aiming at predicted enemy position
      api.faceAt(en.x + en.vx * 0.12, en.z + en.vz * 0.12);
      // creep forward while winding
      api.move(toEnemy.x, toEnemy.z);
      return;
    }
    if (c.skill === 'charge') {
      if (c.phase === 'windup') {
        // aim at lead position of enemy at end of windup + travel
        const tLead = Math.min(0.75, c.remaining + dist / 15);
        api.faceAt(en.x + en.vx * tLead, en.z + en.vz * tLead);
      }
      return;
    }
    if (c.skill === 'jump') {
      api.faceAt(en.x, en.z);
      return;
    }
    return;
  }
  if (me.stunned || me.airborne) {
    api.faceAt(en.x, en.z);
    return;
  }

  // ---- core numbers ----
  const smashReach = 2.9 + me.radius + en.radius; // 5.15
  const smashReadyIn = api.cooldown('smash');
  const chargeReadyIn = api.cooldown('charge');

  // ---- 1. SMASH when in range ----
  if (api.ready('smash') && dist < smashReach - 0.15 && !en.airborne && !en.invulnerable) {
    // predict where they'll be at land time (0.3s)
    const px = en.x + en.vx * 0.3, pz = en.z + en.vz * 0.3;
    const pd = Math.hypot(px - me.x, pz - me.z);
    if (pd < smashReach + 0.3) {
      api.use('smash');
      api.faceAt(px, pz);
      api.move(toEnemy.x, toEnemy.z);
      return;
    }
  }

  // ---- 2. CHARGE: close the gap / interrupt a laser cast ----
  const chargeMax = 12 + me.radius + en.radius;
  if (api.ready('charge') && en.visible && !en.airborne) {
    const goodRange = dist > 3.2 && dist < chargeMax - 1.0;
    // strongly prefer charging into a laser cast (interrupt) or when far
    if (goodRange) {
      // check the path is roughly clear
      const r = api.ray(toEnemy.x, toEnemy.z, dist + 0.5);
      const clear = !r.hit || r.dist >= dist - (en.radius + 0.4);
      if (clear) {
        const urgent = enemyLasering || dist > 6 || en.stunned;
        if (urgent) {
          api.use('charge');
          const tLead = 0.3 + dist / 15;
          api.faceAt(en.x + en.vx * tLead * 0.8, en.z + en.vz * tLead * 0.8);
          return;
        }
      }
    }
  }

  // ---- 3. Dodge a laser that is about to fire ----
  if (enemyLasering && en.visible) {
    const rem = enCast.remaining;
    // strafe perpendicular hard; the beam has 0.4 margin + our 1.25 radius
    if (rem < 0.5) {
      const perp = V.perp(toEnemy);
      // pick side that moves us away from their aim & toward cover
      const side = api.recall('dodgeSide', 1);
      let s = side;
      // choose the side which increases lateral offset from their facing line
      const eh = V.fromHeading(en.heading);
      const rel = V.sub(me, en);
      const cross = eh.x * rel.z - eh.z * rel.x;
      s = cross > 0 ? 1 : -1;
      // move perpendicular, slightly toward enemy so we don't lose ground
      const mv = V.norm({ x: perp.x * s + toEnemy.x * 0.35, z: perp.z * s + toEnemy.z * 0.35 });
      api.move(mv.x, mv.z);
      api.faceAt(en.x, en.z);
      // jump doesn't help vs laser (height not consulted). Just strafe.
      return;
    }
  }

  // ---- 4. Approach ----
  // Chase relentlessly. Gorilla wins in melee.
  if (dist > smashReach - 0.4) {
    // predict slightly
    const lead = Math.min(0.35, dist / 12);
    const tx = en.x + en.vx * lead, tz = en.z + en.vz * lead;
    if (en.visible) {
      // straight in, but weave a little to spoil laser aim at long range
      if (dist > 8) {
        const perp = V.perp(toEnemy);
        const weave = Math.sin(now * 2.6) * 0.55;
        const mv = V.norm({ x: toEnemy.x + perp.x * weave, z: toEnemy.z + perp.z * weave });
        api.move(mv.x, mv.z);
      } else {
        api.move(V.toward(me, { x: tx, z: tz }).x, V.toward(me, { x: tx, z: tz }).z);
      }
    } else {
      api.moveTo(tx, tz);
    }
    api.faceAt(tx, tz);
    return;
  }

  // ---- 5. In melee range but smash on cooldown: stay glued ----
  {
    const px = en.x + en.vx * 0.2, pz = en.z + en.vz * 0.2;
    api.faceAt(px, pz);
    if (dist > 2.2) {
      api.move(toEnemy.x, toEnemy.z);
    } else {
      // hover just inside cone range, keep pressure
      api.move(toEnemy.x * 0.6, toEnemy.z * 0.6);
    }
  }
}

let lastLaserStart = -99;
let lastBlink = -99;
let lastLaserHitMe = -99;
