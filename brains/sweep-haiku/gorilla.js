function think(p, api) {
  const {self, enemy} = p;
  const dist = enemy.dist;
  
  // Always face the enemy
  api.faceAt(enemy.x, enemy.z);
  
  // Don't queue new skills if busy casting
  if (self.busy) return;
  
  // Priority 1: Interrupt laser with charge
  if (enemy.casting && enemy.casting.skill === 'laser' && api.ready('charge')) {
    api.use('charge');
    return;
  }
  
  // Priority 2: Smash at close range
  if (api.ready('smash') && dist < 5.15) {
    api.use('smash');
    return;
  }
  
  // Priority 3: Charge at medium range to close gap
  if (api.ready('charge') && dist > 6 && dist < 12) {
    api.use('charge');
    return;
  }
  
  // Priority 4: Move toward or stop based on distance
  if (dist > 6) {
    const dir = V.toward({x: self.x, z: self.z}, {x: enemy.x, z: enemy.z});
    api.move(dir.x, dir.z);
  } else {
    api.stop();
  }
}
