function think(p, api) {
  const me = p.self, e = p.enemy;
  if (!me.alive || !e.alive) return;

  const dist = e.dist;
  const toE = { x: e.x, z: e.z };

  // predict enemy position slightly ahead (windup ~0.47s)
  const lead = (t) => ({ x: e.x + e.vx * t, z: e.z + e.vz * t });

  // shield when threatened
  if (api.ready('k3') && !me.busy) {
    const threat = (e.casting && e.casting.telegraph && dist < 16) ||
      (me.shield <= 0 && dist < 8) ||
      (p.burn > 0 && me.shield <= 0);
    if (threat) {
      api.use('k3');
    }
  }

  const canSee = e.visible;

  // k2: damage + root, main tool
  if (!me.busy && api.ready('k2') && canSee && dist < 14.5) {
    const aim = lead(0.5);
    api.use('k2', aim);
  } else if (!me.busy && api.ready('k1') && canSee && dist < 14.5) {
    const aim = lead(0.5);
    api.use('k1', aim);
  }

  // movement: kite at mid range, stay in own zone edge
  let target;
  if (!canSee) {
    target = toE;
    const path = api.pathTo(e.x, e.z);
    if (path && path.points && path.points.length) {
      target = path.points[0];
    }
    api.moveTo(target.x, target.z);
  } else {
    // avoid enemy zones
    let flee = null;
    for (const z of p.arena.zones) {
      if (z.mine) continue;
      const d = Math.hypot(me.x - z.x, me.z - z.z);
      if (d < z.r + me.radius + 1.2) {
        flee = V.norm({ x: me.x - z.x, z: me.z - z.z });
      }
    }
    if (flee && !me.rooted) {
      api.move(flee.x, flee.z);
    } else {
      const desired = 8.5;
      const dir = V.toward({ x: me.x, z: me.z }, toE);
      const perp = V.perp(dir);
      const side = (Math.floor(p.t / 3) % 2 === 0) ? 1 : -1;
      let mv;
      if (dist > desired + 1.5) mv = V.add(dir, V.scale(perp, 0.4 * side));
      else if (dist < desired - 1.5) mv = V.add(V.scale(dir, -1), V.scale(perp, 0.5 * side));
      else mv = V.scale(perp, side);
      // keep off walls
      const nx = me.x + mv.x * 3, nz = me.z + mv.z * 3;
      if (Math.abs(nx) > 18 || Math.abs(nz) > 18) {
        mv = V.toward({ x: me.x, z: me.z }, { x: 0, z: 0 });
      }
      api.move(mv.x, mv.z);
    }
  }

  api.faceAt(e.x, e.z);

  if (!said && p.t > 1) {
    said = true;
    api.say("Stand still. The ground has plans for you.");
  }
}

let said = false;