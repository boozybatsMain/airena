function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en.alive) return;

  const dist = en.dist;
  const kit = me.kit || {};
  const k1 = kit.k1, k2 = kit.k2, k3 = kit.k3;

  // dodge incoming projectiles
  let dodge = null;
  for (const pr of (p.arena.projectiles || [])) {
    if (pr.mine) continue;
    const rel = { x: me.x - pr.x, z: me.z - pr.z };
    const v = { x: pr.vx, z: pr.vz };
    const vl = V.len(v);
    if (vl < 0.01) continue;
    const u = V.scale(v, 1 / vl);
    const along = V.dot(rel, u);
    if (along < -1 || along > vl * (pr.left || 1) + 2) continue;
    const perp = V.len(V.sub(rel, V.scale(u, along)));
    if (perp < 2.6) {
      const side = V.perp(u);
      const sgn = V.dot(rel, side) >= 0 ? 1 : -1;
      dodge = V.scale(side, sgn);
    }
  }

  const toEnemy = V.toward(me, en);
  const facingOk = Math.abs(V.angleTo(me.heading, toEnemy)) < 0.25;

  // shoot
  if (!me.busy && !me.silenced && !me.stunned) {
    if (k3 && api.ready('k3') && en.visible && dist < (k3.range || 24) + 2 && !en.invulnerable) {
      const lead = { x: en.x + en.vx * 0.7, z: en.z + en.vz * 0.7 };
      api.use('k3', lead);
      api.say("Hold still.");
    } else if (k1 && api.ready('k1') && en.visible && dist < (k1.range || 18) + 2 && !en.invulnerable) {
      const sp = k1.speed || 22;
      const aim = V.lead({ x: me.x, z: me.z }, { x: en.x, z: en.z }, { x: en.vx, z: en.vz }, sp);
      api.use('k1', aim);
    } else if (k2 && api.ready('k2') && (dodge || (en.casting && en.casting.telegraph && dist < 20))) {
      const d = dodge || V.perp(toEnemy);
      api.use('k2', { x: me.x + d.x * 6, z: me.z + d.z * 6 });
    }
  }

  // facing
  if (en.visible) api.faceAt(en.x, en.z);
  else api.face(toEnemy.x, toEnemy.z);

  // movement
  const ideal = 14;
  if (dodge) {
    api.move(dodge.x * 0.8 + toEnemy.x * 0.2, dodge.z * 0.8 + toEnemy.z * 0.2);
  } else if (!en.visible) {
    api.moveTo(en.x, en.z);
  } else if (dist > ideal + 3) {
    api.moveTo(en.x, en.z);
  } else if (dist < 8) {
    const away = V.away(me, en);
    const side = V.perp(toEnemy);
    let d = V.add(V.scale(away, 0.8), V.scale(side, 0.6));
    const nx = me.x + d.x * 4, nz = me.z + d.z * 4;
    if (Math.abs(nx) > 18 || Math.abs(nz) > 18) d = V.sub(d, V.scale(side, 1.2));
    api.move(d.x, d.z);
  } else {
    const side = V.perp(toEnemy);
    const sgn = (Math.floor(p.t / 2.5) % 2) ? 1 : -1;
    let d = V.scale(side, sgn);
    const nx = me.x + d.x * 5, nz = me.z + d.z * 5;
    if (Math.abs(nx) > 18 || Math.abs(nz) > 18) d = V.scale(d, -1);
    api.move(d.x, d.z);
  }
}