function think(p, api) {
  const self = p.self, enemy = p.enemy;
  if (!self.alive) return;

  const skills = self.skills || [];
  const kit = self.kit || {};

  let melee = null, ranged = null, selfBuff = null;
  for (const name of skills) {
    const k = kit[name];
    if (!k) continue;
    const kind = k.kind;
    if (kind === 'self') {
      selfBuff = name;
    } else if (kind === 'cone' || kind === 'fan') {
      melee = melee || name;
    } else if (kind === 'zone' || kind === 'bolt' || kind === 'mortar' || kind === 'beam') {
      ranged = ranged || name;
    } else if (!melee && !ranged) {
      if (k.range && k.range <= 5) melee = melee || name;
      else ranged = ranged || name;
    }
  }

  const dist = enemy.dist;
  const hpFrac = self.hp / self.maxHp;

  const meleeK = melee ? kit[melee] : null;
  const rangedK = ranged ? kit[ranged] : null;

  const meleeReach = meleeK ? (meleeK.range || 3.4) + (enemy.radius || 1.5) + 0.5 : 4.5;
  const rangedRange = rangedK ? Math.max(1, (rangedK.range || 10) - 0.5) : 0;
  const zoneRadius = rangedK ? (rangedK.radius || 2.6) : 2.6;
  const safeCastDist = zoneRadius + (self.radius || 1.5) + 0.6;

  // defensive / cleanse use of self ability
  if (selfBuff && !self.busy && api.ready(selfBuff)) {
    const kb = kit[selfBuff];
    const effs = (kb && kb.effects) || [];
    const hasCleanse = effs.includes ? effs.includes('cleanse') : false;
    const controlled = self.stunned || self.rooted || self.silenced || self.blinded;
    const threat = enemy.casting && enemy.casting.telegraph;
    const wantShield = hpFrac < 0.45 || self.burning || (threat && dist < 6);
    if ((hasCleanse && controlled) || wantShield) {
      api.use(selfBuff);
    }
  }

  // attack logic
  if (!self.busy) {
    if (melee && dist <= meleeReach && api.ready(melee)) {
      api.use(melee, { x: enemy.x, z: enemy.z });
    } else if (ranged && dist <= rangedRange && dist > safeCastDist && api.ready(ranged) && api.los(enemy.x, enemy.z)) {
      const windup = (rangedK && rangedK.windup) || 0.45;
      const px = enemy.x + (enemy.vx || 0) * windup;
      const pz = enemy.z + (enemy.vz || 0) * windup;
      api.use(ranged, { x: px, z: pz });
    } else if (ranged && dist <= safeCastDist && melee && !api.ready(melee) && api.ready(ranged) && api.los(enemy.x, enemy.z)) {
      // too close for safe zone cast and melee not ready: back off a bit and let movement below handle it
    }
  }

  // movement: keep in a good band
  if (dist > meleeReach + 0.4) {
    api.moveTo(enemy.x, enemy.z);
  } else if (dist < Math.max(2.0, meleeReach - 2.5)) {
    const away = V.away(self, enemy);
    if (away.x || away.z) api.move(away.x, away.z);
    else api.stop();
  } else {
    api.stop();
  }

  if (!self.busy) {
    api.faceAt(enemy.x, enemy.z);
  }

  if (p.t < 0.3) {
    api.say('Let\'s dance.');
  }
}