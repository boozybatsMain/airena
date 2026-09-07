function think(p, api) {
  const me = p.self;
  const opp = p.enemy;

  // Always keep facing the opponent to land skills & track them
  api.faceAt(opp.x, opp.z);

  const dist = opp.dist;
  const toOpp = V.toward(me, opp);
  const myFacingDir = V.fromHeading(me.heading);
  const angleToOpp = Math.abs(V.angleTo(me.heading, toOpp));

  // Check if we have clear LoS and good angle for cone/dash
  const isFacing = angleToOpp < 0.45; // ~25 degrees cone alignment
  const canHitCone = isFacing && dist <= 5.632 && opp.visible && !opp.airborne;

  // Skill execution logic
  // Priority 1: Stun if enemy is in range or winding up something dangerous
  if (api.ready('k2') && canHitCone) {
    api.use('k2');
    api.say('Стоять!');
    return;
  }

  // Priority 2: Primary damage strike (k3)
  if (api.ready('k3') && canHitCone) {
    api.use('k3');
    api.say('Получай!');
    return;
  }

  // Priority 3: Dash / Gap-closer / Knockback (k1)
  // Use k1 to close distance if far and lined up, or to interrupt/punish
  if (api.ready('k1') && isFacing && dist >= 2.871 && dist <= 13 && opp.visible) {
    // Check if path is relatively clear
    const ray = api.ray(myFacingDir.x, myFacingDir.z, dist);
    if (!ray.hit || ray.dist >= dist - 0.5) {
      api.use('k1');
      api.say('На таран!');
      return;
    }
  }

  // Movement logic:
  // If we are currently casting or busy, let the action finish
  if (me.busy) return;

  // Dodge / Counter-play enemy dash or windup
  if (opp.casting && opp.casting.telegraph) {
    // If enemy is winding up a cone or dash, strafe sideways
    const perp = V.perp(toOpp);
    api.move(perp.x, perp.z);
    return;
  }

  // In combat positioning:
  // We have massive HP advantage (276 vs 180) and higher mass.
  // We want to be in close-quarters (<= 3.0m) to land k2 and k3 reliably.
  if (dist > 3.001) {
    // Use pathfinding if direct line is obstructed or far
    if (!opp.visible || dist > 5) {
      api.moveTo(opp.x, opp.z);
    } else {
      // Direct raw approach with slight lead
      const leadPos = V.lead(me, opp, { x: opp.vx, z: opp.vz }, me.maxSpeed);
      const moveDir = V.toward(me, leadPos);
      api.move(moveDir.x, moveDir.z);
    }
  } else {
    // Close range sticking: pressure the enemy, stay right on top of them
    api.move(toOpp.x, toOpp.z);
  }
}