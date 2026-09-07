function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en.alive) return;
  const k = me.kit || {};
  const d = en.dist;

  // names by kind
  let dash = null, cone = null, buff = null;
  for (const n of me.skills) {
    const s = k[n]; if (!s) continue;
    const eff = (s.effects || []).join(',');
    if (s.kind === 'dash' || s.distance) dash = dash || n;
    else if (s.halfAngle || s.kind === 'cone') cone = cone || n;
    else if (s.aim === 'none' || eff.indexOf('boost') >= 0) buff = buff || n;
  }

  const coneReach = cone ? (k[cone].range || 3.4) + en.radius : 4.9;
  const dashReach = dash ? (k[dash].distance || 8) + 3 : 11;

  // defensive buff when they telegraph or close
  if (buff && api.ready(buff) && !me.busy) {
    if ((en.casting && en.casting.telegraph && d < 12) || (d < 6 && en.hp > 40)) {
      api.use(buff);
      api.faceAt(en.x, en.z);
      return;
    }
  }

  if (!me.busy) {
    if (cone && api.ready(cone) && d < coneReach - 0.4 && en.visible && !en.airborne) {
      api.use(cone, { x: en.x, z: en.z });
      api.move(V.toward(me, en).x, V.toward(me, en).z);
      api.say("Close enough.");
      return;
    }
    if (dash && api.ready(dash) && en.visible && d < dashReach - 1.5 && d > 3.5) {
      const lead = { x: en.x + en.vx * 0.25, z: en.z + en.vz * 0.25 };
      api.use(dash, lead);
      return;
    }
  }

  // movement: close in
  api.faceAt(en.x, en.z);
  if (d > 3.0) {
    api.moveTo(en.x, en.z);
  } else {
    // strafe to keep facing while in cone range
    const t = V.toward(me, en), pr = V.perp(t);
    const s = (p.tick % 120 < 60) ? 1 : -1;
    api.move(t.x * 0.2 + pr.x * s, t.z * 0.2 + pr.z * s);
  }
}