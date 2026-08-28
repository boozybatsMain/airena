function think(p, api) {
  const self = p.self;
  const enemy = p.enemy;

  const toEnemy = V.sub(enemy, self);
  const dist = V.len(toEnemy);
  const dirToEnemy = dist > 0.001 ? V.scale(toEnemy, 1 / dist) : { x: 0, z: 1 };
  const awayDir = { x: -dirToEnemy.x, z: -dirToEnemy.z };

  const enemyCasting = enemy.casting;
  const isEnemyCharging = enemyCasting && enemyCasting.skill === 'charge';
  const isEnemySmashing = enemyCasting && enemyCasting.skill === 'smash';

  // Lead calculation for laser
  let aimTarget = { x: enemy.x, y: 0, z: enemy.z };
  if (self.casting && self.casting.skill === 'laser') {
    const remainingTime = self.casting.remaining || 0.1;
    aimTarget = {
      x: enemy.x + enemy.vx * remainingTime,
      y: 0,
      z: enemy.z + enemy.vz * remainingTime
    };
  }

  // 1. Defend against Smash (Smash is a ground sweep, jump avoids it completely)
  if (isEnemySmashing && enemyCasting.phase === 'windup' && dist <= 5.5) {
    if (api.ready('jump')) {
      api.use('jump');
    } else if (api.ready('blink')) {
      api.use('blink', awayDir.x, awayDir.z);
    }
  }

  // 2. Defend against Charge
  if (isEnemyCharging) {
    const enemyHeadingDir = V.fromHeading(enemy.heading);
    const perp1 = { x: -enemyHeadingDir.z, z: enemyHeadingDir.x };
    const perp2 = { x: enemyHeadingDir.z, z: -enemyHeadingDir.x };
    
    // Choose perpendicular direction away from walls
    const chooseDir = (d) => {
      const future = V.add(self, V.scale(d, 5));
      return (Math.abs(future.x) < 17 && Math.abs(future.z) < 17) ? 1 : -1;
    };
    const dodgeDir = chooseDir(perp1) >= chooseDir(perp2) ? perp1 : perp2;

    if (dist < 10) {
      if (api.ready('blink')) {
        api.use('blink', dodgeDir.x, dodgeDir.z);
      }
    }
    api.move(dodgeDir.x, dodgeDir.z);
    api.faceAt(enemy.x, enemy.z);
    return;
  }

  // 3. Emergency Blink if Gorilla is too close
  if (dist < 3.8 && !self.casting) {
    if (api.ready('blink')) {
      api.use('blink', awayDir.x, awayDir.z);
    } else if (api.ready('jump')) {
      api.use('jump');
    }
  }

  // 4. Offense: Laser
  if (api.ready('laser') && enemy.visible && dist <= 24.5) {
    const safeToLaser = dist > 5.5 || enemy.stunned || (enemyCasting && enemyCasting.phase === 'recover');
    if (safeToLaser && !isEnemyCharging) {
      api.faceAt(enemy.x, enemy.z);
      api.use('laser');
    }
  }

  // Always keep facing target while casting laser
  if (self.casting && self.casting.skill === 'laser') {
    api.faceAt(aimTarget.x, aimTarget.z);
  } else {
    api.faceAt(enemy.x, enemy.z);
  }

  // 5. Navigation & Kiting
  // Calculate repulsive forces from walls and obstacles
  let moveVec = V.scale(awayDir, 1.5);

  // Wall repulsion
  const wallMargin = 16.5;
  if (self.x > wallMargin) moveVec.x -= (self.x - wallMargin) * 3;
  if (self.x < -wallMargin) moveVec.x -= (self.x + wallMargin) * 3;
  if (self.z > wallMargin) moveVec.z -= (self.z - wallMargin) * 3;
  if (self.z < -wallMargin) moveVec.z -= (self.z + wallMargin) * 3;

  // Obstacle avoidance
  for (const obs of p.arena.obstacles) {
    const dx = self.x - obs.x;
    const dz = self.z - obs.z;
    const odist = Math.hypot(dx, dz);
    const avoidDist = Math.hypot(obs.hx, obs.hz) + 2.5;
    if (odist < avoidDist && odist > 0.001) {
      const force = (avoidDist - odist) / odist;
      moveVec.x += dx * force * 1.5;
      moveVec.z += dz * force * 1.5;
    }
  }

  // Ideal kite distance is 12m - 18m
  if (dist > 20 && enemy.visible) {
    moveVec = V.add(moveVec, V.scale(dirToEnemy, 0.8));
  } else if (dist < 10) {
    moveVec = V.add(moveVec, V.scale(awayDir, 1.2));
  }

  api.move(moveVec.x, moveVec.z);
}