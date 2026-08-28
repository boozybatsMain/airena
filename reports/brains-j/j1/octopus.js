const V_ = null;
let side = 1;
let chargeReadyAt = 0;
let smashReadyAt = 0;
let lastBlinkT = -99;
let lastLaserT = -99;
let blockedT = -99;
let sayT = -99;
let hitsTaken = 0;

function cross2(a, b) { return a.x * b.z - a.z * b.x; }

function inArena(x, z, m) {
  return Math.abs(x) < 20 - m && Math.abs(z) < 20 - m;
}

function pickDir(api, me, base, ex, ez, minD) {
  let best = null, bs = -1e9;
  const N = 20;
  for (let i = 0; i < N; i++) {
    const a = i * 2 * Math.PI / N;
    const d = { x: Math.sin(a), z: Math.cos(a) };
    let clear = 3.2;
    try { const r = api.ray(d.x, d.z, 3.2); if (r) clear = r.dist; } catch (e) { clear = 3.2; }
    if (clear < 1.35) continue;
    const nx = me.x + d.x * 2.0, nz = me.z + d.z * 2.0;
    let s = V.dot(d, base) * 2.2 + Math.min(clear, 3) / 3 * 0.5;
    const edge = Math.min(19.3 - Math.abs(nx), 19.3 - Math.abs(nz));
    if (edge < 2.6) s -= (2.6 - edge) * 1.2;
    const nd = Math.hypot(nx - ex, nz - ez);
    if (nd < minD) s -= (minD - nd) * 0.9;
    if (s > bs) { bs = s; best = d; }
  }
  return best || base;
}

function lateralDir(dv, rel, me) {
  let p1 = V.perp(dv);
  if (V.len(p1) < 0.001) p1 = { x: 1, z: 0 };
  p1 = V.norm(p1);
  let p2 = { x: -p1.x, z: -p1.z };
  const lat = V.dot(p1, rel);
  let pick;
  if (Math.abs(lat) < 0.4) {
    // head-on: choose side that keeps us more central
    const c1 = Math.hypot(me.x + p1.x * 6, me.z + p1.z * 6);
    const c2 = Math.hypot(me.x + p2.x * 6, me.z + p2.z * 6);
    pick = c1 <= c2 ? p1 : p2;
  } else {
    pick = lat > 0 ? p1 : p2;
  }
  if (!inArena(me.x + pick.x * 7.0, me.z + pick.z * 7.0, 1.5)) {
    const other = { x: -pick.x, z: -pick.z };
    if (inArena(me.x + other.x * 7.0, me.z + other.z * 7.0, 1.5)) pick = other;
  }
  return pick;
}

function think(p, api) {
  const me = p.self, e = p.enemy;
  if (!me || !me.alive) return;
  const t = p.t;

  for (const ev of p.events) {
    if (ev.type === 'enemyStarted') {
      if (ev.skill === 'charge') chargeReadyAt = t + 4.0;
      else if (ev.skill === 'smash') smashReadyAt = t + 1.3;
    } else if (ev.type === 'blocked') {
      if (t - blockedT > 0.5) { side = -side; blockedT = t; }
    } else if (ev.type === 'damaged') {
      hitsTaken++;
    } else if (ev.type === 'blinked') {
      lastBlinkT = t;
    }
  }

  if (!e || !e.alive) { api.stop(); return; }

  const mePos = { x: me.x, z: me.z };
  const ePos = { x: e.x, z: e.z };
  const dist = e.dist;
  const toE = V.toward(mePos, ePos);
  const away = { x: -toE.x, z: -toE.z };
  const rel = { x: me.x - e.x, z: me.z - e.z };
  const chargeReady = t >= chargeReadyAt;
  const blinkReady = api.ready('blink');
  const jumpReady = api.ready('jump');
  const ec = e.casting;

  // ---- always keep pointing at them (predicted a touch ahead) ----
  const aimLead = 0.12;
  api.faceAt(e.x + e.vx * aimLead, e.z + e.vz * aimLead);

  if (me.stunned || me.airborne) {
    return;
  }

  // ---------------- THREAT: CHARGE ----------------
  if (ec && ec.skill === 'charge' && ec.phase !== 'recover') {
    const dv = V.len({ x: e.vx, z: e.vz }) > 1 && ec.phase === 'dash'
      ? V.norm({ x: e.vx, z: e.vz })
      : V.fromHeading(e.heading);
    const along = -V.dot(rel, dv) < 0 ? V.dot({ x: -rel.x, z: -rel.z }, dv) : V.dot({ x: -rel.x, z: -rel.z }, dv);
    const forward = V.dot({ x: -rel.x, z: -rel.z }, dv) * -1;
    const proj = V.dot({ x: me.x - e.x, z: me.z - e.z }, dv);
    const lat = Math.abs(cross2(dv, { x: me.x - e.x, z: me.z - e.z }));
    const inLine = proj > -1 && proj < 14 && lat < 3.2;
    const side1 = lateralDir(dv, { x: me.x - e.x, z: me.z - e.z }, me);

    let doBlink = false;
    if (blinkReady) {
      if (ec.phase === 'dash' && inLine) doBlink = true;
      else if (ec.phase === 'windup' && (ec.remaining <= 0.13 || dist < 5.5) && dist < 15) doBlink = true;
    }
    if (doBlink) {
      const bd = { x: side1.x * 0.92 + away.x * 0.38, z: side1.z * 0.92 + away.z * 0.38 };
      api.use('blink', bd.x, bd.z);
      api.move(side1.x, side1.z);
      lastBlinkT = t;
      if (t - sayT > 3) { api.say("nope"); sayT = t; }
      return;
    }
    // sidestep hard
    const base = V.norm({ x: side1.x * 1.0 + away.x * 0.45, z: side1.z * 1.0 + away.z * 0.45 });
    const d = pickDir(api, me, base, e.x, e.z, 2.0);
    api.move(d.x, d.z);
    return;
  }

  // ---------------- THREAT: SMASH ----------------
  if (ec && ec.skill === 'smash' && ec.telegraph && dist < 5.4) {
    const tang = V.perp(toE);
    const esc = V.norm({ x: away.x + tang.x * side * 0.7, z: away.z + tang.z * side * 0.7 });
    const d = pickDir(api, me, esc, e.x, e.z, 0);
    api.move(d.x, d.z);
    if (jumpReady) {
      api.use('jump');
      return;
    }
    if (blinkReady && dist < 4.2) {
      api.use('blink', esc.x, esc.z);
      lastBlinkT = t;
      return;
    }
    return;
  }

  // ---------------- PANIC SPACING ----------------
  if (dist < 3.2 && blinkReady && !me.busy && (!chargeReady || dist < 2.4)) {
    const tang = V.perp(toE);
    const esc = V.norm({ x: away.x + tang.x * side * 0.6, z: away.z + tang.z * side * 0.6 });
    let bx = me.x + esc.x * 7.0, bz = me.z + esc.z * 7.0;
    if (!inArena(bx, bz, 1.5)) {
      const c = V.toward(mePos, { x: 0, z: 0 });
      api.use('blink', c.x, c.z);
    } else {
      api.use('blink', esc.x, esc.z);
    }
    lastBlinkT = t;
    api.move(esc.x, esc.z);
    return;
  }

  // ---------------- OFFENSE: LASER ----------------
  if (me.casting && me.casting.skill === 'laser') {
    const rem = Math.max(0, Math.min(me.casting.remaining, 0.7));
    api.faceAt(e.x + e.vx * rem * 0.85, e.z + e.vz * rem * 0.85);
  } else if (api.ready('laser') && e.visible && dist <= 23 && !me.busy) {
    const rem = 0.65;
    api.faceAt(e.x + e.vx * rem * 0.6, e.z + e.vz * rem * 0.6);
    api.use('laser');
    lastLaserT = t;
  }

  // ---------------- MOVEMENT: KITE ----------------
  let D;
  if (chargeReady) D = 13.5; else D = 8.5;
  if (p.burn > 0 && me.hp / me.maxHp > e.hp / e.maxHp) D = Math.max(D, 15);

  let base;
  if (!e.visible) {
    if (dist > D + 1) {
      let wp = null;
      try {
        const path = api.pathTo(e.x, e.z);
        if (path && path.points && path.points.length) wp = path.points[0];
      } catch (err) { wp = null; }
      base = wp ? V.toward(mePos, wp) : toE;
    } else {
      const tang = V.perp(toE);
      base = { x: tang.x * side, z: tang.z * side };
    }
  } else {
    let radial = (D - dist) / 4.5;
    radial = Math.max(-1, Math.min(1, radial));
    const tang = V.perp(toE);
    const tw = 1.0 - Math.abs(radial) * 0.45;
    base = V.norm({
      x: away.x * radial + tang.x * side * tw,
      z: away.z * radial + tang.z * side * tw
    });
  }

  // pull toward centre when hugging the edge
  const rc = Math.hypot(me.x, me.z);
  if (rc > 14) {
    const c = V.toward(mePos, { x: 0, z: 0 });
    const w = Math.min(1, (rc - 14) / 5);
    base = V.norm({ x: base.x * (1 - w) + c.x * w * 1.3, z: base.z * (1 - w) + c.z * w * 1.3 });
  }

  const minKeep = Math.min(D - 1.5, 6.5);
  const d = pickDir(api, me, base, e.x, e.z, Math.max(2.5, minKeep));
  api.move(d.x, d.z);

  // free blink to open the gap when charge is spent
  if (!chargeReady && blinkReady && !me.busy && dist < 6.0 && e.visible) {
    const esc = V.norm({ x: away.x + d.x * 0.5, z: away.z + d.z * 0.5 });
    if (inArena(me.x + esc.x * 7, me.z + esc.z * 7, 1.5)) {
      api.use('blink', esc.x, esc.z);
      lastBlinkT = t;
    }
  }

  if (t - sayT > 8) {
    api.say("eight arms, one beam");
    sayT = t;
    api.remember('d', Math.round(dist));
  }
}
