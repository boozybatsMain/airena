function think(p, api) {
  const self = p.self, enemy = p.enemy;
  if (!self.alive) return;

  const dist = enemy.dist;
  const k1reach = 4.9;
  const k2max = 11;
  const k2min = 5.0; // avoid dashing when already in melee range

  // keep facing enemy when nothing locks it
  if (!self.busy) {
    api.faceAt(enemy.x, enemy.z);
  }

  if (self.busy || self.stunned || self.silenced) {
    // just keep closing distance while locked out, movement still allowed
    // unless we're mid-dash travel (handled automatically by world)
    return;
  }

  // Defensive shield: top up before we get burned down or when enemy telegraphs
  const wantShield = self.shield <= 0 &&
    (self.hp < self.maxHp * 0.55 || (enemy.casting && enemy.casting.telegraph));
  if (wantShield && api.ready('k3')) {
    api.use('k3');
    return;
  }

  // Melee cone if in range and line of sight clear
  if (dist <= k1reach && enemy.visible && api.ready('k1')) {
    api.use('k1', { x: enemy.x, z: enemy.z });
    return;
  }

  // Dash in from mid range
  if (dist > k2min && dist <= k2max && enemy.visible && api.ready('k2')) {
    api.use('k2', { x: enemy.x, z: enemy.z });
    return;
  }

  // Nothing ready right now — try opportunistic shield if fully down and idle
  if (self.shield <= 0 && api.ready('k3') && dist > k1reach) {
    api.use('k3');
  }

  // Close the distance
  api.moveTo(enemy.x, enemy.z);
}