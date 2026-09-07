function think(p, api) {
  const me = p.self, e = p.enemy;
  if (!me.alive || !e || !e.alive) return;
  if (me.stunned || me.busy) return;

  const d = e.dist;
  const k1 = me.kit.k1, k2 = me.kit.k2, k3 = me.kit.k3;

  // talk
  if (p.t > 1 && !said) { said = true; api.say("Come closer. I bite."); }

  api.faceAt(e.x, e.z);

  // stun dash when in range and visible
  if (k3 && api.ready('k3') && e.visible && d < 9.5 && d > 2.0 &&
      !(e.immune && e.immune.indexOf('act') >= 0)) {
    api.use('k3', { x: e.x, z: e.z });
    return;
  }

  // melee cone
  if (k1 && api.ready('k1') && d < 4.4 && e.visible && !e.airborne) {
    api.use('k1', { x: e.x, z: e.z });
    return;
  }

  // gap closer damage dash
  if (k2 && api.ready('k2') && e.visible && d < 9.5 && d > 3.5) {
    api.use('k2', { x: e.x, z: e.z });
    return;
  }

  // movement
  if (d > 4.0 || !e.visible) {
    api.moveTo(e.x, e.z);
  } else {
    // orbit slightly to stay near but not stuck
    const t = V.toward({ x: me.x, z: me.z }, { x: e.x, z: e.z });
    const per = V.perp(t);
    const s = (Math.floor(p.t) % 4 < 2) ? 1 : -1;
    const dir = V.add(V.scale(t, 0.35), V.scale(per, s * 0.9));
    api.move(dir.x, dir.z);
  }
}

let said = false;