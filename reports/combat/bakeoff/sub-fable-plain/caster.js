const S = { strafe: 1, lastFlip: 0, said: 0 };

function classify(p) {
  const out = { mortar: null, zone: null, self: null };
  for (const n of p.self.skills) {
    const k = p.self.kit[n]; if (!k) continue;
    if (k.aim === 'none') { if (!out.self) out.self = n; }
    else if (k.splash != null || k.kind === 'lob' || k.kind === 'mortar') { if (!out.mortar) out.mortar = n; }
    else if (k.radius != null || k.kind === 'zone') { if (!out.zone) out.zone = n; }
    else if (!out.mortar) out.mortar = n;
  }
  return out;
}

function clampArena(pt, half, m) {
  return { x: Math.max(-half + m, Math.min(half - m, pt.x)), z: Math.max(-half + m, Math.min(half - m, pt.z)) };
}

function steer(api, s, dir, half) {
  // avoid blocks/walls by rotating the desired direction
  let d = V.norm(dir);
  if (V.len(d) < 0.01) return d;
  for (let i = 0; i < 8; i++) {
    const r = api.ray(d.x, d.z, 2.6);
    if (!r.hit) break;
    d = V.rot(d, (i % 2 ? -1 : 1) * (0.7 + 0.35 * i));
  }
  return d;
}

function think(p, api) {
  const s = p.self, e = p.enemy, half = p.arena.half;
  const K = classify(p);
  const me = { x: s.x, z: s.z }, en = { x: e.x, z: e.z };
  const evel = { x: e.vx, z: e.vz };

  for (const ev of p.events) {
    if (ev.type === 'blocked') { S.strafe = -S.strafe; S.lastFlip = p.t; }
  }
  if (p.t - S.lastFlip > 1.2 + api.rand() * 1.4) { S.strafe = -S.strafe; S.lastFlip = p.t; }

  // ---- threats ----
  let dodge = null;
  for (const pr of p.arena.projectiles) {
    if (pr.mine) continue;
    if (pr.arc) {
      const land = { x: pr.x + pr.vx * pr.left, z: pr.z + pr.vz * pr.left };
      const d = V.dist(land, me);
      const danger = 1.8 + s.radius + 0.9;
      if (d < danger && pr.left < 1.4) {
        const away = d > 0.05 ? V.away(me, land) : V.perp(V.toward(me, en));
        dodge = away;
      }
    } else {
      const toMe = V.sub(me, { x: pr.x, z: pr.z });
      const vn = V.norm({ x: pr.vx, z: pr.vz });
      const along = V.dot(toMe, vn);
      const side = Math.abs(toMe.x * vn.z - toMe.z * vn.x);
      if (along > 0 && side < 3.2) dodge = V.norm(V.sub(toMe, V.scale(vn, along)));
    }
  }
  for (const z of p.arena.zones) {
    if (z.mine) continue;
    const d = V.dist(me, z);
    if (d < z.r + s.radius + 0.6 && !dodge) dodge = d > 0.05 ? V.away(me, z) : V.perp(V.toward(me, en));
  }

  // ---- movement ----
  const toE = V.toward(me, en);
  const perp = V.scale(V.perp(toE), S.strafe);
  const want = 9;
  let mv;
  if (dodge) mv = V.add(dodge, V.scale(perp, 0.4));
  else if (e.dist > want + 2.5) mv = V.add(toE, V.scale(perp, 0.6));
  else if (e.dist < want - 2.5) mv = V.add(V.scale(toE, -1), V.scale(perp, 0.7));
  else mv = V.add(perp, V.scale(toE, (e.dist - want) * 0.15));
  // keep away from walls
  const edge = 4;
  if (Math.abs(s.x) > half - edge) mv.x -= Math.sign(s.x) * 0.8;
  if (Math.abs(s.z) > half - edge) mv.z -= Math.sign(s.z) * 0.8;
  const dir = steer(api, s, mv, half);
  api.move(dir.x, dir.z);
  api.faceAt(e.x, e.z);

  // ---- abilities ----
  if (s.busy) return;
  const missing = s.maxHp - s.hp;
  const enemyThreat = e.casting && e.casting.telegraph;
  let used = false;

  if (K.self && api.ready(K.self)) {
    const k = s.kit[K.self];
    const heals = k.effects && k.effects.some(x => String(x).includes('heal'));
    if (missing >= 40 || (missing >= 20 && enemyThreat && s.shield <= 0) || (p.burn > 0 && missing >= 25) || (heals && s.hp / s.maxHp < 0.35)) {
      api.use(K.self); used = true;
    }
  }

  if (!used && K.mortar && api.ready(K.mortar)) {
    const k = s.kit[K.mortar];
    const range = k.range || 15, spd = k.speed || 12, wu = k.windup || 0.5, splash = k.splash || 1.8;
    if (e.dist < range + splash + e.radius - 0.5) {
      const flight = Math.min(e.dist, range) / spd;
      let aim = V.add(en, V.scale(evel, wu + flight));
      const dA = V.dist(me, aim);
      if (dA > range) aim = V.add(me, V.scale(V.toward(me, aim), range));
      aim = clampArena(aim, half, 1.8);
      api.use(K.mortar, aim); used = true;
    }
  }

  if (!used && K.zone && api.ready(K.zone)) {
    const k = s.kit[K.zone];
    const range = k.range || 12, wu = k.windup || 0.467, rad = k.radius || 3;
    if (e.dist < range + rad + e.radius - 0.5) {
      let aim = V.add(en, V.scale(evel, wu + 0.15));
      if (V.dist(me, aim) > range) aim = V.add(me, V.scale(V.toward(me, aim), range));
      aim = clampArena(aim, half, 0.5);
      api.use(K.zone, aim); used = true;
    }
  }

  if (p.t - S.said > 9) {
    S.said = p.t;
    const lines = ['Keep dancing. I never miss twice.', 'Skies are falling, friend.', 'Faster than you. Always.', 'Burn with me.'];
    api.say(lines[Math.floor(api.rand() * lines.length)]);
  }
}