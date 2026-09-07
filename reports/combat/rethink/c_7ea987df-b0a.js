function think(p, api) {
  const self = p.self;
  const enemy = p.enemy;
  if (!self.alive) return;

  // occasional flavor text, cheap and rate-limited by the engine itself
  if (p.t < 0.2) api.say('Let\'s dance.');

  const toE = V.toward(self, enemy);

  // Dodge an incoming bolt by strafing perpendicular to the line to the enemy.
  if (enemy.casting && enemy.casting.telegraph && enemy.casting.skill === 'k2') {
    let side = api.recall('dodgeSide', null);
    if (side === null) {
      side = api.rand() < 0.5 ? -1 : 1;
      api.remember('dodgeSide', side);
    }
    const perp = V.perp(toE);
    api.move(perp.x * side, perp.z * side);
  } else {
    // Close the distance otherwise; melee (k3) is our best dps.
    api.moveTo(enemy.x, enemy.z);
  }

  if (self.busy) return;

  const dist = enemy.dist;

  // Prefer the cone: highest damage, shortest cooldown.
  if (dist <= 4.9 && enemy.y < 0.36 && api.ready('k3')) {
    if (api.los(enemy.x, enemy.z)) {
      api.use('k3', { x: enemy.x, z: enemy.z });
      return;
    }
  }

  // Bolt to root and chip when at range, or to punish a fleeing enemy.
  if (dist <= 18 && api.ready('k2')) {
    const speed = (self.kit.k2 && self.kit.k2.speed) || 22;
    const lead = V.lead(self, enemy, { x: enemy.vx, z: enemy.vz }, speed);
    api.use('k2', lead);
    return;
  }

  // Zone as filler damage/control when the others are down.
  if (dist <= 12 && api.ready('k1')) {
    const windup = 0.467;
    const predicted = {
      x: enemy.x + enemy.vx * windup,
      z: enemy.z + enemy.vz * windup,
    };
    api.use('k1', predicted);
    return;
  }
}