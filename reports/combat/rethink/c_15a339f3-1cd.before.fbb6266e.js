function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en) return;

  const dist = en.dist;
  const k1 = me.kit.k1, k2 = me.kit.k2, k3 = me.kit.k3;

  // cleanse / boost
  if (api.ready('k3')) {
    if (me.rooted || me.burning || me.silenced || me.blinded || me.stunned) {
      api.use('k3');
    } else if (dist > 6 && p.t > 0.5) {
      api.use('k3');
    }
  }

  const coneReach = (k1 && k1.range ? k1.range : 3.4) + en.radius;

  if (!me.busy) {
    if (api.ready('k1') && dist <= coneReach - 0.4 && en.visible && !en.airborne) {
      api.use('k1', { x: en.x, z: en.z });
    } else if (api.ready('k2') && en.visible && dist < 19) {
      const spd = (k2 && k2.speed) ? k2.speed : 22;
      const lead = V.lead({ x: me.x, z: me.z }, { x: en.x, z: en.z }, { x: en.vx, z: en.vz }, spd);
      if (api.los(lead.x, lead.z)) api.use('k2', lead);
    }
  }

  // movement: close in, but strafe a bit
  if (!en.visible) {
    api.moveTo(en.x, en.z);
    api.faceAt(en.x, en.z);
    return;
  }

  const to = V.toward({ x: me.x, z: me.z }, { x: en.x, z: en.z });
  const side = V.perp(to);
  const s = (Math.floor(p.t / 2) % 2 === 0) ? 1 : -1;
  let dir;
  if (dist > 4.2) {
    dir = V.add(to, V.scale(side, 0.35 * s));
  } else if (dist < 3.0) {
    dir = V.add(V.scale(to, -1), V.scale(side, 0.6 * s));
  } else {
    dir = V.scale(side, s);
  }
  // stay off walls
  const nx = me.x + dir.x * 3, nz = me.z + dir.z * 3;
  if (Math.abs(nx) > 18.5 || Math.abs(nz) > 18.5) {
    dir = V.toward({ x: me.x, z: me.z }, { x: 0, z: 0 });
  }
  api.move(dir.x, dir.z);
  api.faceAt(en.x, en.z);

  if (p.t > 1 && p.t < 1.2) api.say("Come closer. The fire is warm.");
}