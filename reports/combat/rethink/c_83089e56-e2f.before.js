function think(p, api) {
  if (!p.enemy.alive || !p.self.alive) return;

  const me = p.self;
  const enemy = p.enemy;
  const dist = enemy.dist;

  // Face enemy continuously
  api.faceAt(enemy.x, enemy.z);

  // Keep defensive/damage buff up whenever available
  if (api.ready('k3')) {
    api.use('k3');
    api.say('Гррр! Сила!');
    return;
  }

  // Heading alignment check for directional skills
  const toEnemy = V.sub(enemy, me);
  const ang = Math.abs(V.angleTo(me.heading, toEnemy));

  // If in range for k2 cone sweep (range 3.4m, effective with collision radius)
  if (dist <= 3.6 && ang < 0.8 && api.ready('k2')) {
    api.use('k2');
    api.say('Крушить!');
    return;
  }

  // If in line of sight and within dash distance (8m)
  if (dist > 3.0 && dist <= 7.8 && enemy.visible && ang < 0.4 && api.ready('k1')) {
    // Check if dash path is clear of obstacles
    const ray = api.ray(toEnemy.x, toEnemy.z, dist);
    if (!ray.hit || ray.dist >= dist - enemy.radius) {
      api.use('k1');
      api.say('Напролом!');
      return;
    }
  }

  // Chase octopus down relentlessly
  if (enemy.visible) {
    api.move(toEnemy.x, toEnemy.z);
  } else {
    api.moveTo(enemy.x, enemy.z);
  }
}