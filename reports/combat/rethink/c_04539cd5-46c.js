function think(p, api) {
  const self = p.self;
  const enemy = p.enemy;
  if (!self.alive) return;

  const dist = enemy.dist;
  const canAct = self.alive && !self.stunned && !self.silenced && !self.busy;

  // Dodge an incoming dash (k1) by stepping sideways off its line.
  const enemyDashing =
    enemy.casting && enemy.casting.telegraph && enemy.casting.skill === 'k1';

  if (enemyDashing && dist < 12) {
    const toEnemy = V.toward(self, enemy);
    const side = V.perp(toEnemy);
    const away = V.add(self, V.scale(side, 4));
    api.moveTo(away.x, away.z);
  } else if (dist > 2.0) {
    api.moveTo(enemy.x, enemy.z);
  } else {
    api.face(enemy.x - self.x, enemy.z - self.z);
    // small strafe so we're not a static target while still in melee
    const side = V.perp(V.toward(self, enemy));
    const strafeSign = Math.sin(p.t * 1.7) > 0 ? 1 : -1;
    const target = V.add(self, V.scale(side, 2.2 * strafeSign));
    api.moveTo(target.x, target.z);
  }

  if (canAct) {
    const k2r = api.ready('k2');
    const k1r = api.ready('k1');
    const k3r = api.ready('k3');
    const enemyLow = enemy.y <= 0.35;
    const canSee = enemy.visible;

    if (dist <= 4.9 && k2r && canSee && enemyLow) {
      api.use('k2', { x: enemy.x, z: enemy.z });
    } else if (dist <= 11 && k1r && canSee && enemyLow) {
      api.use('k1', { x: enemy.x, z: enemy.z });
    } else if (k3r) {
      const lead = {
        x: enemy.x + enemy.vx * 0.467,
        z: enemy.z + enemy.vz * 0.467,
      };
      api.use('k3', lead);
    } else if (dist <= 11 && k1r && canSee) {
      api.use('k1', { x: enemy.x, z: enemy.z });
    }
  }

  if (p.t > 1 && Math.floor(p.t) % 10 === 0) {
    api.say('Hold still.');
  }
}