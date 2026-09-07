let boostExpire = 0;
let orbitSign = 1;
let orbitTimer = 0;
let lastSay = 0;

function orbitMove(p, api) {
  const { self, enemy } = p;
  orbitTimer -= p.dt;
  if (orbitTimer <= 0) {
    orbitTimer = 1.5 + api.rand() * 2;
    orbitSign = api.rand() < 0.5 ? -1 : 1;
  }
  const away = V.toward(enemy, self); // unit vector pointing away from enemy (enemy -> self)
  const perp = V.perp(away);
  const desiredDist = 16;
  const diff = enemy.dist - desiredDist;
  let mv = { x: perp.x * orbitSign, z: perp.z * orbitSign };
  if (diff > 3) {
    const toEnemy = V.toward(self, enemy);
    mv = V.add(mv, V.scale(toEnemy, 0.9));
  } else if (diff < -3) {
    mv = V.add(mv, V.scale(away, 0.9));
  }
  const n = V.norm(mv);
  if (n.x !== 0 || n.z !== 0) {
    api.move(n.x * self.maxSpeed, n.z * self.maxSpeed);
  }
  api.faceAt(enemy.x, enemy.z);
}

function think(p, api) {
  const { self, enemy } = p;
  if (!self.alive) return;

  // --- dodge an incoming beam ---
  if (enemy.casting && enemy.casting.telegraph && enemy.casting.skill === 'k2') {
    const away = V.toward(enemy, self); // enemy -> self
    const perp = V.perp(away);
    if (self.cooldowns.k3 === 0 && !self.busy) {
      const sign = api.rand() < 0.5 ? 1 : -1;
      api.use('k3', perp.x * sign, perp.z * sign);
      return;
    } else {
      const sign = api.rand() < 0.5 ? 1 : -1;
      api.move(perp.x * self.maxSpeed * sign, perp.z * self.maxSpeed * sign);
      api.faceAt(enemy.x, enemy.z);
      return;
    }
  }

  // --- emergency blink+shield when badly hurt ---
  if (self.hp / self.maxHp < 0.28 && self.cooldowns.k3 === 0 && !self.busy) {
    const away = V.away(self, enemy); // points away from enemy
    api.use('k3', away.x, away.z);
    if (p.t - lastSay > 4) { api.say('Not today.'); lastSay = p.t; }
    return;
  }

  const dist = enemy.dist;
  const inRange = dist <= 26 && enemy.visible;

  if (!self.busy) {
    if (inRange) {
      const boosted = p.t < boostExpire;
      if (!boosted && self.cooldowns.k1 === 0 && self.cooldowns.k2 === 0) {
        api.use('k1');
        boostExpire = p.t + 0.3 + 4.0;
      } else if (self.cooldowns.k2 === 0) {
        api.use('k2', { x: enemy.x, z: enemy.z });
      } else {
        orbitMove(p, api);
      }
    } else {
      api.moveTo(enemy.x, enemy.z);
      api.faceAt(enemy.x, enemy.z);
    }
  } else {
    orbitMove(p, api);
  }

  if (p.t - lastSay > 6 && api.rand() < 0.015) {
    api.say('Hold still.');
    lastSay = p.t;
  }
}