function think(p, api) {
  const me = p.self;
  const en = p.enemy;

  const toEnemy = V.sub(en, me);
  const dist = V.len(toEnemy);
  const dirEnemy = V.norm(toEnemy);
  const angleToEnemy = Math.abs(V.angleTo(me.heading, dirEnemy));

  // Predict enemy position after a short time
  const enemyVel = { x: en.vx || 0, z: en.vz || 0 };
  const predEn03 = V.add(en, V.scale(enemyVel, 0.3));
  const dirPred03 = V.norm(V.sub(predEn03, me));
  const angleToPred03 = Math.abs(V.angleTo(me.heading, dirPred03));

  // Check clear line for charge
  function chargeLineClear() {
    if (!en.visible) return false;
    const ray = api.ray(dirPred03.x, dirPred03.z, Math.min(dist + 2, 12));
    return ray.dist >= dist - en.radius;
  }

  // Combat actions
  let actionTaken = false;

  // 1. Smash: High priority when close
  if (api.ready('smash') && !me.busy) {
    if (!en.invulnerable && !en.airborne) {
      if (dist <= 4.7 && angleToEnemy < 1.0) {
        api.faceAt(en.x, en.z);
        api.use('smash');
        actionTaken = true;
      }
    }
  }

  // 2. Charge: Gap closer, interrupts laser, stuns
  if (!actionTaken && api.ready('charge') && !me.busy) {
    if (!en.invulnerable) {
      const isCastingLaser = en.casting && en.casting.skill === 'laser';
      const goodDistance = dist >= 3.2 && dist <= 11.2;

      if (goodDistance && chargeLineClear()) {
        if (angleToPred03 < 0.85 || isCastingLaser) {
          api.face(dirPred03.x, dirPred03.z);
          api.use('charge');
          actionTaken = true;
        }
      }
    }
  }

  // Always aim facing toward enemy or predicted enemy
  if (!actionTaken) {
    if (dist > 3.0 && en.speed > 0.5) {
      api.face(dirPred03.x, dirPred03.z);
    } else {
      api.faceAt(en.x, en.z);
    }
  }

  // Movement strategy
  const isEnemyLaserTelegraph = en.casting && en.casting.skill === 'laser' && en.casting.telegraph;

  if (isEnemyLaserTelegraph && !me.busy) {
    // Laser dodging: move perpendicular to Octopus facing / beam
    const laserDir = V.fromHeading(en.heading);
    const perp1 = V.perp(laserDir);
    const perp2 = V.scale(perp1, -1);

    // Pick perpendicular direction that moves away from obstacles / walls
    const sample1 = V.add(me, V.scale(perp1, 2.5));
    const sample2 = V.add(me, V.scale(perp2, 2.5));

    const inArena1 = Math.abs(sample1.x) < 18 && Math.abs(sample1.z) < 18;
    const inArena2 = Math.abs(sample2.x) < 18 && Math.abs(sample2.z) < 18;

    let dodgeDir = perp1;
    if (!inArena1 && inArena2) {
      dodgeDir = perp2;
    } else if (inArena1 && inArena2) {
      // Pick the side matching our current velocity or path
      dodgeDir = V.dot({ x: me.vx, z: me.vz }, perp1) >= 0 ? perp1 : perp2;
    }

    // Blend dodging with closing in if close enough
    const moveDir = dist > 4.5 ? V.add(dodgeDir, V.scale(dirEnemy, 0.4)) : dirEnemy;
    api.move(moveDir.x, moveDir.z);
  } else {
    // Relentless pursuit
    if (en.visible && dist < 14) {
      // Direct pursuit cutting corner
      const leadPos = V.add(en, V.scale(enemyVel, Math.min(dist / me.maxSpeed, 0.6)));
      // Check if straight path is clear
      const ray = api.ray(dirEnemy.x, dirEnemy.z, dist);
      if (ray.dist >= dist - en.radius) {
        api.move(leadPos.x - me.x, leadPos.z - me.z);
      } else {
        api.moveTo(en.x, en.z);
      }
    } else {
      api.moveTo(en.x, en.z);
    }
  }
}