function think(p, api) {
  const self = p.self;
  const enemy = p.enemy;
  if (!self.alive) return;

  // flavor lines, throttled by the engine itself
  if (p.t < 0.5) {
    api.say('Let\'s dance.');
  } else if (self.hp < self.maxHp * 0.3) {
    api.say('Not done yet.');
  } else if (p.events.some(e => e.type === 'dealt' && e.amount > 0)) {
    api.say('Feel that?');
  }

  const dist = enemy.dist;
  const telegraphed = enemy.casting && enemy.casting.telegraph;

  // Dodge: opponent is winding up something — back off from where we were,
  // since their aim point was fixed to our old position.
  if (telegraphed && enemy.casting.phase === 'windup' && !self.busy) {
    const dir = V.away(self, enemy);
    const target = {
      x: self.x + dir.x * 6,
      z: self.z + dir.z * 6,
    };
    api.moveTo(target.x, target.z);
    api.faceAt(enemy.x, enemy.z);
    return;
  }

  // Offense priority: stun-cone when in range, dash otherwise, self-boost as filler.
  if (self.skills.includes('k2') && dist <= 4.9 && api.ready('k2')) {
    api.use('k2', { x: enemy.x, z: enemy.z });
    api.faceAt(enemy.x, enemy.z);
    return;
  }

  if (self.skills.includes('k1') && dist <= 11 && dist > 0.1 && api.ready('k1')) {
    api.use('k1', { x: enemy.x, z: enemy.z });
    api.faceAt(enemy.x, enemy.z);
    return;
  }

  if (self.skills.includes('k3') && api.ready('k3')) {
    api.use('k3');
  }

  // Close the gap and keep facing them while nothing else is available.
  if (!self.busy) {
    api.moveTo(enemy.x, enemy.z);
    api.faceAt(enemy.x, enemy.z);
  }
}