function think(p, api) {
  const self = p.self, enemy = p.enemy;
  if (!self.alive) return;

  // always try to face the enemy; the engine ignores this during a locked windup anyway
  api.faceAt(enemy.x, enemy.z);

  // --- kiting movement: hold a sweet spot around 9m, weaving side to side ---
  const selfPos = { x: self.x, z: self.z };
  const enemyPos = { x: enemy.x, z: enemy.z };
  const dirAway = V.away(selfPos, enemyPos); // points from enemy toward self
  const perp = V.perp(dirAway);
  const desired = 9;
  const dist = enemy.dist;
  const weave = Math.sin(p.t * 1.3) * 4;

  let tx, tz;
  if (dist < desired - 1.5) {
    tx = self.x + dirAway.x * 6 + perp.x * weave;
    tz = self.z + dirAway.z * 6 + perp.z * weave;
  } else {
    tx = enemy.x + dirAway.x * desired + perp.x * weave;
    tz = enemy.z + dirAway.z * desired + perp.z * weave;
  }
  tx = Math.max(-18, Math.min(18, tx));
  tz = Math.max(-18, Math.min(18, tz));
  api.moveTo(tx, tz);

  // step out of any hostile zone we happen to be standing in
  if (p.arena && p.arena.zones) {
    for (const z of p.arena.zones) {
      if (z.mine) continue;
      const d = Math.hypot(self.x - z.x, self.z - z.z);
      if (d < z.r + self.radius + 1) {
        const flee = V.away(selfPos, { x: z.x, z: z.z });
        api.move(flee.x, flee.z);
        break;
      }
    }
  }

  // --- ability priority: k2 burn mortar > k1 zone (burn+blind) > k3 heal ---
  const k2 = self.kit.k2;
  const k1 = self.kit.k1;

  if (k2 && api.ready('k2') && dist <= 16.5) {
    const speed = k2.speed || 18;
    const lead = V.lead(selfPos, enemyPos, { x: enemy.vx, z: enemy.vz }, speed);
    api.use('k2', lead);
  } else if (k1 && api.ready('k1') && dist <= 12.5) {
    const wu = k1.windup || 0.467;
    const px = enemy.x + enemy.vx * wu;
    const pz = enemy.z + enemy.vz * wu;
    api.use('k1', { x: px, z: pz });
  } else if (api.ready('k3') && self.hp < self.maxHp * 0.95) {
    api.use('k3');
  }

  if (p.t < 1) api.say('Everything burns eventually.');
}