let strafeDir = 1;
let lastStrafeFlip = -10;

function think(p, api) {
  const self = p.self;
  const enemy = p.enemy;
  if (!self.alive) return;

  const sx = self.x, sz = self.z;
  const ex = enemy.x, ez = enemy.z;
  const dist = enemy.dist;

  api.faceAt(ex, ez);

  if (p.t - lastStrafeFlip > 1.6) {
    strafeDir *= -1;
    lastStrafeFlip = p.t;
  }

  const dirToEnemy = V.norm(V.sub({ x: ex, z: ez }, { x: sx, z: sz }));
  const away = V.scale(dirToEnemy, -1);
  const perp = V.perp(dirToEnemy);

  const desiredMin = 9;
  const desiredMax = 13;

  let moveDir;
  if (dist < desiredMin) {
    moveDir = away;
  } else if (dist > desiredMax) {
    moveDir = dirToEnemy;
  } else {
    moveDir = V.scale(perp, strafeDir);
  }

  const enemyTelegraph = enemy.casting && enemy.casting.telegraph;
  const enemyDangerSkill = enemyTelegraph &&
    (enemy.casting.skill === 'k1' || enemy.casting.skill === 'k2');

  if (enemyTelegraph && enemy.casting.skill === 'k2') {
    // hard dodge sideways against the mortar
    moveDir = V.scale(perp, strafeDir);
  }

  let target = { x: sx + moveDir.x * 6, z: sz + moveDir.z * 6 };
  const lim = 17;
  if (Math.abs(sx) > lim || Math.abs(sz) > lim) {
    const toCenter = V.norm(V.sub({ x: 0, z: 0 }, { x: sx, z: sz }));
    target = { x: sx + toCenter.x * 6, z: sz + toCenter.z * 6 };
  }
  target.x = Math.max(-19, Math.min(19, target.x));
  target.z = Math.max(-19, Math.min(19, target.z));
  api.moveTo(target.x, target.z);

  if (self.busy) return;

  const los = api.los(ex, ez);

  const k1 = self.kit.k1;
  const k2 = self.kit.k2;

  const k1Reach = 12 + 2.6 + enemy.radius;
  const k2Reach = 15 + 2.2 + enemy.radius;

  // interrupt attempt: pull cancels a cancellable enemy wind-up
  if (enemyDangerSkill && api.ready('k1') && dist <= k1Reach && los) {
    api.use('k1', { x: ex, z: ez });
    return;
  }

  // defensive shield/boost against an incoming strike we cannot interrupt
  if (enemyDangerSkill && api.ready('k3')) {
    api.use('k3');
    return;
  }

  // main damage
  if (api.ready('k2') && dist <= k2Reach && los) {
    const speed = (k2 && k2.speed) || 18;
    const lead = V.lead(
      { x: sx, z: sz },
      { x: ex, z: ez },
      { x: enemy.vx, z: enemy.vz },
      speed
    );
    api.use('k2', lead);
    return;
  }

  // secondary damage / zone control
  if (api.ready('k1') && dist <= k1Reach && los) {
    const windup = (k1 && k1.windup) || 0.467;
    const lead = { x: ex + enemy.vx * windup, z: ez + enemy.vz * windup };
    api.use('k1', lead);
    return;
  }

  // nothing better to do: keep the shield/boost cycling
  if (api.ready('k3')) {
    api.use('k3');
    return;
  }
}