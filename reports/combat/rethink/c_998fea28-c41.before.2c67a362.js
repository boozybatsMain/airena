function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en || !en.alive) return;

  const d = en.dist;
  const kit = me.kit || {};
  const mortarName = pick(kit, 'mortar', 'lob');
  const dashName = pick(kit, 'dash', 'lunge');
  const leapName = pick(kit, 'leap', 'jump');

  // keep boost up
  if (leapName && api.ready(leapName) && !me.airborne) {
    api.use(leapName);
  }

  let acted = false;

  // mortar: lead the target
  if (!acted && mortarName && api.ready(mortarName) && en.visible !== false) {
    const k = kit[mortarName] || {};
    const reach = (k.range || 15) + (k.splash || 1.8) + (en.radius || 1.5);
    if (d <= reach) {
      const wind = k.windup || 0.5;
      const spd = k.speed || 12;
      const flight = d / spd;
      const tLead = wind + flight;
      let ax = en.x + en.vx * tLead * 0.7;
      let az = en.z + en.vz * tLead * 0.7;
      ax = Math.max(-18, Math.min(18, ax));
      az = Math.max(-18, Math.min(18, az));
      api.use(mortarName, { x: ax, z: az });
      acted = true;
    }
  }

  // dash when close
  if (!acted && dashName && api.ready(dashName)) {
    const k = kit[dashName] || {};
    const reach = (k.distance || 8) + 2.5;
    if (d <= reach && d > 2 && !en.airborne && en.visible !== false) {
      api.use(dashName, { x: en.x, z: en.z });
      acted = true;
    }
  }

  // movement: hold a mid range band, keep line of sight
  const want = 9;
  if (en.visible === false) {
    api.moveTo(en.x, en.z);
  } else if (d > want + 2.5) {
    api.moveTo(en.x, en.z);
  } else if (d < want - 3) {
    const away = V.away(me, en);
    const t = { x: me.x + away.x * 6, z: me.z + away.z * 6 };
    api.move(...clampInside(me, t));
  } else {
    // strafe
    let dir = api.recall('strafe', 1);
    if (p.tick % 90 === 0) { dir = -dir; api.remember('strafe', dir); }
    const perp = V.perp(V.toward(me, en));
    const t = { x: me.x + perp.x * dir * 5, z: me.z + perp.z * dir * 5 };
    api.move(...clampInside(me, t));
  }

  api.faceAt(en.x, en.z);

  if (p.t < 0.2) api.say("Rain first, then the blade.");
}

function pick(kit, ...kinds) {
  for (const name of Object.keys(kit || {})) {
    const k = kit[name];
    if (k && kinds.includes(k.kind)) return name;
  }
  const names = Object.keys(kit || {});
  return null;
}

function clampInside(me, t) {
  let x = Math.max(-17.5, Math.min(17.5, t.x));
  let z = Math.max(-17.5, Math.min(17.5, t.z));
  return [x - me.x, z - me.z];
}