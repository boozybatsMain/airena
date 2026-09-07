function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en.alive) return;
  const dist = en.dist;
  const bolt = 'k1', wall = 'k2', zone = 'k3';
  const K = me.kit || {};
  const boltRange = (K[bolt] && K[bolt].range) || 18;
  const zoneRange = (K[zone] && K[zone].range) || 12;

  // aim lead for bolt
  const bs = (K[bolt] && K[bolt].speed) || 22;
  const wu = (K[bolt] && K[bolt].windup) || 0.367;
  const lead = V.lead({ x: me.x, z: me.z }, { x: en.x, z: en.z }, { x: en.vx, z: en.vz }, bs);
  const leadPt = { x: en.x + en.vx * wu + (lead.x - en.x) * 0.9, z: en.z + en.vz * wu + (lead.z - en.z) * 0.9 };

  // dodge incoming projectiles
  let dodge = null;
  for (const pr of (p.arena.projectiles || [])) {
    if (pr.mine) continue;
    const rel = { x: me.x - pr.x, z: me.z - pr.z };
    const v = { x: pr.vx, z: pr.vz };
    const vl = V.len(v) || 1;
    const t = (rel.x * v.x + rel.z * v.z) / (vl * vl);
    if (t < 0 || t > (pr.left || 1)) continue;
    const cx = pr.x + v.x * t - me.x, cz = pr.z + v.z * t - me.z;
    if (Math.hypot(cx, cz) < 3.2) {
      const pd = V.perp(V.norm(v));
      const side = (rel.x * pd.x + rel.z * pd.z) >= 0 ? 1 : -1;
      dodge = { x: pd.x * side, z: pd.z * side };
    }
  }

  // avoid enemy zones
  let flee = null;
  for (const z of (p.arena.zones || [])) {
    if (z.mine) continue;
    const d = Math.hypot(me.x - z.x, me.z - z.z);
    if (d < z.r + me.radius + 1.2) flee = V.norm({ x: me.x - z.x, z: me.z - z.z });
  }

  api.faceAt(leadPt.x, leadPt.z);

  // offense
  if (!me.busy) {
    if (api.ready(bolt) && en.visible && dist < boltRange + 2.5) {
      api.use(bolt, leadPt);
    } else if (api.ready(zone) && dist < zoneRange + 2 && (en.rooted || en.busy || dist < 8)) {
      const zp = { x: en.x + en.vx * 0.5, z: en.z + en.vz * 0.5 };
      api.use(zone, zp);
    } else if (api.ready(wall) && en.casting && en.casting.telegraph && dist < 16 && en.visible) {
      api.use(wall, { x: en.x, z: en.z });
    } else if (api.ready(zone) && en.visible && dist < zoneRange) {
      api.use(zone, { x: en.x + en.vx * 0.5, z: en.z + en.vz * 0.5 });
    }
  }

  // movement: keep mid range, strafe
  const dir = V.toward({ x: me.x, z: me.z }, { x: en.x, z: en.z });
  let mv;
  if (dodge) mv = dodge;
  else if (flee) mv = flee;
  else {
    const want = 9;
    const radial = dist > want + 2 ? 1 : (dist < want - 3 ? -1 : 0);
    const sw = ((Math.floor(p.t / 2.2) % 2) === 0) ? 1 : -1;
    const perp = V.perp(dir);
    mv = { x: dir.x * radial + perp.x * sw * 0.9, z: dir.z * radial + perp.z * sw * 0.9 };
  }
  // keep off walls
  const h = p.arena.half - 2.5;
  if (me.x > h) mv.x -= 1.2; if (me.x < -h) mv.x += 1.2;
  if (me.z > h) mv.z -= 1.2; if (me.z < -h) mv.z += 1.2;

  if (!en.visible && dist > 4) {
    const path = api.pathTo(en.x, en.z);
    if (path && path.points && path.points.length) {
      const n = path.points[0];
      api.move(n.x - me.x, n.z - me.z);
    } else api.move(mv.x, mv.z);
  } else {
    api.move(mv.x, mv.z);
  }

  if (p.t < 0.2) api.say("Steel and distance. Come closer.");
}