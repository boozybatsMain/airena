const S = {
  lastChargeStart: -1000,
  seenCharge: false,
  prevDir: null,
  side: 1,
  slow: 0,
  lastX: 0,
  lastZ: 0,
  lastSay: -99,
  mode: 'kite'
};

function segHitsBox(ax, az, bx, bz, o, m) {
  const minx = o.x - o.hx - m, maxx = o.x + o.hx + m;
  const minz = o.z - o.hz - m, maxz = o.z + o.hz + m;
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dz = bz - az;
  if (Math.abs(dx) < 1e-9) { if (ax < minx || ax > maxx) return false; }
  else {
    let ta = (minx - ax) / dx, tb = (maxx - ax) / dx;
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  if (Math.abs(dz) < 1e-9) { if (az < minz || az > maxz) return false; }
  else {
    let ta = (minz - az) / dz, tb = (maxz - az) / dz;
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  return true;
}

function blockedSeg(p, a, b, m) {
  for (const o of p.arena.obstacles) if (segHitsBox(a.x, a.z, b.x, b.z, o, m || 0)) return true;
  return false;
}

function inBlock(p, q, m) {
  for (const o of p.arena.obstacles) {
    if (Math.abs(q.x - o.x) < o.hx + m && Math.abs(q.z - o.z) < o.hz + m) return true;
  }
  return false;
}

function chooseDir(p, api, targetDist, lateral, latW, coverBonus) {
  const me = p.self, en = p.enemy;
  let best = null, bestScore = -1e9;
  for (let i = 0; i < 24; i++) {
    const h = i * (Math.PI / 12);
    const d = { x: Math.sin(h), z: Math.cos(h) };
    const r = api.ray(d.x, d.z, 4.5);
    const clear = r.dist;
    if (clear < 1.3) continue;
    const step = Math.min(Math.max(clear - 1.15, 0), 3.0);
    const q = { x: me.x + d.x * step, z: me.z + d.z * step };
    const dq = Math.hypot(q.x - en.x, q.z - en.z);
    let s = -Math.abs(dq - targetDist) * 1.5;
    s += Math.min(clear, 4.5) * 0.65;
    const wm = Math.min(20 - Math.abs(q.x), 20 - Math.abs(q.z));
    if (wm < 4.5) s -= (4.5 - wm) * (4.5 - wm) * 0.55;
    if (lateral) s += (d.x * lateral.x + d.z * lateral.z) * latW;
    if (S.prevDir) s += (d.x * S.prevDir.x + d.z * S.prevDir.z) * 0.9;
    if (coverBonus > 0 && blockedSeg(p, q, { x: en.x, z: en.z }, 0.2)) s += coverBonus;
    if (s > bestScore) { bestScore = s; best = d; }
  }
  return best;
}

function blinkDir(p, base) {
  const me = p.self, en = p.enemy;
  let best = null, bs = -1e9;
  for (let i = -3; i <= 3; i++) {
    const d = V.rot(base, i * 0.33);
    let pt = null, L = 0;
    for (let s = 7.4; s >= 2.0; s -= 0.9) {
      const q = { x: me.x + d.x * s, z: me.z + d.z * s };
      if (Math.abs(q.x) < 18.8 && Math.abs(q.z) < 18.8 && !inBlock(p, q, 1.35)) { pt = q; L = s; break; }
    }
    if (!pt) continue;
    let sc = L * 0.9 + Math.hypot(pt.x - en.x, pt.z - en.z) * 1.0;
    if (i === 0) sc += 0.6;
    if (sc > bs) { bs = sc; best = d; }
  }
  return best || base;
}

function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive) return;
  const t = p.t;
  const dist = en.dist;

  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      if (e.skill === 'charge') { S.lastChargeStart = t; S.seenCharge = true; }
    } else if (e.type === 'blocked') {
      S.side = -S.side; S.prevDir = null;
    }
  }
  const ec = en.casting;
  if (ec && ec.skill === 'charge' && t - S.lastChargeStart > 1.2) {
    S.lastChargeStart = t - (ec.elapsed || 0);
    S.seenCharge = true;
  }
  const chargeReady = !S.seenCharge || (t - S.lastChargeStart) >= 4.3;

  // stuck detection
  const moved = Math.hypot(me.x - S.lastX, me.z - S.lastZ);
  S.lastX = me.x; S.lastZ = me.z;
  if (moved < 0.02 && !me.airborne) { S.slow++; } else { S.slow = 0; }
  if (S.slow > 5) { S.side = -S.side; S.prevDir = null; S.slow = 0; }

  if (me.airborne || me.stunned) { api.faceAt(en.x, en.z); return; }

  const toEn = V.norm({ x: en.x - me.x, z: en.z - me.z });
  const perpL = { x: toEn.z, z: -toEn.x };
  const away = { x: -toEn.x, z: -toEn.z };

  // ---------- CHARGE DASH: dodge ----------
  if (ec && ec.skill === 'charge' && ec.phase === 'dash') {
    const dir = V.fromHeading(en.heading);
    const rel = { x: me.x - en.x, z: me.z - en.z };
    const along = rel.x * dir.x + rel.z * dir.z;
    const perpU = { x: dir.z, z: -dir.x };
    const lat = rel.x * perpU.x + rel.z * perpU.z;
    if (along > -2.5 && along < 15 && Math.abs(lat) < 4.0) {
      const side = lat >= 0 ? 1 : -1;
      let esc = { x: perpU.x * side, z: perpU.z * side };
      const rA = api.ray(esc.x, esc.z, 5.5);
      const rB = api.ray(-esc.x, -esc.z, 5.5);
      if (rA.dist < 2.6 && rB.dist > rA.dist) esc = { x: -esc.x, z: -esc.z };
      if (api.ready('blink')) {
        const bd = blinkDir(p, esc);
        api.use('blink', bd.x, bd.z);
        api.move(bd.x, bd.z);
        S.prevDir = bd;
      } else {
        const mix = V.norm({ x: esc.x * 1.0 + away.x * 0.35, z: esc.z * 1.0 + away.z * 0.35 });
        api.move(mix.x, mix.z);
        S.prevDir = mix;
      }
      api.faceAt(en.x, en.z);
      return;
    }
  }

  // ---------- CHARGE WIND-UP: get lateral, stay free ----------
  if (ec && ec.skill === 'charge' && ec.phase === 'windup' && !me.busy) {
    const lat = { x: perpL.x * S.side, z: perpL.z * S.side };
    const mix = V.norm({ x: lat.x + away.x * 0.5, z: lat.z + away.z * 0.5 });
    const r = api.ray(mix.x, mix.z, 3.0);
    let d = mix;
    if (r.dist < 1.8) { S.side = -S.side; d = V.norm({ x: -lat.x + away.x * 0.5, z: -lat.z + away.z * 0.5 }); }
    api.move(d.x, d.z);
    api.faceAt(en.x, en.z);
    S.prevDir = d;
    return;
  }

  // ---------- SMASH: dodge ----------
  if (ec && ec.skill === 'smash' && ec.telegraph && dist < 5.2 && !me.busy) {
    const esc = V.norm({ x: away.x + perpL.x * S.side * 0.8, z: away.z + perpL.z * S.side * 0.8 });
    api.move(esc.x, esc.z);
    api.faceAt(en.x, en.z);
    S.prevDir = esc;
    const rem = ec.remaining;
    if (dist < 4.4) {
      if (api.ready('jump') && rem > 0.09 && rem < 0.62) { api.use('jump'); return; }
      if (api.ready('blink')) { const bd = blinkDir(p, esc); api.use('blink', bd.x, bd.z); return; }
    }
    return;
  }

  // ---------- MELEE PANIC ----------
  if (dist < 4.3 && !me.busy && api.ready('blink')) {
    const esc = V.norm({ x: away.x + perpL.x * S.side * 0.6, z: away.z + perpL.z * S.side * 0.6 });
    const bd = blinkDir(p, esc);
    api.use('blink', bd.x, bd.z);
    api.move(bd.x, bd.z);
    api.faceAt(en.x, en.z);
    S.prevDir = bd;
    return;
  }

  // ---------- GAP MAKER: charge on cooldown is my window ----------
  if (!chargeReady && dist < 6.5 && !me.busy && api.ready('blink') && (t - S.lastChargeStart) < 3.0) {
    const esc = V.norm({ x: away.x + perpL.x * S.side * 0.5, z: away.z + perpL.z * S.side * 0.5 });
    const bd = blinkDir(p, esc);
    api.use('blink', bd.x, bd.z);
    api.move(bd.x, bd.z);
    api.faceAt(en.x, en.z);
    S.prevDir = bd;
    return;
  }

  // ---------- AIM ----------
  let lead = 0.58;
  if (me.casting && me.casting.skill === 'laser') {
    lead = me.casting.phase === 'windup' ? me.casting.remaining + 0.02 : 0;
  }
  let aim = { x: en.x + en.vx * lead, z: en.z + en.vz * lead };
  aim.x = Math.max(-19.5, Math.min(19.5, aim.x));
  aim.z = Math.max(-19.5, Math.min(19.5, aim.z));
  if (!api.los(aim.x, aim.z)) aim = { x: en.x, z: en.z };
  api.faceAt(aim.x, aim.z);

  // ---------- LASER ----------
  const smashDanger = ec && ec.skill === 'smash' && ec.telegraph;
  const safeToCast = (!chargeReady || dist >= 14.0) && dist >= 4.6 && !smashDanger &&
                     !(ec && ec.skill === 'charge');
  if (!me.busy && api.ready('laser') && en.visible && dist <= 22.0 && safeToCast) {
    api.use('laser');
  }

  // ---------- MOVEMENT ----------
  let targetDist, latW, cover;
  const casting = me.casting && me.casting.skill === 'laser';
  if (casting) {
    targetDist = chargeReady ? 22 : 10;
    latW = 0.6; cover = 0;
  } else if (chargeReady) {
    targetDist = dist < 13 ? 18 : 16.5;
    latW = 1.0;
    cover = dist < 13 ? 2.5 : 0;
  } else {
    targetDist = 8.5;
    latW = 1.6;
    cover = 0;
  }

  if (!en.visible && dist > 11) {
    const path = api.pathTo(en.x, en.z);
    if (path && path.points && path.points.length) {
      const wp = path.points[0];
      let d = V.norm({ x: wp.x - me.x, z: wp.z - me.z });
      if (V.len(d) < 0.01 && path.points.length > 1) {
        const w2 = path.points[1];
        d = V.norm({ x: w2.x - me.x, z: w2.z - me.z });
      }
      if (V.len(d) > 0.01) {
        api.move(d.x, d.z);
        S.prevDir = d;
        return;
      }
    }
  }

  const lateral = { x: perpL.x * S.side, z: perpL.z * S.side };
  const d = chooseDir(p, api, targetDist, lateral, latW, cover);
  if (d) {
    api.move(d.x, d.z);
    S.prevDir = d;
  } else {
    const c = V.norm({ x: -me.x, z: -me.z });
    api.move(c.x, c.z);
    S.prevDir = c;
  }

  if (t - S.lastSay > 9) {
    S.lastSay = t;
    api.say(chargeReady ? "eight arms, none of them yours" : "window open");
  }
}
