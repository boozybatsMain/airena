function think(p, api) {
  const self = p.self, enemy = p.enemy;
  if (!self.alive) return;

  api.moveTo(enemy.x, enemy.z);
  api.faceAt(enemy.x, enemy.z);

  if (self.busy) return;

  const dist = enemy.dist;

  // Reactive shield: they're winding something up, catch some of it if we can.
  if (enemy.casting && enemy.casting.telegraph && self.shield <= 0 && api.ready('k3')) {
    api.use('k3');
    return;
  }

  // Melee cone: close, on the floor, clear line.
  if (dist <= 4.9 && !enemy.airborne && enemy.visible && api.ready('k1')) {
    api.use('k1', { x: enemy.x, z: enemy.z });
    return;
  }

  // Dash: close the gap or hit if already in range.
  if (dist <= 11 && api.ready('k2')) {
    api.use('k2', { x: enemy.x, z: enemy.z });
    return;
  }

  // Nothing better to do: keep a shield up if it's free.
  if (self.shield <= 0 && api.ready('k3')) {
    api.use('k3');
    return;
  }
}