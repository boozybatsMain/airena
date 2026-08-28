function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en.alive) return;

  // ---- track enemy skill usage timings ----
  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      if (e.skill === 'charge') lastChargeStart = p.t;
      if (e.skill === 'smash') lastSmashStart = p.t;
      if (e.skill === 'jump') lastJumpStart = p.t;
    }
    if (e.type === 'enemyCommitted' && e.skill === 'charge') chargeLocked = p.t;
    if (e.type === 'damaged') lastHurt = p.t;
  }

  const d = en.dist;
  const toEn = V.toward(me, en);
  const awayEn = V.away(me, en);

  // ---------- THREAT ANALYSIS ----------
  const enCast = en.casting;
  const enCharging = enCast && enCast.skill === 'charge';
  const enSmashing = enCast && enCast.skill === 'smash';
  const chargeReady = (p.t - lastChargeStart) > 4.0;
  const smashReady = (p.t - lastSmashStart) > 1.1;

  // predicted charge line
  let chargeDanger = false;
  if (enCharging) {
    const dir = V.fromHeading(en.heading);
    const rel = V.sub(me, en);
    const along = V.dot(rel, dir);
    const lat = Math.abs(V.dot(rel, V.perp(dir)));
    if (along > -1 && along < 14 && lat < 2.6) chargeDanger = true;
  }

  const smashDanger = enSmashing && d < 4.6;

  // ---------- EMERGENCY: BLINK ----------
  const blinkOk = api.ready('blink');

  if (blinkOk && (chargeDanger || (smashDanger && enCast.remaining < 0.16))) {
    // blink perpendicular to their facing / away
    const dir = enCharging ? V.fromHeading(en.heading) : V.toward(en, me);
    let side = V.perp(dir);
    if (V.dot(side, V.sub(me, en)) < 0) side = V.scale(side, -1);
    // bias slightly backward from enemy
    let esc = V.norm(V.add(V.scale(side, 1.0), V.scale(awayEn, 0.45)));
    api.use('blink', esc.x, esc.z);
    api.faceAt(en.x, en.z);
    return;
  }

  // ---------- JUMP over smash ----------
  if (smashDanger && enCast.remaining < 0.2 && api.ready('jump') && !me.busy) {
    api.move(awayEn.x, awayEn.z);
    api.use('jump');
    api.faceAt(en.x, en.z);
    return;
  }

  // ---------- LASER LOGIC ----------
  const laserReady = api.ready('laser');
  const casting = me.casting && me.casting.skill === 'laser';

  // Ideal kiting band
  const IDEAL = 13.5;

  if (casting) {
    // keep aiming where they'll be when beam fires
    const rem = me.casting.remaining;
    const pred = { x: en.x + en.vx * rem * 0.85, z: en.z + en.vz * rem * 0.85 };
    api.faceAt(pred.x, pred.z);
    // strafe while casting (slow anyway), keep distance
    let mv = strafeVec(me, en, p, api, d, IDEAL);
    api.move(mv.x, mv.z);
    return;
  }

  if (laserReady && !me.busy && en.visible && d < 22 && d > 3.2 && !en.invulnerable) {
    // only start cast if reasonably safe: enemy far enough that charge can't
    // reach & land before beam, or enemy already busy
    const safeToCast = d > 8.5 || en.busy || !chargeReady;
    // Also require our facing roughly right so cast lands
    const ang = Math.abs(V.angleTo(me.heading, toEn));
    if (safeToCast && ang < 1.3) {
      api.use('laser');
      api.faceAt(en.x, en.z);
      let mv = strafeVec(me, en, p, api, d, IDEAL);
      api.move(mv.x, mv.z);
      return;
    }
  }

  // ---------- POSITIONING ----------
  api.faceAt(en.x, en.z);

  // If too close, get out
  if (d < 7.5) {
    let esc = V.norm(V.add(awayEn, V.scale(V.perp(toEn), (api.rand() < 0.5 ? 0.7 : -0.7))));
    let tgt = safeDir(me, esc, api);
    api.move(tgt.x, tgt.z);
    return;
  }

  // If no LOS, reposition to get LOS
  if (!en.visible) {
    const path = api.pathTo(en.x, en.z);
    if (path && path.points && path.points.length) {
      const wp = path.points[0];
      api.moveTo(wp.x, wp.z);
    } else {
      api.move(toEn.x, toEn.z);
    }
    return;
  }

  // In band: orbit / maintain
  let mv = strafeVec(me, en, p, api, d, IDEAL);
  api.move(mv.x, mv.z);

  if (p.t > 3 && !said) { said = true; api.say("eight arms, one beam"); }
}

let lastChargeStart = -99;
let lastSmashStart = -99;
let lastJumpStart = -99;
let chargeLocked = -99;
let lastHurt = -99;
let orbitSign = 1;
let orbitFlip = 0;
let said = false;

function strafeVec(me, en, p, api, d, ideal) {
  if (p.t - orbitFlip > 1.6) {
    orbitFlip = p.t;
    if (api.rand() < 0.35) orbitSign = -orbitSign;
  }
  const toEn = V.toward(me, en);
  let radial;
  if (d < ideal - 1.5) radial = V.scale(toEn, -1.0);
  else if (d > ideal + 2.5) radial = V.scale(toEn, 0.8);
  else radial = { x: 0, z: 0 };
  let tang = V.scale(V.perp(toEn), orbitSign * 1.0);
  let v = V.norm(V.add(radial, tang));
  return safeDir(me, v, api);
}

function safeDir(me, v, api) {
  // avoid walls and blocks: probe candidate directions
  const base = V.heading(v);
  const opts = [0, 0.4, -0.4, 0.85, -0.85, 1.3, -1.3, 1.9, -1.9, 2.6, -2.6, Math.PI];
  for (const o of opts) {
    const h = base + o;
    const dir = V.fromHeading(h);
    const r = api.ray(dir.x, dir.z, 3.2);
    const px = me.x + dir.x * 2.6, pz = me.z + dir.z * 2.6;
    if (r.dist > 2.8 && Math.abs(px) < 18.6 && Math.abs(pz) < 18.6) return dir;
  }
  return V.norm({ x: -me.x, z: -me.z });
}
