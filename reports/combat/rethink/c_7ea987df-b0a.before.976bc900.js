function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en.alive) return;
  const d = en.dist;
  const kit = me.kit || {};
  const names = me.skills || [];
  const K = n => kit[n] || {};
  // classify by delivery kind
  let cone = null, bolt = null, zone = null;
  for (const n of names) {
    const k = K(n);
    if (!k.kind) continue;
    if (k.kind === 'cone' || k.kind === 'fan') cone = cone || n;
    else if (k.kind === 'bolt' || k.kind === 'beam' || k.kind === 'mortar') bolt = bolt || n;
    else if (k.kind === 'zone' || k.kind === 'disc') zone = zone || n;
  }
  const dodge = api.recall('dodge', 0);

  // avoid enemy zones
  let flee = null;
  for (const z of p.arena.zones || []) {
    if (z.mine) continue;
    const dz = Math.hypot(me.x - z.x, me.z - z.z);
    if (dz < z.r + me.radius + 1.2) flee = V.norm({ x: me.x - z.x, z: me.z - z.z });
  }

  // dodge incoming bolts
  for (const pr of p.arena.projectiles || []) {
    if (pr.mine || pr.arc) continue;
    const rel = { x: me.x - pr.x, z: me.z - pr.z };
    const v = V.norm({ x: pr.vx, z: pr.vz });
    const along = V.dot(rel, v);
    if (along < 0 || along > 20) continue;
    const perpD = Math.abs(rel.x * v.z - rel.z * v.x);
    if (perpD < 3.2) {
      const side = (rel.x * v.z - rel.z * v.x) >= 0 ? 1 : -1;
      flee = { x: v.z * side, z: -v.x * side };
    }
  }

  api.faceAt(en.x, en.z);

  // attack decisions
  if (!me.busy && !me.silenced && !me.stunned) {
    if (cone && d <= (K(cone).range || 3.4) + en.radius - 0.3 && en.visible && api.ready(cone)) {
      api.use(cone, { x: en.x, z: en.z });
    } else if (bolt && en.visible && api.ready(bolt)) {
      const k = K(bolt);
      const reach = (k.range || 18);
      if (d < reach) {
        const aim = V.lead({ x: me.x, z: me.z }, { x: en.x, z: en.z }, { x: en.vx, z: en.vz }, k.speed || 22);
        api.use(bolt, aim);
      }
    } else if (zone && api.ready(zone)) {
      const k = K(zone);
      if (d < (k.range || 12) + 2) {
        const t = 0.5;
        api.use(zone, { x: en.x + en.vx * t, z: en.z + en.vz * t });
      }
    }
  }

  // movement
  if (flee) {
    api.move(flee.x, flee.z);
  } else if (!en.visible) {
    api.moveTo(en.x, en.z);
  } else {
    const want = cone ? 2.6 : 8;
    if (d > want + 1.2) api.moveTo(en.x, en.z);
    else if (d < want - 1.2) {
      const a = V.away({ x: me.x, z: me.z }, { x: en.x, z: en.z });
      api.move(a.x, a.z);
    } else {
      const t = V.toward({ x: me.x, z: me.z }, { x: en.x, z: en.z });
      const s = (Math.floor(p.t / 1.5) % 2) ? 1 : -1;
      const strafe = { x: -t.z * s, z: t.x * s };
      const nx = me.x + strafe.x * 3, nz = me.z + strafe.z * 3;
      if (Math.abs(nx) > 18 || Math.abs(nz) > 18) api.move(-strafe.x, -strafe.z);
      else api.move(strafe.x, strafe.z);
    }
  }

  if (p.t < 0.2) api.say("Come closer. I bite.");
  api.remember('dodge', dodge);
}