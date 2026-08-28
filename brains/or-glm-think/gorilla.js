function think(p, api) {
  const S = p.self, E = p.enemy;
  if (!S.alive || !E.alive) { api.stop(); return; }

  const toE = V.toward(S, E);
  const dist = E.dist;
  const los = p.enemy.visible;

  // detect incoming laser windup
  let laserIncoming = false;
  const c = E.casting;
  if (c && c.skill === 'laser' && c.telegraph) laserIncoming = true;

  // remember last enemy position for when they blink
  api.remember('ex', E.x);
  api.remember('ez', E.z);

  // face the enemy (aim matters for smash cone)
  api.faceAt(E.x, E.z);

  if (S.stunned || S.busy) {
    // if winding up smash, keep closing slowly; else stop
    if (c === null && S.casting && S.casting.skill === 'smash' && S.casting.phase === 'windup') {
      api.move(toE.x, toE.z);
    } else {
      api.stop();
    }
    return;
  }

  // dodge laser: jump sideways if they're casting at us in range with LOS
  if (laserIncoming && api.ready('jump') && los && dist < 27) {
    api.use('jump');
    // set velocity sideways before takeoff? move order stands; steer perpendicular
    const perp = V.perp(toE);
    api.move(perp.x, perp.z);
    return;
  }

  // smash range: centre-to-centre <= 5.15 (and check cone later via aim)
  if (dist <= 5.0 && api.ready('smash') && !E.invulnerable) {
    // face precisely then smash
    api.faceAt(E.x, E.z);
    api.use('smash');
    api.move(toE.x, toE.z);
    return;
  }

  // charge: good when they're at mid range and we have LOS
  if (api.ready('charge') && los && dist >= 6 && dist <= 14 && !E.invulnerable) {
    // lead: charge locks direction at end of 0.3s windup
    const t = 0.3;
    const px = E.x + E.vx * t, pz = E.z + E.vz * t;
    const dir = V.norm({ x: px - S.x, z: pz - S.z });
    api.face(dir.x, dir.z);
    api.use('charge');
    return;
  }

  // otherwise: close in
  if (dist > 2.5) {
    api.moveTo(E.x, E.z);
  } else {
    api.move(toE.x, toE.z);
  }

  // late game: if burning and losing hp-fraction race, be aggressive — handled by default chase
}
