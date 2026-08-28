function think(p, api) {
  const { self, enemy } = p;
  if (!self.alive) return;

  // always keep facing the enemy — costs nothing and helps every skill land
  api.faceAt(enemy.x, enemy.z);

  const smashRange = self.radius + enemy.radius + 2.9; // farthest centre-to-centre smash hit
  const chargeMaxRange = 12; // 15 m/s * 0.8 s

  // movement: locked while dashing or airborne, otherwise chase or hold position
  const lockedMovement = self.casting && (self.casting.phase === 'dash' || self.casting.phase === 'air');
  if (!lockedMovement) {
    if (enemy.dist > smashRange - 0.3) {
      api.moveTo(enemy.x, enemy.z);
    } else {
      api.move(0, 0);
    }
  }

  if (!self.busy) {
    const clearShot = enemy.visible;

    if (enemy.dist <= smashRange) {
      if (api.ready('smash')) {
        api.use('smash');
      } else if (clearShot && api.ready('charge')) {
        api.use('charge');
      }
    } else if (clearShot && enemy.dist <= chargeMaxRange && api.ready('charge')) {
      api.use('charge');
    }
  }
}