function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en) return;
  const d = en.dist;

  // predict enemy position slightly ahead
  const lead = { x: en.x + en.vx * 0.5, z: en.z + en.vz * 0.5 };

  if (p.t < 0.2) api.say("Come closer. The floor bites.");

  // face enemy by default
  api.faceAt(en.x, en.z);

  const root = me.kit.k1, dmg = me.kit.k3, cone = me.kit.k2;
  const canRoot = api.ready('k1') && root;
  const canDmg = api.ready('k3') && dmg;
  const canCone = api.ready('k2') && cone;

  const rootRange = (root && root.range ? root.range : 12) + 3.5;
  const dmgRange = (dmg && dmg.range ? dmg.range : 12) + 3.5;
  const coneReach = (cone && cone.range ? cone.range : 3.4) + 1.5;

  // Priority: root them, then drop damage on rooted target, cone if adjacent.
  if (!me.busy) {
    if (canCone && d <= coneReach - 0.6 && en.visible) {
      api.use('k2', { x: en.x, z: en.z });
    } else if (canRoot && d <= rootRange - 1 && en.visible &&
               !(en.immune && en.immune.indexOf('move') >= 0)) {
      api.use('k1', { x: lead.x, z: lead.z });
    } else if (canDmg && d <= dmgRange - 1 && en.visible) {
      const aim = en.rooted ? { x: en.x, z: en.z } : lead;
      api.use('k3', aim);
    }
  }

  // Movement: stay in mid range, avoid enemy zones
  let danger = null;
  for (const z of p.arena.zones) {
    if (!z.mine) {
      const dz = V.dist(me, z);
      if (dz < z.r + me.radius + 0.6) danger = z;
    }
  }
  if (danger) {
    const away = V.away(me, danger);
    api.move(away.x, away.z);
    return;
  }

  const want = en.rooted ? 3.0 : 7.0;
  if (d > want + 1.5) {
    api.moveTo(en.x, en.z);
  } else if (d < want - 1.5) {
    const away = V.away(me, en);
    let tx = me.x + away.x * 5, tz = me.z + away.z * 5;
    const h = p.arena.half - 2;
    tx = Math.max(-h, Math.min(h, tx));
    tz = Math.max(-h, Math.min(h, tz));
    api.move(tx - me.x, tz - me.z);
  } else {
    // strafe
    const per = V.perp(V.toward(me, en));
    const s = (Math.floor(p.t / 2) % 2) ? 1 : -1;
    let tx = me.x + per.x * s * 4, tz = me.z + per.z * s * 4;
    const h = p.arena.half - 2;
    if (Math.abs(tx) > h || Math.abs(tz) > h) { tx = me.x - per.x * s * 4; tz = me.z - per.z * s * 4; }
    api.move(tx - me.x, tz - me.z);
  }
}