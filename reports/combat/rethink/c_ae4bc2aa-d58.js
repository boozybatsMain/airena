let orbitDir = 1;
let orbitTimer = 2;
let dodgeTimer = 0;
let saidHello = false;
let lowSaid = false;

function think(p, api) {
  const self = p.self, enemy = p.enemy;
  if (!self.alive) return;

  if (!saidHello) {
    api.say('Hold still. This will only hurt a lot.');
    saidHello = true;
  }

  orbitTimer -= p.dt;
  if (orbitTimer <= 0) {
    orbitDir = api.rand() < 0.5 ? 1 : -1;
    orbitTimer = 2 + api.rand() * 2;
  }

  if (dodgeTimer > 0) dodgeTimer -= p.dt;

  for (const e of p.events) {
    if (e.type === 'blocked') {
      orbitDir *= -1;
      orbitTimer = 1.5;
    } else if (e.type === 'enemyStarted') {
      dodgeTimer = 0.55;
    }
  }

  const dist = enemy.dist;
  const kit = self.kit || {};

  // --- defensive dodge blink when enemy just committed to something ---
  if (dodgeTimer > 0 && !self.busy && dist <= 22 && api.ready('k2')) {
    const line = V.toward(enemy, self); // from enemy to self
    const perp = V.perp(line);
    const side = orbitDir >= 0 ? perp : V.scale(perp, -1);
    if (side.x !== 0 || side.z !== 0) {
      api.use('k2', side.x, side.z);
      dodgeTimer = 0;
    }
  }

  // --- attack decisions ---
  if (!self.busy) {
    const w1 = (kit.k1 && kit.k1.windup) || 0.5;
    const w3 = (kit.k3 && kit.k3.windup) || 0.467;
    const p1 = { x: enemy.x + enemy.vx * w1, z: enemy.z + enemy.vz * w1 };
    const p3 = { x: enemy.x + enemy.vx * w3, z: enemy.z + enemy.vz * w3 };

    if (api.ready('k1') && dist <= 26 && enemy.visible) {
      api.use('k1', p1);
    } else if (api.ready('k3') && dist <= 15 && enemy.visible) {
      api.use('k3', p3);
    } else if (api.ready('k2') && dist < 4) {
      const away = V.away(self, enemy);
      api.use('k2', away.x, away.z);
    }
  }

  // --- movement: circle-kite at ~18.5m, or close in if blocked/far ---
  const desiredDist = 18.5;
  let targetPoint;
  if (!enemy.visible) {
    targetPoint = { x: enemy.x, z: enemy.z };
  } else {
    const away = V.away(self, enemy); // direction from enemy to self
    let angle = V.heading(away);
    angle += orbitDir * 0.9 * p.dt;
    const dir = V.fromHeading(angle);
    targetPoint = V.add(enemy, V.scale(dir, desiredDist));
    targetPoint.x = Math.max(-19, Math.min(19, targetPoint.x));
    targetPoint.z = Math.max(-19, Math.min(19, targetPoint.z));
  }
  api.moveTo(targetPoint.x, targetPoint.z);

  // --- facing (only meaningful when not locked in a cast) ---
  if (!self.busy) {
    api.faceAt(enemy.x, enemy.z);
  }

  if (self.hp < 60 && !lowSaid) {
    api.say('Just a scratch.');
    lowSaid = true;
  }
}