function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en.alive) return;

  // ---- event digest ----
  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      if (e.skill === 'charge') { lastChargeStart = p.t; enemyChargeWindup = true; }
      if (e.skill === 'smash') lastSmashStart = p.t;
      if (e.skill === 'jump') lastJumpStart = p.t;
    }
    if (e.type === 'enemyCommitted' && e.skill === 'charge') {
      enemyChargeWindup = false;
      chargeCommitTime = p.t;
      chargeDir = { x: Math.sin(en.heading), z: Math.cos(en.heading) };
      chargeOrigin = { x: en.x, z: en.z };
    }
    if (e.type === 'damaged') lastHurt = p.t;
  }
  if (en.casting && en.casting.skill === 'charge' && en.casting.phase === 'dash') {
    chargeActive = p.t;
  }

  const dist = en.dist;
  const toEn = V.toward(me, en);

  // ---- threat assessment ----
  const enemyCharging = en.casting && en.casting.skill === 'charge';
  const chargeWind = enemyCharging && en.casting.phase === 'windup';
  const chargeDash = enemyCharging && en.casting.phase === 'dash';
  const enemySmashWind = en.casting && en.casting.skill === 'smash' && en.casting.telegraph;

  // Am I in the path of a charge dash?
  let inChargeLine = false;
  if (chargeDash || chargeWind) {
    const h = en.heading;
    const d = { x: Math.sin(h), z: Math.cos(h) };
    const rel = { x: me.x - en.x, z: me.z - en.z };
    const along = V.dot(rel, d);
    const lat = Math.abs(rel.x * d.z - rel.z * d.x);
    if (along > -1 && along < 13.5 && lat < 2.6) inChargeLine = true;
  }

  // ---- laser tracking state ----
  const casting = me.casting && me.casting.skill === 'laser';

  // =============== EMERGENCY: dodge ===============
  // Charge dash incoming and it will hit: blink perpendicular.
  if (chargeDash && inChargeLine && !me.invulnerable) {
    const h = en.heading;
    const d = { x: Math.sin(h), z: Math.cos(h) };
    const side = (me.x - en.x) * d.z - (me.z - en.z) * d.x;
    const perp = side >= 0 ? { x: d.z, z: -d.x } : { x: -d.z, z: d.x };
    if (api.ready('blink')) {
      const t = safeBlink(p, api, perp, 6.5);
      api.use('blink', t.x, t.z);
      api.move(t.x, t.z);
      api.faceAt(en.x, en.z);
      return;
    }
    // no blink: strafe hard sideways
    api.move(perp.x, perp.z);
    api.faceAt(en.x, en.z);
    if (api.ready('jump') && !me.busy) api.use('jump');
    return;
  }

  // Smash windup close range: get out of the cone.
  if (enemySmashWind && dist < 4.6 && !me.invulnerable) {
    const away = V.away(me, en);
    const perp = V.perp(toEn);
    const esc = V.norm(V.add(V.scale(away, 1.0), V.scale(perp, sideSign(me, en) * 1.0)));
    if (en.casting.remaining < 0.22 && api.ready('blink') && !me.busy) {
      const t = safeBlink(p, api, esc, 7.0);
      api.use('blink', t.x, t.z);
      api.move(t.x, t.z);
      api.faceAt(en.x, en.z);
      return;
    }
    api.move(esc.x, esc.z);
    api.faceAt(en.x, en.z);
    return;
  }

  // Too close in general — gorilla wants to be here, we don't.
  const DANGER = 5.2;

  // =============== LASER LOGIC ===============
  // Fire when: visible, in range, and enemy unlikely to instantly punish.
  const canSee = en.visible;
  const inRange = dist < 22.5;

  if (casting) {
    // keep aiming at predicted position at fire time
    const rem = me.casting.remaining || 0;
    const aim = { x: en.x + en.vx * rem * 0.85, z: en.z + en.vz * rem * 0.85 };
    api.faceAt(aim.x, aim.z);
    // keep drifting away while casting (slowed but still moving)
    const kite = kiteDir(p, api, me, en, dist);
    api.move(kite.x, kite.z);
    return;
  }

  if (!me.busy && api.ready('laser') && canSee && inRange && dist > 3.0) {
    // Don't start a laser if a charge windup is live and we're in the line — it'd be cancelled.
    const risky = chargeWind && inChargeLine && dist < 13;
    if (!risky) {
      // Check facing error: cast is 0.65s, turn rate 6*0.35 = 2.1 rad/s -> 1.36 rad correctable
      const err = Math.abs(V.angleTo(me.heading, toEn));
      if (err < 1.2) {
        api.use('laser');
        api.faceAt(en.x, en.z);
        const kite = kiteDir(p, api, me, en, dist);
        api.move(kite.x, kite.z);
        return;
      }
    }
  }

  // =============== POSITIONING ===============
  api.faceAt(en.x, en.z);

  // Reposition to get LOS if blocked and laser near ready
  if (!canSee) {
    // move toward enemy via path until we can see
    const path = api.pathTo(en.x, en.z);
    if (path && path.points && path.points.length) {
      const wp = path.points[0];
      api.moveTo(wp.x, wp.z);
    } else {
      api.move(toEn.x, toEn.z);
    }
    return;
  }

  // Ideal ring: far enough that charge (12m) is dodgeable, close enough to hold LOS.
  const IDEAL = 11.5;
  const kite = kiteDir(p, api, me, en, dist);
  api.move(kite.x, kite.z);

  // Use blink offensively/defensively to maintain spacing when very close
  if (dist < DANGER && api.ready('blink') && !me.busy && !me.airborne) {
    const away = V.away(me, en);
    const perp = V.perp(toEn);
    const dir = V.norm(V.add(V.scale(away, 1.2), V.scale(perp, sideSign(me, en) * 0.8)));
    const t = safeBlink(p, api, dir, 7.2);
    api.use('blink', t.x, t.z);
  }

  if (p.tick % 90 === 0) api.say(taunt(api));
}

// ---- module state ----
let lastChargeStart = -99, lastSmashStart = -99, lastJumpStart = -99;
let enemyChargeWindup = false, chargeCommitTime = -99, chargeActive = -99;
let chargeDir = null, chargeOrigin = null;
let lastHurt = -99;
let orbitSign = 1, orbitFlip = -99;

function sideSign(me, en) {
  const d = { x: Math.sin(en.heading), z: Math.cos(en.heading) };
  const s = (me.x - en.x) * d.z - (me.z - en.z) * d.x;
  return s >= 0 ? 1 : -1;
}

function taunt(api) {
  const t = ['eight arms, one beam', 'stay out there, ape', 'ink and light',
             'you cannot reach me', 'range is a weapon'];
  return t[Math.floor(api.rand() * t.length)];
}

// Pick a blink target direction that lands somewhere sane (in arena)
function safeBlink(p, api, dir, dist) {
  const me = p.self;
  const n = V.norm(dir);
  const cands = [0, 0.5, -0.5, 1.0, -1.0, 1.6, -1.6, 2.4, -2.4, Math.PI];
  let best = n, bestScore = -1e9;
  for (const a of cands) {
    const d = V.rot(n, a);
    const px = me.x + d.x * dist, pz = me.z + d.z * dist;
    const cx = Math.max(-18.5, Math.min(18.5, px));
    const cz = Math.max(-18.5, Math.min(18.5, pz));
    const edgePen = (Math.abs(px - cx) + Math.abs(pz - cz)) * 3;
    const eD = Math.hypot(cx - p.enemy.x, cz - p.enemy.z);
    const wallPen = Math.max(0, 14 - Math.hypot(cx, cz)) * 0;
    let score = Math.min(eD, 14) - edgePen - wallPen - Math.abs(a) * 0.6;
    if (insideBlock(p, cx, cz)) score -= 6;
    if (score > bestScore) { bestScore = score; best = d; }
  }
  return best;
}

function insideBlock(p, x, z) {
  for (const o of p.arena.obstacles) {
    if (Math.abs(x - o.x) < o.hx + 1.1 && Math.abs(z - o.z) < o.hz + 1.1) return true;
  }
  return false;
}

// Orbit + range control, avoiding walls and blocks
function kiteDir(p, api, me, en, dist) {
  const IDEAL = 11.0;
  const toEn = V.toward(me, en);
  const away = { x: -toEn.x, z: -toEn.z };

  // radial component
  let radial;
  if (dist < IDEAL - 1.5) radial = 1.0;      // push away
  else if (dist > IDEAL + 4) radial = -0.8;  // close in
  else radial = 0.15;

  // orbit direction; flip occasionally or when blocked
  if (p.t - orbitFlip > 2.5 && api.rand() < 0.03) { orbitSign = -orbitSign; orbitFlip = p.t; }

  let dir = V.norm(V.add(V.scale(away, radial), V.scale(V.perp(toEn), orbitSign * 1.0)));

  // wall avoidance: steer back toward centre when near edge
  const half = p.arena.half - 2.5;
  let push = { x: 0, z: 0 };
  if (me.x > half) push.x -= (me.x - half);
  if (me.x < -half) push.x -= (me.x + half);
  if (me.z > half) push.z -= (me.z - half);
  if (me.z < -half) push.z -= (me.z + half);
  if (push.x || push.z) dir = V.norm(V.add(dir, V.scale(V.norm(push), 1.4)));

  // block avoidance: if the chosen ray hits something close, rotate away
  for (let k = 0; k < 6; k++) {
    const r = api.ray(dir.x, dir.z, 3.0);
    if (!r.hit || r.dist > 2.4) break;
    dir = V.rot(dir, orbitSign * 0.5);
    if (k === 3) orbitSign = -orbitSign;
  }
  return dir;
}
