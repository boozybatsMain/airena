const LASER_CAST = 0.667;

let lastUse = { charge: -99, smash: -99, jump: -99 };
let chargeInfo = null;
let tanSign = 1;
let lastFlip = -99;
let saidAt = -99;

function clr(api, d, max) {
  const r = api.ray(d.x, d.z, max);
  return r && typeof r.dist === 'number' ? Math.min(r.dist, max) : max;
}

function wallMargin(x, z) {
  return Math.min(20 - Math.abs(x), 20 - Math.abs(z));
}

function pickDir(p, api, desired) {
  const me = p.self;
  if (!desired || (desired.x === 0 && desired.z === 0)) return { x: 0, z: 1 };
  const base = Math.atan2(desired.x, desired.z);
  let best = desired, bestS = -1e9;
  for (let i = -6; i <= 6; i++) {
    const a = base + i * 0.26;
    const d = { x: Math.sin(a), z: Math.cos(a) };
    const cl = clr(api, d, 7);
    const px = me.x + d.x * 4.5, pz = me.z + d.z * 4.5;
    let s = 2.4 * Math.cos(i * 0.26) + cl * 0.45;
    const m = wallMargin(px, pz);
    if (m < 4.5) s -= (4.5 - m) * 1.3;
    if (cl < 1.7) s -= 7;
    if (s > bestS) { bestS = s; best = d; }
  }
  return best;
}

function blinkDir(p, api, base) {
  const me = p.self, en = p.enemy;
  let best = base, bestS = -1e9;
  for (let i = 0; i < 20; i++) {
    const a = i * Math.PI / 10;
    const d = { x: Math.sin(a), z: Math.cos(a) };
    if (V.dot(d, base) < 0.05) continue;
    let nx = me.x + d.x * 7.5, nz = me.z + d.z * 7.5;
    nx = Math.max(-18.5, Math.min(18.5, nx));
    nz = Math.max(-18.5, Math.min(18.5, nz));
    const de = Math.hypot(nx - en.x, nz - en.z);
    let s = Math.min(de, 16) * 1.0 + Math.min(wallMargin(nx, nz), 8) * 0.7 + V.dot(d, base) * 2.0;
    if (s > bestS) { bestS = s; best = d; }
  }
  return best;
}

function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me || !me.alive) return;

  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      if (e.skill) lastUse[e.skill] = p.t;
      if (e.skill === 'charge') chargeInfo = { t: p.t, committed: false };
    } else if (e.type === 'enemyCommitted') {
      chargeInfo = { t: p.t, committed: true };
    } else if (e.type === 'blocked') {
      if (p.t - lastFlip > 0.6) { tanSign = -tanSign; lastFlip = p.t; }
    }
  }
  if (chargeInfo && p.t - chargeInfo.t > 1.6) chargeInfo = null;

  const dist = en.dist;
  const mePos = { x: me.x, z: me.z };
  const enPos = { x: en.x, z: en.z };
  const toE = V.toward(mePos, enPos);
  const away = { x: -toE.x, z: -toE.z };
  const ec = en.casting;
  const enSmashWind = !!(ec && ec.skill === 'smash' && ec.telegraph);
  const enChargeWind = !!(ec && ec.skill === 'charge' && ec.phase === 'windup');
  const enDash = !!(ec && ec.skill === 'charge' && ec.phase === 'dash');
  const enHelpless = en.stunned || en.airborne || (ec && ec.phase === 'recover');
  const smashReady = (p.t - lastUse.smash) > 1.22;

  // ---- aim prediction ----
  let lead = LASER_CAST + 0.03;
  if (me.casting && me.casting.skill === 'laser' && me.casting.phase === 'windup') {
    lead = Math.max(0, me.casting.remaining);
  }
  let vscale = 1;
  if (ec && ec.phase === 'windup') vscale = 0.25;
  if (en.stunned) vscale = 0.2;
  const ax = en.x + en.vx * lead * vscale;
  const az = en.z + en.vz * lead * vscale;

  // ---- tangential side with hysteresis ----
  const tA = V.perp(toE);
  const tB = { x: -tA.x, z: -tA.z };
  const sideScore = (d) => {
    const cl = clr(api, d, 8);
    const px = me.x + d.x * 6, pz = me.z + d.z * 6;
    return cl + Math.min(wallMargin(px, pz), 7);
  };
  const cur = tanSign > 0 ? tA : tB;
  const oth = tanSign > 0 ? tB : tA;
  if (sideScore(oth) > sideScore(cur) + 3 && p.t - lastFlip > 0.4) {
    tanSign = -tanSign; lastFlip = p.t;
  }
  const tan = tanSign > 0 ? tA : tB;

  // ---- desired movement ----
  let desired;
  const dodgeCharge = (enChargeWind || enDash || (chargeInfo && chargeInfo.committed && p.t - chargeInfo.t < 0.9));
  let perp = null;
  if (dodgeCharge) {
    let cd;
    if (enDash && (Math.abs(en.vx) + Math.abs(en.vz)) > 1) cd = V.norm({ x: en.vx, z: en.vz });
    else cd = V.fromHeading(en.heading);
    perp = V.perp(cd);
    const rel = V.sub(mePos, enPos);
    if (V.dot(rel, perp) < 0) perp = { x: -perp.x, z: -perp.z };
    desired = V.norm(V.add(V.scale(perp, 1.0), V.scale(away, dist < 8 ? 0.6 : 0.3)));
  } else {
    let wA, wT;
    if (dist < 6) { wA = 1.7; wT = 0.65; }
    else if (dist < 10) { wA = 1.15; wT = 0.9; }
    else if (dist < 15) { wA = 0.45; wT = 1.0; }
    else if (dist < 19) { wA = 0.05; wT = 1.0; }
    else { wA = -0.55; wT = 0.8; }
    if (!en.visible && dist > 15) { wA = -0.8; wT = 0.5; }
    const r = Math.hypot(me.x, me.z);
    const wC = Math.max(0, (r - 11) / 9) * 1.4;
    const cDir = r > 0.5 ? { x: -me.x / r, z: -me.z / r } : { x: 0, z: 0 };
    desired = V.norm(V.add(V.add(V.scale(away, wA), V.scale(tan, wT)), V.scale(cDir, wC)));
  }
  const moveDir = pickDir(p, api, desired);

  // ---- skill decision (one per thought) ----
  let used = false;
  const free = !me.busy && !me.stunned && !me.airborne;

  if (free && enSmashWind && dist < 6.8) {
    if (api.ready('blink')) {
      const bd = blinkDir(p, api, away);
      api.use('blink', bd.x, bd.z); used = true;
    } else if (api.ready('jump')) {
      api.use('jump'); used = true;
    }
  }

  if (!used && free && api.ready('blink') && dist < 12 &&
      (enDash || (enChargeWind && ec && ec.remaining < 0.13))) {
    const bd = blinkDir(p, api, perp ? V.norm(V.add(V.scale(perp, 1.0), V.scale(away, 0.35))) : away);
    api.use('blink', bd.x, bd.z); used = true;
  }

  if (!used && free && dist < 5.0 && api.ready('blink') && !enHelpless) {
    const bd = blinkDir(p, api, away);
    api.use('blink', bd.x, bd.z); used = true;
  }

  if (!used && free && api.ready('laser')) {
    let ok = en.visible && dist > 2.4 && dist < 22.5 && api.los(ax, az);
    if (ok && (enDash || enChargeWind) && dist < 16) ok = false;
    if (ok && dist < 8.8 && !enHelpless) {
      const punishWindow = (p.t - lastUse.smash) < 0.9;
      if (!punishWindow && smashReady) ok = false;
    }
    if (ok) { api.use('laser'); used = true; }
  }

  if (!used && free && dist < 4.2 && !api.ready('blink') && api.ready('jump') && smashReady && !enHelpless) {
    api.use('jump'); used = true;
  }

  api.move(moveDir.x, moveDir.z);
  api.faceAt(ax, az);

  if (p.t - saidAt > 9) {
    saidAt = p.t;
    api.say(dist > 12 ? "eight arms, one beam" : "too close, ape");
  }
}
