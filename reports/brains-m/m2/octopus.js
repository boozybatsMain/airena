const CHARGE_CD = 4.033, SMASH_CD = 1.3, JUMP_CD = 2.8;
const ecd = { charge: 0, smash: 0, jump: 0 };
let strafeSign = 1;
let nextFlip = 2.0;
let lastMoveDir = { x: 0, z: 1 };
let saidAt = -9;

function predictEnemy(p, lead) {
  const en = p.enemy;
  let f = 0.85;
  if (en.casting && en.casting.phase === 'windup') f = 0.3;
  if (en.stunned) f = 0.2;
  let ox = (en.vx || 0) * lead * f, oz = (en.vz || 0) * lead * f;
  const m = Math.hypot(ox, oz), cap = 4.0;
  if (m > cap) { ox *= cap / m; oz *= cap / m; }
  let x = en.x + ox, z = en.z + oz;
  if (x > 19.5) x = 19.5; if (x < -19.5) x = -19.5;
  if (z > 19.5) z = 19.5; if (z < -19.5) z = -19.5;
  return { x, z };
}

function chooseSide(me, axisDir) {
  const perp = V.perp(axisDir);
  let best = perp, bs = -1e9;
  for (const s of [1, -1]) {
    const d = V.scale(perp, s);
    const lx = me.x + d.x * 7.0, lz = me.z + d.z * 7.0;
    let sc = -Math.max(0, Math.abs(lx) - 16.5) * 10 - Math.max(0, Math.abs(lz) - 16.5) * 10;
    if (s === strafeSign) sc += 0.6;
    if (sc > bs) { bs = sc; best = d; }
  }
  return best;
}

function pickMove(p, api, D) {
  const me = p.self, en = p.enemy;
  const toEn = V.toward(me, en);
  const perp = V.perp(toEn);
  let best = null, bs = -1e9;
  for (let k = 0; k < 16; k++) {
    const h = k * Math.PI / 8;
    const dir = V.fromHeading(h);
    let sc = 0;
    const r = api.ray(dir.x, dir.z, 3.0);
    if (r && r.hit && r.dist < 2.4) sc -= (2.6 - r.dist) * 16;
    const nx = me.x + dir.x * 2.5, nz = me.z + dir.z * 2.5;
    const nd = Math.hypot(nx - en.x, nz - en.z);
    sc -= Math.abs(nd - D) * 2.6;
    sc -= Math.max(0, Math.abs(nx) - 15.5) * 8 + Math.max(0, Math.abs(nz) - 15.5) * 8;
    sc += V.dot(dir, V.scale(perp, strafeSign)) * 1.7;
    sc += V.dot(dir, lastMoveDir) * 0.9;
    if (sc > bs) { bs = sc; best = dir; }
  }
  return best || V.away(me, en);
}

function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me || !me.alive || !en) return;

  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      if (e.skill === 'charge') ecd.charge = p.t + CHARGE_CD;
      else if (e.skill === 'smash') ecd.smash = p.t + SMASH_CD;
      else if (e.skill === 'jump') ecd.jump = p.t + JUMP_CD;
    } else if (e.type === 'blocked') {
      strafeSign = -strafeSign;
      nextFlip = p.t + 1.6;
    }
  }

  const ec = en.casting;
  if (ec && ec.skill === 'charge' && ecd.charge < p.t) ecd.charge = p.t + CHARGE_CD;
  if (ec && ec.skill === 'smash' && ecd.smash < p.t) ecd.smash = p.t + SMASH_CD;

  if (me.stunned) return;

  if (p.t > nextFlip) { strafeSign = -strafeSign; nextFlip = p.t + 2.2 + api.rand() * 2.0; }

  const dist = en.dist;
  const chargeReady = p.t >= ecd.charge - 0.2;
  const chargeIncoming = !!(ec && ec.skill === 'charge' && (ec.phase === 'windup' || ec.phase === 'dash'));
  const smashIncoming = !!(ec && ec.skill === 'smash' && ec.phase === 'windup');
  const away = V.away(me, en);

  let action = null;
  let moveOverride = null;

  if (chargeIncoming) {
    let axis = V.fromHeading(en.heading);
    if (ec.phase === 'dash') {
      const v = { x: en.vx || 0, z: en.vz || 0 };
      if (V.len(v) > 1) axis = V.norm(v);
    }
    const aimed = ec.phase === 'dash' || V.dot(V.toward(en, me), axis) > 0.35;
    if (aimed) {
      if (dist < 11.0 && !me.busy && !me.airborne && api.ready('blink')) {
        const side = chooseSide(me, axis);
        const mix = V.norm(V.add(side, V.scale(away, 0.45)));
        action = { n: 'blink', a: mix.x, b: mix.z };
        moveOverride = mix;
      } else {
        moveOverride = V.norm(V.add(away, V.scale(V.perp(away), 0.35 * strafeSign)));
      }
    }
  } else if (smashIncoming && dist < 6.0 && !me.busy && !me.airborne) {
    moveOverride = V.norm(V.add(away, V.scale(V.perp(away), 0.4 * strafeSign)));
    if (ec.remaining > 0.12 && api.ready('jump')) {
      action = { n: 'jump' };
    } else if (dist < 4.3 && api.ready('blink')) {
      const d = V.norm(V.add(away, V.scale(V.perp(away), 0.6 * strafeSign)));
      action = { n: 'blink', a: d.x, b: d.z };
    }
  } else if (dist < 2.8 && !me.busy && !me.airborne && api.ready('blink') && !chargeReady) {
    const d = V.norm(V.add(away, V.scale(V.perp(away), 0.5 * strafeSign)));
    action = { n: 'blink', a: d.x, b: d.z };
    moveOverride = d;
  }

  const minLaser = chargeReady ? 12.2 : 7.0;
  let aimPt = predictEnemy(p, 0.667);

  if (!action && !me.busy && !me.airborne && !chargeIncoming && en.visible &&
      dist >= minLaser && dist <= 23 && api.ready('laser')) {
    if (api.los(aimPt.x, aimPt.z)) {
      const err = Math.abs(V.angleTo(me.heading, V.toward(me, aimPt)));
      if (err < 1.05) action = { n: 'laser' };
    }
  }

  // facing
  let lead = 0.667;
  if (me.casting && me.casting.skill === 'laser') lead = Math.max(0, (me.casting.remaining || 0) - 0.1);
  const face = en.visible ? predictEnemy(p, lead) : { x: en.x, z: en.z };
  api.faceAt(face.x, face.z);

  // distance policy
  let D = chargeReady ? 13.5 : 9.5;
  if (en.stunned) D = 9.0;
  if (!en.visible) D = Math.max(5.0, Math.min(D, dist - 4.0));
  if (me.casting && me.casting.skill === 'laser') D = Math.max(D, chargeReady ? 14.5 : 10.0);

  let dir = moveOverride;
  if (!dir) dir = pickMove(p, api, D);
  if (dir && (dir.x !== 0 || dir.z !== 0)) {
    api.move(dir.x, dir.z);
    lastMoveDir = { x: dir.x, z: dir.z };
  }

  if (action) api.use(action.n, action.a, action.b);

  if (p.t - saidAt > 7.5) {
    saidAt = p.t;
    api.say(chargeReady ? "eight arms, zero patience — stay back, ape" : "window open. burn.");
  }
}
