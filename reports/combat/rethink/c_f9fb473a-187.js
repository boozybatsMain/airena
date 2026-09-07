function think(p, api) {
  const self = p.self;
  const enemy = p.enemy;
  if (!self.alive) return;

  // always try to face the enemy; harmless if locked during a windup
  if (enemy && enemy.alive !== false) {
    api.faceAt(enemy.x, enemy.z);
  }

  // dodge an enemy zone we're standing in, if we can move
  if (!self.rooted && p.arena && p.arena.zones) {
    for (const z of p.arena.zones) {
      if (z.mine) continue;
      const dx = self.x - z.x, dz = self.z - z.z;
      const d = Math.hypot(dx, dz);
      const catchR = z.r + self.radius + 0.6;
      if (d < catchR) {
        let away = { x: dx, z: dz };
        if (d < 0.001) away = { x: 1, z: 0 };
        else away = { x: dx / d, z: dz / d };
        const tx = self.x + away.x * 6;
        const tz = self.z + away.z * 6;
        const cx = Math.max(-19, Math.min(19, tx));
        const cz = Math.max(-19, Math.min(19, tz));
        api.moveTo(cx, cz);
        break;
      }
    }
  }

  // orbit/hold a comfortable distance from the enemy
  if (enemy) {
    const desired = 7.5;
    let away = V.away(enemy, self);
    if (away.x === 0 && away.z === 0) away = { x: 0, z: 1 };
    let tx = enemy.x + away.x * desired;
    let tz = enemy.z + away.z * desired;
    tx = Math.max(-19, Math.min(19, tx));
    tz = Math.max(-19, Math.min(19, tz));
    api.moveTo(tx, tz);
  }

  if (self.busy) return;

  const canK1 = self.skills.includes('k1');
  const canK2 = self.skills.includes('k2');
  const canK3 = self.skills.includes('k3');

  const dist = enemy ? enemy.dist : 999;

  const predict = (windup) => {
    const w = windup || 0.467;
    return {
      x: enemy.x + (enemy.vx || 0) * w,
      z: enemy.z + (enemy.vz || 0) * w,
    };
  };

  // if enemy is about to land damage on us, shield up first if possible
  if (
    canK3 &&
    api.ready('k3') &&
    self.shield <= 0 &&
    enemy &&
    enemy.casting &&
    enemy.casting.telegraph &&
    (enemy.casting.skill === 'k2')
  ) {
    api.use('k3');
    return;
  }

  if (canK2 && api.ready('k2') && enemy && dist <= 16) {
    const wu = (self.kit && self.kit.k2 && self.kit.k2.windup) || 0.467;
    const pt = predict(wu);
    api.use('k2', pt);
    return;
  }

  if (canK1 && api.ready('k1') && enemy && dist <= 16) {
    const wu = (self.kit && self.kit.k1 && self.kit.k1.windup) || 0.467;
    const pt = predict(wu);
    api.use('k1', pt);
    return;
  }

  if (canK3 && api.ready('k3') && self.shield <= 0) {
    api.use('k3');
    return;
  }
}