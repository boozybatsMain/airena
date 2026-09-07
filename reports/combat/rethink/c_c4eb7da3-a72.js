function think(p, api) {
  const self = p.self, enemy = p.enemy;
  if (!self.alive) return;

  const k1 = self.kit.k1, k2 = self.kit.k2, k3 = self.kit.k3;
  const dist = enemy.dist;

  const dirToEnemy = V.toward(self, enemy);      // self -> enemy
  const retreatDir  = V.away(self, enemy);       // away from enemy
  const perp        = V.perp(dirToEnemy);

  // pick perpendicular sign that biases us toward the arena centre
  const dot = self.x * perp.x + self.z * perp.z;
  const sign = dot > 0 ? -1 : 1;
  const dodgeDir = { x: perp.x * sign, z: perp.z * sign };

  // one-time taunt
  if (p.t < 0.5) api.say('Hold still.');

  let usedAbility = false;

  // 1) dodge an incoming telegraphed strike with a blink (also grants a shield)
  const dangerCast = enemy.casting && enemy.casting.telegraph &&
                      (enemy.casting.skill === 'k1' || enemy.casting.skill === 'k3');
  if (!usedAbility && dangerCast && api.ready('k2') && dist < 19) {
    api.use('k2', dodgeDir.x, dodgeDir.z);
    usedAbility = true;
  }

  // 2) escape if enemy zone (theirs) is sitting on top of us
  let enemyZone = null;
  for (const z of p.arena.zones) {
    if (!z.mine) {
      const d = Math.hypot(self.x - z.x, self.z - z.z);
      if (d < z.r + self.radius + 0.6) { enemyZone = z; break; }
    }
  }
  if (!usedAbility && enemyZone && api.ready('k2')) {
    const away = V.norm({ x: self.x - enemyZone.x, z: self.z - enemyZone.z });
    api.use('k2', away.x || retreatDir.x, away.z || retreatDir.z);
    usedAbility = true;
  }

  // 3) offense: prefer k1 bolt (cheap cooldown), else k3 zone
  if (!usedAbility && api.ready('k1') && dist <= 18 && enemy.visible) {
    const lead = V.lead(self, enemy, { x: enemy.vx, z: enemy.vz }, (k1 && k1.speed) || 22);
    api.use('k1', lead);
    usedAbility = true;
  }

  if (!usedAbility && api.ready('k3') && dist <= 12) {
    const wu = (k3 && k3.windup) || 0.467;
    const predict = { x: enemy.x + enemy.vx * wu, z: enemy.z + enemy.vz * wu };
    api.use('k3', predict);
    usedAbility = true;
  }

  // 4) if nothing else, and enemy is uncomfortably close, hop out with k2 for space + shield
  if (!usedAbility && dist < 3.2 && api.ready('k2')) {
    api.use('k2', retreatDir.x, retreatDir.z);
    usedAbility = true;
  }

  // Movement: kite at a distance that keeps us inside our own k1 range
  // but outside their k3 zone range when possible.
  const preferred = 15;
  if (enemyZone) {
    const away = V.norm({ x: self.x - enemyZone.x, z: self.z - enemyZone.z });
    api.move(away.x || retreatDir.x, away.z || retreatDir.z);
  } else if (dist > preferred + 1.5) {
    api.move(dirToEnemy.x, dirToEnemy.z);
  } else if (dist < preferred - 1.5) {
    api.move(retreatDir.x, retreatDir.z);
  } else {
    const strafeSign = Math.sin(p.t * 0.9) >= 0 ? 1 : -1;
    api.move(perp.x * strafeSign, perp.z * strafeSign);
  }

  // Facing: keep eyes on the target (ignored automatically during an aim-locked windup)
  api.faceAt(enemy.x, enemy.z);
}