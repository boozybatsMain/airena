function think(p, api) {
  const self = p.self;
  const enemy = p.enemy;
  const kit = self.kit;
  const enemyKit = enemy.kit;

  const moveSpeed = self.maxSpeed;
  const turnRate = self.turnRate;

  const distanceToEnemy = enemy.dist;
  const canSeeEnemy = enemy.visible;
  const isFacingEnemy = Math.abs(V.angleTo(self.heading, V.toward({x: self.x, z: self.z}, {x: enemy.x, z: enemy.z}))) < 0.2;
  const isInMeleeRange = distanceToEnemy < 2.5;

  const k1 = kit.k1;
  const k2 = kit.k2;
  const k3 = kit.k3;

  const k1Ready = api.ready('k1');
  const k2Ready = api.ready('k2');
  const k3Ready = api.ready('k3');

  const isCasting = self.casting !== null;
  const castRemaining = self.casting ? self.casting.remaining : 0;

  const isStunned = self.stunned;
  const isSilenced = self.silenced;
  const isRooted = self.rooted;
  const isInvulnerable = self.invulnerable;
  const isBusy = self.busy;

  const shield = self.shield || 0;
  const hpRatio = self.hp / self.maxHp;
  const enemyHpRatio = enemy.hp / enemy.maxHp;

  const burnActive = p.burn > 0;
  const time = p.t;

  const burnStartsIn = p.burnStartsIn;
  const burnRate = burnActive ? p.burn : 0;

  const shouldRetreat = hpRatio < 0.3 || (burnActive && time > 35 && hpRatio < 0.5);
  const shouldEngage = !shouldRetreat && hpRatio > 0.5 && enemyHpRatio < 0.7;

  const dodgeDirection = V.perp(V.toward({x: self.x, z: self.z}, {x: enemy.x, z: enemy.z}));
  const dodgeTarget = V.add({x: self.x, z: self.z}, V.scale(dodgeDirection, 8));

  const retreatTarget = V.add({x: self.x, z: self.z}, V.scale(V.away({x: self.x, z: self.z}, {x: enemy.x, z: enemy.z}), 15));
  const chaseTarget = {x: enemy.x, z: enemy.z};

  const target = shouldRetreat ? retreatTarget : shouldEngage ? chaseTarget : dodgeTarget;

  if (!isStunned && !isSilenced && !isInvulnerable) {
    if (!isBusy) {
      if (k1Ready && canSeeEnemy && distanceToEnemy > 8 && distanceToEnemy < k1.range) {
        api.use('k1', {x: enemy.x, z: enemy.z});
      } else if (k3Ready && canSeeEnemy && distanceToEnemy > 5 && distanceToEnemy < k3.range) {
        api.use('k3', {x: enemy.x, z: enemy.z});
      } else if (k2Ready && (distanceToEnemy < 4 || isRooted)) {
        const blinkTarget = V.lerp({x: self.x, z: self.z}, {x: enemy.x, z: enemy.z}, 0.6);
        api.use('k2', {x: blinkTarget.x, z: blinkTarget.z});
      }
    }

    if (!isBusy && !isCasting) {
      if (shouldRetreat) {
        api.moveTo(retreatTarget.x, retreatTarget.z);
        api.faceAt(retreatTarget.x, retreatTarget.z);
      } else if (shouldEngage) {
        api.moveTo(chaseTarget.x, chaseTarget.z);
        api.faceAt(enemy.x, enemy.z);
      } else {
        api.moveTo(dodgeTarget.x, dodgeTarget.z);
        api.faceAt(enemy.x, enemy.z);
      }
    }
  } else {
    api.stop();
    if (isStunned || isSilenced) {
      api.faceAt(enemy.x, enemy.z);
    }
  }

  if (time > 10 && time % 8 < 0.1) {
    api.say("Dance of steel and storm.");
  }
}