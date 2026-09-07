function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en.alive) return;

  const kit = me.kit || {};
  const names = me.skills || [];
  // classify skills by kind
  let boost = null, beam = null, bolt = null;
  for (const n of names) {
    const k = kit[n]; if (!k) continue;
    const eff = (k.effects || []).join(',');
    if (k.kind === 'self' || k.aim === 'none') { if (eff.indexOf('boost') >= 0 || k.kind === 'self') boost = n; }
    else if (k.kind === 'beam') beam = n;
    else if (k.kind === 'bolt' || k.speed) bolt = n;
    else if (!beam) beam = n;
  }

  const d = en.dist;
  const dirToE = V.toward(me, en);

  // boost whenever ready
  if (boost && api.ready(boost) && !me.busy) {
    api.use(boost);
    api.say("Faster.");
  }

  // aim helpers
  const beamK = beam ? kit[beam] : null;
  const boltK = bolt ? kit[bolt] : null;
  const beamReach = beamK ? (beamK.range || 20) + 3.0 : 0;
  const boltReach = boltK ? (boltK.range || 16) + 3.5 : 0;

  const canSee = en.visible;

  if (!me.busy && canSee) {
    if (beam && api.ready(beam) && d <= beamReach) {
      api.use(beam, { x: en.x + en.vx * 0.7, z: en.z + en.vz * 0.7 });
    } else if (bolt && api.ready(bolt) && d <= boltReach) {
      const spd = boltK.speed || 22;
      const lead = V.lead(me, en, { x: en.vx, z: en.vz }, spd);
      api.use(bolt, { x: lead.x, z: lead.z });
    }
  }

  // dodge incoming projectiles
  let dodge = null;
  for (const pr of (p.arena.projectiles || [])) {
    if (pr.mine) continue;
    const rel = { x: me.x - pr.x, z: me.z - pr.z };
    const v = { x: pr.vx, z: pr.vz };
    const vl = V.len(v); if (vl < 0.01) continue;
    const u = V.scale(v, 1 / vl);
    const along = V.dot(rel, u);
    if (along < 0 || along > vl * (pr.left || 1) + 2) continue;
    const perp = V.sub(rel, V.scale(u, along));
    if (V.len(perp) < 3.2) {
      let side = V.perp(u);
      if (V.dot(side, perp) < 0) side = V.scale(side, -1);
      dodge = side;
    }
  }

  const ideal = beam ? Math.min(beamReach - 4, 14) : 10;

  if (dodge) {
    api.move(dodge.x, dodge.z);
  } else if (!canSee) {
    api.moveTo(en.x, en.z);
  } else {
    // strafe at ideal range
    const err = d - ideal;
    let radial = V.scale(dirToE, err > 1 ? 1 : (err < -1 ? -1 : 0));
    let side = V.perp(dirToE);
    if (!think._s || p.t - think._st > 2.2) { think._s = api.rand() < 0.5 ? 1 : -1; think._st = p.t; }
    side = V.scale(side, think._s);
    let mv = V.add(V.scale(radial, 1.0), V.scale(side, 0.9));
    // avoid walls
    const nx = me.x + mv.x * 3, nz = me.z + mv.z * 3;
    if (Math.abs(nx) > 18 || Math.abs(nz) > 18) { think._s = -think._s; mv = V.sub(V.scale(radial, 1.0), V.scale(side, 0.9)); }
    if (V.len(mv) < 0.05) mv = side;
    api.move(mv.x, mv.z);
  }

  api.faceAt(en.x, en.z);
}