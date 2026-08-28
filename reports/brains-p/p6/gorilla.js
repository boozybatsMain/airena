const ARENA_HALF = 20;
const SMASH_REACH = 2.9;
const CHARGE_MAX = 12.0;

let S = null;
function reset() {
  S = { lastT: 0, lastLaser: -99, lastBlink: -99, orbit: 1, blockT: -99, said: false, lastCharge: -99 };
}
reset();

function clampArena(pt) {
  return {
    x: Math.max(-ARENA_HALF + 1.4, Math.min(ARENA_HALF - 1.4, pt.x)),
    z: Math.max(-ARENA_HALF + 1.4, Math.min(ARENA_HALF - 1.4, pt.z))
  };
}

function segHitsBox(ax, az, bx, bz, o, pad) {
  const minx = o.x - o.hx - pad, maxx = o.x + o.hx + pad;
  const minz = o.z - o.hz - pad, maxz = o.z + o.hz + pad;
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dz = bz - az;
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

function blockedSeg(a, b, obs, pad) {
  for (const o of obs) if (segHitsBox(a.x, a.z, b.x, b.z, o, pad)) return true;
  return false;
}

function insideBox(pt, obs, pad) {
  for (const o of obs) {
    if (Math.abs(pt.x - o.x) <= o.hx + pad && Math.abs(pt.z - o.z) <= o.hz + pad) return true;
  }
  return false;
}

// true when a beam from src to pt would be fully eaten by a block (checked with body width)
function coveredFrom(pt, src, obs) {
  const dir = V.norm({ x: pt.x - src.x, z: pt.z - src.z });
  if (dir.x === 0 && dir.z === 0) return false;
  const per = { x: dir.z, z: -dir.x };
  const offs = [0, 1.5, -1.5];
  for (const s of offs) {
    const q = { x: pt.x + per.x * s, z: pt.z + per.z * s };
    if (!blockedSeg(src, q, obs, 0)) return false;
  }
  return true;
}

function pickCover(me, en, obs, reach, mustProgress, baseD) {
  let best = null, bestScore = -1e9;
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8;
    const dir = { x: Math.sin(a), z: Math.cos(a) };
    const pt = { x: me.x + dir.x * reach, z: me.z + dir.z * reach };
    if (Math.abs(pt.x) > ARENA_HALF - 1.6 || Math.abs(pt.z) > ARENA_HALF - 1.6) continue;
    if (insideBox(pt, obs, 1.5)) continue;
    if (blockedSeg(me, pt, obs, 1.1)) continue;
    if (!coveredFrom(pt, en, obs)) continue;
    const nd = V.dist(pt, en);
    if (nd > baseD - mustProgress) continue;
    const score = 100 - nd;
    if (score > bestScore) { bestScore = score; best = dir; }
  }
  return best;
}

function think(p, api) {
  const me = p.self, en = p.enemy;
  if (p.t < S.lastT - 0.05) reset();
  S.lastT = p.t;
  if (!me.alive) return;
  const obs = p.arena.obstacles;
  const now = p.t;

  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      if (e.skill === 'laser') S.lastLaser = now;
      else if (e.skill === 'blink') S.lastBlink = now;
    } else if (e.type === 'blocked') {
      S.blockT = now;
      if (now - S.lastFlip > 0.6) { S.orbit = -S.orbit; S.lastFlip = now; }
    }
  }
  if (S.lastFlip === undefined) S.lastFlip = 0;

  if (!S.said) { S.said = true; api.say("Hands on. No beam survives contact."); }

  if (!en || !en.alive) { api.stop(); return; }

  const d = en.dist;
  const eV = { x: en.vx, z: en.vz };
  const toE = V.toward(me, en);
  const per = { x: toE.z, z: -toE.x };
  const enemyCasting = en.casting && en.casting.skill === 'laser' && en.casting.telegraph;
  const castLeft = enemyCasting ? en.casting.remaining : 0;
  const laserReadySoon = (now - S.lastLaser) > 1.9;

  // ---- charge aim (lead the target) ----
  const eFut = clampArena({ x: en.x + en.vx * 0.3, z: en.z + en.vz * 0.3 });
  let aim = eFut;
  try {
    const l = V.lead(me, eFut, eV, 15);
    if (l && isFinite(l.x) && isFinite(l.z)) aim = clampArena(l);
  } catch (err) { aim = eFut; }
  const aimDist = V.dist(me, aim);
  const aimDir = aimDist > 0.001 ? V.toward(me, aim) : toE;
  const chargeClear = !blockedSeg(me, aim, obs, 0.85);
  const aimAng = Math.abs(V.angleTo(me.heading, aimDir));

  const free = !me.busy && !me.stunned && !me.airborne;

  // ---- smash prediction ----
  const predE = { x: en.x + en.vx * 0.3, z: en.z + en.vz * 0.3 };
  const predS = { x: me.x + me.vx * 0.12, z: me.z + me.vz * 0.12 };
  const sd = V.dist(predS, predE);
  const need = SMASH_REACH + en.radius + me.radius;
  const sDir = sd > 0.001 ? V.toward(predS, predE) : V.fromHeading(me.heading);
  const sAng = Math.abs(V.angleTo(me.heading, sDir));
  const cone = 0.96 + Math.asin(Math.min(0.98, en.radius / Math.max(sd, 1.05)));
  const smashHits = sd <= need - 0.3 && sAng < cone + 0.55 && !en.airborne && !en.invulnerable;

  let didSkill = false;

  if (free) {
    if (api.ready('smash') && smashHits) {
      api.use('smash');
      didSkill = true;
      S.lastSmash = now;
    } else if (api.ready('charge') && !en.invulnerable && chargeClear && aimAng < 1.0 &&
               aimDist >= 3.0 && aimDist <= CHARGE_MAX + 0.2) {
      api.use('charge');
      didSkill = true;
      S.lastCharge = now;
    } else if (api.ready('charge') && d > CHARGE_MAX && !en.invulnerable) {
      // gap-closing charge: straight at them if the lane is open
      const far = { x: me.x + toE.x * 11.5, z: me.z + toE.z * 11.5 };
      if (!blockedSeg(me, far, obs, 0.85) && Math.abs(V.angleTo(me.heading, toE)) < 0.7 &&
          Math.abs(far.x) < ARENA_HALF - 1.3 && Math.abs(far.z) < ARENA_HALF - 1.3) {
        api.use('charge');
        didSkill = true;
        S.lastCharge = now;
      }
    }
  }

  // ---- facing ----
  const casting = me.casting;
  if (casting && casting.skill === 'charge' && casting.phase === 'windup') {
    api.face(aimDir.x, aimDir.z);
  } else if (didSkill && !didSkillIsCharge(api)) {
    api.faceAt(predE.x, predE.z);
  } else {
    api.faceAt(en.x + en.vx * 0.22, en.z + en.vz * 0.22);
  }

  // ---- movement ----
  if (me.airborne) return;

  if (enemyCasting) {
    if (d < 3.6) {
      // orbit faster than they can track at contact range
      const mv = V.norm({ x: per.x * S.orbit * 1.0 + toE.x * 0.25, z: per.z * S.orbit * 1.0 + toE.z * 0.25 });
      api.move(mv.x, mv.z);
      return;
    }
    const reach = Math.max(1.6, Math.min(3.4, castLeft * 5.35));
    const cov = pickCover(me, en, obs, reach, -1.5, d);
    if (cov) { api.move(cov.x, cov.z); return; }
    const mv = V.norm({ x: toE.x * 0.75 + per.x * S.orbit * 0.9, z: toE.z * 0.75 + per.z * S.orbit * 0.9 });
    api.move(mv.x, mv.z);
    return;
  }

  if (d > 6.5 && laserReadySoon && en.visible) {
    const cov = pickCover(me, en, obs, 3.0, 0.6, d);
    if (cov) { api.move(cov.x, cov.z); return; }
  }

  if (d > 3.0) {
    const tgt = { x: en.x + en.vx * 0.35, z: en.z + en.vz * 0.35 };
    if (!blockedSeg(me, en, obs, 0.85)) {
      const dir = V.toward(me, tgt);
      api.move(dir.x, dir.z);
    } else {
      api.moveTo(en.x, en.z);
    }
    return;
  }

  // very close: hold contact, drift around them while smash recharges
  if (api.cooldown('smash') > 0.4) {
    const mv = V.norm({ x: toE.x * 0.6 + per.x * S.orbit * 0.85, z: toE.z * 0.6 + per.z * S.orbit * 0.85 });
    api.move(mv.x, mv.z);
  } else {
    api.move(toE.x, toE.z);
  }
}

function didSkillIsCharge(api) {
  return api.cooldown('charge') > 3.9;
}
