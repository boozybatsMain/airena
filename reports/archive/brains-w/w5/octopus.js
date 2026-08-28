function think(p, api) {
  const me = p.self, e = p.enemy;
  if (!me.alive) return;

  // ---- digest events -------------------------------------------------
  for (const ev of p.events) {
    if (ev.type === 'enemyStarted' && ev.skill === 'charge') chargeReadyAt = p.t + 4.5;
    else if (ev.type === 'blocked') {
      if (p.t - lastFlip > 0.45) { strafeSign = -strafeSign; lastFlip = p.t; }
    } else if (ev.type === 'damaged' && ev.skill === 'charge') {
      chargeReadyAt = p.t + 4.5;
    }
  }
  if (e.casting && e.casting.skill === 'charge') {
    chargeReadyAt = p.t + 4.5 - (e.casting.elapsed || 0);
  }
  if (p.t - lastFlip > 3.2 && api.rand() < 0.05) { strafeSign = -strafeSign; lastFlip = p.t; }

  let cdCharge;
  if (e.cooldowns && typeof e.cooldowns.charge === 'number') cdCharge = e.cooldowns.charge;
  else cdCharge = Math.max(0, chargeReadyAt - p.t);

  const dist = e.dist;

  // frozen: nothing can be started
  if (me.stunned || me.airborne) return;

  // ---- default facing: where the beam should go ----------------------
  const castLead = (me.casting && me.casting.skill === 'laser' && me.casting.telegraph)
    ? Math.max(0, me.casting.remaining) : 0.58;
  const lead = predictPos(e, castLead);
  api.faceAt(lead.x, lead.z);

  // ---- threat 1: the charge ------------------------------------------
  if (e.casting && e.casting.skill === 'charge' &&
      (e.casting.phase === 'dash' ||
       (e.casting.phase === 'windup' && e.casting.remaining < 0.16))) {
    const dir = V.fromHeading(e.heading);
    const rx = me.x - e.x, rz = me.z - e.z;
    const along = rx * dir.x + rz * dir.z;
    const perp = rx * dir.z - rz * dir.x;
    if (along > -2.0 && along < 15.0 && Math.abs(perp) < 3.4) {
      let side = perp >= 0 ? 1 : -1;
      let esc = { x: dir.z * side, z: -dir.x * side };
      let px = me.x + esc.x * 7.0, pz = me.z + esc.z * 7.0;
      if (Math.abs(px) > 18.5 || Math.abs(pz) > 18.5) {
        side = -side;
        esc = { x: dir.z * side, z: -dir.x * side };
      }
      const back = { x: esc.x - dir.x * 0.35, z: esc.z - dir.z * 0.35 };
      const bn = V.norm(back);
      if (api.ready('blink') && !me.busy) {
        api.use('blink', bn.x, bn.z);
        api.move(bn.x, bn.z);
      } else {
        api.move(bn.x, bn.z);
      }
      return;
    }
  }

  // ---- threat 2: the smash cone ---------------------------------------
  if (e.casting && e.casting.skill === 'smash' && e.casting.telegraph && dist < 4.8) {
    const away = V.norm({ x: me.x - e.x, z: me.z - e.z });
    const esc = safeAway(api, me, away);
    api.move(esc.x, esc.z);
    if (!me.busy) {
      if (api.ready('jump') && dist < 4.2) api.use('jump');
      else if (api.ready('blink') && dist < 3.4) api.use('blink', esc.x, esc.z);
    }
    return;
  }

  // ---- desperate: cornered with the ape on top of us -------------------
  const wallMargin = Math.min(20 - Math.abs(me.x), 20 - Math.abs(me.z));
  if (!me.busy && dist < 4.2 && wallMargin < 3.0 && api.ready('blink')) {
    const outward = V.norm({ x: -me.x * 0.6 + (me.x - e.x), z: -me.z * 0.6 + (me.z - e.z) });
    api.use('blink', outward.x, outward.z);
    api.move(outward.x, outward.z);
    return;
  }

  // ---- the beam --------------------------------------------------------
  const enemyRecovering = e.casting && e.casting.phase === 'recover';
  const safeToCast = dist > 13.0 || cdCharge > 1.0 || (enemyRecovering && cdCharge > 0.4);
  if (!me.busy && api.ready('laser') && e.visible && !e.airborne &&
      dist > 2.0 && dist < 22.0 && safeToCast) {
    const aim = predictPos(e, 0.58);
    if (api.los(aim.x, aim.z)) {
      api.faceAt(aim.x, aim.z);
      api.use('laser');
    }
  }

  // ---- footwork --------------------------------------------------------
  let desired;
  if (cdCharge > 1.3) desired = 8.5;
  else if (api.ready('blink')) desired = 13.8;
  else desired = 15.5;
  if (me.casting && me.casting.skill === 'laser') desired = Math.max(desired, dist);

  if (!e.visible) {
    if (dist > 9) {
      api.moveTo(e.x, e.z);
      return;
    }
    desired = Math.min(desired, 8.0);
  }

  const perpDir = { x: (e.z - me.z), z: -(e.x - me.x) };
  const strafe = V.scale(V.norm(perpDir), strafeSign);
  const d = pickDir(p, api, desired, strafe);
  if (d) api.move(d.x, d.z);

  if (p.t - saidAt > 7 && api.rand() < 0.2) {
    saidAt = p.t;
    api.say(cdCharge > 1.3 ? "your charge is spent, ape" : "eight arms, one beam");
  }
}

let strafeSign = 1;
let chargeReadyAt = -1;
let lastFlip = 0;
let saidAt = -99;

function predictPos(e, t) {
  const k = e.stunned ? 0.35 : 0.9;
  return { x: e.x + (e.vx || 0) * t * k, z: e.z + (e.vz || 0) * t * k };
}

function safeAway(api, me, away) {
  const cand = [away, V.rot(away, 0.7), V.rot(away, -0.7), V.rot(away, 1.4), V.rot(away, -1.4)];
  let best = away, bs = -1e9;
  for (const c of cand) {
    const r = api.ray(c.x, c.z, 4.0);
    const nx = me.x + c.x * 3.0, nz = me.z + c.z * 3.0;
    let s = Math.min(r.dist, 4.0) * 1.2;
    const wm = Math.min(20 - Math.abs(nx), 20 - Math.abs(nz));
    if (wm < 4) s -= (4 - wm) * 2.0;
    if (s > bs) { bs = s; best = c; }
  }
  return best;
}

function pickDir(p, api, desired, strafe) {
  const me = p.self, e = p.enemy;
  const sp = me.speed > 0.6 ? V.norm({ x: me.vx, z: me.vz }) : null;
  let best = null, bs = -1e9;
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8;
    const d = { x: Math.sin(a), z: Math.cos(a) };
    const r = api.ray(d.x, d.z, 4.2);
    const clear = r.dist;
    if (clear < 1.25) continue;
    const nx = me.x + d.x * 2.6, nz = me.z + d.z * 2.6;
    const nd = Math.hypot(nx - e.x, nz - e.z);
    let s = 0;
    s -= Math.abs(nd - desired) * 1.75;
    s += Math.min(clear, 4.2) * 0.9;
    const wm = Math.min(20 - Math.abs(nx), 20 - Math.abs(nz));
    if (wm < 5) s -= (5 - wm) * 2.0;
    s += (d.x * strafe.x + d.z * strafe.z) * 1.7;
    if (sp) s += (d.x * sp.x + d.z * sp.z) * 0.6;
    if (s > bs) { bs = s; best = d; }
  }
  return best;
}
