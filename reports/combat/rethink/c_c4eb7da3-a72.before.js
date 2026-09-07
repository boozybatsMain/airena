function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en.alive) return;
  const kit = me.kit || {};
  const names = me.skills || [];
  const bolt = names.find(n => kit[n] && kit[n].kind === 'bolt') || names.find(n => kit[n] && kit[n].speed && kit[n].range);
  const blink = names.find(n => kit[n] && kit[n].kind === 'blink');
  const zone = names.find(n => kit[n] && kit[n].kind === 'zone');
  const dist = en.dist;

  // dodge incoming projectiles
  let threat = null;
  for (const pr of (p.arena.projectiles || [])) {
    if (pr.mine) continue;
    const rel = { x: me.x - pr.x, z: me.z - pr.z };
    const v = { x: pr.vx, z: pr.vz };
    const vl = V.len(v) || 1;
    const t = V.dot(rel, v) / (vl * vl);
    if (t < 0 || t > (pr.left || 0) + 0.1) continue;
    const cp = { x: pr.x + pr.vx * t, z: pr.z + pr.vz * t };
    if (V.dist(cp, me) < 2.6) { threat = v; break; }
  }

  if (threat) {
    const side = V.perp(V.norm(threat));
    const cand = { x: me.x + side.x * 4, z: me.z + side.z * 4 };
    const cand2 = { x: me.x - side.x * 4, z: me.z - side.z * 4 };
    const pick = (Math.abs(cand.x) < 18 && Math.abs(cand.z) < 18) ? cand : cand2;
    if (blink && api.ready(blink)) { api.use(blink, pick); api.faceAt(en.x, en.z); return; }
    api.move(pick.x - me.x, pick.z - me.z);
    api.faceAt(en.x, en.z);
    return;
  }

  // avoid enemy zones
  for (const z of (p.arena.zones || [])) {
    if (z.mine) continue;
    if (V.dist(z, me) < z.r + me.radius + 0.5) {
      const away = V.away(me, z);
      api.move(away.x, away.z);
      api.faceAt(en.x, en.z);
      return;
    }
  }

  api.faceAt(en.x, en.z);

  const boltRange = bolt ? (kit[bolt].range || 18) + 3 : 0;

  if (bolt && en.visible && dist < boltRange && api.ready(bolt)) {
    const speed = kit[bolt].speed || 22;
    const aim = V.lead(me, en, { x: en.vx, z: en.vz }, speed);
    if (api.los(aim.x, aim.z)) { api.use(bolt, aim); }
  } else if (zone && en.visible && dist < (kit[zone].range || 12) + 2 && api.ready(zone)) {
    const w = kit[zone].windup || 0.47;
    const aim = { x: en.x + en.vx * w * 0.7, z: en.z + en.vz * w * 0.7 };
    api.use(zone, aim);
  } else if (blink && api.ready(blink) && me.hp < 120 && dist < 5) {
    const away = V.away(me, en);
    api.use(blink, { x: me.x + away.x * 6, z: me.z + away.z * 6 });
  }

  // positioning: keep mid range with LOS
  const ideal = 10;
  if (!en.visible) {
    api.moveTo(en.x, en.z);
  } else if (dist > ideal + 2) {
    api.moveTo(en.x, en.z);
  } else if (dist < ideal - 3) {
    const away = V.away(me, en);
    const t = { x: me.x + away.x * 5, z: me.z + away.z * 5 };
    api.move(t.x - me.x, t.z - me.z);
  } else {
    const side = V.perp(V.toward(me, en));
    const sgn = ((p.tick / 90) | 0) % 2 ? 1 : -1;
    const t = { x: me.x + side.x * 5 * sgn, z: me.z + side.z * 5 * sgn };
    if (Math.abs(t.x) > 18 || Math.abs(t.z) > 18) api.move(-side.x * sgn, -side.z * sgn);
    else api.move(side.x * sgn, side.z * sgn);
  }

  if (p.tick % 150 === 0) api.say("Hold still. This will only take a moment.");
}