const ARENA_HALF = 19;

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function strafeSide(t) {
  // deterministic alternation, flips roughly every 1.6s
  return Math.sin(t / 1.6) >= 0 ? 1 : -1;
}

function think(p, api) {
  const self = p.self;
  const enemy = p.enemy;

  if (!self.alive) return;

  const dist = enemy.dist;
  const hpFrac = self.hp / self.maxHp;

  // desired stand-off distance: further out when hurt or when they're wound up
  let desired = 13;
  if (hpFrac < 0.45) desired = 18;

  let dodging = false;

  if (enemy.alive && enemy.casting && enemy.casting.telegraph) {
    const sk = enemy.casting.skill;
    if (sk === 'k1' || sk === 'k3') {
      const away = V.away(self, enemy);
      const tx = clamp(self.x + away.x * 10, -ARENA_HALF, ARENA_HALF);
      const tz = clamp(self.z + away.z * 10, -ARENA_HALF, ARENA_HALF);
      api.moveTo(tx, tz);
      dodging = true;
    } else if (sk === 'k2') {
      const dir = V.toward(self, enemy);
      const perp = V.perp(dir);
      const side = strafeSide(p.t);
      const tx = clamp(self.x + perp.x * side * 9, -ARENA_HALF, ARENA_HALF);
      const tz = clamp(self.z + perp.z * side * 9, -ARENA_HALF, ARENA_HALF);
      api.moveTo(tx, tz);
      dodging = true;
    }
  }

  if (!dodging) {
    if (dist > desired + 3) {
      api.moveTo(enemy.x, enemy.z);
    } else if (dist < desired - 3) {
      const away = V.away(self, enemy);
      const tx = clamp(self.x + away.x * 10, -ARENA_HALF, ARENA_HALF);
      const tz = clamp(self.z + away.z * 10, -ARENA_HALF, ARENA_HALF);
      api.moveTo(tx, tz);
    } else {
      const dir = V.toward(self, enemy);
      const perp = V.perp(dir);
      const side = strafeSide(p.t);
      const tx = clamp(self.x + perp.x * side * 6, -ARENA_HALF, ARENA_HALF);
      const tz = clamp(self.z + perp.z * side * 6, -ARENA_HALF, ARENA_HALF);
      api.moveTo(tx, tz);
    }
  }

  if (!self.casting) {
    api.faceAt(enemy.x, enemy.z);
  }

  if (enemy.alive) {
    const kit = self.kit;

    const canK2 = kit.k2 && api.ready('k2') && dist <= 23 && api.los(enemy.x, enemy.z);
    const canK1 = kit.k1 && api.ready('k1') && dist <= 4.7 && !enemy.airborne && api.los(enemy.x, enemy.z);
    const canK3 = kit.k3 && api.ready('k3') && dist > 4.7 && dist <= 10.7 && !enemy.airborne;

    if (canK2) {
      const wu = kit.k2.windup || 0.5;
      const pt = { x: enemy.x + enemy.vx * wu, z: enemy.z + enemy.vz * wu };
      api.use('k2', pt);
    } else if (canK1) {
      const wu = kit.k1.windup || 0.3;
      const pt = { x: enemy.x + enemy.vx * wu, z: enemy.z + enemy.vz * wu };
      api.use('k1', pt);
    } else if (canK3) {
      const wu = kit.k3.windup || 0.3;
      const pt = { x: enemy.x + enemy.vx * wu, z: enemy.z + enemy.vz * wu };
      api.use('k3', pt);
    }
  }

  if (p.t < 1) {
    api.say('Let\'s dance.');
  } else if (self.hp < self.maxHp * 0.25 && p.t > 5) {
    api.say('Not done yet!');
  }
}