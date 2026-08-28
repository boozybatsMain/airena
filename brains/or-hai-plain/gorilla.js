let state = {
  lastEnemyPos: null,
  enemyPredictedPos: null,
  strategy: 'hunt',
  lastSeen: 0
};

function think(p, api) {
  // Core strategy: get close, use smash and charge to deal damage
  
  const self = p.self;
  const enemy = p.enemy;
  const dist = enemy.dist;
  
  state.lastSeen++;
  
  // Update enemy tracking
  if (enemy.visible || p.events.some(e => e.type === 'dealt')) {
    state.lastEnemyPos = { x: enemy.x, z: enemy.z };
    state.lastSeen = 0;
  }
  
  // If we haven't seen enemy recently, search
  if (state.lastSeen > 30) {
    api.move(Math.sin(self.heading) * 5, Math.cos(self.heading) * 5);
    return;
  }
  
  // Face toward enemy
  if (enemy.visible) {
    const dx = enemy.x - self.x;
    const dz = enemy.z - self.z;
    api.faceAt(enemy.x, enemy.z);
    
    // Decide action based on distance and cooldowns
    const smashReady = api.ready('smash');
    const chargeReady = api.ready('charge');
    const jumpReady = api.ready('jump');
    
    // If enemy is casting laser, jump or charge away
    if (enemy.casting && enemy.casting.skill === 'laser' && enemy.casting.phase === 'windup') {
      if (jumpReady) {
        api.use('jump');
      } else if (chargeReady && dist > 5) {
        // Charge perpendicular to enemy
        const perpDir = V.perp(V.toward({x: self.x, z: self.z}, {x: enemy.x, z: enemy.z}));
        api.face(perpDir.x, perpDir.z);
        api.use('charge');
      } else {
        // Move sideways
        const away = V.away({x: self.x, z: self.z}, {x: enemy.x, z: enemy.z});
        const perp = V.perp(away);
        api.move(perp.x * 5, perp.z * 5);
      }
    }
    // If enemy is blinking away, predict and follow
    else if (enemy.casting && enemy.casting.skill === 'blink') {
      api.move(0, 0);
    }
    // Close distance with charge or movement
    else if (dist > 6 && chargeReady && !self.busy) {
      api.use('charge');
    }
    // Use smash when in range
    else if (dist < 5.5 && smashReady && !self.busy) {
      api.use('smash');
    }
    // Move closer
    else if (dist > 3.5 && !self.busy) {
      const toward = V.toward({x: self.x, z: self.z}, {x: enemy.x, z: enemy.z});
      api.move(toward.x * self.maxSpeed, toward.z * self.maxSpeed);
    }
    // Maintain distance if too close
    else if (dist < 2.5) {
      const away = V.away({x: self.x, z: self.z}, {x: enemy.x, z: enemy.z});
      api.move(away.x * 3, away.z * 3);
    }
  } else if (state.lastEnemyPos) {
    // Move toward last known position
    const pathResult = api.pathTo(state.lastEnemyPos.x, state.lastEnemyPos.z);
    if (pathResult) {
      api.moveTo(state.lastEnemyPos.x, state.lastEnemyPos.z);
    }
  }
  
  // Dodge if we're about to be hit
  const incomingLaser = enemy.casting && enemy.casting.skill === 'laser' && 
                        enemy.casting.phase !== 'windup' && api.los(enemy.x, enemy.z);
  if (incomingLaser && api.ready('jump')) {
    api.use('jump');
  }
}