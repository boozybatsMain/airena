function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en.alive) return;

  // ---- event processing ----
  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      if (e.skill === 'charge') { lastChargeStart = p.t; chargeWindup = true; }
      if (e.skill === 'smash') lastSmashStart = p.t;
      if (e.skill === 'jump') lastJumpStart = p.t;
    }
    if (e.type === 'enemyCommitted' && e.skill === 'charge') { chargeCommitted = p.t; chargeDir = { x: Math.sin(en.heading), z: Math.cos(en.heading) }; }
    if (e.type === 'damaged') { lastHurt = p.t; }
    if (e.type === 'blocked') lastBlocked = p.t;
  }
  if (chargeWindup && p.t - lastChargeStart > 0.5) chargeWindup = false;

  const dist = en.dist;
  const toEn = V.toward(me, en);
  const awayEn = V.scale(toEn, -1);

  // ---- threat evaluation ----
  const chargeReady = (p.t - lastChargeStart) > 4.0 || lastChargeStart < 0;
  const smashReady = (p.t - lastSmashStart) > 1.3 || lastSmashStart < 0;

  const enCast = en.casting;
  const enCharging = enCast && enCast.skill === 'charge';
  const enSmashing = enCast && enCast.skill === 'smash' && enCast.telegraph;

  // ---- desired stance ----
  // Octopus: kite at long range, laser from distance, blink out of charges.
  const IDEAL = 13;

  let moveVec = null;
  let moveToPt = null;
  let faceVec = toEn;

  // --- emergency: enemy charging at us ---
  let dodging = false;
  if (enCharging) {
    // charge travels along their facing at commit; dodge perpendicular
    const dirH = { x: Math.sin(en.heading), z: Math.cos(en.heading) };
    // are we roughly in the path?
    const rel = V.sub(me, en);
    const along = V.dot(rel, dirH);
    const perpV = V.perp(dirH);
    const lateral = V.dot(rel, perpV);
    if (along > -1 && along < 14 && Math.abs(lateral) < 3.2) {
      dodging = true;
      // blink perpendicular if available and impact imminent
      const side = lateral >= 0 ? 1 : -1;
      const esc = V.scale(perpV, side);
      if (api.ready('blink') && (enCast.phase === 'dash' || (enCast.phase === 'windup' && enCast.remaining < 0.16))) {
        api.use('blink', esc.x, esc.z);
        api.face(toEn.x, toEn.z);
        return;
      }
      moveVec = V.norm(V.add(esc, V.scale(dirH, -0.25)));
    }
  }

  // --- emergency: enemy winding smash and we're in cone range ---
  if (!dodging && enSmashing && dist < 6.2) {
    if (api.ready('blink')) {
      let esc = pickBlink(p, api, me, en);
      api.use('blink', esc.x, esc.z);
      api.face(toEn.x, toEn.z);
      return;
    }
    if (api.ready('jump') && enCast.remaining < 0.2 && enCast.remaining > 0.02) {
      // hop over ground sweep
      api.move(awayEn.x, awayEn.z);
      api.use('jump');
      api.face(toEn.x, toEn.z);
      return;
    }
    moveVec = V.norm(V.add(awayEn, V.scale(V.perp(toEn), 0.6)));
    dodging = true;
  }

  // --- too close in general: back off hard ---
  if (!dodging && dist < 6.5 && !me.busy) {
    if (dist < 4.6 && api.ready('blink')) {
      const esc = pickBlink(p, api, me, en);
      api.use('blink', esc.x, esc.z);
      api.face(toEn.x, toEn.z);
      return;
    }
  }

  // ---- laser logic ----
  const casting = me.casting && me.casting.skill === 'laser';
  const canSee = en.visible;
  const inReach = dist < 25.0 && dist > 3.0;

  if (!me.busy && !dodging && api.ready('laser') && canSee && inReach && !en.airborne) {
    // don't cast when enemy could reach us mid-cast with a charge from close range
    const safeToCast = dist > 7.0 || !chargeReady;
    if (safeToCast) {
      api.use('laser');
      const aim = leadAim(me, en, dist);
      api.face(aim.x, aim.z);
      // keep strafing while casting
      const strafe = strafeDir(p, api, me, en, dist, IDEAL);
      api.move(strafe.x, strafe.z);
      return;
    }
  }

  if (casting) {
    const aim = leadAim(me, en, dist);
    api.face(aim.x, aim.z);
    const strafe = strafeDir(p, api, me, en, dist, IDEAL);
    api.move(strafe.x, strafe.z);
    return;
  }

  // ---- default movement ----
  if (!moveVec) {
    if (!canSee) {
      // reposition to get line of sight, keep distance
      const pt = seekLos(p, api, me, en, IDEAL);
      if (pt) { moveToPt = pt; }
      else moveVec = toEn;
    } else {
      moveVec = strafeDir(p, api, me, en, dist, IDEAL);
    }
  }

  faceVec = toEn;

  if (moveToPt) api.moveTo(moveToPt.x, moveToPt.z);
  else if (moveVec) api.move(moveVec.x, moveVec.z);
  api.face(faceVec.x, faceVec.z);

  if (p.t - lastSaid > 6) { lastSaid = p.t; api.say(SAYINGS[(sayIdx++) % SAYINGS.length]); }
}

let lastChargeStart = -99, lastSmashStart = -99, lastJumpStart = -99;
let chargeCommitted = -99, chargeWindup = false, chargeDir = null;
let lastHurt = -99, lastBlocked = -99, lastSaid = -99, sayIdx = 0;
let strafeSign = 1, lastFlip = 0;

const SAYINGS = [
  "eight arms, one beam",
  "come closer, ape",
  "you are slow and loud",
  "ink and light",
  "range is a weapon"
];

function leadAim(me, en, dist) {
  // beam is instant but fires after cast; predict ~0.65s of enemy motion
  const lead = 0.60;
  const px = en.x + en.vx * lead;
  const pz = en.z + en.vz * lead;
  return V.norm({ x: px - me.x, z: pz - me.z });
}

function clampPt(x, z) {
  const L = 18.2;
  return { x: Math.max(-L, Math.min(L, x)), z: Math.max(-L, Math.min(L, z)) };
}

function inBlock(x, z, obs, pad) {
  for (const o of obs) {
    if (Math.abs(x - o.x) < o.hx + pad && Math.abs(z - o.z) < o.hz + pad) return true;
  }
  return false;
}

function pickBlink(p, api, me, en) {
  const obs = p.arena.obstacles;
  const away = V.away(me, en);
  let best = away, bestScore = -1e9;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const d = { x: Math.sin(a), z: Math.cos(a) };
    const tx = me.x + d.x * 7.2, tz = me.z + d.z * 7.2;
    const c = clampPt(tx, tz);
    if (inBlock(c.x, c.z, obs, 1.2)) continue;
    const dEn = Math.hypot(c.x - en.x, c.z - en.z);
    const edge = Math.min(20 - Math.abs(c.x), 20 - Math.abs(c.z));
    let score = Math.min(dEn, 16) + edge * 0.4;
    if (score > bestScore) { bestScore = score; best = d; }
  }
  return best;
}

function strafeDir(p, api, me, en, dist, ideal) {
  const toEn = V.toward(me, en);
  const perpV = V.perp(toEn);
  // flip strafe direction occasionally or when blocked / near wall
  if (p.t - lastFlip > 2.2 || p.t - lastBlocked < 0.2) {
    if (p.t - lastBlocked < 0.2 || api.rand() < 0.4) strafeSign = -strafeSign;
    lastFlip = p.t;
  }
  let radial = 0;
  if (dist < ideal - 1.5) radial = -1.0;
  else if (dist > ideal + 2.5) radial = 0.8;
  else radial = -0.15;

  let v = V.add(V.scale(toEn, radial), V.scale(perpV, strafeSign * 1.0));

  // wall avoidance
  const L = 20;
  const margin = 4.0;
  let push = { x: 0, z: 0 };
  if (me.x > L - margin) push.x -= (me.x - (L - margin));
  if (me.x < -L + margin) push.x += ((-L + margin) - me.x);
  if (me.z > L - margin) push.z -= (me.z - (L - margin));
  if (me.z < -L + margin) push.z += ((-L + margin) - me.z);
  v = V.add(v, V.scale(push, 0.6));

  // obstacle avoidance (short probe)
  const n = V.norm(v);
  if (n.x !== 0 || n.z !== 0) {
    const r = api.ray(n.x, n.z, 3.0);
    if (r.hit && r.dist < 2.2) {
      const alt1 = V.rot(n, 1.1), alt2 = V.rot(n, -1.1);
      const r1 = api.ray(alt1.x, alt1.z, 3.0);
      const r2 = api.ray(alt2.x, alt2.z, 3.0);
      v = (r1.dist >= r2.dist) ? alt1 : alt2;
      strafeSign = -strafeSign;
      lastFlip = p.t;
    }
  }
  return V.norm(v);
}

function seekLos(p, api, me, en, ideal) {
  // find a point at ~ideal range from enemy with clear LOS
  let best = null, bestScore = -1e9;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const c = clampPt(en.x + Math.sin(a) * ideal, en.z + Math.cos(a) * ideal);
    if (inBlock(c.x, c.z, p.arena.obstacles, 1.3)) continue;
    const path = api.pathTo(c.x, c.z);
    if (!path) continue;
    const score = -path.dist;
    if (score > bestScore) { bestScore = score; best = c; }
  }
  return best;
}
