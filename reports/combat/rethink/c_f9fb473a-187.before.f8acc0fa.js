function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en.alive) return;

  const dmg = pickDamage(me);
  const util = pickPull(me, dmg);
  const shield = pickSelf(me);

  // shield when close or when they cast
  if (shield && api.ready(shield) && (en.dist < 10 || (en.casting && en.casting.telegraph)) && me.shield < 4) {
    api.use(shield);
  }

  const lead = predict(p, 0.55);

  if (dmg && api.ready(dmg) && en.dist < (me.kit[dmg].range || 12) + 2 && en.visible) {
    api.use(dmg, lead);
    api.faceAt(en.x, en.z);
  } else if (util && api.ready(util) && en.dist < (me.kit[util].range || 12) + 2 && en.visible) {
    api.use(util, lead);
    api.faceAt(en.x, en.z);
  } else {
    api.faceAt(en.x, en.z);
  }

  // movement: keep mid range, dodge zones
  const danger = badZone(p);
  if (danger) {
    const away = V.norm({ x: me.x - danger.x, z: me.z - danger.z });
    api.moveTo(clampArena(me.x + away.x * 6), clampArena(me.z + away.z * 6));
  } else {
    const ideal = 7;
    if (!en.visible) {
      api.moveTo(en.x, en.z);
    } else if (en.dist > ideal + 2) {
      api.moveTo(en.x, en.z);
    } else if (en.dist < ideal - 2.5) {
      const a = V.away(me, en);
      api.moveTo(clampArena(me.x + a.x * 5), clampArena(me.z + a.z * 5));
    } else {
      const t = V.toward(me, en);
      const s = V.perp(t);
      const dir = (Math.floor(p.t / 1.7) % 2) ? 1 : -1;
      api.moveTo(clampArena(me.x + s.x * 5 * dir + t.x), clampArena(me.z + s.z * 5 * dir + t.z));
    }
  }

  if (p.t < 0.2) api.say("Stand still. It only stings for 2.4 seconds.");
}

function clampArena(v) { return Math.max(-18.5, Math.min(18.5, v)); }

function predict(p, dt) {
  const en = p.enemy;
  return { x: en.x + en.vx * dt, z: en.z + en.vz * dt };
}

function badZone(p) {
  let worst = null;
  for (const z of p.arena.zones) {
    if (z.mine) continue;
    const d = Math.hypot(z.x - p.self.x, z.z - p.self.z);
    if (d < z.r + p.self.radius + 1.2) { worst = z; break; }
  }
  return worst;
}

function pickDamage(me) {
  let best = null, bv = -1;
  for (const n of me.skills) {
    const k = me.kit[n];
    if (!k) continue;
    const d = (k.damage || 0) * (k.ticks || 1);
    if (d > bv) { bv = d; best = n; }
  }
  return bv > 0 ? best : null;
}

function pickPull(me, skip) {
  for (const n of me.skills) {
    if (n === skip) continue;
    const k = me.kit[n];
    if (k && k.aim !== 'none') return n;
  }
  return null;
}

function pickSelf(me) {
  for (const n of me.skills) {
    const k = me.kit[n];
    if (k && k.aim === 'none' && !(k.damage > 0)) return n;
  }
  return null;
}