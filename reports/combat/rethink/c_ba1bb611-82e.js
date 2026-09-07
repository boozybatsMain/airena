let orbitDir = 1;
let orbitTimer = 0;
let lastDodgeSkill = null;

function think(p, api) {
  const self = p.self, enemy = p.enemy;
  if (!self.alive) return;

  orbitTimer += p.dt || 0;
  if (orbitTimer > 2.5) {
    orbitTimer = 0;
    if (api.rand() < 0.5) orbitDir *= -1;
  }

  const dist = enemy.dist;
  const toEnemy = V.toward(self, enemy);
  const awayEnemy = V.away(self, enemy);

  let dodging = false;

  if (enemy.casting && enemy.casting.telegraph && enemy.casting.skill === 'k1') {
    if (lastDodgeSkill !== enemy.casting.skill) {
      orbitDir = api.rand() < 0.5 ? 1 : -1;
      lastDodgeSkill = enemy.casting.skill;
    }
    const perp = V.perp(V.fromHeading(enemy.heading));
    api.move(perp.x * orbitDir, perp.z * orbitDir);
    dodging = true;
  } else {
    lastDodgeSkill = null;
  }

  if (!dodging) {
    const desiredRange = 11;
    const nearWallX = Math.abs(self.x) > 17;
    const nearWallZ = Math.abs(self.z) > 17;
    const nearWall = nearWallX || nearWallZ;

    if (dist > desiredRange + 2.5) {
      api.moveTo(enemy.x, enemy.z);
    } else if (dist < desiredRange - 3 && !nearWall) {
      api.move(awayEnemy.x, awayEnemy.z);
    } else {
      const perp = V.perp(toEnemy);
      api.move(perp.x * orbitDir, perp.z * orbitDir);
    }
  }

  if (!self.casting || self.casting.phase !== 'windup') {
    api.faceAt(enemy.x, enemy.z);
  }

  if (!self.busy) {
    if (self.skills.includes('k1') && api.ready('k1') && dist <= 17.5) {
      const kit = self.kit.k1;
      const lead = kit && kit.speed
        ? V.lead(self, enemy, { x: enemy.vx, z: enemy.vz }, kit.speed)
        : { x: enemy.x, z: enemy.z };
      api.use('k1', lead);
    } else if (self.skills.includes('k3') && api.ready('k3') && dist <= 11.5) {
      api.use('k3', { x: enemy.x, z: enemy.z });
    } else if (self.skills.includes('k2') && api.ready('k2') && dist <= 14) {
      const kit = self.kit.k2;
      const lead = kit && kit.speed
        ? V.lead(self, enemy, { x: enemy.vx, z: enemy.vz }, kit.speed)
        : { x: enemy.x, z: enemy.z };
      api.use('k2', lead);
    }
  }

  if (p.t < 1) {
    api.say('Let\'s dance.');
  } else if (self.hp < self.maxHp * 0.25) {
    api.say('Not done yet.');
  } else if (enemy.hp < enemy.maxHp * 0.25) {
    api.say('Almost there.');
  }
}