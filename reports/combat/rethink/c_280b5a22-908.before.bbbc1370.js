function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en) return;
  const dist = en.dist;
  const k1 = me.kit.k1, k2 = me.kit.k2, k3 = me.kit.k3;

  if (p.t < 0.2) api.say("Let's dance.");

  // dodge incoming bolts
  let dodge = null;
  for (const pr of p.arena.projectiles) {
    if (pr.mine || pr.arc) continue;
    const rel = { x: me.x - pr.x, z: me.z - pr.z };
    const v = { x: pr.vx, z: pr.vz };
    const vl = V.len(v) || 1;
    const t = V.dot(rel, v) / (vl * vl);
    if (t < 0 || t > pr.left + 0.2) continue;
    const cp = { x: pr.x + pr.vx * t, z: pr.z + pr.vz * t };
    if (V.dist(cp, { x: me.x, z: me.z }) < 2.6) {
      const per = V.perp(V.norm(v));
      const side = V.dot(per, rel) >= 0 ? 1 : -1;
      dodge = V.scale(per, side);
    }
  }

  if (dodge) {
    api.move(dodge.x, dodge.z);
    api.faceAt(en.x, en.z);
    if (api.ready('k2') && me.cooldowns.k2 === 0) {
      api.use('k2', { x: me.x + dodge.x * 6, z: me.z + dodge.z * 6 });
    }
    return;
  }

  const canSee = en.visible;

  // bolt: main damage
  if (canSee && api.ready('k3') && dist < (k3 && k3.range ? k3.range + 2 : 18)) {
    const aim = V.lead({ x: me.x, z: me.z }, { x: en.x, z: en.z },
      { x: en.vx, z: en.vz }, (k3 && k3.speed) || 22);
    if (api.los(aim.x, aim.z)) {
      api.use('k3', aim);
      // keep spacing while casting
      if (dist < 6) api.move(me.x - en.x, me.z - en.z);
      else api.move(0, 0);
      return;
    }
  }

  // dash when close-ish
  if (canSee && api.ready('k1') && dist < 10.5 && dist > 3) {
    api.use('k1', { x: en.x, z: en.z });
    return;
  }

  // boost blink for mobility / closing
  if (api.ready('k2') && me.cooldowns.k2 === 0) {
    if (dist > 14 && canSee) {
      const d = V.toward({ x: me.x, z: me.z }, { x: en.x, z: en.z });
      api.use('k2', { x: me.x + d.x * 6, z: me.z + d.z * 6 });
      api.faceAt(en.x, en.z);
      return;
    }
    if (dist < 4) {
      const d = V.away({ x: me.x, z: me.z }, { x: en.x, z: en.z });
      api.use('k2', { x: me.x + d.x * 6, z: me.z + d.z * 6 });
      api.faceAt(en.x, en.z);
      return;
    }
  }

  api.faceAt(en.x, en.z);

  // kiting movement: hold mid range, strafe
  const ideal = 9;
  const toEn = V.toward({ x: me.x, z: me.z }, { x: en.x, z: en.z });
  const per = V.perp(toEn);
  const swing = Math.sin(p.t * 0.9) >= 0 ? 1 : -1;
  let dir;
  if (!canSee) {
    const pa = api.pathTo(en.x, en.z);
    if (pa && pa.points && pa.points.length) {
      const n = pa.points[0];
      dir = V.toward({ x: me.x, z: me.z }, n);
    } else dir = toEn;
  } else if (dist > ideal + 2) {
    dir = V.add(V.scale(toEn, 1), V.scale(per, swing * 0.4));
  } else if (dist < ideal - 2) {
    dir = V.add(V.scale(toEn, -1), V.scale(per, swing * 0.6));
  } else {
    dir = V.add(V.scale(per, swing), V.scale(toEn, 0.1));
  }

  // avoid walls
  const nx = me.x + dir.x * 3, nz = me.z + dir.z * 3;
  if (Math.abs(nx) > 18.5 || Math.abs(nz) > 18.5) {
    dir = V.norm({ x: -me.x, z: -me.z });
  }
  api.move(dir.x, dir.z);
}