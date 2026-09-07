function think(p, api) {
  const self = p.self, enemy = p.enemy;
  if (!self.alive) return;

  const dist = enemy.dist;

  // Chase the enemy at all times; api handles pathing around blocks.
  api.moveTo(enemy.x, enemy.z);
  api.faceAt(enemy.x, enemy.z);

  if (p.t < 1) api.say('Come closer.');

  if (self.busy) return; // can't order anything new anyway

  const incomingMelee = enemy.casting && enemy.casting.telegraph &&
    (enemy.casting.skill === 'k1' || enemy.casting.skill === 'k2');

  const wantShield = self.shield <= 0 &&
    (incomingMelee || self.hp < 110 || p.burn > 0);

  // Priority 1: defensive shield when it matters and it's ready.
  if (wantShield && api.ready('k3')) {
    api.use('k3');
    return;
  }

  // Priority 2: close-range cone strike if we have a clear line.
  if (dist <= 4.9 && enemy.visible && api.ready('k1') && !enemy.invulnerable) {
    api.use('k1', { x: enemy.x, z: enemy.z });
    return;
  }

  // Priority 3: dash strike to close distance and hit.
  if (dist <= 11 && enemy.visible && api.ready('k2') && !enemy.invulnerable) {
    api.use('k2', { x: enemy.x, z: enemy.z });
    return;
  }

  // Priority 4: nothing urgent to spend, but top off shield if idle.
  if (self.shield <= 0 && api.ready('k3') && dist > 4.9) {
    api.use('k3');
  }
}