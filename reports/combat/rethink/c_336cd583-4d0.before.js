const OB_PAD = 0.9;

let sCharge = -99, sSmash = -99, sJump = -99;
let strafe = 1, lastFlip = -99;
let dashDir = null, dashT = -99;
let lastSay = -99;

function inObstacle(p, x, z, pad) {
  for (const o of p.arena.obstacles) {
    if (Math.abs(x - o.x) < o.hx + pad && Math.abs(z - o.z) < o.hz + pad) return true;
  }
  return false;
}

function predict(p, tAhead) {
  const en = p.enemy;
  const f = 0.85;
  let px = en.x + en.vx * tAhead * f;
  let pz = en.z + en.vz * tAhead * f;
  px = Math.max(-19.4, Math.min(19.4, px));
  pz = Math.max(-19.4, Math.min(19.4, pz));
  return { x: px, z: pz };
}

function pickMoveDir(p, api, base) {
  const me = p.self;
  const angs = [0, 0.35, -0.35, 0.7, -0.7, 1.05, -1.05, 1.4, -1.4, 1.9, -1.9, 2.4, -2.4, 3.0];
  let best = base, bestScore = -1e9;
  for (const a of angs) {
    const d = V.rot(base, a * strafe > 0 ? a : a);
    const r = api.ray(d.x, d.z, 4.5);
    const px = me.x + d.x * 3.0, pz = me.z + d.z * 3.0;
    let s = 0;
    s += Math.min(r.dist, 4.5) * 1.4;
    s -= Math.max(0, Math.abs(px) - 17.5) * 4;
    s -= Math.max(0, Math.abs(pz) - 17.5) * 4;
    s -= Math.abs(a) * 1.1;
    if (s > bestScore) { bestScore = s; best = d; }
  }
  return best;
}

function pickBlinkDir(p, base, maxA) {
  const me = p.self;
  const angs = maxA > 1 ? [0, 0.5, -0.5, 1.0, -1.0, 1.5, -1.5, 2.1, -2.1] : [0, 0.35, -0.35, 0.7, -0.7];
  let best = base, bestScore = -1e9;
  for (const a of angs) {
    const d = V.rot(base, a);
    const x = me.x + d.x * 7.4, z = me.z + d.z * 7.4;
    let s = 0;
    s -= Math.max(0, Math.abs(x) - 16.5) * 4;
    s -= Math.max(0, Math.abs(z) - 16.5) * 4;
    if (inObstacle(p, x, z, 1.1)) s -= 7;
    s -= Math.abs(a) * 1.0;
    s += Math.min(V.dist({ x, z }, p.enemy), 15) * 0.6;
    if (s > bestScore) { bestScore = s; best = d; }
  }
  return best;
}

function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive) return;
  const t = p.t;

  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      if (e.skill === 'charge') sCharge = t;
      else if (e.skill === 'smash') sSmash = t;
      else if (e.skill === 'jump') sJump = t;
    } else if (e.type === 'enemyCommitted') {
      if (e.skill === 'charge') { dashT = t; dashDir = V.fromHeading(en.heading); }
    } else if (e.type === 'blocked') {
      if (t - lastFlip > 0.5) { strafe = -strafe; lastFlip = t; }
    } else if (e.type === 'damaged' && e.skill === 'charge') {
      dashT = -99;
    }
  }

  const dist = en.dist;
  const chargeReady = (t - sCharge) > 3.95;
  const smashReady = (t - sSmash) > 1.25;
  const toE = dist > 0.001 ? V.toward(me, en) : { x: 0, z: 1 };
  const tang = V.perp(toE);

  const enCast = en.casting;
  const dashing = !!(enCast && enCast.skill === 'charge' && (enCast.phase === 'dash')) || (t - dashT < 0.85 && enCast && enCast.skill === 'charge');
  const chargeWindup = !!(enCast && enCast.skill === 'charge' && enCast.phase === 'windup');
  const smashTele = !!(enCast && enCast.skill === 'smash' && enCast.telegraph);

  // ---------- emergency: dodge an active charge ----------
  if (dashing) {
    const cd = dashDir && (t - dashT < 1.0) ? dashDir : V.fromHeading(en.heading);
    const rel = { x: me.x - en.x, z: me.z - en.z };
    const along = rel.x * cd.x + rel.z * cd.z;
    const cross = cd.x * rel.z - cd.z * rel.x;
    const lateral = Math.abs(cross);
    if (along > -1.5 && along < 15 && lateral < 3.6) {
      const side = cross >= 0 ? 1 : -1;
      // perpendicular escape, biased slightly backward along the charge line
      let esc = V.norm({ x: cd.z * side * 1.0 - cd.x * 0.25, z: -cd.x * side * 1.0 - cd.z * 0.25 });
      if (V.len(esc) < 0.01) esc = V.perp(cd);
      if (!me.busy && !me.airborne && !me.stunned && api.ready('blink')) {
        const bd = pickBlinkDir(p, esc, 0.7);
        api.use('blink', bd.x, bd.z);
        api.move(esc.x, esc.z);
        api.faceAt(en.x, en.z);
        return;
      }
      const md = pickMoveDir(p, api, esc);
      api.move(md.x, md.z);
      api.faceAt(en.x, en.z);
      return;
    }
  }

  // ---------- emergency: dodge an incoming smash ----------
  if (smashTele && dist < 6.6 && !me.airborne) {
    const rem = enCast ? enCast.remaining : 0.2;
    if (!me.busy && !me.stunned && api.ready('jump') && rem > 0.1 && rem < 0.45) {
      const away = V.away(me, en);
      const md = pickMoveDir(p, api, away);
      api.move(md.x, md.z);
      api.use('jump');
      api.faceAt(en.x, en.z);
      return;
    }
    if (!me.busy && !me.stunned && api.ready('blink') && dist < 5.6) {
      const away = V.away(me, en);
      const bd = pickBlinkDir(p, away, 2);
      api.use('blink', bd.x, bd.z);
      api.move(bd.x, bd.z);
      api.faceAt(en.x, en.z);
      return;
    }
    const away = V.away(me, en);
    const md = pickMoveDir(p, api, V.norm(V.add(away, V.scale(tang, strafe * 0.6))));
    api.move(md.x, md.z);
    api.faceAt(en.x, en.z);
    return;
  }

  // ---------- panic reset: too close ----------
  if (dist < 4.6 && !me.busy && !me.airborne && !me.stunned && !en.stunned) {
    const holdBlink = chargeReady && dist > 3.4;
    if (!holdBlink && api.ready('blink')) {
      const away = V.norm(V.add(V.away(me, en), V.scale(tang, strafe * 0.5)));
      const bd = pickBlinkDir(p, away, 2);
      api.use('blink', bd.x, bd.z);
      api.move(bd.x, bd.z);
      api.faceAt(en.x, en.z);
      return;
    }
  }

  // ---------- desired stand-off ----------
  let desired = chargeReady ? 15.5 : 10.5;
  if (chargeWindup) desired = 17.5;
  if (en.stunned) desired = 9.0;
  if (dist > 24) desired = 17;

  // ---------- laser ----------
  let fired = false;
  const casting = me.casting && me.casting.skill === 'laser';
  const leadT = casting ? Math.max(0, me.casting.remaining) : 0.62;
  const aimPt = predict(p, leadT);
  const aimDir = V.toward(me, aimPt);

  if (!casting && !me.busy && !me.airborne && !me.stunned && api.ready('laser')) {
    const err = Math.abs(V.angleTo(me.heading, aimDir));
    const losOk = en.visible && api.los(aimPt.x, aimPt.z);
    const safeCharge = (!chargeReady) || dist > 14.8 || en.stunned || dashing;
    const safeSmash = dist > 6.8 || en.stunned || !smashReady;
    if (losOk && dist > 3.0 && dist < 22 && err < 0.55 && safeCharge && safeSmash) {
      api.use('laser');
      fired = true;
    }
  }

  // ---------- facing ----------
  if (casting || fired) {
    api.faceAt(aimPt.x, aimPt.z);
  } else {
    const soonPt = predict(p, 0.3);
    api.faceAt(soonPt.x, soonPt.z);
  }

  // ---------- movement ----------
  let base;
  if (!en.visible && dist > 12) {
    const path = api.pathTo(en.x, en.z);
    if (path && path.points && path.points.length) {
      const wp = path.points[0];
      base = V.toward(me, wp);
    } else {
      base = toE;
    }
  } else {
    let radial = 0;
    if (dist > desired + 1.5) radial = 1;
    else if (dist < desired - 1.0) radial = -1;
    const rw = radial === 0 ? 0 : (radial > 0 ? 0.9 : 1.15);
    base = V.norm(V.add(V.scale(toE, radial * rw), V.scale(tang, strafe * (radial === 0 ? 1.0 : 0.7))));
    if (V.len(base) < 0.01) base = tang;
  }

  // keep off the walls: pull to centre when out near the rim
  const rimX = Math.abs(me.x) - 15.5, rimZ = Math.abs(me.z) - 15.5;
  if (rimX > 0 || rimZ > 0) {
    const toC = V.norm({ x: -me.x, z: -me.z });
    const w = Math.min(1, Math.max(rimX, rimZ) / 3.5);
    base = V.norm(V.add(V.scale(base, 1 - w * 0.7), V.scale(toC, w * 1.0)));
  }

  const md = pickMoveDir(p, api, base);
  if (Math.abs(V.angleTo(V.heading(base), md)) > 1.3 && t - lastFlip > 0.6) {
    strafe = -strafe; lastFlip = t;
  }
  api.move(md.x, md.z);

  if (t - lastSay > 6.5) {
    lastSay = t;
    api.say(dist > 13 ? 'eight arms, one beam' : 'too close, ape');
  }
}
