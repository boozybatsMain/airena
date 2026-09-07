function predictPos(selfPos, enemyPos, enemyVel, windup, speed) {
  const px = enemyPos.x + enemyVel.x * windup;
  const pz = enemyPos.z + enemyVel.z * windup;
  if (speed) {
    return V.lead(selfPos, { x: px, z: pz }, enemyVel, speed);
  }
  return { x: px, z: pz };
}

function think(p, api) {
  const self = p.self;
  const enemy = p.enemy;
  if (!self.alive) return;

  const dist = enemy.dist;
  const selfFrac = self.hp / self.maxHp;
  const enemyFrac = enemy.hp / enemy.maxHp;

  // --- Emergency cleanse: shake off control effects ---
  const badStatus = self.stunned || self.rooted || self.silenced;
  if (badStatus && api.ready('k2')) {
    const dir = V.away(self, enemy);
    api.use('k2', dir.x, dir.z);
    api.say('Not today.');
    return;
  }

  // --- Defensive shield/reposition when low and enemy is winding up ---
  if (api.ready('k2') && selfFrac < 0.4 && enemy.casting && enemy.casting.telegraph) {
    const dir = V.away(self, enemy);
    api.use('k2', dir.x, dir.z);
    api.say('Slip away.');
    return;
  }

  // --- Offense ---
  let acted = false;
  const k3 = self.kit.k3;
  const k1 = self.kit.k1;
  const enemyVel = { x: enemy.vx, z: enemy.vz };

  if (!acted && k3 && api.ready('k3') && enemy.visible && dist <= (k3.range || 24) + 3) {
    const aim = predictPos(self, enemy, enemyVel, k3.windup || 0.667, 0);
    api.use('k3', aim);
    acted = true;
    api.say('Burn.');
  }

  if (!acted && k1 && api.ready('k1') && enemy.visible && dist <= (k1.range || 18)) {
    const aim = predictPos(self, enemy, enemyVel, k1.windup || 0.367, k1.speed || 22);
    api.use('k1', aim);
    acted = true;
    api.say('Pinned.');
  }

  if (!acted) {
    api.faceAt(enemy.x, enemy.z);
  }

  // --- Movement / kiting ---
  let preferred = 12;
  if (p.timeLeft < 15) {
    preferred = selfFrac > enemyFrac ? 18 : 6;
  }

  let moveTarget;
  if (dist > preferred + 2) {
    const dir = V.toward(self, enemy);
    moveTarget = { x: self.x + dir.x * 3, z: self.z + dir.z * 3 };
  } else if (dist < preferred - 2) {
    const dir = V.away(self, enemy);
    moveTarget = { x: self.x + dir.x * 3, z: self.z + dir.z * 3 };
  } else {
    const toEnemy = V.toward(self, enemy);
    const perp = V.perp(toEnemy);
    const sign = Math.sin(p.t * 0.7) >= 0 ? 1 : -1;
    moveTarget = {
      x: self.x + perp.x * sign * 3 - toEnemy.x * 0.5,
      z: self.z + perp.z * sign * 3 - toEnemy.z * 0.5,
    };
  }

  moveTarget.x = Math.max(-19, Math.min(19, moveTarget.x));
  moveTarget.z = Math.max(-19, Math.min(19, moveTarget.z));
  api.moveTo(moveTarget.x, moveTarget.z);
}