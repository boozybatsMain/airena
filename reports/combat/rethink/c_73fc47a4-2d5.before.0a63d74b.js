function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en.alive) return;

  const bolt = me.kit.k2, dash = me.kit.k3, blink = me.kit.k1;
  const d = en.dist;
  const toE = V.toward(me, en);

  if (p.t < 0.2) api.say("Let's dance.");

  // face enemy by default
  api.faceAt(en.x, en.z);

  // dodge incoming projectiles
  let dodge = null;
  for (const pr of p.arena.projectiles) {
    if (pr.mine) continue;
    const rel = { x: me.x - pr.x, z: me.z - pr.z };
    const v = { x: pr.vx, z: pr.vz };
    const vl = V.len(v);
    if (vl < 0.01) continue;
    const u = V.scale(v, 1 / vl);
    const along = V.dot(rel, u);
    if (along < 0 || along > vl * (pr.left + 0.1)) continue;
    const perp = V.len(V.sub(rel, V.scale(u, along)));
    if (perp < 2.6) {
      const side = V.perp(u);
      const s = V.dot(rel, side) >= 0 ? 1 : -1;
      dodge = V.scale(side, s);
    }
  }

  const canSee = en.visible;

  // blink usage: escape when low or dodge, or gap-close boost
  if (api.ready('k1') && blink) {
    if (dodge && d < 14) {
      api.use('k1', { x: me.x + dodge.x * 6.5, z: me.z + dodge.z * 6.5 });
      api.move(dodge.x, dodge.z);
      return;
    }
    if (me.blinded || me.rooted || me.silenced || me.burning) {
      api.use('k1', { x: me.x + toE.x * 4, z: me.z + toE.z * 4 });
      return;
    }
    if (canSee && d > 12 && d < 26) {
      api.use('k1', { x: en.x, z: en.z });
      return;
    }
  }

  // dash attack when in reach
  if (api.ready('k3') && canSee && d < 10.5 && !en.invulnerable) {
    const lead = { x: en.x + en.vx * 0.35, z: en.z + en.vz * 0.35 };
    api.use('k3', lead);
    return;
  }

  // bolt when in range and visible
  if (api.ready('k2') && canSee && d < 20) {
    const aim = V.lead(me, en, { x: en.vx, z: en.vz }, bolt ? bolt.speed : 22);
    if (api.los(aim.x, aim.z)) {
      api.use('k2', aim);
      // keep strafing
      const s = V.perp(toE);
      api.move(toE.x * 0.5 + s.x * 0.6, toE.z * 0.5 + s.z * 0.6);
      return;
    }
  }

  // movement
  if (dodge) {
    api.move(dodge.x, dodge.z);
    return;
  }

  if (!canSee || d > 12) {
    api.moveTo(en.x, en.z);
  } else {
    // orbit at mid range
    const s = V.perp(toE);
    const flip = (Math.floor(p.t / 2.5) % 2) ? 1 : -1;
    const want = d < 7 ? -0.5 : 0.5;
    api.move(toE.x * want + s.x * flip, toE.z * want + s.z * flip);
  }
}