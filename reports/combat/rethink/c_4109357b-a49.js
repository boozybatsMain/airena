function think(p, api) {
  const self = p.self;
  const enemy = p.enemy;
  if (!self.alive) return;

  // --- persistent strafe direction, flips periodically ---
  let strafeSign = api.recall('strafeSign', 1);
  let strafeTimer = api.recall('strafeTimer', 0) - p.dt;
  if (strafeTimer <= 0) {
    strafeSign = -strafeSign;
    strafeTimer = 1.1 + api.rand() * 0.9;
    api.remember('strafeSign', strafeSign);
  }
  api.remember('strafeTimer', strafeTimer);

  const dist = enemy.dist;
  const toEnemy = V.toward(self, enemy);
  const awayFromEnemy = V.away(self, enemy);

  // face the enemy by default (ignored automatically while an aim-point lock is active)
  api.faceAt(enemy.x, enemy.z);

  // --- dodge an incoming telegraphed strike ---
  let dodging = false;
  if (enemy.casting && enemy.casting.telegraph) {
    const skill = enemy.casting.skill;
    const dangerous =
      (skill === 'k3' && dist < 18.7) ||
      ((skill === 'k1' || skill === 'k2') && dist < 16.1);
    if (dangerous) {
      const perp = V.perp(toEnemy);
      const dodgeDir = V.scale(perp, strafeSign);
      api.move(dodgeDir.x, dodgeDir.z);
      dodging = true;
    }
  }

  // --- positioning when not dodging ---
  if (!dodging) {
    const desired = 9;
    if (dist > desired + 1.5) {
      api.moveTo(enemy.x, enemy.z);
    } else if (dist < desired - 1.5) {
      const target = {
        x: self.x + awayFromEnemy.x * 6,
        z: self.z + awayFromEnemy.z * 6,
      };
      api.moveTo(target.x, target.z);
    } else {
      const perp = V.perp(toEnemy);
      const dir = V.scale(perp, strafeSign);
      api.move(dir.x, dir.z);
    }
  }

  // --- offense ---
  if (!self.busy) {
    const evel = { x: enemy.vx, z: enemy.vz };

    const k3 = self.kit.k3;
    const k1 = self.kit.k1;
    const k2 = self.kit.k2;

    if (k3 && api.ready('k3') && dist <= 18.7) {
      const speed = k3.speed || 18;
      const totalTime = (k3.windup || 0.5) + dist / speed;
      const predicted = {
        x: enemy.x + evel.x * totalTime,
        z: enemy.z + evel.z * totalTime,
      };
      api.use('k3', predicted);
    } else if (k1 && api.ready('k1') && dist <= 16.1) {
      const w = k1.windup || 0.467;
      const predicted = {
        x: enemy.x + evel.x * w,
        z: enemy.z + evel.z * w,
      };
      api.use('k1', predicted);
    } else if (k2 && api.ready('k2') && dist <= 16.1) {
      const w = k2.windup || 0.467;
      const predicted = {
        x: enemy.x + evel.x * w,
        z: enemy.z + evel.z * w,
      };
      api.use('k2', predicted);
    }
  }

  // --- occasional taunt ---
  const sayTimer = api.recall('sayTimer', 0) - p.dt;
  if (sayTimer <= 0) {
    api.say('Hold still, this will only hurt a lot.');
    api.remember('sayTimer', 4.2);
  } else {
    api.remember('sayTimer', sayTimer);
  }
}