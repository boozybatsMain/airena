function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive) return;

  // ---- track enemy skill usage ----
  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      if (e.skill === 'charge') { lastChargeStart = p.t; chargeActive = true; }
      if (e.skill === 'smash') lastSmashStart = p.t;
      if (e.skill === 'jump') lastJumpStart = p.t;
    }
    if (e.type === 'enemyCommitted' && e.skill === 'charge') chargeCommitted = p.t;
    if (e.type === 'damaged') { lastHurt = p.t; }
  }
  if (chargeActive && p.t - lastChargeStart > 1.5) chargeActive = false;

  const chargeReadyIn = Math.max(0, 4 - (p.t - lastChargeStart));

  const dist = en.dist;
  const toEn = V.toward(me, en);
  const away = V.away(me, en);

  // ---- emergency: enemy charge winding up or dashing ----
  const enCast = en.casting;
  const enCharging = enCast && enCast.skill === 'charge';
  const enSmashing = enCast && enCast.skill === 'smash' && enCast.telegraph;

  // ---- danger evaluation ----
  let danger = 0;
  if (enCharging) danger = 3;
  else if (enSmashing && dist < 5.5) danger = 2;
  else if (dist < 4.6) danger = 1;

  // ---------------- BLINK escape ----------------
  if (api.ready('blink') && !me.busy && !me.stunned && !me.airborne) {
    let doBlink = false, bdir = null;
    if (enCharging) {
      // dodge perpendicular to their facing
      const f = V.fromHeading(en.heading);
      const perp = V.perp(f);
      // pick side further from walls
      const a = { x: me.x + perp.x * 7, z: me.z + perp.z * 7 };
      const b = { x: me.x - perp.x * 7, z: me.z - perp.z * 7 };
      const sa = scoreSpot(a, p), sb = scoreSpot(b, p);
      bdir = sa >= sb ? perp : { x: -perp.x, z: -perp.z };
      doBlink = true;
    } else if (dist < 3.4 && enSmashing) {
      bdir = away; doBlink = true;
    } else if (dist < 3.0 && !en.stunned) {
      bdir = away; doBlink = true;
    }
    if (doBlink && bdir) {
      api.use('blink', bdir.x, bdir.z);
      api.face(en.x - me.x, en.z - me.z);
      return;
    }
  }

  // ---------------- JUMP over smash ----------------
  if (enSmashing && dist < 5.0 && api.ready('jump') && !me.busy && !me.airborne && !me.stunned) {
    const rem = enCast.remaining !== undefined ? enCast.remaining : 0.2;
    if (rem < 0.22 && rem > 0.0) {
      api.move(away.x, away.z);
      api.use('jump');
      api.face(en.x - me.x, en.z - me.z);
      return;
    }
  }

  // ---------------- kiting / positioning ----------------
  const IDEAL_MIN = 9.5, IDEAL_MAX = 15;

  let moveDir = null;
  let moveToPt = null;

  const casting = me.casting && me.casting.skill === 'laser';

  if (danger >= 2 || dist < 7.5) {
    // retreat, with tangential component to avoid getting cornered
    const perp = V.perp(toEn);
    const side = pickSide(me, en, p, api);
    let d = { x: away.x * 1.0 + perp.x * side * 0.85, z: away.z * 1.0 + perp.z * side * 0.85 };
    d = steerFromWalls(me, d);
    moveDir = d;
  } else if (dist > IDEAL_MAX || !en.visible) {
    if (!en.visible) {
      // find a spot with line of sight; approach around cover
      moveToPt = { x: en.x, z: en.z };
    } else {
      moveDir = { x: toEn.x, z: toEn.z };
      moveDir = steerFromWalls(me, moveDir);
    }
  } else {
    // strafe at ideal range
    const perp = V.perp(toEn);
    const side = pickSide(me, en, p, api);
    let radial = 0;
    if (dist < IDEAL_MIN) radial = -0.7;
    else if (dist > IDEAL_MAX - 2) radial = 0.4;
    let d = { x: perp.x * side + toEn.x * radial, z: perp.z * side + toEn.z * radial };
    d = steerFromWalls(me, d);
    moveDir = d;
  }

  if (moveToPt) api.moveTo(moveToPt.x, moveToPt.z);
  else if (moveDir) api.move(moveDir.x, moveDir.z);

  // ---------------- aim ----------------
  // Beam is instant; lead not required, but account for turning during cast.
  const aimPt = { x: en.x + en.vx * 0.10, z: en.z + en.vz * 0.10 };
  api.faceAt(aimPt.x, aimPt.z);

  // ---------------- laser ----------------
  if (!me.busy && !me.airborne && !me.stunned && api.ready('laser')) {
    if (en.visible && dist < 23 && !en.invulnerable) {
      // don't start a cast if a charge could smash into us mid-cast at close range
      const safeToCast = dist > 8.0 || chargeReadyIn > 0.9 || en.stunned;
      const facingErr = Math.abs(V.angleTo(me.heading, V.toward(me, en)));
      if (safeToCast && facingErr < 1.3) {
        api.use('laser');
      }
    }
  }

  if (p.t - lastSay > 6) {
    lastSay = p.t;
    api.say(dist < 6 ? "too close, ink and run" : "eight arms, one beam");
  }
}

let lastChargeStart = -99;
let chargeCommitted = -99;
let chargeActive = false;
let lastSmashStart = -99;
let lastJumpStart = -99;
let lastHurt = -99;
let lastSay = -99;
let sideFlip = 1;
let sideT = 0;

function scoreSpot(pt, p) {
  const h = p.arena.half - 1.5;
  let s = 0;
  s -= Math.max(0, Math.abs(pt.x) - h) * 5;
  s -= Math.max(0, Math.abs(pt.z) - h) * 5;
  for (const o of p.arena.obstacles) {
    const dx = Math.max(Math.abs(pt.x - o.x) - o.hx, 0);
    const dz = Math.max(Math.abs(pt.z - o.z) - o.hz, 0);
    const d = Math.hypot(dx, dz);
    if (d < 1.8) s -= (1.8 - d) * 3;
  }
  return s;
}

function pickSide(me, en, p, api) {
  if (p.t - sideT > 1.6) {
    sideT = p.t;
    const perp = V.perp(V.toward(me, en));
    const a = { x: me.x + perp.x * 5, z: me.z + perp.z * 5 };
    const b = { x: me.x - perp.x * 5, z: me.z - perp.z * 5 };
    const sa = scoreSpot(a, p) + (api.los(a.x, a.z) ? 1 : 0);
    const sb = scoreSpot(b, p) + (api.los(b.x, b.z) ? 1 : 0);
    if (sa > sb + 0.2) sideFlip = 1;
    else if (sb > sa + 0.2) sideFlip = -1;
    else sideFlip = api.rand() < 0.5 ? 1 : -1;
  }
  return sideFlip;
}

function steerFromWalls(me, d) {
  const h = 20;
  let out = { x: d.x, z: d.z };
  const margin = 4.5;
  if (me.x > h - margin) out.x -= (me.x - (h - margin)) * 0.8;
  if (me.x < -h + margin) out.x += ((-h + margin) - me.x) * 0.8;
  if (me.z > h - margin) out.z -= (me.z - (h - margin)) * 0.8;
  if (me.z < -h + margin) out.z += ((-h + margin) - me.z) * 0.8;
  const l = Math.hypot(out.x, out.z);
  if (l < 0.001) return d;
  return out;
}
