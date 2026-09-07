function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!en.alive) { api.stop(); return; }

  // react to enemy wind-ups: their k2/k3 are cancellable, dash toward/away
  const d = en.dist;

  // heal/shield when hurt
  if (me.hp / me.maxHp < 0.55 && api.ready('k3')) { api.use('k3'); }

  // avoid arena burn pressure after 30s: fight more aggressively
  const burnOn = p.burn > 0;

  const los = en.visible;

  if (!los) {
    // seek enemy
    api.moveTo(en.x, en.z);
    api.faceAt(en.x, en.z);
    return;
  }

  // threat: enemy casting
  if (en.casting && en.casting.telegraph) {
    const sk = en.casting.skill;
    const w = en.kit[sk] ? en.kit[sk].windup : 0;
    if (sk === 'k1') {
      // dash incoming: sidestep if close
      if (d < 9) {
        const away = V.away(me, en);
        const per = V.perp(away);
        const s = (api.rand() < 0.5 ? 1 : -1);
        api.move(V.add(V.scale(away, 0.5), V.scale(per, s)));
        api.faceAt(en.x, en.z);
        return;
      }
    }
  }

  // close in with dash when it will connect
  if (api.ready('k1') && d > 3.5 && d < 10.5) {
    api.use('k1', { x: en.x, z: en.z });
    return;
  }

  // stun cone when in range
  if (api.ready('k2') && d < 4.6) {
    api.use('k2', { x: en.x, z: en.z });
    return;
  }

  // engage or kite
  if (d > 4.2 || burnOn) {
    api.moveTo(en.x, en.z);
    api.faceAt(en.x, en.z);
  } else {
    // orbit at close range
    const away = V.away(me, en);
    const per = V.perp(away);
    const s = (Math.floor(p.t) % 4 < 2) ? 1 : -1;
    const dir = V.norm(V.add(V.scale(away, 0.35), V.scale(per, s)));
    api.move(dir);
    api.faceAt(en.x, en.z);
  }
}