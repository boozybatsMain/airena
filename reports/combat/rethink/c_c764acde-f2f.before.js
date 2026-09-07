function think(p, api) {
  const me = p.self;
  const opp = p.enemy;

  // Always keep facing the opponent for fast skill delivery
  const dirToOpp = V.toward(me, opp);
  api.face(dirToOpp.x, dirToOpp.z);

  // Jump (k3) defensively to dodge enemy cone attacks (k1, k2) or to close the gap with speed boost
  const enemyCastingAttack = opp.casting && (opp.casting.skill === 'k1' || opp.casting.skill === 'k2') && opp.casting.telegraph;
  const enemyFacingMe = Math.abs(V.angleTo(opp.heading, V.toward(opp, me))) < 0.8;
  const inDodgeRange = opp.dist <= 3.8;

  if (api.ready('k3')) {
    if (enemyCastingAttack && enemyFacingMe && inDodgeRange) {
      api.use('k3');
      api.say('Мимо!');
      return;
    }
    // Use k3 as mobility buff if enemy is far and we are pursuing
    if (opp.dist > 5.0 && !opp.casting) {
      api.use('k3');
    }
  }

  // Attack range check: skill range is 3.4, edge-to-edge calculation
  const attackRange = 3.2;
  const angleToOpp = Math.abs(V.angleTo(me.heading, dirToOpp));
  const isFacingWell = angleToOpp < 0.45;

  // If close and facing properly, execute attacks
  if (opp.dist <= attackRange && isFacingWell && !opp.airborne && api.los(opp.x, opp.z)) {
    // Prioritize k2 root if available, otherwise k1 smash
    if (api.ready('k2')) {
      api.use('k2');
      api.say('Стой на месте!');
      return;
    }
    if (api.ready('k1')) {
      api.use('k1');
      api.say('Сокрушу!');
      return;
    }
  }

  // Movement: relentlessly pursue the octopus
  if (opp.visible && opp.dist < 6.0) {
    // Direct charge when visible and close
    api.move(dirToOpp.x, dirToOpp.z);
  } else {
    // Pathfind around obstacles to corner the enemy
    api.moveTo(opp.x, opp.z);
  }
}