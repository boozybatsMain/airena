function think(p, api) {
  if (!p.self.alive || !p.enemy.alive) return;

  const self = p.self;
  const enemy = p.enemy;
  const dist = enemy.dist;
  const kit = self.kit;

  const k1Ready = api.ready('k1');
  const k2Ready = api.ready('k2');
  const k3Ready = api.ready('k3');

  const enemyCasting = enemy.casting;
  const inConeRange = dist <= 4.9;
  const inDashReach = dist <= 11.183;

  const myHpFrac = self.hp / self.maxHp;
  const enemyHpFrac = enemy.hp / enemy.maxHp;

  // --- Defensive: Shield/Heal ---
  if (k3Ready && (myHpFrac < 0.6 || self.shield < 5)) {
    if (self.hp < self.maxHp) {
      api.use('k3');
      return;
    }
  }

  // --- Interrupt enemy windup ---
  if (enemyCasting && enemyCasting.telegraph && enemyCasting.phase === 'windup') {
    const enemySkill = enemyCasting.skill;
    const enemyKit = enemy.kit[enemySkill];
    if (enemyKit && k2Ready && inConeRange) {
      api.use('k2', { x: enemy.x, z: enemy.z });
      return;
    }
    if (enemyKit && enemyKit.kind === 'dash' && k1Ready && inDashReach) {
      api.use('k1', { x: enemy.x, z: enemy.z });
      return;
    }
  }

  // --- Offensive: Cone (k2) priority at close range ---
  if (k2Ready && inConeRange) {
    api.use('k2', { x: enemy.x, z: enemy.z });
    return;
  }

  // --- Offensive: Dash (k1) at mid range ---
  if (k1Ready && inDashReach && dist > 4.9) {
    api.use('k1', { x: enemy.x, z: enemy.z });
    return;
  }

  // --- Movement: Close distance if far, circle if in danger ---
  if (dist > 11.183) {
    api.moveTo(enemy.x, enemy.z);
    api.faceAt(enemy.x, enemy.z);
  } else if (dist < 4.0 && !self.stunned && !self.rooted) {
    // Backpedal slightly to avoid point-blank dash/trade
    const away = V.away({ x: self.x, z: self.z }, { x: enemy.x, z: enemy.z });
    api.move(away.x, away.z);
    api.faceAt(enemy.x, enemy.z);
  } else {
    // Strafe to avoid linear prediction
    const toEnemy = V.toward({ x: self.x, z: self.z }, { x: enemy.x, z: enemy.z });
    const perp = V.perp(toEnemy);
    const strafeDir = (Math.floor(p.t * 2) % 2 === 0) ? perp : V.scale(perp, -1);
    api.move(strafeDir.x, strafeDir.z);
    api.faceAt(enemy.x, enemy.z);
  }

  // --- Voice lines ---
  if (p.tick % 30 === 0) {
    if (myHpFrac < 0.3) {
      api.say("I bleed... but I do not break.");
    } else if (enemyHpFrac < 0.3) {
      api.say("End this.");
    } else if (k1Ready && inDashReach) {
      api.say("Dash!");
    }
  }
}