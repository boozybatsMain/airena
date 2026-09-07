function think(p, api) {
  const me = p.self;
  const en = p.enemy;

  if (!me.alive || !en.alive) return;

  // Always face enemy or predicted enemy pos
  const leadPos = V.lead(me, en, { x: en.vx, z: en.vz }, 12);
  api.faceAt(en.x, en.z);

  // 1. Defend / Sustain: Use k2 (Shield & Heal) whenever ready and either damaged or close to enemy
  if (api.ready('k2')) {
    if (me.hp < me.maxHp || en.dist < 6 || (en.casting && en.casting.telegraph)) {
      api.use('k2');
      api.say('Броня гориллы крепка!');
      return;
    }
  }

  // 2. Offense: Use k3 (Heavy Slam) when close enough and aligned
  if (api.ready('k3')) {
    const angleToEn = Math.abs(V.angleTo(me.heading, V.toward(me, en)));
    // k3 has 3.4m range, floor sweep
    if (en.dist <= 3.3 && angleToEn < 0.7 && !en.airborne) {
      api.use('k3');
      api.say('КРУШИТЬ!');
      return;
    }
  }

  // 3. Tactical: Use k1 (Wall) to block enemy retreat or cut them off if they are running away
  if (api.ready('k1')) {
    // If enemy is fleeing or at mid-range, drop a wall behind/on their path
    if (en.dist > 5 && en.dist < 14 && api.los(en.x, en.z)) {
      // Predict where they run
      const wallTarget = leadPos;
      api.use('k1', wallTarget.x, wallTarget.z);
      api.say('Не уйдешь!');
    }
  }

  // 4. Movement: Gorilla is faster (5.35 vs 4.22) and heavier (2.2 vs 1.0)
  // Relentlessly chase down the octopus
  if (en.dist > 2.0) {
    if (en.visible) {
      // Direct charge if line of sight is clear
      const toEn = V.toward(me, en);
      api.move(toEn.x, toEn.z);
    } else {
      // Pathfind around blocks
      api.moveTo(en.x, en.z);
    }
  } else {
    // Stay right on top of them and body-block/push with heavy mass
    const toEn = V.toward(me, en);
    api.move(toEn.x, toEn.z);
  }
}