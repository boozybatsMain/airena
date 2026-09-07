function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en.alive) return;

  const kit = me.kit || {};
  const dmgName = pick(kit, 'damage');
  const stunName = pick(kit, 'stun');
  const dashName = pick(kit, 'knock') || pick(kit, 'dash');

  const d = en.dist;
  const dmgReach = kit[dmgName] ? (kit[dmgName].range || kit[dmgName].distance || 3.4) + en.radius : 4.9;
  const stunReach = kit[stunName] ? (kit[stunName].range || kit[stunName].distance || 3.4) + en.radius : 4.9;

  if (p.t < 0.2) api.say("Come here. I only need a moment.");

  // face the enemy generally
  api.faceAt(en.x, en.z);

  const enemyWindup = en.casting && en.casting.telegraph;

  // interrupt their cast with stun if in reach
  if (!me.busy && stunName && api.ready(stunName) && en.visible && d <= stunReach - 0.3 &&
      !en.airborne && !(en.immune || []).includes('act') && (enemyWindup || true)) {
    // prefer stun when they're casting, or as opener before damage
    if (enemyWindup || !api.ready(dmgName) || d <= stunReach - 1.2) {
      api.use(stunName, { x: en.x, z: en.z });
      pressIn(p, api, en);
      return;
    }
  }

  if (!me.busy && dmgName && api.ready(dmgName) && en.visible && d <= dmgReach - 0.3 && !en.airborne) {
    api.use(dmgName, { x: en.x, z: en.z });
    pressIn(p, api, en);
    return;
  }

  // dash to close gap
  if (!me.busy && dashName && api.ready(dashName) && en.visible && d > dmgReach + 1.0 && d < 11 &&
      !api.ready(dmgName) === false) {
    api.use(dashName, { x: en.x, z: en.z });
    api.move(V.toward(me, en).x, V.toward(me, en).z);
    return;
  }

  pressIn(p, api, en);
}

function pick(kit, effect) {
  for (const name of Object.keys(kit)) {
    const k = kit[name];
    const eff = k.effects || [];
    const ids = eff.map(e => (typeof e === 'string' ? e : (e && (e.id || e.type)) || ''));
    if (ids.some(i => String(i).toLowerCase().includes(effect))) return name;
  }
  return null;
}

function pressIn(p, api, en) {
  const me = p.self;
  const d = en.dist;
  // orbit slightly to avoid their cone front, but stay in our reach
  if (d > 3.2) {
    api.moveTo(en.x, en.z);
  } else {
    const t = V.toward(me, en);
    const s = V.perp(t);
    const sign = ((p.t * 0.7) % 2 < 1) ? 1 : -1;
    api.move(t.x * 0.25 + s.x * sign, t.z * 0.25 + s.z * sign);
  }
}