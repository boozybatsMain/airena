function think(p, api) {
  const self = p.self, enemy = p.enemy;
  if (!self.alive) return;

  // remember boost timing across thoughts
  let boostUntil = api.recall('boostUntil', -999);

  const dist = enemy.dist;
  const canSeeEnemy = enemy.visible;

  // evasive reaction to enemy telegraphed skills
  if (enemy.casting && enemy.casting.telegraph) {
    if (enemy.casting.skill === 'k2' && dist < 5.2) {
      // cone stun incoming - back off
      const away = V.away(self, enemy);
      api.move(away.x, away.z);
      api.faceAt(enemy.x, enemy.z);
      if (api.ready('k1') && dist <= 11 && canSeeEnemy) {
        api.use('k1', { x: enemy.x, z: enemy.z });
      }
      return;
    }
    if (enemy.casting.skill === 'k1' && dist < 11) {
      // dash incoming - sidestep off the line
      const toEnemy = V.toward(self, enemy);
      const side = V.perp(toEnemy);
      const dodge = V.add(self, V.scale(side, 3));
      api.moveTo(dodge.x, dodge.z);
      api.faceAt(enemy.x, enemy.z);
      return;
    }
  }

  if (self.busy) {
    // keep pressing toward enemy while our cast resolves (movement still allowed unless dashing/stunned)
    if (!self.casting || self.casting.phase !== 'dash') {
      api.moveTo(enemy.x, enemy.z);
    }
    return;
  }

  // refresh boost if it's about to lapse and we're actually fighting
  if (p.t > boostUntil - 0.4 && api.ready('k3') && dist < 16) {
    api.use('k3');
    api.remember('boostUntil', p.t + 4);
    api.faceAt(enemy.x, enemy.z);
    return;
  }

  if (canSeeEnemy && dist <= 4.9 && api.ready('k2')) {
    api.use('k2', { x: enemy.x, z: enemy.z });
    return;
  }

  if (canSeeEnemy && dist <= 11 && dist > 3 && api.ready('k1')) {
    api.use('k1', { x: enemy.x, z: enemy.z });
    return;
  }

  // close the gap
  api.moveTo(enemy.x, enemy.z);
  api.faceAt(enemy.x, enemy.z);

  if (p.t > 4 && (p.tick % 200 === 0)) {
    api.say('Come here.');
  }
}