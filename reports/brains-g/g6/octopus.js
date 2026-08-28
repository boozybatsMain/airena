function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en.alive) return;

  // ---- persistent state ----
  if (lastT > p.t) reset();
  lastT = p.t;

  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      if (e.skill === 'charge') { chargeSeen = p.t; chargeCd = p.t + 4; }
      if (e.skill === 'smash') { smashSeen = p.t; }
      if (e.skill === 'jump') { jumpSeen = p.t; }
    }
    if (e.type === 'enemyCommitted' && e.skill === 'charge') chargeCommitted = p.t;
    if (e.type === 'damaged') lastHurt = p.t;
  }

  const dist = en.dist;
  const toEn = V.toward(me, en);
  const awayEn = V.scale(toEn, -1);

  // ---- danger evaluation ----
  const enCast = en.casting;
  const enCharging = enCast && enCast.skill === 'charge';
  const enSmashing = enCast && enCast.skill === 'smash' && enCast.telegraph;

  // predicted charge line
  let chargeDanger = false;
  if (enCharging) {
    const dir = V.fromHeading(en.heading);
    const rel = V.sub(me, en);
    const along = V.dot(rel, dir);
    const perp = Math.abs(rel.x * dir.z - rel.z * dir.x);
    if (along > -1 && along < 14 && perp < 3.0) chargeDanger = true;
  }

  const smashDanger = enSmashing && dist < 5.2;

  // ---- facing: always aim at enemy (lead not needed, beam instant) ----
  // Aim slightly ahead for their motion during our cast tail
  let aimPt = { x: en.x, z: en.z };
  if (me.casting && me.casting.skill === 'laser') {
    const lead = Math.min(me.casting.remaining, 0.7);
    aimPt = { x: en.x + en.vx * lead * 0.7, z: en.z + en.vz * lead * 0.7 };
  }
  api.faceAt(aimPt.x, aimPt.z);

  // ================= EMERGENCY REACTIONS =================
  // Blink away from a committed charge, or dodge sideways.
  if (chargeDanger) {
    const dir = V.fromHeading(en.heading);
    let side = V.perp(dir);
    // pick side away from... choose side that increases perpendicular offset
    const rel = V.sub(me, en);
    if (V.dot(rel, side) < 0) side = V.scale(side, -1);
    if (api.ready('blink') && !me.busy) {
      const cand = pickBlink(p, api, side, 7.0);
      api.use('blink', cand.x, cand.z);
      api.say("slip");
      return;
    }
    if (api.ready('jump') && !me.busy && dist < 9) {
      api.move(side.x, side.z);
      api.use('jump');
      return;
    }
    api.move(side.x, side.z);
    return;
  }

  if (smashDanger) {
    // jump over the ground sweep if timing works, else back off
    const rem = enCast.remaining;
    if (!me.busy && !me.airborne && api.ready('jump') && rem < 0.22 && rem > 0.0) {
      const esc = V.norm(V.add(awayEn, V.scale(V.perp(toEn), 0.6)));
      api.move(esc.x, esc.z);
      api.use('jump');
      return;
    }
    if (!me.busy && api.ready('blink')) {
      const back = V.norm(V.add(awayEn, V.scale(V.perp(toEn), 0.8)));
      const cand = pickBlink(p, api, back, 7.0);
      api.use('blink', cand.x, cand.z);
      return;
    }
    const esc = V.norm(V.add(awayEn, V.scale(V.perp(toEn), 0.7)));
    api.move(esc.x, esc.z);
    return;
  }

  // If it's too close and it can smash us, disengage aggressively
  const tooClose = dist < 5.0;

  // ================= LASER =================
  const canSee = en.visible;
  const inRange = dist <= 23.0;

  if (!me.busy && !me.airborne && api.ready('laser') && canSee && inRange) {
    // don't start a cast if enemy is about to be on top of us
    const closingSpeed = -((en.vx - me.vx) * toEn.x + (en.vz - me.vz) * toEn.z);
    const safeGap = dist > 7.0 || (dist > 4.5 && closingSpeed < 2.0);
    // avoid casting right when charge is off cooldown and they're close
    const chargeReady = p.t >= chargeCd;
    const risky = chargeReady && dist < 13.5;
    if (safeGap && !risky) {
      api.use('laser');
      api.remember('cast', p.t);
    } else if (safeGap && risky && dist > 9) {
      // still worth it at longer range; we can react to windup
      api.use('laser');
    }
  }

  // ================= MOVEMENT =================
  const idealMin = 9.0, idealMax = 15.0;

  let mv = { x: 0, z: 0 };

  if (!canSee) {
    // reposition for line of sight
    const path = api.pathTo(en.x, en.z);
    if (path && path.points && path.points.length) {
      const wp = path.points[0];
      mv = V.toward(me, wp);
    } else {
      mv = toEn;
    }
  } else if (dist < idealMin) {
    // retreat with strafe
    const strafe = strafeDir(p, api, toEn);
    mv = V.norm(V.add(V.scale(awayEn, 1.0), V.scale(strafe, 0.75)));
  } else if (dist > idealMax) {
    const strafe = strafeDir(p, api, toEn);
    mv = V.norm(V.add(V.scale(toEn, 1.0), V.scale(strafe, 0.45)));
  } else {
    const strafe = strafeDir(p, api, toEn);
    mv = V.norm(V.add(strafe, V.scale(awayEn, 0.25)));
  }

  // wall avoidance
  mv = avoidWalls(p, api, mv);

  api.move(mv.x, mv.z);

  // ================= OPPORTUNISTIC BLINK =================
  // Blink to break line-of-sight-less situations or escape corner
  if (!me.busy && api.ready('blink') && tooClose && !chargeDanger) {
    const back = V.norm(V.add(awayEn, V.scale(strafeDir(p, api, toEn), 0.5)));
    const cand = pickBlink(p, api, back, 7.2);
    api.use('blink', cand.x, cand.z);
  }

  if (p.t - lastSay > 6) {
    lastSay = p.t;
    api.say(dist > 12 ? "eight arms, one beam" : "too close, ape");
  }
}

let lastT = 0;
let chargeSeen = -99, chargeCd = 0, smashSeen = -99, jumpSeen = -99;
let chargeCommitted = -99, lastHurt = -99, lastSay = -99;
let strafeSign = 1, strafeFlip = 0;

function reset() {
  chargeSeen = -99; chargeCd = 0; smashSeen = -99; jumpSeen = -99;
  chargeCommitted = -99; lastHurt = -99; lastSay = -99;
  strafeSign = 1; strafeFlip = 0;
}

function strafeDir(p, api, toEn) {
  const me = p.self;
  if (p.t - strafeFlip > 1.4) {
    // flip toward more open space
    const perp = V.perp(toEn);
    const a = api.ray(perp.x, perp.z, 8);
    const b = api.ray(-perp.x, -perp.z, 8);
    strafeSign = (a.dist >= b.dist) ? 1 : -1;
    if (Math.min(a.dist, b.dist) > 7 && api.rand() < 0.4) strafeSign = -strafeSign;
    strafeFlip = p.t;
  }
  const perp = V.perp(toEn);
  return V.scale(perp, strafeSign);
}

function avoidWalls(p, api, mv) {
  const me = p.self, h = p.arena.half;
  let out = { x: mv.x, z: mv.z };
  const margin = 3.5;
  if (me.x > h - margin && out.x > 0) out.x -= (me.x - (h - margin)) * 0.9;
  if (me.x < -h + margin && out.x < 0) out.x += ((-h + margin) - me.x) * 0.9;
  if (me.z > h - margin && out.z > 0) out.z -= (me.z - (h - margin)) * 0.9;
  if (me.z < -h + margin && out.z < 0) out.z += ((-h + margin) - me.z) * 0.9;
  // obstacle repulsion
  for (const o of p.arena.obstacles) {
    const dx = me.x - o.x, dz = me.z - o.z;
    const ox = Math.max(Math.abs(dx) - o.hx, 0);
    const oz = Math.max(Math.abs(dz) - o.hz, 0);
    const d = Math.hypot(ox, oz);
    if (d < 2.2) {
      const push = V.norm({ x: dx, z: dz });
      const w = (2.2 - d) * 0.8;
      out = V.add(out, V.scale(push, w));
    }
  }
  const n = V.norm(out);
  return (n.x === 0 && n.z === 0) ? mv : n;
}

function pickBlink(p, api, dir, maxD) {
  const me = p.self;
  const base = V.norm(dir);
  const cands = [];
  for (let i = 0; i < 7; i++) {
    const ang = (i - 3) * 0.38;
    const d = V.rot(base, ang);
    const tx = me.x + d.x * maxD, tz = me.z + d.z * maxD;
    const cx = Math.max(-19, Math.min(19, tx));
    const cz = Math.max(-19, Math.min(19, tz));
    const score = -Math.hypot(cx - p.enemy.x, cz - p.enemy.z) * -1
      - (Math.abs(cx) > 17 || Math.abs(cz) > 17 ? 10 : 0);
    cands.push({ x: d.x, z: d.z, score });
  }
  cands.sort((a, b) => b.score - a.score);
  return cands[0];
}
