function think(p, api) {
  const me = p.self;
  const enemy = p.enemy;
  const dist = enemy.dist;
  
  // Facing: track enemy or lead if using bolt
  let aimTarget = { x: enemy.x, y: 0, z: enemy.z };
  if (enemy.speed > 0.1) {
    const leadPos = V.lead(me, enemy, { x: enemy.vx, z: enemy.vz }, 22);
    if (leadPos) aimTarget = leadPos;
  }
  api.faceAt(aimTarget.x, aimTarget.z);

  // Skill logic
  // k3: Melee cone 3.4m, heavy damage 44.2
  // We want to hit k3 when facing enemy and in range
  const toEnemyDir = V.toward(me, enemy);
  const myFacingDir = V.fromHeading(me.heading);
  const angleDiff = Math.abs(V.angleTo(me.heading, toEnemyDir));

  if (api.ready('k3') && dist <= 4.148 && angleDiff < 0.8 && enemy.visible) {
    api.faceAt(enemy.x, enemy.z);
    api.use('k3');
    api.say('Получай!');
    return;
  }

  // k2: Bolt range 18m, speed 22m/s, roots 1.05s & weakens
  if (api.ready('k2') && dist <= 22 && enemy.visible && !enemy.invulnerable) {
    if (aimTarget) {
      api.faceAt(aimTarget.x, aimTarget.z);
    }
    api.use('k2');
    return;
  }

  // k1: Ground zone range 12m, slows enemy
  if (api.ready('k1') && dist <= 12 && enemy.visible) {
    api.use('k1');
    return;
  }

  // Movement & dodging
  // 1. Avoid active dangerous zones if standing in one
  let escapeDir = null;
  if (p.arena.zones && p.arena.zones.length > 0) {
    for (const z of p.arena.zones) {
      if (!z.mine) {
        const dZone = V.dist(me, z);
        if (dZone < z.r + me.radius + 0.61) {
          escapeDir = V.away(me, z);
          break;
        }
      }
    }
  }

  // 2. Dodge incoming enemy projectiles
  if (!escapeDir && p.arena.projectiles && p.arena.projectiles.length > 0) {
    for (const proj of p.arena.projectiles) {
      if (!proj.mine) {
        const dProj = V.dist(me, proj);
        if (dProj < 8) {
          const projDir = { x: proj.vx, z: proj.vz };
          const perp = V.perp(V.norm(projDir));
          escapeDir = perp;
          break;
        }
      }
    }
  }

  if (escapeDir) {
    api.move(escapeDir.x, escapeDir.z);
    return;
  }

  // 3. Spacing / Engagement Strategy:
  // We want to close in for k3 when available or when enemy is rooted/weakened.
  // If k3 is on cooldown and enemy has k3 ready, stay slightly outside 3.5m range.
  const k3Cd = api.cooldown('k3');
  
  if (k3Cd <= 1.0 || dist > 6.0) {
    // Close in
    if (dist > 2.2) {
      api.moveTo(enemy.x, enemy.z);
    } else {
      // Circle around enemy closely to mess up their cone/skill aiming
      const perp = V.perp(toEnemyDir);
      api.move(perp.x, perp.z);
    }
  } else {
    // Kite / maintain medium range (approx 4.5m)
    if (dist < 3.028) {
      const away = V.away(me, enemy);
      api.move(away.x, away.z);
    } else if (dist > 7.0) {
      api.moveTo(enemy.x, enemy.z);
    } else {
      // Strafe
      const perp = V.perp(toEnemyDir);
      api.move(perp.x, perp.z);
    }
  }
}