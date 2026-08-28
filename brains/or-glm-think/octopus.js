function think(p, api) {
  const s = p.self, e = p.enemy;
  if (!s.alive) return;

  const dist = e.dist;
  const toE = V.toward(s, e);
  const awayE = V.away(s, e);

  // --- threat detection ---
  const ec = e.casting;
  let dodgeNow = false;
  if (ec) {
    if (ec.skill === 'charge') {
      if (ec.phase === 'windup' && ec.remaining < 0.25) dodgeNow = true;
      if (ec.phase === 'dash') dodgeNow = true;
    }
    if (ec.skill === 'smash' && dist < 6.5 && ec.phase === 'windup' && ec.remaining < 0.2) dodgeNow = true;
  }

  if (dodgeNow && !s.busy && !s.stunned) {
    if (e.speed > 4 && dist < 12 && api.ready('blink')) {
      // blink perpendicular to enemy charge direction
      let cdir;
      if (ec && ec.phase === 'dash') cdir = V.norm({ x: e.vx, z: e.vz });
      else cdir = toE;
      const perp = V.perp(cdir);
      const side = api.rand() < 0.5 ? 1 : -1;
      let d = V.scale(perp, side);
      api.use('blink', d.x, d.z);
      return;
    }
    if (dist < 6.5 && api.ready('blink')) {
      api.use('blink', awayE.x * 7.5, awayE.z * 7.5);
      return;
    }
    if (api.ready('jump') && (ec && ec.skill === 'smash')) {
      // jump over the smash sweep
      api.use('jump');
      api.move(awayE.x, awayE.z);
      return;
    }
  }

  // --- firing ---
  const castT = 0.667;
  // predicted enemy position when the beam leaves
  const pred = {
    x: e.x + e.vx * castT * 0.8,
    z: e.z + e.vz * castT * 0.8
  };
  const aimDir = V.toward(s, pred);
  const aimAng = V.heading(aimDir);
  const off = V.angleTo(s.heading, aimDir);

  if (api.ready('laser') && !s.busy && !s.stunned && !s.airborne && e.alive) {
    if (e.visible && dist < 22) {
      // check LOS from muzzle-ish: use api.los to enemy
      const angBudget = 0.667 * s.turnRate * 0.35 + 0.2; // can still turn during cast
      if (Math.abs(off) < Math.min(0.25, angBudget) ) {
        api.use('laser');
        return;
      }
    }
  }

  // --- movement / kiting ---
  // desired distance band
  const want = 14;
  if (!s.busy || (s.casting && s.casting.skill === 'laser')) {
    if (e.alive && dist < want - 2) {
      // retreat, but prefer a direction that keeps LOS open-ish; just retreat
      api.move(awayE.x, awayE.z);
    } else if (dist > want + 4 || !e.visible) {
      // approach via path if not visible
      if (!e.visible) {
        const path = api.pathTo(e.x, e.z);
        if (path && path.points && path.points.length > 1) {
          const nxt = path.points[1] || path.points[0];
          api.moveTo(nxt.x, nxt.z);
        } else {
          api.moveTo(e.x, e.z);
        }
      } else {
        api.move(toE.x, toE.z);
      }
    } else {
      // strafe around, keep some drift
      const perp = V.perp(toE);
      const dir = api.recall('strafe', 1) > 0 ? 1 : -1;
      api.move(perp.x * dir * 0.7 + awayE.x * 0.3, perp.z * dir * 0.7 + awayE.z * 0.3);
      if (api.recall('strafeT', -9) < p.t) {
        api.remember('strafeT', p.t + 2.5);
        api.remember('strafe', api.rand() < 0.5 ? 1 : 0);
      }
    }
  }

  // --- facing ---
  if (!s.busy) {
    if (e.visible && dist < 24) {
      api.face(aimDir.x, aimDir.z);
    } else if (!s.busy) {
      api.face(toE.x, toE.z);
    }
  }

  // --- emergency: low hp, blink away when they close ---
  if (s.hp < 40 && dist < 8 && !s.busy && api.ready('blink')) {
    api.use('blink', awayE.x * 7.5, awayE.z * 7.5);
  }
}
