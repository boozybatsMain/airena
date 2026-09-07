function think(p, api) {
  if (!p.self.alive) return;

  const self = p.self;
  const enemy = p.enemy;
  const dist = enemy.dist;

  const toEnemy = V.toward(self, enemy);
  const away = V.away(self, enemy);

  // dynamic reach figures pulled from live kit where possible
  const k1 = self.kit.k1;
  const k2 = self.kit.k2;
  const k3 = self.kit.k3;

  const k1Reach = (k1 && k1.range ? k1.range : 3.4) + enemy.radius;
  const k2Reach = (k2 && k2.distance ? k2.distance : 8) + self.radius + enemy.radius;

  const canAct = self.alive && !self.stunned && !self.silenced;

  // --- defensive reaction to enemy telegraphs ---
  if (enemy.casting && enemy.casting.telegraph) {
    if (enemy.casting.skill === 'k1' && dist < k1Reach + 1.2) {
      // try to bail out of cone range
      api.move(away.x, away.z);
      api.faceAt(enemy.x, enemy.z);
      maybeShield(p, api, self, k3);
      return;
    }
    if (enemy.casting.skill === 'k2') {
      // try to step off the dash lane
      const facingDir = V.fromHeading(enemy.heading);
      const rel = { x: self.x - enemy.x, z: self.z - enemy.z };
      const along = V.dot(rel, facingDir);
      const perp = V.perp(facingDir);
      const perpAmt = V.dot(rel, perp);
      if (along > -2 && along < 10) {
        const side = perpAmt >= 0 ? 1 : -1;
        const dodge = V.add(self, V.scale(perp, side * 5));
        api.move(perp.x * side, perp.z * side);
        api.faceAt(enemy.x, enemy.z);
        maybeShield(p, api, self, k3);
        return;
      }
    }
  }

  if (!canAct || self.busy) {
    // can't order anything new, just keep facing the fight
    api.faceAt(enemy.x, enemy.z);
    return;
  }

  // --- offense ---
  if (dist <= k1Reach - 0.3 && api.ready('k1') && !enemy.invulnerable) {
    api.use('k1', { x: enemy.x, z: enemy.z });
    return;
  }

  if (dist <= k2Reach - 1.0 && dist > 1.8 && api.ready('k2') && !enemy.invulnerable) {
    const lead = {
      x: enemy.x + enemy.vx * 0.3,
      z: enemy.z + enemy.vz * 0.3,
    };
    api.use('k2', lead);
    return;
  }

  // shield up when nothing better to do
  if (maybeShield(p, api, self, k3)) return;

  // --- movement when no ability fired ---
  if (dist > k1Reach - 0.3) {
    api.moveTo(enemy.x, enemy.z);
  } else {
    // in melee range but on cooldown: keep facing, hold ground / light strafe
    api.move(0, 0);
  }
  api.faceAt(enemy.x, enemy.z);
}

function maybeShield(p, api, self, k3) {
  if (!k3) return false;
  if (self.shield && self.shield > 0) return false;
  if (!api.ready('k3')) return false;
  api.use('k3');
  return true;
}