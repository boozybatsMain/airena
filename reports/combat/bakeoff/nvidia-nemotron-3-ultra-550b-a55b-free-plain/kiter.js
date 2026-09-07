function think(p, api) {
  const kit = p.self.kit;
  const enemy = p.enemy;
  const self = p.self;

  // Helper: distance between centers
  const dist = enemy.dist;

  // Helper: check if skill ready
  const ready = (name) => api.ready(name);

  // Helper: aim point at enemy
  const aimAtEnemy = () => ({ x: enemy.x, z: enemy.z });

  // Helper: check line of sight
  const hasLOS = api.los(enemy.x, enemy.z);

  // Priorities:
  // 1. If enemy is casting k3 (beam) or k1 (bolt) and we can interrupt with k3 (silence) or k1 (root), do it.
  // 2. If low HP and k2 (blink+cleanse+shield) ready, use defensively.
  // 3. If enemy in range and LOS, use k3 (beam) for damage+silence.
  // 4. If enemy in range and LOS, use k1 (bolt) for damage+root.
  // 5. Use k2 to close distance or escape.
  // 6. Move to maintain mid-range, avoid blocks.

  // Check enemy casting
  const enemyCasting = enemy.casting;
  const enemyCastingSkill = enemyCasting ? enemyCasting.skill : null;
  const enemyTelegraph = enemyCasting ? enemyCasting.telegraph : false;

  // If enemy is winding up a beam (k3) or bolt (k1), try to interrupt with k3 (silence) if ready and in range
  if (enemyTelegraph && (enemyCastingSkill === 'k3' || enemyCastingSkill === 'k1')) {
    if (ready('k3') && dist <= kit.k3.reach && hasLOS) {
      api.use('k3', aimAtEnemy());
      return;
    }
    if (ready('k1') && dist <= kit.k1.reach && hasLOS) {
      api.use('k1', aimAtEnemy());
      return;
    }
  }

  // Defensive: if HP low (<40%) or rooted/stunned/silenced/burning, use k2 to cleanse and shield
  const hpFrac = self.hp / self.maxHp;
  if ((hpFrac < 0.4 || self.rooted || self.silenced || self.burning || self.stunned) && ready('k2')) {
    // Blink away from enemy to safe spot
    const away = V.away({ x: self.x, z: self.z }, { x: enemy.x, z: enemy.z });
    const blinkDist = Math.min(kit.k2.distance, 6.5);
    const targetX = self.x + away.x * blinkDist;
    const targetZ = self.z + away.z * blinkDist;
    api.use('k2', { x: targetX, z: targetZ });
    return;
  }

  // Offensive: use k3 (beam) if enemy in reach and LOS
  if (ready('k3') && dist <= kit.k3.reach && hasLOS) {
    api.use('k3', aimAtEnemy());
    return;
  }

  // Offensive: use k1 (bolt) if enemy in reach and LOS
  if (ready('k1') && dist <= kit.k1.reach && hasLOS) {
    api.use('k1', aimAtEnemy());
    return;
  }

  // Mobility: use k2 to close distance if far, or escape if too close
  if (ready('k2')) {
    if (dist > kit.k3.reach + 2) {
      // Blink towards enemy
      const toward = V.toward({ x: self.x, z: self.z }, { x: enemy.x, z: enemy.z });
      const targetX = self.x + toward.x * kit.k2.distance;
      const targetZ = self.z + toward.z * kit.k2.distance;
      api.use('k2', { x: targetX, z: targetZ });
      return;
    } else if (dist < 4) {
      // Blink away
      const away = V.away({ x: self.x, z: self.z }, { x: enemy.x, z: enemy.z });
      const targetX = self.x + away.x * kit.k2.distance;
      const targetZ = self.z + away.z * kit.k2.distance;
      api.use('k2', { x: targetX, z: targetZ });
      return;
    }
  }

  // Movement: maintain distance around 15-20m, circle around blocks
  const desiredDist = 18;
  const diff = dist - desiredDist;
  if (Math.abs(diff) > 2) {
    const toward = V.toward({ x: self.x, z: self.z }, { x: enemy.x, z: enemy.z });
    if (diff > 0) {
      // Too far, move closer
      api.move(toward.x, toward.z);
    } else {
      // Too close, move away
      api.move(-toward.x, -toward.z);
    }
  } else {
    // Circle perpendicular to enemy
    const perp = V.perp(V.toward({ x: self.x, z: self.z }, { x: enemy.x, z: enemy.z }));
    api.move(perp.x, perp.z);
  }

  // Face enemy for aiming
  api.faceAt(enemy.x, enemy.z);
}