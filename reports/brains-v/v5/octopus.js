const CAST = 0.667;
let sideSign = 1;
let lastCharge = -99;
let lastSmash = -99;
let lastDir = { x: 0, z: 1 };
let flipT = 0;
let said = false;

function perpOf(d, s) {
  return { x: d.z * s, z: -d.x * s };
}

function chargeReadyEst(t) {
  return (t - lastCharge) >= 3.95;
}

function pickDir(p, api, desired) {
  const me = p.self;
  const dn = V.norm(desired);
  if (dn.x === 0 && dn.z === 0) return lastDir;
  let best = dn, bs = -1e9;
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8;
    const d = { x: Math.sin(a), z: Math.cos(a) };
    let clear = 7;
    try { clear = api.ray(d.x, d.z, 7).dist; } catch (e) { clear = 7; }
    let s = (d.x * dn.x + d.z * dn.z) * 4.2;
    s += Math.min(clear, 5) * 0.6;
    if (clear < 1.9) s -= 12;
    const nx = me.x + d.x * 3.5, nz = me.z + d.z * 3.5;
    const edge = 20 - Math.max(Math.abs(nx), Math.abs(nz));
    if (edge < 2.5) s -= (2.5 - edge) * 3.5;
    s += (d.x * lastDir.x + d.z * lastDir.z) * 0.55;
    if (s > bs) { bs = s; best = d; }
  }
  lastDir = best;
  return best;
}

function bestBlink(p, api, line) {
  const me = p.self, en = p.enemy;
  let best = { x: -V.toward(me, en).x, z: -V.toward(me, en).z }, bs = -1e9;
  for (let i = 0; i < 12; i++) {
    const a = i * Math.PI / 6;
    const d = { x: Math.sin(a), z: Math.cos(a) };
    let lx = me.x + d.x * 7.5, lz = me.z + d.z * 7.5;
    let pen = 0;
    if (Math.abs(lx) > 19) { pen += (Math.abs(lx) - 19) * 2.5; lx = (lx > 0 ? 19 : -19); }
    if (Math.abs(lz) > 19) { pen += (Math.abs(lz) - 19) * 2.5; lz = (lz > 0 ? 19 : -19); }
    let s = Math.min(Math.hypot(lx - en.x, lz - en.z), 17) - pen;
    if (line) {
      const rx = lx - line.ox, rz = lz - line.oz;
      const along = rx * line.dx + rz * line.dz;
      const latx = rx - line.dx * along, latz = rz - line.dz * along;
      const lat = Math.hypot(latx, latz);
      s += Math.min(lat, 6) * 2.6;
      if (along < 0) s += 3;
    }
    const r = Math.hypot(lx, lz);
    if (r > 14) s -= (r - 14) * 1.2;
    if (s > bs) { bs = s; best = d; }
  }
  return best;
}

function aimLead(en, lead) {
  return { x: en.x + en.vx * lead * 0.85, z: en.z + en.vz * lead * 0.85 };
}

function think(p, api) {
  const me = p.self, en = p.enemy, t = p.t;
  if (!me || !en || !me.alive) return;

  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      if (e.skill === 'charge') lastCharge = t;
      else if (e.skill === 'smash') lastSmash = t;
    } else if (e.type === 'blocked') {
      sideSign = -sideSign;
      flipT = t;
    } else if (e.type === 'damaged' && e.skill === 'charge') {
      lastCharge = t - 0.35;
    }
  }

  if (!said) { said = true; api.say("eight arms, one beam"); }

  if (me.stunned) return;

  if (me.airborne) {
    api.faceAt(en.x, en.z);
    return;
  }

  const dist = en.dist;
  const toE = V.toward(me, en);
  const awayE = { x: -toE.x, z: -toE.z };

  if (t - flipT > 2.2) {
    if (api.rand() < 0.5) sideSign = -sideSign;
    flipT = t;
  }
  const strafe = perpOf(toE, sideSign);

  const enCast = en.casting;
  const chargeDash = !!(enCast && enCast.skill === 'charge' && (enCast.phase === 'dash' || (!enCast.telegraph && enCast.phase !== 'windup')));
  const chargeWind = !!(enCast && enCast.skill === 'charge' && enCast.phase === 'windup');
  const smashTel = !!(enCast && enCast.skill === 'smash' && enCast.telegraph);

  // --- dodge an incoming charge dash ---
  if (chargeDash) {
    let dx = en.vx, dz = en.vz;
    if (Math.hypot(dx, dz) < 3) { const h = V.fromHeading(en.heading); dx = h.x; dz = h.z; }
    const dl = Math.hypot(dx, dz) || 1;
    dx /= dl; dz /= dl;
    const rx = me.x - en.x, rz = me.z - en.z;
    const along = rx * dx + rz * dz;
    const latx = rx - dx * along, latz = rz - dz * along;
    const lat = Math.hypot(latx, latz);
    if (along > -2 && along < 15 && lat < 3.6) {
      if (api.ready('blink') && !me.busy) {
        const d = bestBlink(p, api, { ox: en.x, oz: en.z, dx: dx, dz: dz });
        api.use('blink', d.x, d.z);
        api.move(d.x, d.z);
        api.faceAt(en.x, en.z);
        return;
      }
      let px = latx, pz = latz;
      if (lat < 0.4) { px = -dz * sideSign; pz = dx * sideSign; }
      const pl = Math.hypot(px, pz) || 1;
      px /= pl; pz /= pl;
      const want = { x: px - dx * 0.3, z: pz - dz * 0.3 };
      const d = pickDir(p, api, want);
      api.move(d.x, d.z);
      api.faceAt(en.x, en.z);
      return;
    }
  }

  // --- dodge a smash ---
  if (smashTel && dist < 7.0) {
    const rem = (enCast && typeof enCast.remaining === 'number') ? enCast.remaining : 0.3;
    if (!me.busy && api.ready('jump') && rem >= 0.16) {
      const d = pickDir(p, api, { x: awayE.x + strafe.x * 0.4, z: awayE.z + strafe.z * 0.4 });
      api.move(d.x, d.z);
      api.use('jump');
      api.faceAt(en.x, en.z);
      return;
    }
    if (!me.busy && api.ready('blink') && dist < 6.0) {
      const d = bestBlink(p, api, null);
      api.use('blink', d.x, d.z);
      api.move(d.x, d.z);
      api.faceAt(en.x, en.z);
      return;
    }
    const d = pickDir(p, api, { x: awayE.x + strafe.x * 0.5, z: awayE.z + strafe.z * 0.5 });
    api.move(d.x, d.z);
    api.faceAt(en.x, en.z);
    return;
  }

  // --- keep aiming while the beam charges ---
  if (me.casting && me.casting.skill === 'laser') {
    const rem = typeof me.casting.remaining === 'number' ? me.casting.remaining : 0.3;
    const ap = aimLead(en, Math.min(Math.max(rem, 0), 0.7));
    api.faceAt(ap.x, ap.z);
    const want = dist < 9.5
      ? { x: awayE.x + strafe.x * 0.5, z: awayE.z + strafe.z * 0.5 }
      : { x: strafe.x * 0.7 + awayE.x * 0.2, z: strafe.z * 0.7 + awayE.z * 0.2 };
    const d = pickDir(p, api, want);
    api.move(d.x, d.z);
    return;
  }

  const myFrac = me.hp / me.maxHp;
  const enFrac = en.hp / en.maxHp;
  const turtling = (t > 30.5 && myFrac > enFrac + 0.015);

  // --- escape if pinned with no jump ---
  if (dist < 4.2 && !me.busy && api.ready('blink') && !api.ready('jump')) {
    const d = bestBlink(p, api, null);
    api.use('blink', d.x, d.z);
    api.move(d.x, d.z);
    api.faceAt(en.x, en.z);
    return;
  }

  // --- fire ---
  let minFire = chargeReadyEst(t) ? 9.5 : 7.0;
  if (en.busy || en.stunned || en.airborne) minFire = 5.6;
  if (chargeWind) minFire = 99;
  if (turtling) minFire = Math.max(minFire, 13.5);

  if (!me.busy && api.ready('laser') && en.visible && dist <= 22.5 && dist >= minFire) {
    const ap = aimLead(en, CAST);
    api.faceAt(ap.x, ap.z);
    api.use('laser');
    const want = dist < 11
      ? { x: awayE.x + strafe.x * 0.6, z: awayE.z + strafe.z * 0.6 }
      : { x: strafe.x, z: strafe.z };
    const d = pickDir(p, api, want);
    api.move(d.x, d.z);
    return;
  }

  // --- positioning ---
  let R = chargeReadyEst(t) ? 13.0 : 10.0;
  if (turtling) R = 17.0;
  if (!en.visible && !turtling) R = Math.min(R, 11.0);

  let want;
  if (dist < R - 1.5) {
    want = { x: awayE.x * 1.0 + strafe.x * 0.55, z: awayE.z * 1.0 + strafe.z * 0.55 };
  } else if (dist > R + 3) {
    if (!en.visible) {
      const path = api.pathTo(en.x, en.z);
      if (path && path.points && path.points.length && !path.direct) {
        const wp = path.points[0];
        want = V.norm({ x: wp.x - me.x, z: wp.z - me.z });
      } else {
        want = toE;
      }
    } else {
      want = { x: toE.x + strafe.x * 0.35, z: toE.z + strafe.z * 0.35 };
    }
  } else {
    want = { x: strafe.x + awayE.x * 0.25, z: strafe.z + awayE.z * 0.25 };
  }

  const d = pickDir(p, api, want);
  api.move(d.x, d.z);
  api.faceAt(en.x, en.z);
}
