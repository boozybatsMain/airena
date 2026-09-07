function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en) return;
  const d = en.dist;

  // talk
  if (!think._said && p.t > 1) { think._said = 1; api.say("Come closer. I bite."); }

  if (me.busy && me.casting) {
    // keep moving during cast
  }

  const k3 = me.kit && me.kit.k3, k1 = me.kit && me.kit.k1, k2 = me.kit && me.kit.k2;
  const r3 = k3 && k3.range ? k3.range + en.radius : 4.9;

  // primary: cone damage in close
  if (d < r3 - 0.3 && en.visible && api.ready('k3') && !en.airborne) {
    api.use('k3', { x: en.x, z: en.z });
    api.move(en.x - me.x, en.z - me.z);
    return;
  }

  // silence lob when they are casting or mid-range
  if (api.ready('k2') && d < 17 && en.visible && (en.casting || d < 9)) {
    const sp = (k2 && k2.speed) || 18;
    const lead = V.lead({ x: me.x, z: me.z }, { x: en.x, z: en.z }, { x: en.vx, z: en.vz }, sp);
    api.use('k2', { x: lead.x, z: lead.z });
    api.move(en.x - me.x, en.z - me.z);
    return;
  }

  // blind bolt at range
  if (api.ready('k1') && en.visible && d < 18 && !me.blinded) {
    const sp = (k1 && k1.speed) || 22;
    const lead = V.lead({ x: me.x, z: me.z }, { x: en.x, z: en.z }, { x: en.vx, z: en.vz }, sp);
    api.use('k1', { x: lead.x, z: lead.z });
  } else {
    api.faceAt(en.x, en.z);
  }

  // movement: dodge projectiles, else close in
  let dodge = null;
  for (const pr of p.arena.projectiles) {
    if (pr.mine) continue;
    const rel = { x: me.x - pr.x, z: me.z - pr.z };
    const v = { x: pr.vx, z: pr.vz };
    const vl = V.len(v);
    if (vl < 0.1) continue;
    const u = V.scale(v, 1 / vl);
    const along = V.dot(rel, u);
    if (along < 0 || along > vl * pr.left + 2) continue;
    const perp = V.len(V.sub(rel, V.scale(u, along)));
    if (perp < 3.2) {
      const side = V.perp(u);
      const s = V.dot(rel, side) >= 0 ? 1 : -1;
      dodge = V.scale(side, s);
      break;
    }
  }

  if (dodge) {
    api.move(dodge.x, dodge.z);
    return;
  }

  const want = 2.6;
  if (d > want + 0.8) {
    const path = api.pathTo(en.x, en.z);
    if (path && path.points && path.points.length && !path.direct) {
      const n = path.points[0];
      api.move(n.x - me.x, n.z - me.z);
    } else {
      api.move(en.x - me.x, en.z - me.z);
    }
  } else if (d < want - 0.8) {
    api.move(me.x - en.x, me.z - en.z);
  } else {
    const t = V.perp(V.toward(me, en));
    const s = (Math.floor(p.t * 0.5) % 2) ? 1 : -1;
    api.move(t.x * s, t.z * s);
  }
}