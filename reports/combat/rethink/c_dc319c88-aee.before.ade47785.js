function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en) return;

  const kit = me.kit || {};
  let bolt = null, beam = null, boost = null;
  for (const n of (me.skills || [])) {
    const k = kit[n];
    if (!k) continue;
    const eff = JSON.stringify(k.effects || '');
    if (k.kind === 'bolt' || (k.speed && k.range && k.aim === 'point')) { if (!bolt) bolt = n; }
    if (k.kind === 'beam') { if (!beam) beam = n; }
    if (k.aim === 'none' && /boost/.test(eff)) { if (!boost) boost = n; }
  }
  if (!bolt) for (const n of (me.skills || [])) { const k = kit[n]; if (k && k.speed && !boost) { bolt = n; break; } }

  const d = en.dist;
  const vis = en.visible;

  // keep boost up
  if (boost && api.ready(boost) && !me.busy) {
    api.use(boost);
    api.remember('t', p.t);
    return;
  }

  const aimPt = () => {
    const k = kit[bolt];
    const sp = k && k.speed ? k.speed : 22;
    const wu = (k && k.windup) || 0.37;
    const pos = { x: en.x + en.vx * wu, z: en.z + en.vz * wu };
    return V.lead({ x: me.x, z: me.z }, pos, { x: en.vx, z: en.vz }, sp);
  };

  // dodge incoming projectiles
  let strafe = null;
  for (const pr of (p.arena.projectiles || [])) {
    if (pr.mine) continue;
    const rel = { x: me.x - pr.x, z: me.z - pr.z };
    const v = { x: pr.vx, z: pr.vz };
    const vl = V.len(v);
    if (vl < 0.1) continue;
    const u = V.scale(v, 1 / vl);
    const along = V.dot(rel, u);
    if (along < 0 || along > vl * (pr.left + 0.1)) continue;
    const perp = V.sub(rel, V.scale(u, along));
    if (V.len(perp) < 3.2) {
      const pp = V.perp(u);
      const s = V.dot(perp, pp) >= 0 ? 1 : -1;
      strafe = V.scale(pp, s);
    }
  }

  if (vis) api.faceAt(en.x, en.z);

  // fire
  if (!me.busy) {
    if (beam && vis && d < ((kit[beam].range || 24) + 2.5) && api.ready(beam)) {
      api.use(beam, { x: en.x, z: en.z });
      return;
    }
    if (bolt && vis && d < ((kit[bolt].range || 18) + 3) && api.ready(bolt)) {
      const a = aimPt();
      api.use(bolt, { x: a.x, z: a.z });
      return;
    }
  }

  if (strafe) { api.move(strafe.x, strafe.z); return; }

  if (!vis) { api.moveTo(en.x, en.z); return; }

  // orbit at good range
  const want = 12;
  const to = V.toward({ x: me.x, z: me.z }, { x: en.x, z: en.z });
  const side = V.perp(to);
  const sgn = ((p.t | 0) % 6 < 3) ? 1 : -1;
  let dir = V.add(V.scale(side, sgn * 1.0), V.scale(to, (d - want) * 0.35));
  const nx = me.x + dir.x * 2, nz = me.z + dir.z * 2;
  if (Math.abs(nx) > 18 || Math.abs(nz) > 18) dir = V.scale(V.norm({ x: -me.x, z: -me.z }), 1);
  api.move(dir.x, dir.z);
}