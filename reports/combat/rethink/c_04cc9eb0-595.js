function think(p, api) {
  const self = p.self, enemy = p.enemy;
  if (!self.alive) return;

  api.faceAt(enemy.x, enemy.z);

  const dist = enemy.dist;
  const k1 = self.kit && self.kit.k1;
  const k2 = self.kit && self.kit.k2;
  const k3 = self.kit && self.kit.k3;

  const k3Range = (k3 && k3.range) || 3.4;
  const meleeReach = k3Range + (enemy.radius || 1.5) - 0.15;
  const retreatThreshold = meleeReach + 2;

  const k1Range = (k1 && k1.range) || 18;
  const k2Range = (k2 && k2.range) || 15;

  const enemyDangerK3 = !!(enemy.casting && enemy.casting.telegraph && enemy.casting.skill === 'k3');

  let usedAction = false;

  // report a hit landing occasionally
  for (const ev of p.events) {
    if (ev.type === 'dealt' && ev.skill === 'k3' && ev.amount > 0) {
      api.say('Feel that.');
      break;
    }
  }

  // 1. melee damage when in range
  if (!usedAction && dist <= meleeReach && !enemy.invulnerable && enemy.visible && api.ready('k3')) {
    api.use('k3', { x: enemy.x, z: enemy.z });
    usedAction = true;
  }

  // 2. try to punish/cancel an enemy wind-up with silence
  if (!usedAction && enemy.casting && enemy.casting.telegraph && dist <= k2Range + 3 && api.ready('k2')) {
    const spd = (k2 && k2.speed) || 18;
    const lead = V.lead(self, { x: enemy.x, z: enemy.z }, { x: enemy.vx, z: enemy.vz }, spd);
    api.use('k2', { x: lead.x, z: lead.z });
    usedAction = true;
  }

  // 3. blind them at range to muddy their tracking
  if (!usedAction && dist <= k1Range - 1 && enemy.visible && api.ready('k1')) {
    const spd = (k1 && k1.speed) || 22;
    const lead = V.lead(self, { x: enemy.x, z: enemy.z }, { x: enemy.vx, z: enemy.vz }, spd);
    api.use('k1', { x: lead.x, z: lead.z });
    usedAction = true;
  }

  // 4. silence proactively before closing distance
  if (!usedAction && dist > meleeReach && dist <= k2Range - 1 && api.ready('k2')) {
    const spd = (k2 && k2.speed) || 18;
    const lead = V.lead(self, { x: enemy.x, z: enemy.z }, { x: enemy.vx, z: enemy.vz }, spd);
    api.use('k2', { x: lead.x, z: lead.z });
    usedAction = true;
  }

  // Movement
  if (enemyDangerK3 && dist < retreatThreshold) {
    const away = V.away(self, enemy); // points from enemy to self
    let tx = self.x + away.x * 8;
    let tz = self.z + away.z * 8;
    tx = Math.max(-18, Math.min(18, tx));
    tz = Math.max(-18, Math.min(18, tz));
    api.moveTo(tx, tz);
  } else if (dist > meleeReach) {
    api.moveTo(enemy.x, enemy.z);
  } else {
    api.stop();
  }
}