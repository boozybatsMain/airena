function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en.alive) return;

  const K = me.kit || {};
  const names = me.skills || [];
  // classify
  let beam = null, bolt = null, blinkS = null;
  for (const n of names) {
    const k = K[n]; if (!k) continue;
    const kind = k.kind || '';
    if (kind === 'beam' && !beam) beam = n;
    else if (kind === 'bolt' && !bolt) bolt = n;
    else if (kind === 'blink' && !blinkS) blinkS = n;
  }
  if (!beam && !bolt) { for (const n of names) { const k = K[n]; if (k && (k.damage || 0) > 0 && k.kind !== 'blink') { bolt = bolt || n; } } }

  const dist = en.dist;
  const toE = { x: en.x - me.x, z: en.z - me.z };

  // dodge incoming projectiles
  let dodge = null;
  for (const pr of (p.arena.projectiles || [])) {
    if (pr.mine) continue;
    const rel = { x: me.x - pr.x, z: me.z - pr.z };
    const sp = Math.hypot(pr.vx, pr.vz) || 1;
    const dir = { x: pr.vx / sp, z: pr.vz / sp };
    const along = rel.x * dir.x + rel.z * dir.z;
    if (along < 0 || along > sp * (pr.left + 0.1)) continue;
    const lat = Math.abs(rel.x * dir.z - rel.z * dir.x);
    if (lat < 3.0) {
      const side = (rel.x * dir.z - rel.z * dir.x) >= 0 ? 1 : -1;
      dodge = { x: dir.z * side, z: -dir.x * side };
      break;
    }
  }

  // blink out of danger
  if (dodge && blinkS && api.ready(blinkS) && me.hp < me.maxHp * 0.85) {
    api.use(blinkS, { x: me.x + dodge.x * 6, z: me.z + dodge.z * 6 });
    api.faceAt(en.x, en.z);
    return;
  }

  const visible = en.visible;
  const canBeam = beam && api.ready(beam) && visible && dist < ((K[beam].range || 24) + 2.5);
  const boltK = bolt ? K[bolt] : null;
  const canBolt = bolt && api.ready(bolt) && visible && dist < ((boltK.range || 18) + 2.0);

  // aim with lead for bolt
  if (!me.busy) {
    if (canBolt && dist > 3) {
      const wu = boltK.windup || 0.37;
      const fut = { x: en.x + en.vx * wu, z: en.z + en.vz * wu };
      const aim = V.lead({ x: me.x, z: me.z }, fut, { x: en.vx, z: en.vz }, boltK.speed || 22);
      api.use(bolt, { x: aim.x, z: aim.z });
      steer(p, api, dist, dodge);
      return;
    }
    if (canBeam) {
      const wu = K[beam].windup || 0.5;
      api.use(beam, { x: en.x + en.vx * wu * 0.9, z: en.z + en.vz * wu * 0.9 });
      steer(p, api, dist, dodge);
      return;
    }
  }

  api.faceAt(en.x, en.z);
  steer(p, api, dist, dodge);
}

function steer(p, api, dist, dodge) {
  const me = p.self, en = p.enemy;
  const ideal = 12;
  if (dodge) {
    const tx = clampArena(me.x + dodge.x * 5), tz = clampArena(me.z + dodge.z * 5);
    api.move(tx - me.x, tz - me.z);
    return;
  }
  if (!en.visible) { api.moveTo(en.x, en.z); return; }
  let dir;
  if (dist > ideal + 2) dir = V.toward(me, en);
  else if (dist < ideal - 3) dir = V.away(me, en);
  else dir = { x: 0, z: 0 };
  const strafe = V.perp(V.toward(me, en));
  const s = (Math.floor(p.t / 1.6) % 2 === 0) ? 1 : -1;
  let mv = { x: dir.x + strafe.x * s * 1.1, z: dir.z + strafe.z * s * 1.1 };
  let tx = clampArena(me.x + mv.x * 4), tz = clampArena(me.z + mv.z * 4);
  api.move(tx - me.x, tz - me.z);
}

function clampArena(v) { return Math.max(-18, Math.min(18, v)); }