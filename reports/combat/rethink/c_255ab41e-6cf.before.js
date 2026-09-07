function think(p, api) {
  const me = p.self;
  const enemy = p.enemy;

  if (!enemy || !enemy.alive) {
    api.say("Победа за мной!");
    api.stop();
    return;
  }

  // Always face the enemy to prepare cones, dashes, and keep aim
  const dVec = { x: enemy.x - me.x, z: enemy.z - me.z };
  const dist = enemy.dist;
  api.faceAt(enemy.x, enemy.z);

  // Check if our facing is sufficiently aligned with enemy
  const toEnemyAngle = V.heading(dVec);
  const angleDiff = Math.abs(V.angleTo(me.heading, dVec));
  const isFacing = angleDiff < 0.35;

  // Use speed boost (k2) whenever available to maintain pressure and chase down
  if (api.ready('k2')) {
    api.use('k2');
    api.say("Ярость гориллы!");
  }

  // Combat priority 1: Close-range Cone (k3) - deals burn + silence (1.65s)
  // Sweeps the floor, effective range is 3.4m, works best if enemy is not airborne
  if (dist <= 3.2 && isFacing && api.ready('k3') && !enemy.airborne) {
    if (api.los(enemy.x, enemy.z)) {
      api.use('k3');
      api.say("Р-р-ра-а!");
      return;
    }
  }

  // Combat priority 2: Dash (k1) - 8m distance, 19.5 dmg + burn
  // Optimal when within 3.5m - 7.5m with clear LOS and aligned facing
  if (dist >= 3.0 && dist <= 7.6 && isFacing && api.ready('k1') && !enemy.airborne) {
    const ray = api.ray(Math.sin(me.heading), Math.cos(me.heading), dist);
    if (!ray.hit || ray.dist >= dist - 0.5) {
      api.use('k1');
      api.say("Сокрушающий рывок!");
      return;
    }
  }

  // Movement: relentlessly pursue and intercept the Octopus
  // If we have line of sight and short distance, charge directly into them (body mass advantage)
  if (api.los(enemy.x, enemy.z) && dist < 7) {
    // Lead enemy slightly with movement
    const targetPos = {
      x: enemy.x + enemy.vx * 0.25,
      z: enemy.z + enemy.vz * 0.25
    };
    api.move(targetPos.x - me.x, targetPos.z - me.z);
  } else {
    // Navigate obstacles toward enemy
    api.moveTo(enemy.x, enemy.z);
  }
}