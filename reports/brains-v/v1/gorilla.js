function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en.alive) return;

  const d = en.dist;
  const toEnemy = { x: en.x - me.x, z: en.z - me.z };
  const enemyCasting = en.casting;
  const laserCasting = enemyCasting && enemyCasting.skill === 'laser' && enemyCasting.telegraph;

  // ---- memory of enemy laser timing ----
  for (const e of p.events) {
    if (e.type === 'enemyStarted' && e.skill === 'laser') api.remember('lastLaser', p.t);
    if (e.type === 'enemyStarted' && e.skill === 'blink') api.remember('lastBlink', p.t);
    if (e.type === 'damaged') api.remember('lastHurt', p.t);
  }

  // ---- if we're locked in something, only manage facing ----
  if (me.casting) {
    const c = me.casting;
    if (c.skill === 'smash') {
      // keep aiming at predicted enemy position at land time
      const lead = { x: en.x + en.vx * c.remaining, z: en.z + en.vz * c.remaining };
      api.faceAt(lead.x, lead.z);
      return;
    }
    if (c.skill === 'charge') {
      if (c.phase === 'windup') {
        // aim at where enemy will be when we arrive
        const eta = 0.3 - c.elapsed + Math.max(0, (d - 2) / 15);
        const lead = { x: en.x + en.vx * eta, z: en.z + en.vz * eta };
        api.faceAt(lead.x, lead.z);
        api.move(lead.x - me.x, lead.z - me.z);
      } else {
        api.faceAt(en.x, en.z);
      }
      return;
    }
    if (c.skill === 'jump') {
      api.faceAt(en.x, en.z);
      return;
    }
  }

  if (me.stunned) { api.faceAt(en.x, en.z); return; }

  // ---- always face the enemy by default ----
  api.faceAt(en.x, en.z);

  const smashReach = 2.9 + me.radius + en.radius; // 5.15
  const canSmash = api.ready('smash');
  const canCharge = api.ready('charge');
  const canJump = api.ready('jump');

  // ---- SMASH: if enemy will be inside cone in 0.3s ----
  if (canSmash && !en.invulnerable) {
    const futEx = en.x + en.vx * 0.3, futEz = en.z + en.vz * 0.3;
    const fd = Math.hypot(futEx - me.x, futEz - me.z);
    if (fd < smashReach - 0.15 && !en.airborne) {
      // check we can turn enough in 0.3s at reduced turn rate
      const ang = Math.abs(V.angleTo(me.heading, { x: futEx - me.x, z: futEz - me.z }));
      const maxTurn = 4 * 0.55 * 0.3;
      const allowed = (55 * Math.PI / 180) + Math.asin(Math.min(0.99, en.radius / Math.max(fd, en.radius)));
      if (ang - maxTurn < allowed * 0.75) {
        api.use('smash');
        api.move(futEx - me.x, futEz - me.z);
        return;
      }
    }
  }

  // ---- CHARGE: closer / interrupt laser ----
  if (canCharge && en.visible && !en.invulnerable) {
    // predicted intercept
    const eta = 0.3 + Math.max(0, (d - (me.radius + en.radius)) / 15);
    const lx = en.x + en.vx * eta * 0.6, lz = en.z + en.vz * eta * 0.6;
    const ld = Math.hypot(lx - me.x, lz - me.z);
    const clearPath = api.los(lx, lz);
    const good = ld < 12.5 && ld > 2.0 && clearPath;
    if (good) {
      // prefer charging while they cast laser (interrupt) or when they're far and shooting range
      const urgent = laserCasting || d > 6 || en.stunned;
      if (urgent) {
        api.use('charge');
        api.move(lx - me.x, lz - me.z);
        api.faceAt(lx, lz);
        return;
      }
    }
  }

  // ---- DODGING THE LASER ----
  if (laserCasting) {
    const rem = enemyCasting.remaining;
    // strafe perpendicular hard; jump doesn't help (height not consulted)
    const perp = V.perp(V.norm(toEnemy));
    // choose side away from enemy facing error
    const rel = V.angleTo(en.heading, V.norm({ x: me.x - en.x, z: me.z - en.z }));
    const dir = rel > 0 ? 1 : -1;
    let strafe = V.scale(perp, dir);
    // blend inward to close distance
    let mv = V.add(V.scale(strafe, 1.0), V.scale(V.norm(toEnemy), d > 4 ? 0.55 : -0.1));
    // if we can break LOS quickly by moving behind a block, still just strafe
    if (rem < 0.12 && d > 3) {
      // near fire moment, maximize lateral
      mv = strafe;
    }
    const tx = me.x + mv.x * 3, tz = me.z + mv.z * 3;
    if (Math.abs(tx) > 18.5 || Math.abs(tz) > 18.5) mv = V.scale(mv, -1);
    api.move(mv.x, mv.z);
    return;
  }

  // ---- MAIN APPROACH ----
  // Melee range management: stay in smash range, orbit slightly.
  if (d < smashReach + 1.2) {
    // press in; slight orbit to make blink/laser awkward
    const inDir = V.norm(toEnemy);
    const perp = V.perp(inDir);
    const side = (Math.floor(p.t * 0.7) % 2 === 0) ? 1 : -1;
    let mv = V.add(inDir, V.scale(perp, side * 0.5));
    api.move(mv.x, mv.z);
    // smash the moment it's up handled above
    if (canSmash && !en.airborne && !en.invulnerable && d < smashReach) {
      api.use('smash');
    }
    return;
  }

  // Approach: use pathing if no LOS
  if (!en.visible) {
    const path = api.pathTo(en.x, en.z);
    if (path && path.points && path.points.length) {
      const wp = path.points[0];
      api.moveTo(wp.x, wp.z);
    } else {
      api.moveTo(en.x, en.z);
    }
    return;
  }

  // Visible and far: zigzag approach to make laser aim hard
  {
    const inDir = V.norm(toEnemy);
    const perp = V.perp(inDir);
    const phase = Math.sin(p.t * 3.1);
    let lateral = phase > 0 ? 1 : -1;
    let amp = d > 8 ? 0.7 : 0.4;
    let mv = V.add(inDir, V.scale(perp, lateral * amp));
    const tx = me.x + mv.x * 2.5, tz = me.z + mv.z * 2.5;
    if (Math.abs(tx) > 19 || Math.abs(tz) > 19) {
      mv = V.add(inDir, V.scale(perp, -lateral * amp));
    }
    api.move(mv.x, mv.z);
  }
}
