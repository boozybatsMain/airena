function think(p, api) {
  const self = p.self, enemy = p.enemy;
  if (!self.alive || !enemy.alive) return;

  const rawDx = self.x - enemy.x, rawDz = self.z - enemy.z;
  const len = Math.hypot(rawDx, rawDz);
  let ndx, ndz;
  if (len > 1e-3) {
    ndx = rawDx / len;
    ndz = rawDz / len;
  } else {
    ndx = Math.sin(self.heading);
    ndz = Math.cos(self.heading);
  }
  const dist = (typeof enemy.dist === 'number') ? enemy.dist : len;

  api.faceAt(enemy.x, enemy.z);

  const PREFERRED = 10;
  let tx = enemy.x + ndx * PREFERRED;
  let tz = enemy.z + ndz * PREFERRED;
  tx = Math.max(-18, Math.min(18, tx));
  tz = Math.max(-18, Math.min(18, tz));

  const threatTelegraph = enemy.casting && enemy.casting.telegraph &&
    (enemy.casting.skill === 'k2' || enemy.casting.skill === 'k3');

  let usedAbility = false;

  if (!self.busy) {
    if (threatTelegraph && dist < 14 && api.ready('k1') && !self.invulnerable) {
      let pdx = -ndz, pdz = ndx;
      if ((p.tick % 2) === 0) { pdx = -pdx; pdz = -pdz; }
      const bx = self.x + pdx * 10, bz = self.z + pdz * 10;
      api.use('k1', { x: bx, z: bz });
      usedAbility = true;
    } else if (self.hp < 70 && dist < 8 && api.ready('k1')) {
      const bx = self.x + ndx * 10, bz = self.z + ndz * 10;
      api.use('k1', { x: bx, z: bz });
      usedAbility = true;
    }

    if (!usedAbility && api.ready('k3') && dist <= 9 && dist > 1.5 && !enemy.invulnerable) {
      api.use('k3', { x: enemy.x, z: enemy.z });
      usedAbility = true;
    }

    if (!usedAbility && api.ready('k2') && dist <= 17 && enemy.visible) {
      const kit = self.kit && self.kit.k2;
      const speed = (kit && kit.speed) ? kit.speed : 22;
      const lead = V.lead(
        { x: self.x, z: self.z },
        { x: enemy.x, z: enemy.z },
        { x: enemy.vx, z: enemy.vz },
        speed
      );
      api.use('k2', { x: lead.x, z: lead.z });
      usedAbility = true;
    }

    if (!usedAbility && api.ready('k1') && dist > 12) {
      const bx = self.x - ndx * 10, bz = self.z - ndz * 10;
      api.use('k1', { x: bx, z: bz });
      usedAbility = true;
    }
  }

  api.moveTo(tx, tz);

  if (self.hp < 40 && p.t > 1) {
    api.say('Not done yet.');
  }
}