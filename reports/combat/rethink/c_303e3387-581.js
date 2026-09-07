function think(p, api) {
  const self = p.self;
  const enemy = p.enemy;
  if (!self.alive) return;

  // keep facing the enemy; locked aims from our own windup ignore this automatically
  api.faceAt(enemy.x, enemy.z);

  const dist = enemy.dist;
  const visible = enemy.visible;
  const hpFrac = self.hp / self.maxHp;

  const enemyThreat = enemy.casting && enemy.casting.telegraph &&
    (enemy.casting.skill === 'k1' || enemy.casting.skill === 'k2');

  let actedAbility = false;

  if (!self.busy) {
    if (api.ready('k3') && (hpFrac < 0.5 || (enemyThreat && self.shield < 5))) {
      api.use('k3');
      actedAbility = true;
    } else if (api.ready('k1') && dist <= 4.9 && visible) {
      const w = (self.kit.k1 && self.kit.k1.windup) || 0.3;
      const lead = { x: enemy.x + enemy.vx * w, z: enemy.z + enemy.vz * w };
      api.use('k1', lead);
      actedAbility = true;
    } else if (api.ready('k2') && dist <= 16) {
      const w = (self.kit.k2 && self.kit.k2.windup) || 0.467;
      const lead = { x: enemy.x + enemy.vx * w, z: enemy.z + enemy.vz * w };
      api.use('k2', lead);
      actedAbility = true;
    }
  }

  // movement
  if (self.busy) {
    if (dist > 4.9) api.moveTo(enemy.x, enemy.z);
  } else if (actedAbility) {
    if (dist > 4.9) api.moveTo(enemy.x, enemy.z);
  } else {
    const k1cd = (self.cooldowns && self.cooldowns.k1) || 0;
    const k2cd = (self.cooldowns && self.cooldowns.k2) || 0;
    if (dist <= 4.9 && Math.min(k1cd, k2cd) > 0.6) {
      // buy time for cooldowns, back off a bit while staying in k2 threat range
      const away = V.away(self, enemy);
      const target = { x: self.x + away.x * 3, z: self.z + away.z * 3 };
      api.moveTo(target.x, target.z);
    } else {
      api.moveTo(enemy.x, enemy.z);
    }
  }

  if (p.t < 0.3) {
    api.say('Come on then.');
  }
}