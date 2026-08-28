let gamePhase = 'early';

function think(p, api) {
  const me = p.self;
  const enemy = p.enemy;
  
  // Determine game phase for adjustments
  if (p.t > 40) gamePhase = 'late';
  else if (p.t > 30) gamePhase = 'mid';
  else gamePhase = 'early';
  
  // Calculate positions and directions
  const myPos = { x: me.x, z: me.z };
  const enemyPos = { x: enemy.x, z: enemy.z };
  const toEnemy = V.toward(myPos, enemyPos);
  const awayFromEnemy = V.away(myPos, enemyPos);
  
  // Adjust optimal distance - closer in late game as burn gets dangerous
  const optimalDist = gamePhase === 'late' ? 18 : 20;
  
  // Check laser viability
  const hasLOS = api.los(enemy.x, enemy.z);
  const canLaser = hasLOS && enemy.dist <= 26.85 && !me.casting;
  
  // === PRIMARY STRATEGY: LASER SPAM ===
  if (api.ready('laser') && canLaser) {
    api.faceAt(enemy.x, enemy.z);
    api.use('laser');
  } else {
    // === POSITIONING ===
    if (hasLOS && enemy.dist < optimalDist - 2) {
      // Too close - back away
      api.move(awayFromEnemy.x, awayFromEnemy.z);
    } else if (hasLOS && enemy.dist > optimalDist + 2) {
      // Too far - move closer
      api.move(toEnemy.x, toEnemy.z);
    } else if (!hasLOS) {
      // Blocked by obstacle - move toward enemy to navigate around
      api.move(toEnemy.x, toEnemy.z);
    } else {
      // Optimal position - hold
      api.stop();
    }
    
    // Always maintain facing toward enemy
    api.face(toEnemy.x, toEnemy.z);
  }
  
  // === DEFENSIVE: ESCAPE CHARGE ===
  if (api.ready('blink')) {
    if (enemy.casting && enemy.casting.skill === 'charge' && enemy.dist < 15) {
      api.use('blink', awayFromEnemy.x, awayFromEnemy.z);
    }
  }
  
  // === DEFENSIVE: DODGE SMASH ===
  if (api.ready('jump')) {
    if (enemy.casting && enemy.casting.skill === 'smash' && enemy.dist < 6) {
      api.use('jump');
    }
  }
}