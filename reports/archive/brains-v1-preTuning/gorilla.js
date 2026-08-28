function think(p, api) {
  const me = p.self;
  const e = p.enemy;
  if (!me || !e || !me.alive) return;

  const dist = e.dist;
  const toE = V.toward(me, e);
  const smashRange = api.recall('sr', 4.15);

  // ---- learn from events ----
  for (const ev of p.events) {
    if (ev.type === 'missed' && ev.skill === 'smash') {
      if (ev.reason === 'range') api.remember('sr', Math.max(3.1, smashRange - 0.3));
    } else if (ev.type === 'dealt' && ev.skill === 'smash') {
      api.remember('sr', Math.min(4.35, smashRange + 0.05));
    } else if (ev.type === 'blocked') {
      api.remember('blockT', p.t);
    }
  }

  // ---- mid-skill handling ----
  if (me.casting) {
    const c = me.casting;
    if (c.skill === 'charge') {
      if (c.phase === 'windup') {
        const t = c.remaining + Math.min(Math.max(dist - 1.6, 0) / 15, 0.75);
        api.faceAt(e.x + e.vx * t * 0.85, e.z + e.vz * t * 0.85);
        api.move(toE.x, toE.z);
      }
      return;
    }
    if (c.skill === 'smash') {
      const t = c.telegraph ? c.remaining : 0;
      api.faceAt(e.x + e.vx * t, e.z + e.vz * t);
      if (dist > 2.2) api.move(toE.x, toE.z);
      else api.move(0, 0);
      return;
    }
    return;
  }
  if (me.busy || me.stunned || me.airborne) return;

  // ---- aiming ----
  const lead = Math.min(0.18, dist / 30);
  api.faceAt(e.x + e.vx * lead, e.z + e.vz * lead);
  const angErr = Math.abs(V.angleTo(me.heading, toE));

  const enemyCastingLaser = !!(e.casting && e.casting.skill === 'laser' && e.casting.telegraph);
  const enemySoft = e.stunned || enemyCastingLaser;
  const canHitEnemy = !e.invulnerable && !e.airborne;

  // ---- predicted smash geometry ----
  const step = 0.32;
  const pe = { x: e.x + e.vx * step, z: e.z + e.vz * step };
  const closeSpeed = Math.min(1.62, 1.62);
  const ps = { x: me.x + toE.x * closeSpeed * step, z: me.z + toE.z * closeSpeed * step };
  const predDist = V.dist(ps, pe);

  // ---- SMASH ----
  if (canHitEnemy && api.ready('smash') && angErr < 1.45) {
    const thresh = enemySoft ? smashRange + 0.25 : smashRange;
    if (predDist <= thresh || (dist <= thresh && e.speed < 0.6)) {
      if (api.use('smash')) {
        if (dist > 2.2) api.move(toE.x, toE.z);
        return;
      }
    }
  }

  // ---- CHARGE ----
  if (api.ready('charge') && !e.invulnerable) {
    const t = 0.3 + Math.min(Math.max(dist - 1.8, 0) / 15, 0.75);
    const aimPt = { x: e.x + e.vx * t * 0.85, z: e.z + e.vz * t * 0.85 };
    const aimDir = V.norm(V.sub(aimPt, { x: me.x, z: me.z }));
    let clear = true;
    if (aimDir.x !== 0 || aimDir.z !== 0) {
      const want = Math.min(dist + 0.5, 11.0);
      const r = api.ray(aimDir.x, aimDir.z, want);
      if (r && r.dist < Math.min(want, dist - 1.2)) clear = false;
    } else clear = false;

    const interrupt = enemyCastingLaser && dist <= 11.5 && e.visible;
    const gapClose = dist > 4.6 && dist <= 11.0 && e.visible;
    const opener = p.t < 1.6 && dist > 12 && clear;

    if (clear && (interrupt || gapClose || opener)) {
      if (api.use('charge')) {
        api.face(aimDir.x, aimDir.z);
        api.move(aimDir.x, aimDir.z);
        return;
      }
    }
  }

  // ---- stall when clearly ahead near the end ----
  const myFrac = me.hp / me.maxHp;
  const hisFrac = e.hp / e.maxHp;
  if (p.timeLeft < 9 && myFrac > hisFrac + 0.06 && dist > 4.5) {
    let spot = api.recall('hide', null);
    const spotT = api.recall('hideT', -99);
    if (!spot || p.t - spotT > 1.2) {
      spot = pickHide(p, api);
      if (spot) {
        api.remember('hide', spot);
        api.remember('hideT', p.t);
      }
    }
    if (spot) {
      api.moveTo(spot.x, spot.z);
      api.faceAt(e.x, e.z);
      return;
    }
  }

  // ---- pursuit ----
  if (dist <= 2.6) {
    // stay glued, push the lighter body
    api.move(toE.x, toE.z);
    return;
  }

  if (e.visible) {
    const path = api.pathTo(e.x, e.z);
    if (path && !path.direct && path.points && path.points.length) {
      const wp = path.points[0];
      api.move(wp.x - me.x, wp.z - me.z);
    } else {
      // slight weave so a tracking beam has to work, without losing closing speed
      const side = ((Math.floor(p.t * 0.7) % 2) === 0) ? 1 : -1;
      const per = V.perp(toE);
      const w = dist > 7 ? 0.35 : 0.12;
      api.move(toE.x + per.x * side * w, toE.z + per.z * side * w);
    }
  } else {
    api.moveTo(e.x, e.z);
  }
}

function pickHide(p, api) {
  const me = p.self, e = p.enemy;
  let best = null, bestScore = 1e9;
  const dirs = [{ x: 1, z: 0 }, { x: -1, z: 0 }, { x: 0, z: 1 }, { x: 0, z: -1 }];
  for (const o of p.arena.obstacles) {
    for (const d of dirs) {
      const px = o.x + d.x * (o.hx + 2.3);
      const pz = o.z + d.z * (o.hz + 2.3);
      if (Math.abs(px) > 18.5 || Math.abs(pz) > 18.5) continue;
      const dv = { x: px - o.x, z: pz - o.z };
      const ev = { x: e.x - o.x, z: e.z - o.z };
      if (V.dot(dv, ev) > 0) continue;
      const dMe = Math.hypot(px - me.x, pz - me.z);
      const dEn = Math.hypot(px - e.x, pz - e.z);
      const score = dMe - dEn * 0.35;
      if (score < bestScore) { bestScore = score; best = { x: px, z: pz }; }
    }
  }
  return best;
}
