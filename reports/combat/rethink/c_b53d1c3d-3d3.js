function think(p, api) {
  const self = p.self, enemy = p.enemy;
  if (!self.alive) return;

  const k1 = self.kit.k1 || {};
  const k3 = self.kit.k3 || {};
  const k1Windup = k1.windup ?? 0.5;
  const k3Windup = k3.windup ?? 0.367;
  const k3Speed = k3.speed ?? 22;

  function predictAim(windup, projSpeed) {
    const fx = enemy.x + enemy.vx * windup;
    const fz = enemy.z + enemy.vz * windup;
    if (projSpeed && projSpeed > 0) {
      const dx = fx - self.x, dz = fz - self.z;
      const d = Math.hypot(dx, dz) || 0.001;
      const travel = d / projSpeed;
      return { x: fx + enemy.vx * travel, z: fz + enemy.vz * travel };
    }
    return { x: fx, z: fz };
  }

  const dist = enemy.dist;
  const toEnemy = V.toward(self, enemy);
  const strafeDir = Math.sin(p.t * 0.9 + (self.id === 'blue' ? 0 : Math.PI)) >= 0 ? 1 : -1;

  const dangerTele = enemy.casting && enemy.casting.telegraph &&
    (enemy.casting.skill === 'k1' || enemy.casting.skill === 'k3');

  // --- emergency escape ---
  const lowHp = self.hp / self.maxHp < 0.25;
  if (lowHp && dist < 9 && api.ready('k2')) {
    const away = V.away(self, enemy);
    api.use('k2', { x: self.x + away.x * 6.5, z: self.z + away.z * 6.5 });
  }

  // --- dodge a telegraphed shot ---
  if (dangerTele && enemy.casting.remaining < 0.32 && dist < 11 && api.ready('k2')) {
    const perp = V.perp(toEnemy);
    const bx = self.x + perp.x * strafeDir * 6.5;
    const bz = self.z + perp.z * strafeDir * 6.5;
    api.use('k2', { x: bx, z: bz });
  }

  // --- movement ---
  let moveVec = null;
  if (!enemy.visible) {
    api.moveTo(enemy.x, enemy.z);
  } else if (dangerTele) {
    const perp = V.perp(toEnemy);
    moveVec = V.add(V.scale(perp, strafeDir), V.scale(V.away(self, enemy), 0.35));
  } else {
    const desiredDist = 13.5;
    if (dist > desiredDist + 2.5) {
      moveVec = toEnemy;
    } else if (dist < desiredDist - 2.5) {
      moveVec = V.away(self, enemy);
    } else {
      moveVec = V.scale(V.perp(toEnemy), strafeDir);
    }
  }
  if (moveVec) {
    const n = V.norm(moveVec);
    if (n.x !== 0 || n.z !== 0) {
      api.moveTo(self.x + n.x * 6, self.z + n.z * 6);
    } else {
      api.stop();
    }
  }

  // --- attack ---
  if (!self.busy) {
    const canK1 = api.ready('k1') && dist <= 23.5 && enemy.visible;
    const canK3 = api.ready('k3') && dist <= 17.5 && enemy.visible;

    if (canK1) {
      const aim = predictAim(k1Windup, 0);
      api.use('k1', aim);
    } else if (canK3) {
      const aim = predictAim(k3Windup, k3Speed);
      api.use('k3', aim);
    } else if (!dangerTele) {
      api.faceAt(enemy.x, enemy.z);
    }
  }
}