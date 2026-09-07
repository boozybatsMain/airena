function think(p, api) {
  if (!p.self.alive) return;
  const self = p.self, enemy = p.enemy;
  const dist = enemy.dist;

  // keep facing the enemy; ignored automatically while an aim-lock is running
  api.faceAt(enemy.x, enemy.z);

  // maintain a ring distance: this single formula both closes and retreats
  const targetDist = 19;
  const dirEnemyToSelf = V.toward(enemy, self); // unit vector enemy -> self
  let ringX = enemy.x + dirEnemyToSelf.x * targetDist;
  let ringZ = enemy.z + dirEnemyToSelf.z * targetDist;
  ringX = Math.max(-18, Math.min(18, ringX));
  ringZ = Math.max(-18, Math.min(18, ringZ));
  api.moveTo(ringX, ringZ);

  // k1 — beam poke at range, with a light lead on their velocity
  if (api.ready('k1') && enemy.visible && dist <= 26) {
    const w = (self.kit.k1 && self.kit.k1.windup) || 0.5;
    api.use('k1', { x: enemy.x + enemy.vx * w, z: enemy.z + enemy.vz * w });
  }

  // k3 — drop a burn disc when they're inside its real reach
  if (api.ready('k3') && dist <= 15.5) {
    const w = (self.kit.k3 && self.kit.k3.windup) || 0.467;
    api.use('k3', { x: enemy.x + enemy.vx * w, z: enemy.z + enemy.vz * w });
  }

  // k2 — blink: dodge an incoming strike, bail out at low hp, or close a big gap
  const hpFrac = self.hp / self.maxHp;
  if (api.ready('k2')) {
    const dangerousCast = enemy.casting && enemy.casting.telegraph &&
      (enemy.casting.skill === 'k1' || enemy.casting.skill === 'k3');

    if (dangerousCast && enemy.casting.remaining < 0.18 && dist < 12) {
      api.use('k2', {
        x: self.x + dirEnemyToSelf.x * 6,
        z: self.z + dirEnemyToSelf.z * 6,
      });
    } else if (hpFrac < 0.3 && dist < 10) {
      api.use('k2', {
        x: self.x + dirEnemyToSelf.x * 6,
        z: self.z + dirEnemyToSelf.z * 6,
      });
    } else if (dist > 27) {
      api.use('k2', { x: enemy.x, z: enemy.z });
    }
  }

  api.say('Hold the line, burn true.');
}