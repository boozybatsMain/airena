function think(p, api) {
  if (!p.self.alive || !p.enemy.alive) return;

  const self = p.self;
  const enemy = p.enemy;
  const kit = self.kit;
  const now = p.t;
  const meleeDist = self.radius + enemy.radius;
  const dashRange = kit.k1 ? kit.k1.distance + self.radius + enemy.radius : 0;
  const coneRange = kit.k2 ? kit.k2.range + self.radius + enemy.radius : 0;

  const toEnemy = { x: enemy.x - self.x, z: enemy.z - self.z };
  const dist = V.len(toEnemy);
  const dir = V.norm(toEnemy);
  const angleToEnemy = V.angleTo(self.heading, toEnemy);

  // Emergency retreat if low health
  if (self.hp < self.maxHp * 0.3 && dist < 8) {
    api.moveTo(-self.x * 2, -self.z * 2);
    api.faceAt(-self.x, -self.z);
    return;
  }

  // Use shield if low health and available
  if (self.hp < self.maxHp * 0.5 && api.ready('k3')) {
    api.use('k3');
  }

  // If enemy is casting interruptible skill, try to stun
  if (enemy.casting && enemy.casting.telegraph && api.ready('k2')) {
    const windupLeft = enemy.casting.total - enemy.casting.elapsed;
    if (windupLeft > 0.1) {
      api.use('k2', { x: enemy.x, z: enemy.z });
      return;
    }
  }

  // If we have dash ready and enemy in range, dash
  if (api.ready('k1') && dist < dashRange && Math.abs(angleToEnemy) < 0.5) {
    api.use('k1', { x: enemy.x, z: enemy.z });
    return;
  }

  // If we have cone ready and enemy in cone, use it
  if (api.ready('k2') && dist < coneRange && Math.abs(angleToEnemy) < kit.k2.halfAngle) {
    api.use('k2', { x: enemy.x, z: enemy.z });
    return;
  }

  // If enemy is close and we can't dash, create distance
  if (dist < meleeDist + 1 && !api.ready('k1')) {
    const fleeDir = V.norm({ x: -enemy.x + self.x, z: -enemy.z + self.z });
    api.move(fleeDir.x * self.maxSpeed, fleeDir.z * self.maxSpeed);
    api.faceAt(enemy.x, enemy.z);
    return;
  }

  // Otherwise, approach and face enemy
  if (dist > 0.5) {
    const approachSpeed = Math.min(self.maxSpeed, dist * 3);
    api.move(dir.x * approachSpeed, dir.z * approachSpeed);
  } else {
    api.move(0, 0);
  }
  api.faceAt(enemy.x, enemy.z);
}