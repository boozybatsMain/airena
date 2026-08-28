function pickDir(p, api, base, wantAway) {
  const me = p.self, en = p.enemy;
  const b = V.norm(base);
  if (b.x === 0 && b.z === 0) return { x: 0, z: 0 };
  const angs = [0, 0.35, -0.35, 0.7, -0.7, 1.05, -1.05, 1.45, -1.45, 1.9, -1.9, 2.4, -2.4];
  let best = b, bs = -1e9;
  for (const a of angs) {
    const d = V.rot(b, a);
    let clear = 7;
    try { const r = api.ray(d.x, d.z, 7); clear = Math.min(r.dist, 7); } catch (e) { clear = 7; }
    const px = me.x + d.x * 4, pz = me.z + d.z * 4;
    const wall = Math.min(20 - Math.abs(px), 20 - Math.abs(pz));
    let s = V.dot(d, b) * 3.2 + Math.min(clear, 5) * 1.1 + Math.min(wall, 4) * 0.95;
    if (clear < 2.2) s -= 9;
    if (wantAway) s += Math.min(Math.hypot(px - en.x, pz - en.z), 14) * 0.55;
    if (s > bs) { bs = s; best = d; }
  }
  return best;
}

function blinkDir(p, api, base) {
  const me = p.self, en = p.enemy;
  const b = V.norm(base);
  const angs = [0, 0.4, -0.4, 0.8, -0.8, 1.2, -1.2, 1.6, -1.6];
  let best = b, bs = -1e9;
  for (const a of angs) {
    const d = V.rot(b, a);
    let px = me.x + d.x * 7.5, pz = me.z + d.z * 7.5;
    px = Math.max(-19, Math.min(19, px));
    pz = Math.max(-19, Math.min(19, pz));
    const wall = Math.min(20 - Math.abs(px), 20 - Math.abs(pz));
    const nd = Math.hypot(px - en.x, pz - en.z);
    let s = Math.min(nd, 16) * 1.0 + Math.min(wall, 5) * 1.0 + V.dot(d, b) * 1.5;
    if (s > bs) { bs = s; best = d; }
  }
  return best;
}

let eChargeReadyAt = 0;
let eSmashReadyAt = 0;
let chargeLock = null;
let strafeSide = 1;
let lastSideFlip = -99;

function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive) return;

  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      if (e.skill === 'charge') eChargeReadyAt = p.t + 4.033;
      else if (e.skill === 'smash') eSmashReadyAt = p.t + 1.3;
    } else if (e.type === 'enemyCommitted' && e.skill === 'charge') {
      chargeLock = { x: en.x, z: en.z, dx: Math.sin(en.heading), dz: Math.cos(en.heading), t: p.t };
    } else if (e.type === 'blocked') {
      if (p.t - lastSideFlip > 0.6) { strafeSide = -strafeSide; lastSideFlip = p.t; }
    }
  }
  if (chargeLock && p.t - chargeLock.t > 1.3) chargeLock = null;

  if (!en.alive) { api.stop(); return; }

  const dist = en.dist;
  const toEn = V.toward(me, en);
  const away = V.scale(toEn, -1);
  const chargeReady = p.t >= eChargeReadyAt;

  // ---- aim point (lead the target for the cast time) ----
  let lead = 0.74;
  if (me.casting && me.casting.skill === 'laser' && me.casting.telegraph) lead = Math.min(me.casting.remaining, 0.8);
  let lx = en.vx * lead * 0.95, lz = en.vz * lead * 0.95;
  const lm = Math.hypot(lx, lz);
  if (lm > 4) { lx *= 4 / lm; lz *= 4 / lm; }
  let faceT = { x: en.x + lx, z: en.z + lz };

  let moveDir = null;
  let useCall = null;

  // ---- charge threat ----
  let charging = false, danger = false, escape = null;
  if (en.casting && en.casting.skill === 'charge') charging = true;
  if (charging || chargeLock) {
    const cd = chargeLock ? { x: chargeLock.dx, z: chargeLock.dz } : V.fromHeading(en.heading);
    const org = chargeLock ? chargeLock : { x: en.x, z: en.z };
    const rel = { x: me.x - org.x, z: me.z - org.z };
    const along = rel.x * cd.x + rel.z * cd.z;
    const s = rel.x * cd.z - rel.z * cd.x;
    if (along > -2.5 && along < 14.5 && Math.abs(s) < 3.4) {
      danger = true;
      let side = s >= 0 ? 1 : -1;
      if (Math.abs(s) < 0.6) {
        const a = { x: cd.z, z: -cd.x };
        const r1 = api.ray(a.x, a.z, 6).dist, r2 = api.ray(-a.x, -a.z, 6).dist;
        side = r1 >= r2 ? 1 : -1;
      }
      escape = V.norm({ x: cd.z * side, z: -cd.x * side });
      escape = V.norm(V.add(escape, V.scale(away, 0.35)));
    }
  }

  const committed = !!chargeLock || (charging && en.casting && (en.casting.phase === 'dash' || en.casting.remaining < 0.14));

  if (danger) {
    if (!me.busy && !me.airborne && !me.stunned && committed && api.ready('blink')) {
      const bd = blinkDir(p, api, escape);
      useCall = ['blink', bd.x, bd.z];
    }
    moveDir = pickDir(p, api, escape, true);
  }

  // ---- close range emergency ----
  if (!danger && !me.busy && !me.airborne && !me.stunned) {
    if (dist < 6.2 && !en.stunned) {
      if (api.ready('blink')) {
        const bd = blinkDir(p, api, away);
        useCall = ['blink', bd.x, bd.z];
      } else if (en.casting && en.casting.skill === 'smash' && en.casting.telegraph &&
                 en.casting.remaining >= 0.05 && en.casting.remaining <= 0.55 && dist < 6.4 && api.ready('jump')) {
        useCall = ['jump'];
      }
    } else if (dist < 8.5 && chargeReady && api.ready('blink') && api.cooldown('laser') > 0.5 && !en.stunned) {
      const bd = blinkDir(p, api, away);
      useCall = ['blink', bd.x, bd.z];
    }
  }

  // ---- laser ----
  if (!useCall && !danger && !me.busy && !me.airborne && !me.stunned && api.ready('laser') &&
      en.visible && dist > 2.0 && dist < 22) {
    let threat = (dist - 5.15) / 5.35;
    if (chargeReady) threat = Math.min(threat, 0.3 + Math.max(0, dist - 3.6) / 15);
    if (en.busy && en.casting && en.casting.remaining) threat += Math.min(en.casting.remaining, 0.6);
    if (en.stunned) threat += 0.5;
    const dirAim = V.toward(me, faceT);
    const angErr = Math.abs(V.angleTo(me.heading, dirAim));
    const lethal = en.hp <= 27.5;
    if (angErr < 0.45 && (threat > 0.85 || lethal || dist > 15)) {
      useCall = ['laser'];
    }
  }

  // ---- default movement ----
  if (!moveDir) {
    let base;
    const tangent = V.rot(toEn, strafeSide * Math.PI / 2);
    if (me.casting && me.casting.skill === 'laser') {
      base = V.norm(V.add(away, V.scale(tangent, 0.7)));
    } else if (dist < 13.5) {
      base = V.norm(V.add(away, V.scale(tangent, 0.55)));
    } else if (dist > 19 || !en.visible) {
      base = V.norm(V.add(toEn, V.scale(tangent, 0.35)));
    } else {
      base = V.norm(V.add(tangent, V.scale(away, 0.25)));
    }
    // pull away from arena edges
    const cm = Math.hypot(me.x, me.z);
    if (cm > 15) {
      const inward = V.norm({ x: -me.x, z: -me.z });
      base = V.norm(V.add(base, V.scale(inward, (cm - 15) * 0.35)));
    }
    moveDir = pickDir(p, api, base, dist < 14);
  }

  if (p.t - lastSideFlip > 3.2 && api.rand() < 0.05) { strafeSide = -strafeSide; lastSideFlip = p.t; }

  if (useCall) {
    if (useCall.length === 3) api.use(useCall[0], useCall[1], useCall[2]);
    else api.use(useCall[0]);
  }
  if (moveDir) api.move(moveDir.x, moveDir.z);
  api.faceAt(faceT.x, faceT.z);
}
