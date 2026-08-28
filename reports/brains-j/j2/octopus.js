function clampNum(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

function leadPoint(p, tAhead) {
  const e = p.enemy;
  const ec = e.casting;
  let f = 0.55;
  let t = tAhead;
  if (e.airborne) f = 1.0;
  if (ec && ec.skill === 'charge' && ec.phase === 'dash') {
    f = 1.0;
    if (typeof ec.remaining === 'number') t = Math.min(t, ec.remaining);
  }
  if (ec && ec.skill === 'smash') f = 0.2;
  if (ec && ec.skill === 'charge' && ec.phase === 'windup') f = 0.2;
  if (e.stunned) f = 0.1;
  return {
    x: clampNum(e.x + e.vx * t * f, -19.4, 19.4),
    z: clampNum(e.z + e.vz * t * f, -19.4, 19.4)
  };
}

let sideSign = 1;
let sideUntil = -1;
let lastChargeStart = -99;
let lastSmashStart = -99;
let sawChargeWindup = false;
let talkAt = 0;

function think(p, api) {
  const s = p.self, e = p.enemy;
  if (!s.alive || !e.alive) return;

  for (const ev of p.events) {
    if (ev.type === 'enemyStarted') {
      if (ev.skill === 'charge') lastChargeStart = p.t;
      else if (ev.skill === 'smash') lastSmashStart = p.t;
    } else if (ev.type === 'blocked') {
      sideUntil = -1;
    }
  }

  const ec = e.casting;
  if (ec && ec.skill === 'charge') {
    if (!sawChargeWindup) { lastChargeStart = p.t - (ec.elapsed || 0); sawChargeWindup = true; }
  } else {
    sawChargeWindup = false;
  }

  const chargeReady = (p.t - lastChargeStart) >= 3.85;
  const smashReady = (p.t - lastSmashStart) >= 1.25;

  const dist = e.dist;
  const toE = V.toward(s, e);
  const perp = { x: toE.z, z: -toE.x };

  // ---- pick a strafing side occasionally ----
  if (p.t > sideUntil) {
    let a = 10, b = 10;
    try { a = api.ray(perp.x, perp.z, 9).dist; } catch (err) { a = 9; }
    try { b = api.ray(-perp.x, -perp.z, 9).dist; } catch (err) { b = 9; }
    const cen = V.norm({ x: -s.x, z: -s.z });
    const bias = 3.0 * V.dot(perp, cen);
    sideSign = (a + bias >= b - bias) ? 1 : -1;
    sideUntil = p.t + 0.9 + api.rand() * 0.7;
  }

  const busy = s.busy || s.airborne || s.stunned;

  // ================= DODGE: charge dash committed =================
  if (ec && ec.skill === 'charge' && ec.phase === 'dash') {
    const dir = V.fromHeading(e.heading);
    const rel = { x: s.x - e.x, z: s.z - e.z };
    const along = V.dot(rel, dir);
    const lat = rel.x * dir.z - rel.z * dir.x;
    const sd = lat >= 0 ? 1 : -1;
    const dodge = { x: dir.z * sd, z: -dir.x * sd };
    const threat = along > -2.0 && along < 15 && Math.abs(lat) < 3.4;
    if (threat) {
      let d = V.norm({ x: dodge.x - dir.x * 0.25, z: dodge.z - dir.z * 0.25 });
      api.move(d.x, d.z);
      const lp = leadPoint(p, 0.6);
      api.faceAt(lp.x, lp.z);
      if (!busy && api.ready('blink') && Math.abs(lat) < 2.8 && along < 12 && along > -1.5) {
        api.use('blink', d.x, d.z);
      }
      return;
    }
  }

  // ================= DODGE: charge wind-up (build lateral speed) =================
  if (ec && ec.skill === 'charge' && ec.phase === 'windup' && dist < 16) {
    let d = V.norm({ x: perp.x * sideSign - toE.x * 0.35, z: perp.z * sideSign - toE.z * 0.35 });
    d = avoid(api, d, sideSign, dist);
    api.move(d.x, d.z);
    const lp = leadPoint(p, 0.6);
    api.faceAt(lp.x, lp.z);
    return;
  }

  // ================= DODGE: smash =================
  if (ec && ec.skill === 'smash' && ec.telegraph && dist < 6.4) {
    let d = V.norm({ x: -toE.x + perp.x * sideSign * 0.7, z: -toE.z + perp.z * sideSign * 0.7 });
    d = avoid(api, d, sideSign, dist);
    api.move(d.x, d.z);
    api.faceAt(e.x, e.z);
    if (!busy && dist < 5.4 && api.ready('jump')) {
      api.use('jump');
      return;
    }
    if (!busy && dist < 4.6 && !api.ready('jump') && api.ready('blink') && !chargeReady) {
      api.use('blink', d.x, d.z);
      return;
    }
    if (dist < 5.4) return;
  }

  // ================= panic escape when glued to the gorilla =================
  if (!busy && dist < 2.9 && api.ready('blink') && !chargeReady) {
    let d = V.norm({ x: -toE.x + perp.x * sideSign * 0.8, z: -toE.z + perp.z * sideSign * 0.8 });
    api.use('blink', d.x, d.z);
    api.move(d.x, d.z);
    api.faceAt(e.x, e.z);
    return;
  }

  // ================= no line of sight: go find one =================
  if (!e.visible) {
    const path = api.pathTo(e.x, e.z);
    let tx = e.x, tz = e.z;
    if (path && path.points && path.points.length) {
      const wp = path.points[0];
      tx = wp.x; tz = wp.z;
    }
    if (path && path.dist < 6.5) {
      let d = V.norm({ x: perp.x * sideSign, z: perp.z * sideSign });
      d = avoid(api, d, sideSign, dist);
      api.move(d.x, d.z);
    } else {
      api.moveTo(tx, tz);
    }
    api.faceAt(e.x, e.z);
    return;
  }

  // ================= ranged duel =================
  const myFrac = s.hp / s.maxHp;
  const hisFrac = e.hp / e.maxHp;
  const ahead = myFrac - hisFrac;

  let pref = chargeReady ? 11.5 : 8.0;
  if (p.t > 38 && ahead > 0.06) pref = chargeReady ? 15.0 : 12.0;
  if (ahead < -0.15) pref = chargeReady ? 10.0 : 7.0;
  if (dist > 22) pref = 14;

  const castingLaser = s.casting && s.casting.skill === 'laser';
  const castRem = castingLaser ? Math.max(0, (s.casting.remaining || 0.3) - 0.08) : 0.66;
  const lp = leadPoint(p, castRem);
  api.faceAt(lp.x, lp.z);

  // fire?
  if (!busy && api.ready('laser') && dist < 21.5) {
    let ok = api.los(lp.x, lp.z) || api.los(e.x, e.z);
    if (ec && ec.skill === 'charge' && ec.phase === 'windup' && dist < 15) ok = false;
    if (dist < 4.6) ok = false;
    if (dist < 6.6 && smashReady && !e.stunned && !e.airborne) ok = false;
    if (chargeReady && dist < 5.5) ok = false;
    // angle gate: don't waste it while badly off-aim
    if (ok) {
      const want = V.toward({ x: s.x, z: s.z }, lp);
      const err = Math.abs(V.angleTo(s.heading, want));
      if (err > 1.5) ok = false;
    }
    if (ok) {
      api.use('laser');
      if (p.t > talkAt) { talkAt = p.t + 6; api.say("ink and light"); }
    }
  }

  // movement
  const radial = clampNum((dist - pref) / 3.5, -1, 1);
  let tanW = 0.95;
  if (castingLaser) tanW = 0.6;
  let mv = {
    x: toE.x * radial + perp.x * sideSign * tanW,
    z: toE.z * radial + perp.z * sideSign * tanW
  };

  const wp = { x: 0, z: 0 };
  if (s.x > 14.5) wp.x -= (s.x - 14.5) / 4;
  if (s.x < -14.5) wp.x += (-14.5 - s.x) / 4;
  if (s.z > 14.5) wp.z -= (s.z - 14.5) / 4;
  if (s.z < -14.5) wp.z += (-14.5 - s.z) / 4;
  mv = V.add(mv, V.scale(wp, 2.0));

  let d = V.norm(mv);
  if (V.len(mv) < 0.06) d = { x: perp.x * sideSign, z: perp.z * sideSign };
  d = avoid(api, d, sideSign, dist);
  api.move(d.x, d.z);
}

function avoid(api, d, sign, dist) {
  if (dist < 3.2) return d;
  let cur = d;
  for (let k = 0; k < 7; k++) {
    let r;
    try { r = api.ray(cur.x, cur.z, 2.6); } catch (err) { return cur; }
    if (!r.hit || r.dist > 2.3) return cur;
    cur = V.rot(cur, 0.55 * sign);
  }
  return cur;
}
