let sign = 1;
let lastFlip = 0;
let lastMove = { x: 0, z: 1 };
let lastChargeT = -99;
let lastSmashT = -99;
let saidT = -99;

function insideObs(obs, x, z, pad) {
  for (const b of obs) {
    if (Math.abs(x - b.x) < b.hx + pad && Math.abs(z - b.z) < b.hz + pad) return true;
  }
  return false;
}

function segHitsBox(ax, az, bx, bz, b, pad) {
  const minx = b.x - b.hx - pad, maxx = b.x + b.hx + pad;
  const minz = b.z - b.hz - pad, maxz = b.z + b.hz + pad;
  const dx = bx - ax, dz = bz - az;
  let t0 = 0, t1 = 1;
  if (Math.abs(dx) < 1e-9) {
    if (ax < minx || ax > maxx) return false;
  } else {
    let ta = (minx - ax) / dx, tb = (maxx - ax) / dx;
    if (ta > tb) { const q = ta; ta = tb; tb = q; }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return false;
  }
  if (Math.abs(dz) < 1e-9) {
    if (az < minz || az > maxz) return false;
  } else {
    let ta = (minz - az) / dz, tb = (maxz - az) / dz;
    if (ta > tb) { const q = ta; ta = tb; tb = q; }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return false;
  }
  return true;
}

function blockedSeg(ax, az, bx, bz, obs, pad) {
  for (const b of obs) if (segHitsBox(ax, az, bx, bz, b, pad)) return true;
  return false;
}

function aimPoint(p, lead) {
  const en = p.enemy;
  let f = 0.8;
  if (en.casting && en.casting.skill === 'charge' && en.casting.phase === 'dash') f = 1.0;
  else if (en.casting && en.casting.telegraph) f = 0.35;
  else if (en.stunned) f = 0.2;
  const t = Math.max(0, Math.min(lead, 0.8));
  return { x: en.x + en.vx * t * f, z: en.z + en.vz * t * f };
}

function pickMove(p, api, desired, wantLos) {
  const me = p.self, en = p.enemy, obs = p.arena.obstacles;
  const toEn = V.toward(me, en);
  const perp = { x: toEn.z * sign, z: -toEn.x * sign };
  let best = { x: -toEn.x, z: -toEn.z };
  let bestS = -1e9;
  for (let i = 0; i < 24; i++) {
    const a = i * Math.PI / 12;
    const dx = Math.sin(a), dz = Math.cos(a);
    const step = 2.7;
    const px = me.x + dx * step, pz = me.z + dz * step;
    if (Math.abs(px) > 18.6 || Math.abs(pz) > 18.6) continue;
    if (insideObs(obs, px, pz, 1.35)) continue;
    if (insideObs(obs, me.x + dx * 1.4, me.z + dz * 1.4, 1.25)) continue;
    let s = 0;
    const d = Math.hypot(px - en.x, pz - en.z);
    s -= Math.abs(d - desired) * 1.35;
    const clear = Math.min(20 - Math.abs(px), 20 - Math.abs(pz));
    if (clear < 5.5) s -= (5.5 - clear) * 2.4;
    const losOK = !blockedSeg(px, pz, en.x, en.z, obs, 0.1);
    if (wantLos) { s += losOK ? 3.5 : -3.5; } else { s += losOK ? -1.5 : 3.0; }
    s += (dx * perp.x + dz * perp.z) * 1.8;
    s += (dx * lastMove.x + dz * lastMove.z) * 1.3;
    if (s > bestS) { bestS = s; best = { x: dx, z: dz }; }
  }
  return best;
}

function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me || !en || !me.alive) return;
  const obs = p.arena.obstacles;
  const dist = en.dist;

  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      if (e.skill === 'charge') lastChargeT = p.t;
      else if (e.skill === 'smash') lastSmashT = p.t;
    } else if (e.type === 'blocked') {
      sign = -sign; lastFlip = p.t;
    } else if (e.type === 'damaged' && e.skill === 'charge') {
      lastChargeT = Math.max(lastChargeT, p.t - 0.4);
    }
  }
  const ec = en.casting;
  if (ec && ec.skill === 'charge' && lastChargeT < p.t - 1.2) lastChargeT = p.t;

  if (p.t - lastFlip > 2.2 && api.rand() < 0.12) { sign = -sign; lastFlip = p.t; }

  const chargeReadyIn = Math.max(0, lastChargeT + 4.05 - p.t);
  const chargeUp = chargeReadyIn <= 0.75;

  const canAct = !me.busy && !me.stunned && !me.airborne;

  let moveDir = null;
  let faceTgt = { x: en.x, z: en.z };
  let acted = false;

  // ---- charge dodge ----
  if (ec && ec.skill === 'charge' && (ec.phase === 'dash' || (ec.phase === 'windup' && ec.remaining <= 0.1))) {
    const dir = V.fromHeading(en.heading);
    const rel = { x: me.x - en.x, z: me.z - en.z };
    const along = rel.x * dir.x + rel.z * dir.z;
    let perp = { x: dir.z, z: -dir.x };
    if (perp.x * rel.x + perp.z * rel.z < 0) { perp = { x: -perp.x, z: -perp.z }; }
    const lat = Math.abs(rel.x * perp.x + rel.z * perp.z);
    if (along > -1.5 && along < 15 && lat < 3.6) {
      if (canAct && api.ready('blink')) {
        let bd = V.norm({ x: perp.x - dir.x * 0.5, z: perp.z - dir.z * 0.5 });
        let tx = me.x + bd.x * 7.4, tz = me.z + bd.z * 7.4;
        if (Math.abs(tx) > 18.5 || Math.abs(tz) > 18.5) {
          const bd2 = V.norm({ x: -perp.x - dir.x * 0.5, z: -perp.z - dir.z * 0.5 });
          const tx2 = me.x + bd2.x * 7.4, tz2 = me.z + bd2.z * 7.4;
          if (Math.abs(tx2) <= 18.5 && Math.abs(tz2) <= 18.5) bd = bd2;
          else bd = V.norm({ x: -dir.x, z: -dir.z });
        }
        api.use('blink', bd.x, bd.z);
        moveDir = bd;
        acted = true;
      } else {
        moveDir = V.norm({ x: perp.x * 1.2 - dir.x * 0.35, z: perp.z * 1.2 - dir.z * 0.35 });
        acted = true;
      }
      faceTgt = { x: en.x, z: en.z };
    }
  }

  // ---- smash dodge ----
  if (!acted && ec && ec.skill === 'smash' && ec.telegraph && dist < 6.6) {
    const away = V.away(me, en);
    if (canAct && api.ready('jump') && ec.remaining > 0.11) {
      api.use('jump');
      moveDir = away;
      acted = true;
    } else if (canAct && api.ready('blink')) {
      let bd = V.norm({ x: away.x + V.perp(away).x * 0.6 * sign, z: away.z + V.perp(away).z * 0.6 * sign });
      const tx = me.x + bd.x * 7.4, tz = me.z + bd.z * 7.4;
      if (Math.abs(tx) > 18.5 || Math.abs(tz) > 18.5) bd = V.norm({ x: -me.x, z: -me.z });
      api.use('blink', bd.x, bd.z);
      moveDir = bd;
      acted = true;
    } else {
      moveDir = away;
      acted = true;
    }
  }

  // ---- panic reset ----
  if (!acted && canAct && dist < 3.7 && api.ready('blink') && !(ec && ec.skill === 'charge')) {
    const away = V.away(me, en);
    let bd = V.norm({ x: away.x + V.perp(away).x * 0.5 * sign, z: away.z + V.perp(away).z * 0.5 * sign });
    const tx = me.x + bd.x * 7.4, tz = me.z + bd.z * 7.4;
    if (Math.abs(tx) > 18.5 || Math.abs(tz) > 18.5) bd = V.norm({ x: -me.x + away.x * 2, z: -me.z + away.z * 2 });
    api.use('blink', bd.x, bd.z);
    moveDir = bd;
    acted = true;
  }

  // ---- laser ----
  const helpless = en.stunned || en.airborne ||
    (ec && (ec.phase === 'recover' || (ec.skill === 'charge' && ec.phase === 'dash')));
  let fireMin = chargeUp ? 12.5 : 6.9;
  if (helpless) fireMin = 2.5;

  if (me.casting && me.casting.skill === 'laser') {
    const rem = me.casting.telegraph ? (me.casting.remaining || 0.2) : 0;
    const ap = aimPoint(p, rem);
    faceTgt = api.los(ap.x, ap.z) ? ap : { x: en.x, z: en.z };
  } else if (!acted && canAct && api.ready('laser') && en.visible && dist < 21.5 && dist > fireMin) {
    const ap = aimPoint(p, 0.72);
    const good = api.los(ap.x, ap.z);
    const tgt = good ? ap : { x: en.x, z: en.z };
    const dirv = V.norm({ x: tgt.x - me.x, z: tgt.z - me.z });
    const err = Math.abs(V.angleTo(me.heading, dirv));
    if (err < 0.8) api.use('laser');
    faceTgt = tgt;
  } else if (!acted) {
    const ap = aimPoint(p, 0.4);
    faceTgt = api.los(ap.x, ap.z) ? ap : { x: en.x, z: en.z };
  }

  // ---- movement ----
  if (!moveDir) {
    let desired = chargeUp ? 14.5 : 10.5;
    if (helpless && dist > 4) desired = Math.min(desired, 9.5);
    if (me.hp < 45) desired += 2.5;
    const wantLos = api.cooldown('laser') < 1.4 || dist > 13;

    if (!en.visible && dist > 9.5) {
      const pa = api.pathTo(en.x, en.z);
      if (pa && pa.points && pa.points.length) {
        const wp = pa.points[0];
        const d = V.norm({ x: wp.x - me.x, z: wp.z - me.z });
        if (V.len(d) > 0.01) moveDir = d;
      }
    }
    if (!moveDir) moveDir = pickMove(p, api, desired, wantLos);
  }

  if (moveDir && (moveDir.x !== 0 || moveDir.z !== 0)) {
    lastMove = V.norm(moveDir);
    api.move(moveDir.x, moveDir.z);
  }
  api.faceAt(faceTgt.x, faceTgt.z);

  if (p.t - saidT > 6.5) {
    saidT = p.t;
    api.say(chargeUp ? "eight arms, one beam" : "your charge is spent");
  }
}
