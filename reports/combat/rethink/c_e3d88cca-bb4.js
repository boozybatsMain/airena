function think(p, api) {
  const self = p.self, enemy = p.enemy;
  if (!self.alive) return;

  const dist = enemy.dist;

  const predict = (t) => ({
    x: enemy.x + enemy.vx * t,
    z: enemy.z + enemy.vz * t,
  });

  // --- react to enemy casting ---
  const enemyCastingBeam = enemy.casting && enemy.casting.telegraph &&
    enemy.casting.skill === 'k1';

  let didUse = false;

  // Dodge an incoming beam if we can react to it.
  if (enemyCastingBeam && api.ready('k2') && dist < 20) {
    const away = V.away(self, enemy); // points from enemy toward self
    const side = V.perp(away);
    const dodgeDir = V.add(away, side);
    const n = V.norm(dodgeDir);
    api.use('k2', { x: self.x + n.x * 6.5, z: self.z + n.z * 6.5 });
    didUse = true;
  }

  // --- pick one ability to use this thought ---
  if (!didUse) {
    if (api.ready('k1') && dist <= 22) {
      const lead = predict(0.5);
      if (api.los(lead.x, lead.z)) {
        api.use('k1', lead);
        didUse = true;
      }
    }
  }

  if (!didUse && api.ready('k3') && dist <= 11.3) {
    const lead = predict(0.47);
    api.use('k3', lead);
    didUse = true;
  }

  if (!didUse && api.ready('k2')) {
    if (dist > 15) {
      api.use('k2', { x: enemy.x, z: enemy.z });
      didUse = true;
    } else if (self.hp < self.maxHp * 0.28 && dist < 9) {
      const away = V.norm(V.away(self, enemy));
      api.use('k2', { x: self.x + away.x * 6.5, z: self.z + away.z * 6.5 });
      didUse = true;
    }
  }

  // --- avoid standing in enemy's zone ---
  let avoidPoint = null;
  for (const z of p.arena.zones) {
    if (!z.mine) {
      const d = V.dist({ x: self.x, z: self.z }, { x: z.x, z: z.z });
      if (d < z.r + self.radius + 1.0) {
        avoidPoint = { x: z.x, z: z.z };
        break;
      }
    }
  }

  // --- movement ---
  if (!enemyCastingBeam) {
    const desired = 10;
    if (avoidPoint) {
      const away = V.norm(V.away(self, avoidPoint));
      api.move(away.x, away.z);
    } else if (dist > desired + 3) {
      api.moveTo(enemy.x, enemy.z);
    } else if (dist < desired - 4) {
      const away = V.norm(V.away(self, enemy));
      api.move(away.x, away.z);
    } else {
      const fwd = V.norm(V.toward(self, enemy));
      const side = V.perp(fwd);
      const sign = Math.sin(p.t * 0.9) >= 0 ? 1 : -1;
      const dir = V.add(V.scale(side, sign), V.scale(fwd, 0.2));
      const n = V.norm(dir);
      api.move(n.x, n.z);
    }
  } else {
    const away = V.norm(V.away(self, enemy));
    const side = V.perp(away);
    const dir = V.norm(V.add(away, side));
    api.move(dir.x, dir.z);
  }

  // --- facing when idle ---
  if (!self.casting) {
    api.faceAt(enemy.x, enemy.z);
  }
}