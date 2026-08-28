const TWO_PI = Math.PI * 2;
const CAST = 0.667;
const CHARGE_CD = 4.033;
const SMASH_CD = 1.3;

let mem = null;

function initMem() {
  mem = {
    lastCharge: -99,
    lastSmash: -99,
    lastJumpE: -99,
    hits: 0,
    misses: 0,
    blocked: 0,
    jitter: 0,
    said: false
  };
}

function inBlock(p, x, z, m) {
  for (const o of p.arena.obstacles) {
    if (Math.abs(x - o.x) < o.hx + m && Math.abs(z - o.z) < o.hz + m) return true;
  }
  return false;
}

function kiteDir(p, api, ideal, lateralBias) {
  const s = p.self, e = p.enemy;
  let best = { x: 0, z: 0 }, bs = -1e9;
  const sp = s.speed;
  const cur = sp > 0.6 ? { x: s.vx / sp, z: s.vz / sp } : null;
  const toE = V.toward({ x: s.x, z: s.z }, { x: e.x, z: e.z });
  for (let i = 0; i < 24; i++) {
    const a = i * TWO_PI / 24;
    const d = { x: Math.sin(a), z: Math.cos(a) };
    const probe = 3.2;
    let sc = 0;
    const r = api.ray(d.x, d.z, probe);
    if (r && r.hit) sc -= (probe - r.dist + 1.0) * 9;
    const nx = s.x + d.x * probe, nz = s.z + d.z * probe;
    const nd = Math.hypot(nx - e.x, nz - e.z);
    sc += (nd < ideal) ? nd * 4.0 : ideal * 4.0 - (nd - ideal) * 1.4;
    const mg = Math.min(20 - Math.abs(nx), 20 - Math.abs(nz));
    if (mg < 4.5) sc -= (4.5 - mg) * (4.5 - mg) * 2.2;
    if (cur) sc += (d.x * cur.x + d.z * cur.z) * 1.6;
    if (lateralBias > 0) {
      const par = d.x * toE.x + d.z * toE.z;
      sc += (1 - Math.abs(par)) * lateralBias;
    }
    if (sc > bs) { bs = sc; best = d; }
  }
  return best;
}

function bestBlink(p, mode, chDir) {
  const s = p.self, e = p.enemy;
  let best = null, bs = -1e9;
  for (let i = 0; i < 24; i++) {
    const a = i * TWO_PI / 24;
    const d = { x: Math.sin(a), z: Math.cos(a) };
    let lx = s.x + d.x * 7.3, lz = s.z + d.z * 7.3;
    let steps = 0;
    while ((inBlock(p, lx, lz, 1.15) || Math.abs(lx) > 19 || Math.abs(lz) > 19) && steps < 14) {
      lx -= d.x * 0.6; lz -= d.z * 0.6; steps++;
    }
    const moved = Math.hypot(lx - s.x, lz - s.z);
    let sc = moved * 0.6;
    if (moved < 2.2) sc -= 30;
    const ed = Math.hypot(lx - e.x, lz - e.z);
    if (mode === 'charge' && chDir) {
      const rx = lx - e.x, rz = lz - e.z;
      let tt = rx * chDir.x + rz * chDir.z;
      if (tt < 0) tt = 0; else if (tt > 13) tt = 13;
      const px = e.x + chDir.x * tt, pz = e.z + chDir.z * tt;
      const pd = Math.hypot(lx - px, lz - pz);
      sc += Math.min(pd, 7) * 5.0 + Math.min(ed, 16) * 1.0;
    } else {
      sc += Math.min(ed, 18) * 3.0;
    }
    const mg = Math.min(20 - Math.abs(lx), 20 - Math.abs(lz));
    if (mg < 3.5) sc -= (3.5 - mg) * (3.5 - mg) * 3;
    if (sc > bs) { bs = sc; best = d; }
  }
  return best || { x: -1, z: 0 };
}

function think(p, api) {
  if (!mem || p.tick <= 2) initMem();
  const s = p.self, e = p.enemy, t = p.t;

  for (const ev of p.events) {
    if (ev.type === 'enemyStarted') {
      if (ev.skill === 'charge') mem.lastCharge = t;
      else if (ev.skill === 'smash') mem.lastSmash = t;
      else if (ev.skill === 'jump') mem.lastJumpE = t;
    } else if (ev.type === 'dealt') mem.hits++;
    else if (ev.type === 'missed' && ev.skill === 'laser') mem.misses++;
    else if (ev.type === 'blocked') mem.blocked++;
  }

  if (!s.alive) return;

  const dist = e.dist;
  const chargeReady = (t - mem.lastCharge) >= CHARGE_CD - 0.2;
  const smashReady = (t - mem.lastSmash) >= SMASH_CD - 0.1;
  const ec = e.casting;
  const chargeDash = !!(ec && ec.skill === 'charge' && ec.phase === 'dash');
  const chargeWind = !!(ec && ec.skill === 'charge' && ec.phase === 'windup');
  const chargeLate = chargeWind && ec.remaining <= 0.14;
  const smashWind = !!(ec && ec.skill === 'smash' && ec.telegraph);

  // ---------- aiming ----------
  const casting = s.casting && s.casting.skill === 'laser' && s.casting.telegraph;
  let lead;
  if (casting) lead = Math.max(0, s.casting.remaining);
  else if (api.cooldown('laser') < 0.3) lead = CAST;
  else lead = 0.2;
  if (lead > 0.8) lead = 0.8;
  let damp = e.busy || e.airborne || e.stunned ? 1.0 : 0.72;
  const fex = e.x + e.vx * lead * damp;
  const fez = e.z + e.vz * lead * damp;
  const fsx = s.x + s.vx * lead * 0.6;
  const fsz = s.z + s.vz * lead * 0.6;
  let adx = fex - fsx, adz = fez - fsz;
  if (adx === 0 && adz === 0) { adx = e.x - s.x; adz = e.z - s.z; }
  api.face(adx, adz);

  // ---------- distance goal ----------
  let ideal;
  if (chargeReady) ideal = 16.0;
  else if (smashReady) ideal = 10.5;
  else ideal = 8.5;
  if (!e.visible) ideal = Math.min(ideal, 11.0);
  if (p.burn > 0 && s.hp / s.maxHp < e.hp / e.maxHp) ideal = Math.min(ideal, 13.0);

  // ---------- movement ----------
  let moveDir;
  if (chargeDash || chargeLate) {
    const ch = V.fromHeading(e.heading);
    const perp = V.perp(ch);
    const cand = [perp, { x: -perp.x, z: -perp.z }];
    let bd = cand[0], bsv = -1e9;
    for (const d of cand) {
      const nx = s.x + d.x * 3.0, nz = s.z + d.z * 3.0;
      let sv = 0;
      const r = api.ray(d.x, d.z, 3.0);
      if (r && r.hit) sv -= (3.0 - r.dist + 1) * 9;
      const mg = Math.min(20 - Math.abs(nx), 20 - Math.abs(nz));
      if (mg < 4) sv -= (4 - mg) * (4 - mg) * 2;
      sv += Math.hypot(nx - e.x, nz - e.z) * 0.4;
      if (sv > bsv) { bsv = sv; bd = d; }
    }
    moveDir = bd;
  } else {
    moveDir = kiteDir(p, api, ideal, e.visible ? 0 : 3.0);
  }
  if (mem.blocked > 6) {
    mem.jitter = 12;
    mem.blocked = 0;
  }
  if (mem.jitter > 0) {
    mem.jitter--;
    moveDir = V.rot(moveDir, (api.rand() - 0.5) * 1.6);
  }
  api.move(moveDir.x, moveDir.z);

  // ---------- skills ----------
  if (s.stunned || s.airborne) return;

  const canAct = !s.busy;

  // 1. dodge a committed charge
  if ((chargeDash || chargeLate) && dist < 17 && api.ready('blink') && canAct) {
    const ch = V.fromHeading(e.heading);
    const d = bestBlink(p, 'charge', ch);
    api.use('blink', d.x, d.z);
    return;
  }

  // 2. hop over an incoming smash
  if (smashWind && dist < 7.6 && canAct) {
    if (api.ready('jump')) { api.use('jump'); return; }
    if (api.ready('blink')) {
      const d = bestBlink(p, 'away', null);
      api.use('blink', d.x, d.z);
      return;
    }
  }

  // 3. too close for comfort — teleport out
  if (canAct && api.ready('blink') && dist < 6.0) {
    const d = bestBlink(p, 'away', null);
    api.use('blink', d.x, d.z);
    return;
  }

  // 4. shoot
  const danger =
    (chargeWind && dist < 15.5) ||
    (chargeDash && dist < 20) ||
    (smashWind && dist < 8.5) ||
    (dist < 6.8 && smashReady);
  if (canAct && api.ready('laser') && e.visible && !danger && dist > 2.5 && dist < 21.5) {
    api.use('laser');
    return;
  }

  // 5. reposition blink when pinned and charge is spent
  if (canAct && api.ready('blink') && !chargeReady && dist < 6.5) {
    const d = bestBlink(p, 'away', null);
    api.use('blink', d.x, d.z);
    return;
  }
  if (canAct && api.ready('blink') && chargeReady && dist < 9.5 && api.cooldown('laser') > 0.5) {
    const d = bestBlink(p, 'away', null);
    api.use('blink', d.x, d.z);
    return;
  }

  if (!mem.said) {
    mem.said = true;
    api.say("eight arms, one beam");
  }
}
