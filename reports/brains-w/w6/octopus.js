const ARENA = 20;
const CHARGE_CD = 4.033;
const SMASH_CD = 1.3;

let strafe = 1;
let lastFlip = 0;
let seenCharge = -99;
let seenSmash = -99;
let commitT = -99;
let hitTaken = 0;

function clampAbs(v, m) { return v > m ? m : (v < -m ? -m : v); }

function steer(p, api, want) {
  const me = p.self;
  if (!want || (want.x === 0 && want.z === 0)) return { x: 0, z: 0 };
  const base = V.heading(want);
  const offs = [0, 0.3, -0.3, 0.6, -0.6, 0.95, -0.95, 1.35, -1.35, 1.85, -1.85, 2.4, -2.4, 3.14159];
  let best = null;
  const probe = 3.2;
  for (const off of offs) {
    const h = base + off;
    const d = V.fromHeading(h);
    let s = -Math.abs(off) * 1.6;
    const r = api.ray(d.x, d.z, probe);
    if (r.dist < probe - 0.05) s -= (probe - r.dist) * 3.0;
    const px = me.x + d.x * probe, pz = me.z + d.z * probe;
    const m = Math.min(ARENA - Math.abs(px), ARENA - Math.abs(pz));
    if (m < 3.5) s -= (3.5 - m) * 2.2;
    if (best === null || s > best.s) best = { s, d };
  }
  return best.d;
}

function bestBlink(p, api, prefer) {
  const me = p.self, en = p.enemy;
  let best = null;
  for (let i = 0; i < 16; i++) {
    const h = i * Math.PI / 8;
    const d = V.fromHeading(h);
    const tx = me.x + d.x * 7.3, tz = me.z + d.z * 7.3;
    let s = 0;
    const ox = Math.abs(tx) - 18.2, oz = Math.abs(tz) - 18.2;
    if (ox > 0) s -= ox * 8;
    if (oz > 0) s -= oz * 8;
    const de = Math.hypot(tx - en.x, tz - en.z);
    s += Math.min(de, 15) * 1.2;
    if (prefer) s += (d.x * prefer.x + d.z * prefer.z) * 5;
    if (best === null || s > best.s) best = { s, d };
  }
  return best.d;
}

function lineThreat(me, en, dir) {
  const rx = me.x - en.x, rz = me.z - en.z;
  const along = rx * dir.x + rz * dir.z;
  const cross = rx * dir.z - rz * dir.x;
  return { along, cross, lat: Math.abs(cross) };
}

function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive) return;

  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      if (e.skill === 'charge') seenCharge = p.t;
      else if (e.skill === 'smash') seenSmash = p.t;
    } else if (e.type === 'enemyCommitted') {
      if (e.skill === 'charge') { commitT = p.t; seenCharge = p.t - 0.3; }
    } else if (e.type === 'blocked') {
      if (p.t - lastFlip > 0.4) { strafe = -strafe; lastFlip = p.t; }
    } else if (e.type === 'damaged') {
      hitTaken++;
      if (p.t - lastFlip > 0.3) { strafe = -strafe; lastFlip = p.t; }
    }
  }
  if (p.t - lastFlip > 2.6) { strafe = -strafe; lastFlip = p.t; }

  if (me.stunned) return;

  const dist = en.dist;
  const toEn = V.toward(me, en);
  const away = { x: -toEn.x, z: -toEn.z };
  const perpV = { x: toEn.z * strafe, z: -toEn.x * strafe };

  // aim point
  let lead = 0.12;
  if (me.casting && me.casting.skill === 'laser' && me.casting.telegraph) {
    lead = Math.max(0, me.casting.remaining);
  }
  const ax = en.x + en.vx * lead, az = en.z + en.vz * lead;

  if (me.airborne) { api.faceAt(ax, az); return; }

  const enCast = en.casting;
  const chargeWind = !!(enCast && enCast.skill === 'charge' && enCast.phase === 'windup');
  const dashing = !!(enCast && enCast.skill === 'charge' && (enCast.phase === 'dash' || (!enCast.telegraph && enCast.phase !== 'recover')));
  const smashWind = !!(enCast && enCast.skill === 'smash' && enCast.telegraph);
  const chargeReady = (p.t - seenCharge) >= CHARGE_CD - 0.2;
  const smashReady = (p.t - seenSmash) >= SMASH_CD - 0.15;

  const canAct = !me.busy;

  // ---------- emergency reactions ----------
  // committed charge inbound
  if (dashing && en.speed > 6) {
    const dir = V.norm({ x: en.vx, z: en.vz });
    const th = lineThreat(me, en, dir);
    const side = { x: dir.z, z: -dir.x };
    const sgn = th.cross >= 0 ? 1 : -1;
    const lateral = { x: side.x * sgn, z: side.z * sgn };
    if (th.along > -1.5 && th.along < 14 && th.lat < 3.4) {
      if (canAct && api.ready('blink') && th.along < 11) {
        const bd = bestBlink(p, api, lateral);
        api.use('blink', bd.x, bd.z);
        api.faceAt(en.x, en.z);
        return;
      }
      const esc = steer(p, api, { x: lateral.x * 0.85 + away.x * 0.5, z: lateral.z * 0.85 + away.z * 0.5 });
      api.move(esc.x, esc.z);
      api.faceAt(ax, az);
      return;
    }
    // charge will miss: sidestep gently and keep facing
    const mv = steer(p, api, { x: lateral.x * 0.5 + away.x * 0.6, z: lateral.z * 0.5 + away.z * 0.6 });
    api.move(mv.x, mv.z);
    api.faceAt(ax, az);
    return;
  }

  // charge winding up: get lateral and far
  if (chargeWind && dist < 16) {
    const dir = V.fromHeading(en.heading);
    const th = lineThreat(me, en, dir);
    const side = { x: dir.z, z: -dir.x };
    const sgn = th.cross >= 0 ? 1 : -1;
    const lateral = { x: side.x * sgn, z: side.z * sgn };
    const mv = steer(p, api, { x: lateral.x * 0.9 + away.x * 0.7, z: lateral.z * 0.9 + away.z * 0.7 });
    api.move(mv.x, mv.z);
    api.faceAt(ax, az);
    return;
  }

  // smash about to land
  if (smashWind && dist < 6.3 && canAct) {
    const rem = enCast.remaining;
    if (api.ready('jump') && rem > 0.1 && rem < 0.62) {
      const mv = steer(p, api, { x: away.x * 0.8 + perpV.x * 0.6, z: away.z * 0.8 + perpV.z * 0.6 });
      api.move(mv.x, mv.z);
      api.use('jump');
      api.faceAt(en.x, en.z);
      return;
    }
    if (api.ready('blink')) {
      const bd = bestBlink(p, api, away);
      api.use('blink', bd.x, bd.z);
      api.faceAt(en.x, en.z);
      return;
    }
  }

  // too close: break away
  if (dist < 4.6 && canAct && api.ready('blink') && !chargeWind) {
    const bd = bestBlink(p, api, { x: away.x * 0.7 + perpV.x * 0.5, z: away.z * 0.7 + perpV.z * 0.5 });
    api.use('blink', bd.x, bd.z);
    api.faceAt(en.x, en.z);
    return;
  }

  // ---------- ranged plan ----------
  let desired;
  if (chargeReady) desired = 15.0;
  else if (smashReady) desired = 10.0;
  else desired = 8.0;
  if (!en.visible) desired = Math.min(desired, 11.0);

  let want;
  if (!en.visible) {
    // regain sight
    const path = api.pathTo(en.x, en.z);
    if (path && path.points && path.points.length) {
      const wp = path.points[0];
      const d = V.toward(me, wp);
      if (dist > 7.5) want = { x: d.x * 1.0 + perpV.x * 0.35, z: d.z * 1.0 + perpV.z * 0.35 };
      else want = { x: perpV.x, z: perpV.z };
    } else {
      want = { x: toEn.x, z: toEn.z };
    }
  } else {
    let radial = 0;
    if (dist < desired - 0.8) radial = 1;      // back off
    else if (dist > desired + 1.8) radial = -1; // close in
    const rw = radial === 1 ? 1.0 : (radial === -1 ? 0.85 : 0);
    const tw = 0.75;
    if (radial === 1) {
      want = { x: away.x * rw + perpV.x * tw, z: away.z * rw + perpV.z * tw };
    } else if (radial === -1) {
      want = { x: toEn.x * rw + perpV.x * tw * 0.7, z: toEn.z * rw + perpV.z * tw * 0.7 };
    } else {
      want = { x: perpV.x, z: perpV.z };
    }
  }

  // stay off the walls
  const wm = 5.0;
  const cx = -me.x / ARENA, cz = -me.z / ARENA;
  const edge = Math.max(Math.abs(me.x), Math.abs(me.z));
  if (edge > ARENA - wm) {
    const w = (edge - (ARENA - wm)) / wm * 1.6;
    want = { x: want.x + cx * w * 2, z: want.z + cz * w * 2 };
  }

  const mv = steer(p, api, want);
  api.move(mv.x, mv.z);
  api.faceAt(ax, az);

  // ---------- fire ----------
  if (canAct && !me.airborne && api.ready('laser') && en.visible && dist > 2.5 && dist < 20.5) {
    let ok = true;
    if (smashWind && dist < 7.5) ok = false;
    if (enCast && enCast.skill === 'charge') ok = false;
    if (dist < 7.0 && !en.stunned) ok = false;
    if (ok && chargeReady && dist < 12.5 && !en.busy && !en.stunned) ok = false;
    // aim gate: only start when roughly pointed at them
    if (ok) {
      const ang = Math.abs(V.angleTo(me.heading, V.toward(me, { x: ax, z: az })));
      if (ang > 1.3) ok = false;
    }
    if (ok) api.use('laser');
  }
}
