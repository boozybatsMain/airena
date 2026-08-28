const LASER_RANGE = 22;
let lastCharge = -99;
let lastSmash = -99;
let strafe = 1;
let lastFlip = 0;

function pickDir(p, api, pref, weight) {
  const me = p.self;
  const pn = V.norm(pref);
  let best = { x: pn.x, z: pn.z }, bs = -1e9;
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8;
    const dx = Math.sin(a), dz = Math.cos(a);
    let s = 0;
    const r = api.ray(dx, dz, 6);
    s += Math.min(r.dist, 6) * 1.1;
    const nx = me.x + dx * 3.5, nz = me.z + dz * 3.5;
    const m = Math.min(20 - Math.abs(nx), 20 - Math.abs(nz));
    s += Math.min(Math.max(m, 0), 5) * 0.9;
    s += (dx * pn.x + dz * pn.z) * weight;
    if (s > bs) { bs = s; best = { x: dx, z: dz }; }
  }
  return best;
}

function blinkDir(p, api, pref) {
  const me = p.self, en = p.enemy;
  const pn = V.norm(pref);
  let best = { x: pn.x, z: pn.z }, bs = -1e9;
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8;
    const dx = Math.sin(a), dz = Math.cos(a);
    const nx = me.x + dx * 7.2, nz = me.z + dz * 7.2;
    const cx = Math.max(-18.5, Math.min(18.5, nx));
    const cz = Math.max(-18.5, Math.min(18.5, nz));
    let s = Math.hypot(cx - en.x, cz - en.z) * 1.0 + (dx * pn.x + dz * pn.z) * 3.5;
    if (Math.abs(nx) > 19 || Math.abs(nz) > 19) s -= 7;
    if (s > bs) { bs = s; best = { x: dx, z: dz }; }
  }
  return best;
}

function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me || !me.alive || !en) return;

  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      if (e.skill === 'charge') lastCharge = p.t;
      else if (e.skill === 'smash') lastSmash = p.t;
    } else if (e.type === 'blocked') {
      if (p.t - lastFlip > 0.4) { strafe = -strafe; lastFlip = p.t; }
    }
  }

  if (me.stunned || me.airborne) return;

  const d = en.dist;
  const mePos = { x: me.x, z: me.z }, enPos = { x: en.x, z: en.z };
  const away = V.away(mePos, enPos);
  const tow = V.toward(mePos, enPos);
  const chargeReady = (p.t - lastCharge) > 4.45;
  const blinkOk = api.ready('blink');
  const ec = en.casting;

  if (p.t - lastFlip > 2.2) { strafe = -strafe; lastFlip = p.t; }

  // ---- charge handling ----
  if (ec && ec.skill === 'charge' && d < 16) {
    const dir = V.fromHeading(en.heading);
    const rel = { x: me.x - en.x, z: me.z - en.z };
    const along = rel.x * dir.x + rel.z * dir.z;
    const cross = rel.x * dir.z - rel.z * dir.x;
    const lat = Math.abs(cross);
    const perp = cross >= 0 ? { x: dir.z, z: -dir.x } : { x: -dir.z, z: dir.x };
    if (ec.phase === 'dash') {
      if (along > -1.5 && along < 14 && lat < 3.2) {
        if (blinkOk && !me.busy) {
          const b = blinkDir(p, api, { x: perp.x * 1.0 + away.x * 0.4, z: perp.z * 1.0 + away.z * 0.4 });
          api.use('blink', b.x, b.z);
          api.faceAt(en.x, en.z);
          return;
        }
        const mv = pickDir(p, api, { x: perp.x + away.x * 0.3, z: perp.z + away.z * 0.3 }, 7);
        api.move(mv.x, mv.z);
        api.faceAt(en.x, en.z);
        return;
      }
    } else if (ec.phase === 'windup' && d < 14) {
      const mv = pickDir(p, api, { x: perp.x * 0.9 + away.x * 0.6, z: perp.z * 0.9 + away.z * 0.6 }, 6);
      api.move(mv.x, mv.z);
      api.faceAt(en.x, en.z);
      return;
    }
  }

  // ---- smash handling ----
  if (ec && ec.skill === 'smash' && ec.telegraph && d < 5.4) {
    if (blinkOk && !me.busy) {
      const b = blinkDir(p, api, away);
      api.use('blink', b.x, b.z);
      api.faceAt(en.x, en.z);
      return;
    }
    if (api.ready('jump') && !me.busy && ec.remaining >= 0.09 && ec.remaining <= 0.5) {
      api.use('jump');
      api.faceAt(en.x, en.z);
      return;
    }
    const mv = pickDir(p, api, away, 7);
    api.move(mv.x, mv.z);
    api.faceAt(en.x, en.z);
    return;
  }

  // ---- aiming an active laser cast ----
  if (me.casting && me.casting.skill === 'laser' && me.casting.telegraph) {
    const rem = Math.max(0, Math.min(0.6, me.casting.remaining || 0));
    const px = en.x + en.vx * rem * 0.95;
    const pz = en.z + en.vz * rem * 0.95;
    api.faceAt(px, pz);
    const mv = pickDir(p, api, { x: away.x * 0.8 + V.perp(tow).x * strafe * 0.5, z: away.z * 0.8 + V.perp(tow).z * strafe * 0.5 }, 4);
    api.move(mv.x, mv.z);
    return;
  }

  // ---- emergency disengage ----
  if (d < 4.3 && blinkOk && !me.busy) {
    const b = blinkDir(p, api, away);
    api.use('blink', b.x, b.z);
    api.faceAt(en.x, en.z);
    return;
  }

  // ---- fire ----
  if (!me.busy && api.ready('laser') && en.visible && d < LASER_RANGE && d > 4.6) {
    const px = en.x + en.vx * 0.5, pz = en.z + en.vz * 0.5;
    api.faceAt(px, pz);
    api.use('laser');
    const mv = pickDir(p, api, away, 4);
    api.move(mv.x, mv.z);
    return;
  }

  // ---- positioning ----
  api.faceAt(en.x, en.z);

  if (!en.visible) {
    const path = api.pathTo(en.x, en.z);
    if (path && path.points && path.points.length) {
      const wp = path.points[0];
      api.move(wp.x - me.x, wp.z - me.z);
    } else {
      api.move(tow.x, tow.z);
    }
    return;
  }

  const desired = chargeReady ? 14.5 : 8.5;
  const perpT = V.perp(tow);
  let pref;
  if (d < desired - 1.5) {
    pref = { x: away.x * 1.0 + perpT.x * strafe * 0.45, z: away.z * 1.0 + perpT.z * strafe * 0.45 };
  } else if (d > desired + 2.5) {
    pref = { x: tow.x * 1.0 + perpT.x * strafe * 0.35, z: tow.z * 1.0 + perpT.z * strafe * 0.35 };
  } else {
    pref = { x: perpT.x * strafe + away.x * 0.25, z: perpT.z * strafe + away.z * 0.25 };
  }
  const mv = pickDir(p, api, pref, 5.5);
  api.move(mv.x, mv.z);
}
