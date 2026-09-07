function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en) return;

  const k1 = me.kit.k1, k2 = me.kit.k2, k3 = me.kit.k3;
  const d = en.dist;

  // dodge incoming bolts
  let threat = null;
  for (const pr of p.arena.projectiles) {
    if (pr.mine) continue;
    const rel = { x: me.x - pr.x, z: me.z - pr.z };
    const sp = Math.hypot(pr.vx, pr.vz) || 1;
    const dir = { x: pr.vx / sp, z: pr.vz / sp };
    const t = rel.x * dir.x + rel.z * dir.z;
    if (t < 0 || t > sp * pr.left + 2) continue;
    const perp = Math.abs(rel.x * dir.z - rel.z * dir.x);
    if (perp < 2.4 && t < 9) { threat = { dir, perp, t }; break; }
  }

  if (threat && api.ready('k2') && threat.t < 6) {
    const side = V.perp(threat.dir);
    api.use('k2', { x: me.x + side.x * 6.5, z: me.z + side.z * 6.5 });
    api.face(en.x - me.x, en.z - me.z);
    return;
  }

  // enemy casting a beam/bolt at me -> sidestep
  const enemyCasting = en.casting && en.casting.telegraph;

  const canSee = en.visible;

  // Offense
  if (canSee && !me.busy) {
    if (d <= 20 && api.ready('k3')) {
      const kit = me.kit.k3;
      const aim = V.lead({ x: me.x, z: me.z }, { x: en.x, z: en.z }, { x: en.vx, z: en.vz }, kit.speed || 22);
      api.use('k3', aim);
      strafe(p, api, d, enemyCasting);
      return;
    }
    if (d <= 25 && api.ready('k1')) {
      api.use('k1', { x: en.x, z: en.z });
      strafe(p, api, d, enemyCasting);
      return;
    }
  }

  if (!canSee) {
    api.moveTo(en.x, en.z);
    api.faceAt(en.x, en.z);
    return;
  }

  strafe(p, api, d, enemyCasting);
  api.faceAt(en.x, en.z);
}

function strafe(p, api, d, dodging) {
  const me = p.self, en = p.enemy;
  const to = V.toward({ x: me.x, z: me.z }, { x: en.x, z: en.z });
  const side = V.perp(to);
  const s = (Math.floor(p.t * 0.7) % 2 === 0) ? 1 : -1;
  let radial = 0;
  if (d > 15) radial = 1;
  else if (d < 8) radial = -1;
  let dir = {
    x: to.x * radial + side.x * s * 1.1,
    z: to.z * radial + side.z * s * 1.1
  };
  let tx = me.x + dir.x * 5, tz = me.z + dir.z * 5;
  const h = p.arena.half - 2.5;
  if (Math.abs(tx) > h || Math.abs(tz) > h) {
    tx = me.x - dir.x * 5; tz = me.z - dir.z * 5;
  }
  tx = Math.max(-h, Math.min(h, tx));
  tz = Math.max(-h, Math.min(h, tz));
  api.moveTo(tx, tz);
}