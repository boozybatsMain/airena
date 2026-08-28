const ARENA = 20;
const CLAMP = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

let circleDir = 1;
let lastFlip = -99;
let enemyReadyAt = { charge: 0, smash: 0, jump: 0 };
let lastVisibleT = 0;
let lastBlinkT = -99;
let lastSay = -99;
let coverMisses = 0;

function think(p, api) {
  try {
    brain(p, api);
  } catch (e) {
    /* a lost thought is cheaper than a lost match */
  }
}

function brain(p, api) {
  const me = p.self;
  const en = p.enemy;
  const t = p.t;
  if (!me || !me.alive || !en) return;

  // ---------- digest events ----------
  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      if (e.skill === 'charge') enemyReadyAt.charge = t + 4.033;
      else if (e.skill === 'smash') enemyReadyAt.smash = t + 1.3;
      else if (e.skill === 'jump') enemyReadyAt.jump = t + 2.8;
    } else if (e.type === 'blocked') {
      if (t - lastFlip > 0.45) { circleDir = -circleDir; lastFlip = t; }
    } else if (e.type === 'missed' && e.skill === 'laser') {
      if (e.reason === 'cover') coverMisses++;
    } else if (e.type === 'blinked') {
      lastBlinkT = t;
    }
  }
  const chargeReady = t >= enemyReadyAt.charge;
  const smashReady = t >= enemyReadyAt.smash;

  if (en.visible) lastVisibleT = t;

  const dist = en.dist !== undefined ? en.dist : V.dist(me, en);
  const toEnemy = V.norm({ x: en.x - me.x, z: en.z - me.z });
  const away = { x: -toEnemy.x, z: -toEnemy.z };
  let tangent = V.perp(toEnemy);
  tangent = V.scale(tangent, circleDir);
  if (V.len(tangent) < 0.01) tangent = { x: 1, z: 0 };

  // ---------- aim point (lead a little) ----------
  const casting = me.casting;
  const isCastingLaser = !!(casting && casting.skill === 'laser');
  let lead = isCastingLaser ? (casting.remaining || 0) : 0.667;
  if (en.stunned) lead = 0;
  let aim = {
    x: en.x + (en.vx || 0) * lead * 0.75,
    z: en.z + (en.vz || 0) * lead * 0.75
  };
  // never aim through nothing: if the lead point is blocked, aim at the body
  if (!api.los(aim.x, aim.z) && en.visible) aim = { x: en.x, z: en.z };
  api.faceAt(aim.x, aim.z);

  // ---------- airborne: nothing else can be ordered ----------
  if (me.airborne) return;

  // ---------- threat: charge ----------
  const enCast = en.casting;
  let chargeThreat = false;
  let dodgeDir = null;

  if (enCast && enCast.skill === 'charge') {
    const dashDir = (en.speed > 3)
      ? V.norm({ x: en.vx, z: en.vz })
      : V.fromHeading(en.heading);
    const rel = { x: me.x - en.x, z: me.z - en.z };
    const along = V.dot(rel, dashDir);
    const lat = { x: rel.x - dashDir.x * along, z: rel.z - dashDir.z * along };
    const latLen = V.len(lat);
    const committed = enCast.phase === 'dash' || enCast.telegraph === false ||
      (enCast.phase === 'windup' && enCast.remaining !== undefined && enCast.remaining < 0.09);
    if (along > -2 && along < 15 && latLen < 3.4) {
      chargeThreat = true;
      let side = latLen > 0.3 ? V.norm(lat) : V.perp(dashDir);
      // bias the escape slightly backwards along the dash line
      dodgeDir = V.norm({
        x: side.x * 1.0 - dashDir.x * 0.35,
        z: side.z * 1.0 - dashDir.z * 0.35
      });
      if (committed || enCast.phase === 'dash') {
        if (api.ready('blink') && (latLen < 2.9 || dist < 9)) {
          api.move(dodgeDir.x, dodgeDir.z);
          api.use('blink', dodgeDir.x, dodgeDir.z);
          return;
        }
      }
      api.move(dodgeDir.x, dodgeDir.z);
      if (!committed && dist < 5.5 && api.ready('blink')) {
        api.use('blink', dodgeDir.x, dodgeDir.z);
      }
      return;
    }
  }

  // ---------- threat: smash ----------
  if (enCast && enCast.skill === 'smash' && enCast.telegraph && dist < 7.0) {
    const esc = V.norm({ x: away.x * 1.0 + tangent.x * 0.9, z: away.z * 1.0 + tangent.z * 0.9 });
    api.move(esc.x, esc.z);
    if (api.ready('blink')) {
      api.use('blink', esc.x, esc.z);
    } else if (api.ready('jump') && dist < 5.9) {
      api.use('jump');
    }
    return;
  }

  // ---------- threat: simply too close ----------
  if (dist < 4.6 && !me.invulnerable && !me.busy) {
    const esc = V.norm({ x: away.x + tangent.x * 0.8, z: away.z + tangent.z * 0.8 });
    if (api.ready('blink')) {
      api.move(esc.x, esc.z);
      api.use('blink', esc.x, esc.z);
      return;
    }
  }

  // ---------- cornered: blink toward open floor ----------
  const nearWall = Math.abs(me.x) > 16.5 || Math.abs(me.z) > 16.5;
  if (nearWall && dist < 10 && api.ready('blink') && !me.busy) {
    const toCentre = V.norm({ x: -me.x, z: -me.z });
    const mix = V.norm({ x: toCentre.x + away.x * 0.7, z: toCentre.z + away.z * 0.7 });
    api.use('blink', mix.x, mix.z);
  }

  // ---------- laser ----------
  const enemyHelpless = en.stunned ||
    (enCast && (enCast.phase === 'recover' || (enCast.skill === 'smash' && !enCast.telegraph)));
  const closeSafe = enemyHelpless ? 3.0 : 6.6;
  let safeToCast = dist > closeSafe && (!chargeReady || dist > 14.6 || enemyHelpless);
  if (chargeThreat) safeToCast = false;
  if (smashReady && dist < 7.5 && !enemyHelpless) safeToCast = false;

  if (!me.busy && !me.stunned && api.ready('laser') && en.visible && dist < 23.5 && safeToCast) {
    const dirAim = V.norm({ x: aim.x - me.x, z: aim.z - me.z });
    const angErr = Math.abs(V.angleTo(me.heading, dirAim));
    if (angErr < 1.0) {
      api.use('laser');
    }
  }

  // ---------- kiting movement ----------
  let R;
  if (enemyHelpless) R = 9.0;
  else if (chargeReady) R = 14.5;
  else R = 10.5;

  if (!en.visible && t - lastVisibleT > 0.6) R = Math.min(R, 8.5);
  if (coverMisses > 3) { R = Math.min(R, 11); }

  // lost sight for a while and far: route around the block
  if (!en.visible && dist > 9 && t - lastVisibleT > 0.5) {
    const path = api.pathTo(en.x, en.z);
    if (path && path.points && path.points.length) {
      const wp = path.points[0];
      const d = V.norm({ x: wp.x - me.x, z: wp.z - me.z });
      if (V.len(d) > 0.01) {
        api.move(d.x, d.z);
        return;
      }
    }
  }

  const radialW = CLAMP((R - dist) / 4.0, -0.85, 1.6);
  let desired = V.norm({
    x: away.x * radialW + tangent.x,
    z: away.z * radialW + tangent.z
  });
  if (V.len(desired) < 0.01) desired = tangent;

  const chosen = pickDir(api, me, desired);

  // if the world keeps pushing us against the grain, swap orbit direction
  if (V.dot(chosen, desired) < 0.25 && t - lastFlip > 0.7) {
    circleDir = -circleDir;
    lastFlip = t;
  }
  // occasional unpredictability
  if (t - lastFlip > 3.2 && api.rand() < 0.05) {
    circleDir = -circleDir;
    lastFlip = t;
  }

  api.move(chosen.x, chosen.z);

  if (t - lastSay > 8) {
    lastSay = t;
    api.say(dist > 12 ? "eight arms, one beam" : "too close, ape");
  }
  api.remember('r', Math.round(dist * 10) / 10);
  api.remember('hpFrac', Math.round((me.hp / me.maxHp) * 100) / 100);
}

function pickDir(api, me, desired) {
  let best = desired;
  let bestScore = -1e9;
  const baseH = Math.atan2(desired.x, desired.z);
  const step = Math.PI / 8;
  for (let i = 0; i < 16; i++) {
    const h = baseH + (i - 8) * step;
    const d = { x: Math.sin(h), z: Math.cos(h) };
    let r;
    try { r = api.ray(d.x, d.z, 4); } catch (e) { r = { dist: 4 }; }
    const clear = r && typeof r.dist === 'number' ? r.dist : 4;
    let s = 3.2 * (d.x * desired.x + d.z * desired.z);
    s += Math.min(clear, 3) * 0.85;
    if (clear < 1.7) s -= 7;
    if (clear < 1.1) s -= 8;
    const px = me.x + d.x * 3.0;
    const pz = me.z + d.z * 3.0;
    const lim = 18.2;
    if (Math.abs(px) > lim) s -= (Math.abs(px) - lim) * 4;
    if (Math.abs(pz) > lim) s -= (Math.abs(pz) - lim) * 4;
    if (s > bestScore) { bestScore = s; best = d; }
  }
  return best;
}
