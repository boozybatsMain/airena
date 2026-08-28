function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en.alive) return;

  // ---- memory / state ----
  let lastLaser = api.recall('lastLaser', -99);
  let laserSeen = api.recall('laserSeen', 0);
  for (const e of p.events) {
    if (e.type === 'enemyStarted' && e.skill === 'laser') {
      api.remember('lastLaser', p.t);
      api.remember('laserSeen', laserSeen + 1);
      lastLaser = p.t;
    }
    if (e.type === 'enemyStarted' && e.skill === 'blink') api.remember('lastBlink', p.t);
  }

  const dist = en.dist;
  const toEnemy = V.toward(me, en);
  const surfaceDist = dist - me.radius - en.radius;

  // ---- if busy with an uninterruptible thing, just steer facing sensibly ----
  const cast = me.casting;

  // Predict enemy position a bit ahead
  const predict = (tt) => ({ x: en.x + en.vx * tt, z: en.z + en.vz * tt });

  // ---------- SMASH ----------
  // Reach: centre-to-centre up to 5.15. Land time = 0.3s.
  const smashReady = api.ready('smash');
  const pSmash = predict(0.3);
  const dSmash = V.dist(me, pSmash);

  if (cast && cast.skill === 'smash' && cast.telegraph) {
    // keep aiming at where they'll be when it lands
    const pl = predict(Math.max(0, cast.remaining));
    api.faceAt(pl.x, pl.z);
    if (dist > 2.6) api.move(toEnemy.x, toEnemy.z);
    else api.stop();
    return;
  }
  if (cast && (cast.skill === 'charge')) {
    if (cast.phase === 'windup') {
      const pl = predict(Math.max(0, cast.remaining) + 0.25);
      api.faceAt(pl.x, pl.z);
    }
    return;
  }
  if (me.airborne || me.stunned) {
    api.faceAt(en.x, en.z);
    return;
  }

  // ---------- threat: enemy casting laser ----------
  const enemyLasering = en.casting && en.casting.skill === 'laser' && en.casting.telegraph;

  // ---------- ATTACK DECISIONS ----------
  // 1. Smash when in range and they aren't airborne/invulnerable
  if (smashReady && !me.busy && dSmash < 4.7 && !en.invulnerable) {
    const willBeAir = en.airborne && (!en.casting || en.casting.remaining > 0.35);
    if (!willBeAir) {
      api.use('smash');
      api.faceAt(pSmash.x, pSmash.z);
      if (dist > 2.5) api.move(toEnemy.x, toEnemy.z); else api.stop();
      return;
    }
  }

  // 2. Charge to close distance or to interrupt a laser cast
  const chargeReady = api.ready('charge');
  if (chargeReady && !me.busy && en.visible) {
    // charge covers up to 12m of travel from surface; effective if within ~12.5 centre dist
    const goodRange = dist > 3.2 && dist < 12.5;
    const interrupt = enemyLasering && dist < 13 && dist > 2.0;
    if (goodRange || interrupt) {
      // check path is roughly clear along the charge line
      const lead = predict(0.35 + Math.min(0.8, Math.max(0, (dist - 2) / 15)));
      const dir = V.norm(V.sub(lead, me));
      const r = api.ray(dir.x, dir.z, Math.min(13, dist + 1));
      if (r.dist >= dist - en.radius - 0.4) {
        api.use('charge');
        api.faceAt(lead.x, lead.z);
        api.move(dir.x, dir.z);
        return;
      }
    }
  }

  // ---------- MOVEMENT ----------
  // Dodge the laser: when they're casting, break line of sight or move perpendicular hard.
  if (enemyLasering && dist > 5) {
    // strafe perpendicular to their facing to leave the beam line
    const enDir = V.fromHeading(en.heading);
    const side = V.perp(enDir);
    const toMe = V.toward(en, me);
    const s = V.dot(side, toMe) >= 0 ? 1 : -1;
    // prefer moving toward cover if there is any near
    let best = null, bestScore = -Infinity;
    for (const ob of p.arena.obstacles) {
      const d = V.dist(me, ob);
      if (d > 11) continue;
      const score = -d + (api.los(ob.x, ob.z) ? 1 : 0);
      if (score > bestScore) { bestScore = score; best = ob; }
    }
    let mv = V.add(V.scale(side, s * 1.0), V.scale(toEnemy, 0.55));
    if (best && V.dist(me, best) < 7.5) {
      // move to the far side of the block from the enemy
      const awayFromEn = V.away(best, en);
      const spot = V.add(best, V.scale(awayFromEn, Math.max(best.hx, best.hz) + 2.0));
      mv = V.norm(V.sub(spot, me));
    }
    api.move(mv.x, mv.z);
    api.faceAt(en.x, en.z);
    return;
  }

  // Default: close the distance aggressively, stay in smash range.
  api.faceAt(en.x, en.z);

  if (dist > 3.0) {
    if (en.visible) {
      // approach with a slight strafe so beams have to track
      const wob = Math.sin(p.t * 2.7) * (dist > 7 ? 0.5 : 0.2);
      const side = V.perp(toEnemy);
      const mv = V.add(toEnemy, V.scale(side, wob));
      const r = api.ray(mv.x, mv.z, 3.0);
      if (r.hit && r.dist < 2.0) {
        const path = api.pathTo(en.x, en.z);
        if (path && path.points && path.points.length) {
          const wp = path.points[0];
          api.move(wp.x - me.x, wp.z - me.z);
        } else {
          api.move(toEnemy.x, toEnemy.z);
        }
      } else {
        api.move(mv.x, mv.z);
      }
    } else {
      api.moveTo(en.x, en.z);
    }
  } else {
    // hug them: stay just inside smash reach, keep pressure
    const desired = 2.2;
    if (dist < desired) {
      const back = V.away(me, en);
      api.move(back.x * 0.4 + toEnemy.x * 0.6, back.z * 0.4 + toEnemy.z * 0.6);
    } else {
      api.move(toEnemy.x, toEnemy.z);
    }
  }
}
