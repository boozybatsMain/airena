function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en.alive) return;

  const K = me.kit || {};
  const names = me.skills || [];
  // classify skills by delivery
  let melee = null, zone = null, selfBuff = null;
  for (const n of names) {
    const k = K[n];
    if (!k) continue;
    const kind = k.kind || '';
    if (kind === 'self' || (k.effects && k.effects.some && k.effects.some(e => /shield|heal/.test(String(e))))) {
      if (!selfBuff) selfBuff = n;
    } else if (kind === 'zone' || k.aim === 'point') {
      if (!zone) zone = n;
    } else {
      if (!melee) melee = n;
    }
  }
  if (!melee) melee = names[0];

  const d = en.dist;
  const meleeRange = (K[melee] && (K[melee].range || 3.4) + en.radius) || 4.9;
  const zoneRange = (K[zone] && K[zone].range) || 12;

  // memory of enemy velocity for leading
  const toE = V.toward(me, en);

  // Facing
  api.faceAt(en.x, en.z);

  // Self buff when hurt or before engaging
  const missing = me.maxHp - me.hp;
  if (selfBuff && api.ready(selfBuff) && (missing > 25 || (d < 8 && me.shield <= 0))) {
    api.use(selfBuff);
  } else if (melee && api.ready(melee) && d <= meleeRange * 0.92 && en.visible && !en.invulnerable) {
    api.use(melee, { x: en.x, z: en.z });
  } else if (zone && api.ready(zone) && en.visible && d <= zoneRange && d > 1) {
    // lead the enemy a bit: windup time
    const w = (K[zone] && K[zone].windup) || 0.47;
    const px = en.x + en.vx * w * 0.8;
    const pz = en.z + en.vz * w * 0.8;
    api.use(zone, { x: px, z: pz });
  }

  // avoid enemy zones
  let flee = null;
  for (const z of (p.arena.zones || [])) {
    if (z.mine) continue;
    const dd = Math.hypot(me.x - z.x, me.z - z.z);
    if (dd < z.r + me.radius + 1.2) {
      flee = V.norm({ x: me.x - z.x, z: me.z - z.z });
    }
  }

  if (flee) {
    api.move(flee.x, flee.z);
  } else if (!en.visible) {
    const path = api.pathTo(en.x, en.z);
    if (path && path.points && path.points.length) {
      const n0 = path.points[0];
      api.moveTo(n0.x, n0.z);
    } else api.moveTo(en.x, en.z);
  } else {
    // kite: stay near melee range edge, strafe
    const strafe = V.perp(toE);
    const sgn = ((p.tick >> 5) & 1) ? 1 : -1;
    let want;
    if (d > meleeRange * 0.85) {
      want = { x: toE.x + strafe.x * sgn * 0.5, z: toE.z + strafe.z * sgn * 0.5 };
    } else if (d < meleeRange * 0.5) {
      want = { x: -toE.x * 0.8 + strafe.x * sgn, z: -toE.z * 0.8 + strafe.z * sgn };
    } else {
      want = { x: strafe.x * sgn + toE.x * 0.2, z: strafe.z * sgn + toE.z * 0.2 };
    }
    // keep off walls
    const nx = me.x + want.x * 3, nz = me.z + want.z * 3;
    if (Math.abs(nx) > 18.5) want.x = -Math.sign(me.x) * 0.8;
    if (Math.abs(nz) > 18.5) want.z = -Math.sign(me.z) * 0.8;
    api.move(want.x, want.z);
  }

  if (p.tick % 150 === 0) api.say(me.hp > en.hp ? "Keep still. It ends faster." : "Still standing.");
}