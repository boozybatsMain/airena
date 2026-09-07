function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en) return;

  const d = en.dist;
  const kit = me.kit || {};
  const has = n => me.skills && me.skills.indexOf(n) >= 0;

  // keep boost up
  if (has('k3') && kit.k3 && kit.k3.kind !== undefined && api.ready('k3')) {
    const isBoost = (kit.k3.effects && JSON.stringify(kit.k3.effects).indexOf('boost') >= 0) || kit.k3.aim === 'none';
    if (isBoost && me.maxSpeed <= 5.9) {
      api.use('k3');
    }
  }

  const beamRange = (kit.k2 && kit.k2.range) ? kit.k2.range + 2.5 : 26;
  const dashReach = (kit.k1 && kit.k1.distance) ? kit.k1.distance + 2.5 : 10.5;

  let acted = false;
  if (!me.busy) {
    if (has('k2') && api.ready('k2') && d < beamRange && en.visible) {
      // lead slightly for their movement over 0.5s windup
      const px = en.x + en.vx * 0.5, pz = en.z + en.vz * 0.5;
      if (api.los(px, pz) || en.visible) { api.use('k2', { x: px, z: pz }); acted = true; }
    }
    if (!acted && has('k1') && api.ready('k1') && d < dashReach && en.visible) {
      api.use('k1', { x: en.x + en.vx * 0.3, z: en.z + en.vz * 0.3 });
      acted = true;
    }
  }

  // movement: keep at medium range, strafe, close if beam down
  const toE = V.toward(me, en);
  const perp = V.perp(toE);
  const side = (Math.floor(p.t * 0.5) % 2 === 0) ? 1 : -1;

  let desired;
  if (!en.visible) {
    const path = api.pathTo(en.x, en.z);
    if (path && path.points && path.points.length) {
      const wp = path.points[0];
      api.moveTo(wp.x, wp.z);
      api.faceAt(en.x, en.z);
      return;
    }
    desired = toE;
  } else if (d > 14) {
    desired = V.add(toE, V.scale(perp, 0.35 * side));
  } else if (d < 7) {
    desired = V.add(V.scale(toE, -1), V.scale(perp, 0.8 * side));
  } else {
    desired = V.add(V.scale(perp, side), V.scale(toE, d > 11 ? 0.2 : -0.15));
  }

  // dodge enemy beam telegraph: move perpendicular hard
  if (en.casting && en.casting.telegraph) {
    desired = V.add(V.scale(perp, side * 1.5), V.scale(toE, -0.2));
  }

  // avoid walls
  const nx = me.x + desired.x * 4, nz = me.z + desired.z * 4;
  if (Math.abs(nx) > 18 || Math.abs(nz) > 18) {
    desired = V.toward(me, { x: 0, z: 0 });
  }

  api.move(desired.x, desired.z);
  api.faceAt(en.x, en.z);
}