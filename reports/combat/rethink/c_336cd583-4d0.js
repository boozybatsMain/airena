function think(p, api) {
  const self = p.self;
  const enemy = p.enemy;
  const dist = enemy.dist;

  if (!api.recall('greeted', false)) {
    api.remember('greeted', true);
    api.say('Close the gap. That is the whole plan.');
  }

  // Evade an incoming cone swing: step straight back while it winds up
  if (enemy.casting && enemy.casting.telegraph && enemy.casting.skill === 'k3' && dist < 5.4) {
    const away = V.away(self, enemy);
    api.move(away.x, away.z);
  } else if (dist > 1.0) {
    api.moveTo(enemy.x, enemy.z);
  } else {
    api.stop();
  }

  api.faceAt(enemy.x, enemy.z);

  if (self.busy) return;

  // Priority 1: melee damage
  if (dist <= 4.9 && enemy.visible && api.ready('k3')) {
    api.use('k3', { x: enemy.x, z: enemy.z });
    return;
  }

  // Priority 2: silence an enemy cast, especially their own melee windup
  if (enemy.casting && enemy.casting.telegraph && dist <= 18.7 && api.ready('k2')) {
    api.use('k2', { x: enemy.x, z: enemy.z });
    return;
  }

  // Priority 3: blind while closing, so they lose track of the approach
  if (dist > 4.9 && dist <= 18 && enemy.visible && api.ready('k1')) {
    api.use('k1', { x: enemy.x, z: enemy.z });
    return;
  }

  // Priority 4: poke with silence even without a visible telegraph
  if (dist > 4.9 && dist <= 15 && api.ready('k2')) {
    api.use('k2', { x: enemy.x, z: enemy.z });
    return;
  }
}