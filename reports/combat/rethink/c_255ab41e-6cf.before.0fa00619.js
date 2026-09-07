function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en.alive) return;

  const d = en.dist;
  const dirToEn = V.toward(me, en);

  // keep speed boost up
  if (api.ready('k2') && !me.busy && me.cooldowns.k2 === 0 && d > 4) {
    api.use('k2');
    api.faceAt(en.x, en.z);
    api.moveTo(en.x, en.z);
    return;
  }

  // cone: silence + burn, short range
  if (d < 4.4 && en.y <= 0.35 && api.ready('k3') && en.visible) {
    api.use('k3', { x: en.x, z: en.z });
    api.move(dirToEn.x, dirToEn.z);
    if (p.t < 3) api.say('Close enough. Quiet now.');
    return;
  }

  // dash: lead them slightly
  if (d < 10 && d > 3.5 && en.visible && api.ready('k1') && en.y <= 0.35) {
    const lead = { x: en.x + en.vx * 0.35, z: en.z + en.vz * 0.35 };
    api.use('k1', lead);
    api.move(dirToEn.x, dirToEn.z);
    return;
  }

  // if enemy is winding up their dash at us, sidestep
  if (en.casting && en.casting.telegraph && en.casting.skill === 'k1' && d < 12) {
    const side = V.perp(dirToEn);
    const s = api.recall('side', 1);
    const tx = me.x + side.x * 6 * s, tz = me.z + side.z * 6 * s;
    if (Math.abs(tx) < 19 && Math.abs(tz) < 19) {
      api.move(side.x * s, side.z * s);
    } else {
      api.remember('side', -s);
      api.move(-side.x * s, -side.z * s);
    }
    api.faceAt(en.x, en.z);
    return;
  }

  // default: close in, orbit slightly to be unpredictable
  api.faceAt(en.x, en.z);
  if (d > 5) {
    api.moveTo(en.x, en.z);
  } else {
    const side = V.perp(dirToEn);
    const s = api.recall('side', 1);
    api.move(dirToEn.x * 0.6 + side.x * s, dirToEn.z * 0.6 + side.z * s);
    if (api.rand() < 0.03) api.remember('side', -s);
  }

  if (p.t > 1 && p.t < 1.2) api.say('One of us burns. It will not be me.');
}