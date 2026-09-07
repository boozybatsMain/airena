function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en.alive) return;

  const kit = me.kit || {};
  const names = me.skills || [];
  let zoneA = null, zoneB = null, cone = null;
  for (const n of names) {
    const k = kit[n];
    if (!k) continue;
    if (k.kind === 'cone' || (k.range && k.range <= 5 && k.aim === 'facing')) { if (!cone) cone = n; }
    else if (k.aim === 'point') { if (!zoneA) zoneA = n; else if (!zoneB) zoneB = n; }
    else if (!cone) cone = n;
  }

  const d = en.dist;
  const toE = V.toward(me, en);

  if (p.t > 1 && (p.tick % 90 === 0)) api.say("Come closer. The floor is hot.");

  // predicted enemy position for zones
  const lead = 0.55;
  let aim = { x: en.x + en.vx * lead, z: en.z + en.vz * lead };
  const half = p.arena.half - 1.6;
  aim.x = Math.max(-half, Math.min(half, aim.x));
  aim.z = Math.max(-half, Math.min(half, aim.z));

  api.faceAt(en.x, en.z);

  if (!me.busy && !me.stunned && !me.silenced) {
    // cone burn when close
    const coneK = cone ? kit[cone] : null;
    if (cone && api.ready(cone) && coneK && d <= (coneK.range || 3.4) + en.radius - 0.4 && en.visible && !en.airborne) {
      api.use(cone, { x: en.x, z: en.z });
    } else if (zoneA && api.ready(zoneA) && d <= (kit[zoneA].range || 12) + 2 && en.visible) {
      api.use(zoneA, aim);
    } else if (zoneB && api.ready(zoneB) && d <= (kit[zoneB].range || 12) + 2 && en.visible) {
      api.use(zoneB, aim);
    }
  }

  // movement: avoid standing in enemy zones, close to cone range
  let danger = null;
  for (const z of p.arena.zones || []) {
    if (z.mine) continue;
    const dd = V.dist(me, z);
    if (dd < z.r + me.radius + 0.6) { danger = z; break; }
  }
  if (danger) {
    const out = V.norm(V.sub(me, danger));
    const dir = out.x === 0 && out.z === 0 ? toE : out;
    api.move(dir.x, dir.z);
    return;
  }

  const desired = cone ? 2.6 : 8;
  if (!en.visible) {
    api.moveTo(en.x, en.z);
  } else if (d > desired + 1.2) {
    api.moveTo(en.x, en.z);
  } else if (d < desired - 1.0) {
    const away = V.away(me, en);
    api.move(away.x, away.z);
  } else {
    // strafe
    const s = V.perp(toE);
    const sign = (Math.floor(p.t * 0.7) % 2) ? 1 : -1;
    api.move(s.x * sign + toE.x * 0.2, s.z * sign + toE.z * 0.2);
  }
}