const EPS = 1e-9;
let OBS = [];
let lastDir = { x: 0, z: 1 };
let spin = 1;
let enemyChargeReadyAt = 0;
let enemySmashReadyAt = 0;
let enemyJumpReadyAt = 0;
let saidOnce = false;
let lastBlinkT = -99;
let noLosSince = -99;

function pointInBlock(x, z, m) {
  for (const o of OBS) {
    if (x > o.x - o.hx - m && x < o.x + o.hx + m && z > o.z - o.hz - m && z < o.z + o.hz + m) return true;
  }
  return false;
}

function segBlocked(ax, az, bx, bz, m) {
  const dx = bx - ax, dz = bz - az;
  for (const o of OBS) {
    const minx = o.x - o.hx - m, maxx = o.x + o.hx + m;
    const minz = o.z - o.hz - m, maxz = o.z + o.hz + m;
    let t0 = 0, t1 = 1;
    if (Math.abs(dx) < EPS) {
      if (ax < minx || ax > maxx) continue;
    } else {
      let ta = (minx - ax) / dx, tb = (maxx - ax) / dx;
      if (ta > tb) { const s = ta; ta = tb; tb = s; }
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
      if (t0 > t1) continue;
    }
    if (Math.abs(dz) < EPS) {
      if (az < minz || az > maxz) continue;
    } else {
      let ta = (minz - az) / dz, tb = (maxz - az) / dz;
      if (ta > tb) { const s = ta; ta = tb; tb = s; }
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
      if (t0 > t1) continue;
    }
    if (t0 <= t1) return true;
  }
  return false;
}

function wallPen(x, z) {
  let pen = 0;
  const lim = 19.2;
  const dxs = [lim - x, lim + x, lim - z, lim + z];
  for (const d of dxs) {
    if (d < 4) pen += (4 - d) * (4 - d) * 0.55;
  }
  return pen;
}

function clampArena(v) {
  return Math.max(-19.1, Math.min(19.1, v));
}

function chooseMoveDir(p, api, desired, wantLos, extraBias) {
  const me = p.self, e = p.enemy;
  const step = 3.6;
  const toE = V.toward({ x: me.x, z: me.z }, { x: e.x, z: e.z });
  const tang = { x: toE.z * spin, z: -toE.x * spin };
  let best = null, bestS = -1e18;
  for (let i = 0; i < 20; i++) {
    const a = (i * Math.PI * 2) / 20;
    const d = { x: Math.sin(a), z: Math.cos(a) };
    const cx = me.x + d.x * step, cz = me.z + d.z * step;
    let s = 0;
    const dd = Math.hypot(cx - e.x, cz - e.z);
    s -= 1.15 * Math.abs(dd - desired);
    if (Math.abs(cx) > 19.2 || Math.abs(cz) > 19.2) s -= 10;
    s -= wallPen(cx, cz);
    if (pointInBlock(cx, cz, 1.25)) s -= 12;
    if (segBlocked(me.x, me.z, cx, cz, 1.0)) s -= 9;
    const clear = !segBlocked(cx, cz, e.x, e.z, 0);
    if (wantLos) { if (clear) s += 2.6; else s -= 2.6; }
    else { if (!clear) s += 1.2; }
    s += 1.15 * (d.x * tang.x + d.z * tang.z);
    s += 0.7 * (d.x * lastDir.x + d.z * lastDir.z);
    if (extraBias) s += extraBias.w * (d.x * extraBias.x + d.z * extraBias.z);
    if (s > bestS) { bestS = s; best = d; }
  }
  if (!best) best = { x: -toE.x, z: -toE.z };
  lastDir = best;
  return best;
}

function bestBlink(p) {
  const me = p.self, e = p.enemy;
  let best = null, bestS = -1e18;
  for (let i = 0; i < 16; i++) {
    const a = (i * Math.PI * 2) / 16;
    const d = { x: Math.sin(a), z: Math.cos(a) };
    let lx = clampArena(me.x + d.x * 7.5), lz = clampArena(me.z + d.z * 7.5);
    let k = 1;
    while (k > 0.2 && pointInBlock(me.x + (lx - me.x) * k, me.z + (lz - me.z) * k, 1.2)) k -= 0.12;
    const px = me.x + (lx - me.x) * k, pz = me.z + (lz - me.z) * k;
    const dd = Math.hypot(px - e.x, pz - e.z);
    let s = Math.min(dd, 15) * 1.0;
    s -= wallPen(px, pz) * 0.7;
    if (!segBlocked(px, pz, e.x, e.z, 0)) s += 1.2;
    s -= Math.hypot(px - me.x, pz - me.z) < 3 ? 4 : 0;
    if (s > bestS) { bestS = s; best = d; }
  }
  return best || { x: 0, z: 1 };
}

function think(p, api) {
  const me = p.self, e = p.enemy;
  if (!me.alive || !e) return;
  OBS = p.arena.obstacles || [];

  for (const ev of p.events) {
    if (ev.type === 'enemyStarted') {
      if (ev.skill === 'charge') enemyChargeReadyAt = p.t + 4.033;
      else if (ev.skill === 'smash') enemySmashReadyAt = p.t + 1.3;
      else if (ev.skill === 'jump') enemyJumpReadyAt = p.t + 2.8;
    } else if (ev.type === 'blocked') {
      spin = -spin;
    } else if (ev.type === 'blinked') {
      lastBlinkT = p.t;
    }
  }
  if (!saidOnce) { saidOnce = true; api.say("eight arms, one beam"); }

  if (me.stunned) return;
  if (me.airborne) { api.faceAt(e.x, e.z); return; }

  const d = e.dist;
  const meP = { x: me.x, z: me.z };
  const eP = { x: e.x, z: e.z };
  const toE = V.toward(meP, eP);
  const away = { x: -toE.x, z: -toE.z };

  const ec = e.casting;
  const dashing = ec && ec.skill === 'charge' && ec.phase === 'dash';
  const chargeWind = ec && ec.skill === 'charge' && ec.phase === 'windup';
  const smashTel = ec && ec.skill === 'smash' && ec.telegraph;
  const enemyRecover = ec && ec.phase === 'recover';

  const myFrac = me.hp / me.maxHp;
  const enFrac = e.hp / e.maxHp;
  const lateSafe = p.t > 31 && myFrac > enFrac + 0.03;

  if (!e.visible) { if (noLosSince < 0) noLosSince = p.t; } else noLosSince = -1;

  // ---------- charge dash: highest priority dodge ----------
  if (dashing) {
    const dir = V.fromHeading(e.heading);
    const rel = { x: me.x - e.x, z: me.z - e.z };
    const along = rel.x * dir.x + rel.z * dir.z;
    const px = rel.x - dir.x * along, pz = rel.z - dir.z * along;
    const perpD = Math.hypot(px, pz);
    let side = perpD > 0.3 ? { x: px / perpD, z: pz / perpD } : { x: dir.z * spin, z: -dir.x * spin };
    if (along > -2 && along < 15 && perpD < 3.6) {
      if (api.ready('blink') && !me.busy) {
        api.use('blink', side.x, side.z);
        api.move(side.x, side.z);
        api.faceAt(e.x, e.z);
        return;
      }
      const mix = { x: side.x * 1.0 - dir.x * 0.35, z: side.z * 1.0 - dir.z * 0.35 };
      api.move(mix.x, mix.z);
      api.faceAt(e.x, e.z);
      return;
    }
  }

  // ---------- smash about to land ----------
  if (smashTel && d < 6.6) {
    if (api.ready('jump') && !me.busy) {
      api.move(away.x, away.z);
      api.use('jump');
      api.faceAt(e.x, e.z);
      return;
    }
    if (api.ready('blink') && !me.busy) {
      const b = bestBlink(p);
      api.use('blink', b.x, b.z);
      api.move(b.x, b.z);
      api.faceAt(e.x, e.z);
      return;
    }
    api.move(away.x + toE.z * 0.4 * spin, away.z - toE.x * 0.4 * spin);
    api.faceAt(e.x, e.z);
    return;
  }

  // ---------- too close: get out of melee ----------
  if (d < 4.4 && !me.busy && !e.stunned) {
    if (api.ready('blink')) {
      const b = bestBlink(p);
      api.use('blink', b.x, b.z);
      api.move(b.x, b.z);
      api.faceAt(e.x, e.z);
      return;
    }
  }

  // ---------- desired spacing ----------
  const chargeReady = p.t >= enemyChargeReadyAt - 0.3;
  let desired = chargeReady ? 14.5 : 9.0;
  if (lateSafe) desired = 17.0;
  if (dashing || chargeWind) desired = 16.0;
  if (d < 5.5) desired = Math.max(desired, 10);

  let wantLos = true;
  if (lateSafe && d < 10) wantLos = false;

  let bias = null;
  if (chargeWind) {
    const dir = V.fromHeading(e.heading);
    bias = { x: dir.z * spin, z: -dir.x * spin, w: 2.2 };
  } else if (d < 7) {
    bias = { x: away.x, z: away.z, w: 1.0 };
  }

  const mv = chooseMoveDir(p, api, desired, wantLos, bias);
  api.move(mv.x, mv.z);

  // ---------- aiming ----------
  let lead = 0.62;
  if (me.casting && me.casting.skill === 'laser' && me.casting.phase !== 'recover') {
    lead = Math.min(0.7, Math.max(0, me.casting.remaining));
  }
  let k = 0.95;
  if (ec && (ec.phase === 'windup' || ec.phase === 'recover')) k = 0.25;
  if (e.airborne) k = 1.0;
  if (e.stunned) k = 0.1;
  const aimX = e.x + e.vx * lead * k;
  const aimZ = e.z + e.vz * lead * k;
  api.faceAt(aimX, aimZ);

  // ---------- laser ----------
  if (!me.busy && !me.airborne && api.ready('laser')) {
    const near = enemyRecover || e.stunned ? 3.4 : 6.6;
    const minRange = lateSafe ? 12.0 : near;
    const ang = Math.abs(V.angleTo(me.heading, toE));
    const smashSoon = p.t >= enemySmashReadyAt - 0.15;
    const risky = d < 8.5 && smashSoon && !e.stunned && !enemyRecover;
    if (e.visible && d > minRange && d < 21.5 && ang < 1.5 && !dashing && !chargeWind && !smashTel && !risky) {
      api.use('laser');
    }
  }
}
