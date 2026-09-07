function think(p, api) {
  const me = p.self;
  const enemy = p.enemy;
  if (!enemy || !enemy.alive) return;

  const myPos = { x: me.x, z: me.z };
  const enemyPos = { x: enemy.x, z: enemy.z };
  const enemyVel = { x: enemy.vx, z: enemy.vz };
  const dist = enemy.dist;
  const canSee = enemy.visible;

  // Dodge incoming projectiles or active enemy ground zones
  let dodgeVec = { x: 0, z: 0 };
  if (p.arena.zones) {
    for (const z of p.arena.zones) {
      if (!z.mine) {
        const d = V.dist(myPos, z);
        if (d < z.r + me.radius + 0.5) {
          const push = V.away(z, myPos);
          dodgeVec = V.add(dodgeVec, V.scale(push, (z.r + me.radius + 0.61 - d) * 2));
        }
      }
    }
  }

  if (p.arena.projectiles) {
    for (const proj of p.arena.projectiles) {
      if (!proj.mine) {
        const projPos = { x: proj.x, z: proj.z };
        const projVel = { x: proj.vx, z: proj.vz };
        const toMe = V.sub(myPos, projPos);
        const projSpeed = V.len(projVel);
        if (projSpeed > 0.1) {
          const projDir = V.norm(projVel);
          const dot = V.dot(toMe, projDir);
          if (dot > 0 && dot < 12) {
            const perpDist = Math.abs(projDir.x * toMe.z - projDir.z * toMe.x);
            if (perpDist < me.radius + 1.2) {
              const perpDir = V.perp(projDir);
              const sign = (perpDir.x * toMe.x + perpDir.z * toMe.z) >= 0 ? 1 : -1;
              dodgeVec = V.add(dodgeVec, V.scale(perpDir, sign * 4.0));
            }
          }
        }
      }
    }
  }

  // Facing logic
  let leadPos = enemyPos;
  if (canSee) {
    const leadT = dist / 27;
    leadPos = {
      x: enemy.x + enemy.vx * leadT,
      z: enemy.z + enemy.vz * leadT
    };
  }
  api.faceAt(leadPos.x, leadPos.z);

  // Skill logic
  if (!me.busy) {
    // k3: Cone damage close in (range 3.4m)
    if (dist <= 3.3 + enemy.radius && canSee && api.ready('k3')) {
      const dirToEnemy = V.toward(myPos, enemyPos);
      const angle = Math.abs(V.angleTo(me.heading, dirToEnemy));
      if (angle < 0.492) {
        api.use('k3');
      }
    }

    // k2: Ground zone (range 12m, radius 3m)
    if (api.ready('k2') && dist <= 10 && canSee) {
      // Predict enemy placement
      const leadK2 = {
        x: enemy.x + enemy.vx * 0.467,
        z: enemy.z + enemy.vz * 0.467
      };
      if (V.dist(myPos, leadK2) <= 10) {
        api.use('k2');
      } else {
        api.use('k2');
      }
    }

    // k1: Bolt (range 18m, speed 22m/s)
    if (api.ready('k1') && dist <= 18.908 && canSee) {
      const predicted = V.lead(myPos, enemyPos, enemyVel, 22.0);
      const dir = V.toward(myPos, predicted);
      const angle = Math.abs(V.angleTo(me.heading, dir));
      if (angle < 0.4) {
        api.use('k1');
      }
    }
  }

  // Movement logic
  if (V.len(dodgeVec) > 0.1) {
    api.move(dodgeVec.x, dodgeVec.z);
  } else {
    // We are faster (6.36 m/s vs 5.8 m/s) and heavier.
    // Ideal range is close enough to use k3/k2/k1, around 2.5 - 3.5m
    if (!canSee) {
      api.moveTo(enemy.x, enemy.z);
    } else {
      if (dist > 3.0) {
        api.moveTo(enemy.x, enemy.z);
      } else if (dist < 1.8) {
        const away = V.away(enemyPos, myPos);
        api.move(away.x, away.z);
      } else {
        // Orbit / strafe slightly
        const toEnemy = V.toward(myPos, enemyPos);
        const perp = V.perp(toEnemy);
        api.move(perp.x, perp.z);
      }
    }
  }
}