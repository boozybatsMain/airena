function think(p, api) {
  const me = p.self;
  const en = p.enemy;

  // Always track & face the enemy
  api.faceAt(en.x, en.z);

  const dist = en.dist;
  const myFacingDir = V.fromHeading(me.heading);
  const dirToEnemy = V.toward(me, en);
  const aimAngle = Math.abs(V.angleTo(me.heading, dirToEnemy));

  // Enemy dodge reaction: if enemy starts a windup for k2/k1 or is charging k3
  const enemyCasting = en.casting;
  let strafeDir = { x: 0, z: 0 };
  if (enemyCasting && (enemyCasting.skill === 'k2' || enemyCasting.skill === 'k3')) {
    const perp = V.perp(dirToEnemy);
    strafeDir = V.scale(perp, 1.0);
  }

  // Combat decision tree
  // 1. Melee Cone (k1): Range 3.4m, applies weaken + burn
  if (dist <= 3.25 && api.ready('k1') && aimAngle < 0.5) {
    api.use('k1');
    api.say('Лови огонь!');
  }
  // 2. Dash (k3): Range 8.0m, fast strike (0.2s windup)
  else if (dist >= 3.0 && dist <= 11.786 && api.ready('k3') && aimAngle < 0.35 && en.visible) {
    api.use('k3');
    api.say('На таран!');
  }
  // 3. Beam (k2): Range 24m, 26 damage, high burst
  else if (dist > 2.46 && dist <= 28.681 && api.ready('k2') && aimAngle < 0.27 && en.visible) {
    api.use('k2');
    api.say('Прицел точен.');
  }

  // Movement & positioning logic
  if (strafeDir.x !== 0 || strafeDir.z !== 0) {
    api.move(strafeDir.x, strafeDir.z);
  } else {
    // Faster body (6.36 vs 5.8 m/s): we control the distance
    if (dist > 2.46) {
      if (en.visible) {
        api.move(dirToEnemy.x, dirToEnemy.z);
      } else {
        api.moveTo(en.x, en.z);
      }
    } else {
      // Stay glued in close combat while circling slightly
      const circle = V.perp(dirToEnemy);
      const combined = V.norm(V.add(V.scale(dirToEnemy, 0.867), V.scale(circle, 0.366)));
      api.move(combined.x, combined.z);
    }
  }
}