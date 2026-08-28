const OBSTACLES = [
  { x: -7, z: -3, hx: 1.2, hz: 3.5 },
  { x: 7, z: 3, hx: 1.2, hz: 3.5 },
  { x: 0, z: -10, hx: 3.6, hz: 1.2 },
  { x: 0, z: 10, hx: 3.6, hz: 1.2 },
  { x: -12.5, z: 11, hx: 1.6, hz: 1.6 },
  { x: 12.5, z: -11, hx: 1.6, hz: 1.6 }
];

let lastChargeStart = -99;
let lastSmashStart = -99;
let lastDir = { x: 0, z: 1 };
let readySince = -99;
let wasReady = false;
let stuckCount = 0;
let blockedBias = 0;
let saidAt = -99;

function clampArena(pt) {
  return { x: Math.max(-19.2, Math.min(19.2, pt.x)), z: Math.max(-19.2, Math.min(19.2, pt.z)) };
}

function enemyPred(p, t) {
  const e = p.enemy;
  let vx = e.vx, vz = e.vz;
  const sp = Math.hypot(vx, vz);
  if (sp > 16) { vx = vx / sp * 15; vz = vz / sp * 15; }
  return clampArena({ x: e.x + vx * t, z: e.z + vz * t });
}

function chooseMove(p, api, desired, awayBias) {
  const me = p.self, e = p.enemy;
  const ep = enemyPred(p, 0.45);
  let best = null;
  const toC = V.norm({ x: -me.x, z: -me.z });
  for (let i = 0; i < 24; i++) {
    const a = i * Math.PI * 2 / 24;
    const d = { x: Math.sin(a), z: Math.cos(a) };
    let clear = 4.0;
    try {
      const r = api.ray(d.x, d.z, 4.0);
      clear = r ? r.dist : 4.0;
    } catch (err) { clear = 4.0; }
    if (clear < 1.5) continue;
    const step = Math.min(3.0, Math.max(0.8, clear - 1.0));
    const nx = me.x + d.x * step, nz = me.z + d.z * step;
    const nd = Math.hypot(nx - ep.x, nz - ep.z);
    let s = -Math.abs(nd - desired) * 1.25;
    if (awayBias > 0) s += (nd - e.dist) * awayBias;
    s += Math.min(clear, 4) * 0.45;
    const wm = 20 - Math.max(Math.abs(nx), Math.abs(nz));
    if (wm < 4.0) s -= (4.0 - wm) * 1.6;
    const cornerish = Math.min(20 - Math.abs(nx), 20 - Math.abs(nz));
    if (cornerish < 3.0) s -= (3.0 - cornerish) * 1.2;
    s += (d.x * lastDir.x + d.z * lastDir.z) * 0.9;
    if (blockedBias > 0) s += (d.x * toC.x + d.z * toC.z) * blockedBias;
    if (!best || s > best.s) best = { s, d };
  }
  return best ? best.d : { x: -me.x, z: -me.z };
}

function think(p, api) {
  const me = p.self, e = p.enemy;
  if (!me.alive) return;

  for (const ev of p.events) {
    if (ev.type === 'enemyStarted') {
      if (ev.skill === 'charge') lastChargeStart = p.t;
      else if (ev.skill === 'smash') lastSmashStart = p.t;
    } else if (ev.type === 'blocked') {
      blockedBias = 1.6;
    }
  }
  if (e.casting) {
    if (e.casting.skill === 'charge' && p.t - lastChargeStart > 0.5) lastChargeStart = p.t - (e.casting.elapsed || 0);
    if (e.casting.skill === 'smash' && p.t - lastSmashStart > 0.4) lastSmashStart = p.t - (e.casting.elapsed || 0);
  }
  blockedBias *= 0.85;
  if (blockedBias < 0.05) blockedBias = 0;

  const laserReady = api.ready('laser');
  if (laserReady && !wasReady) readySince = p.t;
  wasReady = laserReady;

  // always keep our nose on where they will be
  const castLeft = (me.casting && me.casting.skill === 'laser' && me.casting.telegraph)
    ? Math.max(0.02, me.casting.remaining - 0.05) : 0.68;
  const aim = enemyPred(p, Math.min(0.75, castLeft));
  api.faceAt(aim.x, aim.z);

  if (me.stunned) return;
  if (me.airborne) return;

  // ---------- charge dodge ----------
  const charging = e.casting && e.casting.skill === 'charge';
  if (charging && e.casting.phase !== 'windup') {
    let dir = (e.speed > 3) ? V.norm({ x: e.vx, z: e.vz }) : V.fromHeading(e.heading);
    const rel = { x: me.x - e.x, z: me.z - e.z };
    const along = V.dot(rel, dir);
    const perp = V.perp(dir);
    const lat = V.dot(rel, perp);
    const threat = along > -1.5 && along < 13.5 && Math.abs(lat) < 3.4;
    if (threat) {
      let side = lat >= 0 ? 1 : -1;
      if (Math.abs(lat) < 0.15) side = api.rand() < 0.5 ? 1 : -1;
      let dodge = V.norm(V.add(V.scale(perp, side), V.scale(dir, -0.3)));
      let tp = { x: me.x + dodge.x * 7.0, z: me.z + dodge.z * 7.0 };
      if (Math.abs(tp.x) > 18.5 || Math.abs(tp.z) > 18.5) {
        const alt = V.norm(V.add(V.scale(perp, -side), V.scale(dir, -0.3)));
        const tp2 = { x: me.x + alt.x * 7.0, z: me.z + alt.z * 7.0 };
        if (Math.abs(tp2.x) <= 18.5 && Math.abs(tp2.z) <= 18.5) dodge = alt;
      }
      lastDir = dodge;
      api.move(dodge.x, dodge.z);
      if (api.ready('blink') && !me.busy) {
        api.use('blink', dodge.x, dodge.z);
        if (p.t - saidAt > 3) { saidAt = p.t; api.say('ink and vanish'); }
      }
      return;
    }
  }

  // ---------- smash dodge ----------
  const smashing = e.casting && e.casting.skill === 'smash' && e.casting.telegraph;
  const reach = 2.9 + e.radius + me.radius + 0.7;
  if (smashing && e.dist < reach + 1.5) {
    const away = V.norm({ x: me.x - e.x, z: me.z - e.z });
    let mv = away;
    const tp = { x: me.x + away.x * 3, z: me.z + away.z * 3 };
    if (Math.abs(tp.x) > 19 || Math.abs(tp.z) > 19) {
      mv = V.norm(V.add(away, V.perp(away)));
    }
    lastDir = mv;
    api.move(mv.x, mv.z);
    const rem = e.casting.remaining;
    if (!me.busy) {
      if (api.ready('jump') && rem > 0.14) api.use('jump');
      else if (api.ready('blink')) api.use('blink', mv.x, mv.z);
    }
    return;
  }

  // ---------- too close: break away ----------
  if (e.dist < 6.2 && !e.stunned) {
    const away = V.norm({ x: me.x - e.x, z: me.z - e.z });
    let mv = chooseMove(p, api, 14, 1.4);
    if (V.dot(mv, away) < 0) mv = away;
    lastDir = mv;
    api.move(mv.x, mv.z);
    if (!me.busy && e.dist < 5.0 && api.ready('blink')) {
      let bd = away;
      const tp = { x: me.x + bd.x * 7.0, z: me.z + bd.z * 7.0 };
      if (Math.abs(tp.x) > 18.5 || Math.abs(tp.z) > 18.5) bd = V.norm(V.add(away, V.perp(away)));
      api.use('blink', bd.x, bd.z);
    }
    return;
  }

  // ---------- regain sight if needed ----------
  if (!e.visible) {
    let mv = null;
    if (e.dist > 8) {
      const path = api.pathTo(e.x, e.z);
      if (path && path.points && path.points.length) {
        const wp = path.points[0];
        const d = V.norm({ x: wp.x - me.x, z: wp.z - me.z });
        if (V.len(d) > 0) mv = d;
      }
    }
    if (!mv) mv = chooseMove(p, api, 11, 0);
    lastDir = mv;
    api.move(mv.x, mv.z);
    return;
  }

  // ---------- kite ----------
  const chargeCdLeft = Math.max(0, 4.0 - (p.t - lastChargeStart));
  let desired = 14.0;
  if (chargeCdLeft > 1.6) desired = 11.5;
  if (e.dist > 21) desired = 15.0;
  const mv = chooseMove(p, api, desired, 0);
  lastDir = mv;
  api.move(mv.x, mv.z);

  if (me.speed < 0.5 && !me.busy) stuckCount++; else stuckCount = 0;
  if (stuckCount > 8) { blockedBias = 2.0; stuckCount = 0; }

  // ---------- shoot ----------
  if (laserReady && !me.busy && e.visible && e.dist > 3.0 && e.dist < 22.0) {
    const toE = V.norm({ x: e.x - me.x, z: e.z - me.z });
    const perp = V.perp(toE);
    const lateral = Math.abs(e.vx * perp.x + e.vz * perp.z);
    const held = p.t - readySince;
    const slowed = !!(e.casting && (e.casting.skill === 'smash' || e.casting.skill === 'charge')) || e.stunned || e.airborne === false && e.speed < 1.0;
    let aimOk = lateral < 2.6 || slowed || e.stunned;
    if (held > 1.1) aimOk = aimOk || lateral < 4.2;
    if (held > 2.2) aimOk = true;

    const chargeSafe = e.dist > 12.8 || chargeCdLeft > 1.0 ||
      (e.casting && e.casting.skill === 'charge' && e.casting.phase !== 'windup');

    if (aimOk && chargeSafe && api.los(aim.x, aim.z)) {
      api.faceAt(aim.x, aim.z);
      api.use('laser');
      if (p.t - saidAt > 4) { saidAt = p.t; api.say('eight arms, one beam'); }
    }
  }
}
