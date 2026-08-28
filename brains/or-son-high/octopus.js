function think(p, api) {
  const { self, enemy } = p;
  if (!self.alive || !enemy.alive) return;

  const dist = enemy.dist;
  const chargeThreat = enemy.casting && enemy.casting.skill === 'charge' && enemy.casting.telegraph;
  const smashThreat = enemy.casting && enemy.casting.skill === 'smash' && enemy.casting.telegraph && dist < 7;

  api.faceAt(enemy.x, enemy.z);

  if (chargeThreat) {
    const dir = chargeDodgeDir(p);
    if (api.ready('blink')) {
      api.use('blink', dir.x, dir.z);
    } else {
      api.move(dir.x, dir.z);
    }
    return;
  }

  if (smashThreat) {
    const dir = V.norm({ x: self.x - enemy.x, z: self.z - enemy.z });
    if (api.ready('blink')) {
      api.use('blink', dir.x, dir.z);
    } else if (api.ready('jump')) {
      api.use('jump');
    } else {
      api.move(dir.x, dir.z);
    }
    return;
  }

  if (api.ready('laser') && enemy.visible && dist <= 22) {
    api.use('laser');
    return;
  }

  positionSelf(p, api);
}

function chargeDodgeDir(p) {
  const { self, enemy } = p;
  const chargeDir = V.fromHeading(enemy.heading);
  const rel = { x: self.x - enemy.x, z: self.z - enemy.z };
  const proj = rel.x * chargeDir.x + rel.z * chargeDir.z;
  const lateral = { x: rel.x - proj * chargeDir.x, z: rel.z - proj * chargeDir.z };
  const lat = V.len(lateral);
  if (lat < 0.4) {
    const perp = V.perp(chargeDir);
    const optA = { x: self.x + perp.x * 5, z: self.z + perp.z * 5 };
    const optB = { x: self.x - perp.x * 5, z: self.z - perp.z * 5 };
    return wallScore(optA) >= wallScore(optB) ? perp : { x: -perp.x, z: -perp.z };
  }
  return V.norm(lateral);
}

function wallScore(pt) {
  return Math.min(20 - Math.abs(pt.x), 20 - Math.abs(pt.z));
}

function positionSelf(p, api) {
  const { self, enemy } = p;
  const dist = enemy.dist;
  const desired = 12;
  const toEnemy = V.norm({ x: enemy.x - self.x, z: enemy.z - self.z });
  let target;
  if (dist < desired - 1.5) {
    target = { x: self.x - toEnemy.x * 4, z: self.z - toEnemy.z * 4 };
  } else if (dist > desired + 3) {
    target = { x: self.x + toEnemy.x * 4, z: self.z + toEnemy.z * 4 };
  } else {
    const perp = V.perp(toEnemy);
    const sign = Math.sin(p.t * 0.7) >= 0 ? 1 : -1;
    target = { x: self.x + perp.x * sign * 4, z: self.z + perp.z * sign * 4 };
  }
  target.x = Math.max(-19, Math.min(19, target.x));
  target.z = Math.max(-19, Math.min(19, target.z));
  api.moveTo(target.x, target.z);
}