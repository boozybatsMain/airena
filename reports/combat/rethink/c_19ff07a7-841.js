let dodgeSide = 1;
let lastEnemySkill = null;
let lastEnemyElapsed = -1;

function think(p, api) {
  const self = p.self;
  const enemy = p.enemy;
  if (!self.alive) return;

  const dist = enemy.dist;
  const toEnemy = V.toward({ x: self.x, z: self.z }, { x: enemy.x, z: enemy.z });
  const awayFromEnemy = V.toward({ x: enemy.x, z: enemy.z }, { x: self.x, z: self.z });
  const perp = V.perp(toEnemy);

  // ---- detect a fresh enemy wind-up to pick a dodge side ----
  const ec = enemy.casting;
  if (ec && ec.telegraph) {
    const isNew = ec.skill !== lastEnemySkill || ec.elapsed < lastEnemyElapsed;
    if (isNew) {
      dodgeSide = api.rand() > 0.5 ? 1 : -1;
    }
    lastEnemySkill = ec.skill;
    lastEnemyElapsed = ec.elapsed;
  } else {
    lastEnemySkill = null;
    lastEnemyElapsed = -1;
  }

  let dodging = false;

  // ---- react to an aimed enemy strike coming (k1 beam or k3 zone) ----
  if (ec && ec.telegraph && (ec.skill === 'k1' || ec.skill === 'k3')) {
    // hard blink-dodge if close and available
    if (dist < 7 && api.ready('k2') && !self.busy) {
      api.use('k2', awayFromEnemy.x, awayFromEnemy.z);
      dodging = true;
    } else {
      const dir = V.scale(perp, dodgeSide);
      api.move(dir.x, dir.z);
      dodging = true;
    }
  }

  // ---- normal spacing / circling when not dodging ----
  if (!dodging) {
    const desired = 11;
    let moveDir;
    if (dist > desired + 2.5) {
      moveDir = toEnemy;
    } else if (dist < desired - 3) {
      moveDir = awayFromEnemy;
    } else {
      const side = Math.sin(p.t * 0.6) >= 0 ? 1 : -1;
      moveDir = V.scale(perp, side);
    }
    api.move(moveDir.x, moveDir.z);
  }

  // ---- facing: aim at enemy when free to (locked aim during our own windup overrides this) ----
  if (!self.casting) {
    api.faceAt(enemy.x, enemy.z);
  }

  // ---- offense ----
  if (!self.busy && enemy.alive) {
    // k1: beam, lead a touch by their velocity over the wind-up
    if (api.ready('k1') && dist <= 25 && enemy.visible) {
      const k1 = self.kit.k1;
      const wu = (k1 && k1.windup) || 0.5;
      const lead = {
        x: enemy.x + enemy.vx * wu,
        z: enemy.z + enemy.vz * wu
      };
      api.use('k1', lead);
    } else if (api.ready('k3') && dist <= 15 && enemy.visible) {
      const k3 = self.kit.k3;
      const wu = (k3 && k3.windup) || 0.467;
      const lead = {
        x: enemy.x + enemy.vx * wu,
        z: enemy.z + enemy.vz * wu
      };
      api.use('k3', lead);
    } else if (api.ready('k2') && dist > 8 && dist < 20 && !enemy.visible) {
      // close a blocked gap a bit
      api.use('k2', toEnemy.x, toEnemy.z);
    }
  }

  // ---- self-preservation: cleanse a bad status with k2 if it's not needed for dodge ----
  if (!dodging && api.ready('k2') && (self.rooted || self.silenced || self.burning) && self.hp < self.maxHp * 0.5) {
    api.use('k2', toEnemy.x, toEnemy.z);
  }
}