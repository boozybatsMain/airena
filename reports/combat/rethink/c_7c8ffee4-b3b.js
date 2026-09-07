function think(p, api) {
  const self = p.self, enemy = p.enemy;
  if (!self.alive) return;

  // periodic taunts, cheap, rate-limited internally by engine
  if (p.tick % 200 === 0) {
    api.say('Hold still.');
  }

  const dx = enemy.x - self.x, dz = enemy.z - self.z;
  const dist = Math.hypot(dx, dz) || 0.0001;
  const dirToEnemy = { x: dx / dist, z: dz / dist };

  // always try to face the enemy unless our own aimed cast needs a fixed point
  // (we always aim k2/k3 at the enemy anyway, so plain faceAt is fine)
  if (!self.casting) {
    api.faceAt(enemy.x, enemy.z);
  }

  const desiredRange = 8;
  const perp = { x: -dirToEnemy.z, z: dirToEnemy.x };
  const strafe = Math.sin(p.t * 2.1) * 3.0;

  const targetX = enemy.x - dirToEnemy.x * desiredRange + perp.x * strafe;
  const targetZ = enemy.z - dirToEnemy.z * desiredRange + perp.z * strafe;

  // clamp inside arena a bit
  const half = p.arena.half - 1.5;
  const tx = Math.max(-half, Math.min(half, targetX));
  const tz = Math.max(-half, Math.min(half, targetZ));

  api.moveTo(tx, tz);

  // react to enemy telegraphs
  if (enemy.casting && enemy.casting.telegraph) {
    if (enemy.casting.skill === 'k3' && dist <= 11 && !self.busy && api.ready('k1')) {
      // dodge the lunge by hopping over it
      api.use('k1');
      return;
    }
  }

  if (self.busy) return; // can't start anything else right now

  // if enemy is stunned/controlled, burst with k3 for guaranteed extra damage
  if ((enemy.stunned) && dist <= 11 && api.ready('k3')) {
    api.use('k3', { x: enemy.x, z: enemy.z });
    return;
  }

  // main poke: k2 lob, stun + damage, keep it on cooldown
  if (api.ready('k2') && dist >= 3.7 && dist <= 15) {
    if (api.los(enemy.x, enemy.z)) {
      api.use('k2');
      return;
    }
  }

  // if k2 is down and enemy is close and not controlled, dash in with k3
  if (api.ready('k3') && dist <= 9 && !enemy.invulnerable) {
    api.use('k3', { x: enemy.x, z: enemy.z });
    return;
  }

  // otherwise, keep the speed boost rolling for better kiting/chasing
  if (api.ready('k1') && self.maxSpeed <= self.speed + 0.01 + 5.9 && self.maxSpeed < 6.5) {
    api.use('k1');
    return;
  }
}