function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en.alive) return;

  // ---- persistent state ----
  if (typeof state.lastT !== 'number') state.lastT = -1;
  const dt = p.dt || 1 / 15;

  // track enemy skill starts
  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      if (e.skill === 'charge') { state.chargeAt = p.t; state.chargeCd = p.t + 4; }
      if (e.skill === 'smash') { state.smashAt = p.t; }
      if (e.skill === 'jump') { state.jumpAt = p.t; }
    }
    if (e.type === 'enemyCommitted' && e.skill === 'charge') state.chargeCommit = p.t;
    if (e.type === 'damaged') { state.lastHurt = p.t; }
    if (e.type === 'blocked') state.blockedAt = p.t;
  }

  const dist = en.dist;
  const toEn = V.toward(me, en);
  const awayEn = { x: -toEn.x, z: -toEn.z };

  // ---------- threat assessment ----------
  const enCast = en.casting;
  const enCharging = enCast && enCast.skill === 'charge';
  const enSmashing = enCast && enCast.skill === 'smash' && enCast.telegraph;

  // predicted charge line
  let chargeDanger = false;
  if (enCharging) {
    const hdir = V.fromHeading(en.heading);
    // lateral distance from charge line
    const rel = V.sub(me, en);
    const along = V.dot(rel, hdir);
    const lat = Math.abs(rel.x * hdir.z - rel.z * hdir.x);
    if (along > -1 && along < 14 && lat < 3.2) chargeDanger = true;
  }

  // ---------- helper: dodge direction ----------
  const perp = V.perp(toEn);
  const openSide = (dir) => {
    const r = api.ray(dir.x, dir.z, 4.0);
    return r.dist;
  };

  // pick a strafe sign that stays in arena and clear
  const pickStrafe = () => {
    const a = { x: perp.x, z: perp.z };
    const b = { x: -perp.x, z: -perp.z };
    const da = openSide(a) + edgeScore(me, a);
    const db = openSide(b) + edgeScore(me, b);
    if (state.strafeSign === undefined) state.strafeSign = api.rand() < 0.5 ? 1 : -1;
    const cur = state.strafeSign > 0 ? da : db;
    const oth = state.strafeSign > 0 ? db : da;
    if (cur < 2.0 && oth > cur + 0.5) state.strafeSign *= -1;
    return state.strafeSign > 0 ? a : b;
  };

  function edgeScore(pos, dir) {
    const nx = pos.x + dir.x * 4, nz = pos.z + dir.z * 4;
    let s = 0;
    if (Math.abs(nx) > 17.5 || Math.abs(nz) > 17.5) s -= 4;
    return s;
  }

  // ---------- BLINK escapes ----------
  const canBlink = api.ready('blink');
  const canJump = api.ready('jump');
  const canLaser = api.ready('laser');

  // Emergency: charge committed at me -> blink sideways
  if (chargeDanger && !me.busy) {
    const side = pickStrafe();
    if (canBlink) {
      api.use('blink', side.x, side.z);
      api.move(side.x, side.z);
      api.faceAt(en.x, en.z);
      return;
    }
    // no blink: sprint perpendicular
    api.move(side.x, side.z);
    api.faceAt(en.x, en.z);
    return;
  }

  // Smash windup and I'm in range -> jump over it or back off
  const smashReach = 2.9 + me.radius + en.radius; // ~5.15
  if (enSmashing && dist < smashReach + 1.2 && !me.busy) {
    const rem = enCast.remaining !== undefined ? enCast.remaining : 0.2;
    if (canJump && rem > 0.05 && rem < 0.28) {
      api.move(awayEn.x, awayEn.z);
      api.use('jump');
      api.faceAt(en.x, en.z);
      return;
    }
    if (canBlink && dist < smashReach) {
      const d = V.norm({ x: awayEn.x * 1.0 + perp.x * 0.9, z: awayEn.z * 1.0 + perp.z * 0.9 });
      api.use('blink', d.x, d.z);
      api.move(d.x, d.z);
      api.faceAt(en.x, en.z);
      return;
    }
    const side = pickStrafe();
    const d = V.norm({ x: awayEn.x + side.x * 0.7, z: awayEn.z + side.z * 0.7 });
    api.move(d.x, d.z);
    api.faceAt(en.x, en.z);
    return;
  }

  // ---------- core strategy: kite at range, laser ----------
  // Ideal band: far enough that smash/charge is hard, close enough to hit with laser.
  const IDEAL = 13.0;
  const MIN_SAFE = 8.0;

  // If casting laser, keep facing target, drift away slowly
  if (me.casting && me.casting.skill === 'laser') {
    const aimP = predictAim(p, api, me, en);
    api.faceAt(aimP.x, aimP.z);
    // shuffle away/lateral while casting (slow anyway)
    const side = pickStrafe();
    let d = { x: side.x * 0.6 + (dist < IDEAL ? awayEn.x : 0), z: side.z * 0.6 + (dist < IDEAL ? awayEn.z : 0) };
    d = keepInside(me, d);
    api.move(d.x, d.z);
    return;
  }

  if (me.busy) {
    api.faceAt(en.x, en.z);
    return;
  }

  // Fire laser when: visible, in range, enemy not airborne/invulnerable, and roughly aimed
  const aimPoint = predictAim(p, api, me, en);
  const dirToAim = V.toward(me, aimPoint);
  const angErr = Math.abs(V.angleTo(me.heading, dirToAim));
  const inRange = dist < 24.5;
  const enemyDodgy = en.airborne || en.invulnerable;
  // don't fire if enemy will be airborne at fire time (jump lasts ~0.71s)
  let willBeAir = false;
  if (en.casting && en.casting.skill === 'jump') willBeAir = true;

  if (canLaser && en.visible && inRange && !enemyDodgy && !willBeAir && angErr < 0.9) {
    // If enemy is very close, prefer to disengage first unless they're stunned
    if (dist > 4.0 || en.stunned) {
      api.use('laser');
      api.faceAt(aimPoint.x, aimPoint.z);
      const side = pickStrafe();
      let d = { x: side.x * 0.7 + (dist < IDEAL ? awayEn.x * 1.0 : 0), z: side.z * 0.7 + (dist < IDEAL ? awayEn.z * 1.0 : 0) };
      d = keepInside(me, d);
      api.move(d.x, d.z);
      return;
    }
  }

  // ---------- positioning ----------
  api.faceAt(aimPoint.x, aimPoint.z);

  let dir;
  if (dist < MIN_SAFE) {
    // too close: retreat with lateral component
    const side = pickStrafe();
    dir = V.norm({ x: awayEn.x * 1.3 + side.x * 0.9, z: awayEn.z * 1.3 + side.z * 0.9 });
    // blink away if he's right on top and blink is up and laser nearly ready
    if (dist < 4.5 && canBlink) {
      api.use('blink', dir.x, dir.z);
    }
  } else if (dist > IDEAL + 4 || !en.visible) {
    // approach / regain sight
    if (!en.visible) {
      const path = api.pathTo(en.x, en.z);
      if (path && path.points && path.points.length) {
        const wp = path.points[0];
        api.moveTo(wp.x, wp.z);
        return;
      }
      dir = toEn;
    } else {
      const side = pickStrafe();
      dir = V.norm({ x: toEn.x * 1.0 + side.x * 0.5, z: toEn.z * 1.0 + side.z * 0.5 });
    }
  } else {
    // in band: circle strafe
    const side = pickStrafe();
    const radial = dist > IDEAL ? 0.35 : -0.35;
    dir = V.norm({ x: side.x + toEn.x * radial, z: side.z + toEn.z * radial });
  }

  dir = keepInside(me, dir);
  api.move(dir.x, dir.z);
}

const state = {};

function keepInside(me, d) {
  const H = 18.6;
  let x = d.x, z = d.z;
  if (me.x > H && x > 0) x -= (me.x - H) * 1.5;
  if (me.x < -H && x < 0) x += (-me.x - H) * 1.5;
  if (me.z > H && z > 0) z -= (me.z - H) * 1.5;
  if (me.z < -H && z < 0) z += (-me.z - H) * 1.5;
  const n = V.norm({ x, z });
  return n.x === 0 && n.z === 0 ? { x: -me.x, z: -me.z } : n;
}

function predictAim(p, api, me, en) {
  // laser fires after ~0.65s cast; predict enemy motion, damped
  const lead = 0.62;
  let px = en.x + en.vx * lead * 0.72;
  let pz = en.z + en.vz * lead * 0.72;
  if (Math.abs(px) > 19) px = Math.sign(px) * 19;
  if (Math.abs(pz) > 19) pz = Math.sign(pz) * 19;
  // if predicted point loses line of sight, aim at current position
  if (!api.los(px, pz)) return { x: en.x, z: en.z };
  return { x: px, z: pz };
}
