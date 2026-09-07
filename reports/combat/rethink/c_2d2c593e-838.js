function think(p, api) {
  const self = p.self, enemy = p.enemy;
  if (!self.alive) return;

  const half = 19; // stay inside walls with margin
  const clampPos = (x, z) => ({
    x: Math.max(-half, Math.min(half, x)),
    z: Math.max(-half, Math.min(half, z))
  });

  // Always keep an eye on the enemy.
  api.faceAt(enemy.x, enemy.z);

  if (self.busy) {
    // mid-cast: nothing new can start, just let standing orders run
    return;
  }

  const dist = enemy.dist;
  const toEnemy = V.toward(self, enemy);
  const away = V.away(self, enemy);

  // React fast to a shield opportunity if something is incoming and we have none up.
  const enemyThreat = enemy.casting && enemy.casting.telegraph &&
    (enemy.casting.skill === 'k1' || enemy.casting.skill === 'k2');

  // 1) Punish / interrupt with k1 if in range — highest priority.
  if (api.ready('k1') && dist <= 4.85) {
    api.use('k1', { x: enemy.x, z: enemy.z });
    return;
  }

  // 2) Dodge an incoming dash: step off their travel line.
  if (enemyThreat && enemy.casting.skill === 'k2') {
    const dir = V.fromHeading(enemy.heading);
    const toSelf = { x: self.x - enemy.x, z: self.z - enemy.z };
    const t = V.dot(toSelf, dir);
    if (t > -2 && t < 10) {
      const perp = V.perp(dir);
      const side = V.dot(toSelf, perp) >= 0 ? 1 : -1;
      const target = clampPos(self.x + perp.x * side * 5, self.z + perp.z * side * 5);
      api.moveTo(target.x, target.z);
      if (api.ready('k3') && self.shield <= 0) api.use('k3');
      return;
    }
  }

  // 3) Dodge an incoming cone by opening distance.
  if (enemyThreat && enemy.casting.skill === 'k1' && dist < 5.6) {
    const target = clampPos(self.x + away.x * 6, self.z + away.z * 6);
    api.moveTo(target.x, target.z);
    if (api.ready('k3') && self.shield <= 0) api.use('k3');
    return;
  }

  // Any other telegraphed threat while we're close: throw a shield up.
  if (enemyThreat && api.ready('k3') && self.shield <= 0) {
    api.use('k3');
  }

  // 4) Close distance with a dash if it's off cooldown and worthwhile.
  if (api.ready('k2') && dist > 3.2 && dist <= 11) {
    api.use('k2', { x: enemy.x, z: enemy.z });
    return;
  }

  // 5) Shield up proactively when hurt or about to brawl, if not already used above.
  if (api.ready('k3') && self.shield <= 0 && (self.hp < self.maxHp * 0.55 || dist < 6)) {
    api.use('k3');
    return;
  }

  // 6) Positioning: chase from afar, hold a comfortable striking distance up close.
  if (dist > 4.6) {
    api.moveTo(enemy.x, enemy.z);
  } else if (dist < 3.2) {
    const target = clampPos(self.x + away.x * 3, self.z + away.z * 3);
    api.moveTo(target.x, target.z);
  } else {
    // circle a little to stay unpredictable while cooldowns tick
    const perp = V.perp(toEnemy);
    const swing = Math.sin(p.t * 1.7) >= 0 ? 1 : -1;
    const target = clampPos(self.x + perp.x * swing * 2.5, self.z + perp.z * swing * 2.5);
    api.moveTo(target.x, target.z);
  }
}