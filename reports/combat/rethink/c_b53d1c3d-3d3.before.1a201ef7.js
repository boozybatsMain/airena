function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en.alive) return;

  const k1 = me.kit.k1, k2 = me.kit.k2, k3 = me.kit.k3;
  const d = en.dist;
  const vis = en.visible;

  // dodge incoming bolts with blink
  let danger = false;
  for (const pr of p.arena.projectiles) {
    if (pr.mine) continue;
    const rel = { x: me.x - pr.x, z: me.z - pr.z };
    const sp = Math.hypot(pr.vx, pr.vz) || 1;
    const dir = { x: pr.vx / sp, z: pr.vz / sp };
    const t = rel.x * dir.x + rel.z * dir.z;
    if (t < 0 || t > sp * pr.left + 1) continue;
    const perp = Math.abs(rel.x * dir.z - rel.z * dir.x);
    if (perp < 2.6 && t < 9) danger = true;
  }

  if (danger && api.ready('k2')) {
    const side = V.perp(V.toward(me, en));
    api.use('k2', side.x, side.z);
    api.say("Not today.");
    return;
  }

  // facing
  if (vis) api.faceAt(en.x, en.z);
  else {
    const path = api.pathTo(en.x, en.z);
    if (path && path.points && path.points.length) api.faceAt(path.points[0].x, path.points[0].z);
    else api.faceAt(en.x, en.z);
  }

  // attacks
  if (vis && !me.busy) {
    const r3 = (k3 && k3.range ? k3.range : 18) + 3.5;
    const r1 = (k1 && k1.range ? k1.range : 24) + 3;
    if (d < r3 && api.ready('k3')) {
      const aim = V.lead(me, en, { x: en.vx, z: en.vz }, k3.speed || 22);
      api.use('k3', { x: aim.x, z: aim.z });
    } else if (d < r1 && api.ready('k1')) {
      const aim = V.lead(me, en, { x: en.vx, z: en.vz }, 0);
      api.use('k1', { x: en.x + en.vx * 0.7, z: en.z + en.vz * 0.7 });
    }
  }

  // movement: keep mid range, strafe
  const want = 11;
  const toE = V.toward(me, en);
  let dir;
  if (!vis) {
    api.moveTo(en.x, en.z);
    return;
  }
  const strafeSign = (Math.floor(p.t / 1.7) % 2 === 0) ? 1 : -1;
  const perp = V.scale(V.perp(toE), strafeSign);
  if (d > want + 2) dir = V.add(toE, V.scale(perp, 0.6));
  else if (d < want - 3) dir = V.add(V.scale(toE, -1), V.scale(perp, 0.6));
  else dir = perp;

  const nx = me.x + dir.x * 3, nz = me.z + dir.z * 3;
  if (Math.abs(nx) > 18.5 || Math.abs(nz) > 18.5) dir = V.toward(me, { x: 0, z: 0 });
  api.move(dir.x, dir.z);
}