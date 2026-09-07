function think(p, api) {
  const self = p.self, enemy = p.enemy;
  if (!self.alive) return;

  const dist = enemy.dist;

  // Mid own cast: nothing to do, aim lock already holds
  if (self.casting) return;

  // Enemy has an ability winding up — try to dodge sideways to break cone/dash line
  if (enemy.casting && enemy.casting.telegraph && dist < 12) {
    const away = V.away(enemy, self); // points from enemy to self
    const side = V.perp(away);
    const dodgeDir = api.rand() < 0.5 ? side : V.scale(side, -1);
    const dodgeTarget = {
      x: self.x + dodgeDir.x * 4,
      z: self.z + dodgeDir.z * 4
    };
    api.moveTo(dodgeTarget.x, dodgeTarget.z);
    api.faceAt(enemy.x, enemy.z);
    return;
  }

  const stunBlocked = enemy.immune && (enemy.immune.includes('act') || enemy.immune.includes('move'));

  // In cone range: melee for damage + knock
  if (dist <= 4.9 && api.ready('k1')) {
    api.use('k1', { x: enemy.x, z: enemy.z });
    return;
  }

  // Mid range: dash-stun to lock them for a follow-up
  if (dist <= 11 && api.ready('k3') && !stunBlocked) {
    api.use('k3', { x: enemy.x, z: enemy.z });
    return;
  }

  // Mid range fallback: dash for damage even without stun
  if (dist <= 11 && api.ready('k2')) {
    api.use('k2', { x: enemy.x, z: enemy.z });
    return;
  }

  // Nothing ready or too far: close the gap
  api.moveTo(enemy.x, enemy.z);
  api.faceAt(enemy.x, enemy.z);
}