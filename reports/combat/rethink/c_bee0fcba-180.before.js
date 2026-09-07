function think(p, api) {
  const me = p.self;
  const opp = p.enemy;

  // Always keep facing the opponent to react and shoot quickly
  api.faceAt(opp.x, opp.z);

  // Cast buff k2 whenever ready (it boosts delivery reach)
  if (api.ready('k2')) {
    api.use('k2');
  }

  // Attack logic: use beam (k1) or bolt (k3) if line of sight and within reach
  if (opp.visible) {
    if (api.ready('k1') && opp.dist <= 24) {
      api.use('k1');
    } else if (api.ready('k3') && opp.dist <= 18) {
      api.use('k3');
    }
  }

  // Tactical positioning: Kite the faster gorilla, keep ~10-15m distance
  const desiredDist = 12.0;
  const toOpp = V.toward(me, opp);
  const perp = V.perp(toOpp);

  let moveTarget = null;

  // If gorilla is winding up a skill, dodge perpendicular to LOS
  if (opp.casting && opp.casting.telegraph) {
    const dodgeDir = (p.tick % 2 === 0) ? perp : V.scale(perp, -1);
    moveTarget = V.add(me, V.scale(dodgeDir, 6));
  } else if (opp.dist < desiredDist - 2) {
    // Back away while circling slightly
    const backDir = V.add(V.scale(toOpp, -1), V.scale(perp, 0.4));
    moveTarget = V.add(me, V.scale(V.norm(backDir), 6));
  } else if (opp.dist > desiredDist + 3) {
    // Close in safely via pathfinding
    moveTarget = opp;
  } else {
    // Circle around opponent
    moveTarget = V.add(me, V.scale(perp, 5));
  }

  // Constrain target within arena boundaries (-18 to 18)
  const clampedX = Math.max(-18, Math.min(18, moveTarget.x));
  const clampedZ = Math.max(-18, Math.min(18, moveTarget.z));
  api.moveTo(clampedX, clampedZ);

  if (p.tick % 60 === 0) {
    api.say("Щупальца не догнать!");
  }
}