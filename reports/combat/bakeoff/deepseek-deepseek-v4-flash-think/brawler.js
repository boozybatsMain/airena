function think(p, api) {
  // Constants
  const MY_K2_RANGE = 4.9; // centre-to-centre
  const MY_K1_RANGE = 11.183;
  const ENEMY_K2_RANGE = 5.083; // opponent's k2 centre-to-centre
  const LOW_HP_FRAC = 0.45;
  const STRAFE_ANGLE = 1.2; // radians

  // State
  if (p.mem.strafeDir === undefined) p.mem.strafeDir = 1;
  if (p.mem.lastDodge === undefined) p.mem.lastDodge = 0;

  // Helper: vector toward enemy
  const toEnemy = V.toward({x:p.self.x, z:p.self.z}, {x:p.enemy.x, z:p.enemy.z});

  // Movement
  let moveTarget = null;
  let dodge = false;

  // If enemy is casting k2 and we are in range, dodge sideways
  if (p.enemy.casting && p.enemy.casting.skill === 'k2' && p.enemy.casting.telegraph &&
      p.enemy.dist < ENEMY_K2_RANGE) {
    const perp = V.perp(toEnemy);
    const dir = p.mem.strafeDir;
    moveTarget = {x: p.self.x + perp.x * dir * 5, z: p.self.z + perp.z * dir * 5};
    p.mem.lastDodge = p.t;
    dodge = true;
  }

  // Otherwise decide movement based on distance
  if (!dodge) {
    if (p.self.hp < LOW_HP_FRAC * p.self.maxHp) {
      // Retreat
      moveTarget = {x: p.self.x - toEnemy.x * 10, z: p.self.z - toEnemy.z * 10};
    } else if (p.enemy.dist < 4) {
      // Too close, back off
      moveTarget = {x: p.self.x - toEnemy.x * 5, z: p.self.z - toEnemy.z * 5};
    } else if (p.enemy.dist > 9) {
      // Approach
      moveTarget = {x: p.enemy.x, z: p.enemy.z};
    } else {
      // At good range, strafe
      const perp = V.perp(toEnemy);
      const dir = p.mem.strafeDir;
      const strafePoint = {
        x: p.enemy.x + perp.x * dir * 3,
        z: p.enemy.z + perp.z * dir * 3
      };
      moveTarget = strafePoint;
    }
  }

  // Apply movement
  if (moveTarget) {
    api.moveTo(moveTarget.x, moveTarget.z);
  } else {
    api.stop();
  }

  // Ability usage
  const k1Ready = api.ready('k1');
  const k2Ready = api.ready('k2');
  const k3Ready = api.ready('k3');

  // Use k3 if low hp and ready
  if (k3Ready && p.self.hp < LOW_HP_FRAC * p.self.maxHp) {
    api.use('k3');
    return; // skip other abilities this tick (order queue: last use wins)
  }

  // Check line of sight to enemy for targetable abilities
  const los = api.los(p.enemy.x, p.enemy.z);

  // Use k2 if in range and ready
  if (k2Ready && p.enemy.dist < MY_K2_RANGE && los) {
    api.use('k2', {x: p.enemy.x, z: p.enemy.z});
    return;
  }

  // Use k1 if ready and in range (and not too close to avoid overshoot)
  if (k1Ready && p.enemy.dist < MY_K1_RANGE && los && p.enemy.dist > 1.5) {
    // Predict future enemy position during 0.6s delay
    const lead = V.lead(
      {x: p.self.x, z: p.self.z},
      {x: p.enemy.x, z: p.enemy.z},
      {x: p.enemy.vx, z: p.enemy.vz},
      p.self.kit.k1.speed || 20 // dash speed
    );
    api.use('k1', {x: lead.x, z: lead.z});
    return;
  }

  // Toggle strafe direction occasionally
  if (p.t % 2 === 0) {
    p.mem.strafeDir = -p.mem.strafeDir;
  }
}