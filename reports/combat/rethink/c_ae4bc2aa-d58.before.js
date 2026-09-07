function think(p, api) {
  const self = p.self;
  const enemy = p.enemy;

  const toEnemy = V.toward(self, enemy);
  const awayFromEnemy = V.away(self, enemy);
  const distToEnemy = V.dist(self, enemy);

  // Dodge incoming attacks during windup
  if (enemy.casting && enemy.casting.phase === 'windup') {
    if ((enemy.casting.skill === 'smash' && distToEnemy < 6) ||
        (enemy.casting.skill === 'charge' && distToEnemy < 10)) {
      if (api.ready('blink')) {
        const perpDir = V.perp(toEnemy);
        api.use('blink', perpDir.x, perpDir.z);
      } else if (api.ready('jump') && !self.airborne) {
        api.use('jump');
      }
    }
  }

  // Distance management for optimal laser range
  if (distToEnemy < 6) {
    // Too close - retreat quickly
    api.move(awayFromEnemy.x * 2, awayFromEnemy.z * 2);
  } else if (distToEnemy > 20) {
    // Too far - advance
    api.move(toEnemy.x, toEnemy.z);
  } else {
    // Good range - strafe perpendicular to maintain mobility
    const perpDir = V.perp(toEnemy);
    const strafe = Math.floor(p.t * 2) % 2 === 0 ? 1 : -1;
    api.move(perpDir.x * strafe * 0.3, perpDir.z * strafe * 0.3);
  }

  // Face enemy
  api.face(toEnemy.x, toEnemy.z);

  // Fire laser when ready and enemy is visible
  if (api.ready('laser') && enemy.visible) {
    api.use('laser');
  }
}
