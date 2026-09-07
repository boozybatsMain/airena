function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en.alive) return;

  const k1 = me.kit.k1, k2 = me.kit.k2, k3 = me.kit.k3;
  const d = en.dist;

  // cleanse / boost
  if (k3 && api.ready('k3')) {
    if (me.burning || me.rooted || me.stunned || me.silenced || me.blinded) {
      api.use('k3');
    } else if (!me.busy && d < 12 && p.t > 1) {
      api.use('k3');
    }
  }

  // dodge incoming bolts
  let dodge = null;
  for (const pr of p.arena.projectiles) {
    if (pr.mine || pr.arc) continue;
    const rel = { x: me.x - pr.x, z: me.z - pr.z };
    const v = { x: pr.vx, z: pr.vz };
    const sp = V.len(v);
    if (sp < 0.1) continue;
    const u = V.norm(v);
    const along = V.dot(rel, u);
    if (along < 0 || along > sp * pr.left + 2) continue;
    const perp = V.len(V.sub(rel, V.scale(u, along)));
    if (perp < 2.6) {
      const side = V.perp(u);
      const sign = V.dot(rel, side) >= 0 ? 1 : -1;
      dodge = V.scale(side, sign);
    }
  }

  // melee cone
  const meleeReach = (k1 && k1.range ? k1.range : 3.4) + en.radius;
  if (api.ready('k1') && en.visible && d < meleeReach - 0.3 && !en.invulnerable) {
    api.use('k1', { x: en.x, z: en.z });
  } else if (api.ready('k2') && en.visible && d < (k2 && k2.range ? k2.range : 18) + 1) {
    const spd = k2 && k2.speed ? k2.speed : 22;
    const aim = V.lead({ x: me.x, z: me.z }, { x: en.x, z: en.z }, { x: en.vx, z: en.vz }, spd);
    if (api.los(aim.x, aim.z)) api.use('k2', aim);
    else api.use('k2', { x: en.x, z: en.z });
  }

  // movement
  if (dodge) {
    api.move(dodge.x, dodge.z);
    api.faceAt(en.x, en.z);
    return;
  }

  const enemyMelee = en.casting && en.casting.telegraph && en.kit[en.casting.skill] &&
    en.kit[en.casting.skill].kind === 'cone';

  if (enemyMelee && d < 6) {
    const away = V.away({ x: me.x, z: me.z }, { x: en.x, z: en.z });
    const s = V.norm(V.add(away, V.scale(V.perp(away), 0.8)));
    api.move(s.x, s.z);
    api.faceAt(en.x, en.z);
    return;
  }

  api.faceAt(en.x, en.z);
  const k1cd = api.cooldown('k1');
  if (d < meleeReach - 0.5 && k1cd > 0.5) {
    // back off while cone recharges
    const away = V.away({ x: me.x, z: me.z }, { x: en.x, z: en.z });
    const t = V.norm(V.add(away, V.scale(V.perp(away), 1.1)));
    api.move(t.x, t.z);
  } else {
    api.moveTo(en.x, en.z);
  }

  if (p.t < 0.3) api.say('Blue burns bright.');
}