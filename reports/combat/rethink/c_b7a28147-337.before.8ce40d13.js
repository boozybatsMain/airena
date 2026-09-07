function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en.alive) return;
  const d = en.dist;

  // heal when hurt and safe-ish
  const hurt = me.hp < me.maxHp * 0.6;
  if (api.ready('k2') && (hurt || me.hp < me.maxHp * 0.85) && (d > 6 || me.shield <= 0)) {
    if (me.hp < me.maxHp * 0.9) {
      api.use('k2');
      api.faceAt(en.x, en.z);
      if (d < 5) api.move(-(en.x - me.x), -(en.z - me.z)); else api.moveTo(en.x, en.z);
      return;
    }
  }

  // melee cone
  if (d < 4.6 && api.ready('k3') && en.y < 0.35 && p.self.busy === false) {
    api.use('k3', { x: en.x, z: en.z });
    api.move(en.x - me.x, en.z - me.z);
    if (api.rand() < 0.05) api.say("Close enough.");
    return;
  }

  // mortar
  if (api.ready('k1') && d < 17 && d > 3.5) {
    const kit = me.kit['k1'] || {};
    const sp = kit.speed || 12;
    const lead = V.lead({ x: me.x, z: me.z }, { x: en.x, z: en.z }, { x: en.vx, z: en.vz }, sp);
    api.use('k1', { x: lead.x, z: lead.z });
    api.faceAt(en.x, en.z);
    if (d > 5) api.moveTo(en.x, en.z);
    return;
  }

  api.faceAt(en.x, en.z);
  if (d > 4.2) {
    api.moveTo(en.x, en.z);
  } else if (d < 2.8) {
    api.move(me.x - en.x, me.z - en.z);
  } else {
    const t = V.toward({ x: me.x, z: me.z }, { x: en.x, z: en.z });
    const s = V.perp(t);
    const sign = (Math.floor(p.t) % 4 < 2) ? 1 : -1;
    api.move(s.x * sign, s.z * sign);
  }
}