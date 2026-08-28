const OBS_PAD = 1.45;

function segRect(ax, az, bx, bz, o, pad) {
  const minx = o.x - o.hx - pad, maxx = o.x + o.hx + pad;
  const minz = o.z - o.hz - pad, maxz = o.z + o.hz + pad;
  const dx = bx - ax, dz = bz - az;
  let t0 = 0, t1 = 1;
  if (Math.abs(dx) < 1e-9) {
    if (ax < minx || ax > maxx) return false;
  } else {
    let ta = (minx - ax) / dx, tb = (maxx - ax) / dx;
    if (ta > tb) { const t = ta; ta = tb; tb = t; }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return false;
  }
  if (Math.abs(dz) < 1e-9) {
    if (az < minz || az > maxz) return false;
  } else {
    let ta = (minz - az) / dz, tb = (maxz - az) / dz;
    if (ta > tb) { const t = ta; ta = tb; tb = t; }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return false;
  }
  return true;
}

function insideAny(obs, x, z, pad) {
  for (const o of obs) {
    if (Math.abs(x - o.x) <= o.hx + pad && Math.abs(z - o.z) <= o.hz + pad) return true;
  }
  return false;
}

function blockedLine(obs, ax, az, bx, bz) {
  for (const o of obs) if (segRect(ax, az, bx, bz, o, 0)) return true;
  return false;
}

function hiddenFrom(obs, cx, cz, ex, ez) {
  const dx = cx - ex, dz = cz - ez;
  const L = Math.hypot(dx, dz) || 1;
  const px = (-dz / L) * 1.35, pz = (dx / L) * 1.35;
  if (!blockedLine(obs, ex, ez, cx, cz)) return false;
  if (!blockedLine(obs, ex, ez, cx + px, cz + pz)) return false;
  if (!blockedLine(obs, ex, ez, cx - px, cz - pz)) return false;
  return true;
}

function findCover(p, me, en, horizon) {
  const obs = p.arena.obstacles;
  const reach = Math.max(1.5, Math.min(horizon * 5.2, 4.2));
  let best = null, bestScore = -1e9;
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const cx = me.x + Math.sin(a) * reach;
    const cz = me.z + Math.cos(a) * reach;
    if (Math.abs(cx) > 18.4 || Math.abs(cz) > 18.4) continue;
    if (insideAny(obs, cx, cz, OBS_PAD)) continue;
    if (blockedLine(obs, me.x, me.z, cx, cz)) continue;
    const hid = hiddenFrom(obs, cx, cz, en.x, en.z);
    const d = Math.hypot(en.x - cx, en.z - cz);
    const score = (hid ? 200 : 0) - d * 0.6;
    if (score > bestScore) { bestScore = score; best = { x: cx, z: cz, hidden: hid }; }
  }
  return best;
}

let strafeSign = 1;
let lastFlipT = -99;
let saidOpen = false;

function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me || !en || !me.alive || !en.alive) return;

  const obs = p.arena.obstacles;
  const dist = en.dist;
  const toEn = V.toward(me, en);

  // ---------- events ----------
  let bumped = false;
  for (const e of p.events) {
    if (e.type === 'blocked') bumped = true;
    if (e.type === 'damaged' && e.skill === 'laser') bumped = true;
  }
  if (bumped && p.t - lastFlipT > 0.35) { strafeSign = -strafeSign; lastFlipT = p.t; }
  if (p.t - lastFlipT > 1.8) { strafeSign = api.rand() < 0.5 ? -1 : 1; lastFlipT = p.t; }

  if (!saidOpen) { saidOpen = true; api.say("You are soft and I am not."); }

  // ---------- enemy state ----------
  const ec = en.casting;
  const enemyLaser = !!(ec && ec.skill === 'laser' && ec.telegraph);
  const laserRem = enemyLaser ? Math.max(0.05, ec.remaining || 0.3) : 99;
  let enAirRem = 0;
  if (en.airborne) {
    enAirRem = (ec && ec.phase === 'air' && typeof ec.remaining === 'number') ? ec.remaining : 0.5;
  }

  const predEn = { x: en.x + en.vx * 0.30, z: en.z + en.vz * 0.30 };

  // ---------- mid-skill handling ----------
  const mc = me.casting;
  if (mc && me.busy) {
    if (mc.skill === 'charge' && mc.phase === 'windup') {
      const flight = Math.max(0, (dist - 2.3)) / 15;
      const tt = Math.max(0, (mc.remaining || 0.1)) + flight;
      api.faceAt(en.x + en.vx * tt, en.z + en.vz * tt);
      return;
    }
    if (mc.skill === 'smash') {
      api.faceAt(predEn.x, predEn.z);
      if (dist > 2.2) api.move(toEn.x, toEn.z);
      return;
    }
    if (mc.skill === 'charge') { api.faceAt(en.x, en.z); return; }
    // jump / recover: keep facing enemy
    api.faceAt(en.x, en.z);
    if (!me.airborne && dist > 2.4) api.move(toEn.x, toEn.z);
    return;
  }
  if (me.stunned || me.airborne) { api.faceAt(en.x, en.z); return; }

  // ---------- facing ----------
  api.faceAt(predEn.x, predEn.z);

  // ---------- skill decisions ----------
  const dPred = Math.hypot(predEn.x - me.x, predEn.z - me.z);
  let angErr = 3.2;
  if (dPred > 0.001) {
    angErr = Math.abs(V.angleTo(me.heading, { x: (predEn.x - me.x) / dPred, z: (predEn.z - me.z) / dPred }));
  }

  const airBlocksSmash = en.airborne && enAirRem > 0.30;
  const smashOK = api.ready('smash') && !en.invulnerable && !airBlocksSmash &&
                  dPred <= 4.55 && angErr < 1.15 && en.visible;

  // charge geometry
  let chargeGood = false;
  let chargeAim = null;
  if (api.ready('charge') && en.visible && !en.invulnerable && !en.airborne) {
    const flight = Math.max(0, (dist - 2.3)) / 15;
    const tt = 0.3 + flight;
    const lx = en.x + en.vx * tt * 0.8, lz = en.z + en.vz * tt * 0.8;
    const dx = lx - me.x, dz = lz - me.z;
    const L = Math.hypot(dx, dz);
    if (L > 3.0 && L < 12.6) {
      const a = Math.abs(V.angleTo(me.heading, { x: dx / L, z: dz / L }));
      if (a < 0.95) {
        const r = api.ray(dx, dz, Math.min(L + 0.6, 14));
        if (!r || r.dist >= L - 1.6) { chargeGood = true; chargeAim = { x: lx, z: lz }; }
      }
    }
  }

  const chargeWanted = chargeGood && (
    (enemyLaser && dist < 10.5) ||
    en.stunned ||
    (ec && ec.telegraph && dist < 10.5) ||
    (dist > 7.2 && dist < 12.6) ||
    (!api.ready('smash') && api.cooldown('smash') > 0.5 && dist > 4.2 && dist < 8)
  );

  let acted = false;
  if (smashOK) {
    api.use('smash');
    acted = true;
  } else if (chargeWanted) {
    api.use('charge');
    api.faceAt(chargeAim.x, chargeAim.z);
    acted = true;
  }

  // ---------- movement ----------
  const perp = V.perp(toEn);

  if (enemyLaser && !acted) {
    if (dist < 5.2) {
      // circle-strafe hard: out-turn their cast rotation
      let sx = perp.x * strafeSign, sz = perp.z * strafeSign;
      let tx = me.x + sx * 3, tz = me.z + sz * 3;
      if (Math.abs(tx) > 18 || Math.abs(tz) > 18 || insideAny(obs, tx, tz, OBS_PAD)) {
        strafeSign = -strafeSign; lastFlipT = p.t;
        sx = -sx; sz = -sz;
      }
      const inward = dist > 3.0 ? 0.35 : -0.05;
      api.move(sx + toEn.x * inward, sz + toEn.z * inward);
      return;
    }
    const spot = findCover(p, me, en, laserRem);
    if (spot && spot.hidden) {
      api.move(spot.x - me.x, spot.z - me.z);
      return;
    }
    // no cover: sprint diagonally inward
    let sx = perp.x * strafeSign, sz = perp.z * strafeSign;
    const tx = me.x + sx * 4, tz = me.z + sz * 4;
    if (Math.abs(tx) > 18 || Math.abs(tz) > 18 || insideAny(obs, tx, tz, OBS_PAD)) {
      strafeSign = -strafeSign; lastFlipT = p.t; sx = -sx; sz = -sz;
    }
    api.move(toEn.x * 0.85 + sx * 0.75, toEn.z * 0.85 + sz * 0.75);
    return;
  }

  // normal approach
  if (dist > 2.35) {
    let direct = en.visible;
    if (direct && blockedLine(obs, me.x, me.z, en.x, en.z)) direct = false;
    if (!direct) {
      const path = api.pathTo(en.x, en.z);
      if (path && path.points && path.points.length) {
        const wp = path.points[0];
        api.moveTo(en.x, en.z);
      } else {
        api.move(toEn.x, toEn.z);
      }
    } else {
      let s = 0;
      if (dist > 9) s = 0.18;
      else if (dist > 4.2) s = 0.42;
      else s = 0.12;
      let sx = perp.x * strafeSign * s, sz = perp.z * strafeSign * s;
      const tx = me.x + (toEn.x + sx) * 3.0, tz = me.z + (toEn.z + sz) * 3.0;
      if (Math.abs(tx) > 18.6 || Math.abs(tz) > 18.6 || insideAny(obs, tx, tz, 1.3)) {
        strafeSign = -strafeSign; lastFlipT = p.t;
        sx = -sx; sz = -sz;
      }
      api.move(toEn.x + sx, toEn.z + sz);
    }
  } else {
    // in contact: keep pressure, slight orbit so the cone always covers them
    const s = api.ready('smash') ? 0.12 : 0.6;
    let sx = perp.x * strafeSign * s, sz = perp.z * strafeSign * s;
    const tx = me.x + (toEn.x + sx) * 2.0, tz = me.z + (toEn.z + sz) * 2.0;
    if (Math.abs(tx) > 18.8 || insideAny(obs, tx, tz, 1.3)) { sx = -sx; sz = -sz; strafeSign = -strafeSign; lastFlipT = p.t; }
    api.move(toEn.x * 0.9 + sx, toEn.z * 0.9 + sz);
  }
}
