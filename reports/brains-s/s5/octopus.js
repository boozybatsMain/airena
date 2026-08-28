const ENEMY_CD = { charge: 4.033, smash: 1.3, jump: 2.8 };
const CAST = 0.667;
let enemyLast = { charge: -99, smash: -99, jump: -99 };
let tangentSign = 1;
let lastFlip = -99;
let lastDir = null;
let saidAt = -99;

function clampPt(x, z) {
  return { x: Math.max(-19, Math.min(19, x)), z: Math.max(-19, Math.min(19, z)) };
}

function dirs(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push({ x: Math.sin(a), z: Math.cos(a) });
  }
  return out;
}

function aimPoint(p, lead) {
  const e = p.enemy;
  const f = e.stunned ? 0.4 : 0.8;
  return { x: e.x + e.vx * lead * f, z: e.z + e.vz * lead * f };
}

function pickMove(p, api, prefD, avoidLine) {
  const s = p.self, e = p.enemy;
  const toE = V.toward({ x: s.x, z: s.z }, { x: e.x, z: e.z });
  const tang = V.perp(toE);
  let best = null;
  for (const dir of dirs(20)) {
    const step = 3.2;
    const nx = s.x + dir.x * step, nz = s.z + dir.z * step;
    let sc = 0;
    const r = api.ray(dir.x, dir.z, 3.4);
    const clear = r && r.hit ? r.dist : 3.4;
    sc += Math.min(clear, 3.4) * 1.6;
    if (clear < 1.7) sc -= 22;
    const edge = Math.max(Math.abs(nx), Math.abs(nz));
    if (edge > 16.5) sc -= (edge - 16.5) * 9;
    const nd = Math.hypot(nx - e.x, nz - e.z);
    sc -= Math.abs(nd - prefD) * 1.5;
    if (nd < prefD) sc -= (prefD - nd) * 2.6;
    if (nd < 5.2) sc -= 25;
    sc += V.dot(dir, tang) * tangentSign * 2.2;
    if (lastDir) sc += V.dot(dir, lastDir) * 1.6;
    if (avoidLine) sc -= Math.abs(V.dot(dir, toE)) * 1.4;
    if (best === null || sc > best.sc) best = { sc, dir };
  }
  lastDir = best.dir;
  return best.dir;
}

function blinkAway(p, api) {
  const s = p.self, e = p.enemy;
  let best = null;
  for (const c of dirs(16)) {
    const pt = clampPt(s.x + c.x * 7.5, s.z + c.z * 7.5);
    const dd = Math.hypot(pt.x - e.x, pt.z - e.z);
    let sc = Math.min(dd, 16) * 1.0;
    const edge = Math.max(Math.abs(pt.x), Math.abs(pt.z));
    sc -= Math.max(0, edge - 16) * 2.5;
    const moved = Math.hypot(pt.x - s.x, pt.z - s.z);
    sc += moved * 0.5;
    if (!best || sc > best.sc) best = { sc, c };
  }
  api.use("blink", best.c.x, best.c.z);
}

function dodgeCharge(p, api, canBlink) {
  const s = p.self, e = p.enemy;
  let d;
  if (e.speed > 6) d = V.norm({ x: e.vx, z: e.vz });
  else d = V.fromHeading(e.heading);
  if (d.x === 0 && d.z === 0) return false;
  const rel = { x: s.x - e.x, z: s.z - e.z };
  const along = V.dot(rel, d);
  const cross = Math.abs(rel.x * d.z - rel.z * d.x);
  if (along < -2 || along > 16) return false;
  if (cross > 4.0) return false;
  if (canBlink) {
    let best = null;
    for (const c of dirs(16)) {
      const pt = clampPt(s.x + c.x * 7.5, s.z + c.z * 7.5);
      const rx = pt.x - e.x, rz = pt.z - e.z;
      const cr = Math.abs(rx * d.z - rz * d.x);
      const al = rx * d.x + rz * d.z;
      let sc = cr * 1.2;
      if (al < 0) sc += 3;
      const edge = Math.max(Math.abs(pt.x), Math.abs(pt.z));
      sc -= Math.max(0, edge - 16.5) * 3;
      sc += Math.min(Math.hypot(rx, rz), 14) * 0.35;
      if (!best || sc > best.sc) best = { sc, c };
    }
    api.use("blink", best.c.x, best.c.z);
    api.move(best.c.x, best.c.z);
    return true;
  }
  let perp = V.perp(d);
  const latv = { x: rel.x - d.x * along, z: rel.z - d.z * along };
  if (V.dot(perp, latv) < 0) perp = V.scale(perp, -1);
  const pt = clampPt(s.x + perp.x * 4, s.z + perp.z * 4);
  if (Math.max(Math.abs(pt.x), Math.abs(pt.z)) > 18.5) perp = V.scale(perp, -1);
  api.move(perp.x, perp.z);
  return true;
}

function think(p, api) {
  const s = p.self, e = p.enemy;
  for (const ev of p.events) {
    if (ev.type === "enemyStarted" && enemyLast[ev.skill] !== undefined) enemyLast[ev.skill] = p.t;
    if (ev.type === "blocked" && p.t - lastFlip > 0.6) { tangentSign = -tangentSign; lastFlip = p.t; }
  }
  if (!s.alive || !e.alive) return;

  const dist = e.dist;
  const smashIn = Math.max(0, ENEMY_CD.smash - (p.t - enemyLast.smash));
  const chargeIn = Math.max(0, ENEMY_CD.charge - (p.t - enemyLast.charge));
  const canAct = !s.busy && !s.stunned && !s.airborne;
  const blinkOK = canAct && api.ready("blink");
  const jumpOK = canAct && api.ready("jump");

  const ec = e.casting;
  const dashing = (ec && ec.skill === "charge" && ec.phase === "dash") || (e.speed > 8.5);

  // ---- charge dash: get out of the line ----
  if (dashing) {
    api.faceAt(e.x, e.z);
    if (dodgeCharge(p, api, blinkOK)) return;
  }

  // ---- charge wind-up: break the aim line ----
  if (ec && ec.skill === "charge" && ec.phase === "windup") {
    api.faceAt(e.x, e.z);
    const toE = V.toward({ x: s.x, z: s.z }, { x: e.x, z: e.z });
    let perp = V.perp(toE);
    if (V.dot(perp, { x: s.vx, z: s.vz }) < 0) perp = V.scale(perp, -1);
    let mv = V.norm({ x: perp.x * 1.6 - toE.x * 0.7, z: perp.z * 1.6 - toE.z * 0.7 });
    const pt = clampPt(s.x + mv.x * 4, s.z + mv.z * 4);
    if (Math.max(Math.abs(pt.x), Math.abs(pt.z)) > 18.4) {
      mv = V.norm({ x: -perp.x * 1.6 - toE.x * 0.7, z: -perp.z * 1.6 - toE.z * 0.7 });
    }
    api.move(mv.x, mv.z);
    return;
  }

  // ---- smash wind-up: hop over it ----
  if (ec && ec.skill === "smash" && ec.phase === "windup" && dist < 7.0) {
    api.faceAt(e.x, e.z);
    const aw = V.toward({ x: e.x, z: e.z }, { x: s.x, z: s.z });
    if (jumpOK) {
      api.move(aw.x, aw.z);
      api.use("jump");
      return;
    }
    if (blinkOK && dist < 6.0) {
      blinkAway(p, api);
      api.move(aw.x, aw.z);
      return;
    }
    api.move(pickMove(p, api, 12, false).x, pickMove(p, api, 12, false).z);
    return;
  }

  // ---- too close, melee is live: teleport out ----
  if (canAct && dist < 6.0 && smashIn < 0.35 && blinkOK && !e.stunned) {
    api.faceAt(e.x, e.z);
    blinkAway(p, api);
    const aw = V.toward({ x: e.x, z: e.z }, { x: s.x, z: s.z });
    api.move(aw.x, aw.z);
    return;
  }

  // ---- lost sight: reposition to see them ----
  if (!e.visible) {
    api.faceAt(e.x, e.z);
    if (dist > 8) {
      api.moveTo(e.x, e.z);
    } else {
      const d2 = pickMove(p, api, 11, false);
      api.move(d2.x, d2.z);
    }
    return;
  }

  // ---- aim / fire ----
  let lead = CAST;
  if (s.casting && s.casting.skill === "laser") lead = s.casting.remaining || 0.1;
  const ap = aimPoint(p, lead);
  api.faceAt(ap.x, ap.z);

  const prefD = chargeIn > 1.2 ? 8.5 : 14.5;

  if (canAct && api.ready("laser") && dist < 23 && dist > 2.0) {
    const dirA = V.toward({ x: s.x, z: s.z }, ap);
    const err = Math.abs(V.angleTo(s.heading, dirA));
    const rad = V.dot({ x: e.vx, z: e.vz }, V.toward({ x: e.x, z: e.z }, { x: s.x, z: s.z }));
    const closing = Math.max(0, rad);
    const safeMelee = dist - closing * 0.8 > 6.0 || smashIn > 0.65;
    const safeCharge = dist > 15 || chargeIn > 0.95;
    if (err < 0.85 && safeMelee && (safeCharge || dist > 9 || s.hp > 70)) {
      api.use("laser");
    }
  }

  const mv = pickMove(p, api, prefD, chargeIn < 0.6 && dist < 16);
  api.move(mv.x, mv.z);

  if (p.t - saidAt > 6) {
    saidAt = p.t;
    api.say(dist > 12 ? "eight arms, one beam" : "too close, ape");
  }
}
