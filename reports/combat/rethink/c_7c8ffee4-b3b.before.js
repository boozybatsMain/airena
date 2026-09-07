function think(p, api) {
  const me = p.self;
  const opp = p.enemy;

  // Track enemy charge / dash telegraph to jump over with k1
  const enemyCasting = opp.casting;
  const isEnemyDashing = enemyCasting && (enemyCasting.skill === 'k3' || enemyCasting.phase === 'dash' || enemyCasting.phase === 'windup');
  
  // Predict enemy position for lob (k2)
  const dist = opp.dist;
  const enemyVel = { x: opp.vx, z: opp.vz };
  
  // Aiming logic
  let leadPos = opp;
  if (dist > 0) {
    const flightTime = 0.437 + dist / 17.861; // windup + travel
    leadPos = {
      x: Math.max(-17, Math.min(18, opp.x + enemyVel.x * flightTime)),
      z: Math.max(-18, Math.min(18, opp.z + enemyVel.z * flightTime))
    };
  }

  // Always face enemy or lead target
  api.faceAt(leadPos.x, leadPos.z);

  // Skill 1: Defensive jump against dashes / close threat, or speed buff when chasing/kiting
  if (api.ready('k1')) {
    if ((isEnemyDashing && dist < 10) || dist < 2.87 || (opp.stunned && dist > 7)) {
      api.use('k1');
      api.say("Волна уносит!");
      return;
    }
  }

  // Skill 3: Dash attack when aligned and within reliable hitting range (5 to 7.8m)
  // Ensure we don't dash into obstacles
  if (api.ready('k3') && dist <= 7.5 && dist >= 2.0 && !opp.airborne) {
    const toOpp = V.toward(me, opp);
    const ray = api.ray(toOpp.x, toOpp.z, dist);
    if (!ray.hit || ray.dist >= dist - opp.radius) {
      // Clear line of dash
      api.use('k3');
      api.say("Щупальца вперед!");
      return;
    }
  }

  // Skill 2: Lob projectile (flies over obstacles)
  if (api.ready('k2') && dist <= 19.105) {
    api.use('k2');
    api.say("Чернила в глаза!");
    return;
  }

  // Tactical Movement & Kiting
  // Octopus is squishy (121 hp vs 205 hp) but has ranged stun (k2) & dash (k3).
  // Ideal combat distance is 6.0 - 9.0m.
  const idealDistMin = 8.54;
  const idealDistMax = 16.669;

  let moveTarget = null;

  if (dist < idealDistMin) {
    // Back away from Gorilla, avoid walls
    const awayDir = V.away(opp, me);
    let escapeX = me.x + awayDir.x * 5;
    let escapeZ = me.z + awayDir.z * 5;
    
    // Clamp inside arena bounds
    escapeX = Math.max(-17, Math.min(17, escapeX));
    escapeZ = Math.max(-17, Math.min(17, escapeZ));
    
    moveTarget = { x: escapeX, z: escapeZ };
  } else if (dist > idealDistMax) {
    // Close in gently to maintain attack pressure
    const toDir = V.toward(me, opp);
    moveTarget = {
      x: me.x + toDir.x * (dist - 7.0),
      z: me.z + toDir.z * (dist - 8.54)
    };
  } else {
    // Circle strafe around Gorilla
    const toDir = V.toward(me, opp);
    const perp = V.perp(toDir);
    // Clockwise or counter-clockwise based on arena center bias
    const side = (me.x * perp.z - me.z * perp.x) > 0 ? 1 : -1;
    let strafeX = me.x + perp.x * side * 3;
    let strafeZ = me.z + perp.z * side * 4;
    
    // Check arena bounds
    if (Math.abs(strafeX) > 23 || Math.abs(strafeZ) > 20) {
      strafeX = -me.x * 0.5;
      strafeZ = -me.z * 0.5;
    }
    moveTarget = { x: strafeX, z: strafeZ };
  }

  if (moveTarget) {
    api.moveTo(moveTarget.x, moveTarget.z);
  }
}