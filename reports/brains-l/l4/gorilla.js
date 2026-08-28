function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en.alive) return;

  const dist = en.dist;
  const toEn = V.toward(me, en);

  // ---- track enemy laser casts / blink usage ----
  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      if (e.skill === 'laser') { lastLaserStart = p.t; }
      if (e.skill === 'blink') { lastBlink = p.t; }
    }
    if (e.type === 'damaged' && e.skill === 'laser') { lastLaserHit = p.t; }
    if (e.type === 'blocked') { lastBlocked = p.t; }
  }

  const enemyCasting = en.casting && en.casting.skill === 'laser' && en.casting.telegraph;

  // ---- helper: is enemy in smash cone reach ----
  const smashReach = 2.9 + me.radius + en.radius; // 5.15
  const canSmashHit = dist <= smashReach - 0.15 && !en.airborne;

  // ---- facing: almost always look at enemy (lead slightly) ----
  const lead = V.lead(me, en, { x: en.vx, z: en.vz }, 12);
  if (dist < 8) api.faceAt(lead.x, lead.z);
  else api.faceAt(en.x, en.z);

  // ================= SMASH =================
  if (api.ready('smash') && !me.busy && !me.airborne) {
    // predict enemy position at land time (0.28s)
    const pdx = en.x + en.vx * 0.28 - me.x;
    const pdz = en.z + en.vz * 0.28 - me.z;
    const pd = Math.hypot(pdx, pdz);
    if (pd <= smashReach - 0.3 && !en.airborne) {
      api.use('smash');
      api.faceAt(en.x + en.vx * 0.28, en.z + en.vz * 0.28);
      return;
    }
  }

  // ================= CHARGE =================
  // Charge is the main gap-closer & interrupt. Use when:
  //  - enemy is casting laser (interrupt!) and in range
  //  - or enemy is at medium range and visible with clear path
  if (api.ready('charge') && !me.busy && !me.airborne) {
    const clear = api.ray(toEn.x, toEn.z, Math.min(dist, 12.5));
    const pathClear = !clear.hit || clear.dist >= Math.min(dist, 12.4) - 0.6;
    // aim point: lead a bit for dash travel time
    const travel = Math.max(0, dist - me.radius - en.radius) / 15;
    const aim = { x: en.x + en.vx * (travel + 0.28) * 0.7, z: en.z + en.vz * (travel + 0.28) * 0.7 };
    const adir = V.toward(me, aim);
    const angErr = Math.abs(V.angleTo(me.heading, adir));

    if (en.visible && pathClear && dist > 3.0 && dist < 12.0) {
      // prefer charging when they're stuck casting, or when we need to close
      if (enemyCasting || dist > 4.5) {
        if (angErr < 1.4) {
          api.face(adir.x, adir.z);
          api.use('charge');
          return;
        } else {
          api.face(adir.x, adir.z);
        }
      }
    }
  }

  // ================= DODGE THE LASER =================
  // If enemy is casting laser and we're in LOS, break the line: strafe hard
  // perpendicular, or dive behind cover, or jump won't help (beam is a line, not ground sweep).
  if (enemyCasting && en.visible && dist > 3.5) {
    const remaining = en.casting.remaining != null ? en.casting.remaining : 0.3;
    // perpendicular escape, biased away from walls
    const perp = V.perp(toEn);
    let sign = api.recall('strafeSign', 1);
    // pick side that keeps us in arena and closes distance
    const a = { x: me.x + perp.x * 4 * sign, z: me.z + perp.z * 4 * sign };
    if (Math.abs(a.x) > 18 || Math.abs(a.z) > 18) { sign = -sign; api.remember('strafeSign', sign); }
    // combine perpendicular with slight approach
    const mv = V.norm({ x: perp.x * sign * 1.0 + toEn.x * 0.55, z: perp.z * sign * 1.0 + toEn.z * 0.55 });
    api.move(mv.x, mv.z);
    api.faceAt(en.x, en.z);
    // if the beam is about to fire and we're still exposed, use jump? no — jump freezes velocity.
    return;
  }

  // ================= MOVEMENT =================
  // Core plan: get inside smash range and stay there. Octopus wants distance.
  if (dist > 6.5) {
    // close in. Use pathing around blocks.
    const path = api.pathTo(en.x, en.z);
    if (path && !path.direct && path.points && path.points.length) {
      const pt = path.points[0];
      api.moveTo(pt.x, pt.z);
    } else {
      // direct approach with slight weave to spoil aim
      const weave = Math.sin(p.t * 3.4) * 0.55;
      const perp = V.perp(toEn);
      api.move(toEn.x + perp.x * weave, toEn.z + perp.z * weave);
    }
  } else {
    // In the kill zone: orbit-press. Stay just at smash edge, keep pressure.
    const perp = V.perp(toEn);
    let sign = api.recall('orbit', 1);
    if (p.tick % 45 === 0 && api.rand() < 0.35) { sign = -sign; api.remember('orbit', sign); }
    // guard against wall pinning
    const probe = { x: me.x + (perp.x * sign) * 3, z: me.z + (perp.z * sign) * 3 };
    if (Math.abs(probe.x) > 18.5 || Math.abs(probe.z) > 18.5) { sign = -sign; api.remember('orbit', sign); }
    if (p.t - lastBlocked < 0.4) { sign = -sign; api.remember('orbit', sign); }

    const want = 2.2; // hug close so smash always connects
    const radial = dist > want ? 1.0 : -0.5;
    const mv = V.norm({
      x: toEn.x * radial + perp.x * sign * 0.85,
      z: toEn.z * radial + perp.z * sign * 0.85
    });
    api.move(mv.x, mv.z);
  }

  // ================= ANTI-STALL / BURN =================
  if (p.burn > 0 && dist > 8 && api.ready('charge') && !me.busy) {
    const d2 = V.toward(me, en);
    api.face(d2.x, d2.z);
  }

  if (p.tick % 120 === 0) {
    const lines = ['Come here.', 'Nowhere to blink.', 'Fists beat beams.', 'Grab. Smash.'];
    api.say(lines[Math.floor(api.rand() * lines.length)]);
  }
}

let lastLaserStart = -99;
let lastLaserHit = -99;
let lastBlink = -99;
let lastBlocked = -99;
