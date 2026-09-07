function think(p, api) {
  const enemy = p.enemy;
  const self = p.self;

  if (!self.alive) return;

  // Handle events for feedback (optional, could use for adaptive tactics)
  for (const e of p.events) {
    if (e.type === 'dealt') api.say('Feel that?');
    if (e.type === 'damaged' && e.amount > 10) api.say('Ow!');
  }

  const dist = enemy.dist;
  const distToEnemy = V.dist({x: self.x, z: self.z}, {x: enemy.x, z: enemy.z});

  // If enemy is casting something dangerous, try to dodge or interrupt
  const enemyCasting = enemy.casting && enemy.casting.telegraph;

  // Basic kiting logic: maintain optimal range for k1 (lob, range 15) and k2 (zone, range 12)
  const idealMin = 6;
  const idealMax = 13;

  // Face the enemy always unless casting something that needs different aim
  api.faceAt(enemy.x, enemy.z);

  // Movement: kite to stay in ideal range while avoiding standing still
  if (!self.rooted && !self.stunned) {
    if (dist < idealMin) {
      // back away
      const away = V.away({x: self.x, z: self.z}, {x: enemy.x, z: enemy.z});
      const target = V.add({x: self.x, z: self.z}, V.scale(away, 5));
      api.moveTo(target.x, target.z);
    } else if (dist > idealMax) {
      api.moveTo(enemy.x, enemy.z);
    } else {
      // strafe a bit using perpendicular movement based on time
      const perp = V.perp(V.toward({x: self.x, z: self.z}, {x: enemy.x, z: enemy.z}));
      const sign = Math.sin(p.t * 0.7) > 0 ? 1 : -1;
      const strafeTarget = V.add({x: self.x, z: self.z}, V.scale(perp, sign * 4));
      api.moveTo(strafeTarget.x, strafeTarget.z);
    }
  }

  if (self.busy) return; // can't cast anything else right now

  // Priority: shield/heal (k3) if low hp or expecting damage
  const hpFrac = self.hp / self.maxHp;
  if (api.ready('k3')) {
    if (hpFrac < 0.5 || (enemyCasting && enemy.casting.skill === 'k1')) {
      api.use('k3');
      return;
    }
  }

  // If enemy is winding up an attack and we're not shielded, consider using k3 for shield
  if (enemyCasting && !self.shield && hpFrac < 0.7 && api.ready('k3')) {
    api.use('k3');
    return;
  }

  // Offensive: use k1 (lob) at range if not too close, with lead
  if (api.ready('k1') && dist <= 15 && dist >= 3.24) {
    const targetVel = {x: enemy.vx, z: enemy.vz};
    const lead = V.lead({x: self.x, z: self.z}, {x: enemy.x, z: enemy.z}, targetVel, self.kit.k1.speed || 12);
    api.use('k1', {x: lead.x, z: lead.z});
    return;
  }

  // Use k2 (zone) if enemy is close enough and roughly stationary, to burn+root
  if (api.ready('k2') && dist <= 12) {
    api.use('k2', {x: enemy.x, z: enemy.z});
    return;
  }

  // If nothing else and in range, just use k1 without a specific aim
  if (api.ready('k1') && dist <= 15) {
    api.use('k1');
    return;
  }
}