function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en) return;
  const d = en.dist;
  const k3 = me.kit && me.kit.k3;
  const k1 = me.kit && me.kit.k1;
  const k2 = me.kit && me.kit.k2;

  // talk
  if (p.t > 1 && !said) { said = true; api.say("Come close. I bite."); }

  const toE = { x: en.x - me.x, z: en.z - me.z };

  // melee cone: main damage
  if (k3 && api.ready('k3') && d < 4.4 && p.enemy.visible && !en.airborne) {
    api.faceAt(en.x, en.z);
    api.use('k3', { x: en.x, z: en.z });
    api.moveTo(en.x, en.z);
    return;
  }

  // silence lob when they are casting or mid range
  if (k2 && api.ready('k2') && d < 17 && d > 3.0) {
    const lead = V.lead({ x: me.x, z: me.z }, { x: en.x, z: en.z }, { x: en.vx, z: en.vz }, 12);
    api.use('k2', { x: lead.x, z: lead.z });
    api.moveTo(en.x, en.z);
    return;
  }

  // blind bolt at range
  if (k1 && api.ready('k1') && p.enemy.visible && d < 20 && d > 4.0) {
    const lead = V.lead({ x: me.x, z: me.z }, { x: en.x, z: en.z }, { x: en.vx, z: en.vz }, 22);
    api.use('k1', { x: lead.x, z: lead.z });
    api.moveTo(en.x, en.z);
    return;
  }

  // default: close the distance, weave a little
  api.faceAt(en.x, en.z);
  if (d > 3.0) {
    const wob = Math.sin(p.t * 3) * 2.2;
    const perp = V.perp(V.norm(toE));
    api.moveTo(en.x + perp.x * wob, en.z + perp.z * wob);
  } else {
    const perp = V.perp(V.norm(toE));
    const s = Math.sin(p.t * 2) > 0 ? 1 : -1;
    api.move(perp.x * s + toE.x * 0.2, perp.z * s + toE.z * 0.2);
  }
}

let said = false;