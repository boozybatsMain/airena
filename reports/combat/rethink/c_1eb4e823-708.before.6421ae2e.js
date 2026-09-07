function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en) return;

  const kit = me.kit || {};
  const names = me.skills || [];
  // classify by delivery
  let bolt = null, zone = null, cone = null;
  for (const n of names) {
    const k = kit[n];
    if (!k) continue;
    const kind = k.kind || '';
    if (kind === 'zone' || k.ticks) { if (!zone) zone = n; }
    else if (kind === 'cone' || kind === 'fan' || k.halfAngle) { if (!cone) cone = n; }
    else if (k.speed || kind === 'bolt' || kind === 'beam' || kind === 'mortar') { if (!bolt) bolt = n; }
    else if (!cone) cone = n;
  }

  const dist = en.dist;
  const toEnemy = V.toward(me, en);

  // dodge incoming projectiles
  let dodge = null;
  for (const pr of (p.arena.projectiles || [])) {
    if (pr.mine) continue;
    const rel = { x: me.x - pr.x, z: me.z - pr.z };
    const v = { x: pr.vx, z: pr.vz };
    const sp = V.len(v);
    if (sp < 0.01) continue;
    const u = V.scale(v, 1 / sp);
    const along = V.dot(rel, u);
    if (along < 0 || along > sp * (pr.left || 1) + 2) continue;
    const perp = V.len(V.sub(rel, V.scale(u, along)));
    if (perp < 3.2) {
      const side = V.perp(u);
      const s = V.dot(rel, side) >= 0 ? 1 : -1;
      dodge = V.scale(side, s);
      break;
    }
  }

  // avoid enemy zones
  let flee = null;
  for (const z of (p.arena.zones || [])) {
    if (z.mine) continue;
    const d = V.dist(me, z);
    if (d < z.r + me.radius + 0.8) flee = V.norm(V.sub(me, z));
  }

  api.faceAt(en.x, en.z);

  // Offense
  if (!me.busy) {
    const coneReach = cone ? ((kit[cone].range || 3.4) + en.radius) : 0;
    if (cone && dist <= coneReach - 0.3 && en.visible && api.ready(cone) && !en.airborne) {
      api.use(cone, { x: en.x, z: en.z });
    } else if (bolt && en.visible && api.ready(bolt)) {
      const k = kit[bolt];
      const reach = (k.range || 18) + 3;
      if (dist <= reach) {
        const aim = k.speed ? V.lead(me, en, { x: en.vx, z: en.vz }, k.speed) : { x: en.x, z: en.z };
        if (api.los(aim.x, aim.z)) api.use(bolt, aim);
      }
    } else if (zone && api.ready(zone)) {
      const k = kit[zone];
      const rng = k.range || 12;
      if (dist <= rng + (k.radius || 3)) {
        const lead = { x: en.x + en.vx * 0.5, z: en.z + en.vz * 0.5 };
        let d = V.dist(me, lead);
        let pt = lead;
        if (d > rng) pt = V.add(me, V.scale(V.toward(me, lead), rng));
        api.use(zone, pt);
      }
    }
  }

  // Movement
  const desiredRange = cone ? 2.2 : 8;
  if (dodge) {
    api.move(dodge.x + toEnemy.x * 0.3, dodge.z + toEnemy.z * 0.3);
  } else if (flee) {
    api.move(flee.x, flee.z);
  } else if (!en.visible) {
    api.moveTo(en.x, en.z);
  } else if (dist > desiredRange + 1.5) {
    api.moveTo(en.x, en.z);
  } else if (dist < desiredRange - 1) {
    api.move(-toEnemy.x, -toEnemy.z);
  } else {
    // strafe
    const s = ((p.tick >> 5) & 1) ? 1 : -1;
    const sd = V.perp(toEnemy);
    api.move(sd.x * s + toEnemy.x * 0.25, sd.z * s + toEnemy.z * 0.25);
  }

  if (p.tick % 150 === 0) api.say("Close in. Burn them down.");
}