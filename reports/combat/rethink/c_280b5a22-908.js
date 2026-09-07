function think(p, api) {
  if (!p.self.alive) return;

  const self = p.self;
  const enemy = p.enemy;
  const selfPos = { x: self.x, z: self.z };
  const enemyPos = { x: enemy.x, z: enemy.z };
  const dist = enemy.dist;

  // --- dash-threat detection & dodge ---
  if (dashWillHit(p)) {
    dodgeDash(p, api);
    return;
  }

  let actedFace = false;

  // --- offense ---
  if (api.ready('k1') && dist <= 9 && enemy.visible) {
    api.use('k1', enemyPos);
    actedFace = true;
  } else if (api.ready('k3') && dist <= 16 && enemy.visible) {
    const speed = (self.kit.k3 && self.kit.k3.speed) || 22;
    const lead = V.lead(selfPos, enemyPos, { x: enemy.vx, z: enemy.vz }, speed);
    api.use('k3', lead);
    actedFace = true;
  }

  // --- k2: emergency retreat or aggressive gap close ---
  const hpFrac = self.hp / self.maxHp;
  if (api.ready('k2')) {
    if (hpFrac < 0.28 && dist < 10) {
      const away = V.away(selfPos, enemyPos);
      api.use('k2', away.x, away.z);
    } else if (dist > 12 && !api.ready('k1') === false && p.self.cooldowns.k1 > 0 && p.self.cooldowns.k3 > 0) {
      const toward = V.toward(selfPos, enemyPos);
      api.use('k2', toward.x, toward.z);
    }
  }

  // --- movement / kiting ---
  if (!(self.casting && (self.casting.phase === 'dash' || self.casting.phase === 'air'))) {
    kite(p, api, dist, selfPos, enemyPos);
  }

  // --- facing ---
  if (!actedFace && !(self.casting && self.casting.telegraph)) {
    api.faceAt(enemy.x, enemy.z);
  }
}

function dashWillHit(p) {
  const enemy = p.enemy, self = p.self;
  const c = enemy.casting;
  if (!c || !c.telegraph || c.skill !== 'k1') return false;
  const dir = V.fromHeading(enemy.heading);
  const toSelf = V.sub({ x: self.x, z: self.z }, { x: enemy.x, z: enemy.z });
  const along = V.dot(toSelf, dir);
  if (along < -1 || along > 11) return false;
  const perp2 = Math.max(0, V.dot(toSelf, toSelf) - along * along);
  return Math.sqrt(perp2) <= 3.3;
}

function dodgeDash(p, api) {
  const enemy = p.enemy, self = p.self;
  const dir = V.fromHeading(enemy.heading);
  const perpDir = V.perp(dir);
  const toSelf = V.sub({ x: self.x, z: self.z }, { x: enemy.x, z: enemy.z });
  const side = V.dot(toSelf, perpDir) >= 0 ? 1 : -1;
  const escapeDir = V.scale(perpDir, side);

  if (api.ready('k2')) {
    api.use('k2', escapeDir.x, escapeDir.z);
  } else {
    api.move(escapeDir.x * 10, escapeDir.z * 10);
  }
  api.faceAt(enemy.x, enemy.z);
}

function kite(p, api, dist, selfPos, enemyPos) {
  const half = 19;
  if (dist < 7) {
    const away = V.away(selfPos, enemyPos);
    const target = clamp(V.add(selfPos, V.scale(away, 6)), half);
    api.moveTo(target.x, target.z);
  } else if (dist > 15) {
    api.moveTo(enemyPos.x, enemyPos.z);
  } else {
    const toward = V.toward(selfPos, enemyPos);
    const perp = V.perp(toward);
    const dir = Math.floor(p.t / 1.6) % 2 === 0 ? 1 : -1;
    const target = clamp(V.add(selfPos, V.scale(perp, dir * 6)), half);
    api.moveTo(target.x, target.z);
  }
}

function clamp(v, half) {
  return {
    x: Math.max(-half, Math.min(half, v.x)),
    z: Math.max(-half, Math.min(half, v.z)),
  };
}