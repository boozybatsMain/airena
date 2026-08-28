function think(p, api) {
  const { self, enemy } = p;
  if (!self.alive) return;
  if (!enemy || !enemy.alive) { api.stop(); return; }

  const dist = enemy.dist;
  const chargeReady = api.ready('charge');
  const smashReady = api.ready('smash');
  const enemyCastingLaser = enemy.casting && enemy.casting.skill === 'laser' && enemy.casting.telegraph;

  // Interrupt an incoming laser cast with a charge if we can reach them in time.
  if (enemyCastingLaser && chargeReady && !self.busy && enemy.visible && dist <= 11.5) {
    const lead = V.lead(self, enemy, { x: enemy.vx, z: enemy.vz }, 15);
    api.faceAt(lead.x, lead.z);
    api.use('charge');
    return;
  }

  // Melee range: smash is our best sustained damage, uninterruptible.
  if (dist <= 5.0 && smashReady && !self.busy) {
    api.faceAt(enemy.x, enemy.z);
    api.use('smash');
    return;
  }

  // Otherwise, if charge is ready and we have line of sight, use it to close
  // distance and/or land damage + stun, chaining into more smashes.
  if (chargeReady && !self.busy && enemy.visible && dist <= 11.5) {
    const lead = V.lead(self, enemy, { x: enemy.vx, z: enemy.vz }, 15);
    api.faceAt(lead.x, lead.z);
    api.use('charge');
    api.moveTo(enemy.x, enemy.z);
    return;
  }

  // Default: close distance and keep facing the enemy.
  api.faceAt(enemy.x, enemy.z);
  api.moveTo(enemy.x, enemy.z);
}