function num(v) { return typeof v === 'number' && isFinite(v) ? v : null; }

function effSet(k) {
  const s = new Set();
  const add = (v) => {
    if (typeof v === 'string') s.add(v.toLowerCase());
    else if (v && typeof v === 'object') {
      if (v.type) s.add(String(v.type).toLowerCase());
      if (v.id) s.add(String(v.id).toLowerCase());
      if (v.effect) s.add(String(v.effect).toLowerCase());
    }
  };
  if (Array.isArray(k.effects)) k.effects.forEach(add);
  else if (k.effects && typeof k.effects === 'object') Object.keys(k.effects).forEach((x) => s.add(x.toLowerCase()));
  if (k.magnitudes) Object.keys(k.magnitudes).forEach((x) => s.add(x.toLowerCase()));
  return s;
}

function describe(k, selfR, targetR) {
  if (!k) return null;
  const kind = String(k.kind || '').toLowerCase();
  const aim = String(k.aim || '').toLowerCase();
  const eff = effSet(k);
  let dmg = num(k.damage);
  if (k.magnitudes) {
    for (const key of Object.keys(k.magnitudes)) {
      if (/damage|burn|fire|dot/.test(key)) {
        const m = num(k.magnitudes[key] && k.magnitudes[key].mag);
        if (m != null) dmg = Math.max(dmg || 0, m);
      }
    }
  }
  dmg = dmg || 0;
  const halfAngle = num(k.halfAngle);
  const range = num(k.range);
  const distance = num(k.distance);
  const speed = num(k.speed);
  let type;
  if (dmg <= 0) {
    if (aim === 'none' || kind.indexOf('self') >= 0 || kind.indexOf('aura') >= 0 || eff.has('heal') || eff.has('shield')) type = 'support';
    else type = 'escape';
  } else if (distance != null && (num(k.dashSpeed) != null || kind.indexOf('dash') >= 0 || kind.indexOf('lunge') >= 0 || kind.indexOf('leap') >= 0)) {
    type = 'dash';
  } else if (halfAngle != null || kind.indexOf('cone') >= 0 || kind.indexOf('fan') >= 0) {
    type = 'melee';
  } else if (speed != null || kind.indexOf('bolt') >= 0 || kind.indexOf('mortar') >= 0 || kind.indexOf('beam') >= 0 || kind.indexOf('disc') >= 0 || kind.indexOf('zone') >= 0) {
    type = 'ranged';
  } else if (range != null && range > 6) {
    type = 'ranged';
  } else {
    type = 'melee';
  }
  let reach;
  if (type === 'dash') reach = (distance || 0) + selfR + targetR;
  else if (range != null) reach = range + targetR;
  else if (distance != null) reach = distance + targetR;
  else reach = 3 + targetR;
  return {
    kind, aim, eff, dmg, type, reach,
    windup: num(k.windup) || 0,
    recover: num(k.recover) || 0,
    cooldown: num(k.cooldown) || 2,
    halfAngle, range, distance, speed, arc: !!k.arc
  };
}

let ES = {};
let prevT = 0;
let retreatUntil = 0;
let dodgeUntil = 0;
let dodgeDir = null;
let strafeSide = 1;
let strafeUntil = 0;
let lastDmgT = 0;
let talkAt = -99;
let blockedAt = -99;

function safeDir(p, api, base) {
  let b = base;
  if (!b || (Math.abs(b.x) < 1e-6 && Math.abs(b.z) < 1e-6)) b = V.toward({ x: p.self.x, z: p.self.z }, { x: 0, z: 0 });
  b = V.norm(b);
  const angles = [0, 0.45, -0.45, 0.95, -0.95, 1.5, -1.5, 2.3, -2.3];
  const lim = (p.arena.half || 20) - 2.2;
  let best = b, bestScore = -1e9;
  for (const a of angles) {
    const d = V.rot(b, a);
    let r;
    try { r = api.ray(d.x, d.z, 6); } catch (e) { r = { dist: 6 }; }
    const nx = p.self.x + d.x * 4.5, nz = p.self.z + d.z * 4.5;
    let score = Math.min(r ? r.dist : 6, 6) - Math.abs(a) * 0.75;
    if (Math.abs(nx) > lim) score -= 3.5;
    if (Math.abs(nz) > lim) score -= 3.5;
    if (score > bestScore) { bestScore = score; best = d; }
  }
  return best;
}

function stepTo(p, api, x, z) {
  const here = { x: p.self.x, z: p.self.z };
  let path = null;
  try { path = api.pathTo(x, z); } catch (e) { path = null; }
  if (path && path.points && path.points.length && !path.direct) {
    for (const q of path.points) {
      if (V.dist(here, q) > 0.9) { api.move(q.x - here.x, q.z - here.z); return; }
    }
  }
  api.move(x - here.x, z - here.z);
}

function think(p, api) {
  const me = p.self, en = p.enemy;
  if (p.t + 0.5 < prevT) { ES = {}; retreatUntil = 0; dodgeUntil = 0; talkAt = -99; lastDmgT = 0; }
  prevT = p.t;
  if (!me || !me.alive) return;
  if (!en) { api.stop(); return; }

  for (const e of p.events) {
    if (e.type === 'enemyStarted' && e.skill) ES[e.skill] = p.t;
    else if (e.type === 'damaged' || e.type === 'dealt') lastDmgT = p.t;
    else if (e.type === 'blocked') blockedAt = p.t;
  }
  if (en.casting && en.casting.skill) {
    const st = p.t - (en.casting.elapsed || 0);
    if (ES[en.casting.skill] == null || st > ES[en.casting.skill] + 0.25) ES[en.casting.skill] = st;
  }

  const myR = me.radius || 1.5, enR = en.radius || 1.5;
  const mine = {}, theirs = {};
  for (const n of (me.skills || [])) mine[n] = describe(me.kit ? me.kit[n] : null, myR, enR);
  for (const n of (en.skills || [])) theirs[n] = describe(en.kit ? en.kit[n] : null, enR, myR);

  const pick = (tbl, type) => {
    let best = null, bd = -1;
    for (const n in tbl) { const d = tbl[n]; if (d && d.type === type && d.dmg > bd) { best = n; bd = d.dmg; } }
    return best;
  };
  const meleeN = pick(mine, 'melee'), dashN = pick(mine, 'dash'), rangedN = pick(mine, 'ranged');
  let supN = null;
  for (const n in mine) if (mine[n] && mine[n].type === 'support') supN = n;

  const eMeleeN = pick(theirs, 'melee'), eDashN = pick(theirs, 'dash'), eRangedN = pick(theirs, 'ranged');

  const eReady = (n) => {
    if (!n || !theirs[n]) return false;
    const t0 = ES[n];
    if (t0 == null) return true;
    return (p.t - t0) >= theirs[n].cooldown - 0.12;
  };

  const here = { x: me.x, z: me.z };
  const there = { x: en.x, z: en.z };
  const dist = en.dist != null ? en.dist : V.dist(here, there);
  const toEn = V.toward(here, there);
  const awayEn = V.away(here, there);

  const myFrac = me.hp / Math.max(1, me.maxHp);
  const enFrac = en.hp / Math.max(1, en.maxHp);
  const actImmune = Array.isArray(me.immune) && me.immune.indexOf('act') >= 0;

  const threatR = eMeleeN ? theirs[eMeleeN].reach : (eRangedN ? 6 : 5.1);
  const eBusyElse = !!(en.casting && en.casting.skill !== eMeleeN && (en.casting.remaining || 0) > 0.3);
  const eThreat = !!eMeleeN && eReady(eMeleeN) && !en.stunned && !eBusyElse;

  // ---- reactive dodges ----
  if (en.casting && en.casting.telegraph && eDashN && en.casting.skill === eDashN && dist < theirs[eDashN].reach + 2.5) {
    const hd = V.fromHeading(en.heading || 0);
    const rel = { x: me.x - en.x, z: me.z - en.z };
    const along = V.dot(rel, hd);
    const lat = { x: rel.x - hd.x * along, z: rel.z - hd.z * along };
    let d = V.len(lat) > 0.4 ? V.norm(lat) : V.perp(hd);
    d = V.norm(V.add(d, V.scale(awayEn, 0.45)));
    dodgeDir = safeDir(p, api, d);
    dodgeUntil = p.t + 0.55;
  }
  for (const pr of (p.arena && p.arena.projectiles ? p.arena.projectiles : [])) {
    if (pr.mine) continue;
    const sp2 = pr.vx * pr.vx + pr.vz * pr.vz;
    if (sp2 < 0.5) continue;
    const tc = ((me.x - pr.x) * pr.vx + (me.z - pr.z) * pr.vz) / sp2;
    if (tc < 0 || tc > (pr.left || 0) + 0.15) continue;
    const cx = pr.x + pr.vx * tc, cz = pr.z + pr.vz * tc;
    if (Math.hypot(cx - me.x, cz - me.z) < 2.7) {
      const dir = V.norm({ x: -pr.vz, z: pr.vx });
      dodgeDir = safeDir(p, api, dir);
      dodgeUntil = Math.max(dodgeUntil, p.t + 0.4);
    }
  }

  // enemy cone about to land: their strike time vs my windup
  let coneIncoming = 0;
  if (en.casting && en.casting.telegraph && eMeleeN && en.casting.skill === eMeleeN) {
    coneIncoming = Math.max(0, theirs[eMeleeN].windup - (en.casting.elapsed || 0));
    if (dist < theirs[eMeleeN].reach + 2.2) retreatUntil = Math.max(retreatUntil, p.t + 0.5);
  }

  if (me.stunned) return;

  // ---- desired spacing ----
  const late = p.t > 25;
  const ahead = myFrac > enFrac + 0.05;
  const behind = myFrac + 0.04 < enFrac;
  const stale = (p.t - lastDmgT) > 5.5 && p.t > 6;
  let want;
  if (!eThreat || en.stunned || en.rooted) want = 1.5;
  else if (actImmune && !behind) want = threatR - 0.4;
  else want = threatR + 1.15;
  if (ahead && late) want = Math.max(want, threatR + 3.2);
  if ((behind && late) || stale) want = Math.min(want, 1.8);

  // ---- action ----
  let acted = false;
  let pressMove = false;
  let facePt = there;

  const predOf = (w) => ({ x: en.x + (en.vx || 0) * w * 0.75, z: en.z + (en.vz || 0) * w * 0.75 });
  const enGrounded = !en.airborne && (en.y || 0) <= 0.35;

  // melee strike
  if (!acted && meleeN && api.ready(meleeN) && en.visible && !en.invulnerable && enGrounded) {
    const d = mine[meleeN];
    const cancelRisk = coneIncoming > 0 && coneIncoming < d.windup + 0.12 && !actImmune;
    const pe = predOf(d.windup);
    const myPred = { x: me.x + (me.vx || 0) * d.windup * 0.6, z: me.z + (me.vz || 0) * d.windup * 0.6 };
    const pd = V.dist(myPred, pe);
    if (!cancelRisk && pd <= d.reach - 0.3 && dist <= d.reach + 1.3) {
      api.use(meleeN, { x: pe.x, z: pe.z });
      facePt = pe; acted = true; pressMove = true;
    }
  }

  // dash engage
  if (!acted && dashN && api.ready(dashN) && en.visible && !en.invulnerable && !en.airborne) {
    const d = mine[dashN];
    const near = meleeN ? mine[meleeN].reach - 0.4 : 2.6;
    const worth = dist > near && dist <= d.reach - 0.9;
    const good = !eThreat || en.stunned || en.rooted || actImmune || behind || stale || (coneIncoming === 0 && dist > threatR + 1.5);
    if (worth && good) {
      const pe = predOf(d.windup + 0.18);
      api.use(dashN, { x: pe.x, z: pe.z });
      facePt = pe; acted = true; pressMove = true;
      if (eThreat && !en.stunned) retreatUntil = p.t + 1.0;
    }
  }

  // ranged poke
  if (!acted && rangedN && api.ready(rangedN) && en.visible && !en.invulnerable) {
    const d = mine[rangedN];
    if (dist <= d.reach - 0.4) {
      const sp = d.speed || 0;
      let pe;
      if (sp > 0) pe = V.lead(here, there, { x: en.vx || 0, z: en.vz || 0 }, sp);
      else pe = predOf(d.windup);
      if (!pe) pe = there;
      api.use(rangedN, { x: pe.x, z: pe.z });
      facePt = pe; acted = true;
    }
  }

  // support: heal / shield when safe
  if (!acted && supN && api.ready(supN)) {
    const missing = me.maxHp - me.hp;
    const safeGap = dist > threatR + 3.4 || !en.visible || en.stunned || (en.rooted && dist > threatR + 1.0);
    const noIncoming = coneIncoming === 0 && dodgeUntil < p.t;
    const worth = missing >= 9 || (me.shield || 0) < 1.5;
    if (safeGap && noIncoming && worth) {
      api.use(supN);
      acted = true;
    }
  }

  // ---- movement ----
  let mv = null;
  if (dodgeUntil > p.t && dodgeDir) {
    mv = dodgeDir;
  } else if (retreatUntil > p.t) {
    mv = safeDir(p, api, awayEn);
  } else if (pressMove) {
    mv = toEn;
  } else if (!en.visible && dist > 3) {
    stepTo(p, api, en.x, en.z);
  } else if (dist > want + 0.8) {
    if (en.visible) {
      let r = null;
      try { r = api.ray(toEn.x, toEn.z, Math.min(dist, 12)); } catch (e) { r = null; }
      if (r && r.hit && r.dist < dist - 1.2) stepTo(p, api, en.x, en.z);
      else mv = toEn;
    } else stepTo(p, api, en.x, en.z);
  } else if (dist < want - 0.8) {
    mv = safeDir(p, api, awayEn);
  } else {
    if (strafeUntil < p.t || p.t - blockedAt < 0.2) {
      strafeSide = api.rand() < 0.5 ? 1 : -1;
      strafeUntil = p.t + 0.9 + api.rand() * 1.1;
      blockedAt = -99;
    }
    const lat = V.scale(V.perp(toEn), strafeSide);
    const radial = Math.max(-1, Math.min(1, (dist - want) / 2.2));
    let d = V.norm(V.add(lat, V.scale(toEn, radial)));
    let r = null;
    try { r = api.ray(d.x, d.z, 3.2); } catch (e) { r = null; }
    if (r && r.hit && r.dist < 2.2) {
      strafeSide = -strafeSide;
      strafeUntil = p.t + 1.0;
      d = V.norm(V.add(V.scale(V.perp(toEn), strafeSide), V.scale(toEn, radial)));
    }
    const lim = (p.arena.half || 20) - 2.0;
    if (Math.abs(me.x + d.x * 3) > lim || Math.abs(me.z + d.z * 3) > lim) {
      d = V.norm(V.add(d, V.scale(V.toward(here, { x: 0, z: 0 }), 1.1)));
    }
    mv = d;
  }
  if (mv) api.move(mv.x, mv.z);

  // ---- facing ----
  if (!acted) {
    const w = meleeN ? mine[meleeN].windup : 0.2;
    const fp = predOf(w);
    api.faceAt(fp.x, fp.z);
  } else if (facePt) {
    api.faceAt(facePt.x, facePt.z);
  }

  // ---- flavour ----
  if (p.t - talkAt > 7) {
    talkAt = p.t;
    if (myFrac > enFrac + 0.15) api.say("You bleed faster than I do. Keep running.");
    else if (myFrac + 0.15 < enFrac) api.say("Still standing. That is the whole trick.");
    else if (!eThreat) api.say("Your guard is spent. Mine is not.");
    else api.say("Come inside the reach. I will make room.");
  }
}