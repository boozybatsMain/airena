function think(p, api) {
  const S = p.self, E = p.enemy;
  const K1 = S.kit.k1, K2 = S.kit.k2, K3 = S.kit.k3;

  // ---------- track enemy cooldowns heuristically ----------
  if (!state.init) {
    state.init = true;
    state.eCast = null;
    state.eCastAt = -99;
    state.lastTick = p.tick;
  }
  for (const ev of p.events) {
    if (ev.type === 'enemyStarted') { state.eCast = ev.skill; state.eCastAt = p.t; }
  }

  const casting = S.casting && S.casting.phase !== 'recover';
  const eTele = E.casting && E.casting.telegraph;
  const eSkill = eTele ? E.casting.skill : null;

  // ---------- what's dangerous under us ----------
  let inZone = null;
  for (const z of p.arena.zones) {
    if (!z.mine && V.dist({ x: S.x, z: S.z }, z) < z.r + 0.8) inZone = z;
  }
  let nearProj = null;
  for (const pr of p.arena.projectiles) {
    if (!pr.mine && !pr.arc) {
      const px = pr.x + pr.vx * pr.left, pz = pr.z + pr.vz * pr.left;
      if (V.dist({ x: S.x, z: S.z }, { x: px, z: pz }) < 3.4) nearProj = pr;
    }
  }

  // ---------- targeting ----------
  const aim = { x: E.x, z: E.z };
  const toE = V.toward(S, E);
  const dE = V.dist(S, E);

  // ---------- skills ----------
  const lowHp = S.hp / S.maxHp < 0.62;
  const enemyHitMeRecently = p.t - state.eCastAt < 1.2;

  if (api.ready('k3') && (lowHp || (eSkill && eSkill !== 'k3' && state.eCastAt > p.t - 0.35))) {
    api.use('k3');
  }

  if (api.ready('k1') && E.visible && !casting) {
    // lead: windup 0.5 + flight d/12
    const flight = dE / (K1.speed || 12);
    const pred = V.lead(S, E, E, K1.speed || 12);
    const tt = 0.5 + V.dist(S, pred) / (K1.speed || 12);
    const px = E.x + (E.vx || 0) * tt, pz = E.z + (E.vz || 0) * tt;
    const cl = clampArena(px, pz);
    if (V.dist(S, cl) <= (K1.range || 15) + 1.5) api.use('k1', cl);
  }

  if (api.ready('k2') && E.visible && !casting && dE < (K2.range || 12) + 1 && !E.invulnerable) {
    const tt = 0.467;
    const px = E.x + (E.vx || 0) * tt, pz = E.z + (E.vz || 0) * tt;
    api.use('k2', clampArena(px, pz));
  }

  // ---------- movement ----------
  if (S.rooted || S.stunned) { /* nothing */ }
  else if (inZone) {
    const away = V.away(inZone, S);
    api.move(away.x + E.vx * 0.1, away.z + E.vz * 0.1);
  } else if (eTele && (eSkill === 'k1')) {
    // strafe perpendicular to dodge the lob
    const perp = V.perp(toE);
    const sgn = (V.dot({ x: S.vx, z: S.vz }, perp) >= 0) ? 1 : -1;
    api.move(perp.x * sgn, perp.z * sgn);
  } else if (eTele && eSkill === 'k2') {
    const away = V.away(E, S);
    api.move(away.x, away.z);
  } else {
    // keep ideal spacing ~10-12 m
    const ideal = 11;
    let dir;
    if (dE > ideal + 2) dir = toE;
    else if (dE < ideal - 2) dir = V.away(E, S);
    else {
      dir = V.perp(toE);
      const sgn = orbitSign();
      dir = { x: dir.x * sgn, z: dir.z * sgn };
    }
    api.move(dir.x, dir.z);
    if (E.visible) api.faceAt(E.x, E.z);
  }

  function clampArena(x, z) {
    const m = 2.0, h = p.arena.half;
    return { x: V.clamp(x, -h + m, h - m), z: V.clamp(z, -h + m, h - m) };
  }
  function orbitSign() {
    if (!state.orbit) state.orbit = api.rand() < 0.5 ? 1 : -1;
    if (p.t - (state.lastFlip || 0) > 4 && api.rand() < 0.02) {
      state.orbit = -state.orbit;
      state.lastFlip = p.t;
    }
    return state.orbit;
  }
}

const state = {};