let dodgeSide = 1;
let sideChosenAt = -10;

function think(p, api) {
  const s = p.self, e = p.enemy;
  if (!s.alive) return;

  const HALF = 20;
  const clamp = (x, z) => ({
    x: Math.max(-HALF + 0.5, Math.min(HALF - 0.5, x)),
    z: Math.max(-HALF + 0.5, Math.min(HALF - 0.5, z)),
  });

  if (p.t - sideChosenAt > 2) {
    dodgeSide = api.rand() < 0.5 ? -1 : 1;
    sideChosenAt = p.t;
  }

  const dist = e.dist;

  // --- Dodge enemy's telegraphed dash (k1): step off its line ---
  if (e.casting && e.casting.telegraph && e.casting.skill === 'k1') {
    const awayDir = V.away(s, e); // points from enemy to self
    const perp = V.scale(V.perp(awayDir), dodgeSide);
    const target = clamp(s.x + perp.x * 8, s.z + perp.z * 8);
    api.moveTo(target.x, target.z);
    api.face(e.x - s.x, e.z - s.z);
    return;
  }

  // --- Dodge enemy's telegraphed cone (k2): open distance ---
  if (e.casting && e.casting.telegraph && e.casting.skill === 'k2' && dist < 5.2) {
    const away = V.away(s, e);
    const target = clamp(s.x + away.x * 6, s.z + away.z * 6);
    api.moveTo(target.x, target.z);
    api.face(e.x - s.x, e.z - s.z);
    return;
  }

  // --- Step out of an enemy zone (k3 disc) sitting under us ---
  if (p.arena && p.arena.zones) {
    for (const z of p.arena.zones) {
      if (!z.mine) {
        const d = Math.hypot(s.x - z.x, s.z - z.z);
        if (d < z.r + s.radius + 0.5) {
          const dir = V.away(s, { x: z.x, z: z.z });
          const target = clamp(s.x + dir.x * 6, s.z + dir.z * 6);
          api.moveTo(target.x, target.z);
          api.face(e.x - s.x, e.z - s.z);
          return;
        }
      }
    }
  }

  // If we're mid-cast, just keep facing the enemy (harmless during aim locks) and stand down.
  if (s.busy) {
    if (!s.casting || s.casting.phase !== 'dash') {
      api.face(e.x - s.x, e.z - s.z);
    }
    return;
  }

  const predict = (t) => ({ x: e.x + e.vx * t, z: e.z + e.vz * t });

  // Priority 1: dash burst
  if (api.ready('k1') && dist <= 10.5) {
    const aim = predict(0.3);
    if (api.los(aim.x, aim.z)) {
      api.use('k1', aim);
      return;
    }
  }

  // Priority 2: cone weaken/poke when close
  if (api.ready('k2') && dist <= 4.7) {
    api.use('k2', { x: e.x, z: e.z });
    return;
  }

  // Priority 3: zone damage + knock at range
  if (api.ready('k3') && dist <= 12) {
    const aim = predict(0.45);
    api.use('k3', aim);
    return;
  }

  // Nothing ready: position for the next opening.
  api.face(e.x - s.x, e.z - s.z);
  if (dist > 9) {
    api.moveTo(e.x, e.z);
  } else if (dist < 4) {
    const away = V.away(s, e);
    const target = clamp(s.x + away.x * 5, s.z + away.z * 5);
    api.moveTo(target.x, target.z);
  } else {
    const perp = V.scale(V.perp(V.away(s, e)), dodgeSide);
    const target = clamp(s.x + perp.x * 2, s.z + perp.z * 2);
    api.moveTo(target.x, target.z);
  }
}