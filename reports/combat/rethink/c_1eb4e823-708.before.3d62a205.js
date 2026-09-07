function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en) return;
  const d = en.dist;
  const kit = me.kit || {};
  const bolt = pick(kit, 'bolt');
  const cone = pick(kit, 'cone');
  const zone = pick(kit, 'zone');

  if (p.t < 0.2) api.say("Blue burns first.");

  // dodge incoming projectiles
  let dodge = null;
  for (const pr of (p.arena.projectiles || [])) {
    if (pr.mine) continue;
    const rel = { x: me.x - pr.x, z: me.z - pr.z };
    const sp = Math.hypot(pr.vx, pr.vz) || 1;
    const dir = { x: pr.vx / sp, z: pr.vz / sp };
    const along = rel.x * dir.x + rel.z * dir.z;
    if (along < 0 || along > sp * pr.left + 2) continue;
    const perp = Math.abs(rel.x * dir.z - rel.z * dir.x);
    if (perp < 3.2) {
      const side = (rel.x * dir.z - rel.z * dir.x) >= 0 ? 1 : -1;
      dodge = { x: dir.z * side, z: -dir.x * side };
    }
  }

  // avoid enemy zones
  let inZone = null;
  for (const z of (p.arena.zones || [])) {
    if (z.mine) continue;
    if (Math.hypot(me.x - z.x, me.z - z.z) < z.r + me.radius + 0.6) inZone = z;
  }

  const canSee = en.visible;

  // Actions
  if (!me.busy) {
    if (cone && api.ready(cone) && d <= 4.4 && canSee) {
      api.use(cone, { x: en.x, z: en.z });
    } else if (zone && api.ready(zone) && d <= (kit[zone].range || 12) && canSee) {
      const lead = V.lead({ x: me.x, z: me.z }, { x: en.x, z: en.z }, { x: en.vx, z: en.vz }, 12);
      api.use(zone, { x: lead.x, z: lead.z });
    } else if (bolt && api.ready(bolt) && canSee && d <= (kit[bolt].range || 18)) {
      const sp = kit[bolt].speed || 22;
      const aim = V.lead({ x: me.x, z: me.z }, { x: en.x, z: en.z }, { x: en.vx, z: en.vz }, sp);
      api.use(bolt, aim);
    }
  }

  // Movement
  if (dodge) {
    api.move(dodge.x, dodge.z);
  } else if (inZone) {
    const a = V.away({ x: me.x, z: me.z }, { x: inZone.x, z: inZone.z });
    api.move(a.x, a.z);
  } else if (!canSee) {
    api.moveTo(en.x, en.z);
  } else {
    const want = 3.0;
    const t = V.toward({ x: me.x, z: me.z }, { x: en.x, z: en.z });
    if (d > want + 1.2) api.move(t.x, t.z);
    else if (d < want - 0.8) api.move(-t.x, -t.z);
    else {
      const s = V.perp(t);
      const sign = (Math.floor(p.t * 0.7) % 2) ? 1 : -1;
      let mx = s.x * sign, mz = s.z * sign;
      if (Math.abs(me.x + mx * 3) > 18) mx = -mx;
      if (Math.abs(me.z + mz * 3) > 18) mz = -mz;
      api.move(mx, mz);
    }
  }
  api.faceAt(en.x, en.z);
}

function pick(kit, kind) {
  for (const k in kit) if (kit[k] && kit[k].kind === kind) return k;
  return null;
}