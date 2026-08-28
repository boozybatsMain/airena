const D2R = Math.PI / 180;
const HALF = 20;

let strafeSign = 1;
let lastFlip = -9;
const enemyStart = {};
let lastSayT = -9;

function insideBlock(x, z, obs, pad) {
  for (const o of obs) {
    if (Math.abs(x - o.x) <= o.hx + pad && Math.abs(z - o.z) <= o.hz + pad) return true;
  }
  return false;
}

function segBox(ax, az, bx, bz, o, pad) {
  const minx = o.x - o.hx - pad, maxx = o.x + o.hx + pad;
  const minz = o.z - o.hz - pad, maxz = o.z + o.hz + pad;
  if (minx > maxx || minz > maxz) return false;
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dz = bz - az;
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

function segBlocked(ax, az, bx, bz, obs, pad) {
  for (const o of obs) if (segBox(ax, az, bx, bz, o, pad)) return true;
  return false;
}

function predict(e, t) {
  return { x: e.x + (e.vx || 0) * t, z: e.z + (e.vz || 0) * t };
}

function clampPt(pt) {
  return {
    x: Math.max(-HALF + 1.4, Math.min(HALF - 1.4, pt.x)),
    z: Math.max(-HALF + 1.4, Math.min(HALF - 1.4, pt.z))
  };
}

function findCover(me, en, obs) {
  let best = null, bestScore = 1e9;
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8;
    const sx = Math.sin(a), sz = Math.cos(a);
    for (const r of [2.6, 4.2, 6.0]) {
      const x = me.x + sx * r, z = me.z + sz * r;
      if (Math.abs(x) > HALF - 1.6 || Math.abs(z) > HALF - 1.6) continue;
      if (insideBlock(x, z, obs, 1.6)) continue;
      if (!segBlocked(x, z, en.x, en.z, obs, -0.55)) continue;
      if (segBlocked(me.x, me.z, x, z, obs, 1.3)) continue;
      const score = V.dist({ x, z }, en) * 0.45 + r * 0.85;
      if (score < bestScore) { bestScore = score; best = { x, z }; }
    }
  }
  return best;
}

function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me || !me.alive) return;
  const obs = (p.arena && p.arena.obstacles) ? p.arena.obstacles : [];

  for (const e of p.events) {
    if (e.type === 'enemyStarted') enemyStart[e.skill] = p.t;
    if (e.type === 'blocked') { strafeSign = -strafeSign; lastFlip = p.t; }
  }

  if (!en || !en.alive) { api.stop(); return; }

  const d0 = en.dist;
  const toEn = V.toward(me, en);
  const perp = V.perp(toEn);

  // ---------- charge wind-up: keep re-aiming the lock direction ----------
  const cast = me.casting;
  if (cast && cast.skill === 'charge') {
    if (cast.phase === 'windup') {
      const tti = cast.remaining + Math.max(0, d0 - 2.2) / 15;
      const L = clampPt(predict(en, Math.min(tti, 1.0)));
      const dir = V.toward(me, L);
      if (dir.x || dir.z) { api.face(dir.x, dir.z); api.move(dir.x, dir.z); }
    }
    return;
  }
  if (me.airborne || me.stunned) return;

  // ---------- facing ----------
  const aimPt = clampPt(predict(en, 0.28));
  const aimDir = V.toward(me, aimPt);
  if (aimDir.x || aimDir.z) api.face(aimDir.x, aimDir.z);
  else api.faceAt(en.x, en.z);

  const enemyLaserReady = !(enemyStart.laser !== undefined && p.t - enemyStart.laser < 2.15);
  const laserThreat = !!(en.casting && en.casting.skill === 'laser' && en.casting.telegraph);
  const enJumpWind = !!(en.casting && en.casting.skill === 'jump' && en.casting.phase === 'windup');
  const enAirLanding = !!(en.casting && en.casting.skill === 'jump' && en.casting.phase === 'air' && en.casting.remaining <= 0.30);

  // ---------- skills ----------
  let usedSkill = false;
  if (!me.busy) {
    // SMASH
    const tW = 0.3;
    const ep = clampPt(predict(en, tW));
    const mySpd = Math.min(me.speed, 1.7);
    const mvDir = me.speed > 0.05 ? V.norm({ x: me.vx, z: me.vz }) : { x: 0, z: 0 };
    const mp = { x: me.x + mvDir.x * mySpd * tW, z: me.z + mvDir.z * mySpd * tW };
    const dPred = V.dist(mp, ep);
    const sdir = V.toward(mp, ep);
    const ang = Math.abs(V.angleTo(me.heading, sdir));
    const halfCone = 55 * D2R + Math.asin(Math.min(0.99, en.radius / Math.max(dPred, en.radius + 0.05)));
    const airOk = (!en.airborne && !enJumpWind) || enAirLanding;

    if (api.ready('smash') && d0 < 6.4 && dPred <= 4.85 && airOk &&
        !en.invulnerable && ang - 0.62 < halfCone * 0.75) {
      api.use('smash');
      usedSkill = true;
    }

    // CHARGE
    if (!usedSkill && api.ready('charge') && !en.invulnerable && d0 > 3.4 && d0 < 11.8 && en.visible) {
      const tti = 0.3 + Math.max(0, d0 - 2.2) / 15;
      const L = clampPt(predict(en, Math.min(tti * 0.95, 0.95)));
      const cdir = V.toward(me, L);
      const cang = Math.abs(V.angleTo(me.heading, cdir));
      let clear = true;
      if (cdir.x || cdir.z) {
        const r = api.ray(cdir.x, cdir.z, Math.min(d0 + 2, 20));
        if (r && r.hit && r.dist < d0 - 1.4) clear = false;
      } else clear = false;
      const worth = laserThreat || d0 > 4.2 || en.stunned;
      if (clear && worth && cang < 0.85) {
        api.use('charge');
        usedSkill = true;
        if (p.t - lastSayT > 4) { lastSayT = p.t; api.say("run, little squid"); }
      }
    }
  }

  // ---------- movement ----------
  let mv = null;
  let usedMoveTo = false;

  if (laserThreat && d0 > 5.6) {
    const cover = findCover(me, en, obs);
    if (cover) {
      mv = V.toward(me, cover);
    } else {
      mv = V.norm({ x: perp.x * strafeSign * 1.0 + toEn.x * 0.55, z: perp.z * strafeSign * 1.0 + toEn.z * 0.55 });
    }
  } else if (!en.visible) {
    api.moveTo(en.x, en.z);
    usedMoveTo = true;
  } else {
    let w;
    if (d0 <= 2.9) w = 0.55;
    else if (d0 < 5.5) w = laserThreat ? 0.15 : 0.3;
    else w = (enemyLaserReady || laserThreat) ? 0.6 : 0.22;
    mv = V.norm({ x: toEn.x + perp.x * strafeSign * w, z: toEn.z + perp.z * strafeSign * w });
  }

  if (!usedMoveTo && mv && (mv.x || mv.z)) {
    // wall / block avoidance on the chosen vector
    const probe = 3.0;
    let nx = me.x + mv.x * probe, nz = me.z + mv.z * probe;
    let bad = Math.abs(nx) > HALF - 1.7 || Math.abs(nz) > HALF - 1.7 ||
              segBlocked(me.x, me.z, nx, nz, obs, 1.35);
    if (bad) {
      strafeSign = -strafeSign;
      lastFlip = p.t;
      const alt = V.norm({ x: toEn.x + perp.x * strafeSign * 0.7, z: toEn.z + perp.z * strafeSign * 0.7 });
      const ax = me.x + alt.x * probe, az = me.z + alt.z * probe;
      const alsoBad = Math.abs(ax) > HALF - 1.7 || Math.abs(az) > HALF - 1.7 ||
                      segBlocked(me.x, me.z, ax, az, obs, 1.35);
      if (alsoBad) {
        api.moveTo(en.x, en.z);
        usedMoveTo = true;
      } else {
        mv = alt;
      }
    }
    if (!usedMoveTo) api.move(mv.x, mv.z);
  }

  if (p.t - lastFlip > 1.1 + api.rand() * 0.8) {
    strafeSign = -strafeSign;
    lastFlip = p.t;
  }

  api.remember('d', Math.round(d0 * 10) / 10);
  api.remember('hp', me.hp);
}
