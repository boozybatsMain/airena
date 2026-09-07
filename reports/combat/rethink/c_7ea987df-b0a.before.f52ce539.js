function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en) return;
  const d = en.dist;

  if (p.t < 0.2) api.say("Come here.");

  // dodge incoming bolts
  let dodge = null;
  for (const pr of p.arena.projectiles) {
    if (pr.mine) continue;
    const rel = { x: me.x - pr.x, z: me.z - pr.z };
    const sp = Math.hypot(pr.vx, pr.vz) || 1;
    const dir = { x: pr.vx / sp, z: pr.vz / sp };
    const along = rel.x * dir.x + rel.z * dir.z;
    if (along < 0 || along > 22) continue;
    const perpD = Math.abs(rel.x * dir.z - rel.z * dir.x);
    if (perpD < 3.0) {
      const side = (rel.x * dir.z - rel.z * dir.x) >= 0 ? 1 : -1;
      dodge = { x: dir.z * side, z: -dir.x * side };
    }
  }

  // avoid enemy zones
  let flee = null;
  for (const z of p.arena.zones) {
    if (z.mine) continue;
    const dd = Math.hypot(me.x - z.x, me.z - z.z);
    if (dd < z.r + 2.2) flee = V.norm({ x: me.x - z.x, z: me.z - z.z });
  }

  const canK3 = api.ready('k3');
  const canK2 = api.ready('k2');
  const canK1 = api.ready('k1');

  if (!me.busy) {
    if (canK3 && d < 4.3 && en.visible && !en.airborne) {
      api.use('k3', { x: en.x + en.vx * 0.3, z: en.z + en.vz * 0.3 });
    } else if (canK2 && d < 19 && en.visible) {
      const aim = V.lead(me, en, { x: en.vx, z: en.vz }, 22);
      api.use('k2', aim);
    } else if (canK1 && d < 12 && en.visible) {
      const aim = { x: en.x + en.vx * 0.5, z: en.z + en.vz * 0.5 };
      api.use('k1', aim);
    }
  }

  api.faceAt(en.x, en.z);

  if (dodge) {
    api.move(dodge.x, dodge.z);
  } else if (flee) {
    api.move(flee.x, flee.z);
  } else if (en.rooted || (me.hp > en.hp && d > 3)) {
    // close in for cone
    api.moveTo(en.x, en.z);
  } else if (d > 5) {
    api.moveTo(en.x, en.z);
  } else if (d < 2.8) {
    const away = V.away(me, en);
    api.move(away.x, away.z);
  } else {
    // strafe
    const t = V.toward(me, en);
    const s = (Math.floor(p.t) % 4 < 2) ? 1 : -1;
    api.move(t.z * s + t.x * 0.2, -t.x * s + t.z * 0.2);
  }
}