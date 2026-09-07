function think(p, api) {
  const self = p.self, enemy = p.enemy;
  if (!self.alive) return;

  const HALF = (p.arena && p.arena.half) || 20;
  const BOUND = HALF - self.radius - 0.4;

  const clampPos = (x, z) => ({
    x: Math.max(-BOUND, Math.min(BOUND, x)),
    z: Math.max(-BOUND, Math.min(BOUND, z)),
  });

  // classify a kit entry by its shape rather than by name, since the
  // three skills behind k1/k2/k3 can be swapped out between matches
  function classify(k) {
    if (!k) return 'unknown';
    if (k.distance != null && k.range == null) return 'dash';
    if (k.range != null) return 'ranged';
    if (k.aim === 'none') return 'self';
    return 'other';
  }

  const hasEffect = (k, name) =>
    Array.isArray(k && k.effects) &&
    k.effects.some(e => String(e).toLowerCase().includes(name));

  const names = self.skills || [];
  let rangedName = null, rangedBest = -1;
  let dashName = null;
  let selfName = null;

  for (const n of names) {
    const k = self.kit[n];
    if (!k) continue;
    const kind = classify(k);
    if (kind === 'ranged' && (k.damage || 0) > rangedBest) {
      rangedBest = k.damage || 0;
      rangedName = n;
    } else if (kind === 'dash' && !dashName) {
      dashName = n;
    } else if (kind === 'self' && !selfName) {
      selfName = n;
    }
  }

  const dist = enemy.dist != null ? enemy.dist : V.len(V.sub(
    { x: enemy.x, z: enemy.z }, { x: self.x, z: self.z }
  ));

  // ---- defensive: dodge an incoming lunge/dash by jumping if we can ----
  let dodged = false;
  if (
    !self.busy &&
    enemy.casting && enemy.casting.telegraph &&
    enemy.kit && enemy.kit[enemy.casting.skill] &&
    classify(enemy.kit[enemy.casting.skill]) === 'dash' &&
    selfName && api.ready(selfName) &&
    self.kit[selfName].airborne != null
  ) {
    api.use(selfName);
    dodged = true;
  }

  // ---- facing: track the enemy by default; point-locked skills override ----
  api.faceAt(enemy.x, enemy.z);

  // ---- attack decisions ----
  if (!self.busy && !dodged) {
    const dashRange = dashName ? (self.kit[dashName].distance || 8) : 0;
    const closeReach = dashRange * 0.95 + self.radius + enemy.radius;

    if (dashName && api.ready(dashName) && dist > 0.6 && dist <= closeReach) {
      const lead = V.lead(
        { x: self.x, z: self.z },
        { x: enemy.x, z: enemy.z },
        { x: enemy.vx, z: enemy.vz },
        self.kit[dashName].dashSpeed || 20
      );
      api.use(dashName, lead);
    } else if (rangedName && api.ready(rangedName)) {
      const rk = self.kit[rangedName];
      const minR = 3.7, maxR = rk.range || 15;
      if (dist >= minR - 0.5 && dist <= maxR + (rk.splash || 0) && api.los(enemy.x, enemy.z)) {
        const spd = rk.speed || 0;
        const lead = spd > 0
          ? V.lead({ x: self.x, z: self.z }, { x: enemy.x, z: enemy.z }, { x: enemy.vx, z: enemy.vz }, spd)
          : { x: enemy.x, z: enemy.z };
        api.use(rangedName, lead);
      } else if (selfName && api.ready(selfName)) {
        api.use(selfName);
      }
    } else if (selfName && api.ready(selfName)) {
      // keep a mobility/self-buff channel topped up when nothing else to do
      api.use(selfName);
    } else if (dashName && api.ready(dashName) && dist <= dashRange * 1.3) {
      api.use(dashName, { x: enemy.x, z: enemy.z });
    }
  }

  // ---- movement: kite around a comfortable range, strafing a little ----
  const rk = rangedName ? self.kit[rangedName] : null;
  const desiredRange = rk ? Math.max(4.5, Math.min(11, (rk.range || 10) * 0.7)) : 7;

  const away = V.away({ x: enemy.x, z: enemy.z }, { x: self.x, z: self.z });
  const dirFromEnemy = (away.x === 0 && away.z === 0)
    ? V.fromHeading(self.heading)
    : away;

  const strafeSign = Math.sin(p.t * 0.9 + (self.id === 'blue' ? 0 : Math.PI)) > 0 ? 1 : -1;
  const perp = V.perp(dirFromEnemy);
  const strafeAmt = Math.min(3, dist * 0.25);

  let targetX = enemy.x + dirFromEnemy.x * desiredRange + perp.x * strafeSign * strafeAmt;
  let targetZ = enemy.z + dirFromEnemy.z * desiredRange + perp.z * strafeSign * strafeAmt;
  const tp = clampPos(targetX, targetZ);

  if (Math.abs(dist - desiredRange) > 0.8 || true) {
    api.moveTo(tp.x, tp.z);
  }

  // ---- occasional flavor line ----
  const lastSay = p.mem && p.mem.lastSay;
  if (p.t - (lastSay || -100) > 8) {
    if (api.say('Hold still.')) api.remember('lastSay', p.t);
  }
}