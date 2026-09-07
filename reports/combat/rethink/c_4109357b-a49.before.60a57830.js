function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en) return;

  const d = en.dist;
  const lead = (speed) => {
    const t = 0.5;
    return { x: en.x + en.vx * t * 0.8, z: en.z + en.vz * t * 0.8 };
  };

  // pick skills dynamically
  const names = me.skills || [];
  const kit = me.kit || {};
  let lob = null, discs = [];
  for (const n of names) {
    const k = kit[n];
    if (!k) continue;
    if (k.kind === 'lob' || k.speed) lob = lob || n;
    else discs.push(n);
  }
  if (!lob && names.length) lob = names[0];

  const aim = lead();
  const clampPt = (pt, rng) => {
    const dx = pt.x - me.x, dz = pt.z - me.z;
    const L = Math.hypot(dx, dz) || 1;
    const r = Math.min(L, rng);
    return { x: me.x + dx / L * r, z: me.z + dz / L * r };
  };

  // combat: keep mid range, use everything on cooldown
  if (!me.busy && en.visible) {
    if (lob && api.ready(lob)) {
      const rng = (kit[lob] && kit[lob].range) || 15;
      if (d < rng + 3) {
        api.use(lob, clampPt(aim, rng));
      }
    } else {
      for (const n of discs) {
        const k = kit[n] || {};
        const rng = k.range || 12;
        if (api.ready(n) && d < rng + 3.5) {
          api.use(n, clampPt(aim, rng));
          break;
        }
      }
    }
  }

  // movement: avoid enemy zones, hold ~7m, strafe
  let target = null;
  const zones = (p.arena.zones || []).filter(z => !z.mine);
  let danger = null;
  for (const z of zones) {
    const dd = Math.hypot(z.x - me.x, z.z - me.z);
    if (dd < z.r + me.radius + 1.2) danger = z;
  }
  if (danger) {
    const away = V.norm({ x: me.x - danger.x, z: me.z - danger.z });
    target = { x: me.x + away.x * 5, z: me.z + away.z * 5 };
  } else {
    const desired = 7.5;
    const toE = V.toward(me, en);
    const side = V.perp(toE);
    const sign = (Math.floor(p.t / 2.2) % 2) ? 1 : -1;
    let dir;
    if (!en.visible) {
      target = { x: en.x, z: en.z };
    } else if (d > desired + 1.5) {
      dir = V.add(toE, V.scale(side, sign * 0.5));
      target = { x: me.x + dir.x * 4, z: me.z + dir.z * 4 };
    } else if (d < desired - 1.5) {
      dir = V.add(V.scale(toE, -1), V.scale(side, sign * 0.6));
      target = { x: me.x + dir.x * 4, z: me.z + dir.z * 4 };
    } else {
      target = { x: me.x + side.x * sign * 4, z: me.z + side.z * sign * 4 };
    }
  }

  const h = 19;
  target.x = Math.max(-h, Math.min(h, target.x));
  target.z = Math.max(-h, Math.min(h, target.z));

  if (!en.visible) api.moveTo(target.x, target.z);
  else api.move(target.x - me.x, target.z - me.z);
  api.faceAt(en.x, en.z);

  if (p.t > 1 && p.t < 1.2) api.say("Stand still. It only takes one good shell.");
}