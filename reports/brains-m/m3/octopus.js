const MEM = { lastSkillT: {}, prevDir: { x: 0, z: 1 }, said: false, lastBlinkT: -99, lastLaserT: -99 };

function estChargeReady(p) {
  const t = MEM.lastSkillT['charge'];
  if (t === undefined) return p.t > 1.0;
  return (p.t - t) >= 3.85;
}
function estSmashReady(p) {
  const t = MEM.lastSkillT['smash'];
  if (t === undefined) return true;
  return (p.t - t) >= 1.2;
}

function blinkDir(s, e, base) {
  const cands = [base, V.rot(base, 0.55), V.rot(base, -0.55), V.rot(base, 1.15), V.rot(base, -1.15), V.rot(base, 2.2), V.rot(base, -2.2)];
  let best = V.norm(base), bs = -1e9;
  for (const c of cands) {
    const n = V.norm(c);
    if (n.x === 0 && n.z === 0) continue;
    const lx = s.x + n.x * 7.4, lz = s.z + n.z * 7.4;
    let sc = 0;
    if (Math.abs(lx) > 18.5) sc -= (Math.abs(lx) - 18.5) * 4;
    if (Math.abs(lz) > 18.5) sc -= (Math.abs(lz) - 18.5) * 4;
    const cx = Math.max(-19, Math.min(19, lx)), cz = Math.max(-19, Math.min(19, lz));
    const d = Math.hypot(cx - e.x, cz - e.z);
    sc += Math.min(d, 15) * 0.6;
    sc += V.dot(n, V.norm(base)) * 1.2;
    if (sc > bs) { bs = sc; best = n; }
  }
  return best;
}

function pickMove(p, api, s, e, toE, desired) {
  let best = null, bestScore = -1e9;
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8;
    const d = { x: Math.sin(a), z: Math.cos(a) };
    let clear = 5;
    try {
      const r = api.ray(d.x, d.z, 5);
      clear = r.hit ? r.dist : 5;
    } catch (err) { clear = 5; }
    if (clear < 1.7) continue;
    const step = Math.min(3.0, clear - 0.9);
    const np = { x: s.x + d.x * step, z: s.z + d.z * step };
    const nd = Math.hypot(np.x - e.x, np.z - e.z);
    let sc = -Math.abs(nd - desired) * 1.5;
    sc += Math.min(clear, 5) * 0.35;
    const ex = Math.abs(np.x), ez = Math.abs(np.z);
    if (ex > 16.5) sc -= (ex - 16.5) * 5;
    if (ez > 16.5) sc -= (ez - 16.5) * 5;
    sc += V.dot(d, MEM.prevDir) * 1.0;
    sc -= Math.abs(V.dot(d, toE)) * 0.25;
    if (sc > bestScore) { bestScore = sc; best = d; }
  }
  if (!best) {
    const c = V.norm({ x: -s.x, z: -s.z });
    best = (c.x === 0 && c.z === 0) ? { x: 1, z: 0 } : c;
  }
  return best;
}

function think(p, api) {
  const s = p.self, e = p.enemy;
  if (!s || !s.alive) return;

  for (const ev of p.events) {
    if (ev.type === 'enemyStarted') MEM.lastSkillT[ev.skill] = p.t;
    if (ev.type === 'blinked') MEM.lastBlinkT = p.t;
  }

  if (!MEM.said) { MEM.said = true; api.say("eight arms, one beam"); }

  if (!e || !e.alive) { api.stop(); return; }

  const dist = e.dist;
  const toE = V.toward(s, e);
  const away = { x: -toE.x, z: -toE.z };
  const canAct = !s.busy && !s.stunned && !s.airborne;

  // --- aim prediction ---
  let aimT = 0.667;
  if (s.casting && s.casting.skill === 'laser' && s.casting.telegraph) aimT = Math.max(0, s.casting.remaining);
  let lead = aimT * 0.85;
  if (e.stunned || (e.casting && e.casting.skill === 'smash')) lead = 0;
  const pred = { x: e.x + e.vx * lead, z: e.z + e.vz * lead };

  const ec = e.casting;
  const chargeDash = !!(ec && ec.skill === 'charge' && (ec.phase === 'dash'));
  const chargeWind = !!(ec && ec.skill === 'charge' && ec.phase === 'windup');
  const smashTele = !!(ec && ec.skill === 'smash' && ec.telegraph);

  // ---------------- DODGES ----------------
  if (canAct) {
    // charge dodge: sidestep the locked line
    if ((chargeDash || (chargeWind && ec.remaining < 0.14)) && dist < 16) {
      if (api.ready('blink')) {
        const dashDir = V.fromHeading(e.heading);
        const perp = V.perp(dashDir);
        const side = (V.dot(perp, V.sub(s, e)) >= 0) ? 1 : -1;
        const base = V.norm({ x: perp.x * side * 1.0 + away.x * 0.45, z: perp.z * side * 1.0 + away.z * 0.45 });
        const bd = blinkDir(s, e, base);
        api.use('blink', bd.x, bd.z);
        api.faceAt(e.x, e.z);
        return;
      }
      if (dist < 9) {
        const dashDir = V.fromHeading(e.heading);
        const perp = V.perp(dashDir);
        const side = (V.dot(perp, V.sub(s, e)) >= 0) ? 1 : -1;
        const d = V.norm({ x: perp.x * side, z: perp.z * side });
        MEM.prevDir = d;
        api.move(d.x, d.z);
        api.faceAt(e.x, e.z);
        return;
      }
    }
    // smash dodge
    if (smashTele && dist < 6.6) {
      if (api.ready('jump')) {
        api.use('jump');
        const d = blinkDir(s, e, away);
        MEM.prevDir = d;
        api.move(d.x, d.z);
        api.faceAt(e.x, e.z);
        return;
      }
      if (api.ready('blink')) {
        const perp = V.perp(toE);
        const side = (api.rand() < 0.5) ? 1 : -1;
        const base = V.norm({ x: away.x * 1.0 + perp.x * side * 0.8, z: away.z * 1.0 + perp.z * side * 0.8 });
        const bd = blinkDir(s, e, base);
        api.use('blink', bd.x, bd.z);
        api.faceAt(e.x, e.z);
        return;
      }
    }
    // emergency spacing
    if (dist < 4.6 && api.ready('blink') && !estChargeReady(p)) {
      const perp = V.perp(toE);
      const side = (V.dot(perp, { x: s.vx, z: s.vz }) >= 0) ? 1 : -1;
      const base = V.norm({ x: away.x + perp.x * side * 0.7, z: away.z + perp.z * side * 0.7 });
      const bd = blinkDir(s, e, base);
      api.use('blink', bd.x, bd.z);
      api.faceAt(e.x, e.z);
      return;
    }
  }

  // ---------------- LASER ----------------
  const chargeReady = estChargeReady(p);
  let minCastDist = chargeReady ? 13.5 : 6.5;
  if (e.stunned) minCastDist = 3.0;
  if (ec && ec.skill === 'charge' && ec.phase === 'recover') minCastDist = 3.0;
  if (ec && ec.skill === 'jump') minCastDist = Math.min(minCastDist, 7.5);

  const aimDir = V.toward(s, pred);
  const angErr = Math.abs(V.angleTo(s.heading, aimDir));

  if (canAct && api.ready('laser') && e.visible && dist < 23 && dist > minCastDist &&
      angErr < 0.9 && !chargeWind && !(smashTele && dist < 7)) {
    api.use('laser');
    MEM.lastLaserT = p.t;
  }

  // ---------------- FACING ----------------
  api.faceAt(pred.x, pred.z);

  // ---------------- MOVEMENT ----------------
  if (s.airborne || s.stunned) return;

  let desired = chargeReady ? 15.0 : 10.0;
  if (s.casting && s.casting.skill === 'laser') desired = chargeReady ? 15.0 : 10.0;
  if (dist > 20) desired = 15.0;
  if (p.burn > 0 && s.hp / s.maxHp > e.hp / e.maxHp) desired = Math.max(desired, 16.0);

  if (!e.visible && dist > 8) {
    let route = null;
    try { route = api.pathTo(e.x, e.z); } catch (err) { route = null; }
    if (route && route.points && route.points.length) {
      const wp = route.points[0];
      const d = V.norm({ x: wp.x - s.x, z: wp.z - s.z });
      if (d.x !== 0 || d.z !== 0) { MEM.prevDir = d; api.move(d.x, d.z); return; }
    }
    api.moveTo(e.x, e.z);
    return;
  }

  const d = pickMove(p, api, s, e, toE, desired);
  MEM.prevDir = d;
  api.move(d.x, d.z);
}
