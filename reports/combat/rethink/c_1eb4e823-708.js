function think(p, api) {
  const self = p.self;
  const enemy = p.enemy;
  if (!self.alive) return;

  const kit = self.kit;
  const dist = enemy.dist;

  // --- pick / persist a strafe side, flip it occasionally so we don't
  // walk a predictable circle ---
  let strafeSide = api.recall('strafeSide', 1);
  let strafeUntil = api.recall('strafeUntil', 0);
  if (p.t > strafeUntil) {
    strafeSide = (api.rand() > 0.5) ? 1 : -1;
    api.remember('strafeSide', strafeSide);
    api.remember('strafeUntil', p.t + 1.2 + api.rand() * 1.0);
  }

  const toEnemy = V.toward(self, enemy);
  const away = V.away(self, enemy);
  const perp = V.scale(V.perp(toEnemy), strafeSide);

  // --- dodge an incoming telegraphed line-attack (bolt or cone) ---
  let dodging = false;
  if (enemy.casting && enemy.casting.telegraph) {
    const eskill = enemy.casting.skill;
    if (eskill === 'k1' || eskill === 'k3') {
      api.move(perp.x, perp.z);
      dodging = true;
    }
  }

  // --- offense: only order a new ability when nothing of ours is busy ---
  if (!self.busy) {
    const k1 = kit.k1, k2 = kit.k2, k3 = kit.k3;
    const meleeReach = k3 ? (k3.range + enemy.radius) : 4.9;

    if (k3 && dist <= meleeReach + 0.3 && api.ready('k3')) {
      api.use('k3', { x: enemy.x, z: enemy.z });
    } else if (k1 && dist <= 18 && enemy.visible && api.ready('k1')) {
      const lead = V.lead(self, enemy, { x: enemy.vx, z: enemy.vz }, k1.speed || 22);
      api.use('k1', lead);
    } else if (k2 && dist <= 12 && api.ready('k2')) {
      const wu = (k2.windup || 0.467);
      const pred = {
        x: enemy.x + enemy.vx * wu,
        z: enemy.z + enemy.vz * wu,
      };
      api.use('k2', pred);
    } else if (k3 && dist <= meleeReach + 0.3 && !api.ready('k3') && k1 && api.ready('k1') && enemy.visible) {
      const lead = V.lead(self, enemy, { x: enemy.vx, z: enemy.vz }, k1.speed || 22);
      api.use('k1', lead);
    }
  }

  // --- movement, unless we already chose to dodge this step ---
  if (!dodging) {
    const preferredMin = 4.5;
    const preferredMax = 8.5;

    if (!enemy.visible) {
      api.moveTo(enemy.x, enemy.z);
    } else if (dist > preferredMax) {
      api.moveTo(enemy.x, enemy.z);
    } else if (dist < preferredMin) {
      // back off, but keep some sideways so we don't just retreat straight
      const backoff = V.norm(V.add(V.scale(away, 1.0), V.scale(perp, 0.4)));
      api.move(backoff.x, backoff.z);
    } else {
      // orbit at range
      api.move(perp.x, perp.z);
    }
  }

  // --- facing: keep pointed at the enemy when not locked into a wind-up aim ---
  if (!self.busy) {
    api.faceAt(enemy.x, enemy.z);
  }

  // --- occasional flavor line ---
  const lastSay = api.recall('lastSayTick', -1000);
  if (p.tick - lastSay > 200) {
    if (p.t > 30 && self.hp / self.maxHp < 0.35) {
      api.say('Burning or not, I finish this.');
      api.remember('lastSayTick', p.tick);
    } else if (dist < 3) {
      api.say('Too close for you.');
      api.remember('lastSayTick', p.tick);
    }
  }
}