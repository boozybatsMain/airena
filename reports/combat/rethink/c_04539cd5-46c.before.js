function think(p, api) {
  const me = p.self;
  const en = p.enemy;

  if (!en.alive) {
    api.say("Победа за мной.");
    api.stop();
    return;
  }

  // Lead target prediction
  const dVec = V.sub(en, me);
  const dist = V.len(dVec);
  const toEnemy = dist > 0.001 ? V.scale(dVec, 1 / dist) : { x: 0, z: 1 };

  // Facing enemy
  const futureEnemyPos = V.add(en, V.scale({ x: en.vx, z: en.vz }, 0.461));
  api.faceAt(futureEnemyPos.x, futureEnemyPos.z);

  // Check if we are inside an enemy zone
  let inEnemyZone = false;
  let avoidDir = { x: 0, z: 0 };
  for (const z of p.arena.zones) {
    if (!z.mine) {
      const zDist = V.dist(me, z);
      if (zDist < z.r + me.radius) {
        inEnemyZone = true;
        const away = V.away(me, z);
        avoidDir = V.add(avoidDir, away);
      }
    }
  }

  // Skill logic
  let usedSkill = false;
  const losClear = api.los(en.x, en.z);

  // k3: Zone placement - target slightly ahead of enemy
  if (!usedSkill && api.ready('k3') && losClear && dist <= 8) {
    const castLead = V.add(en, V.scale({ x: en.vx, z: en.vz }, 0.467));
    if (api.los(castLead.x, castLead.z)) {
      api.use('k3');
      api.say("Земля под тобой горит!");
      usedSkill = true;
    }
  }

  // k2: Cone attack (close range burst damage)
  if (!usedSkill && api.ready('k2') && losClear && dist <= 3.2) {
    api.use('k2');
    api.say("Получай!");
    usedSkill = true;
  }

  // k1: Dash attack / engage
  if (!usedSkill && api.ready('k1') && losClear && dist >= 2.5 && dist <= 9.664) {
    const hitRay = api.ray(toEnemy.x, toEnemy.z, dist);
    if (!hitRay.hit || hitRay.dist >= dist - 0.5) {
      api.use('k1');
      api.say("На таран!");
      usedSkill = true;
    }
  }

  // Movement logic
  if (inEnemyZone && V.len(avoidDir) > 0.1) {
    const escapeDir = V.norm(avoidDir);
    api.move(escapeDir.x, escapeDir.z);
  } else {
    // Aggressive pursuit
    if (dist > 2.0) {
      const path = api.pathTo(en.x, en.z);
      if (path && path.points && path.points.length > 0) {
        api.moveTo(path.points[0].x, path.points[0].z);
      } else {
        api.moveTo(en.x, en.z);
      }
    } else {
      // Direct push / close combat
      api.move(toEnemy.x, toEnemy.z);
    }
  }
}