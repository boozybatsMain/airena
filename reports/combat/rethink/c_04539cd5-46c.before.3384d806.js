function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en.alive) return;

  const k = me.kit || {};
  const cone = Object.keys(k).find(n => k[n].kind === 'cone' || k[n].halfAngle != null);
  const dash = Object.keys(k).find(n => k[n].kind === 'dash' || k[n].distance != null);
  const zone = Object.keys(k).find(n => k[n].kind === 'zone' || k[n].ticks != null);

  const d = en.dist;
  const toE = V.toward(me, en);

  if (me.busy || me.stunned) {
    if (!me.rooted && me.casting && me.casting.skill === cone) api.moveTo(en.x, en.z);
    return;
  }

  api.faceAt(en.x, en.z);

  // cone in melee
  if (cone && api.ready(cone) && d < 4.4 && en.visible && !en.airborne) {
    api.use(cone, { x: en.x, z: en.z });
    api.say("Close enough.");
    return;
  }

  // zone under them, predicting movement
  if (zone && api.ready(zone)) {
    const r = k[zone].range || 12;
    if (d < r + 2 && en.visible) {
      const lead = { x: en.x + en.vx * 0.55, z: en.z + en.vz * 0.55 };
      api.use(zone, lead);
      api.say("Burn there.");
      return;
    }
  }

  // dash to close
  if (dash && api.ready(dash) && en.visible && d > 4 && d < 10.5 && !en.airborne) {
    api.use(dash, { x: en.x, z: en.z });
    api.say("Coming through.");
    return;
  }

  // movement: approach, orbit slightly at melee range
  if (d < 3.2) {
    const side = V.perp(toE);
    api.move(side.x - toE.x * 0.3, side.z - toE.z * 0.3);
  } else if (en.visible) {
    api.move(toE.x, toE.z);
  } else {
    api.moveTo(en.x, en.z);
  }
}