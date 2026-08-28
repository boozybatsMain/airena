function think(p, api) {
  const toEnemy = V.toward(p.self, p.enemy);
  const distToEnemy = p.enemy.dist;
  
  api.faceAt(p.enemy.x, p.enemy.z);
  
  if (p.self.busy || p.self.stunned || p.self.airborne) {
    return;
  }
  
  if (distToEnemy < 5.5 && api.ready('smash')) {
    api.use('smash');
    return;
  }
  
  if (distToEnemy > 3 && distToEnemy < 20 && api.ready('charge')) {
    api.use('charge');
    return;
  }
  
  if (distToEnemy > 2.5) {
    api.move(toEnemy.x, toEnemy.z);
  }
}