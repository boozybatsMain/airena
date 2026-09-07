function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en.alive) return;

  const kit = me.kit || {};
  const names = me.skills || [];
  const find = (kind) => names.find(n => kit[n] && kit[n].kind === kind);
  const dash = find('dash');
  const cone = find('cone');
  const self = find('self') || names.find(n => kit[n] && kit[n].aim === 'none');

  const d = en.dist;
  const toE = { x: en.x - me.x, z: en.z - me.z };

  if (me.stunned || me.busy) {
    api.faceAt(en.x, en.z);
    return;
  }

  // boost when about to engage
  if (self && api.ready(self) && d < 9 && en.visible) {
    api.use(self);
    api.faceAt(en.x, en.z);
    api.say("Winding up.");
    return;
  }

  const coneReach = cone ? (kit[cone].range || 3.4) + en.radius : 4.9;
  const dashReach = dash ? (kit[dash].distance || 8) + 3 : 11;

  // cone when in range and roughly facing
  if (cone && api.ready(cone) && d <= coneReach - 0.4 && en.visible && !en.airborne) {
    api.use(cone, { x: en.x, z: en.z });
    api.moveTo(en.x, en.z);
    return;
  }

  // dash to close
  if (dash && api.ready(dash) && en.visible && d > coneReach - 0.2 && d <= dashReach - 1.5) {
    const aim = V.add({ x: en.x, z: en.z }, V.scale(V.norm({ x: en.vx, z: en.vz }), 0.4));
    api.use(dash, aim);
    api.say("Closing in!");
    return;
  }

  // approach
  api.faceAt(en.x, en.z);
  if (d > 3.0) {
    api.moveTo(en.x, en.z);
  } else {
    // strafe around
    const side = (p.tick % 240 < 120) ? 1 : -1;
    const per = V.scale(V.perp(V.norm(toE)), side);
    api.move(per.x + toE.x * 0.05, per.z + toE.z * 0.05);
  }
}