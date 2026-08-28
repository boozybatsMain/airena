const OBS_PAD = 1.06;

function perpOf(v) { return { x: v.z, z: -v.x }; }

function clampArena(p, x, z) {
  const h = p.arena.half - 1.05;
  return { x: Math.max(-h, Math.min(h, x)), z: Math.max(-h, Math.min(h, z)) };
}

function pointBlocked(p, x, z) {
  const h = p.arena.half - 1.02;
  if (Math.abs(x) > h || Math.abs(z) > h) return true;
  for (const o of p.arena.obstacles) {
    if (Math.abs(x - o.x) < o.hx + OBS_PAD && Math.abs(z - o.z) < o.hz + OBS_PAD) return true;
  }
  return false;
}

function blinkLand(p, dir) {
  let d = 7.5;
  while (d > 0.6) {
    const x = p.self.x + dir.x * d, z = p.self.z + dir.z * d;
    if (!pointBlocked(p, x, z)) return { x, z, d };
    d -= 0.5;
  }
  return { x: p.self.x, z: p.self.z, d: 0 };
}

function chooseBlink(p, line) {
  let best = null, bs = -1e9;
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8;
    const dir = { x: Math.sin(a), z: Math.cos(a) };
    const L = blinkLand(p, dir);
    if (L.d < 2.5) continue;
    let sc = L.d * 0.6;
    const de = Math.hypot(L.x - p.enemy.x, L.z - p.enemy.z);
    sc += Math.min(de, 15) * 1.1;
    if (line) {
      const rx = L.x - line.o.x, rz = L.z - line.o.z;
      const along = rx * line.d.x + rz * line.d.z;
      const lat = Math.abs(rx * line.d.z - rz * line.d.x);
      sc += along < 0 ? 8 : Math.min(lat, 7) * 2.2;
    }
    if (Math.abs(L.x) > 16.5 || Math.abs(L.z) > 16.5) sc -= 5;
    if (sc > bs) { bs = sc; best = dir; }
  }
  return best;
}

function clearDir(api, p, desired, probe) {
  const base = V.norm(desired);
  if (base.x === 0 && base.z === 0) return { x: 0, z: 0 };
  let best = base, bs = -1e9;
  for (let k = 0; k <= 6; k++) {
    const signs = k === 0 ? [1] : [1, -1];
    for (const s of signs) {
      const d = V.rot(base, s * k * (Math.PI / 8));
      let free;
      try { free = api.ray(d.x, d.z, probe).dist; } catch (e) { free = probe; }
      let sc = Math.min(free, probe) * 1.6 + V.dot(d, base) * 5;
      const nx = p.self.x + d.x * probe, nz = p.self.z + d.z * probe;
      const h = p.arena.half - 1.4;
      if (Math.abs(nx) > h || Math.abs(nz) > h) sc -= 7;
      if (free < 1.6) sc -= 8;
      if (sc > bs) { bs = sc; best = d; }
    }
  }
  return best;
}

let strafe = 1;
let lastFlip = 0;
let lastChargeStart = -99;
let lastSmashStart = -99;
let spoke = 0;

function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en) return;

  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      if (e.skill === 'charge') lastChargeStart = p.t;
      else if (e.skill === 'smash') lastSmashStart = p.t;
    } else if (e.type === 'blocked') {
      if (p.t - lastFlip > 0.4) { strafe = -strafe; lastFlip = p.t; }
    }
  }

  const dist = en.dist;
  const toEn = V.toward(me, en);
  const away = { x: -toEn.x, z: -toEn.z };
  const chargeReady = (p.t - lastChargeStart) > 3.7;

  // ---- facing / lead ----
  let leadT = 0.72;
  if (me.casting && me.casting.skill === 'laser' && me.casting.phase === 'windup') {
    leadT = Math.max(0.05, me.casting.remaining + 0.04);
  }
  const rawLead = { x: en.x + en.vx * leadT, z: en.z + en.vz * leadT };
  const lead = clampArena(p, rawLead.x, rawLead.z);
  api.faceAt(lead.x, lead.z);

  if (me.airborne || me.stunned) return;

  const enCharge = en.casting && en.casting.skill === 'charge';
  const enSmash = en.casting && en.casting.skill === 'smash' && en.casting.telegraph;

  // ---- defensive skill selection ----
  let skill = null, ba = 0, bb = 0;

  if (api.ready('blink')) {
    if (enCharge && (en.casting.phase !== 'windup' || en.casting.remaining < 0.13)) {
      const d = V.fromHeading(en.heading);
      const rx = me.x - en.x, rz = me.z - en.z;
      const along = rx * d.x + rz * d.z;
      const lat = Math.abs(rx * d.z - rz * d.x);
      if (along > -2.5 && along < 15 && lat < 3.8) {
        const b = chooseBlink(p, { o: { x: en.x, z: en.z }, d });
        if (b) { skill = 'blink'; ba = b.x; bb = b.z; }
      }
    }
    if (!skill && !me.busy && dist < 4.4 && !en.stunned && !en.airborne) {
      const b = chooseBlink(p, null);
      if (b) { skill = 'blink'; ba = b.x; bb = b.z; }
    }
    if (!skill && !me.busy && enSmash && dist < 5.6 && !api.ready('jump')) {
      const b = chooseBlink(p, null);
      if (b) { skill = 'blink'; ba = b.x; bb = b.z; }
    }
  }

  if (!skill && !me.busy && enSmash && dist < 7 && en.casting.remaining > 0.13 && api.ready('jump')) {
    skill = 'jump';
  }

  // ---- offense ----
  const safeCast = dist > 8.6 || en.stunned || en.airborne;
  if (!skill && !me.busy && api.ready('laser') && en.visible && dist < 23 && dist > 2.2 && safeCast && !enCharge) {
    const dirLead = V.toward(me, lead);
    const err = Math.abs(V.angleTo(me.heading, dirLead));
    if (err < 0.32 && api.los(lead.x, lead.z)) skill = 'laser';
  }

  if (skill === 'blink') api.use('blink', ba, bb);
  else if (skill) api.use(skill);

  // ---- movement ----
  let desiredDist = chargeReady ? 13.5 : 9.0;
  if (me.hp < 55) desiredDist += 2.5;
  if (!en.visible) desiredDist = Math.min(desiredDist, 11);

  let mv;
  if (enCharge) {
    const d = V.fromHeading(en.heading);
    const pd = perpOf(d);
    const lat = (me.x - en.x) * d.z - (me.z - en.z) * d.x;
    const side = lat >= 0 ? 1 : -1;
    mv = V.add(V.scale(pd, side * 1.0), V.scale(away, 0.45));
  } else if (!en.visible && dist > 6.5) {
    const q = clampArena(p, en.x + away.x * desiredDist, en.z + away.z * desiredDist);
    api.moveTo(q.x, q.z);
    mv = null;
  } else {
    let radial = (dist - desiredDist) / 5;
    radial = Math.max(-1, Math.min(1, radial));
    const pd = perpOf(toEn);
    let sRay;
    try { sRay = api.ray(pd.x * strafe, pd.z * strafe, 3).dist; } catch (e) { sRay = 3; }
    if (sRay < 2.0 && p.t - lastFlip > 0.35) { strafe = -strafe; lastFlip = p.t; }
    mv = V.add(V.scale(toEn, radial), V.scale(pd, strafe * 0.85));
  }

  if (mv) {
    const wp = { x: 0, z: 0 };
    const lim = 14.5;
    if (me.x > lim) wp.x -= (me.x - lim) / 4;
    if (me.x < -lim) wp.x += (-me.x - lim) / 4;
    if (me.z > lim) wp.z -= (me.z - lim) / 4;
    if (me.z < -lim) wp.z += (-me.z - lim) / 4;
    mv = V.add(mv, V.scale(wp, 1.6));
    if (V.len(mv) < 0.01) mv = away;
    const d = clearDir(api, p, mv, 3);
    api.move(d.x, d.z);
  }

  if (spoke === 0 && p.t > 1) { spoke = 1; api.say("eight arms, one beam"); }
  else if (spoke === 1 && en.hp < en.maxHp * 0.4) { spoke = 2; api.say("hold still, ape"); }
}
