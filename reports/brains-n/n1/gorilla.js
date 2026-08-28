function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive) return;

  const dist = en.dist;
  const toEn = V.toward(me, en);

  // --- track enemy skill usage ---
  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      if (e.skill === 'laser') api.remember('lastLaser', p.t);
      if (e.skill === 'blink') api.remember('lastBlink', p.t);
      if (e.skill === 'jump') api.remember('lastJump', p.t);
    }
    if (e.type === 'blocked') api.remember('blockedAt', p.t);
  }

  const lastBlink = api.recall('lastBlink', -99);
  const blinkReady = (p.t - lastBlink) > 3.9;

  // ---- helpers ----
  const angDiff = (h, dir) => Math.abs(V.angleTo(h, dir));

  // enemy casting laser?
  const enCasting = en.casting;
  const enLasering = enCasting && enCasting.skill === 'laser' && enCasting.telegraph;

  // ---------- SMASH ----------
  // hit range: centre-to-centre <= 2.9 + myR + theirR = 5.15
  const smashMaxCentre = 2.9 + me.radius + en.radius;
  if (api.ready('smash') && !me.busy && !me.airborne) {
    // predict where they'll be in 0.3s
    const px = en.x + en.vx * 0.3, pz = en.z + en.vz * 0.3;
    const pd = Math.hypot(px - me.x, pz - me.z);
    if (pd < smashMaxCentre - 0.25 && !en.airborne && !en.invulnerable) {
      const dir = { x: px - me.x, z: pz - me.z };
      const half = 55 * Math.PI / 180 + Math.asin(Math.min(0.99, en.radius / Math.max(pd, en.radius + 0.01)));
      // will facing be close enough after turning at 0.55*4 rad/s for 0.3s = 0.66 rad
      const a = angDiff(me.heading, dir);
      if (a - 0.66 < half - 0.15) {
        api.faceAt(px, pz);
        api.use('smash');
        api.move(en.x - me.x, en.z - me.z);
        return;
      }
    }
  }

  // ---------- CHARGE ----------
  // Use charge to close distance / interrupt laser cast
  if (api.ready('charge') && !me.busy && !me.airborne && en.visible) {
    const good = dist > 4.0 && dist < 13.5;
    // check line clear along charge path
    if (good) {
      // predict enemy position at contact time. dash starts after 0.3s windup.
      const travelT = Math.max(0, (dist - me.radius - en.radius) / 15);
      const lead = 0.3 + travelT;
      let px = en.x + en.vx * lead * 0.6, pz = en.z + en.vz * lead * 0.6;
      const d2 = Math.hypot(px - me.x, pz - me.z);
      const r = api.ray((px - me.x) / d2, (pz - me.z) / d2, Math.min(d2, 12.5));
      const clear = !r.hit || r.dist >= Math.min(d2, 12.2) - 0.3;
      const worth = enLasering || dist < 12 ;
      if (clear && worth && !en.invulnerable) {
        api.faceAt(px, pz);
        api.use('charge');
        api.remember('chargeAt', p.t);
        return;
      }
    }
  }

  // ---------- during own charge windup: aim ----------
  if (me.casting && me.casting.skill === 'charge' && me.casting.phase === 'windup') {
    const lead = 0.3 + Math.max(0, (dist - 2) / 15);
    api.faceAt(en.x + en.vx * lead * 0.6, en.z + en.vz * lead * 0.6);
    return;
  }

  // ---------- DODGE LASER with jump? no — jump doesn't dodge laser ----------
  // Laser hits airborne too. Best dodge is breaking LOS or moving perpendicular
  // hard, or closing to interrupt.

  // ---------- MOVEMENT ----------
  api.faceAt(en.x + en.vx * 0.2, en.z + en.vz * 0.2);

  // If enemy is casting laser and we can't reach: strafe hard perpendicular / break LOS
  if (enLasering && dist > 5.5) {
    // move perpendicular to their facing to leave the beam line, biased toward them
    const perp = V.perp(V.fromHeading(en.heading));
    // choose side that increases lateral offset from beam
    const rel = { x: me.x - en.x, z: me.z - en.z };
    const side = V.dot(rel, perp) >= 0 ? 1 : -1;
    let dir = V.add(V.scale(perp, side * 1.0), V.scale(toEn, 0.55));
    const nx = me.x + dir.x * 3, nz = me.z + dir.z * 3;
    if (Math.abs(nx) > 18.5 || Math.abs(nz) > 18.5) {
      dir = V.scale(perp, -side);
    }
    api.move(dir.x, dir.z);
    return;
  }

  // Default: hunt.
  if (dist > smashMaxCentre - 0.6) {
    // approach, with a slight weave to be a harder beam target at long range
    if (dist > 8) {
      const perp = V.perp(toEn);
      const wob = Math.sin(p.t * 2.6) * 0.55;
      const path = api.pathTo(en.x, en.z);
      if (path && !path.direct && path.points && path.points.length) {
        const wp = path.points[0];
        api.moveTo(wp.x, wp.z);
      } else {
        api.move(toEn.x + perp.x * wob, toEn.z + perp.z * wob);
      }
    } else {
      const path = api.pathTo(en.x, en.z);
      if (path && !path.direct && path.points && path.points.length) {
        const wp = path.points[0];
        api.moveTo(wp.x, wp.z);
      } else {
        api.move(toEn.x, toEn.z);
      }
    }
  } else {
    // in smash range but smash on cooldown: stay close, circle slightly
    const perp = V.perp(toEn);
    const s = api.cooldown('smash') > 0.5 ? 1 : 0.2;
    api.move(toEn.x * 0.8 + perp.x * s * 0.7, toEn.z * 0.8 + perp.z * s * 0.7);
  }
}
