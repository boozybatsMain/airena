const OBST=[{x:-7,z:-3,hx:1.2,hz:3.5},{x:7,z:3,hx:1.2,hz:3.5},{x:0,z:-10,hx:3.6,hz:1.2},{x:0,z:10,hx:3.6,hz:1.2},{x:-12.5,z:11,hx:1.6,hz:1.6},{x:12.5,z:-11,hx:1.6,hz:1.6}];

let strafe = 1;
let chargeStart = -99;
let smashStart = -99;
let flipT = 0;
let saidT = -99;

function rectDist(px, pz, o) {
  const dx = Math.max(Math.abs(px - o.x) - o.hx, 0);
  const dz = Math.max(Math.abs(pz - o.z) - o.hz, 0);
  return Math.sqrt(dx * dx + dz * dz);
}

function openness(px, pz) {
  let m = 20 - Math.max(Math.abs(px), Math.abs(pz));
  for (const o of OBST) {
    const d = rectDist(px, pz, o);
    if (d < m) m = d;
  }
  return m;
}

function nrm(v) {
  const l = Math.sqrt(v.x * v.x + v.z * v.z);
  return l > 1e-6 ? { x: v.x / l, z: v.z / l } : { x: 0, z: 1 };
}

function leadPos(e, t) {
  let x = e.x + e.vx * t;
  let z = e.z + e.vz * t;
  x = Math.max(-19.6, Math.min(19.6, x));
  z = Math.max(-19.6, Math.min(19.6, z));
  return { x, z };
}

function pickMove(p, api, pref, w) {
  const me = p.self;
  let best = pref, bs = -1e9;
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8;
    const d = { x: Math.sin(a), z: Math.cos(a) };
    const r = api.ray(d.x, d.z, 4.5);
    const clear = r && typeof r.dist === 'number' ? r.dist : 4.5;
    let s = (d.x * pref.x + d.z * pref.z) * w;
    if (clear < 2.4) s -= (2.4 - clear) * 5;
    const nx = me.x + d.x * 3.2, nz = me.z + d.z * 3.2;
    const m = 20 - Math.max(Math.abs(nx), Math.abs(nz));
    if (m < 4) s -= (4 - m) * 1.4;
    s += api.rand() * 0.06;
    if (s > bs) { bs = s; best = d; }
  }
  return best;
}

function chooseBlink(me, e, api, base) {
  let best = { x: base.x, z: base.z }, bs = -1e9;
  for (let i = 0; i < 12; i++) {
    const a = i * Math.PI / 6;
    const d = { x: Math.sin(a), z: Math.cos(a) };
    const tx = me.x + d.x * 7.5, tz = me.z + d.z * 7.5;
    const cx = Math.max(-19.2, Math.min(19.2, tx));
    const cz = Math.max(-19.2, Math.min(19.2, tz));
    const de = Math.sqrt((cx - e.x) * (cx - e.x) + (cz - e.z) * (cz - e.z));
    const op = openness(cx, cz);
    let s = Math.min(de, 15) * 0.6 + (d.x * base.x + d.z * base.z) * 4 + Math.min(op, 3.5);
    if (Math.abs(tx) > 19.4 || Math.abs(tz) > 19.4) s -= 3;
    if (op < 1.1) s -= 9;
    if (s > bs) { bs = s; best = d; }
  }
  return best;
}

function think(p, api) {
  const me = p.self, e = p.enemy;
  if (!me || !me.alive || !e) return;

  for (const ev of p.events) {
    if (ev.type === 'enemyStarted') {
      if (ev.skill === 'charge') chargeStart = p.t;
      else if (ev.skill === 'smash') smashStart = p.t;
    } else if (ev.type === 'blocked') {
      if (p.t - flipT > 0.45) { strafe = -strafe; flipT = p.t; }
    } else if (ev.type === 'damaged') {
      if (ev.skill === 'charge') chargeStart = p.t;
      else if (ev.skill === 'smash') smashStart = p.t;
    }
  }

  if (me.stunned || me.airborne) return;

  const dist = e.dist;
  const chCd = Math.max(0, 4.5 - (p.t - chargeStart));
  const ec = e.casting;
  const ed = V.fromHeading(e.heading);
  const P = { x: ed.z, z: -ed.x };
  const rel = { x: me.x - e.x, z: me.z - e.z };
  const along = rel.x * ed.x + rel.z * ed.z;
  const lat = rel.x * P.x + rel.z * P.z;
  const sgn = lat >= 0 ? 1 : -1;
  const esc = { x: P.x * sgn, z: P.z * sgn };
  const away = nrm(rel);
  const blinkOk = api.ready('blink');

  if (p.t - saidT > 9) {
    saidT = p.t;
    api.say(dist > 12 ? "eight arms, one beam" : "too close, ape");
  }

  // --- charge evasion ---
  if (ec && ec.skill === 'charge' && ec.phase !== 'recover') {
    const wind = ec.phase === 'windup';
    const threat = along > -2.5 && along < 14.5 && Math.abs(lat) < (wind ? 5.0 : 3.8);
    if (threat) {
      const pref = nrm({ x: esc.x + away.x * 0.45, z: esc.z + away.z * 0.45 });
      if (blinkOk && (!wind || dist < 6)) {
        const bd = chooseBlink(me, e, api, pref);
        api.use('blink', bd.x, bd.z);
      }
      const mv = pickMove(p, api, pref, 3.2);
      api.move(mv.x, mv.z);
      api.faceAt(e.x, e.z);
      return;
    }
  }

  // --- smash evasion ---
  if (ec && ec.skill === 'smash' && ec.telegraph && dist < 5.4) {
    const pref = nrm({ x: away.x + esc.x * 0.7, z: away.z + esc.z * 0.7 });
    if (blinkOk && dist < 4.6 && (chCd > 1.0 || dist < 3.2)) {
      const bd = chooseBlink(me, e, api, pref);
      api.use('blink', bd.x, bd.z);
    } else if (!blinkOk && api.ready('jump') && dist < 4.2) {
      api.use('jump');
    }
    const mv = pickMove(p, api, pref, 3.2);
    api.move(mv.x, mv.z);
    api.faceAt(e.x, e.z);
    return;
  }

  // --- panic reset when he is on top of us ---
  if (blinkOk && !me.busy && dist < 5.2 && (chCd > 1.4 || dist < 3.2)) {
    const T0 = { x: -away.z * strafe, z: away.x * strafe };
    const pref = nrm({ x: away.x + T0.x * 0.6, z: away.z + T0.z * 0.6 });
    const bd = chooseBlink(me, e, api, pref);
    api.use('blink', bd.x, bd.z);
  }

  // --- aim and fire ---
  let castRem = 0.55;
  if (me.casting && me.casting.skill === 'laser' && me.casting.telegraph) {
    castRem = Math.max(0, (me.casting.remaining || 0.55) - 0.1);
  }
  const dashing = !!(ec && ec.skill === 'charge' && ec.phase === 'dash');
  const damp = dashing ? 1 : 0.9;
  const aim = leadPos({ x: e.x, z: e.z, vx: e.vx * damp, vz: e.vz * damp }, castRem);
  api.faceAt(aim.x, aim.z);

  if (api.ready('laser') && !me.busy && e.visible && dist < 21 && dist > 1.8) {
    const busyEnemy = !!(ec && (ec.phase === 'recover' || ec.skill === 'jump'));
    const safe = dist > 9 || chCd > 1.3 || busyEnemy;
    if (safe && (api.los(aim.x, aim.z) || dist < 12)) api.use('laser');
  }

  // --- kiting movement ---
  let pref;
  if (!e.visible) {
    const path = api.pathTo(e.x, e.z);
    if (path && path.points && path.points.length) {
      const wp = path.points[0];
      pref = nrm({ x: wp.x - me.x, z: wp.z - me.z });
    } else {
      pref = nrm({ x: -rel.x, z: -rel.z });
    }
  } else {
    let T = { x: -away.z * strafe, z: away.x * strafe };
    if (openness(me.x + T.x * 4.5, me.z + T.z * 4.5) < 2.0 && p.t - flipT > 0.4) {
      strafe = -strafe; flipT = p.t;
      T = { x: -away.z * strafe, z: away.x * strafe };
    }
    let rad;
    if (dist < 8) rad = 1.2;
    else if (dist < 13) rad = 0.6;
    else if (dist > 17.5) rad = -0.55;
    else rad = 0.05;
    pref = nrm({ x: away.x * rad + T.x * 0.9, z: away.z * rad + T.z * 0.9 });
  }

  const cen = Math.sqrt(me.x * me.x + me.z * me.z);
  if (cen > 14) {
    pref = nrm({ x: pref.x - (me.x / cen) * 0.8, z: pref.z - (me.z / cen) * 0.8 });
  }

  const mv = pickMove(p, api, pref, 3);
  api.move(mv.x, mv.z);
}
