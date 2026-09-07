function think(p, api) {
  const self = p.self, enemy = p.enemy;
  if (!self.alive) return;

  const dist = enemy.dist;
  const eR = enemy.radius || 1.5;
  const selfR = self.radius || 1.5;
  const kit = self.kit || {};
  const k2 = kit.k2, k3 = kit.k3, k1 = kit.k1;

  const reach2 = (k2 && k2.range != null ? k2.range : 3.4) + eR;
  const reach3 = (k3 && k3.range != null ? k3.range : 3.4) + eR;
  const dashDist = (k1 && k1.distance != null ? k1.distance : 8);
  const dashReach = dashDist + eR + selfR; // per spec, ~11m centre-to-centre worst case

  const canSeeEnemy = enemy.visible;

  // Keep facing the enemy by default; a live aim-lock during our own windup
  // simply ignores this until the strike, so it's always safe to call.
  if (canSeeEnemy) api.faceAt(enemy.x, enemy.z);

  // Opportunistic interrupt: if they're winding something up and we can reach
  // them with the dash, try to knock them out of it.
  if (!self.busy && enemy.casting && enemy.casting.telegraph &&
      canSeeEnemy && dist <= dashReach && api.ready('k1')) {
    api.use('k1', { x: enemy.x, z: enemy.z });
    if (p.t < 2) api.say("Not so fast.");
    return;
  }

  if (!self.busy) {
    const coneReach = Math.min(reach2, reach3);

    if (canSeeEnemy && dist <= coneReach + 0.25) {
      const enemyLocked = enemy.stunned || (enemy.immune && enemy.immune.includes('act'));

      if (!enemyLocked && api.ready('k2')) {
        api.use('k2', { x: enemy.x, z: enemy.z });
      } else if (api.ready('k3')) {
        api.use('k3', { x: enemy.x, z: enemy.z });
      } else if (api.ready('k1') && dist > 2.0) {
        // nothing else ready and there's room to reposition/push
        api.use('k1', { x: enemy.x, z: enemy.z });
      } else {
        api.moveTo(enemy.x, enemy.z);
      }
    } else if (canSeeEnemy && dist <= dashReach && api.ready('k1')) {
      api.use('k1', { x: enemy.x, z: enemy.z });
    } else if (canSeeEnemy) {
      api.moveTo(enemy.x, enemy.z);
    } else {
      // no line of sight: walk toward their last known position anyway
      api.moveTo(enemy.x, enemy.z);
    }
  } else {
    // mid-cast: keep closing the gap where the world still lets us move
    if (canSeeEnemy) api.moveTo(enemy.x, enemy.z);
  }

  if (p.t < 1) api.say("Here we go.");
}