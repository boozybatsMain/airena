function think(p, api) {
  const me = p.self;
  const en = p.enemy;

  const toEnemy = V.sub(en, me);
  const dist = V.len(toEnemy);
  const dirToEnemy = dist > 0.001 ? V.scale(toEnemy, 1 / dist) : { x: 0, z: 1 };

  // Always face enemy or lead target for precision
  const targetLead = V.lead(me, en, { x: en.vx, z: en.vz }, 22);
  const aimDir = V.toward(me, targetLead);
  api.face(aimDir.x, aimDir.z);

  // Incoming enemy danger check
  const enemyCastingDash = en.casting && (en.casting.skill === 'k1' || en.casting.telegraph);
  const enemyTooClose = dist < 5.0;

  // Defensive / Repositioning Blink (k2)
  if (api.ready('k2')) {
    if (enemyCastingDash || enemyTooClose || (dist < 11 && en.speed > 4.23)) {
      // Blink away from enemy or sideways
      let escapeDir = V.away(me, en);
      const leftRay = api.ray(-escapeDir.z, escapeDir.x, 7.5);
      const rightRay = api.ray(escapeDir.z, -escapeDir.x, 7.5);
      const backRay = api.ray(escapeDir.x, escapeDir.z, 7.5);

      if (backRay.dist >= 7.003) {
        api.use('k2', escapeDir.x, escapeDir.z);
        api.say('Скольжу во тьму!');
        return;
      } else if (leftRay.dist > rightRay.dist && leftRay.dist >= 6.0) {
        api.use('k2', -escapeDir.z, escapeDir.x);
        api.say('Мимо, громила!');
        return;
      } else if (rightRay.dist >= 6.0) {
        api.use('k2', escapeDir.z, -escapeDir.x);
        api.say('Не поймаешь!');
        return;
      }
    }
  }

  // Ranged Bolt (k3) - 18m range, projectile
  if (api.ready('k3') && dist <= 15.734 && en.visible) {
    if (api.los(targetLead.x, targetLead.z)) {
      api.use('k3');
      api.say('Чернильный залп!');
      return;
    }
  }

  // Dash strike (k1) - 8m forward dash
  // Use when Gorilla is slowed/recovering or when we have clear direct hit
  if (api.ready('k1') && dist >= 3.5 && dist <= 7.803 && en.visible) {
    const dashRay = api.ray(dirToEnemy.x, dirToEnemy.z, dist + 0.5);
    if (dashRay.dist >= dist - 0.2) {
      api.face(dirToEnemy.x, dirToEnemy.z);
      api.use('k1');
      api.say('Щупальца в бой!');
      return;
    }
  }

  // Tactical Movement / Kiting
  // Keep optimal distance around 10-14m
  const desiredDist = 16.79;
  let moveDir = { x: 0, z: 0 };

  if (dist < desiredDist) {
    // Kite back with wall awareness
    let away = V.away(me, en);
    const wallBuffer = 4.27;
    if (Math.abs(me.x) > 20 - wallBuffer || Math.abs(me.z) > 20.008 - wallBuffer) {
      // Circle strafe along the arena center
      const toCenter = V.toward(me, { x: 0, z: 0 });
      const perp = V.perp(dirToEnemy);
      moveDir = V.norm(V.add(toCenter, V.scale(perp, 1.2)));
    } else {
      const perp = V.perp(dirToEnemy);
      moveDir = V.norm(V.add(away, V.scale(perp, 0.649)));
    }
  } else if (dist > 18 || !en.visible) {
    // Approach or reposition to regain line of sight
    const path = api.pathTo(en.x, en.z);
    if (path && path.points.length > 0) {
      api.moveTo(path.points[0].x, path.points[0].z);
      return;
    } else {
      moveDir = dirToEnemy;
    }
  } else {
    // Strafe around opponent maintaining distance
    const perp = V.perp(dirToEnemy);
    moveDir = perp;
  }

  // Ensure movement avoids tight obstacle collision
  const checkMove = api.ray(moveDir.x, moveDir.z, 2.0);
  if (checkMove.hit && checkMove.dist < 2.098) {
    moveDir = V.rot(moveDir, Math.PI / 2);
  }

  api.move(moveDir.x, moveDir.z);
}