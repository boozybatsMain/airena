const K1_RANGE_FALLBACK = 18;
const K2_RANGE_FALLBACK = 24;

function clampArena(x, z) {
  return { x: Math.max(-19, Math.min(19, x)), z: Math.max(-19, Math.min(19, z)) };
}

function leadForBolt(shooter, target, targetVel, speed, extraDelay) {
  let dx = target.x - shooter.x, dz = target.z - shooter.z;
  let dist = Math.hypot(dx, dz);
  let t = extraDelay + (speed > 0 ? dist / speed : 0);
  for (let i = 0; i < 2; i++) {
    const px = target.x + targetVel.x * t;
    const pz = target.z + targetVel.z * t;
    dist = Math.hypot(px - shooter.x, pz - shooter.z);
    t = extraDelay + (speed > 0 ? dist / speed : 0);
  }
  return { x: target.x + targetVel.x * t, z: target.z + targetVel.z * t };
}

function think(p, api) {
  const self = p.self, enemy = p.enemy;
  if (!self.alive) return;

  // --- react to enemy incoming projectiles: quick sidestep if one is close & inbound ---
  let dangerPerp = null;
  for (const pr of p.arena.projectiles || []) {
    if (pr.mine) continue;
    const relx = self.x - pr.x, relz = self.z - pr.z;
    const vlen = Math.hypot(pr.vx, pr.vz) || 1;
    const nx = pr.vx / vlen, nz = pr.vz / vlen;
    const along = relx * nx + relz * nz;
    if (along < 0) continue; // moving away
    const closeX = pr.x + nx * along, closeZ = pr.z + nz * along;
    const perpDist = Math.hypot(self.x - closeX, self.z - closeZ);
    const timeToClose = along / vlen;
    if (perpDist < 3 && timeToClose < 0.6 && timeToClose >= 0) {
      dangerPerp = { x: -nz, z: nx };
      break;
    }
  }

  // --- react to enemy telegraphed aimed skills (bolt/beam) with a sidestep ---
  let evade = dangerPerp;
  if (!evade && enemy.casting && enemy.casting.telegraph) {
    const ek = enemy.kit && enemy.kit[enemy.casting.skill];
    if (ek && ek.aim === 'facing') {
      const hx = Math.sin(enemy.heading), hz = Math.cos(enemy.heading);
      evade = { x: -hz, z: hx };
    }
  }

  // --- facing: keep pointed at enemy (predicted) unless an aimed use overrides it this tick ---
  const enemyVel = { x: enemy.vx || 0, z: enemy.vz || 0 };
  const dist = enemy.dist;

  let usedAbility = false;

  if (self.busy) {
    // can't start anything; just keep current facing on enemy for next opportunity
    if (!self.casting || !self.casting.telegraph) {
      api.faceAt(enemy.x, enemy.z);
    }
  } else {
    const k1 = self.kit.k1, k2 = self.kit.k2, k3 = self.kit.k3;
    const k1range = (k1 && k1.range) || K1_RANGE_FALLBACK;
    const k2range = (k2 && k2.range) || K2_RANGE_FALLBACK;

    if (api.ready('k1') && enemy.visible && dist <= k1range - 0.5) {
      const windup = (k1 && k1.windup) || 0.367;
      const speed = (k1 && k1.speed) || 22;
      const aim = leadForBolt(self, enemy, enemyVel, speed, windup);
      api.use('k1', aim);
      usedAbility = true;
    } else if (api.ready('k2') && enemy.visible && dist <= k2range - 1) {
      const windup = (k2 && k2.windup) || 0.5;
      const aim = { x: enemy.x + enemyVel.x * windup, z: enemy.z + enemyVel.z * windup };
      api.use('k2', aim);
      usedAbility = true;
    } else if (api.ready('k3')) {
      api.use('k3');
      usedAbility = true;
    }

    if (!usedAbility) {
      api.faceAt(enemy.x, enemy.z);
    }
  }

  // --- movement ---
  if (evade) {
    const dest = clampArena(self.x + evade.x * 6, self.z + evade.z * 6);
    api.moveTo(dest.x, dest.z);
  } else if (!enemy.visible) {
    api.moveTo(enemy.x, enemy.z);
  } else {
    const idealMin = 8, idealMax = 14;
    const dirAway = { x: self.x - enemy.x, z: self.z - enemy.z };
    const dAwayLen = Math.hypot(dirAway.x, dirAway.z) || 1;
    if (dist < idealMin) {
      const dest = clampArena(self.x + (dirAway.x / dAwayLen) * 8, self.z + (dirAway.z / dAwayLen) * 8);
      api.moveTo(dest.x, dest.z);
    } else if (dist > idealMax) {
      const dirToward = { x: enemy.x - self.x, z: enemy.z - self.z };
      const dLen = Math.hypot(dirToward.x, dirToward.z) || 1;
      const dest = clampArena(self.x + (dirToward.x / dLen) * 8, self.z + (dirToward.z / dLen) * 8);
      api.moveTo(dest.x, dest.z);
    } else {
      const toEnemy = { x: enemy.x - self.x, z: enemy.z - self.z };
      const tLen = Math.hypot(toEnemy.x, toEnemy.z) || 1;
      const nx = toEnemy.x / tLen, nz = toEnemy.z / tLen;
      const perp = { x: -nz, z: nx };
      const sign = Math.sin(p.t * 0.8) >= 0 ? 1 : -1;
      const dest = clampArena(self.x + perp.x * sign * 8, self.z + perp.z * sign * 8);
      api.moveTo(dest.x, dest.z);
    }
  }

  // occasional taunt, cheap and rate-limited by the engine anyway
  if (p.t < 0.5) {
    api.say('Let\'s dance.');
  } else if (self.hp < self.maxHp * 0.25 && enemy.hp < enemy.maxHp * 0.25) {
    api.say('Down to the wire!');
  }
}