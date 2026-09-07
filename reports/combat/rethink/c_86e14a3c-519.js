const K1='k1', K2='k2', K3='k3';

function clampArena(x, z) {
  return {
    x: Math.max(-19.3, Math.min(19.3, x)),
    z: Math.max(-19.3, Math.min(19.3, z))
  };
}

function predictPos(who, dt) {
  const canMove = !(who.rooted || ((who.immune || []).includes('move')));
  if (!canMove) return { x: who.x, z: who.z };
  return clampArena(who.x + who.vx * dt, who.z + who.vz * dt);
}

let sayTimer = 0;

function think(p, api) {
  const self = p.self, enemy = p.enemy;
  if (!self.alive) return;

  sayTimer -= p.dt;
  if (sayTimer <= 0) {
    if (p.t < 1) { api.say("Let's dance."); sayTimer = 8; }
    else if (self.hp < self.maxHp * 0.3) { api.say("Not done yet."); sayTimer = 8; }
    else if (enemy.hp < enemy.maxHp * 0.3) { api.say("Stay still."); sayTimer = 8; }
  }

  const kit = self.kit || {};
  let usedPointThisTick = false;

  if (!self.busy) {
    const enemyMoveImmune = (enemy.immune || []).includes('move');

    if (api.ready(K1) && enemy.dist <= 12 && !enemyMoveImmune) {
      const wu = (kit.k1 && kit.k1.windup) || 0.467;
      const target = predictPos(enemy, wu);
      api.use(K1, target);
      usedPointThisTick = true;
    } else if (api.ready(K3) && enemy.dist <= 12) {
      const wu = (kit.k3 && kit.k3.windup) || 0.467;
      const target = predictPos(enemy, wu);
      api.use(K3, target);
      usedPointThisTick = true;
    } else if (api.ready(K2) && enemy.dist <= 4.7 && enemy.visible) {
      api.use(K2, { x: enemy.x, z: enemy.z });
      usedPointThisTick = true;
    }
  }

  if (!usedPointThisTick) {
    api.faceAt(enemy.x, enemy.z);
  }

  const dodging = enemy.casting && enemy.casting.telegraph &&
    (enemy.casting.skill === 'k1' || enemy.casting.skill === 'k3' || enemy.casting.skill === 'k2');

  if (dodging) {
    const away = V.away(self, enemy);
    const perp = V.perp(away);
    const side = (api.rand() < 0.5) ? 1 : -1;
    const jitter = clampArena(self.x + perp.x * side * 3 + away.x * 1, self.z + perp.z * side * 3 + away.z * 1);
    api.moveTo(jitter.x, jitter.z);
  } else {
    const desired = 2.7;
    if (enemy.dist > desired + 0.6) {
      api.moveTo(enemy.x, enemy.z);
    } else if (enemy.dist < desired - 0.6) {
      const away = V.away(self, enemy);
      const back = clampArena(self.x + away.x * 2, self.z + away.z * 2);
      api.moveTo(back.x, back.z);
    } else {
      const orbitDir = (Math.floor(p.t) % 4 < 2) ? 1 : -1;
      const tangent = V.perp(V.toward(self, enemy));
      const orbitTarget = clampArena(
        self.x + tangent.x * orbitDir * 1.5,
        self.z + tangent.z * orbitDir * 1.5
      );
      api.moveTo(orbitTarget.x, orbitTarget.z);
    }
  }
}