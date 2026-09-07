function think(p, api) {
  if (!p.self.alive) return;

  const enemy = p.enemy;
  const self = p.self;
  const dist = enemy.dist;

  // Emergency cleanse/shield if low hp and k2 ready
  if (self.hp < self.maxHp * 0.3 && api.ready('k2') && !self.shield) {
    // blink away from enemy
    const away = V.away(enemy, self);
    api.use('k2', { x: self.x + away.x * 6.5, z: self.z + away.z * 6.5 });
    api.say('Not today!');
    return;
  }

  // If enemy is casting something dangerous and we can interrupt with silence beam, prioritize
  const enemyCasting = enemy.casting && enemy.casting.telegraph;

  // Maintain facing on enemy generally
  api.faceAt(enemy.x, enemy.z);

  // Use k3 beam if in range and line of sight, high priority (damage+silence)
  const k3 = self.kit.k3;
  const k1 = self.kit.k1;

  if (k3 && dist <= 24 && enemy.visible && api.ready('k3')) {
    api.use('k3', { x: enemy.x, z: enemy.z });
  } else if (k1 && dist <= 18 && enemy.visible && api.ready('k1')) {
    // lead the target for the bolt
    const lead = V.lead(self, enemy, { x: enemy.vx, z: enemy.vz }, k1.speed || 22);
    api.use('k1', { x: lead.x, z: lead.z });
  } else if (api.ready('k2') && dist > 12 && !enemyCasting) {
    // close gap with blink if far and safe
    const toward = V.toward(self, enemy);
    const target = { x: self.x + toward.x * 6, z: self.z + toward.z * 6 };
    api.use('k2', target);
  }

  // Movement: kite - try to stay at mid range, strafe
  const idealRange = 10;
  if (dist > idealRange + 2) {
    api.moveTo(enemy.x, enemy.z);
  } else if (dist < idealRange - 3) {
    const away = V.away(enemy, self);
    api.move(away.x, away.z);
  } else {
    // strafe perpendicular
    const dir = V.toward(self, enemy);
    const perp = V.perp(dir);
    const sign = (p.tick % 60 < 30) ? 1 : -1;
    api.move(perp.x * sign, perp.z * sign);
  }

  // occasional taunt
  if (p.tick % 90 === 0) {
    api.say('Stand still.');
  }
}