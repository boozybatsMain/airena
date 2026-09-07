function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en.alive) return;

  const kit = me.kit || {};
  const k1 = kit.k1, k2 = kit.k2, k3 = kit.k3;
  const d = en.dist;

  // reach for cone skills
  const reachOf = (k) => (k && k.range ? k.range + en.radius : 4.9);

  const toEnemy = V.toward(me, en);

  // Face enemy generally
  api.faceAt(en.x, en.z);

  // Dodge their cone: if they are casting a cone and we're close, back off / jump
  const theirCast = en.casting;
  const theyTelegraph = theirCast && theirCast.telegraph;

  if (theyTelegraph && d < 6 && k3 && api.ready('k3')) {
    const ck = en.kit && en.kit[theirCast.skill];
    const isCone = !ck || ck.kind === 'fan' || ck.kind === 'cone' || (ck.range && ck.range < 6);
    if (isCone) {
      api.use('k3');
      api.say("Up and over!");
      return;
    }
  }

  // Attack window
  const r1 = reachOf(k1), r2 = reachOf(k2);

  if (en.visible && !me.busy && !en.airborne) {
    if (d <= r2 - 0.4 && api.ready('k2')) {
      api.use('k2', { x: en.x, z: en.z });
      api.move(toEnemy.x, toEnemy.z);
      return;
    }
    if (d <= r1 - 0.4 && api.ready('k1')) {
      api.use('k1', { x: en.x, z: en.z });
      api.move(toEnemy.x, toEnemy.z);
      return;
    }
  }

  // Speed boost when closing from afar
  if (!me.busy && api.ready('k3') && d > 8 && !theyTelegraph) {
    api.use('k3');
  }

  // Movement
  const bothCdSoon = api.cooldown('k1') > 0.35 && api.cooldown('k2') > 0.35;

  if (en.rooted || (en.casting && en.casting.telegraph === false)) {
    api.moveTo(en.x, en.z);
    return;
  }

  if (d < r1 + 0.2 && bothCdSoon) {
    // kite out of their reach while our strikes recharge
    const away = V.away(me, en);
    const side = V.perp(away);
    const dir = V.norm(V.add(V.scale(away, 1.0), V.scale(side, 0.6)));
    let tx = me.x + dir.x * 5, tz = me.z + dir.z * 5;
    tx = Math.max(-18.5, Math.min(18.5, tx));
    tz = Math.max(-18.5, Math.min(18.5, tz));
    api.move(tx - me.x, tz - me.z);
    return;
  }

  api.moveTo(en.x, en.z);
}