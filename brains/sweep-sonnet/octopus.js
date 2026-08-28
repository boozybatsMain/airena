let strafeSign = 1;
let strafeTimer = 0;

function pickSign(p) {
  for (const e of p.events) {
    if (e.type === 'blocked') strafeSign *= -1;
  }
  strafeTimer += p.dt;
  if (strafeTimer > 1.4) {
    strafeSign *= -1;
    strafeTimer = 0;
  }
  return strafeSign;
}

function think(p, api) {
  const self = p.self;
  const enemy = p.enemy;
  if (!self.alive || !enemy.alive) return;

  const dist = enemy.dist;
  const toward = V.toward(self, enemy);
  const away = V.away(self, enemy);

  // keep facing enemy for aim, unless we override below
  api.faceAt(enemy.x, enemy.z);

  const eCast = enemy.casting;
  const chargeThreat = eCast && eCast.skill === 'charge';
  const smashThreat = eCast && eCast.skill === 'smash';

  // --- react to enemy charge ---
  if (chargeThreat) {
    const sign = pickSign(p);
    if (eCast.phase === 'dash') {
      const perp = V.perp(V.fromHeading(enemy.heading));
      const dir = { x: perp.x * sign, z: perp.z * sign };
      api.move(dir.x, dir.z);
      if (dist < 4.5 && api.ready('blink')) {
        api.use('blink', dir.x, dir.z);
      }
    } else {
      // windup: not yet committed, get away and to the side
      const perp = V.perp(toward);
      const dir = V.norm(V.add(V.scale(away, 0.7), V.scale(perp, sign * 0.7)));
      api.move(dir.x, dir.z);
      if (dist < 5 && api.ready('blink')) {
        api.use('blink', dir.x, dir.z);
      }
    }
    return;
  }

  // --- react to enemy smash ---
  if (smashThreat) {
    api.move(away.x, away.z);
    if (dist < 3.2 && api.ready('blink')) {
      api.use('blink', away.x, away.z);
    }
    return;
  }

  // --- normal kiting behaviour ---
  const desiredMin = 14;
  const desiredMax = 20;

  if (!p.enemy.visible) {
    // regain line of sight
    api.moveTo(enemy.x, enemy.z);
  } else if (dist < desiredMin) {
    api.move(away.x, away.z);
  } else if (dist > desiredMax) {
    api.move(toward.x, toward.z);
  } else {
    const sign = pickSign(p);
    const perp = V.perp(toward);
    api.move(perp.x * sign, perp.z * sign);
  }

  // --- fire laser when possible ---
  if (
    !self.busy &&
    !self.stunned &&
    !self.airborne &&
    api.ready('laser') &&
    p.enemy.visible &&
    dist <= 26
  ) {
    api.use('laser');
  }
}
