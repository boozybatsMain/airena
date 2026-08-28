const TAU = Math.PI * 2;
let side = 1;
let prevDir = { x: 0, z: 1 };
let chargeReadyAt = -99, smashReadyAt = -99, jumpReadyAt = -99;
let sideSwitchT = -99;
let saidT = -99;

function cr(a, b) { return a.x * b.z - a.z * b.x; }
function nrm(v) { const l = Math.hypot(v.x, v.z); return l > 1e-6 ? { x: v.x / l, z: v.z / l } : { x: 0, z: 0 }; }
function mix(a, sa, b, sb) { return nrm({ x: a.x * sa + b.x * sb, z: a.z * sa + b.z * sb }); }
function perpOf(d) { return { x: d.z, z: -d.x }; }

function pickDir(p, api, desired, minDist, corridor) {
  const s = p.self, e = p.enemy;
  const spd = (s.casting ? s.maxSpeed * 0.45 : s.maxSpeed);
  let best = desired, bestSc = -1e9;
  for (let i = 0; i < 24; i++) {
    const a = i * (TAU / 24);
    const d = { x: Math.sin(a), z: Math.cos(a) };
    let sc = 3.2 * (d.x * desired.x + d.z * desired.z) + 0.6 * (d.x * prevDir.x + d.z * prevDir.z);
    let c = 4.5;
    try { const r = api.ray(d.x, d.z, 4.5); if (r && typeof r.dist === 'number') c = r.dist; } catch (err) { }
    if (c < 1.5) sc -= 14; else if (c < 3) sc -= 3 * (3 - c);
    const qx = s.x + d.x * spd * 0.65, qz = s.z + d.z * spd * 0.65;
    const m = 20 - Math.max(Math.abs(qx), Math.abs(qz));
    if (m < 4) sc -= (4 - m) * 3.5;
    const de = Math.hypot(qx - e.x, qz - e.z);
    if (de < minDist) sc -= (minDist - de) * 4;
    if (corridor) {
      const rx = qx - corridor.ox, rz = qz - corridor.oz;
      const al = rx * corridor.dx + rz * corridor.dz;
      const lat = Math.abs(rx * corridor.dz - rz * corridor.dx);
      if (al > -2.5 && al < 14 && lat < 3.6) sc -= 6 + (3.6 - lat) * 5;
    }
    if (sc > bestSc) { bestSc = sc; best = d; }
  }
  return best;
}

function scoreBlink(p, d) {
  const s = p.self, e = p.enemy;
  const lx = s.x + d.x * 7.5, lz = s.z + d.z * 7.5;
  const m = 20 - Math.max(Math.abs(lx), Math.abs(lz));
  const de = Math.hypot(lx - e.x, lz - e.z);
  return Math.min(m, 6) * 1.3 + Math.min(de, 14) * 0.9;
}

function bestOf(p, cands) {
  let b = cands[0], bs = -1e9;
  for (const c of cands) { const sc = scoreBlink(p, c); if (sc > bs) { bs = sc; b = c; } }
  return b;
}

function predict(p, T) {
  const e = p.enemy;
  let lead = 0.8;
  let Te = T;
  if (e.stunned) lead = 0.1;
  if (e.casting) {
    const sk = e.casting.skill, ph = e.casting.phase;
    if (sk === 'smash') lead = 0.2;
    else if (sk === 'charge' && ph === 'dash') { lead = 1.0; if (typeof e.casting.remaining === 'number') Te = Math.min(T, e.casting.remaining); }
    else if (sk === 'charge') lead = 0.3;
    else if (sk === 'jump') lead = 1.0;
  }
  let x = e.x + e.vx * Te * lead;
  let z = e.z + e.vz * Te * lead;
  if (x > 19.5) x = 19.5; if (x < -19.5) x = -19.5;
  if (z > 19.5) z = 19.5; if (z < -19.5) z = -19.5;
  return { x, z };
}

function think(p, api) {
  const s = p.self, e = p.enemy, t = p.t;
  if (!s || !s.alive) return;

  for (const ev of p.events) {
    if (ev.type === 'enemyStarted') {
      if (ev.skill === 'charge') chargeReadyAt = t + 4.033;
      else if (ev.skill === 'smash') smashReadyAt = t + 1.3;
      else if (ev.skill === 'jump') jumpReadyAt = t + 2.8;
    } else if (ev.type === 'blocked') {
      if (t - sideSwitchT > 0.6) { side = -side; sideSwitchT = t; }
    } else if (ev.type === 'damaged') {
      if (ev.skill === 'smash') smashReadyAt = t + 1.3;
      else if (ev.skill === 'charge') chargeReadyAt = t + 4.033;
    }
  }

  if (!e || !e.alive) { api.stop(); return; }

  const dist = e.dist;
  const toE = nrm({ x: e.x - s.x, z: e.z - s.z });
  const chargeCd = Math.max(0, chargeReadyAt - t);
  const smashCd = Math.max(0, smashReadyAt - t);

  // ---- read enemy charge state ----
  let corridor = null, chargeThreat = 0, timeToHit = 99;
  if (e.casting && e.casting.skill === 'charge') {
    const dir = V.fromHeading(e.heading);
    corridor = { ox: e.x, oz: e.z, dx: dir.x, dz: dir.z };
    const rel = { x: s.x - e.x, z: s.z - e.z };
    const al = rel.x * dir.x + rel.z * dir.z;
    const lat = Math.abs(cr(rel, dir));
    const inC = al > -1.5 && al < 13.5 && lat < 3.1;
    if (e.casting.phase === 'dash') { chargeThreat = inC ? 2 : 0; timeToHit = Math.max(0, (al - 2.25) / 15); }
    else { chargeThreat = inC ? 1 : 0.5; timeToHit = 0.3 + Math.max(0, (al - 2.25) / 15); }
  }

  const smashIncoming = !!(e.casting && e.casting.skill === 'smash' && e.casting.telegraph);
  const smashRem = smashIncoming && typeof e.casting.remaining === 'number' ? e.casting.remaining : 0.25;

  // ---- facing: always track the shot ----
  const castRem = (s.casting && s.casting.skill === 'laser' && typeof s.casting.remaining === 'number') ? s.casting.remaining : 0.7;
  const aim = predict(p, castRem);
  api.faceAt(aim.x, aim.z);

  const idle = !s.busy && !s.stunned && !s.airborne;

  // ---- defensive skills ----
  let spent = false;
  if (idle) {
    if (chargeThreat >= 2 && api.ready('blink') && timeToHit < 0.6) {
      const dir = { x: corridor.dx, z: corridor.dz };
      const pv = perpOf(dir);
      const c1 = mix(pv, 1, dir, -0.35);
      const c2 = mix(pv, -1, dir, -0.35);
      const bd = bestOf(p, [c1, c2]);
      api.use('blink', bd.x, bd.z); spent = true;
    } else if (!spent && chargeThreat >= 1 && dist < 8 && api.ready('blink')) {
      const dir = { x: corridor.dx, z: corridor.dz };
      const pv = perpOf(dir);
      const bd = bestOf(p, [mix(pv, 1, dir, -0.3), mix(pv, -1, dir, -0.3)]);
      api.use('blink', bd.x, bd.z); spent = true;
    } else if (!spent && smashIncoming && dist < 6.8 && smashRem >= 0.11 && api.ready('jump')) {
      api.use('jump'); spent = true;
    } else if (!spent && smashIncoming && dist < 5.4 && api.ready('blink')) {
      const away = { x: -toE.x, z: -toE.z };
      const pv = perpOf(toE);
      const bd = bestOf(p, [away, mix(away, 1, pv, 1), mix(away, 1, pv, -1)]);
      api.use('blink', bd.x, bd.z); spent = true;
    } else if (!spent && dist < 3.4 && !e.stunned && api.ready('blink') && smashCd < 0.35 && chargeThreat < 1) {
      const away = { x: -toE.x, z: -toE.z };
      const pv = perpOf(toE);
      const bd = bestOf(p, [away, mix(away, 1, pv, 1), mix(away, 1, pv, -1)]);
      api.use('blink', bd.x, bd.z); spent = true;
    }
  }

  // ---- laser ----
  if (!spent && idle && api.ready('laser') && e.visible && dist < 21.5) {
    const smashSafe = dist > 6.1 || smashCd > 0.85 || e.stunned || e.airborne;
    let chargeSafe = chargeCd > 0.6 || dist > 15.5 || e.stunned || e.airborne;
    if (chargeThreat >= 1 && !(e.casting && e.casting.phase === 'dash' && chargeThreat < 2)) chargeSafe = false;
    if (e.casting && e.casting.skill === 'charge' && chargeThreat === 0) chargeSafe = true;
    let losOk = true;
    try { losOk = api.los(aim.x, aim.z); } catch (err) { }
    const ang = Math.abs(V.angleTo(s.heading, nrm({ x: aim.x - s.x, z: aim.z - s.z })));
    if (smashSafe && chargeSafe && losOk && ang < 1.25) {
      api.use('laser'); spent = true;
    }
  }

  // ---- movement ----
  let desired, minDist = 5.8;

  if (chargeThreat >= 1) {
    const dir = { x: corridor.dx, z: corridor.dz };
    const rel = { x: s.x - e.x, z: s.z - e.z };
    let sg = cr(rel, dir) >= 0 ? 1 : -1;
    if (Math.abs(cr(rel, dir)) < 0.4) {
      const pv = perpOf(dir);
      sg = scoreBlink(p, pv) >= scoreBlink(p, { x: -pv.x, z: -pv.z }) ? 1 : -1;
    }
    const pv = perpOf(dir);
    desired = mix(pv, sg, dir, -0.45);
    minDist = 7.5;
  } else if (smashIncoming && dist < 8) {
    const pv = perpOf(toE);
    desired = mix({ x: -toE.x, z: -toE.z }, 1, pv, 0.6 * side);
    minDist = 7;
  } else if (!e.visible) {
    let dp = toE;
    let path = null;
    try { path = api.pathTo(e.x, e.z); } catch (err) { }
    if (path && path.points && path.points.length) {
      const pt = path.points[0];
      const dd = nrm({ x: pt.x - s.x, z: pt.z - s.z });
      if (dd.x || dd.z) dp = dd;
    }
    desired = dp;
    minDist = 6.2;
  } else {
    let want;
    if (e.stunned || e.airborne) want = 8.5;
    else if (chargeCd > 1.1) want = 9.5;
    else want = 14;
    if (dist > 22) want = 17;
    let radial;
    if (dist < want - 1.0) radial = -1.2;
    else if (dist > want + 2.0) radial = 1.0;
    else radial = 0;
    const pv = perpOf(toE);
    desired = mix(toE, radial, pv, 0.9 * side);
    // creep away from walls
    const m = 20 - Math.max(Math.abs(s.x), Math.abs(s.z));
    if (m < 5.5) {
      const toC = nrm({ x: -s.x, z: -s.z });
      desired = mix(desired, 1, toC, 0.7);
    }
    minDist = (e.stunned || e.airborne) ? 4.5 : 6.0;
  }

  // flip strafe side if that way is walled off
  if (t - sideSwitchT > 0.7) {
    const pv = perpOf(toE);
    const tg = { x: pv.x * side, z: pv.z * side };
    let d1 = 6;
    try { const r = api.ray(tg.x, tg.z, 5); if (r && typeof r.dist === 'number') d1 = r.dist; } catch (err) { }
    const fx = s.x + tg.x * 4, fz = s.z + tg.z * 4;
    const fm = 20 - Math.max(Math.abs(fx), Math.abs(fz));
    if (d1 < 2.3 || fm < 1.5) { side = -side; sideSwitchT = t; }
  }

  const go = pickDir(p, api, desired, minDist, corridor);
  prevDir = go;
  api.move(go.x, go.z);

  if (t - saidT > 9 && api.rand() < 0.3) {
    saidT = t;
    api.say(dist > 12 ? "eight arms, one beam" : "too close, ape");
  }
}
