function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en) return;

  const d = en.dist;
  const k1 = 'k1', k2 = 'k2', k3 = 'k3';
  const has = n => me.skills && me.skills.indexOf(n) >= 0;

  // --- emergency heal / shield ---
  const hurt = me.hp / me.maxHp;
  if (has(k2) && api.ready(k2) && !me.busy) {
    const wantShield = (en.casting && en.casting.telegraph && d < 12) || d < 5.5;
    if ((hurt < 0.62 && me.shield < 2) || (wantShield && me.shield < 2)) {
      api.use(k2);
      steer(p, api, d);
      return;
    }
  }

  // --- melee cone: strongest dps tool ---
  if (has(k3) && api.ready(k3) && !me.busy && d < 4.6 && !en.airborne && api.los(en.x, en.z)) {
    api.use(k3, { x: en.x, z: en.z });
    api.move(V.toward(me, en).x, V.toward(me, en).z);
    return;
  }

  // --- mortar: lead the target ---
  if (has(k1) && api.ready(k1) && !me.busy && d < 17 && d > 4.2) {
    const sp = (me.kit[k1] && me.kit[k1].speed) || 18;
    const wu = 0.5;
    // predict position at impact
    const flight = Math.max(0.1, d / sp);
    const lead = {
      x: en.x + en.vx * (wu + flight) * 0.65,
      z: en.z + en.vz * (wu + flight) * 0.65
    };
    const dd = Math.hypot(lead.x - me.x, lead.z - me.z);
    if (dd >= 3.9 && dd <= 14.5) {
      api.use(k1, lead);
      steer(p, api, d);
      return;
    }
  }

  steer(p, api, d);
}

function steer(p, api, d) {
  const me = p.self, en = p.enemy;
  api.faceAt(en.x, en.z);

  // dodge incoming mortars
  for (const pr of p.arena.projectiles) {
    if (pr.mine) continue;
    const land = { x: pr.x + pr.vx * pr.left, z: pr.z + pr.vz * pr.left };
    if (V.dist(land, me) < 4.2) {
      const away = V.norm(V.sub(me, land));
      api.move(away.x, away.z);
      return;
    }
  }

  // keep in melee band when healthy, else kite mid
  const aggressive = me.hp >= en.hp - 20 || p.t > 26;
  const want = aggressive ? 2.6 : 9.5;
  const t = V.toward(me, en);
  let dir;
  if (d > want + 1.2) dir = t;
  else if (d < want - 1.2) dir = V.scale(t, -1);
  else dir = V.perp(t);

  // strafe component
  const strafe = V.scale(V.perp(t), ((p.tick >> 5) & 1) ? 1 : -1);
  let mv = V.norm(V.add(V.scale(dir, 1), V.scale(strafe, 0.55)));

  // wall avoidance
  const nx = me.x + mv.x * 3, nz = me.z + mv.z * 3;
  if (Math.abs(nx) > 18 || Math.abs(nz) > 18) {
    mv = V.norm(V.sub({ x: 0, z: 0 }, me));
  }
  api.move(mv.x, mv.z);
}