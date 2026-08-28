const ecd = { charge: -1, smash: -1, jump: -1 };
let lastMoveDir = { x: 0, z: 1 };
let saidOnce = false;

function predPos(e, t) {
  const k = 0.85;
  return { x: e.x + e.vx * t * k, z: e.z + e.vz * t * k };
}

function clampPt(q, m) {
  return { x: Math.max(-m, Math.min(m, q.x)), z: Math.max(-m, Math.min(m, q.z)) };
}

function bestBlinkDir(p, api, cands) {
  const s = p.self, e = p.enemy;
  let best = null, bs = -1e9;
  for (const c of cands) {
    const n = V.norm(c);
    if (!n.x && !n.z) continue;
    const q = { x: s.x + n.x * 7.5, z: s.z + n.z * 7.5 };
    const inside = 20 - Math.max(Math.abs(q.x), Math.abs(q.z));
    const cq = clampPt(q, 18.5);
    let sc = Math.min(V.dist(cq, e), 18) + Math.min(inside, 4) * 1.6;
    if (inside < 1.2) sc -= 9;
    if (sc > bs) { bs = sc; best = n; }
  }
  return best || { x: 0, z: 1 };
}

function chooseMove(p, api, desired, flee) {
  const s = p.self, e = p.enemy;
  const ep = predPos(e, 0.7);
  let best = null, bs = -1e9;
  for (let i = 0; i < 20; i++) {
    const h = i * (Math.PI / 10);
    const dir = { x: Math.sin(h), z: Math.cos(h) };
    const r = api.ray(dir.x, dir.z, 7.5);
    const step = Math.min(Math.max(r.dist - 1.35, 0), 3.2);
    const q = { x: s.x + dir.x * step, z: s.z + dir.z * step };
    const dd = V.dist(q, ep);
    let sc = -Math.abs(dd - desired) + flee * Math.min(dd, 20) * 0.55;
    const margin = 20 - Math.max(Math.abs(q.x), Math.abs(q.z));
    if (margin < 5.5) sc -= (5.5 - margin) * 1.9;
    sc += Math.min(r.dist, 7.5) * 0.35;
    sc += V.dot(dir, lastMoveDir) * 0.8;
    if (step < 0.5) sc -= 7;
    if (sc > bs) { bs = sc; best = dir; }
  }
  return best || { x: 0, z: 1 };
}

function doMove(api, dir) {
  const n = V.norm(dir);
  if (n.x || n.z) { lastMoveDir = n; api.move(n.x, n.z); }
  else api.stop();
}

function think(p, api) {
  const s = p.self, e = p.enemy;
  if (!s.alive) return;
  const t = p.t;

  for (const ev of p.events) {
    if (ev.type === 'enemyStarted') {
      if (ev.skill === 'charge') ecd.charge = t + 4;
      else if (ev.skill === 'smash') ecd.smash = t + 1.3;
      else if (ev.skill === 'jump') ecd.jump = t + 2.8;
    }
  }

  if (!saidOnce) { saidOnce = true; api.say("eight arms, one beam"); }

  if (!e || !e.alive) { api.stop(); return; }

  const d = e.dist;
  const cst = s.casting;
  const casting = !!(cst && cst.skill === 'laser' && cst.telegraph);
  const tf = casting ? Math.max(0.04, cst.remaining) : 0.65;
  const aim = clampPt(predPos(e, tf), 19.5);
  api.faceAt(aim.x, aim.z);

  if (s.stunned || s.airborne) return;

  // --- geometry of their possible dash ---
  const ed = V.fromHeading(e.heading);
  const rel = { x: s.x - e.x, z: s.z - e.z };
  const along = V.dot(rel, ed);
  const latVec = { x: rel.x - ed.x * along, z: rel.z - ed.z * along };
  const lat = V.len(latVec);
  const chargeCast = !!(e.casting && e.casting.skill === 'charge');
  const chargeDash = chargeCast && (e.casting.phase === 'dash' || e.casting.elapsed > 0.27);

  // --- committed charge: teleport out of the lane ---
  if (chargeDash) {
    const threatened = along > -2.5 && along < 15 && lat < 4.8;
    const perp = V.perp(ed);
    const perp2 = { x: -perp.x, z: -perp.z };
    if (threatened && api.ready('blink')) {
      const dir = bestBlinkDir(p, api, [perp, perp2, V.away(s, e)]);
      api.use('blink', dir.x, dir.z);
      doMove(api, dir);
      return;
    }
    if (threatened) {
      let dir = lat > 0.6 ? V.norm(latVec) : perp;
      if (api.ray(dir.x, dir.z, 4).dist < 2.6) dir = { x: -dir.x, z: -dir.z };
      doMove(api, dir);
      return;
    }
  }

  // --- charge wind-up: slide out of the lane, keep blink held ---
  if (chargeCast && !chargeDash) {
    let dir = lat > 0.6 ? V.norm(latVec) : V.perp(ed);
    const away = V.away(s, e);
    dir = V.norm({ x: dir.x + away.x * 0.45, z: dir.z + away.z * 0.45 });
    if (api.ray(dir.x, dir.z, 4).dist < 2.6) {
      let alt = { x: -dir.x, z: -dir.z };
      if (api.ray(alt.x, alt.z, 4).dist > 2.6) dir = alt;
      else dir = chooseMove(p, api, 16, 2.0);
    }
    doMove(api, dir);
    return;
  }

  // --- smash wind-up in range: evade ---
  const smashCast = !!(e.casting && e.casting.skill === 'smash' && e.casting.telegraph);
  if (smashCast && d < 6.6) {
    const away = V.away(s, e);
    if (api.ready('blink') && (ecd.charge > t + 1.1 || d < 4.6)) {
      const dir = bestBlinkDir(p, api, [away, V.rot(away, 0.8), V.rot(away, -0.8), V.perp(away)]);
      api.use('blink', dir.x, dir.z);
      doMove(api, dir);
      return;
    }
    if (api.ready('jump') && d < 5.9) {
      api.use('jump');
      doMove(api, away);
      return;
    }
    doMove(api, chooseMove(p, api, 15, 2.4));
    return;
  }

  // --- too close for comfort: pop out ---
  if (d < 4.1 && api.ready('blink') && !e.stunned) {
    const away = V.away(s, e);
    const dir = bestBlinkDir(p, api, [away, V.rot(away, 0.9), V.rot(away, -0.9), V.perp(away)]);
    api.use('blink', dir.x, dir.z);
    doMove(api, dir);
    return;
  }

  // --- laser ---
  if (api.ready('laser') && e.visible && d > 2.6 && d < 21.5) {
    let ok = true;
    if (chargeCast) ok = false;
    if (d < 7.2 && !(e.stunned || e.airborne || e.busy)) ok = false;
    if (d < 5.0 && !e.stunned) ok = false;
    if (ok) {
      const ang = Math.abs(V.angleTo(s.heading, V.toward(s, aim)));
      if (ang < 1.15 && api.los(aim.x, aim.z)) api.use('laser');
    }
  }

  // --- kiting ---
  let desired = 12;
  const lcd = api.cooldown('laser');
  if (lcd > 0.9) desired = 14.5;
  if (ecd.charge <= t + 0.3) desired += 1.5;
  let flee = d < 8 ? 1.7 : 0.55;
  if (d < 5) flee = 2.6;
  if (t > 52 && s.hp / s.maxHp > e.hp / e.maxHp) { desired += 2; flee += 0.6; }
  if (desired > 16.5) desired = 16.5;

  if (!e.visible && d > 10.5) {
    const path = api.pathTo(e.x, e.z);
    if (path && path.points && path.points.length) {
      const w = path.points[0];
      doMove(api, V.toward(s, w));
    } else {
      api.moveTo(e.x, e.z);
      lastMoveDir = V.toward(s, e);
    }
    return;
  }

  doMove(api, chooseMove(p, api, desired, flee));
}
