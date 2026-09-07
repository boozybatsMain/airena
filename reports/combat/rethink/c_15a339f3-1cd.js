function think(p, api) {
  const self = p.self, enemy = p.enemy;
  if (!self.alive) return;

  const hasK1 = self.skills.includes('k1');
  const hasK2 = self.skills.includes('k2');
  const hasK3 = self.skills.includes('k3');

  const dist = enemy.dist;
  const badStatus = self.stunned || self.rooted || self.silenced ||
                     self.blinded || self.burning;

  // Priority: cleanse a bad status if we can afford it right now.
  if (badStatus && hasK3 && api.ready('k3')) {
    api.use('k3');
  }

  // If we're mid wind-up on something, aim is already locked;
  // just keep steering, nothing else to decide.
  if (self.casting && self.casting.telegraph) {
    api.moveTo(enemy.x, enemy.z);
    return;
  }

  // Try to evade an incoming enemy strike while it's telegraphed.
  let evading = false;
  if (enemy.casting && enemy.casting.telegraph) {
    const skill = enemy.casting.skill;
    if (skill === 'k1' && dist < 5.2) {
      const away = V.away({ x: self.x, z: self.z }, { x: enemy.x, z: enemy.z });
      api.move(away.x, away.z);
      evading = true;
    } else if (skill === 'k2' && dist < 18) {
      const dir = V.toward({ x: self.x, z: self.z }, { x: enemy.x, z: enemy.z });
      const perp = V.perp(dir);
      const sign = api.recall('dodgeSign', 1);
      api.move(perp.x * sign, perp.z * sign);
      api.remember('dodgeSign', -sign);
      evading = true;
    }
  }

  // Offense: melee cone if in reach.
  if (hasK1 && dist <= 4.7 && enemy.visible && api.ready('k1')) {
    api.use('k1', { x: enemy.x, z: enemy.z });
    if (!evading) api.moveTo(enemy.x, enemy.z);
    return;
  }

  // Offense: ranged bolt, with lead, if k1 unavailable or out of its reach.
  if (hasK2 && dist <= 17.5 && enemy.visible && api.ready('k2')) {
    const speed = (self.kit.k2 && self.kit.k2.speed) || 22;
    const lead = V.lead(
      { x: self.x, z: self.z },
      { x: enemy.x, z: enemy.z },
      { x: enemy.vx, z: enemy.vz },
      speed
    );
    api.use('k2', lead);
    if (!evading) api.moveTo(enemy.x, enemy.z);
    return;
  }

  // Nothing off cooldown to fire: consider a speed boost to close the gap.
  if (hasK3 && !badStatus && dist > 6 && api.ready('k3')) {
    api.use('k3');
  }

  if (!evading) {
    if (enemy.visible) {
      api.moveTo(enemy.x, enemy.z);
    } else {
      const path = api.pathTo(enemy.x, enemy.z);
      if (path) api.moveTo(path.points[0].x, path.points[0].z);
      else api.moveTo(enemy.x, enemy.z);
    }
  }
}