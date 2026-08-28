const AR = 20;
let lastDir = { x: 0, z: 1 };
let lastChargeT = -100;
let lastSmashT = -100;
let lastBlinkT = -100;
let sayT = -100;
let hitCount = 0;
let shotCount = 0;

function inBlock(x, z, obs, pad) {
  for (const o of obs) {
    if (Math.abs(x - o.x) < o.hx + pad && Math.abs(z - o.z) < o.hz + pad) return true;
  }
  return false;
}

function segBlocked(ax, az, bx, bz, obs, pad) {
  const dx = bx - ax, dz = bz - az;
  for (const o of obs) {
    const minx = o.x - o.hx - pad, maxx = o.x + o.hx + pad;
    const minz = o.z - o.hz - pad, maxz = o.z + o.hz + pad;
    let t0 = 0, t1 = 1, ok = true;
    for (let i = 0; i < 2; i++) {
      const d = i ? dz : dx;
      const s = i ? az : ax;
      const lo = i ? minz : minx;
      const hi = i ? maxz : maxx;
      if (Math.abs(d) < 1e-9) {
        if (s < lo || s > hi) { ok = false; break; }
      } else {
        let ta = (lo - s) / d, tb = (hi - s) / d;
        if (ta > tb) { const tt = ta; ta = tb; tb = tt; }
        if (ta > t0) t0 = ta;
        if (tb < t1) t1 = tb;
        if (t0 > t1) { ok = false; break; }
      }
    }
    if (ok) return true;
  }
  return false;
}

function predictPos(p, t) {
  const en = p.enemy;
  let vx = en.vx, vz = en.vz;
  if (en.stunned) { vx = 0; vz = 0; }
  let x = en.x + vx * t * 0.92;
  let z = en.z + vz * t * 0.92;
  x = Math.max(-19.4, Math.min(19.4, x));
  z = Math.max(-19.4, Math.min(19.4, z));
  return { x, z };
}

function pickMove(p, api, desired, awayBias) {
  const me = p.self, en = p.enemy, obs = p.arena.obstacles;
  const away = V.away({ x: me.x, z: me.z }, { x: en.x, z: en.z });
  let best = null, bestS = -1e9;
  const step = 3.2;
  for (let i = 0; i < 24; i++) {
    const a = (i * Math.PI * 2) / 24;
    const dx = Math.sin(a), dz = Math.cos(a);
    const cx = me.x + dx * step, cz = me.z + dz * step;
    let s = 0;
    const lim = AR - 2.0;
    const ox = Math.max(0, Math.abs(cx) - lim);
    const oz = Math.max(0, Math.abs(cz) - lim);
    s -= (ox + oz) * 5;
    if (inBlock(cx, cz, obs, 1.35)) s -= 9;
    const r = api.ray(dx, dz, 3.6);
    s += Math.min(r.dist, 3.6) * 0.85;
    const d = Math.hypot(cx - en.x, cz - en.z);
    s -= Math.abs(d - desired) * 1.15;
    if (!segBlocked(cx, cz, en.x, en.z, obs, 0)) s += 2.4;
    s += (dx * lastDir.x + dz * lastDir.z) * 0.9;
    if (awayBias > 0) s += (dx * away.x + dz * away.z) * awayBias;
    if (s > bestS) { bestS = s; best = { x: dx, z: dz }; }
  }
  if (!best) best = away;
  lastDir = best;
  api.move(best.x, best.z);
  return best;
}

function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive) return;

  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      if (e.skill === 'charge') lastChargeT = p.t;
      else if (e.skill === 'smash') lastSmashT = p.t;
    } else if (e.type === 'dealt' && e.skill === 'laser') {
      hitCount++;
    } else if (e.type === 'missed' && e.skill === 'laser') {
      shotCount++;
    } else if (e.type === 'blinked') {
      lastBlinkT = p.t;
    }
  }

  if (!en.alive) { api.stop(); return; }

  const obs = p.arena.obstacles;
  const dist = en.dist;
  const relx = me.x - en.x, relz = me.z - en.z;

  const enCast = en.casting;
  if (enCast && enCast.skill === 'charge') {
    const st = p.t - (enCast.elapsed || 0);
    if (st > lastChargeT) lastChargeT = st;
  }
  if (enCast && enCast.skill === 'smash') {
    const st = p.t - (enCast.elapsed || 0);
    if (st > lastSmashT) lastSmashT = st;
  }
  const chargeCd = Math.max(0, 4 - (p.t - lastChargeT));

  // ---------------- charge dash dodge ----------------
  let dashThreat = false, dDir = null;
  if (enCast && enCast.skill === 'charge') {
    let dir;
    if (en.speed > 6) dir = V.norm({ x: en.vx, z: en.vz });
    else dir = V.fromHeading(en.heading);
    const along = relx * dir.x + relz * dir.z;
    const perp = Math.abs(relx * dir.z - relz * dir.x);
    if (enCast.phase === 'dash') {
      if (along > -2.0 && along < 15 && perp < 3.0) { dashThreat = true; dDir = dir; }
    } else if (enCast.phase === 'windup') {
      // they aim at us; sidestep early
      if (dist < 16) { dashThreat = perp < 3.0 && along > -2.0 && dist < 14 ? false : false; }
    }
  }

  if (dashThreat && dDir) {
    const pA = { x: dDir.z, z: -dDir.x };
    const pB = { x: -dDir.z, z: dDir.x };
    const first = (relx * pA.x + relz * pA.z) >= 0 ? pA : pB;
    const second = first === pA ? pB : pA;
    const room = (v) => {
      const tx = me.x + v.x * 7.5, tz = me.z + v.z * 7.5;
      return Math.min(AR - Math.abs(tx), AR - Math.abs(tz));
    };
    let v = room(first) >= 1.5 ? first : (room(second) > room(first) ? second : first);
    if (api.ready('blink') && !me.busy && !me.stunned) {
      api.use('blink', v.x, v.z);
      if (p.t - sayT > 3) { sayT = p.t; api.say('slip'); }
    }
    api.move(v.x, v.z);
    lastDir = v;
    api.faceAt(en.x, en.z);
    return;
  }

  // pre-emptive sidestep while their charge winds up
  if (enCast && enCast.skill === 'charge' && enCast.phase === 'windup') {
    const dir = V.fromHeading(en.heading);
    const pA = { x: dir.z, z: -dir.x };
    const pB = { x: -dir.z, z: dir.x };
    let v = (relx * pA.x + relz * pA.z) >= 0 ? pA : pB;
    const tx = me.x + v.x * 4, tz = me.z + v.z * 4;
    if (Math.abs(tx) > 18.5 || Math.abs(tz) > 18.5 || inBlock(tx, tz, obs, 1.3)) {
      v = v === pA ? pB : pA;
    }
    if (!me.busy) {
      api.move(v.x, v.z);
      lastDir = v;
      api.faceAt(en.x, en.z);
      return;
    }
  }

  // ---------------- smash dodge ----------------
  const smashing = enCast && enCast.skill === 'smash' && enCast.telegraph;
  if (smashing && dist < 5.0 && !me.airborne) {
    if (api.ready('blink') && !me.busy && !me.stunned) {
      api.use('blink', relx, relz);
    } else if (api.ready('jump') && !me.busy && !me.stunned && enCast.remaining > 0.12) {
      api.use('jump');
    }
    const esc = V.norm({ x: relx, z: relz });
    api.move(esc.x, esc.z);
    lastDir = esc;
    api.faceAt(en.x, en.z);
    return;
  }

  // ---------------- emergency separation ----------------
  if (dist < 4.0 && !me.busy && !me.stunned && api.ready('blink') && chargeCd > 1.2) {
    const away = V.norm({ x: relx, z: relz });
    let v = away;
    const tx = me.x + v.x * 7.5, tz = me.z + v.z * 7.5;
    if (Math.abs(tx) > 19 || Math.abs(tz) > 19) {
      const c = V.norm({ x: -me.x, z: -me.z });
      v = V.norm({ x: away.x + c.x * 1.4, z: away.z + c.z * 1.4 });
    }
    api.use('blink', v.x, v.z);
    api.move(v.x, v.z);
    lastDir = v;
    api.faceAt(en.x, en.z);
    return;
  }

  // ---------------- aiming ----------------
  const casting = me.casting && me.casting.skill === 'laser';
  const tleft = casting ? Math.max(0, me.casting.remaining) : 0.65;
  const aim = predictPos(p, Math.min(tleft, 0.72));
  if (!segBlocked(me.x, me.z, aim.x, aim.z, obs, 0)) api.faceAt(aim.x, aim.z);
  else api.faceAt(en.x, en.z);

  // ---------------- laser ----------------
  const enemyAir = en.airborne;
  const closeSafe = dist > 5.4 || en.stunned || (enCast && enCast.phase === 'recover');
  const chargeSafe = chargeCd > 0.62 || dist > 16.5;
  const losOk = en.visible && !segBlocked(me.x, me.z, aim.x, aim.z, obs, 0);

  if (!me.busy && !me.stunned && !me.airborne && api.ready('laser') &&
      dist <= 21.5 && losOk && chargeSafe && closeSafe && !enemyAir) {
    api.use('laser');
    shotCount++;
    if (p.t - sayT > 4) { sayT = p.t; api.say('beam'); }
  }

  // ---------------- kiting ----------------
  let desired;
  if (chargeCd < 1.1) desired = 17.0;
  else if (chargeCd < 2.2) desired = 13.0;
  else desired = 10.0;

  if (p.burn > 0) {
    const myFrac = me.hp / me.maxHp, hisFrac = en.hp / en.maxHp;
    if (myFrac > hisFrac + 0.05) desired = Math.max(desired, 16.5);
  }
  if (en.stunned || (enCast && enCast.phase === 'recover')) desired = Math.min(desired, 11.0);

  let awayBias = 0;
  if (dist < desired - 2) awayBias = 1.6;
  if (dist < 6) awayBias = 3.0;

  pickMove(p, api, desired, awayBias);

  api.remember('chargeCd', Math.round(chargeCd * 10) / 10);
  api.remember('range', Math.round(dist * 10) / 10);
}
