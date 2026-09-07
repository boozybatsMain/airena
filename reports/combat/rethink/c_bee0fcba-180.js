function think(p, api) {
  const self = p.self, enemy = p.enemy;
  if (!self.alive) return;

  const k1 = self.kit.k1;
  const k2 = self.kit.k2;
  const k3 = self.kit.k3;

  const distC = enemy.dist;
  const canSee = enemy.visible;

  const k1Range = k1 ? k1.range : 24;
  const k3Range = k3 ? k3.range : 18;
  const k3Speed = k3 && k3.speed ? k3.speed : 22;

  const k1Reach = k1Range + 1.7 + 0.4 + enemy.radius;
  const k3Reach = k3Range + 1.8 + 1.85;

  let usedAim = false;

  const enemyTelegraph = enemy.casting && enemy.casting.telegraph &&
    (enemy.casting.skill === 'k1' || enemy.casting.skill === 'k3');

  if (!self.busy) {
    const k1Ready = api.ready('k1');
    const k3Ready = api.ready('k3');
    const k2Ready = api.ready('k2');

    if (k1Ready && canSee && distC <= k1Reach) {
      api.use('k1', { x: enemy.x, z: enemy.z });
      usedAim = true;
    } else if (k3Ready && canSee && distC <= k3Reach) {
      const lead = V.lead(self, enemy, { x: enemy.vx, z: enemy.vz }, k3Speed);
      api.use('k3', lead);
      usedAim = true;
    } else if (k2Ready) {
      api.use('k2');
    }
  }

  if (enemyTelegraph && distC < 22) {
    const dir = V.toward(enemy, self);
    const perp = V.perp(dir);
    const side = api.recall('dodgeSide', 1);
    api.remember('dodgeSide', -side);
    api.move(perp.x * side, perp.z * side);
  } else {
    const desired = Math.max(6, k1Reach - 3);
    if (distC > desired + 1.5) {
      api.moveTo(enemy.x, enemy.z);
    } else if (distC < desired - 1.5) {
      const away = V.away(self, enemy);
      api.move(away.x, away.z);
    } else {
      api.move(0, 0);
    }
  }

  if (!usedAim) {
    api.faceAt(enemy.x, enemy.z);
  }

  const sec = Math.floor(p.t);
  if (sec > 0 && sec % 12 === 0) {
    api.say('Stand still and burn.');
  }
}