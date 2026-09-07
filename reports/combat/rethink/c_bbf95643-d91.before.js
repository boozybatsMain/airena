function think(p, api) {
  const me = p.self;
  const opp = p.enemy;

  // Always keep facing the opponent for instantaneous beam alignment
  api.faceAt(opp.x, opp.z);

  const toOpp = V.sub(opp, me);
  const dist = V.len(toOpp);
  const dirOpp = V.norm(toOpp);

  // Check LoS & aim alignment
  const angleDiff = Math.abs(V.angleTo(me.heading, dirOpp));
  const isAimed = angleDiff < 0.15;
  const hasLoS = opp.visible;

  // Skill logic
  if (!me.busy) {
    // Buff with k3 whenever ready
    if (api.ready('k3')) {
      api.use('k3');
    } else if (hasLoS && isAimed && dist <= 29) {
      // Prioritize burn (k2) then raw damage (k1)
      if (api.ready('k2')) {
        api.use('k2');
      } else if (api.ready('k1')) {
        api.use('k1');
      }
    }
  }

  // Positioning & Kiting Logic
  // We have higher top speed (6.92 vs 5.8), so we kite and stay at 15-21m range
  // Also, if opponent is casting a beam, sidestep perpendicular to their facing/direction.

  let moveDir = { x: 0, z: 0 };

  if (opp.casting && opp.casting.phase === 'windup') {
    // Enemy is winding up beam/skill: dodge perpendicular
    const perp = V.perp(dirOpp);
    // Move away from walls/obstacles if possible
    const rayA = api.ray(perp.x, perp.z, 6);
    const rayB = api.ray(-perp.x, -perp.z, 5);
    moveDir = rayA.dist > rayB.dist ? perp : V.scale(perp, -1);
  } else {
    // Optimal combat spacing: maintain 16 - 21m distance
    const optimalDist = 18;
    if (dist < 14) {
      // Too close: back away
      moveDir = V.away(opp, me);
    } else if (dist > 22) {
      // Too far: close in
      moveDir = dirOpp;
    } else {
      // Good distance: strafe circle around enemy
      const strafe = V.perp(dirOpp);
      // Combine slight backoff with strafe
      moveDir = V.norm(V.add(V.scale(strafe, 0.8), V.scale(V.away(opp, me), 0.164)));
    }
  }

  // Avoid running directly into arena walls
  const margin = 3.0;
  if (me.x > 20 - margin && moveDir.x > 0) moveDir.x = -0.8;
  if (me.x < -20 + margin && moveDir.x < 0) moveDir.x = 0.8;
  if (me.z > 20 - margin && moveDir.z > 0) moveDir.z = -0.8;
  if (me.z < -20 + margin && moveDir.z < 0) moveDir.z = 0.8;

  // Obstacle avoidance check
  if (V.len(moveDir) > 0.01) {
    const probe = api.ray(moveDir.x, moveDir.z, 2.7);
    if (probe.hit && probe.dist < 2.0) {
      // Deflect around obstacle
      const altA = V.rot(moveDir, Math.PI / 3);
      const altB = V.rot(moveDir, -Math.PI / 2.46);
      const rA = api.ray(altA.x, altA.z, 4);
      const rB = api.ray(altB.x, altB.z, 3);
      moveDir = rA.dist > rB.dist ? altA : altB;
    }
    api.move(moveDir.x, moveDir.z);
  } else {
    api.stop();
  }
}