let side = 1;
let badDirCount = 0;
let lastChargeT = -99;
let lastSmashT = -99;
let lastFlipT = -99;
let noLosT = 0;

function unit(x, z) {
  const l = Math.hypot(x, z);
  if (l < 1e-6) return { x: 0, z: 0 };
  return { x: x / l, z: z / l };
}

function blinkLands(s, dir) {
  const x = s.x + dir.x * 7.5, z = s.z + dir.z * 7.5;
  return Math.abs(x) < 18.5 && Math.abs(z) < 18.5;
}

function pickMove(p, api, desired) {
  const s = p.self;
  let best = desired, bestScore = -1e9;
  for (let i = 0; i < 16; i++) {
    const h = i * Math.PI / 8;
    const d = { x: Math.sin(h), z: Math.cos(h) };
    let sc = 3.2 * (d.x * desired.x + d.z * desired.z);
    let clr = 5;
    try {
      const r = api.ray(d.x, d.z, 5);
      clr = r && typeof r.dist === 'number' ? r.dist : 5;
    } catch (err) { clr = 5; }
    sc += Math.min(clr, 4) * 0.55;
    if (clr < 1.7) sc -= 5;
    const px = s.x + d.x * 3.5, pz = s.z + d.z * 3.5;
    const w = Math.max(Math.abs(px), Math.abs(pz));
    if (w > 17) sc -= (w - 17) * 3.5;
    if (sc > bestScore) { bestScore = sc; best = d; }
  }
  if (best.x * desired.x + best.z * desired.z < 0.15) badDirCount++;
  else badDirCount = 0;
  return best;
}

function think(p, api) {
  const s = p.self, e = p.enemy;
  if (!s || !e || !s.alive) return;

  for (const ev of p.events) {
    if (ev.type === 'enemyStarted') {
      if (ev.skill === 'charge') lastChargeT = p.t;
      else if (ev.skill === 'smash') lastSmashT = p.t;
    } else if (ev.type === 'blocked') {
      if (p.t - lastFlipT > 0.5) { side = -side; lastFlipT = p.t; }
    } else if (ev.type === 'damaged' && ev.skill === 'smash') {
      if (p.t - lastFlipT > 0.6) { side = -side; lastFlipT = p.t; }
    }
  }
  if (badDirCount > 4 && p.t - lastFlipT > 0.7) { side = -side; lastFlipT = p.t; badDirCount = 0; }

  const dist = e.dist;
  const away = unit(s.x - e.x, s.z - e.z);
  const towardE = { x: -away.x, z: -away.z };
  const tan = { x: -away.z * side, z: away.x * side };

  const eCast = e.casting;
  const charging = !!(eCast && eCast.skill === 'charge');
  const dashing = charging && eCast.phase === 'dash';
  const chargeLocked = dashing || (charging && eCast.phase === 'windup' && eCast.remaining <= 0.12);
  const smashing = !!(eCast && eCast.skill === 'smash' && eCast.telegraph);
  const enemyHelpless = e.stunned || (eCast && eCast.phase === 'recover') || e.airborne;
  const chargeReadyEst = (p.t - lastChargeT) >= 3.95;

  // charge geometry
  const edir = { x: Math.sin(e.heading), z: Math.cos(e.heading) };
  const rel = { x: s.x - e.x, z: s.z - e.z };
  const fwd = rel.x * edir.x + rel.z * edir.z;
  const pdir = { x: -edir.z, z: edir.x };
  const lat = rel.x * pdir.x + rel.z * pdir.z;
  const inChargeLane = fwd > -1.5 && fwd < 14 && Math.abs(lat) < 3.3;

  let moveDir = null;
  let facePt = null;
  let skill = null, sa = 0, sb = 0;

  const canAct = !s.busy && !s.stunned && !s.airborne;

  // ---------- threat responses ----------
  let handled = false;

  if (chargeLocked && inChargeLane) {
    let esc = { x: pdir.x * (lat >= 0 ? 1 : -1), z: pdir.z * (lat >= 0 ? 1 : -1) };
    if (!blinkLands(s, esc)) esc = { x: -esc.x, z: -esc.z };
    const back = unit(esc.x * 1.0 + away.x * 0.45, esc.z * 1.0 + away.z * 0.45);
    if (canAct && api.ready('blink') && (dashing || eCast.remaining <= 0.08)) {
      let bd = back;
      if (!blinkLands(s, bd)) bd = esc;
      if (!blinkLands(s, bd)) bd = { x: -bd.x, z: -bd.z };
      skill = 'blink'; sa = bd.x; sb = bd.z;
      handled = true;
    }
    moveDir = pickMove(p, api, back);
    facePt = { x: e.x, z: e.z };
    handled = true;
  } else if (smashing && dist < 6.4) {
    const back = unit(away.x + tan.x * 0.5, away.z + tan.z * 0.5);
    moveDir = pickMove(p, api, back);
    facePt = { x: e.x, z: e.z };
    if (canAct) {
      if (api.ready('blink')) {
        let bd = back;
        if (!blinkLands(s, bd)) bd = tan;
        if (!blinkLands(s, bd)) bd = { x: -tan.x, z: -tan.z };
        skill = 'blink'; sa = bd.x; sb = bd.z;
      } else if (api.ready('jump') && eCast.remaining <= 0.24) {
        skill = 'jump';
      }
    }
    handled = true;
  } else if (dist < 4.0 && canAct && api.ready('blink') && !enemyHelpless) {
    let bd = unit(away.x + tan.x * 0.6, away.z + tan.z * 0.6);
    if (!blinkLands(s, bd)) bd = tan;
    if (!blinkLands(s, bd)) bd = { x: -tan.x, z: -tan.z };
    if (!blinkLands(s, bd)) bd = unit(-s.x, -s.z);
    skill = 'blink'; sa = bd.x; sb = bd.z;
    moveDir = pickMove(p, api, unit(away.x + tan.x * 0.6, away.z + tan.z * 0.6));
    facePt = { x: e.x, z: e.z };
    handled = true;
  }

  // ---------- movement (kiting) ----------
  if (!moveDir) {
    let wAway, wTan = 1.0;
    if (dist < 9) { wAway = 1.25; wTan = 0.65; }
    else if (dist < 13) { wAway = 0.6; wTan = 1.0; }
    else if (dist < 17) { wAway = 0.15; wTan = 1.0; }
    else if (dist < 21) { wAway = -0.15; wTan = 1.0; }
    else { wAway = -0.7; wTan = 0.8; }

    if (charging && !chargeLocked) { wTan = 1.3; wAway = Math.max(wAway, 0.4); }

    let tx = 0, tz = 0;
    if (!e.visible) {
      noLosT += p.dt;
      if (noLosT > 0.5) { tx += towardE.x * 0.55; tz += towardE.z * 0.55; wAway *= 0.3; }
    } else noLosT = 0;

    const radial = Math.hypot(s.x, s.z);
    let wc = 0;
    if (radial > 13.5) wc = Math.min(1.4, (radial - 13.5) / 4.5);
    const cen = unit(-s.x, -s.z);

    const desired = unit(
      away.x * wAway + tan.x * wTan + cen.x * wc + tx,
      away.z * wAway + tan.z * wTan + cen.z * wc + tz
    );
    moveDir = pickMove(p, api, desired);
  }

  // ---------- aiming ----------
  const casting = s.casting && s.casting.skill === 'laser';
  const lead = casting ? Math.max(0, s.casting.remaining) : 0.667;
  let aimX = e.x + e.vx * lead * 0.85;
  let aimZ = e.z + e.vz * lead * 0.85;
  if (dashing) { aimX = e.x + e.vx * 0.12; aimZ = e.z + e.vz * 0.12; }
  aimX = Math.max(-19.6, Math.min(19.6, aimX));
  aimZ = Math.max(-19.6, Math.min(19.6, aimZ));
  if (!facePt) facePt = { x: aimX, z: aimZ };
  if (casting) facePt = { x: aimX, z: aimZ };

  // ---------- laser ----------
  if (!skill && canAct && api.ready('laser') && e.visible && dist < 23 && dist > 2.5) {
    const toAim = unit(aimX - s.x, aimZ - s.z);
    const hdg = s.heading;
    let ang = Math.atan2(toAim.x, toAim.z) - hdg;
    while (ang > Math.PI) ang -= 2 * Math.PI;
    while (ang < -Math.PI) ang += 2 * Math.PI;
    const aimOk = Math.abs(ang) < 1.15;

    const laneMiss = dashing && Math.abs(lat) > 3.3;
    let safe = false;
    if (enemyHelpless || laneMiss) safe = dist > 2.5;
    else if (dist > 14) safe = true;
    else if (dist > 7.6 && !chargeReadyEst && !charging) safe = true;

    if (aimOk && safe) { skill = 'laser'; }
  }

  if (moveDir) api.move(moveDir.x, moveDir.z);
  if (facePt) api.faceAt(facePt.x, facePt.z);
  if (skill) {
    if (skill === 'blink') api.use('blink', sa, sb);
    else api.use(skill);
  }
}
