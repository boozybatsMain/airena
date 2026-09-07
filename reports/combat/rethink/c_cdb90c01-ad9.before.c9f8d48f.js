function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en.alive) return;
  const kit = me.kit || {};
  const beam = pick(kit, 'beam');
  const dash = pick(kit, 'lunge', 'dash');
  const cone = pick(kit, 'fan', 'cone');
  const d = en.dist;

  if (p.t < 0.2) api.say("Line them up.");

  // face enemy by default
  api.faceAt(en.x, en.z);

  if (me.busy) return;

  // Beam when visible and in range
  if (beam && api.ready(beam.name) && en.visible) {
    const r = (beam.range || 20) + 1.5;
    if (d < r) {
      api.use(beam.name, { x: en.x, z: en.z });
      keepDistance(p, api, d);
      return;
    }
  }

  // Cone at close range
  if (cone && api.ready(cone.name) && d < (cone.range || 3.4) + 1.4 && !en.airborne) {
    api.use(cone.name, { x: en.x, z: en.z });
    return;
  }

  // Dash to close gap or to strike
  if (dash && api.ready(dash.name) && en.visible) {
    const dd = (dash.distance || 8) + 2.5;
    if (d < dd && d > 3.5 && !en.airborne) {
      api.use(dash.name, { x: en.x, z: en.z });
      return;
    }
  }

  keepDistance(p, api, d);
}

function pick(kit, ...kinds) {
  for (const name of Object.keys(kit)) {
    const s = kit[name];
    if (s && kinds.indexOf(s.kind) >= 0) return Object.assign({ name }, s);
  }
  return null;
}

function keepDistance(p, api, d) {
  const me = p.self, en = p.enemy;
  const ideal = 11;
  if (!en.visible) {
    api.moveTo(en.x, en.z);
    return;
  }
  let dir;
  if (d < ideal - 2) dir = V.away({ x: me.x, z: me.z }, { x: en.x, z: en.z });
  else if (d > ideal + 3) dir = V.toward({ x: me.x, z: me.z }, { x: en.x, z: en.z });
  else dir = V.perp(V.toward({ x: me.x, z: me.z }, { x: en.x, z: en.z }));
  // strafe component to dodge beams
  const strafe = V.perp(V.toward({ x: me.x, z: me.z }, { x: en.x, z: en.z }));
  const s = (Math.floor(p.t / 1.3) % 2 === 0) ? 1 : -1;
  let v = V.add(dir, V.scale(strafe, 0.9 * s));
  let tx = me.x + v.x * 6, tz = me.z + v.z * 6;
  const lim = 18;
  if (tx > lim) tx = lim; if (tx < -lim) tx = -lim;
  if (tz > lim) tz = lim; if (tz < -lim) tz = -lim;
  api.moveTo(tx, tz);
}