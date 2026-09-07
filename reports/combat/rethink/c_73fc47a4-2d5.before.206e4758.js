function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en) return;

  const d = en.dist;
  const dirToEnemy = V.toward(me, en);
  const k2 = me.kit && me.kit.k2;
  const k3 = me.kit && me.kit.k3;

  // dodge incoming projectiles
  let dodge = null;
  for (const pr of p.arena.projectiles || []) {
    if (pr.mine) continue;
    const rel = { x: me.x - pr.x, z: me.z - pr.z };
    const v = { x: pr.vx, z: pr.vz };
    const vl = V.len(v);
    if (vl < 0.01) continue;
    const u = V.scale(v, 1 / vl);
    const along = V.dot(rel, u);
    if (along < 0 || along > vl * (pr.left + 0.1)) continue;
    const perp = V.sub(rel, V.scale(u, along));
    if (V.len(perp) < 3.2) {
      dodge = V.len(perp) < 0.2 ? V.perp(u) : V.norm(perp);
    }
  }

  if (dodge) {
    if (api.ready('k1') && me.cooldowns.k1 === 0) {
      api.use('k1', dodge.x, dodge.z);
      api.faceAt(en.x, en.z);
      return;
    }
    api.move(dodge.x, dodge.z);
    api.faceAt(en.x, en.z);
    return;
  }

  api.faceAt(en.x, en.z);

  const visible = en.visible;

  // dash finisher / close punish
  if (!me.busy && api.ready('k3') && visible && d < 10 && d > 2.5) {
    api.use('k3', { x: en.x, z: en.z });
    return;
  }

  // bolt
  if (!me.busy && api.ready('k2') && visible && d < 19) {
    const speed = (k2 && k2.speed) || 22;
    const aim = V.lead(me, en, { x: en.vx, z: en.vz }, speed);
    api.use('k2', aim);
    return;
  }

  // blink for speed boost / closing
  if (!me.busy && api.ready('k1') && (me.maxSpeed <= 5.9) && d > 8) {
    api.use('k1', { x: me.x + dirToEnemy.x * 6, z: me.z + dirToEnemy.z * 6 });
    return;
  }

  // movement: kite at mid range
  let target;
  if (!visible || d > 14) {
    target = { x: en.x, z: en.z };
    api.moveTo(target.x, target.z);
  } else {
    const ideal = 8;
    const strafe = V.perp(dirToEnemy);
    const sign = ((Math.floor(p.t / 2.5) % 2) === 0) ? 1 : -1;
    let dir = V.scale(strafe, sign);
    if (d > ideal + 1.5) dir = V.norm(V.add(dir, V.scale(dirToEnemy, 1.1)));
    else if (d < ideal - 1.5) dir = V.norm(V.add(dir, V.scale(dirToEnemy, -1.1)));
    const nx = me.x + dir.x * 3, nz = me.z + dir.z * 3;
    const lim = p.arena.half - 2.5;
    if (Math.abs(nx) > lim || Math.abs(nz) > lim) {
      dir = V.norm({ x: -me.x, z: -me.z });
    }
    api.move(dir.x, dir.z);
  }
}