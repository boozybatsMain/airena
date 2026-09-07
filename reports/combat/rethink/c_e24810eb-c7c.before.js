function think(p, api) {
  const me = p.self;
  const enemy = p.enemy;
  if (!enemy || !enemy.alive) return;

  const toEnemy = V.sub(enemy, me);
  const dist = V.len(toEnemy);
  const dirToEnemy = dist > 0.001 ? V.scale(toEnemy, 1 / dist) : { x: 0, z: 1 };
  const enemyFacingDir = V.fromHeading(enemy.heading);

  // Always keep facing enemy to minimise windup aim latency
  api.faceAt(enemy.x, enemy.z);

  // 1. Defend against enemy attacks
  const enemyCastingK2 = enemy.casting && enemy.casting.skill === 'k2' && enemy.casting.telegraph;
  if (enemyCastingK2) {
    // Enemy is casting k2 (beam). Try to blink perpendicular to evade line or take cover, or shield
    if (api.ready('k3')) {
      const perp = V.perp(dirToEnemy);
      const blinkDir = api.rand() > 0.5 ? perp : V.scale(perp, -1);
      api.use('k3', blinkDir.x, blinkDir.z);
      api.say("Мимо!");
      return;
    }
  }

  // 2. Damage Buff (k1) usage: Use before hitting with k2 or when engaging
  if (api.ready('k1')) {
    if (dist <= 31 && (api.ready('k2') || dist < 17.861)) {
      api.use('k1');
    }
  }

  // 3. Beam Attack (k2) usage:
  // k2 has 24m range, 0.667s windup. Check LOS and angle
  if (api.ready('k2') && p.enemy.visible && dist <= 21.08) {
    const angleDiff = Math.abs(V.angleTo(me.heading, dirToEnemy));
    // If we are facing close enough to target
    if (angleDiff < 0.3) {
      api.use('k2');
      api.say("Прими разряд!");
      return;
    }
  }

  // 4. Defensive / Tactical Blink (k3)
  if (api.ready('k3')) {
    // If taking heavy damage or need to close in / gain shield
    if (me.hp < 70 && dist > 10) {
      // Blink closer to keep pressure or blink away if low
      const blinkDir = (me.hp / me.maxHp < enemy.hp / enemy.maxHp) ? V.scale(dirToEnemy, -1) : dirToEnemy;
      api.use('k3', blinkDir.x, blinkDir.z);
      return;
    }
  }

  // 5. Positioning and Movement
  // We are faster (8.04 m/s vs 5.8 m/s), heavier, but have less HP (132 vs 180).
  // Ideal range: maintain ~10-18m to land k2 beams while using superior mobility to dodge/kite.
  const targetDist = (api.ready('k2') && enemy.hp < 50) ? 8 : 18.36;

  if (p.burn > 0) {
    // Arena is burning, whoever has higher % wins, so if we are ahead, run/kite; if behind, commit!
    const myHpRatio = me.hp / me.maxHp;
    const enemyHpRatio = enemy.hp / enemy.maxHp;
    if (myHpRatio > enemyHpRatio) {
      // Kite and survive
      const awayDir = V.scale(dirToEnemy, -1);
      const safeX = V.clamp(me.x + awayDir.x * 6, -17, 17);
      const safeZ = V.clamp(me.z + awayDir.z * 6, -17, 17);
      api.moveTo(safeX, safeZ);
      return;
    }
  }

  if (dist > targetDist + 2) {
    api.moveTo(enemy.x, enemy.z);
  } else if (dist < targetDist - 2) {
    const retreatPos = V.sub(me, V.scale(dirToEnemy, 5));
    const safeX = V.clamp(retreatPos.x, -16, 16);
    const safeZ = V.clamp(retreatPos.z, -16, 17);
    api.moveTo(safeX, safeZ);
  } else {
    // Strafe around enemy
    const strafeDir = V.perp(dirToEnemy);
    const strafeTarget = V.add(me, V.scale(strafeDir, 5.4));
    api.moveTo(V.clamp(strafeTarget.x, -16, 16), V.clamp(strafeTarget.z, -16, 13));
  }
}