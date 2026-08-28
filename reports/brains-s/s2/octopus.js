const LASER_CAST = 0.667;
const DESIRED = 15.0;

let strafe = 1;
let lastEnemy = { smash: -99, charge: -99, jump: -99 };
let lastFlip = -99;

function segAABB(ax, az, bx, bz, minx, minz, maxx, maxz) {
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dz = bz - az;
  const axis = [[dx, minx, maxx, ax], [dz, minz, maxz, az]];
  for (const a of axis) {
    const pp = a[0], q0 = a[1], q1 = a[2], o = a[3];
    if (Math.abs(pp) < 1e-9) {
      if (o < q0 || o > q1) return false;
    } else {
      let ta = (q0 - o) / pp, tb = (q1 - o) / pp;
      if (ta > tb) { const t = ta; ta = tb; tb = t; }
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
      if (t0 > t1) return false;
    }
  }
  return true;
}

function segBlocked(ax, az, bx, bz, obs) {
  for (const o of obs) {
    if (segAABB(ax, az, bx, bz, o.x - o.hx, o.z - o.hz, o.x + o.hx, o.z + o.hz)) return true;
  }
  return false;
}

function clearAhead(api, d, maxd) {
  const r = api.ray(d.x, d.z, maxd);
  return r && r.hit ? r.dist : maxd;
}

function chooseDir(p, api, base) {
  const me = p.self;
  let best = base, bs = -1e9;
  for (let i = 0; i <= 12; i++) {
    const signs = i === 0 ? [1] : [1, -1];
    for (const s of signs) {
      const ang = s * i * (Math.PI / 12);
      const d = V.rot(base, ang);
      const cl = clearAhead(api, d, 4.5);
      const fx = me.x + d.x * 3.0, fz = me.z + d.z * 3.0;
      let sc = Math.cos(ang) * 2.2 + Math.min(cl, 4.5) * 0.7;
      const edge = Math.min(20 - Math.abs(fx), 20 - Math.abs(fz));
      if (edge < 4.5) sc -= (4.5 - edge) * 1.4;
      if (cl < 1.6) sc -= 6;
      if (sc > bs) { bs = sc; best = d; }
    }
  }
  return best;
}

function blinkDodge(me, en, dir) {
  const perp = V.perp(dir);
  const nperp = V.scale(perp, -1);
  const back = V.scale(dir, -1);
  const cands = [
    perp, nperp,
    V.norm(V.add(perp, V.scale(back, 0.7))),
    V.norm(V.add(nperp, V.scale(back, 0.7)))
  ];
  let best = cands[0], bs = -1e9;
  for (const c of cands) {
    let px = me.x + c.x * 7.2, pz = me.z + c.z * 7.2;
    px = Math.max(-19.2, Math.min(19.2, px));
    pz = Math.max(-19.2, Math.min(19.2, pz));
    const rel = { x: px - en.x, z: pz - en.z };
    const side = Math.abs(rel.x * dir.z - rel.z * dir.x);
    const margin = Math.min(20 - Math.abs(px), 20 - Math.abs(pz));
    const sc = side * 1.0 + margin * 0.6;
    if (sc > bs) { bs = sc; best = c; }
  }
  return best;
}

function blinkAway(me, en, obs) {
  const away = V.away(me, en);
  let best = away, bs = -1e9;
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8;
    const d = { x: Math.sin(a), z: Math.cos(a) };
    if (V.dot(d, away) < -0.1) continue;
    let px = me.x + d.x * 7.3, pz = me.z + d.z * 7.3;
    px = Math.max(-18.8, Math.min(18.8, px));
    pz = Math.max(-18.8, Math.min(18.8, pz));
    const dd = Math.hypot(px - en.x, pz - en.z);
    const margin = Math.min(20 - Math.abs(px), 20 - Math.abs(pz));
    let sc = Math.min(dd, 18) * 1.0 + margin * 0.5;
    if (!segBlocked(px, pz, en.x, en.z, obs)) sc += 1.0;
    if (sc > bs) { bs = sc; best = d; }
  }
  return best;
}

function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en || !en.alive) return;
  const obs = p.arena.obstacles || [];
  const dist = en.dist;

  for (const e of p.events) {
    if (e.type === 'enemyStarted' && e.skill) lastEnemy[e.skill] = p.t;
    if (e.type === 'blocked' && p.t - lastFlip > 0.5) { strafe = -strafe; lastFlip = p.t; }
  }
  if (p.t - lastFlip > 3.2 && api.rand() < 0.05) { strafe = -strafe; lastFlip = p.t; }

  const ec = en.casting;
  const enCharge = ec && ec.skill === 'charge';
  const enDash = enCharge && ec.phase === 'dash';
  const enChWind = enCharge && ec.phase === 'windup';
  const enSmash = ec && ec.skill === 'smash' && ec.telegraph;
  const chargeReady = (p.t - lastEnemy.charge) > 3.95;

  const castRem = (me.casting && me.casting.skill === 'laser' && me.casting.telegraph)
    ? me.casting.remaining : LASER_CAST;
  let lx = en.x + en.vx * castRem * 0.9;
  let lz = en.z + en.vz * castRem * 0.9;
  if (enDash) { lx = en.x + en.vx * 0.12; lz = en.z + en.vz * 0.12; }
  lx = Math.max(-20, Math.min(20, lx));
  lz = Math.max(-20, Math.min(20, lz));
  api.faceAt(lx, lz);

  const away = V.away(me, en);
  const toEn = V.toward(me, en);
  const tangent = V.perp(toEn);

  if ((enDash || (enChWind && ec.remaining <= 0.09)) && dist < 17) {
    const dir = V.fromHeading(en.heading);
    const rel = { x: me.x - en.x, z: me.z - en.z };
    const along = V.dot(rel, dir);
    const side = Math.abs(rel.x * dir.z - rel.z * dir.x);
    if (along > -1.5 && side < 3.6) {
      const d = blinkDodge(me, en, dir);
      if (api.ready('blink')) {
        api.use('blink', d.x, d.z);
        api.move(d.x, d.z);
        api.say("not there");
        return;
      }
      api.move(d.x, d.z);
      return;
    }
  }

  if (enSmash && dist < 6.6 && !me.airborne) {
    if (api.ready('jump')) {
      api.move(away.x, away.z);
      api.use('jump');
      return;
    }
    if (api.ready('blink')) {
      const d = blinkAway(me, en, obs);
      api.use('blink', d.x, d.z);
      api.move(d.x, d.z);
      return;
    }
    const d = chooseDir(p, api, away);
    api.move(d.x, d.z);
    return;
  }

  if (dist < 5.8 && !me.busy && !en.stunned) {
    if (api.ready('blink')) {
      const d = blinkAway(me, en, obs);
      api.use('blink', d.x, d.z);
      api.move(d.x, d.z);
      return;
    }
  }

  const aimDir = V.toward(me, { x: lx, z: lz });
  const angErr = Math.abs(V.angleTo(me.heading, aimDir));
  const clearShot = en.visible && !segBlocked(me.x, me.z, lx, lz, obs);
  const safeCast = dist >= 9.2 || !chargeReady || en.stunned ||
    (ec && ec.phase === 'recover') || (ec && ec.skill === 'jump');
  if (api.ready('laser') && clearShot && dist > 5.6 && dist < 22.5 &&
      angErr < 1.15 && !enChWind && !enDash && !me.airborne && safeCast &&
      !(enSmash && dist < 7.2)) {
    api.use('laser');
  }

  if (!en.visible && dist > 6) {
    let best = null, bs = -1e9;
    for (let i = 0; i < 16; i++) {
      const a = i * Math.PI / 8;
      const d = { x: Math.sin(a), z: Math.cos(a) };
      const r = api.ray(d.x, d.z, 4.5);
      const step = Math.min(r && r.hit ? r.dist - 0.8 : 4.5, 4.5);
      if (step < 1.6) continue;
      const px = me.x + d.x * step, pz = me.z + d.z * step;
      if (Math.abs(px) > 19 || Math.abs(pz) > 19) continue;
      let sc = 0;
      if (!segBlocked(px, pz, en.x, en.z, obs)) sc += 12;
      const dd = Math.hypot(px - en.x, pz - en.z);
      sc -= Math.abs(dd - DESIRED) * 0.35;
      sc += Math.min(20 - Math.abs(px), 20 - Math.abs(pz)) * 0.2;
      if (sc > bs) { bs = sc; best = d; }
    }
    if (best) { api.move(best.x, best.z); return; }
  }

  let base;
  if (dist < DESIRED - 1.5) {
    base = V.norm(V.add(V.scale(away, 1.0), V.scale(tangent, strafe * 0.8)));
  } else if (dist > DESIRED + 4) {
    base = V.norm(V.add(V.scale(toEn, 1.0), V.scale(tangent, strafe * 0.45)));
  } else {
    base = V.norm(V.add(V.scale(tangent, strafe), V.scale(away, 0.2)));
  }

  const rep = { x: 0, z: 0 };
  const eX = 20 - Math.abs(me.x), eZ = 20 - Math.abs(me.z);
  if (eX < 7) rep.x = -Math.sign(me.x) * ((7 - eX) / 7) * 1.8;
  if (eZ < 7) rep.z = -Math.sign(me.z) * ((7 - eZ) / 7) * 1.8;
  base = V.norm(V.add(base, rep));
  if (V.len(base) < 0.01) base = away;

  const dir = chooseDir(p, api, base);
  api.move(dir.x, dir.z);
}
