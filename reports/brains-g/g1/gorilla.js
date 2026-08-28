const SMASH_MAX = 4.45;
let smashReach = 4.05;
let zig = 1, zigNext = 0;
let jukeDone = false;
let unstickUntil = -1, unstickDir = { x: 1, z: 0 };
let blockedCount = 0, lastBlocked = -99;
let lastSay = -99;

function clampPt(x, z, half) {
  const h = half - 0.9;
  return { x: Math.max(-h, Math.min(h, x)), z: Math.max(-h, Math.min(h, z)) };
}

function pred(e, t, half) {
  return clampPt(e.x + e.vx * t, e.z + e.vz * t, half);
}

function chargeLead(p) {
  const s = p.self, e = p.enemy, half = p.arena.half;
  let t = 0.28;
  for (let i = 0; i < 3; i++) {
    const px = e.x + e.vx * t, pz = e.z + e.vz * t;
    const dd = Math.hypot(px - s.x, pz - s.z) - (s.radius + e.radius);
    t = 0.28 + Math.max(0, dd) / 15;
    if (t > 1.1) t = 1.1;
  }
  return pred(e, t, half);
}

function coverPoint(p, api) {
  const s = p.self, e = p.enemy;
  let best = null, bs = 1e9;
  for (const o of p.arena.obstacles) {
    const away = V.norm({ x: o.x - e.x, z: o.z - e.z });
    if (away.x === 0 && away.z === 0) continue;
    const r = Math.max(o.hx, o.hz) + 2.0;
    const c = clampPt(o.x + away.x * r, o.z + away.z * r, p.arena.half);
    const path = api.pathTo(c.x, c.z);
    if (!path) continue;
    const sc = path.dist - 0.35 * Math.hypot(c.x - e.x, c.z - e.z);
    if (sc < bs) { bs = sc; best = c; }
  }
  return best;
}

function steer(p, api, dir, d) {
  const n = V.norm(dir);
  if (n.x === 0 && n.z === 0) { api.stop(); return; }
  let out = n;
  const probe = 2.3;
  const r = api.ray(n.x, n.z, probe);
  if (r && r.hit && r.dist < 1.9 && r.dist < d - 0.6) {
    for (const a of [0.6, -0.6, 1.1, -1.1, 1.7, -1.7, 2.4, -2.4]) {
      const c = V.rot(n, a);
      const rr = api.ray(c.x, c.z, probe);
      if (!rr || !rr.hit || rr.dist > 2.0) { out = c; break; }
    }
  }
  api.move(out.x, out.z);
}

function think(p, api) {
  const s = p.self, e = p.enemy;
  if (!s.alive) return;
  const half = p.arena.half;

  for (const ev of p.events) {
    if (ev.type === 'missed' && ev.skill === 'smash') {
      if (ev.reason === 'range') smashReach = Math.max(3.3, smashReach - 0.3);
    } else if (ev.type === 'dealt' && ev.skill === 'smash') {
      smashReach = Math.min(SMASH_MAX, smashReach + 0.06);
    } else if (ev.type === 'blocked') {
      if (p.t - lastBlocked < 0.5) blockedCount++; else blockedCount = 1;
      lastBlocked = p.t;
    }
  }

  if (!e || !e.alive) { api.stop(); return; }

  const d = e.dist;
  const enemyAir = e.airborne || (e.casting && e.casting.phase === 'air');
  const cast = s.casting;

  // committed phases
  if (cast && cast.skill === 'charge' && cast.phase === 'windup') {
    const lead = chargeLead(p);
    api.faceAt(lead.x, lead.z);
    api.move(lead.x - s.x, lead.z - s.z);
    return;
  }
  if (cast && cast.skill === 'smash' && cast.phase === 'windup') {
    const t = Math.max(0, cast.remaining);
    const pe = pred(e, t, half);
    api.faceAt(pe.x, pe.z);
    api.move(pe.x - s.x, pe.z - s.z);
    return;
  }

  const canAct = !s.busy && !s.stunned && !s.airborne && !s.casting;

  // stuck handling
  if (blockedCount >= 3 && s.speed < 0.8 && p.t > unstickUntil) {
    unstickUntil = p.t + 0.55;
    const toE = V.norm({ x: e.x - s.x, z: e.z - s.z });
    const side = api.rand() < 0.5 ? 1 : -1;
    unstickDir = V.rot(toE, side * 1.5);
    blockedCount = 0;
  }

  // SMASH
  if (canAct && api.ready('smash') && !enemyAir && !e.invulnerable) {
    const pe = pred(e, 0.28, half);
    const sx = s.x + s.vx * 0.15, sz = s.z + s.vz * 0.15;
    const dImp = Math.hypot(pe.x - sx, pe.z - sz);
    const reach = (e.stunned ? smashReach + 0.35 : smashReach);
    if (dImp <= reach) {
      api.use('smash');
      api.faceAt(pe.x, pe.z);
      api.move(pe.x - s.x, pe.z - s.z);
      if (p.t - lastSay > 6) { lastSay = p.t; api.say("calamari"); }
      return;
    }
  }

  let faceT = pred(e, 0.15, half);

  // CHARGE
  if (canAct && api.ready('charge') && e.visible && !enemyAir && !e.invulnerable && d > 4.3 && d < 12.5) {
    const lead = chargeLead(p);
    const dl = { x: lead.x - s.x, z: lead.z - s.z };
    const dist = Math.hypot(dl.x, dl.z);
    const err = Math.abs(V.angleTo(s.heading, V.norm(dl)));
    const casting = e.casting && e.casting.telegraph;
    if (dist < 11.8 && err < (casting ? 0.85 : 0.7) && api.los(lead.x, lead.z)) {
      api.use('charge');
      api.faceAt(lead.x, lead.z);
      api.move(dl.x, dl.z);
      if (p.t - lastSay > 6) { lastSay = p.t; api.say("incoming"); }
      return;
    }
    faceT = lead;
  }

  // endgame stall when ahead on hp fraction
  const myFrac = s.hp / s.maxHp, hisFrac = e.hp / e.maxHp;
  const stall = p.t > 46 && myFrac > hisFrac + 0.05 && d > 5.5;

  let mv = null;

  if (p.t < unstickUntil) {
    mv = unstickDir;
  } else if (stall) {
    const cp = coverPoint(p, api);
    if (cp && Math.hypot(cp.x - s.x, cp.z - s.z) > 1.2) {
      api.moveTo(cp.x, cp.z);
      api.faceAt(faceT.x, faceT.z);
      return;
    }
    mv = V.norm({ x: s.x - e.x, z: s.z - e.z });
  } else if (!e.visible) {
    const path = api.pathTo(e.x, e.z);
    if (path && path.points && path.points.length) {
      api.moveTo(e.x, e.z);
      api.faceAt(faceT.x, faceT.z);
      return;
    }
    mv = { x: e.x - s.x, z: e.z - s.z };
  } else {
    const toE = V.norm({ x: e.x - s.x, z: e.z - s.z });
    let lateral;
    if (d > 7) lateral = 0.55;
    else if (d > 3.4) lateral = 0.4;
    else lateral = 0.12;

    if (p.t > zigNext) { zigNext = p.t + 0.6 + api.rand() * 0.7; zig = -zig; }

    const ec = e.casting;
    if (ec && ec.skill === 'laser' && ec.telegraph) {
      if (ec.remaining < 0.3 && !jukeDone && d > 3.0) {
        jukeDone = true;
        zig = -zig;
        zigNext = p.t + 0.9;
      }
      if (d > 3.0) lateral = Math.max(lateral, 0.9);
    } else {
      jukeDone = false;
    }

    mv = V.add(toE, V.scale(V.perp(toE), zig * lateral));
    if (d < 2.2) mv = toE;
  }

  // wall repulsion
  const edge = half - 2.4;
  const rep = { x: 0, z: 0 };
  if (s.x > edge) rep.x -= (s.x - edge);
  if (s.x < -edge) rep.x += (-edge - s.x);
  if (s.z > edge) rep.z -= (s.z - edge);
  if (s.z < -edge) rep.z += (-edge - s.z);
  const rl = V.len(rep);
  if (rl > 0.01) {
    const w = Math.min(1.2, rl * 0.7);
    mv = V.add(V.norm(mv), V.scale(V.norm(rep), w));
  }

  steer(p, api, mv, d);
  api.faceAt(faceT.x, faceT.z);
}
