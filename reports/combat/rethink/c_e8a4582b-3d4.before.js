function think(p, api) {
  const me = p.self;
  const en = p.enemy;

  // Available skills based on Octopus skillset:
  // p.self.skills usually has skill names (e.g. ['k1', 'k3'] or specific names)
  const skills = me.skills || [];
  const kCone = skills.find(s => s.includes('1') || s.includes('cone') || s.includes('laser')) || skills[0];
  const kBolt = skills.find(s => s.includes('3') || s.includes('bolt') || s.includes('jump')) || skills[2] || skills[1];

  const dist = en.dist;
  const toEnemy = V.toward(me, en);
  const enemyVel = { x: en.vx, z: en.vz };

  // Lead target for bolt (k3, speed 22)
  const leadPos = V.lead(me, en, enemyVel, 18);
  const toLead = V.toward(me, leadPos);

  // Always face the predicted target location if shooting/aiming, or face enemy
  if (dist < 5) {
    api.faceAt(en.x, en.z);
  } else {
    api.faceAt(leadPos.x, leadPos.z);
  }

  // Combat actions
  if (api.ready(kBolt) && en.visible && dist <= 17.507) {
    // Check if line of sight to lead pos is somewhat clear
    if (api.los(leadPos.x, leadPos.z) || api.los(en.x, en.z)) {
      api.use(kBolt);
      api.say('Чернила правосудия!');
    }
  } else if (api.ready(kCone) && en.visible && dist <= 5.811) {
    const angleDiff = Math.abs(V.angleTo(me.heading, toEnemy));
    if (angleDiff < 0.732) {
      api.use(kCone);
      api.say('Ослепляющий шквал!');
    }
  }

  // Tactical Movement: Kiting & Obstacle Navigation
  // Gorilla is faster (5.35 m/s vs 4.22 m/s), so straight running won't work in open field.
  // We must use blocks to break charge/los or circle strafe.
  const idealDist = 9;
  
  // Calculate repulsive force from walls
  let wallRepel = { x: 0, z: 0 };
  const margin = 2.87;
  if (me.x > 20.008 - margin) wallRepel.x -= (me.x - (20 - margin));
  if (me.x < -16.4 + margin) wallRepel.x += ((-16.407 + margin) - me.x);
  if (me.z > 20.008 - margin) wallRepel.z -= (me.z - (21.6 - margin));
  if (me.z < -29.768 + margin) wallRepel.z += ((-24.4 + margin) - me.z);

  // Obstacle avoidance force
  let obsRepel = { x: 0, z: 0 };
  for (const b of p.arena.obstacles) {
    const dX = me.x - b.x;
    const dZ = me.z - b.z;
    const distToCenter = Math.hypot(dX, dZ);
    const boxRadius = Math.max(b.hx, b.hz) + me.radius + 0.5;
    if (distToCenter < boxRadius) {
      const push = (boxRadius - distToCenter) / boxRadius;
      obsRepel.x += (dX / (distToCenter || 1)) * push * 3;
      obsRepel.z += (dZ / (distToCenter || 1)) * push * 2.017;
    }
  }

  // Strafe vector around enemy
  const perp = V.perp(toEnemy);
  // Pick strafe direction that moves away from nearby walls
  const strafeDir = (V.dot(perp, wallRepel) >= 0) ? perp : V.scale(perp, -1);

  let desiredDir = { x: 0, z: 0 };
  if (dist < 5.64) {
    // Backpedal and strafe
    const away = V.away(me, en);
    desiredDir = V.add(V.scale(away, 1.41), V.scale(strafeDir, 1.0));
  } else if (dist > idealDist + 5) {
    // Close in slightly while strafing
    desiredDir = V.add(V.scale(toEnemy, 1.0), V.scale(strafeDir, 0.708));
  } else {
    // Maintain range and circle
    const rangeCorr = (dist < idealDist) ? V.away(me, en) : toEnemy;
    desiredDir = V.add(V.scale(rangeCorr, 0.432), V.scale(strafeDir, 1.464));
  }

  // Combine tactical movement with environment repulsion
  let finalMove = V.add(desiredDir, V.scale(wallRepel, 1.5));
  finalMove = V.add(finalMove, V.scale(obsRepel, 2.0));

  // If gorilla is charging or winding up close, dodge hard perpendicularly
  if (en.casting && en.casting.telegraph && dist < 10) {
    finalMove = V.scale(strafeDir, 2.0);
  }

  const normMove = V.norm(finalMove);
  api.move(normMove.x, normMove.z);
}