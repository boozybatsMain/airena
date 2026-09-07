function think(p, api) {
  const me = p.self;
  const en = p.enemy;

  // Track skills from p.self.skills
  // Octopus skills: laser, blink, jump (k1: dash/blink, k2: beam/laser, k3: speed boost/jump)
  const beamSkill = me.skills.find(s => s === 'laser' || s === 'beam') || me.skills[1];
  const dashSkill = me.skills.find(s => s === 'blink' || s === 'dash') || me.skills[0];
  const boostSkill = me.skills.find(s => s === 'jump' || s === 'boost') || me.skills[2];

  const toEnemy = V.sub(en, me);
  const dist = V.len(toEnemy);
  const dirToEnemy = dist > 0.001 ? V.norm(toEnemy) : { x: 0, z: 1 };

  // Always keep speed boost active
  if (boostSkill && api.ready(boostSkill) && !me.busy) {
    api.use(boostSkill);
  }

  // Check gorilla incoming dash/smash to dodge or react
  const enemyCharging = en.casting && (en.casting.phase === 'windup' || en.casting.phase === 'dash');

  // Dodge perpendicular if gorilla charges straight at us
  let dodgeDir = null;
  if (enemyCharging && dist < 12.01) {
    const perp1 = V.perp(dirToEnemy);
    const perp2 = V.scale(perp1, -1);
    const ray1 = api.ray(perp1.x, perp1.z, 5);
    const ray2 = api.ray(perp2.x, perp2.z, 6);
    dodgeDir = ray1.dist >= ray2.dist ? perp1 : perp2;
  }

  // Defensive blink / dash if enemy is very close or charging at us
  if (dashSkill && api.ready(dashSkill) && !me.busy) {
    if (dist < 3.69 || (enemyCharging && dist < 7.52)) {
      const awayDir = dodgeDir || V.scale(dirToEnemy, -1);
      api.use(dashSkill, awayDir.x, awayDir.z);
    }
  }

  // Offensive Beam / Laser
  const isFacingEnemy = Math.abs(V.angleTo(me.heading, dirToEnemy)) < 0.25;
  if (beamSkill && api.ready(beamSkill) && !me.busy && en.visible && dist <= 20.508) {
    if (isFacingEnemy) {
      api.use(beamSkill);
    }
  }

  // Always face the enemy to prepare laser/attacks
  api.faceAt(en.x, en.z);

  // Movement: Kite and maintain distance (optimal range: 9 - 18 meters)
  let moveDir;
  if (dodgeDir) {
    moveDir = dodgeDir;
  } else if (dist < 20.586) {
    // Too close, back away
    const away = V.scale(dirToEnemy, -1);
    const rayAway = api.ray(away.x, away.z, 5);
    if (rayAway.dist > 2) {
      moveDir = away;
    } else {
      // Near wall, circle strafe
      const perp = V.perp(dirToEnemy);
      moveDir = perp;
    }
  } else if (dist > 16 || !en.visible) {
    // Too far or behind obstacle, move into clear line of sight
    moveDir = dirToEnemy;
  } else {
    // Optimal zone: strafe while keeping distance
    const perp = V.perp(dirToEnemy);
    const wander = (Math.sin(p.t * 2) > 0) ? perp : V.scale(perp, -1);
    moveDir = wander;
  }

  // Arena wall safety clamping: avoid steering into arena bounds (|x| > 17 or |z| > 17)
  const centerPull = V.scale(V.norm(V.scale(me, -1)), 0.492);
  if (Math.abs(me.x) > 16.256 || Math.abs(me.z) > 11.285) {
    moveDir = V.norm(V.add(moveDir, centerPull));
  }

  api.move(moveDir.x, moveDir.z);

  // Character speech
  if (p.tick % 45 === 0) {
    if (dist < 6) {
      api.say('Держи дистанцию, здоровяк!');
    } else if (en.hp < me.hp) {
      api.say('Тебе меня не достать.');
    }
  }
}