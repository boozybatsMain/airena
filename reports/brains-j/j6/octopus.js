const OBST_PAD_BODY = 1.05;
const enemyLast = { charge: -99, smash: -99, jump: -99 };
let prevDir = null;
let saidAt = -99;

function boxHit(obs, x, z, pad) {
  for (const b of obs) {
    if (Math.abs(x - b.x) <= b.hx + pad && Math.abs(z - b.z) <= b.hz + pad) return true;
  }
  return false;
}

function segBox(ax, az, bx, bz, b, pad) {
  const minx = b.x - b.hx - pad, maxx = b.x + b.hx + pad;
  const minz = b.z - b.hz - pad, maxz = b.z + b.hz + pad;
  const dx = bx - ax, dz = bz - az;
  let t0 = 0, t1 = 1;
  if (Math.abs(dx) < 1e-9) {
    if (ax < minx || ax > maxx) return false;
  } else {
    let ta = (minx - ax) / dx, tb = (maxx - ax) / dx;
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  if (Math.abs(dz) < 1e-9) {
    if (az < minz || az > maxz) return false;
  } else {
    let ta = (minz - az) / dz, tb = (maxz - az) / dz;
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  return true;
}

function segHits(obs, ax, az, bx, bz, pad) {
  for (const b of obs) if (segBox(ax, az, bx, bz, b, pad)) return true;
  return false;
}

function chooseMove(p, ideal, threat) {
  const me = p.self, en = p.enemy, obs = p.arena.obstacles;
  let best = null;
  const R = 4.2;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const dx = Math.sin(a), dz = Math.cos(a);
    const cx = me.x + dx * R, cz = me.z + dz * R;
    if (Math.abs(cx) > 18.3 || Math.abs(cz) > 18.3) continue;
    if (boxHit(obs, cx, cz, 1.3)) continue;
    if (segHits(obs, me.x, me.z, cx, cz, OBST_PAD_BODY)) continue;
    const d = Math.hypot(cx - en.x, cz - en.z);
    let s = -Math.abs(d - ideal) * 1.5;
    const clear = !segHits(obs, cx, cz, en.x, en.z, 0);
    s += clear ? 7 : -5;
    const w = Math.min(20 - Math.abs(cx), 20 - Math.abs(cz));
    s += Math.min(w, 6) * 1.1;
    if (d < 6) s -= (6 - d) * 3.5;
    if (threat) {
      const rx = cx - en.x, rz = cz - en.z;
      const perp = Math.abs(rx * threat.dir.z - rz * threat.dir.x);
      const along = rx * threat.dir.x + rz * threat.dir.z;
      if (along > 0 && along < 14) s += Math.min(perp, 4.5) * 2.5;
    }
    if (prevDir) s += (dx * prevDir.x + dz * prevDir.z) * 1.7;
    if (!best || s > best.s) best = { s, x: cx, z: cz, dx, dz, clear };
  }
  return best;
}

function think(p, api) {
  const me = p.self, en = p.enemy, t = p.t;
  if (!me || !me.alive) return;
  if (!en || !en.alive) { api.stop(); return; }
  const obs = p.arena.obstacles;

  for (const e of p.events) {
    if (e.type === 'enemyStarted' && e.skill) enemyLast[e.skill] = t;
  }

  const chargeCd = Math.max(0, 4 - (t - enemyLast.charge));
  const ec = en.casting;
  const away = V.norm({ x: me.x - en.x, z: me.z - en.z });

  // ---- aim (lead the target for the beam)
  let aimT = 0.66;
  if (me.casting && me.casting.skill === 'laser') aimT = Math.max(0, me.casting.remaining || 0.1);
  let lead = 0.8;
  if (ec && (ec.skill === 'smash' || ec.skill === 'charge')) lead = 0.3;
  const aimX = en.x + en.vx * aimT * lead;
  const aimZ = en.z + en.vz * aimT * lead;
  api.faceAt(aimX, aimZ);

  // ---- detect an incoming charge
  let threat = null;
  const testLine = (dir, committed) => {
    const rx = me.x - en.x, rz = me.z - en.z;
    const along = rx * dir.x + rz * dir.z;
    const perp = rx * dir.z - rz * dir.x;
    if (along > -1.5 && along < 15 && Math.abs(perp) < 3.3) threat = { dir, perp, committed };
  };
  if (ec && ec.skill === 'charge') {
    testLine(V.fromHeading(en.heading), ec.phase === 'dash' || ec.remaining <= 0.07);
  } else if (en.speed > 9.5) {
    testLine(V.norm({ x: en.vx, z: en.vz }), true);
  }

  const canAct = !me.busy && !me.airborne && !me.stunned;

  // ---- charge evasion
  if (threat) {
    const P = { x: threat.dir.z, z: -threat.dir.x };
    let bestD = null;
    for (const sgn of [1, -1]) {
      const d = V.norm({ x: P.x * sgn + away.x * 0.35, z: P.z * sgn + away.z * 0.35 });
      const lx = me.x + d.x * 7.2, lz = me.z + d.z * 7.2;
      let sc = Math.min(20 - Math.abs(lx), 20 - Math.abs(lz));
      if (Math.abs(lx) > 18.5 || Math.abs(lz) > 18.5) sc -= 12;
      if (boxHit(obs, lx, lz, 1.2)) sc -= 3;
      const rx = lx - en.x, rz = lz - en.z;
      sc += Math.min(Math.abs(rx * threat.dir.z - rz * threat.dir.x), 6) * 1.4;
      if (!bestD || sc > bestD.sc) bestD = { sc, d };
    }
    if (threat.committed && canAct && api.ready('blink') && en.dist < 14.5) {
      api.use('blink', bestD.d.x, bestD.d.z);
      api.move(bestD.d.x, bestD.d.z);
      prevDir = bestD.d;
      if (t - saidAt > 3) { saidAt = t; api.say("nope"); }
      return;
    }
    api.move(bestD.d.x, bestD.d.z);
    prevDir = bestD.d;
    if (canAct && !threat.committed && api.ready('laser') && en.visible && en.dist > 15.5 && !en.airborne) api.use('laser');
    return;
  }

  // ---- smash evasion
  if (ec && ec.skill === 'smash' && ec.telegraph && en.dist < 6.0 && canAct) {
    if (api.ready('jump') && (ec.remaining === undefined || ec.remaining > 0.04)) {
      api.move(away.x, away.z);
      api.use('jump');
      prevDir = away;
      return;
    }
    if (api.ready('blink') && chargeCd > 1.4) {
      const d = V.norm({ x: away.x + away.z * 0.6, z: away.z - away.x * 0.6 });
      api.use('blink', d.x, d.z);
      api.move(d.x, d.z);
      prevDir = d;
      return;
    }
  }

  // ---- panic reset when he is glued to me
  if (canAct && en.dist < 4.2 && api.ready('blink') && chargeCd > 1.2) {
    const d = V.norm({ x: away.x + away.z * 0.45, z: away.z - away.x * 0.45 });
    api.use('blink', d.x, d.z);
    api.move(d.x, d.z);
    prevDir = d;
    return;
  }

  // ---- laser
  const safeCast = en.dist > 14.5 || chargeCd > 0.8;
  if (canAct && api.ready('laser') && en.visible && en.dist < 22 && en.dist > 2.0 &&
      !en.airborne && !en.invulnerable && safeCast) {
    api.use('laser');
    if (t - saidAt > 5) { saidAt = t; api.say("ink and light"); }
  }

  // ---- positioning
  const myFrac = me.hp / me.maxHp, hisFrac = en.hp / en.maxHp;
  let ideal = chargeCd > 1.2 ? 10.0 : 14.5;
  if (me.casting && me.casting.skill === 'laser') ideal = Math.max(9, Math.min(15, en.dist));
  if (t > 40 && myFrac > hisFrac + 0.05) ideal += 3.5;
  if (p.burn > 0 && myFrac < hisFrac) ideal = Math.max(9, ideal - 2);

  const best = chooseMove(p, ideal, null);
  if (best && (best.clear || en.visible || en.dist < 8)) {
    api.move(best.dx, best.dz);
    prevDir = { x: best.dx, z: best.dz };
  } else if (!en.visible) {
    api.moveTo(en.x, en.z);
    prevDir = V.toward(me, en);
  } else if (best) {
    api.move(best.dx, best.dz);
    prevDir = { x: best.dx, z: best.dz };
  } else {
    const d = V.norm({ x: -me.x, z: -me.z });
    api.move(d.x, d.z);
    prevDir = d;
  }
}
