function think(p, api) {
  if (!p.self.alive) return;

  const self = p.self, enemy = p.enemy;
  const dist = enemy.dist;

  // --- react to enemy's dash telegraph: sidestep the corridor ---
  if (enemy.casting && enemy.casting.telegraph && enemy.casting.skill === 'k1'
      && enemy.casting.phase === 'windup' && !self.stunned) {
    let side = api.recall('dodgeSide', null);
    if (side === null) {
      side = (self.x - enemy.x) + (self.z - enemy.z) >= 0 ? 1 : -1;
      api.remember('dodgeSide', side);
    }
    const away = V.away(self, enemy); // from enemy to self
    const perp = V.scale(V.perp(away), side);
    let dodge = V.add(self, V.scale(perp, 6));
    dodge.x = Math.max(-18, Math.min(18, dodge.x));
    dodge.z = Math.max(-18, Math.min(18, dodge.z));
    api.moveTo(dodge.x, dodge.z);
    api.faceAt(enemy.x, enemy.z);
    api.say('Not today.');
    return;
  } else {
    api.forget('dodgeSide');
  }

  // --- self-preservation: shield/heal when hurt and available ---
  const hpFrac = self.hp / self.maxHp;
  if (!self.busy && api.ready('k3') && (hpFrac < 0.55 || (self.burning && hpFrac < 0.8))) {
    api.use('k3');
    api.say('Patch it up.');
    return;
  }

  // --- offense ---
  const k2 = self.kit.k2;
  const k1 = self.kit.k1;
  const k2Reach = k2 ? k2.range + enemy.radius : 4.9;
  const k1Reach = k1 ? k1.distance + self.radius + enemy.radius : 11.183;

  if (!self.busy && !self.stunned && !self.silenced) {
    if (dist <= k2Reach && enemy.y <= 0.35 && enemy.visible && api.ready('k2')) {
      api.use('k2', { x: enemy.x, z: enemy.z });
      api.say('Sweep!');
      return;
    }
    if (dist <= k1Reach && enemy.visible && api.ready('k1')) {
      api.use('k1', { x: enemy.x, z: enemy.z });
      api.say('Closing in!');
      return;
    }
    if (dist > k2Reach && api.ready('k3') && hpFrac < 0.95) {
      api.use('k3');
      api.say('Top up.');
      return;
    }
  }

  // --- positioning: close distance if not casting, keep facing enemy ---
  if (!self.rooted) {
    if (dist > k2Reach - 0.3) {
      api.moveTo(enemy.x, enemy.z);
    } else if (dist < 2.0) {
      // too close and nothing to fire, back off slightly to reset k1 range
      const back = V.add(self, V.scale(V.away(self, enemy), 3));
      api.moveTo(
        Math.max(-18, Math.min(18, back.x)),
        Math.max(-18, Math.min(18, back.z))
      );
    } else {
      api.moveTo(enemy.x, enemy.z);
    }
  }
  api.faceAt(enemy.x, enemy.z);
}