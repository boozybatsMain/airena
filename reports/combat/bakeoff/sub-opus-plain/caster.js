function think(p, api) {
  const me = p.self, e = p.enemy;
  if (!me.alive || !e.alive) return;

  const kit = me.kit || {};
  const names = me.skills || [];
  const k = (n) => kit[n] || {};
  const find = (pred) => names.find(n => pred(k(n)));

  const heal = find(s => s.kind === 'self' || (s.effects && (s.effects.includes('heal') || s.effects.includes('shield'))));
  const zone = find(s => s.kind === 'zone');
  const lob = find(s => s.kind === 'lob' || s.kind === 'bolt' || s.kind === 'beam' || s.kind === 'mortar');

  const d = e.dist;
  const clampArena = (pt) => ({
    x: Math.max(-18.1, Math.min(18.1, pt.x)),
    z: Math.max(-18.1, Math.min(18.1, pt.z))
  });

  // --- defensive: use self skill when hurt or shield down and enemy close
  if (heal && api.ready(heal)) {
    const hurt = me.hp / me.maxHp < 0.72;
    const threat = (d < 12 && e.casting && e.casting.telegraph) || me.burning || d < 6;
    if (hurt || threat) {
      api.use(heal);
      api.say("Patch and press.");
    }
  }

  // --- offensive
  const zr = (k(zone).range || 12);
  const lr = (k(lob).range || 15);

  if (!me.busy) {
    if (lob && api.ready(lob) && d < lr + 2.5) {
      const sp = k(lob).speed || 12;
      const wind = k(lob).windup || 0.5;
      let aim = V.lead({ x: me.x, z: me.z }, { x: e.x, z: e.z }, { x: e.vx, z: e.vz }, sp);
      // add wind-up travel
      aim = { x: aim.x + e.vx * wind * 0.6, z: aim.z + e.vz * wind * 0.6 };
      let dir = V.sub(aim, { x: me.x, z: me.z });
      let dist = V.len(dir);
      if (dist > lr) aim = V.add({ x: me.x, z: me.z }, V.scale(V.norm(dir), lr));
      api.use(lob, clampArena(aim));
    } else if (zone && api.ready(zone) && d < zr + 3) {
      const wind = k(zone).windup || 0.47;
      let aim = { x: e.x + e.vx * (wind + 0.15), z: e.z + e.vz * (wind + 0.15) };
      let dir = V.sub(aim, { x: me.x, z: me.z });
      if (V.len(dir) > zr) aim = V.add({ x: me.x, z: me.z }, V.scale(V.norm(dir), zr));
      api.use(zone, clampArena(aim));
    }
  }

  // --- movement: kite at good range, keep LOS
  const ideal = Math.min(lr, 12) * 0.62 + 3;
  const toE = V.toward({ x: me.x, z: me.z }, { x: e.x, z: e.z });
  let mv;

  if (!e.visible) {
    const path = api.pathTo(e.x, e.z);
    if (path && path.points && path.points.length) {
      const nxt = path.points[0];
      mv = V.norm(V.sub(nxt, { x: me.x, z: me.z }));
    } else mv = toE;
  } else {
    const strafe = V.perp(toE);
    const sign = (Math.floor(p.t / 2.2) % 2 === 0) ? 1 : -1;
    let radial;
    if (d < ideal - 1.5) radial = V.scale(toE, -1.1);
    else if (d > ideal + 1.5) radial = V.scale(toE, 1.1);
    else radial = V.scale(toE, 0);
    mv = V.add(radial, V.scale(strafe, sign * 0.9));
    // dodge enemy zones
    for (const z of p.arena.zones || []) {
      if (z.mine) continue;
      const dz = V.sub({ x: me.x, z: me.z }, { x: z.x, z: z.z });
      const l = V.len(dz);
      if (l < z.r + me.radius + 1.5) mv = V.add(mv, V.scale(V.norm(dz), 2.2));
    }
  }

  // wall repulsion
  const H = p.arena.half - 2.2;
  if (me.x > H) mv = V.add(mv, { x: -1.2, z: 0 });
  if (me.x < -H) mv = V.add(mv, { x: 1.2, z: 0 });
  if (me.z > H) mv = V.add(mv, { x: 0, z: -1.2 });
  if (me.z < -H) mv = V.add(mv, { x: 0, z: 1.2 });

  if (V.len(mv) < 0.01) mv = V.perp(toE);
  api.move(mv.x, mv.z);
  api.faceAt(e.x, e.z);
}