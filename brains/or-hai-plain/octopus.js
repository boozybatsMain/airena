function think(p, api) {
  const enemy = p.enemy;
  const self = p.self;
  
  // Initialize memory
  if (!p.mem.strategy) {
    api.remember('strategy', 'assess');
    api.remember('lastEnemyPos', { x: enemy.x, z: enemy.z });
    api.remember('dodgePhase', 0);
  }
  
  const mem = {
    strategy: api.recall('strategy', 'assess'),
    lastEnemyPos: api.recall('lastEnemyPos', { x: enemy.x, z: enemy.z }),
    dodgePhase: api.recall('dodgePhase', 0)
  };
  
  // Update last enemy position
  api.remember('lastEnemyPos', { x: enemy.x, z: enemy.z });
  
  const dist = enemy.dist;
  const toEnemy = V.toward({ x: self.x, z: self.z }, { x: enemy.x, z: enemy.z });
  const awayFromEnemy = V.scale(toEnemy, -1);
  
  // Check if we can see the enemy
  const canSee = api.los(enemy.x, enemy.z);
  
  // Assess danger - gorilla is stronger but slower
  const gorillaCasting = enemy.casting;
  const isCharging = gorillaCasting && gorillaCasting.skill === 'charge';
  const isSmashing = gorillaCasting && gorillaCasting.skill === 'smash';
  
  // Blink away from danger
  if ((isCharging || isSmashing) && dist < 8 && api.ready('blink')) {
    const blinkDir = V.scale(awayFromEnemy, 7.5);
    api.use('blink', blinkDir.x, blinkDir.z);
    api.remember('dodgePhase', p.t);
    return;
  }
  
  // Use jump to evade close threats
  if (dist < 5 && !self.airborne && api.ready('jump') && (isCharging || isSmashing)) {
    api.use('jump');
    api.move(awayFromEnemy.x * 4, awayFromEnemy.z * 4);
    return;
  }
  
  // Laser when we can see them and are not too close
  if (canSee && api.ready('laser') && !self.busy) {
    // Lead the target
    const predictedPos = V.lead(
      { x: self.x, z: self.z },
      { x: enemy.x, z: enemy.z },
      { x: enemy.vx, z: enemy.vz },
      0
    );
    api.faceAt(predictedPos.x, predictedPos.z);
    api.use('laser');
    return;
  }
  
  // Position management
  if (dist > 15 && !self.busy) {
    // Too far, move closer
    api.moveTo(enemy.x, enemy.z);
    api.faceAt(enemy.x, enemy.z);
  } else if (dist < 4 && !isCharging && !isSmashing) {
    // Close but safe, strafe
    const perpDir = V.perp(toEnemy);
    const strafeDir = api.rand() > 0.5 ? perpDir : V.scale(perpDir, -1);
    api.move(strafeDir.x * 2, strafeDir.z * 2);
  } else if (dist > 8) {
    // Medium distance, approach
    api.move(toEnemy.x * self.maxSpeed, toEnemy.z * self.maxSpeed);
  } else {
    // Maintain distance, circle
    const perpDir = V.perp(toEnemy);
    const strafeDir = api.rand() > 0.5 ? perpDir : V.scale(perpDir, -1);
    api.move(strafeDir.x * 2, strafeDir.z * 2);
  }
  
  // Face enemy
  api.faceAt(enemy.x, enemy.z);
}