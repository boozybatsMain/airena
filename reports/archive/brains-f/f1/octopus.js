const PREF = 13.5;
let strafeSign = 1;
let flipT = 0;
let lastChargeT = -99;
let lastSmashT = -99;
let sayT = -99;

function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

function wallPush(me) {
  let px = 0, pz = 0;
  const lim = 20;
  if (me.x > lim - 6) px -= (me.x - (lim - 6)) / 5;
  if (me.x < -(lim - 6)) px += (-(lim - 6) - me.x) / 5;
  if (me.z > lim - 6) pz -= (me.z - (lim - 6)) / 5;
  if (me.z < -(lim - 6)) pz += (-(lim - 6) - me.z) / 5;
  return { x: px, z: pz };
}

function pickSide(api, me, dirH) {
  const a = V.perp(dirH);
  const b = { x: -a.x, z: -a.z };
  const ra = api.ray(a.x, a.z, 9).dist;
  const rb = api.ray(b.x, b.z, 9).dist;
  const ca = 20 - Math.max(Math.abs(me.x + a.x * 6), Math.abs(me.z + a.z * 6));
  const cb = 20 - Math.max(Math.abs(me.x + b.x * 6), Math.abs(me.z + b.z * 6));
  return (ra * 0.7 + ca) >= (rb * 0.7 + cb) ? a : b;
}

function pickEscape(me, en) {
  let best = { x: -Math.sin(0), z: 0 }, bs = -1e9;
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8;
    const dx = Math.sin(a), dz = Math.cos(a);
    const lx = me.x + dx * 7.2, lz = me.z + dz * 7.2;
    let s = Math.hypot(lx - en.x, lz - en.z);
    const out = Math.max(Math.abs(lx), Math.abs(lz));
    if (out > 17.5) s -= (out - 17.5) * 8;
    if (s > bs) { bs = s; best = { x: dx, z: dz }; }
  }
  return best;
}

function chooseMove(api, me, want) {
  if (want.x === 0 && want.z === 0) return want;
  const base = V.heading(want);
  const offs = [0, 0.35, -0.35, 0.7, -0.7, 1.05, -1.05, 1.4, -1.4, 1.9, -1.9, 2.5, -2.5, Math.PI];
  for (const o of offs) {
    const d = V.fromHeading(base + o);
    const r = api.ray(d.x, d.z, 3.4);
    const nx = me.x + d.x * 3.0, nz = me.z + d.z * 3.0;
    if (r.dist > 3.0 && Math.abs(nx) < 19.0 && Math.abs(nz) < 19.0) return d;
  }
  return want;
}

function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me || !en || !me.alive || !en.alive) return;
  const t = p.t;

  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      if (e.skill === 'charge') lastChargeT = t;
      else if (e.skill === 'smash') lastSmashT = t;
    } else if (e.type === 'blocked') {
      strafeSign = -strafeSign; flipT = t;
    }
  }

  if (me.airborne || me.stunned) return;

  const dist = en.dist;
  const toE = V.toward(me, en);
  const awayE = { x: -toE.x, z: -toE.z };
  const perp = V.perp(toE);
  const ec = en.casting;
  const chargeReady = (t - lastChargeT) > 4.3;

  if (t - flipT > 2.0) { flipT = t; if (api.rand() < 0.4) strafeSign = -strafeSign; }

  if (t - sayT > 6) {
    sayT = t;
    api.say(dist > 12 ? "eight arms, one beam" : "too close, ape");
  }

  // ---------- dodge the charge ----------
  if (ec && ec.skill === 'charge' && dist < 18) {
    const eh = V.fromHeading(en.heading);
    const side = pickSide(api, me, eh);
    const dodge = V.norm({ x: side.x + awayE.x * 0.4, z: side.z + awayE.z * 0.4 });
    if (ec.phase === 'dash') {
      if (!me.busy && api.ready('blink')) {
        api.use('blink', dodge.x, dodge.z);
      } else {
        const d = chooseMove(api, me, side);
        api.move(d.x, d.z);
      }
    } else {
      const lat = V.norm({ x: side.x + awayE.x * 0.55, z: side.z + awayE.z * 0.55 });
      const d = chooseMove(api, me, lat);
      api.move(d.x, d.z);
    }
    api.faceAt(en.x, en.z);
    return;
  }

  // ---------- dodge the smash ----------
  if (ec && ec.skill === 'smash' && ec.telegraph && dist < 5.6) {
    if (!me.busy && api.ready('jump')) {
      api.move(awayE.x, awayE.z);
      api.use('jump');
      api.faceAt(en.x, en.z);
      return;
    }
    if (!me.busy && api.ready('blink')) {
      const dg = pickEscape(me, en);
      api.use('blink', dg.x, dg.z);
      api.faceAt(en.x, en.z);
      return;
    }
    const d = chooseMove(api, me, V.norm({ x: awayE.x + perp.x * strafeSign * 0.6, z: awayE.z + perp.z * strafeSign * 0.6 }));
    api.move(d.x, d.z);
    api.faceAt(en.x, en.z);
    return;
  }

  // ---------- panic gap-maker ----------
  if (dist < 5.0 && !me.busy && api.ready('blink') && (!chargeReady || dist < 3.4)) {
    const dg = pickEscape(me, en);
    api.use('blink', dg.x, dg.z);
    api.faceAt(en.x, en.z);
    return;
  }

  // ---------- steering the beam through the cast ----------
  if (me.casting && me.casting.skill === 'laser') {
    const rem = me.casting.telegraph ? (me.casting.remaining || 0) : 0;
    const lead = Math.min(rem, 0.6);
    const px = en.x + (en.vx || 0) * lead;
    const pz = en.z + (en.vz || 0) * lead;
    api.faceAt(px, pz);
    const comp = clamp((dist - PREF) / 5, -1, 1);
    let mv = { x: perp.x * strafeSign + toE.x * comp, z: perp.z * strafeSign + toE.z * comp };
    const wp = wallPush(me);
    mv = V.norm({ x: mv.x + wp.x * 1.4, z: mv.z + wp.z * 1.4 });
    const d = chooseMove(api, me, mv);
    api.move(d.x, d.z);
    return;
  }

  // ---------- fire ----------
  const myFrac = me.hp / me.maxHp, enFrac = en.hp / en.maxHp;
  let pref = PREF;
  if (t > 38 && myFrac > enFrac + 0.02) pref = 15.5;
  if (myFrac < enFrac - 0.15) pref = 11.5;

  if (!me.busy && api.ready('laser') && en.visible && dist < 22 && dist > 4.2) {
    if (!(chargeReady && dist < 8.5)) {
      api.use('laser');
      const lead = 0.55;
      api.faceAt(en.x + (en.vx || 0) * lead, en.z + (en.vz || 0) * lead);
      const comp = clamp((dist - pref) / 5, -1, 1);
      let mv = V.norm({ x: perp.x * strafeSign + toE.x * comp, z: perp.z * strafeSign + toE.z * comp });
      const d = chooseMove(api, me, mv);
      api.move(d.x, d.z);
      return;
    }
  }

  // ---------- no sight: go find an angle ----------
  if (!en.visible && dist > 8) {
    const path = api.pathTo(en.x, en.z);
    if (path && path.points && path.points.length) {
      const w = path.points[0];
      api.move(w.x - me.x, w.z - me.z);
      api.faceAt(en.x, en.z);
      return;
    }
    api.move(toE.x, toE.z);
    api.faceAt(en.x, en.z);
    return;
  }

  // ---------- default kite ----------
  const comp = clamp((dist - pref) / 4, -1, 1);
  let want = { x: toE.x * comp + perp.x * strafeSign * 0.95, z: toE.z * comp + perp.z * strafeSign * 0.95 };
  const wp2 = wallPush(me);
  want = V.norm({ x: want.x + wp2.x * 1.6, z: want.z + wp2.z * 1.6 });
  const d = chooseMove(api, me, want);
  api.move(d.x, d.z);
  api.faceAt(en.x, en.z);
}
