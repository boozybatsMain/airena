const LO = 7.5, HI = 11;
let orbitSign = 1, orbitFlipAt = 0, jinkSign = 1;
let velHist = [];
let lobShots = 0, lobHits = 0, lastSay = -10;

function skillInfo(kit, name) {
  const k = kit && kit[name];
  if (!k) return null;
  let type = 'other';
  if (k.aim === 'none') type = 'self';
  else if (k.splash !== undefined && k.speed !== undefined) type = 'lob';
  else if (k.radius !== undefined && (k.ticks !== undefined || k.duration !== undefined)) type = 'zone';
  else if (k.radius !== undefined && k.aim === 'point') type = 'zone';
  return {
    name, k, type,
    windup: k.windup || 0,
    range: k.range || 0,
    splash: k.splash || 0,
    radius: k.radius || 0,
    speed: k.speed || 12
  };
}

function findType(kit, skills, type) {
  for (const n of skills) {
    const s = skillInfo(kit, n);
    if (s && s.type === type) return s;
  }
  return null;
}

function inBlock(pt, obs, r) {
  for (const o of obs) {
    if (Math.abs(pt.x - o.x) < o.hx + r && Math.abs(pt.z - o.z) < o.hz + r) return true;
  }
  return false;
}

function predict(p, pos, vel, T) {
  const H = p.arena.half, r = p.enemy.radius;
  const obs = p.arena.obstacles;
  const mk = (t) => ({
    x: Math.max(-H + r, Math.min(H - r, pos.x + vel.x * t)),
    z: Math.max(-H + r, Math.min(H - r, pos.z + vel.z * t))
  });
  let pt = mk(T);
  if (inBlock(pt, obs, r)) {
    pt = mk(T * 0.5);
    if (inBlock(pt, obs, r)) pt = { x: pos.x, z: pos.z };
  }
  return pt;
}

function leadFactor(p) {
  const en = p.enemy;
  if (en.rooted || en.stunned) return 0;
  if (en.speed < 0.6) return 0;
  const n = velHist.length;
  if (n === 0) return 0.5;
  let ax = 0, az = 0;
  for (const v of velHist) { ax += v.x; az += v.z; }
  ax /= n; az /= n;
  const c = (ax * en.vx + az * en.vz) / (en.speed * en.speed);
  let lf = c > 0.85 ? 0.85 : (c > 0.5 ? 0.55 : 0.3);
  if (en.busy) lf = Math.max(lf, 0.8);
  if (p.self.blinded) lf = Math.min(lf, 0.5);
  return lf;
}

function chooseMove(p, api, want, L, safeR) {
  const me = p.self;
  const H = p.arena.half;
  let best = { x: want.x, z: want.z }, bestS = -1e9;
  const step = 2.2;
  for (let i = 0; i < 16; i++) {
    const h = i * Math.PI / 8;
    const d = { x: Math.sin(h), z: Math.cos(h) };
    let s = V.dot(d, want);
    const np = { x: me.x + d.x * step, z: me.z + d.z * step };
    const r = api.ray(d.x, d.z, step + me.radius);
    if (r.hit) s -= 3 * (1 - r.dist / (step + me.radius)) + 1;
    if (Math.abs(np.x) > H - me.radius - 0.6 || Math.abs(np.z) > H - me.radius - 0.6) s -= 1.5;
    if (L) {
      const dd = V.dist(np, L);
      if (dd < safeR) s -= 4 * (safeR - dd) / safeR + 2;
    }
    for (const z of p.arena.zones) {
      if (z.mine) continue;
      const dz = V.dist(np, { x: z.x, z: z.z });
      if (dz < z.r + me.radius + 0.3) s -= 2.5;
    }
    if (s > bestS) { bestS = s; best = d; }
  }
  return best;
}

function lobPlan(p, s, lf, extraT) {
  const me = p.self, en = p.enemy;
  const myS = { x: me.x + me.vx * s.windup * 0.6, z: me.z + me.vz * s.windup * 0.6 };
  const ev = { x: en.vx * lf, z: en.vz * lf };
  const e0 = predict(p, { x: en.x, z: en.z }, ev, s.windup + extraT);
  const H = p.arena.half;
  let aim = V.lead(myS, e0, ev, s.speed);
  aim = {
    x: Math.max(-H + 1.8, Math.min(H - 1.8, aim.x)),
    z: Math.max(-H + 1.8, Math.min(H - 1.8, aim.z))
  };
  const dv = V.sub(aim, myS);
  let dl = V.len(dv);
  if (dl > s.range && dl > 0) { aim = V.add(myS, V.scale(dv, s.range / dl)); dl = s.range; }
  const flight = dl / s.speed;
  const eL = predict(p, e0, ev, flight);
  return { aim, miss: V.dist(eL, aim) };
}

function zonePlan(p, s, lf, extraT) {
  const me = p.self, en = p.enemy;
  const myS = { x: me.x + me.vx * s.windup * 0.64, z: me.z + me.vz * s.windup * 0.64 };
  const ev = { x: en.vx * lf, z: en.vz * lf };
  const e0 = predict(p, { x: en.x, z: en.z }, ev, s.windup + extraT + 0.45);
  let aim = e0;
  const dv = V.sub(aim, myS);
  const dl = V.len(dv);
  if (dl > s.range && dl > 0) aim = V.add(myS, V.scale(dv, s.range / dl));
  return { aim, miss: V.dist(e0, aim) };
}

function say(p, api, text, gap) {
  if (p.t - lastSay > gap) { api.say(text); lastSay = p.t; }
}

function think(p, api) {
  const me = p.self, en = p.enemy;
  const mePos = { x: me.x, z: me.z }, enPos = { x: en.x, z: en.z };

  const myLob = findType(me.kit, me.skills, 'lob');
  const myZone = findType(me.kit, me.skills, 'zone');
  const mySelf = findType(me.kit, me.skills, 'self');
  const enLob = findType(en.kit, en.skills, 'lob');
  const enSplash = enLob ? enLob.splash : 1.8;

  for (const e of p.events) {
    if (e.type === 'enemyStarted') jinkSign = api.rand() < 0.5 ? -1 : 1;
    if (e.type === 'blocked') { orbitSign = -orbitSign; orbitFlipAt = p.t + 1.5; }
    if (myLob && e.type === 'dealt' && e.skill === myLob.name) { lobHits++; say(p, api, 'That one stuck.', 3); }
    if (e.type === 'damaged' && e.amount > 0) say(p, api, 'Tch. Not again.', 4);
  }
  velHist.push({ x: en.vx, z: en.vz });
  if (velHist.length > 8) velHist.shift();

  if (p.t < 0.2) say(p, api, 'Keep your distance. I will rain on you.', 0);

  const dist = en.dist;
  const toE = V.toward(mePos, enPos);
  const away = { x: -toE.x, z: -toE.z };
  const perp = V.perp(toE);

  // incoming things
  let threat = null;
  for (const pr of p.arena.projectiles) {
    if (pr.mine) continue;
    let L, safeR, left;
    if (pr.arc) {
      L = { x: pr.x + pr.vx * pr.left, z: pr.z + pr.vz * pr.left };
      safeR = enSplash + me.radius + 0.35;
      left = pr.left;
    } else {
      const rel = V.sub(mePos, { x: pr.x, z: pr.z });
      const vv = { x: pr.vx, z: pr.vz };
      const v2 = V.dot(vv, vv);
      if (v2 < 1e-6) continue;
      let tc = V.dot(rel, vv) / v2;
      if (tc < 0) tc = 0;
      if (tc > pr.left) continue;
      L = { x: pr.x + pr.vx * tc, z: pr.z + pr.vz * tc };
      safeR = 1.85 + me.radius * 0.3 + 0.4;
      left = tc;
    }
    const d = V.dist(mePos, L);
    if (d < safeR + 0.6) {
      if (!threat || left < threat.left) threat = { L, safeR, left, d };
    }
  }

  let zoneIn = null;
  for (const z of p.arena.zones) {
    if (z.mine) continue;
    if (V.dist(mePos, { x: z.x, z: z.z }) < z.r + me.radius + 0.3) zoneIn = z;
  }

  const enTele = en.casting && en.casting.telegraph ? en.casting : null;
  const enTeleInfo = enTele ? skillInfo(en.kit, enTele.skill) : null;
  const enTeleLob = !!(enTeleInfo && enTeleInfo.type === 'lob');
  const enLobReach = enLob ? enLob.range + enSplash + me.radius + 1 : 0;
  const lobIncoming = enTeleLob && dist < enLobReach;

  // movement
  let want, L = null, safeR = 0;
  if (threat) {
    L = threat.L; safeR = threat.safeR;
    let dirAway = V.sub(mePos, L);
    if (V.len(dirAway) < 0.3) dirAway = V.scale(perp, orbitSign);
    else dirAway = V.norm(dirAway);
    want = V.add(dirAway, V.scale(away, dist < LO ? 0.5 : 0.15));
  } else if (zoneIn) {
    let dirAway = V.sub(mePos, { x: zoneIn.x, z: zoneIn.z });
    if (V.len(dirAway) < 0.3) dirAway = away;
    else dirAway = V.norm(dirAway);
    want = V.add(dirAway, V.scale(away, 0.3));
  } else if (lobIncoming) {
    const firstHalf = enTele.elapsed < enTeleInfo.windup * 0.55;
    const sgn = firstHalf ? jinkSign : -jinkSign;
    const radial = dist < LO ? away : (dist > HI ? toE : away);
    want = V.add(V.scale(perp, sgn), V.scale(radial, dist < LO ? 0.7 : 0.25));
  } else {
    if (p.t > orbitFlipAt) {
      orbitSign = api.rand() < 0.5 ? -1 : 1;
      orbitFlipAt = p.t + 1 + api.rand() * 2;
    }
    if (dist > HI) {
      let dir = toE;
      const path = api.pathTo(en.x, en.z);
      if (path && !path.direct && path.points && path.points.length) {
        for (const pt of path.points) {
          if (V.dist(mePos, pt) > 0.8) { dir = V.toward(mePos, pt); break; }
        }
      }
      want = V.add(dir, V.scale(perp, 0.3 * orbitSign));
    } else if (dist < LO) {
      want = V.add(away, V.scale(perp, 0.4 * orbitSign));
    } else {
      const mid = (LO + HI) / 2;
      want = V.add(V.scale(perp, orbitSign), V.scale(toE, (dist - mid) / (HI - LO) * 0.8));
    }
  }
  want = V.norm(want);
  if (V.len(want) < 0.01) want = away;
  const dir = chooseMove(p, api, want, L, safeR);
  api.move(dir.x, dir.z);
  api.faceAt(en.x, en.z);

  // casting
  if (me.busy) return;
  const missing = me.maxHp - me.hp;
  const canDodge = threat ? (threat.safeR - threat.d + 0.3) < threat.left * me.maxSpeed * 0.85 : true;
  const extraT = me.blinded ? 1.0 : 0;
  const lf = leadFactor(p);
  let cast = null, castAt = null;

  if (mySelf && api.ready(mySelf.name)) {
    if (lobIncoming) cast = mySelf.name;
    else if (threat && !canDodge && threat.left > mySelf.windup + 0.08) cast = mySelf.name;
    else if (!threat && !lobIncoming && !zoneIn && missing >= 12) cast = mySelf.name;
  }

  const castingOk = !threat && !(lobIncoming && dist < 9);

  if (!cast && myLob && castingOk && api.ready(myLob.name) && dist <= myLob.range + 2.5) {
    const plan = lobPlan(p, myLob, lf, extraT);
    if (plan.miss <= myLob.splash + en.radius - 0.3) { cast = myLob.name; castAt = plan.aim; }
  }
  if (!cast && myZone && castingOk && api.ready(myZone.name) && dist <= myZone.range + 1.5 && !en.immune.includes('move') || (!cast && myZone && castingOk && api.ready(myZone.name) && dist <= myZone.range - 1)) {
    const plan = zonePlan(p, myZone, lf, extraT);
    if (plan.miss <= myZone.radius + en.radius - 0.5) { cast = myZone.name; castAt = plan.aim; }
  }
  if (!cast && castingOk) {
    for (const n of me.skills) {
      const s = skillInfo(me.kit, n);
      if (!s || s.type !== 'other' || !api.ready(n)) continue;
      if (s.range && dist > s.range) continue;
      const e0 = predict(p, enPos, { x: en.vx * lf, z: en.vz * lf }, s.windup + extraT);
      cast = n; castAt = e0;
      break;
    }
  }

  if (cast) {
    if (castAt) api.use(cast, castAt); else api.use(cast);
    if (myLob && cast === myLob.name) lobShots++;
    if (mySelf && cast === mySelf.name && missing >= 12) say(p, api, 'Patching up.', 6);
    api.remember('cast', cast);
  }
  api.remember('lob', { shots: lobShots, hits: lobHits });
}