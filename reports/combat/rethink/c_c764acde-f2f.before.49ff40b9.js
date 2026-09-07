function think(p, api) {
  const me = p.self, e = p.enemy;
  if (!me.alive || !e.alive) return;
  if (me.busy || me.stunned) return;

  const d = e.dist;
  const k1 = me.kit.k1, k2 = me.kit.k2, k3 = me.kit.k3;
  const reach = (k1 && k1.range ? k1.range : 3.4) + e.radius;

  // speed boost when available and useful
  if (k3 && api.ready('k3') && d > 6 && me.maxSpeed <= me.kit.k3 ? false : false) {}

  const canRoot = api.ready('k2');
  const canHit = api.ready('k1');

  if (!p.mem.said) { api.say("Come closer. I bite."); api.remember('said', 1); }

  api.faceAt(e.x, e.z);

  if (d <= reach - 0.2 && e.y < 0.35 && e.visible) {
    if (canRoot && !e.rooted && (!e.immune || e.immune.indexOf('move') < 0)) {
      api.use('k2', { x: e.x, z: e.z });
      return;
    }
    if (canHit) {
      api.use('k1', { x: e.x, z: e.z });
      return;
    }
  }

  // boost for chasing
  if (api.ready('k3') && d > 7 && !me.rooted) {
    api.use('k3');
    return;
  }

  if (me.rooted) return;

  if (e.rooted && d < reach + 1.5) {
    // stay in kill range
    api.moveTo(e.x, e.z);
    return;
  }

  // approach, but back off briefly while their cone winds up and ours is down
  if (e.casting && e.casting.telegraph && d < reach + 1.0 && !canHit && !canRoot) {
    const away = V.away(me, e);
    api.move(away.x, away.z);
    return;
  }

  api.moveTo(e.x, e.z);
}