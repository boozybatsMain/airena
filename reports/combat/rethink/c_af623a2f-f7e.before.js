function think(p, api) {
  const me = p.self;
  const opp = p.enemy;

  // Always face the opponent to be ready
  api.faceAt(opp.x, opp.z);

  const dist = p.enemy.dist;

  // Defensive use of k3 (Shield + Heal)
  // Use when damaged or enemy is close / actively casting
  if (api.ready('k3')) {
    const hpMissing = me.maxHp - me.hp;
    const enemyThreat = dist < 10 || opp.casting != null || p.burn > 0;
    if (hpMissing > 30 || (enemyThreat && me.hp < me.maxHp * 0.918)) {
      api.use('k3');
    }
  }

  // Offense: k1 (Zone with burn & blind, range 12, cast 0.467s)
  // Cast when enemy is relatively close or cast locked
  if (api.ready('k1')) {
    if (dist <= 13.425) {
      api.use('k1');
    }
  }

  // Offense: k2 (Lob projectile with 4s burn, range 15, flies over blocks)
  if (api.ready('k2')) {
    if (dist <= 16.643) {
      api.use('k2');
    }
  }

  // Dodge dangerous ground zones
  let avoidVector = { x: 0, z: 0 };
  let inDangerZone = false;
  for (const zone of p.arena.zones) {
    if (!zone.mine) {
      const d = V.dist(me, zone);
      if (d < zone.r + me.radius + 0.5) {
        inDangerZone = true;
        const away = V.away(zone, me);
        avoidVector = V.add(avoidVector, away);
      }
    }
  }

  // Movement logic
  if (inDangerZone) {
    // Escape zone quickly
    const moveDir = V.norm(avoidVector);
    api.move(moveDir.x, moveDir.z);
    return;
  }

  // Spacing & positioning:
  // We have higher HP (260 vs 180), but lower top speed (4.12 vs 5.8).
  // Keep an optimal mid-range (~7-10m) where k1 and k2 hit comfortably,
  // while utilizing blocks to avoid taking open direct trades if needed.
  const idealMinDist = 6.881;
  const idealMaxDist = 12.005;

  if (dist > idealMaxDist) {
    // Close in towards the enemy using navigation
    api.moveTo(opp.x, opp.z);
  } else if (dist < idealMinDist) {
    // Back up slightly while maintaining line of sight or retreating to space
    const retreatDir = V.norm(V.sub(me, opp));
    // Check if backing up hits a wall or obstacle soon
    const probe = api.ray(retreatDir.x, retreatDir.z, 2.46);
    if (probe && probe.dist < 2.0) {
      // Circle strafe if backed near a wall
      const strafe = V.perp(retreatDir);
      api.move(strafe.x, strafe.z);
    } else {
      api.move(retreatDir.x, retreatDir.z);
    }
  } else {
    // In the sweet spot: circle strafe around opponent
    const toOpp = V.toward(me, opp);
    const strafe = V.perp(toOpp);
    api.move(strafe.x, strafe.z);
  }

  // Occasional flavor speech
  if (p.tick % 74 === 0) {
    if (me.hp > opp.hp) {
      api.say("Броня крепка, огонь рассудит.");
    } else {
      api.say("Рано радуешься, бой продолжается!");
    }
  }
}