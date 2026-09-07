function think(p, api) {
  const self = p.self, enemy = p.enemy;
  if (!self.alive) return;

  if (p.t < 1 && !p.mem.saidHello) {
    api.say("Let's dance.");
    api.remember('saidHello', true);
  }

  // Keep tracking the enemy with our facing at all times unless we
  // deliberately override it for a dodge below.
  api.faceAt(enemy.x, enemy.z);

  const dist = enemy.dist;
  const hpFrac = self.hp / self.maxHp;
  const toEnemy = V.toward(self, enemy);
  const away = V.toward(enemy, self);
  const perp = V.perp(away);

  let usedAbility = false;

  // --- emergency reactions ---
  if (!self.stunned) {
    const beamImminent = enemy.casting && enemy.casting.telegraph &&
      enemy.casting.skill === 'k1' && enemy.casting.remaining < 0.18;

    if (self.burning && api.ready('k2')) {
      api.use('k2', away.x, away.z);
      usedAbility = true;
    } else if (hpFrac < 0.28 && dist < 9 && api.ready('k2')) {
      api.use('k2', away.x, away.z);
      usedAbility = true;
    } else if (beamImminent && api.ready('k2')) {
      const side = (Math.sin(p.t * 7) >= 0) ? 1 : -1;
      api.use('k2', perp.x * side, perp.z * side);
      usedAbility = true;
    }
  }

  // --- movement ---
  if (self.casting && self.casting.telegraph) {
    // holding still-ish ok, movement still allowed, keep orbit logic below
  }

  const beamThreat = enemy.casting && enemy.casting.telegraph && enemy.casting.skill === 'k1';

  if (beamThreat && !usedAbility) {
    const side = (Math.sin(p.t * 3) >= 0) ? 1 : -1;
    const dodge = { x: perp.x * side - toEnemy.x * 0.15, z: perp.z * side - toEnemy.z * 0.15 };
    api.move(dodge.x, dodge.z);
  } else if (!enemy.visible) {
    api.moveTo(enemy.x, enemy.z);
  } else {
    const idealRange = 10;
    const strafe = Math.sin(p.t * 0.8) * 4;
    let tx = enemy.x + away.x * idealRange + perp.x * strafe;
    let tz = enemy.z + away.z * idealRange + perp.z * strafe;
    tx = Math.max(-18, Math.min(18, tx));
    tz = Math.max(-18, Math.min(18, tz));
    api.moveTo(tx, tz);
  }

  // --- offense ---
  if (!usedAbility && !self.busy) {
    if (api.ready('k1') && enemy.visible && dist <= 23) {
      api.use('k1');
      usedAbility = true;
    } else if (api.ready('k3') && dist <= 14) {
      api.use('k3');
      usedAbility = true;
    } else if (api.ready('k2') && dist > 16) {
      api.use('k2', enemy.x, enemy.z);
      usedAbility = true;
    }
  }
}