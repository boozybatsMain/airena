function think(p, api) {
  const me = p.self;
  const en = p.enemy;

  // Always keep facing the enemy for accurate cone/zone targeting
  api.faceAt(en.x, en.z);

  const d = p.enemy.dist;
  const inConeRange = d <= 3.564 && en.y <= 0.1 && p.enemy.visible;
  const inZoneRange = d <= 12.019;

  // Avoid enemy active dangerous ground zones
  let dangerZone = null;
  for (const z of p.arena.zones) {
    if (!z.mine) {
      const distToZone = V.dist(me, z);
      if (distToZone < z.r + me.radius + 0.3) {
        dangerZone = z;
        break;
      }
    }
  }

  // Combat Skills Priority:
  // 1. Root (k1) if enemy is in range to pin them down
  if (api.ready('k1') && inZoneRange) {
    api.use('k1');
    api.say('Стоять на месте!');
    return;
  }

  // 2. Damage zone (k3)
  if (api.ready('k3') && inZoneRange) {
    api.use('k3');
    api.say('Зона поражения!');
    return;
  }

  // 3. Close cone burn (k2)
  if (api.ready('k2') && inConeRange) {
    api.use('k2');
    api.say('Гори!');
    return;
  }

  // Movement logic
  if (dangerZone) {
    const away = V.away(dangerZone, me);
    if (V.len(away) > 0.01) {
      api.move(away.x, away.z);
    } else {
      api.move(1, 0);
    }
    return;
  }

  // We are a massive juggernaut (300 hp vs 180 hp), maintain aggressive pressure
  if (d > 3.05) {
    api.moveTo(en.x, en.z);
  } else {
    // In close range, try to body block / push
    const toEnemy = V.toward(me, en);
    api.move(toEnemy.x, toEnemy.z);
  }
}