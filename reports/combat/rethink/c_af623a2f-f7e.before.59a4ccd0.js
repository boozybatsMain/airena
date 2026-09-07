function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en.alive) return;

  const dist = en.dist;
  const kit = me.kit || {};
  const names = me.skills || [];

  // pick skills by kind
  let zone = null, lob = null, selfBuff = null;
  for (const n of names) {
    const k = kit[n];
    if (!k) continue;
    const kind = k.kind || '';
    if (k.aim === 'none' || kind === 'self') selfBuff = selfBuff || n;
    else if (k.speed && k.splash) lob = lob || n;
    else if (k.radius && k.ticks) zone = zone || n;
    else if (!lob && k.speed) lob = lob || n;
    else if (!zone) zone = n;
  }

  const lead = (sp) => V.lead({ x: me.x, z: me.z }, { x: en.x, z: en.z }, { x: en.vx, z: en.vz }, sp || 12);

  // healing / shield when hurt or when nothing else to do
  const hurt = me.hp < me.maxHp * 0.75;
  const clampArena = (pt) => ({
    x: Math.max(-18.2, Math.min(18.2, pt.x)),
    z: Math.max(-18.2, Math.min(18.2, pt.z))
  });

  let acted = false;

  if (!me.busy) {
    if (lob && api.ready(lob) && en.visible !== false) {
      const k = kit[lob];
      const rng = k.range || 15;
      const aim = clampArena(lead(k.speed || 12));
      const d = V.dist({ x: me.x, z: me.z }, aim);
      if (d <= rng - 0.3 && d >= 3.4) {
        api.use(lob, aim);
        acted = true;
      }
    }
    if (!acted && zone && api.ready(zone)) {
      const k = kit[zone];
      const rng = k.range || 12;
      const aim = clampArena(lead(0));
      // predict slightly ahead
      const a2 = clampArena({ x: en.x + en.vx * 0.55, z: en.z + en.vz * 0.55 });
      const d = V.dist({ x: me.x, z: me.z }, a2);
      if (d <= rng - 0.2 && en.visible !== false) {
        api.use(zone, a2);
        acted = true;
      } else if (d <= rng - 0.2) {
        api.use(zone, aim);
        acted = true;
      }
    }
    if (!acted && selfBuff && api.ready(selfBuff)) {
      if (hurt || me.burning || (me.shield || 0) <= 0.1) {
        api.use(selfBuff);
        acted = true;
      }
    }
  }

  // Movement: keep mid range, dodge zones
  const idealMin = 7, idealMax = 12;
  let target = null;

  // avoid enemy zones
  let danger = null;
  for (const z of p.arena.zones || []) {
    if (z.mine) continue;
    const d = Math.hypot(z.x - me.x, z.z - me.z);
    if (d < z.r + me.radius + 1.5) { danger = z; break; }
  }

  if (danger) {
    const away = V.norm({ x: me.x - danger.x, z: me.z - danger.z });
    if (away.x === 0 && away.z === 0) away.x = 1;
    api.move(away.x, away.z);
  } else {
    const toE = V.toward({ x: me.x, z: me.z }, { x: en.x, z: en.z });
    const side = V.perp(toE);
    const sign = ((p.t * 0.5) % 2 < 1) ? 1 : -1;
    let dir;
    if (dist > idealMax) dir = V.add(toE, V.scale(side, 0.35 * sign));
    else if (dist < idealMin) dir = V.add(V.scale(toE, -1), V.scale(side, 0.5 * sign));
    else dir = V.add(side, V.scale(toE, 0.1 * sign));
    // wall avoidance
    const nx = me.x + dir.x * 4, nz = me.z + dir.z * 4;
    if (Math.abs(nx) > 17.5 || Math.abs(nz) > 17.5) {
      dir = V.norm({ x: -me.x, z: -me.z });
    }
    api.move(dir.x, dir.z);
  }

  api.faceAt(en.x, en.z);

  if (p.tick % 150 === 0) api.say("Burn slow, stay far.");
}