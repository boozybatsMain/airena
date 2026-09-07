const K1_WINDUP = 0.367;
const K2_WINDUP = 0.5;

function leadPoint(self, enemy, windup, speed) {
  const midPos = {
    x: enemy.x + enemy.vx * windup,
    z: enemy.z + enemy.vz * windup
  };
  return V.lead({ x: self.x, z: self.z }, midPos, { x: enemy.vx, z: enemy.vz }, speed);
}

function think(p, api) {
  const self = p.self;
  const enemy = p.enemy;

  if (!self.alive) return;

  if (self.stunned) {
    return;
  }

  const dist = enemy.dist;
  const kit = self.kit;

  // keep facing on the enemy unless our own wind-up already locked it
  if (!self.casting) {
    api.faceAt(enemy.x, enemy.z);
  }

  const silenced = self.silenced;

  // try to punish/interrupt a visible enemy wind-up with a silence bolt-lob
  if (!silenced && enemy.casting && enemy.casting.telegraph &&
      api.ready('k2') && dist >= 3.7 && dist <= 18.7) {
    const pt = leadPoint(self, enemy, K2_WINDUP, kit.k2.speed);
    api.use('k2', pt);
    api.moveTo(enemy.x, enemy.z);
    return;
  }

  // melee burst when close, floor target, clear line
  if (!silenced && dist <= 4.9 && enemy.y < 0.35 && api.ready('k3') &&
      api.los(enemy.x, enemy.z)) {
    api.use('k3');
    api.moveTo(enemy.x, enemy.z);
    return;
  }

  // ranged poke while closing / kiting
  if (!silenced && dist <= 21.9 && api.ready('k1') && api.los(enemy.x, enemy.z)) {
    const pt = leadPoint(self, enemy, K1_WINDUP, kit.k1.speed);
    api.use('k1', pt);
    api.moveTo(enemy.x, enemy.z);
    return;
  }

  // mid range lob when nothing else fired and not silenced
  if (!silenced && dist > 4.9 && dist <= 15 && api.ready('k2') && api.los(enemy.x, enemy.z)) {
    const pt = leadPoint(self, enemy, K2_WINDUP, kit.k2.speed);
    api.use('k2', pt);
    api.moveTo(enemy.x, enemy.z);
    return;
  }

  // default: close the gap, routed around obstacles
  api.moveTo(enemy.x, enemy.z);

  if (p.t < 1) {
    api.say('Let\'s dance.');
  } else if (self.hp < self.maxHp * 0.25) {
    api.say('Not done yet.');
  }
}