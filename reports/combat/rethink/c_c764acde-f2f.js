const CONE_SKILLS = new Set(['k1', 'k2']);

function think(p, api) {
  const self = p.self, enemy = p.enemy;
  if (!self.alive) return;

  if (p.t < 0.3) api.say('Come get some.');

  const dist = enemy.dist;
  const reach = 4.9;

  const enemyThreat = enemy.casting && enemy.casting.telegraph &&
    CONE_SKILLS.has(enemy.casting.skill) && dist < 5.5;

  if (enemyThreat && !self.busy) {
    if (api.ready('k3')) {
      api.use('k3');
    } else {
      const away = V.away(self, enemy);
      api.move(away.x, away.z);
    }
  } else if (!self.busy) {
    if (dist > 8 && api.ready('k3')) {
      api.use('k3');
    }
    api.moveTo(enemy.x, enemy.z);
  }

  if (!self.casting) {
    api.faceAt(enemy.x, enemy.z);
  }

  if (!self.busy && enemy.alive && dist <= reach && enemy.visible) {
    if (api.ready('k2')) {
      api.use('k2', { x: enemy.x, z: enemy.z });
    } else if (api.ready('k1')) {
      api.use('k1', { x: enemy.x, z: enemy.z });
    }
  }
}