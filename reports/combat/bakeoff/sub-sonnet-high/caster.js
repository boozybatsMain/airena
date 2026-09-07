let strafeSign = 1;
let strafeTimer = 0;

function think(p, api) {
  const { self, enemy } = p;
  if (!self.alive) return;

  // periodically flip strafe direction for unpredictability
  strafeTimer -= p.dt;
  if (strafeTimer <= 0) {
    strafeSign = api.rand() < 0.5 ? -1 : 1;
    strafeTimer = 0.6 + api.rand() * 0.8;
  }

  const dist = enemy.dist;
  const desired = 13;

  const toE = V.toward(self, enemy);
  const away = V.away(self, enemy);
  const tangent = V.perp(toE);

  let radialWeight = 0;
  if (dist > desired + 1.5) radialWeight = 1;
  else if (dist < desired - 1.5) radialWeight = -1;

  let tangentWeight = 0.6;
  if (enemy.casting && enemy.casting.telegraph &&
      (enemy.casting.skill === 'k1' || enemy.casting.skill === 'k2')) {
    tangentWeight = 1.4;
  }

  let dir = { x: 0, z: 0 };
  if (radialWeight !== 0) {
    dir = V.add(dir, V.scale(radialWeight > 0 ? toE : away, Math.abs(radialWeight)));
  }
  dir = V.add(dir, V.scale(tangent, strafeSign * tangentWeight));
  dir = V.norm(dir);
  if (dir.x === 0 && dir.z === 0) dir = tangent;

  api.move(dir.x, dir.z);
  api.faceAt(enemy.x, enemy.z);

  // steer hard out of any enemy zone we're standing in
  if (p.arena && p.arena.zones) {
    for (const z of p.arena.zones) {
      if (!z.mine) {
        const d = V.dist(self, z);
        if (d < z.r + self.radius + 1.2) {
          const awayZone = V.away(self, z);
          api.move(awayZone.x, awayZone.z);
        }
      }
    }
  }

  if (self.busy) return;

  const hpFrac = self.hp / self.maxHp;

  // emergency self-sustain
  if (hpFrac < 0.35 && api.ready('k3')) {
    api.say('Not done yet.');
    api.use('k3');
    return;
  }

  // main poke: k1 lob with lead aim
  const k1 = self.kit && self.kit.k1;
  const k1Speed = (k1 && k1.speed) || 12;
  if (api.ready('k1') && dist <= 18.0) {
    const lead = V.lead(self, enemy, { x: enemy.vx, z: enemy.vz }, k1Speed);
    api.use('k1', lead);
    return;
  }

  // zone control: k2 with light lead
  const k2 = self.kit && self.kit.k2;
  const k2Windup = (k2 && k2.windup) || 0.467;
  if (api.ready('k2') && dist <= 16.0) {
    const predicted = V.add(enemy, V.scale({ x: enemy.vx, z: enemy.vz }, k2Windup + 0.15));
    api.use('k2', predicted);
    return;
  }

  // free sustain when nothing better to do
  if (api.ready('k3')) {
    api.use('k3');
    return;
  }
}