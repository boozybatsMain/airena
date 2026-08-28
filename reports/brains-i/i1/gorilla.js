function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en.alive) return;

  // ---- track enemy skill usage ----
  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      if (e.skill === 'laser') api.remember('laserAt', p.t);
      if (e.skill === 'blink') api.remember('blinkAt', p.t);
      if (e.skill === 'jump') api.remember('ejumpAt', p.t);
    }
    if (e.type === 'damaged') api.remember('lastHit', p.t);
  }

  const dist = en.dist;
  const toE = V.toward(me, en);
  const awayE = V.away(me, en);

  // enemy casting laser?
  const enCasting = en.casting;
  const laserWindup = enCasting && enCasting.skill === 'laser' && enCasting.telegraph;
  const laserRemain = laserWindup ? enCasting.remaining : 99;

  // ---- helper: is a point safe-ish (inside arena, not in a block) ----
  const AR = 19.0;
  function clampPt(pt) {
    return { x: Math.max(-AR, Math.min(AR, pt.x)), z: Math.max(-AR, Math.min(AR, pt.z)) };
  }
  function inBlock(x, z, pad) {
    for (const o of p.arena.obstacles) {
      if (Math.abs(x - o.x) < o.hx + pad && Math.abs(z - o.z) < o.hz + pad) return true;
    }
    return false;
  }

  // ============ face ============
  api.faceAt(en.x, en.z);

  // ============ combat decisions ============
  const R = me.radius + en.radius; // ~2.25
  const smashReach = me.radius + 2.9; // 4.15 from center to target center-ish
  const smashReady = api.ready('smash');
  const chargeReady = api.ready('charge');
  const jumpReady = api.ready('jump');

  // Predict where enemy will be after smash windup (0.28s)
  const predE = { x: en.x + en.vx * 0.30, z: en.z + en.vz * 0.30 };
  const predDist = V.dist({ x: me.x, z: me.z }, predE);

  // ---- 1. SMASH when close ----
  if (!me.busy && smashReady && predDist < smashReach + en.radius - 0.35 && !en.airborne) {
    // don't smash if they're likely to be invulnerable/airborne
    api.use('smash');
    api.faceAt(predE.x, predE.z);
    api.move(toE.x, toE.z);
    return;
  }

  // ---- 2. CHARGE: main gap closer / laser interrupt ----
  // Charge travels 15 m/s for up to 0.8s = 12m, plus 0.28 windup.
  if (!me.busy && chargeReady && en.visible && dist > R + 0.8 && dist < 13.5) {
    // Lead the target: after 0.28s windup we lock direction, then dash.
    const travelT = 0.28 + Math.max(0, (dist - R) / 15);
    const lead = { x: en.x + en.vx * travelT * 0.85, z: en.z + en.vz * travelT * 0.85 };
    const cl = clampPt(lead);
    // Check charge path is not blocked by a block before reaching them
    const dir = V.norm(V.sub(cl, { x: me.x, z: me.z }));
    const ray = api.ray(dir.x, dir.z, Math.min(13, dist + 1));
    const clear = !ray.hit || ray.dist > dist - R - 0.2;
    // Prefer to charge when: enemy casting laser (interrupt!), or enemy stunned, or just to close distance
    const goodTime = laserWindup || en.busy || dist < 11;
    if (clear && goodTime && !en.invulnerable) {
      api.face(dir.x, dir.z);
      api.use('charge');
      api.remember('chargedAt', p.t);
      return;
    }
  }

  // ---- 3. Dodge the laser ----
  // Laser fires at end of 0.65s cast along their facing. Strafe hard perpendicular,
  // or break line of sight.
  if (laserWindup && en.visible) {
    const perp = V.perp(toE);
    // pick side that moves us away from walls
    const cand1 = { x: me.x + perp.x * 4, z: me.z + perp.z * 4 };
    const cand2 = { x: me.x - perp.x * 4, z: me.z - perp.z * 4 };
    const score = (c) => {
      let s = 0;
      s -= Math.max(0, Math.abs(c.x) - 15) * 3;
      s -= Math.max(0, Math.abs(c.z) - 15) * 3;
      if (inBlock(c.x, c.z, 1.3)) s -= 10;
      if (!api.los(c.x, c.z)) s += 6; // cover is good
      return s;
    };
    let dodge = score(cand1) >= score(cand2) ? perp : V.scale(perp, -1);
    // If very close, better to close in and smash than run
    if (dist < 5 && smashReady && !me.busy) {
      api.use('smash');
      api.move(toE.x, toE.z);
      return;
    }
    // jump can't dodge a laser (beam is not a ground sweep) -> just strafe
    if (!me.airborne) {
      // combine strafe with slight approach
      const mv = V.norm({ x: dodge.x * 1.0 + toE.x * 0.45, z: dodge.z * 1.0 + toE.z * 0.45 });
      api.move(mv.x, mv.z);
      api.faceAt(en.x, en.z);
      return;
    }
  }

  // ---- 4. Approach ----
  // If we're busy (charging/smashing), still set movement toward enemy.
  if (me.busy) {
    if (me.casting && me.casting.skill === 'smash') {
      api.faceAt(predE.x, predE.z);
      api.move(toE.x, toE.z);
    }
    return;
  }

  // Chase. Use pathTo to route around blocks.
  const chaseTarget = { x: en.x + en.vx * 0.35, z: en.z + en.vz * 0.35 };
  const ct = clampPt(chaseTarget);

  if (dist > R + 0.4) {
    if (en.visible) {
      // direct pursuit with slight lead
      const d = V.norm(V.sub(ct, { x: me.x, z: me.z }));
      api.move(d.x, d.z);
    } else {
      api.moveTo(ct.x, ct.z);
    }
  } else {
    // In contact: hold and smash when ready; shove them
    api.move(toE.x, toE.z);
    if (smashReady) {
      api.use('smash');
    }
  }

  // ---- 5. Endgame: if burning and we hold larger fraction, still press (we win ties by fraction) ----
  // Gorilla 205hp vs Octopus 150hp: fractions matter. Just keep pressure.

  if (p.tick % 60 === 0) {
    api.say(dist < 5 ? "SMASH" : "come here");
  }
}
