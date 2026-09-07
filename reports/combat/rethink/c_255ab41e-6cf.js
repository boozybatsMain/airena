function think(p, api) {
  const self = p.self;
  const enemy = p.enemy;
  if (!self.alive) return;

  // Base chase — always try to close on the enemy, pathing around obstacles.
  api.moveTo(enemy.x, enemy.z);

  // Face them; if we're mid wind-up with a locked aim this is simply ignored.
  api.faceAt(enemy.x, enemy.z);

  const dist = enemy.dist;

  // Dodge a telegraphed dash or cone during its wind-up: their aim point is
  // fixed the moment they cast it, so any movement now can break it.
  if (
    enemy.casting &&
    enemy.casting.telegraph &&
    enemy.casting.phase === 'windup' &&
    (enemy.casting.skill === 'k1' || enemy.casting.skill === 'k3')
  ) {
    const fx = self.x - enemy.x;
    const fz = self.z - enemy.z;
    if (fx !== 0 || fz !== 0) {
      api.move(fx, fz);
    } else {
      api.move(1, 0);
    }
  }

  // Cheap cooldown burn+silence when in range — top priority whenever we can land it.
  if (api.ready('k3') && dist <= 4.7 && enemy.visible) {
    api.use('k3', { x: enemy.x, z: enemy.z });
    return;
  }

  // Dash for big burst damage + burn.
  if (api.ready('k1') && dist <= 10.3 && dist > 0.8 && enemy.visible) {
    api.use('k1', { x: enemy.x, z: enemy.z });
    return;
  }

  // Keep the speed boost up whenever it's not already running.
  const boosted = self.maxSpeed > 5.8 * 1.15;
  if (api.ready('k2') && !boosted) {
    api.use('k2');
    return;
  }

  if (p.t < 1) {
    api.say('Burn well.');
  }
}