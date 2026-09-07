function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en) return;

  const d = en.dist;
  const kit = me.kit || {};
  const k1 = kit.k1, k2 = kit.k2, k3 = kit.k3;

  if (p.t < 0.2) api.say("Let's dance.");

  // dodge incoming bolts
  let dodge = null;
  for (const pr of (p.arena.projectiles || [])) {
    if (pr.mine || pr.arc) continue;
    const rel = { x: me.x - pr.x, z: me.z - pr.z };
    const sp = Math.hypot(pr.vx, pr.vz) || 1;
    const dir = { x: pr.vx / sp, z: pr.vz / sp };
    const along = rel.x * dir.x + rel.z * dir.z;
    if (along < 0 || along > sp * (pr.left + 0.1)) continue;
    const lat = rel.x * dir.z - rel.z * dir.x;
    if (Math.abs(lat) < 3.2) {
      const side = lat >= 0 ? 1 : -1;
      dodge = { x: dir.z * side, z: -dir.x * side };
    }
  }

  const rootedEnemy = en.rooted;
  const canAct = !me.busy && !me.stunned && !me.silenced;

  // aim lead for bolt
  const doBolt = () => {
    if (!k1 || !api.ready('k1')) return false;
    const sp = k1.speed || 22, rng = k1.range || 18;
    if (d > rng + 2) return false;
    const wind = k1.windup || 0.37;
    const fut = { x: en.x + en.vx * wind, z: en.z + en.vz * wind };
    const aim = V.lead({ x: me.x, z: me.z }, fut, { x: en.vx, z: en.vz }, sp);
    if (!api.los(en.x, en.z)) return false;
    api.use('k1', aim);
    return true;
  };

  const doZone = () => {
    if (!k3 || !api.ready('k3')) return false;
    const rng = k3.range || 12;
    if (d > rng + 2) return false;
    const wind = k3.windup || 0.47;
    let tx = en.x + en.vx * wind * 1.2, tz = en.z + en.vz * wind * 1.2;
    const dx = tx - me.x, dz = tz - me.z;
    const dd = Math.hypot(dx, dz) || 1;
    if (dd > rng) { tx = me.x + dx / dd * rng; tz = me.z + dz / dd * rng; }
    api.use('k3', { x: tx, z: tz });
    return true;
  };

  const doWall = () => {
    if (!k2 || !api.ready('k2')) return false;
    const rng = k2.range || 15;
    let dist = Math.min(Math.max(d, 4), rng);
    api.use('k2', { x: en.x, z: en.z });
    return true;
  };

  if (canAct) {
    if (rootedEnemy || en.busy) {
      if (!doBolt()) if (!doZone()) doWall();
    } else if (d < 14) {
      if (!doZone()) if (!doBolt()) doWall();
    } else {
      if (!doBolt()) doWall();
    }
  }

  // movement
  api.faceAt(en.x, en.z);
  if (dodge) {
    api.move(dodge.x, dodge.z);
    return;
  }

  // avoid own/enemy zones
  let flee = null;
  for (const z of (p.arena.zones || [])) {
    if (z.mine) continue;
    const dz = Math.hypot(me.x - z.x, me.z - z.z);
    if (dz < z.r + me.radius + 1.2) flee = V.norm({ x: me.x - z.x, z: me.z - z.z });
  }
  if (flee) { api.move(flee.x, flee.z); return; }

  const want = 9.5;
  if (!api.los(en.x, en.z)) {
    api.moveTo(en.x, en.z);
  } else if (d > want + 1.5) {
    api.moveTo(en.x, en.z);
  } else if (d < want - 2.5) {
    const away = V.away({ x: me.x, z: me.z }, { x: en.x, z: en.z });
    let tx = me.x + away.x * 5, tz = me.z + away.z * 5;
    tx = Math.max(-18, Math.min(18, tx)); tz = Math.max(-18, Math.min(18, tz));
    api.move(tx - me.x, tz - me.z);
  } else {
    const t = p.t;
    const per = V.perp(V.toward({ x: me.x, z: me.z }, { x: en.x, z: en.z }));
    const s = Math.sin(t * 0.7) > 0 ? 1 : -1;
    let tx = me.x + per.x * s * 4, tz = me.z + per.z * s * 4;
    if (Math.abs(tx) > 17 || Math.abs(tz) > 17) { tx = me.x - per.x * s * 4; tz = me.z - per.z * s * 4; }
    api.move(tx - me.x, tz - me.z);
  }
}