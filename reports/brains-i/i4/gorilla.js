function think(p, api) {
  const me = p.self, en = p.enemy;
  if (p.t < lastT) resetState();
  lastT = p.t;
  if (!me || !me.alive) return;

  const obs = p.arena.obstacles || [];

  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      if (e.skill === 'laser') enemyCd.laser = p.t + 2.2;
      else if (e.skill === 'blink') enemyCd.blink = p.t + 4.4;
      else if (e.skill === 'jump') enemyCd.jump = p.t + 2.8;
    } else if (e.type === 'blocked') {
      strafeFlipT = -99;
    }
  }

  const d = en.dist;
  const casting = en.casting;
  const laserCasting = !!(casting && casting.skill === 'laser' && casting.telegraph);
  const laserRemain = laserCasting ? (casting.remaining != null ? casting.remaining : 0.3) : 99;

  // ---------- already committed to something ----------
  if (me.casting) {
    const c = me.casting;
    if (c.skill === 'smash' && c.phase === 'windup') {
      const q = predict(en, Math.max(0.02, c.remaining || 0.1));
      api.faceAt(q.x, q.z);
      api.move(q.x - me.x, q.z - me.z);
      return;
    }
    if (c.skill === 'charge' && c.phase === 'windup') {
      const tt = Math.max(0.02, c.remaining || 0.1) + Math.max(0, d - 2.2) / 15;
      const q = predict(en, tt);
      api.faceAt(q.x, q.z);
      return;
    }
    api.faceAt(en.x, en.z);
    if (c.phase === 'recover' || c.phase === 'dash') api.move(en.x - me.x, en.z - me.z);
    return;
  }
  if (me.stunned || me.airborne) {
    api.faceAt(en.x, en.z);
    return;
  }

  const myFrac = me.hp / me.maxHp;
  const enFrac = en.hp / en.maxHp;
  const evade = p.t > 44.0 && myFrac > enFrac + 0.05;

  // ---------- offense ----------
  const qSmash = predict(en, 0.28);
  const dSmash = Math.hypot(qSmash.x - me.x, qSmash.z - me.z);
  const angSmash = Math.abs(V.angleTo(me.heading, V.toward(me, qSmash)));
  const smashOk = api.ready('smash') && !en.airborne && !en.invulnerable &&
    dSmash <= 4.5 && angSmash < 1.35 && !blockedSeg(me, qSmash, obs);

  const impactT = 0.28 + Math.max(0, d - 2.2) / 15;
  const qCharge = predict(en, impactT);
  const chargeLane = api.ready('charge') && en.visible && !en.invulnerable &&
    d > 3.0 && d < 11.5 && laneClear(me, qCharge, obs, 1.05) &&
    Math.abs(V.angleTo(me.heading, V.toward(me, qCharge))) < 1.05;

  if (chargeLane && (laserCasting || d > 5.0 || en.stunned === false && d > 4.5)) {
    api.faceAt(qCharge.x, qCharge.z);
    api.use('charge');
    api.move(qCharge.x - me.x, qCharge.z - me.z);
    if (laserCasting) api.say('interrupt');
    return;
  }

  if (smashOk) {
    api.faceAt(qSmash.x, qSmash.z);
    api.use('smash');
    api.move(qSmash.x - me.x, qSmash.z - me.z);
    return;
  }

  // ---------- facing ----------
  const qFace = predict(en, 0.2);
  api.faceAt(qFace.x, qFace.z);

  // ---------- movement ----------
  if (evade) {
    if (!en.visible && d > 8) {
      api.stop();
      return;
    }
    const cp = coverPoint(api, obs, en, me);
    if (cp) {
      goTo(api, p, cp.x, cp.z);
      api.say('outlast');
      return;
    }
    const away = V.away(me, en);
    let tx = me.x + away.x * 8, tz = me.z + away.z * 8;
    tx = Math.max(-18.5, Math.min(18.5, tx));
    tz = Math.max(-18.5, Math.min(18.5, tz));
    goTo(api, p, tx, tz);
    return;
  }

  const toEn = V.toward(me, en);
  let perp = V.perp(toEn);

  if (p.t - strafeFlipT > 0.75) {
    strafeFlipT = p.t;
    if (!sideOk(api, me, V.scale(perp, strafeSign))) strafeSign = -strafeSign;
    else if (api.rand() < 0.35) strafeSign = -strafeSign;
  }
  if (!sideOk(api, me, V.scale(perp, strafeSign))) strafeSign = -strafeSign;

  let dir;
  if (laserCasting && en.visible && d > 3.2) {
    const w = laserRemain < 0.35 ? 1.15 : 0.95;
    dir = V.norm({
      x: perp.x * strafeSign * w + toEn.x * 0.5,
      z: perp.z * strafeSign * w + toEn.z * 0.5
    });
  } else if (d > 7.5 && en.visible && p.t + 0.6 >= enemyCd.laser) {
    dir = V.norm({
      x: toEn.x * 1.0 + perp.x * strafeSign * 0.55,
      z: toEn.z * 1.0 + perp.z * strafeSign * 0.55
    });
  } else if (d > 2.4) {
    dir = toEn;
  } else {
    dir = V.norm({
      x: toEn.x * 0.5 + perp.x * strafeSign * 0.8,
      z: toEn.z * 0.5 + perp.z * strafeSign * 0.8
    });
  }

  const target = { x: me.x + dir.x * 6, z: me.z + dir.z * 6 };
  const straightToEnemy = laneClear(me, en, obs, 0.6);
  if (!en.visible || !straightToEnemy) {
    goTo(api, p, en.x, en.z);
  } else {
    let tx = Math.max(-19, Math.min(19, target.x));
    let tz = Math.max(-19, Math.min(19, target.z));
    api.move(tx - me.x, tz - me.z);
  }
}

let enemyCd = { laser: 0, blink: 0, jump: 0 };
let lastT = -1;
let strafeSign = 1;
let strafeFlipT = -99;

function resetState() {
  enemyCd = { laser: 0, blink: 0, jump: 0 };
  strafeSign = 1;
  strafeFlipT = -99;
}

function predict(en, t) {
  const sp = Math.hypot(en.vx || 0, en.vz || 0);
  const k = sp > 6 ? 6 / sp : 1;
  return { x: en.x + (en.vx || 0) * k * t, z: en.z + (en.vz || 0) * k * t };
}

function segBox(ax, az, bx, bz, minx, maxx, minz, maxz) {
  const dx = bx - ax, dz = bz - az;
  let t0 = 0, t1 = 1;
  if (Math.abs(dx) < 1e-9) {
    if (ax < minx || ax > maxx) return false;
  } else {
    let ta = (minx - ax) / dx, tb = (maxx - ax) / dx;
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return false;
  }
  if (Math.abs(dz) < 1e-9) {
    if (az < minz || az > maxz) return false;
  } else {
    let ta = (minz - az) / dz, tb = (maxz - az) / dz;
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return false;
  }
  return true;
}

function blockedSeg(a, b, obs) {
  for (const o of obs) {
    if (segBox(a.x, a.z, b.x, b.z, o.x - o.hx, o.x + o.hx, o.z - o.hz, o.z + o.hz)) return true;
  }
  return false;
}

function laneClear(a, b, obs, pad) {
  for (const o of obs) {
    if (segBox(a.x, a.z, b.x, b.z, o.x - o.hx - pad, o.x + o.hx + pad, o.z - o.hz - pad, o.z + o.hz + pad)) return false;
  }
  return true;
}

function sideOk(api, me, dir) {
  const nx = me.x + dir.x * 3.2, nz = me.z + dir.z * 3.2;
  if (Math.abs(nx) > 18.3 || Math.abs(nz) > 18.3) return false;
  const r = api.ray(dir.x, dir.z, 3.2);
  if (r && r.hit && r.dist < 3.0) return false;
  return true;
}

function goTo(api, p, x, z) {
  const me = p.self;
  const path = api.pathTo(x, z);
  if (path && !path.direct && path.points && path.points.length) {
    let wp = path.points[0];
    if (path.points.length > 1 && V.dist(me, wp) < 1.2) wp = path.points[1];
    api.move(wp.x - me.x, wp.z - me.z);
  } else {
    api.move(x - me.x, z - me.z);
  }
}

function coverPoint(api, obs, en, me) {
  let best = null, bestScore = -1e9;
  for (const o of obs) {
    const base = V.norm({ x: o.x - en.x, z: o.z - en.z });
    if (base.x === 0 && base.z === 0) continue;
    const r = Math.max(o.hx, o.hz) + 2.2;
    for (const ang of [0, 0.55, -0.55]) {
      const dv = V.rot(base, ang);
      const c = { x: o.x + dv.x * r, z: o.z + dv.z * r };
      if (Math.abs(c.x) > 18.5 || Math.abs(c.z) > 18.5) continue;
      if (!blockedSeg(c, en, obs)) continue;
      const path = api.pathTo(c.x, c.z);
      if (!path) continue;
      const score = -path.dist * 1.0 + V.dist(c, en) * 0.4;
      if (score > bestScore) { bestScore = score; best = c; }
    }
  }
  return best;
}
