function think(p, api) {
  if (!p.self.alive) return;
  const enemy = p.enemy;
  const dist = enemy.dist;

  // handle events for flavor
  for (const e of p.events) {
    if (e.type === 'dealt') api.say('Feel that?');
  }

  // emergency shield/heal
  if ((p.self.hp / p.self.maxHp < 0.4) && api.ready('k3')) {
    api.use('k3');
    api.say('Patching up.');
  }

  // if enemy is casting a dangerous windup and close, try to interrupt with k2 stun if in range
  const k1 = p.self.kit.k1;
  const k2 = p.self.kit.k2;

  const canK2Range = 4.9; // max reach centre-to-centre approx
  const canK1Range = 11.183;

  if (!p.self.stunned && !p.self.rooted) {
    // aim facing at enemy always unless busy dashing
    if (!(p.self.casting && p.self.casting.phase === 'dash')) {
      api.faceAt(enemy.x, enemy.z);
    }
  }

  // decide action
  if (p.self.busy) {
    // let current cast finish, but keep moving appropriately handled below
  } else {
    if (dist <= canK2Range && api.ready('k2')) {
      api.use('k2', { x: enemy.x, z: enemy.z });
      api.say('Gotcha!');
    } else if (dist <= canK1Range && dist > canK2Range + 0.5 && api.ready('k1')) {
      api.use('k1', { x: enemy.x, z: enemy.z });
      api.say('Charge!');
    } else if (dist <= canK2Range + 1 && api.ready('k1') && !api.ready('k2')) {
      api.use('k1', { x: enemy.x, z: enemy.z });
      api.say('Take this!');
    }
  }

  // movement: kite if enemy casting a dash-type threat, else approach for k2 range, else close for k1
  const enemyCastingDash = enemy.casting && enemy.casting.telegraph && enemy.casting.skill === 'k1';

  if (enemyCastingDash) {
    // sidestep
    const away = V.away(p.self, enemy);
    const side = V.perp(away);
    api.move(away.x + side.x * 0.6, away.z + side.z * 0.6);
  } else if (dist > canK2Range) {
    api.moveTo(enemy.x, enemy.z);
  } else if (dist < 2.0) {
    // stay in cone range but not too close, slight backpedal to avoid contact damage stacking
    const away = V.away(p.self, enemy);
    api.move(away.x * 0.3, away.z * 0.3);
  } else {
    api.stop();
  }
}