function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en.alive) return;
  const kit = me.kit || {};
  const d = en.dist;

  // identify skills by kind
  let dash = null, cone = null, zone = null;
  for (const n of me.skills) {
    const k = kit[n];
    if (!k) continue;
    if (k.kind === 'dash' || k.aim === 'facing' && k.distance) dash = n;
    else if (k.kind === 'cone' || k.halfAngle != null) cone = n;
    else if (k.kind === 'zone' || k.ticks != null) zone = n;
  }
  if (!dash && me.skills[0]) dash = me.skills[0];

  if (me.busy && me.casting && me.casting.phase !== 'recover') {
    // keep aiming
  }

  const toE = V.toward(me, en);
  const dashReach = dash && kit[dash] ? (kit[dash].distance || 8) + me.radius + en.radius : 11;
  const coneReach = cone && kit[cone] ? (kit[cone].range || 3.4) + en.radius : 4.9;
  const zoneRange = zone && kit[zone] ? (kit[zone].range || 12) : 12;

  api.faceAt(en.x, en.z);

  // dodge enemy zones
  let fleeZone = null;
  for (const z of p.arena.zones) {
    if (z.mine) continue;
    if (V.dist(me, z) < z.r + me.radius + 0.5) fleeZone = z;
  }

  if (!me.busy) {
    if (zone && api.ready(zone) && en.visible && d <= zoneRange && d > 1) {
      const lead = { x: en.x + en.vx * 0.5, z: en.z + en.vz * 0.5 };
      api.use(zone, lead);
    } else if (cone && api.ready(cone) && d <= coneReach - 0.4 && en.visible && !en.airborne) {
      api.use(cone, { x: en.x, z: en.z });
    } else if (dash && api.ready(dash) && en.visible && d <= dashReach - 1 && d > 2 && !en.airborne) {
      api.use(dash, { x: en.x, z: en.z });
    }
  }

  if (fleeZone) {
    const away = V.away(me, fleeZone);
    api.move(away.x, away.z);
  } else if (!en.visible) {
    api.moveTo(en.x, en.z);
  } else if (d > 4.5) {
    api.moveTo(en.x, en.z);
  } else if (d < 2.6) {
    const away = V.away(me, en);
    const side = V.perp(toE);
    api.move(away.x * 0.6 + side.x, away.z * 0.6 + side.z);
  } else {
    const side = V.perp(toE);
    const s = (p.tick % 120 < 60) ? 1 : -1;
    api.move(side.x * s + toE.x * 0.25, side.z * s + toE.z * 0.25);
  }

  if (p.tick % 150 === 0) api.say("Close the distance. Burn them down.");
}