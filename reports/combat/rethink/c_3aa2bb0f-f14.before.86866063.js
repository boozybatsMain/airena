function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en) return;
  const d = en.dist;
  const dmg = me.skills.includes('k3') ? 'k3' : null;
  const stun = me.skills.includes('k2') ? 'k2' : null;
  const dash = me.skills.includes('k1') ? 'k1' : null;

  const K = n => me.kit && me.kit[n] ? me.kit[n] : null;
  const reach = n => {
    const k = K(n);
    if (!k) return 0;
    if (k.range != null) return k.range + (en.radius || 1.5);
    if (k.distance != null) return k.distance + (me.radius || 1.5) + (en.radius || 1.5);
    return 4;
  };

  if (me.stunned || me.busy) {
    if (!me.busy) api.moveTo(en.x, en.z);
    return;
  }

  const aim = { x: en.x + en.vx * 0.3, z: en.z + en.vz * 0.3 };

  // In melee range: hit
  if (dmg && d <= reach(dmg) - 0.3 && en.visible && !en.airborne && api.ready(dmg)) {
    api.use(dmg, aim);
    api.moveTo(en.x, en.z);
    return;
  }
  if (stun && d <= reach(stun) - 0.3 && en.visible && !en.airborne && api.ready(stun) &&
      !(en.immune && en.immune.includes('act'))) {
    api.use(stun, aim);
    api.moveTo(en.x, en.z);
    return;
  }
  // Gap close with dash
  if (dash && api.ready(dash) && en.visible && d > reach(dmg || 'k3') && d < reach(dash) - 1) {
    api.use(dash, aim);
    return;
  }

  api.moveTo(en.x, en.z);
  api.faceAt(en.x, en.z);
  if (p.t < 1) api.say("Come closer. It's quicker that way.");
}