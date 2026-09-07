function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en.alive) return;
  const d = en.dist;
  const kit = me.kit || {};
  const bolt = kit.k3, dash = kit.k1, blink = kit.k2;

  // dodge incoming projectiles
  let dodge = null;
  for (const pr of (p.arena.projectiles || [])) {
    if (pr.mine || pr.arc) continue;
    const rel = { x: me.x - pr.x, z: me.z - pr.z };
    const v = { x: pr.vx, z: pr.vz };
    const vl = V.len(v) || 1;
    const t = V.dot(rel, { x: v.x / vl, z: v.z / vl });
    if (t < 0 || t > vl * pr.left + 2) continue;
    const perp = { x: rel.x - v.x / vl * t, z: rel.z - v.z / vl * t };
    if (V.len(perp) < 2.6) {
      dodge = V.len(perp) > 0.01 ? V.norm(perp) : V.perp(V.norm(v));
    }
  }

  if (me.busy && me.casting && me.casting.phase !== 'windup') {
    // let it run
  }

  const toE = V.toward(me, en);
  api.faceAt(en.x, en.z);

  // blink use: escape when enemy dashing at us, or gap-close boost
  const enCast = en.casting;
  if (dodge && api.ready('k2')) {
    api.use('k2', dodge.x, dodge.z);
    api.move(dodge.x, dodge.z);
    api.say('Not today.');
    return;
  }
  if (enCast && enCast.telegraph && d < 12 && api.ready('k2') && enCast.skill && (en.kit[enCast.skill] || {}).kind === 'dash') {
    const side = V.perp(toE);
    api.use('k2', side.x, side.z);
    api.move(side.x, side.z);
    return;
  }

  // bolt when in range and visible
  const bRange = bolt ? (bolt.range || 18) : 18;
  if (api.ready('k3') && en.visible && d < bRange + 2) {
    const aim = V.lead(me, en, { x: en.vx, z: en.vz }, bolt ? bolt.speed || 22 : 22);
    if (api.los(aim.x, aim.z) || api.los(en.x, en.z)) {
      api.use('k3', aim);
      if (d > 7) api.move(toE.x, toE.z);
      else { const s = V.perp(toE); api.move(s.x, s.z); }
      return;
    }
  }

  // dash when close
  const dRange = dash ? (dash.distance || 8) : 8;
  if (api.ready('k1') && en.visible && d < dRange + 2 && d > 2) {
    api.use('k1', { x: en.x, z: en.z });
    api.say('Burn.');
    return;
  }

  // boost blink to close distance if far and skills down
  if (api.ready('k2') && d > 10 && en.visible && !api.ready('k3')) {
    const tgt = V.add(me, V.scale(toE, Math.min(6.5, d - 5)));
    api.use('k2', tgt);
    api.move(toE.x, toE.z);
    return;
  }

  // positioning: hold mid range ~9m
  if (!en.visible) {
    api.moveTo(en.x, en.z);
  } else if (d > 10) {
    api.move(toE.x, toE.z);
  } else if (d < 5) {
    const away = V.away(me, en);
    const s = V.norm(V.add(away, V.scale(V.perp(toE), 0.8)));
    api.move(s.x, s.z);
  } else {
    const s = V.perp(toE);
    const sign = ((p.tick / 60) | 0) % 2 ? 1 : -1;
    let mv = { x: s.x * sign, z: s.z * sign };
    const nx = me.x + mv.x * 4, nz = me.z + mv.z * 4;
    if (Math.abs(nx) > 18 || Math.abs(nz) > 18) mv = { x: -mv.x, z: -mv.z };
    api.move(mv.x, mv.z);
  }
}