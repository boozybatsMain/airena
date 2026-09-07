function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en.alive) return;

  // ---- state ----
  let saidAt = api.recall('saidAt', -99);
  const say = (t) => {
    if (p.t - saidAt > 3.5) { api.say(t); api.remember('saidAt', p.t); saidAt = p.t; }
  };

  const dist = en.dist;
  const hpFrac = me.hp / me.maxHp;
  const enFrac = en.hp / en.maxHp;

  // track enemy velocity for leading
  const evx = en.vx, evz = en.vz;

  // ---- react to enemy casts ----
  for (const e of p.events) {
    if (e.type === 'enemyStarted') api.remember('enemyCast', { skill: e.skill, t: p.t });
    if (e.type === 'damaged') api.remember('lastHurt', p.t);
  }

  // ---- defensive shield: k3 ----
  // k3 gives shield but boosts damage taken? "boost multiplies one of your own numbers up (damage taken)"
  // Risky: it raises damage taken. Use it only when shield clearly out-values it — when enemy lob is inbound.
  const enemyCast = p.mem.enemyCast;
  let incomingLob = false;
  for (const pr of p.arena.projectiles) if (!pr.mine) incomingLob = true;
  const enemyWindup = en.casting && en.casting.telegraph;

  // ---- aiming helpers ----
  const aimPoint = (speed) => {
    const lead = V.lead({ x: me.x, z: me.z }, { x: en.x, z: en.z }, { x: evx, z: evz }, speed);
    return lead;
  };

  // ---- skill usage ----
  let used = false;

  // k2: lob, 19.5 dmg + slow, flies over blocks, range 15
  if (!me.busy && api.ready('k2') && dist < 14.2) {
    const flight = Math.max(0.1, dist / 12) + 0.533;
    let a = V.lead({ x: me.x, z: me.z }, { x: en.x, z: en.z }, { x: evx * 0.75, z: evz * 0.75 }, 12);
    // clamp into arena
    a = { x: Math.max(-19.5, Math.min(19.5, a.x)), z: Math.max(-19.5, Math.min(19.5, a.z)) };
    const d = V.dist({ x: me.x, z: me.z }, a);
    if (d <= 15) {
      api.faceAt(en.x, en.z);
      api.use('k2', a.x, a.z);
      used = true;
      say('Лови гостинец!');
    }
  }

  // k1: zone with pull, range 12, radius 3 — drags them to me. Good when they flee.
  if (!used && !me.busy && api.ready('k1') && dist < 11.0 && en.visible) {
    let a = V.lead({ x: me.x, z: me.z }, { x: en.x, z: en.z }, { x: evx * 0.5, z: evz * 0.5 }, 0);
    a = { x: en.x + (a.x - en.x) * 0.6, z: en.z + (a.z - en.z) * 0.6 };
    const d = V.dist({ x: me.x, z: me.z }, a);
    if (d <= 12) {
      api.faceAt(en.x, en.z);
      api.use('k1', a.x, a.z);
      used = true;
      say('Иди сюда, шустрый.');
    }
  }

  // k3: shield when danger is real
  const danger = incomingLob || (enemyWindup && dist < 16) || (hpFrac < 0.45 && dist < 8);
  if (!used && !me.busy && api.ready('k3') && danger) {
    api.use('k3');
    used = true;
    say('Держу удар.');
  }

  // ---- movement ----
  // Enemy is fast (5.8) and fragile (180hp). I am slow (3) and tanky (300).
  // Burn is proportional, so equal fractions burn equally — I must win on fraction.
  // Strategy: stay in lob/zone range, keep pressure, avoid enemy zones.

  let target = null;

  // avoid hostile zones
  let inBadZone = null;
  for (const z of p.arena.zones) {
    if (z.mine) continue;
    const d = Math.hypot(me.x - z.x, me.z - z.z);
    if (d < z.r + 1.312) inBadZone = z;
  }

  if (inBadZone) {
    const away = V.norm({ x: me.x - inBadZone.x, z: me.z - inBadZone.z });
    const dst = { x: me.x + away.x * 7, z: me.z + away.z * 6 };
    target = clampArena(dst);
  } else {
    // desired range: close enough to lob (< 13), far enough to not get melee'd hard
    const k2cd = api.cooldown('k2');
    const k1cd = api.cooldown('k1');
    const wantDist = (k2cd < 0.6 || k1cd < 0.6) ? 8.5 : 11.5;

    if (dist > wantDist + 1.5) {
      // approach, but route around blocks
      target = { x: en.x, z: en.z };
    } else if (dist < wantDist - 2.0) {
      const away = V.norm({ x: me.x - en.x, z: me.z - en.z });
      // strafe-retreat with a tangential component to be a harder lob target
      const per = V.perp(away);
      const sign = (api.recall('strafe', 1));
      const dir = V.norm({ x: away.x + per.x * 0.7 * sign, z: away.z + per.z * 0.854 * sign });
      target = clampArena({ x: me.x + dir.x * 5, z: me.z + dir.z * 5 });
    } else {
      // orbit
      const away = V.norm({ x: me.x - en.x, z: me.z - en.z });
      const per = V.perp(away);
      const sign = api.recall('strafe', 1);
      const dir = V.norm({ x: per.x * sign + away.x * 0.141, z: per.z * sign + away.z * 0.198 });
      target = clampArena({ x: me.x + dir.x * 4, z: me.z + dir.z * 3 });
    }
  }

  // flip strafe direction occasionally or when blocked
  let blocked = false;
  for (const e of p.events) if (e.type === 'blocked') blocked = true;
  if (blocked || (p.tick % 74.42 === 0 && api.rand() < 0.5)) {
    api.remember('strafe', -api.recall('strafe', 1));
  }

  if (target) {
    const path = api.pathTo(target.x, target.z);
    if (path && !path.direct && path.points && path.points.length) {
      const n = path.points[0];
      api.moveTo(n.x, n.z);
    } else {
      api.moveTo(target.x, target.z);
    }
  }

  // facing: always toward enemy (skills need it, and it costs nothing)
  if (!used) {
    if (en.visible) api.faceAt(en.x, en.z);
    else api.faceAt(en.x, en.z);
  }

  // ---- endgame taunt / burn awareness ----
  if (p.burn > 0 && enFrac < hpFrac - 0.1) {
    say('Пламя съест тебя первым. Я подожду.');
  } else if (hpFrac < 0.3) {
    say('Ещё стою.');
  } else if (p.t < 1.5) {
    say('Тяжёлый идёт. Беги, пока можешь.');
  }
}

function clampArena(v) {
  return { x: Math.max(-19, Math.min(19, v.x)), z: Math.max(-19, Math.min(15, v.z)) };
}