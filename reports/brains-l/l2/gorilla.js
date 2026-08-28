const DEG = Math.PI / 180;
const SMASH_MAX = 5.15;
const ECD = { laser: 2.2, blink: 3.9, jump: 2.8 };
const enemyLast = {};
let zigSign = 1, zigNext = 0, lastSay = -99;

function eReady(name, t) {
  const l = enemyLast[name];
  if (l === undefined) return true;
  return (t - l) >= (ECD[name] || 1);
}

function say(api, p, txt) {
  if (p.t - lastSay > 3.5) { lastSay = p.t; api.say(txt); }
}

function approach(p, api, tx, tz, perp, avoid) {
  const s = p.self;
  const me = { x: s.x, z: s.z };
  let aim = { x: tx, z: tz };
  const path = api.pathTo(tx, tz);
  if (path && path.direct === false && path.points && path.points.length) {
    let w = path.points[0];
    if (path.points.length > 1 && V.dist(me, w) < 1.6) w = path.points[1];
    aim = w;
    perp = perp * 0.4;
  }
  let dir = V.toward(me, aim);
  if (dir.x === 0 && dir.z === 0) dir = V.fromHeading(s.heading);
  if (perp) {
    const q = V.perp(dir);
    dir = V.norm({ x: dir.x + q.x * perp, z: dir.z + q.z * perp });
  }
  const half = p.arena.half - 2.2;
  let rx = 0, rz = 0;
  if (s.x > half) rx -= (s.x - half);
  if (s.x < -half) rx += (-half - s.x);
  if (s.z > half) rz -= (s.z - half);
  if (s.z < -half) rz += (-half - s.z);
  if (rx !== 0 || rz !== 0) {
    const nd = V.norm({ x: dir.x + rx * 0.9, z: dir.z + rz * 0.9 });
    if (nd.x !== 0 || nd.z !== 0) dir = nd;
  }
  if (avoid) {
    const r0 = api.ray(dir.x, dir.z, 2.4);
    if (r0 && r0.hit && r0.dist < 2.0) {
      const angles = [0.5, -0.5, 1.0, -1.0, 1.5, -1.5, 2.1, -2.1];
      for (const a of angles) {
        const c = V.rot(dir, a);
        const rr = api.ray(c.x, c.z, 2.4);
        if (!rr || !rr.hit || rr.dist > 2.2) { dir = c; break; }
      }
    }
  }
  api.move(dir.x, dir.z);
}

function think(p, api) {
  const s = p.self;
  const e = p.enemy;
  if (!s || !s.alive) return;

  for (const ev of p.events) {
    if (ev.type === 'enemyStarted') {
      enemyLast[ev.skill] = p.t;
      api.remember('e_' + ev.skill, Math.round(p.t * 100) / 100);
    }
  }

  if (!e || !e.alive) { api.stop(); return; }

  const me = { x: s.x, z: s.z };
  const dist = e.dist;
  const evx = e.vx || 0, evz = e.vz || 0;
  const predict = (t) => ({ x: e.x + evx * t, z: e.z + evz * t });
  const lasering = !!(e.casting && e.casting.skill === 'laser' && e.casting.telegraph);

  if (s.stunned) return;
  if (s.airborne) { api.faceAt(e.x, e.z); return; }

  // ---- already committed to something ----
  if (s.casting) {
    const c = s.casting;
    if (c.phase === 'windup') {
      if (c.skill === 'charge') {
        const tt = Math.min((c.remaining || 0.1) + Math.min(dist, 12) / 15, 1.2);
        const pt = predict(tt);
        api.faceAt(pt.x, pt.z);
        const d = V.toward(me, pt);
        api.move(d.x, d.z);
      } else if (c.skill === 'smash') {
        const pt = predict(c.remaining || 0.1);
        api.faceAt(pt.x, pt.z);
        const d = V.toward(me, pt);
        api.move(d.x, d.z);
      } else {
        api.faceAt(e.x, e.z);
      }
      return;
    }
    if (c.phase === 'recover') {
      api.faceAt(e.x, e.z);
      approach(p, api, e.x, e.z, 0, dist > 3);
      return;
    }
    return;
  }

  // ---- prediction for melee ----
  const smashPt = predict(0.28);
  const myFut = { x: s.x + s.vx * 0.12, z: s.z + s.vz * 0.12 };
  const dPred = V.dist(myFut, smashPt);
  const dirPred = V.toward(myFut, smashPt);
  const aErr = Math.abs(V.angleTo(s.heading, dirPred));

  const airSafe = !e.airborne || (e.casting && typeof e.casting.remaining === 'number' && e.casting.remaining < 0.24);
  const hittable = !e.invulnerable && airSafe;

  // ---- 1. break their laser with a charge ----
  if (lasering && api.ready('charge') && dist <= 12.5 && !e.invulnerable) {
    const tt = 0.28 + Math.min(dist, 12) / 15;
    const pt = predict(tt);
    if (dist < 4.5 || api.los(pt.x, pt.z)) {
      api.faceAt(pt.x, pt.z);
      api.use('charge');
      const d = V.toward(me, pt);
      api.move(d.x, d.z);
      say(api, p, "NO BEAM FOR YOU");
      return;
    }
  }

  // ---- 2. smash whenever it can land ----
  if (api.ready('smash') && e.visible && hittable && dPred <= 4.55 && aErr < 1.45) {
    api.faceAt(smashPt.x, smashPt.z);
    api.use('smash');
    const d = V.toward(me, { x: e.x, z: e.z });
    api.move(d.x, d.z);
    say(api, p, "FISTS");
    return;
  }

  // ---- 3. charge to close the gap / punish a blink ----
  if (api.ready('charge') && e.visible && !e.invulnerable && dist >= 4.2 && dist <= 12.5) {
    const tt = 0.28 + Math.min(dist, 12) / 15;
    const pt = predict(tt);
    if (api.los(pt.x, pt.z)) {
      const dp = V.toward(me, pt);
      const ae = Math.abs(V.angleTo(s.heading, dp));
      api.faceAt(pt.x, pt.z);
      if (ae < 1.05) {
        api.use('charge');
        api.move(dp.x, dp.z);
        say(api, p, "COMING THROUGH");
      } else {
        approach(p, api, e.x, e.z, 0, true);
      }
      return;
    }
  }

  // ---- 4. chase and stay glued ----
  api.faceAt(e.x, e.z);

  if (dist > 2.7) {
    let perp = 0;
    if (dist > 5.5 && e.visible && (lasering || eReady('laser', p.t))) {
      if (p.t > zigNext) { zigSign = -zigSign; zigNext = p.t + 0.5 + api.rand() * 0.45; }
      perp = (lasering ? 0.95 : 0.65) * zigSign;
    }
    let lead = { x: e.x, z: e.z };
    try {
      const L = V.lead(me, { x: e.x, z: e.z }, { x: evx, z: evz }, s.maxSpeed);
      if (L && isFinite(L.x) && isFinite(L.z)) lead = L;
    } catch (err) { /* ignore */ }
    if (Math.abs(lead.x) > 19.5 || Math.abs(lead.z) > 19.5) lead = { x: e.x, z: e.z };
    approach(p, api, lead.x, lead.z, perp, true);
  } else {
    // in his face: orbit so the point blank beam has to chase, and shove him
    if (p.t > zigNext) { zigSign = -zigSign; zigNext = p.t + 0.7 + api.rand() * 0.6; }
    const to = V.toward(me, { x: e.x, z: e.z });
    const q = V.perp(to);
    const w = lasering ? 1.25 : 0.55;
    let dir = V.norm({ x: to.x * 0.65 + q.x * w * zigSign, z: to.z * 0.65 + q.z * w * zigSign });
    if (dir.x === 0 && dir.z === 0) dir = to;
    const half = p.arena.half - 2.0;
    if (Math.abs(s.x) > half || Math.abs(s.z) > half) {
      const inward = V.norm({ x: -s.x, z: -s.z });
      dir = V.norm({ x: dir.x + inward.x * 0.8, z: dir.z + inward.z * 0.8 });
    }
    api.move(dir.x, dir.z);
  }
}
