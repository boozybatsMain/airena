const OBS_FALLBACK = [
  { x: -7, z: -3, hx: 1.2, hz: 3.5 },
  { x: 7, z: 3, hx: 1.2, hz: 3.5 },
  { x: 0, z: -10, hx: 3.6, hz: 1.2 },
  { x: 0, z: 10, hx: 3.6, hz: 1.2 },
  { x: -12.5, z: 11, hx: 1.6, hz: 1.6 },
  { x: 12.5, z: -11, hx: 1.6, hz: 1.6 }
];

const M = freshMem();

function freshMem() {
  return {
    lastT: 0,
    chargeStart: -99,
    chargeCommit: -99,
    chargeDir: null,
    chargeOrigin: null,
    smashStart: -99,
    lastSeen: null,
    prevDir: { x: 0, z: 1 },
    blockedT: -99,
    jitter: 0,
    lastSay: -99,
    lasersFired: 0
  };
}

function resetMem() {
  const f = freshMem();
  for (const k of Object.keys(f)) M[k] = f[k];
}

function segHitsBox(ax, az, bx, bz, o) {
  const dx = bx - ax, dz = bz - az;
  let t0 = 0, t1 = 1;
  const minx = o.x - o.hx, maxx = o.x + o.hx, minz = o.z - o.hz, maxz = o.z + o.hz;
  if (Math.abs(dx) < 1e-9) {
    if (ax < minx || ax > maxx) return false;
  } else {
    let ta = (minx - ax) / dx, tb = (maxx - ax) / dx;
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return false;
  }
  if (Math.abs(dz) < 1e-9) {
    if (az < minz || az > maxz) return false;
  } else {
    let ta = (minz - az) / dz, tb = (maxz - az) / dz;
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return false;
  }
  return t0 <= t1;
}

function clearLine(ax, az, bx, bz, obs) {
  for (const o of obs) if (segHitsBox(ax, az, bx, bz, o)) return false;
  return true;
}

function unit(v) {
  const l = Math.hypot(v.x, v.z);
  if (l < 1e-9) return { x: 0, z: 1 };
  return { x: v.x / l, z: v.z / l };
}

function insideScore(x, z) {
  const m = Math.min(20 - Math.abs(x), 20 - Math.abs(z));
  return m;
}

function think(p, api) {
  const S = p.self;
  const E = p.enemy;
  if (!S || !S.alive) return;
  if (p.t + 0.05 < M.lastT) resetMem();
  M.lastT = p.t;

  const obs = (p.arena && p.arena.obstacles && p.arena.obstacles.length) ? p.arena.obstacles : OBS_FALLBACK;

  // ---- events ----
  for (const ev of p.events) {
    if (ev.type === 'enemyStarted') {
      if (ev.skill === 'charge') { M.chargeStart = p.t; M.chargeCommit = -99; M.chargeDir = null; }
      else if (ev.skill === 'smash') M.smashStart = p.t;
    } else if (ev.type === 'enemyCommitted') {
      if (ev.skill === 'charge') {
        M.chargeCommit = p.t;
        M.chargeDir = V.fromHeading(E.heading);
        M.chargeOrigin = { x: E.x, z: E.z };
      }
    } else if (ev.type === 'blocked') {
      M.blockedT = p.t;
      M.jitter = (M.jitter + 1) % 4;
    }
  }

  if (E && E.visible) M.lastSeen = { x: E.x, z: E.z, t: p.t };
  const seen = M.lastSeen || { x: E ? E.x : 0, z: E ? E.z : 0, t: p.t };

  const dist = E ? E.dist : 99;
  const toE = unit({ x: (E ? E.x : 0) - S.x, z: (E ? E.z : 0) - S.z });
  const away = { x: -toE.x, z: -toE.z };

  const chargeCd = Math.max(0, M.chargeStart + 4.0 - p.t);
  const eCast = E ? E.casting : null;

  const myFrac = S.hp / S.maxHp;
  const enFrac = E ? E.hp / E.maxHp : 1;
  const winning = myFrac > enFrac + 0.04;

  let usedSkill = false;
  let moveSet = false;

  // ---- aim point ----
  let leadT = 0.65;
  if (S.casting && S.casting.skill === 'laser' && S.casting.remaining != null) leadT = S.casting.remaining;
  let leadF = 0.55;
  if (E && (E.airborne || (eCast && eCast.skill === 'charge' && eCast.phase === 'dash'))) leadF = 1.0;
  let aim = E ? { x: E.x + E.vx * leadT * leadF, z: E.z + E.vz * leadT * leadF } : { x: seen.x, z: seen.z };
  if (!clearLine(S.x, S.z, aim.x, aim.z, obs)) aim = { x: E ? E.x : seen.x, z: E ? E.z : seen.z };

  // ---- charge danger geometry ----
  let chargeDanger = false;
  let perpUnit = { x: toE.z, z: -toE.x };
  if (E && eCast && eCast.skill === 'charge') {
    const d = M.chargeDir ? M.chargeDir : V.fromHeading(E.heading);
    const rel = { x: S.x - E.x, z: S.z - E.z };
    const along = rel.x * d.x + rel.z * d.z;
    const perp = { x: rel.x - d.x * along, z: rel.z - d.z * along };
    const pd = Math.hypot(perp.x, perp.z);
    const committed = (eCast.phase === 'dash') || (eCast.phase === 'windup' && eCast.remaining != null && eCast.remaining < 0.09);
    if (committed && along > -2 && along < 14 && pd < 3.4) chargeDanger = true;
    if (pd > 0.25) perpUnit = { x: perp.x / pd, z: perp.z / pd };
    else perpUnit = { x: d.z, z: -d.x };
  }

  // ---- 1. dodge an incoming charge ----
  if (chargeDanger) {
    const optA = perpUnit;
    const optB = { x: -perpUnit.x, z: -perpUnit.z };
    const la = { x: S.x + optA.x * 7.0, z: S.z + optA.z * 7.0 };
    const lb = { x: S.x + optB.x * 7.0, z: S.z + optB.z * 7.0 };
    const pick = (insideScore(la.x, la.z) >= insideScore(lb.x, lb.z)) ? optA : optB;
    if (!S.busy && !S.airborne && !S.stunned && api.ready('blink')) {
      api.use('blink', pick.x, pick.z);
      usedSkill = true;
      if (p.t - M.lastSay > 6) { api.say('ink and vanish'); M.lastSay = p.t; }
    }
    const esc = unit({ x: pick.x * 1.0 + away.x * 0.45, z: pick.z * 1.0 + away.z * 0.45 });
    api.move(esc.x, esc.z);
    M.prevDir = esc;
    moveSet = true;
    api.faceAt(aim.x, aim.z);
    if (!usedSkill && !S.busy && !S.airborne && api.ready('laser') && E && E.visible && dist < 21) {
      // he is committed elsewhere-ish; free shot only if we already dodged wide
      if (Math.hypot(S.x - (M.chargeOrigin ? M.chargeOrigin.x : E.x), S.z - (M.chargeOrigin ? M.chargeOrigin.z : E.z)) > 13) {
        api.use('laser'); usedSkill = true;
      }
    }
    return;
  }

  // ---- 2. dodge a smash ----
  if (E && eCast && eCast.skill === 'smash' && eCast.telegraph && dist < 6.0) {
    const rem = eCast.remaining == null ? 0.2 : eCast.remaining;
    if (!S.busy && !S.airborne && !S.stunned && api.ready('jump') && rem > 0.04) {
      const esc = pickDir(p, api, obs, 30, seen, false);
      api.move(esc.x, esc.z);
      M.prevDir = esc;
      api.use('jump');
      api.faceAt(E.x, E.z);
      return;
    }
    if (!S.busy && !S.airborne && !S.stunned && api.ready('blink') && dist < 4.6) {
      const esc = bestBlink(p, api, obs);
      api.use('blink', esc.x, esc.z);
      api.move(esc.x, esc.z);
      M.prevDir = esc;
      api.faceAt(E.x, E.z);
      return;
    }
    const esc = pickDir(p, api, obs, 30, seen, false);
    api.move(esc.x, esc.z);
    M.prevDir = esc;
    api.faceAt(aim.x, aim.z);
    return;
  }

  // ---- 3. emergency separation ----
  if (E && !S.busy && !S.airborne && !S.stunned && dist < 4.3 && api.ready('blink')) {
    const esc = bestBlink(p, api, obs);
    api.use('blink', esc.x, esc.z);
    api.move(esc.x, esc.z);
    M.prevDir = esc;
    api.faceAt(E.x, E.z);
    usedSkill = true;
    moveSet = true;
  }

  // ---- 4. laser ----
  const laserReady = !usedSkill && !S.busy && !S.airborne && !S.stunned && api.ready('laser');
  if (laserReady && E && E.visible && dist > 2.0 && dist < 21.5) {
    // closing speed of the enemy toward me
    const closing = -(E.vx * toE.x + E.vz * toE.z);
    const predGap = dist - Math.max(0, closing) * 0.78 - 0.6;
    const helpless = E.stunned || E.airborne ||
      (eCast && (eCast.phase === 'recover' || (eCast.skill === 'charge' && eCast.phase === 'windup')));
    const safe = predGap > 6.4 || helpless || (dist > 5.5 && chargeCd > 1.2 && closing < 1.0);
    const ang = Math.abs(V.angleTo(S.heading, unit({ x: aim.x - S.x, z: aim.z - S.z })));
    if (safe && ang < 1.05) {
      api.use('laser');
      usedSkill = true;
      M.lasersFired++;
      if (p.t - M.lastSay > 7) { api.say('eight arms, one beam'); M.lastSay = p.t; }
    }
  }

  // ---- facing ----
  if (E && (E.visible || p.t - seen.t < 1.2)) api.faceAt(aim.x, aim.z);
  else api.faceAt(seen.x, seen.z);

  // ---- movement ----
  if (!moveSet) {
    let desired = 12.5;
    const lcd = api.cooldown('laser');
    if (lcd > 1.0) desired = 14.5;
    if (chargeCd > 1.4) desired = 9.5;
    if (S.casting && S.casting.skill === 'laser') desired = 16;
    if (winning && p.t > 38) desired = 17;
    if (!E || !E.visible) desired = Math.min(desired, 12);
    const wantShoot = lcd < 0.9 || (S.casting && S.casting.skill === 'laser');
    const dir = pickDir(p, api, obs, desired, seen, wantShoot);
    api.move(dir.x, dir.z);
    M.prevDir = dir;
  }
}

function bestBlink(p, api, obs) {
  const S = p.self, E = p.enemy;
  let best = { x: 0, z: 1 }, bs = -1e9;
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI * 2 / 16;
    const d = { x: Math.sin(a), z: Math.cos(a) };
    let lx = S.x + d.x * 7.2, lz = S.z + d.z * 7.2;
    let sc = 0;
    if (Math.abs(lx) > 18.6 || Math.abs(lz) > 18.6) sc -= 14;
    sc += Math.min(insideScore(lx, lz), 8) * 0.9;
    if (E) sc += Math.min(Math.hypot(lx - E.x, lz - E.z), 16) * 1.4;
    if (sc > bs) { bs = sc; best = d; }
  }
  return best;
}

function pickDir(p, api, obs, desired, seen, wantShoot) {
  const S = p.self, E = p.enemy;
  const ex = E && E.visible ? E.x + E.vx * 0.35 : seen.x;
  const ez = E && E.visible ? E.z + E.vz * 0.35 : seen.z;
  const dist = Math.hypot(ex - S.x, ez - S.z);
  let best = M.prevDir, bs = -1e9;
  const N = 20;
  for (let i = 0; i < N; i++) {
    const a = (i + (M.jitter * 0.12)) * Math.PI * 2 / N;
    const d = { x: Math.sin(a), z: Math.cos(a) };
    const step = 3.2;
    const cx = S.x + d.x * step, cz = S.z + d.z * step;
    let sc = 0;
    const r = api.ray(d.x, d.z, 3.8);
    sc += Math.min(r.dist, 3.8) * 1.5;
    if (r.dist < 1.4) sc -= 12;
    const nd = Math.hypot(cx - ex, cz - ez);
    sc -= Math.abs(nd - desired) * 1.15;
    if (Math.abs(cx) > 18.8 || Math.abs(cz) > 18.8) sc -= 25;
    sc += Math.min(insideScore(cx, cz), 6) * 0.9;
    sc += 1.6 * (d.x * M.prevDir.x + d.z * M.prevDir.z);
    if (dist < 7 && E) {
      const dot = d.x * ((ex - S.x) / (dist || 1)) + d.z * ((ez - S.z) / (dist || 1));
      sc -= dot * 3.5;
    }
    const clear = clearLine(cx, cz, ex, ez, obs);
    if (wantShoot) sc += clear ? 3.2 : -3.2;
    else if (dist < 10) sc += clear ? -1.4 : 1.8;
    if (sc > bs) { bs = sc; best = d; }
  }
  return best;
}
