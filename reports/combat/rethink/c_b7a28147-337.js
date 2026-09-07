function think(p, api) {
  const self = p.self;
  const enemy = p.enemy;
  if (!self.alive) return;

  const dist = enemy.dist;
  const hpFrac = self.hp / self.maxHp;

  // --- defensive / sustain ---
  if (hpFrac < 0.55 && api.ready('k2')) {
    api.use('k2');
  } else if (
    enemy.casting &&
    enemy.casting.telegraph &&
    enemy.casting.skill === 'k3' &&
    dist <= 6.5 &&
    self.shield < 2 &&
    api.ready('k2')
  ) {
    api.use('k2');
  }

  // --- offense: melee cone ---
  if (dist <= 4.7 && enemy.visible && api.ready('k3')) {
    api.use('k3', { x: enemy.x, z: enemy.z });
  }

  // --- retreat when critically low ---
  if (hpFrac < 0.22 && dist < 7) {
    api.faceAt(enemy.x, enemy.z);
    if (api.ready('k1')) {
      api.use('k1', { x: enemy.x, z: enemy.z });
    }
    const flee = V.away(self, enemy);
    const target = {
      x: Math.max(-18, Math.min(18, self.x + flee.x * 6)),
      z: Math.max(-18, Math.min(18, self.z + flee.z * 6)),
    };
    api.moveTo(target.x, target.z);
    return;
  }

  // --- opportunistic wall while mid-range, not urgently attacking ---
  if (
    api.ready('k1') &&
    dist > 4.9 &&
    dist < 13 &&
    enemy.visible &&
    !self.busy
  ) {
    api.faceAt(enemy.x, enemy.z);
    api.use('k1', { x: enemy.x, z: enemy.z });
  }

  // --- close the distance to keep pressure with k3 ---
  api.moveTo(enemy.x, enemy.z);
  api.faceAt(enemy.x, enemy.z);

  if (p.t < 1) {
    api.say('Come closer.');
  }
}