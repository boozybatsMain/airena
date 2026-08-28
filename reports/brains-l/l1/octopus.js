function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me || !en || !me.alive) return;
  const t = p.t;

  // ---- events ----
  for (const e of p.events) {
    const ty = e.type;
    if (ty === 'enemyStarted') {
      if (e.skill === 'charge') lastChargeStart = t;
      else if (e.skill === 'smash') lastSmashStart = t;
      else if (e.skill === 'jump') lastEJump = t;
    } else if (ty === 'blocked') {
      strafeSign = -strafeSign;
      strafeUntil = t + 1.1;
    } else if (ty === 'damaged') {
      if (e.skill === 'smash' && t > strafeUntil - 0.6) { strafeSign = -strafeSign; strafeUntil = t + 1.0; }
    } else if (ty === 'missed' && e.skill === 'laser') {
      missCount++;
    }
  }

  if (t > strafeUntil) {
    strafeSign = api.rand() < 0.5 ? -1 : 1;
    strafeUntil = t + 1.3 + api.rand() * 1.5;
  }

  const chargeReady = (t - lastChargeStart) >= 3.85;
  const ec = en.casting;
  const chargePhase = ec && ec.skill === 'charge' ? ec.phase : null;
  const chargeThreat = chargePhase === 'windup' || chargePhase === 'dash';
  const smashWind = ec && ec.skill === 'smash' && ec.phase === 'windup';

  const mePos = { x: me.x, z: me.z };
  const enPos = { x: en.x, z: en.z };
  const toE = unit(en.x - me.x, en.z - me.z);
  const awayE = { x: -toE.x, z: -toE.z };
  const dist = en.dist;

  // ---------- 1. CHARGE EVASION ----------
  if (chargeThreat && dist < 17) {
    const eh = V.fromHeading(en.heading);
    const side = pickSide(me, eh, en);
    const dodge = unit(side.x * 1.0 + awayE.x * 0.35, side.z * 1.0 + awayE.z * 0.35);
    const locked = chargePhase === 'dash' || (ec.remaining !== undefined && ec.remaining <= 0.11);
    if (locked && !me.busy && !me.stunned && api.ready('blink')) {
      api.use('blink', dodge.x, dodge.z);
      api.face(dodge.x, dodge.z);
      return;
    }
    api.move(steer(api, me, dodge).x, steer(api, me, dodge).z);
    api.faceAt(en.x, en.z);
    return;
  }

  // ---------- 2. SMASH EVASION ----------
  if (smashWind && dist < 7.0 && !me.busy && !me.stunned) {
    const side = { x: toE.z * strafeSign, z: -toE.x * strafeSign };
    const out = unit(awayE.x * 1.0 + side.x * 0.8, awayE.z * 1.0 + side.z * 0.8);
    const mv = steer(api, me, out);
    api.move(mv.x, mv.z);
    api.faceAt(en.x, en.z);
    if (dist < 6.0) {
      if (api.ready('jump')) api.use('jump');
      else if (api.ready('blink')) api.use('blink', out.x, out.z);
    }
    return;
  }

  // ---------- aim solution ----------
  const castLeft = (me.casting && me.casting.skill === 'laser') ? Math.max(0, me.casting.remaining || 0) : 0.65;
  let leadF = 0.62;
  if (en.airborne) leadF = 1.0;
  if (chargePhase === 'dash') leadF = 1.0;
  const aim = { x: en.x + en.vx * castLeft * leadF, z: en.z + en.vz * castLeft * leadF };
  const toAim = unit(aim.x - me.x, aim.z - me.z);
  const angErr = Math.abs(V.angleTo(me.heading, toAim));

  // ---------- 3. MAINTAIN AN ACTIVE CAST ----------
  if (me.casting && me.casting.skill === 'laser') {
    api.faceAt(aim.x, aim.z);
    const side = { x: toE.z * strafeSign, z: -toE.x * strafeSign };
    let d;
    if (dist < 11) d = unit(awayE.x * 1.1 + side.x * 0.5, awayE.z * 1.1 + side.z * 0.5);
    else d = unit(side.x * 0.8 + awayE.x * 0.3, side.z * 0.8 + awayE.z * 0.3);
    const mv = steer(api, me, wallBias(me, d));
    api.move(mv.x, mv.z);
    return;
  }

  // ---------- 4. FIRE ----------
  const enRecover = ec && (ec.phase === 'recover' || ec.phase === 'air');
  const helpless = en.stunned || en.airborne || enRecover;
  const safeFromCharge = !chargeReady || dist > 13.0 || helpless;
  const safeFromSmash = dist > 7.2 || helpless;
  if (!me.busy && !me.stunned && !me.airborne &&
      api.ready('laser') && en.visible && dist < 23.5 && dist > 2.0 &&
      angErr < 1.0 && safeFromCharge && safeFromSmash && api.los(aim.x, aim.z)) {
    api.use('laser');
    api.faceAt(aim.x, aim.z);
    const side = { x: toE.z * strafeSign, z: -toE.x * strafeSign };
    const d = unit(side.x * 0.7 + awayE.x * 0.7, side.z * 0.7 + awayE.z * 0.7);
    const mv = steer(api, me, wallBias(me, d));
    api.move(mv.x, mv.z);
    return;
  }

  // ---------- 5. PANIC BLINK ----------
  if (!me.busy && !me.stunned && dist < 3.2 && api.ready('blink') && (!chargeReady || me.hp < 55)) {
    const side = { x: toE.z * strafeSign, z: -toE.x * strafeSign };
    const out = unit(awayE.x + side.x * 0.7, awayE.z + side.z * 0.7);
    api.use('blink', out.x, out.z);
    api.face(out.x, out.z);
    return;
  }

  // ---------- 6. KITE ----------
  api.faceAt(aim.x, aim.z);
  if (me.airborne || me.busy) return;

  const want = chargeReady ? 14.5 : 10.5;
  const side = { x: toE.z * strafeSign, z: -toE.x * strafeSign };
  let radial = 0;
  if (dist < want - 1.2) radial = -1.15;
  else if (dist > want + 2.5) radial = 0.95;

  if (!en.visible) {
    if (dist > 8.5) {
      api.moveTo(en.x, en.z);
      return;
    } else {
      radial = 0;
    }
  }

  let d = { x: toE.x * radial + side.x * 1.0, z: toE.z * radial + side.z * 1.0 };
  d = wallBias(me, d);
  const mv = steer(api, me, d);
  api.move(mv.x, mv.z);
}

let lastChargeStart = -99;
let lastSmashStart = -99;
let lastEJump = -99;
let strafeSign = 1;
let strafeUntil = 0;
let missCount = 0;

function unit(x, z) {
  const l = Math.hypot(x, z);
  if (l < 1e-6) return { x: 0, z: 0 };
  return { x: x / l, z: z / l };
}

function wallBias(me, d) {
  let x = d.x, z = d.z;
  const ax = Math.abs(me.x), az = Math.abs(me.z);
  if (ax > 14) x += -Math.sign(me.x) * (0.35 + (ax - 14) * 0.42);
  if (az > 14) z += -Math.sign(me.z) * (0.35 + (az - 14) * 0.42);
  return unit(x, z);
}

function pickSide(me, eh, en) {
  const p1 = { x: eh.z, z: -eh.x };
  const p2 = { x: -eh.z, z: eh.x };
  const s1 = scoreSpot(me.x + p1.x * 7.0, me.z + p1.z * 7.0, en);
  const s2 = scoreSpot(me.x + p2.x * 7.0, me.z + p2.z * 7.0, en);
  return s1 >= s2 ? p1 : p2;
}

function scoreSpot(x, z, en) {
  let s = 0;
  s -= Math.max(0, Math.abs(x) - 15) * 3;
  s -= Math.max(0, Math.abs(z) - 15) * 3;
  s += Math.min(14, Math.hypot(x - en.x, z - en.z)) * 0.5;
  return s;
}

function steer(api, me, dir) {
  const d = unit(dir.x, dir.z);
  if (d.x === 0 && d.z === 0) return d;
  const angles = [0, 0.35, -0.35, 0.7, -0.7, 1.05, -1.05, 1.5, -1.5, 2.1, -2.1, 2.8, -2.8];
  for (const a of angles) {
    const c = V.rot(d, a);
    const r = api.ray(c.x, c.z, 3.0);
    const px = me.x + c.x * 2.8, pz = me.z + c.z * 2.8;
    if (r && r.dist > 2.55 && Math.abs(px) < 19.0 && Math.abs(pz) < 19.0) return c;
  }
  return d;
}
