function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en.alive) return;

  const d = en.dist;
  const kit = me.kit || {};
  const beam = kit.k2, dash = kit.k1, boost = kit.k3;
  const beamReach = beam ? (beam.range || 24) + 1.7 + 0.4 + (en.radius || 1.5) : 27;
  const dashReach = dash ? (dash.distance || 8) + me.radius + (en.radius || 1.5) : 11;

  // speed boost whenever available
  if (boost && api.ready('k3') && !me.busy) {
    // only if not about to fire something better
    const wantBeam = api.ready('k2') && en.visible && d < beamReach;
    const wantDash = api.ready('k1') && en.visible && d < dashReach && d > 3;
    if (!wantBeam && !wantDash) {
      api.use('k3');
      api.say('Faster.');
    }
  }

  if (!me.busy && en.visible) {
    if (api.ready('k2') && d < beamReach - 1) {
      api.use('k2', { x: en.x + en.vx * 0.7, z: en.z + en.vz * 0.7 });
      api.say('Line up.');
    } else if (api.ready('k1') && d < dashReach - 1.5 && d > 2.5) {
      api.use('k1', { x: en.x + en.vx * 0.25, z: en.z + en.vz * 0.25 });
      api.say('Closing.');
    }
  }

  // facing
  api.faceAt(en.x, en.z);

  // movement: keep mid range, strafe, keep LOS
  const toEn = V.toward(me, en);
  let dir;
  if (!en.visible) {
    api.moveTo(en.x, en.z);
    return;
  }
  const ideal = 13;
  let radial = 0;
  if (d > ideal + 2) radial = 1;
  else if (d < ideal - 3) radial = -1;

  let side = api.recall('side', 1);
  if (p.tick % 90 < 2) { side = -side; api.remember('side', side); }
  const perp = V.perp(toEn);
  dir = V.add(V.scale(toEn, radial), V.scale(perp, side * 0.9));

  // wall avoidance
  const h = p.arena.half - 3;
  let tx = me.x + dir.x * 5, tz = me.z + dir.z * 5;
  if (Math.abs(tx) > h) dir.x -= Math.sign(me.x) * 1.2;
  if (Math.abs(tz) > h) dir.z -= Math.sign(me.z) * 1.2;

  api.move(dir.x, dir.z);
}