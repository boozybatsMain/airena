function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en.alive) return;

  const dist = en.dist;
  const beam = me.kit && me.kit.k2;
  const beamRange = beam && beam.range ? beam.range + 3 : 27;

  // opportunistic taunt
  if (p.t > 1 && p.t < 1.2) api.say("Line up. Blink. Burn.");

  // Blink out if enemy beam winding up at us and we're exposed
  const enemyCasting = en.casting && en.casting.telegraph;

  // dodge: if they are casting a beam and we're in line, blink sideways
  if (enemyCasting && api.ready('k3') && dist < beamRange) {
    const side = V.perp(V.toward(me, en));
    const sgn = api.rand() < 0.5 ? 1 : -1;
    api.use('k3', { x: me.x + side.x * 6.5 * sgn, z: me.z + side.z * 6.5 * sgn });
    api.face(en.x - me.x, en.z - me.z);
    return;
  }

  // Boost when it's ready and enemy is not about to hit us and beam is close to ready
  if (api.ready('k1') && api.cooldown('k2') < 0.9 && dist < beamRange && en.visible && !enemyCasting) {
    api.use('k1');
    api.faceAt(en.x, en.z);
    return;
  }

  // Beam when in range and visible
  if (api.ready('k2') && en.visible && dist < beamRange - 1) {
    // predict slight lead not needed for beam; aim at their position plus small velocity offset
    const t = 0.5;
    const ax = en.x + en.vx * t * 0.5;
    const az = en.z + en.vz * t * 0.5;
    if (api.los(ax, az)) {
      api.use('k2', { x: ax, z: az });
      return;
    }
    api.use('k2', { x: en.x, z: en.z });
    return;
  }

  api.faceAt(en.x, en.z);

  // Movement: keep mid range, strafe, seek line of sight
  if (!en.visible) {
    api.moveTo(en.x, en.z);
    return;
  }

  // Use blink offensively to close if far and beam ready-ish
  if (dist > beamRange && api.ready('k3')) {
    const d = V.toward(me, en);
    api.use('k3', { x: me.x + d.x * 6.5, z: me.z + d.z * 6.5 });
    return;
  }

  const want = 12;
  const dir = V.toward(me, en);
  const perp = V.perp(dir);
  const s = (Math.floor(p.t / 2.5) % 2 === 0) ? 1 : -1;
  let mx = perp.x * s, mz = perp.z * s;
  if (dist > want + 2) { mx += dir.x; mz += dir.z; }
  else if (dist < want - 2) { mx -= dir.x; mz -= dir.z; }
  // avoid walls
  const nx = me.x + mx * 3, nz = me.z + mz * 3;
  if (Math.abs(nx) > 18 || Math.abs(nz) > 18) { mx = -me.x; mz = -me.z; }
  api.move(mx, mz);
}