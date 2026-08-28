function think(p, api) {
  const self = p.self, enemy = p.enemy;
  if (!self.alive) return;

  const dist = enemy.dist;
  const toEnemy = V.toward(self, enemy);

  // Determine if our charge direction is already locked in (dash/air/recover phases)
  const chargeLocked = self.casting && self.casting.skill === 'charge' && self.casting.phase !== 'windup';

  // Keep facing the enemy unless our charge direction is already committed
  if (!chargeLocked) {
    api.faceAt(enemy.x, enemy.z);
  }

  // If we are mid-skill, let it ride — no new orders needed (they'd be refused anyway)
  if (self.busy) {
    return;
  }

  const angleDiff = Math.abs(V.angleTo(self.heading, toEnemy));
  const halfAngleBase = 55 * Math.PI / 180;
  const halfAngle = halfAngleBase + Math.asin(Math.min(1, enemy.radius / Math.max(dist, 0.001)));
  const smashRange = self.radius + 2.9 + enemy.radius;
  const chargeReach = 12; // approx max dash distance
  const enemyLasering = enemy.casting && enemy.casting.skill === 'laser' && enemy.casting.telegraph;

  // Priority 1: interrupt an incoming laser with a charge if we can reach them with it
  if (enemyLasering && api.ready('charge') && dist > smashRange * 0.6 && dist <= chargeReach + smashRange) {
    api.use('charge');
    return;
  }

  // Priority 2: smash if we're in range and roughly aligned already
  if (dist <= smashRange && angleDiff <= halfAngle + 0.35 && api.ready('smash')) {
    api.use('smash');
    return;
  }

  // Priority 3: close distance fast with charge when out of smash range but within dash reach
  if (dist > smashRange && dist <= chargeReach + smashRange && api.ready('charge')) {
    api.use('charge');
    return;
  }

  // Priority 4: if a laser is coming and we can't answer with charge or smash, try to juke sideways
  if (enemyLasering && dist > smashRange) {
    const perp = V.perp(toEnemy);
    const sideSeed = (Math.floor(p.t * 2) % 2 === 0) ? 1 : -1;
    const dodge = V.add(V.scale(toEnemy, 0.6), V.scale(perp, sideSeed * 0.8));
    api.move(dodge.x, dodge.z);
    return;
  }

  // Priority 5: just chase them down, routed around obstacles
  api.moveTo(enemy.x, enemy.z);
}
