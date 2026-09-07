let lastDodge = 0;
let retreatPos = null;

function think(p, api) {
  const { self, enemy, arena, t, dt, events } = p;
  const dist = enemy.dist;
  const myHpFrac = self.hp / self.maxHp;
  const enHpFrac = enemy.hp / enemy.maxHp;

  // --- Update retreat position if needed ---
  if (!retreatPos || V.dist({ x: self.x, z: self.z }, retreatPos) < 2) {
    retreatPos = pickSafeRetreat(self, arena);
  }

  // --- Threat assessment ---
  const incomingMortar = arena.projectiles.some(proj => 
    proj.arc && !proj.mine && proj.left < 1.5
  );
  const enemyCasting = enemy.casting;
  const enemyWindingUp = enemyCasting && enemyCasting.phase === 'windup' && enemyCasting.telegraph;
  const enemySkill = enemyWindingUp ? enemyCasting.skill : null;

  // --- Defensive: dodge mortars / zones ---
  if (incomingMortar || (enemySkill === 'k1' && dist < 18)) {
    dodgeSideways(self, enemy, api);
    lastDodge = t;
    return;
  }

  // --- Defensive: avoid enemy zones ---
  const standingInZone = arena.zones.some(z => !z.mine && V.dist({ x: self.x, z: self.z }, z) < z.r + self.radius + 0.5);
  if (standingInZone) {
    api.moveTo(retreatPos.x, retreatPos.z);
    return;
  }

  // --- Low HP: play safe, heal/shield ---
  if (myHpFrac < 0.35) {
    if (api.ready('k3')) {
      api.use('k3');
      api.say("Patch up!");
      return;
    }
    api.moveTo(retreatPos.x, retreatPos.z);
    return;
  }

  // --- Interrupt enemy windup with k1 (blind) ---
  if (enemyWindingUp && api.ready('k1') && dist < 15) {
    const lead = V.lead({ x: self.x, z: self.z }, { x: enemy.x, z: enemy.z }, { x: enemy.vx, z: enemy.vz }, self.kit.k1.speed);
    api.use('k1', lead);
    api.say("Blind!");
    return;
  }

  // --- Zone control with k2 ---
  if (api.ready('k2') && dist < 11) {
    const lead = V.lead({ x: self.x, z: self.z }, { x: enemy.x, z: enemy.z }, { x: enemy.vx, z: enemy.vz }, 0);
    if (V.dist({ x: self.x, z: self.z }, lead) < 12) {
      api.use('k2', lead);
      api.say("Zone!");
      return;
    }
  }

  // --- Mortar k1 at range ---
  if (api.ready('k1') && dist > 6 && dist < 14) {
    const lead = V.lead({ x: self.x, z: self.z }, { x: enemy.x, z: enemy.z }, { x: enemy.vx, z: enemy.vz }, self.kit.k1.speed);
    if (api.los(lead.x, lead.z)) {
      api.use('k1', lead);
      api.say("Lob!");
      return;
    }
  }

  // --- Movement: kite, flank, avoid walls ---
  const desiredDist = 9;
  const toEnemy = V.sub({ x: enemy.x, z: enemy.z }, { x: self.x, z: self.z });
  const distNow = V.len(toEnemy);

  if (distNow < desiredDist - 1) {
    // Too close: back off perpendicular to enemy facing
    const perp = V.perp(V.norm(toEnemy));
    const target = {
      x: self.x + perp.x * 6,
      z: self.z + perp.z * 6
    };
    clampToArena(target);
    if (api.pathTo(target.x, target.z)?.direct) {
      api.moveTo(target.x, target.z);
    } else {
      api.moveTo(retreatPos.x, retreatPos.z);
    }
  } else if (distNow > desiredDist + 2) {
    // Too far: approach
    api.moveTo(enemy.x, enemy.z);
  } else {
    // Good range: strafe perpendicular to enemy facing
    const perp = V.perp(V.norm(toEnemy));
    const target = {
      x: self.x + perp.x * 3,
      z: self.z + perp.z * 3
    };
    clampToArena(target);
    api.moveTo(target.x, target.z);
  }

  // Face enemy
  api.faceAt(enemy.x, enemy.z);
}

function dodgeSideways(self, enemy, api) {
  const toEnemy = V.sub({ x: enemy.x, z: enemy.z }, { x: self.x, z: self.z });
  const perp = V.perp(V.norm(toEnemy));
  // Randomize dodge direction slightly
  const dir = api.rand() < 0.5 ? perp : V.scale(perp, -1);
  const target = {
    x: self.x + dir.x * 5,
    z: self.z + dir.z * 5
  };
  clampToArena(target);
  if (api.pathTo(target.x, target.z)?.direct) {
    api.moveTo(target.x, target.z);
  } else {
    const alt = { x: self.x - dir.x * 5, z: self.z - dir.z * 5 };
    clampToArena(alt);
    api.moveTo(alt.x, alt.z);
  }
}

function pickSafeRetreat(self, arena) {
  const corners = [
    { x: -18, z: -18 },
    { x: 18, z: -18 },
    { x: -18, z: 18 },
    { x: 18, z: 18 }
  ];
  let best = corners[0];
  let bestScore = -1;
  for (const c of corners) {
    const d = V.dist({ x: self.x, z: self.z }, c);
    if (d > bestScore) {
      bestScore = d;
      best = c;
    }
  }
  return best;
}

function clampToArena(pos) {
  const m = 18.5;
  pos.x = Math.max(-m, Math.min(m, pos.x));
  pos.z = Math.max(-m, Math.min(m, pos.z));
}