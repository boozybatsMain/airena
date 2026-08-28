function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me || !en) return;
  if (p.t < lastT - 0.001) resetBrain();
  lastT = p.t;
  const t = p.t;

  // ---- events -------------------------------------------------------
  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      if (e.skill === 'charge') enemyCd.charge = t + 4.033;
      else if (e.skill === 'smash') enemyCd.smash = t + 1.3;
      else if (e.skill === 'jump') enemyCd.jump = t + 2.8;
    } else if (e.type === 'blocked') {
      if (t - lastFlip > 0.4) { circleSign = -circleSign; lastFlip = t; }
    } else if (e.type === 'damaged') {
      lastHurt = t;
    }
  }
  if (t - lastFlip > 3.0) { circleSign = -circleSign; lastFlip = t; }

  if (!me.alive) return;

  const dist = en.dist;
  const toEn = V.toward(me, en);
  const ec = en.casting;

  // ---- keep facing the enemy (lead for the beam) ----------------------
  let leadT = 0.72;
  if (me.casting && me.casting.skill === 'laser' && me.casting.phase === 'windup') {
    leadT = Math.max(0.05, me.casting.remaining + 0.03);
  }
  const pred = { x: en.x + en.vx * leadT, z: en.z + en.vz * leadT };
  api.faceAt(pred.x, pred.z);

  const locked = me.stunned || me.airborne ||
    (me.casting && (me.casting.skill === 'jump' || me.casting.skill === 'blink'));

  // ---- threat reading -------------------------------------------------
  let threat = 'none';
  if (ec && ec.skill === 'charge') threat = (ec.phase === 'dash') ? 'dash' : 'chargeWind';
  else if (ec && ec.skill === 'smash' && dist < 7.5) threat = 'smash';

  const eDir = V.fromHeading(en.heading);
  const toUs = { x: me.x - en.x, z: me.z - en.z };
  const along = toUs.x * eDir.x + toUs.z * eDir.z;
  const lat = { x: eDir.z, z: -eDir.x };
  let side = toUs.x * lat.x + toUs.z * lat.z;
  const offLine = Math.abs(side);
  if (Math.abs(side) < 0.01) side = (api.rand() < 0.5 ? -1 : 1);
  const sgn = side >= 0 ? 1 : -1;
  let escape = V.norm({
    x: lat.x * sgn * 1.0 + toEn.x * -0.45,
    z: lat.z * sgn * 1.0 + toEn.z * -0.45
  });
  escape = steerInside(me, escape, 8.0);

  const inChargeLane = (along > -2.5 && along < 15 && offLine < 3.4);

  // ---- emergency reactions -------------------------------------------
  let handled = false;
  if (!locked) {
    if (threat === 'dash' && inChargeLane) {
      if (api.ready('blink')) {
        api.use('blink', escape.x, escape.z);
        handled = true;
      } else {
        api.move(escape.x, escape.z);
        handled = true;
      }
    } else if (threat === 'chargeWind' && ec.remaining < 0.17 && inChargeLane) {
      if (dist < 8 && api.ready('blink')) {
        api.use('blink', escape.x, escape.z);
        handled = true;
      } else {
        api.move(escape.x, escape.z);
        handled = true;
      }
    } else if (threat === 'smash' && dist < 6.0) {
      const away = steerInside(me, V.norm({ x: -toEn.x + lat.x * sgn * 0.7, z: -toEn.z + lat.z * sgn * 0.7 }), 6);
      api.move(away.x, away.z);
      if (ec.remaining >= 0.14 && api.ready('jump') && !me.busy) {
        api.use('jump');
      } else if (api.ready('blink') && !me.busy) {
        api.use('blink', away.x, away.z);
      }
      handled = true;
    } else if (dist < 3.2 && api.ready('blink') && !me.busy) {
      const away = steerInside(me, V.norm({ x: -toEn.x + lat.x * sgn * 0.6, z: -toEn.z + lat.z * sgn * 0.6 }), 8);
      api.use('blink', away.x, away.z);
      api.move(away.x, away.z);
      handled = true;
    }
  }

  // ---- offence ---------------------------------------------------------
  const chargeSafe = (enemyCd.charge > t + 0.9) || dist > 15.5;
  const meleeSafe = dist > 8.0 || (enemyCd.smash > t + 0.75);
  const enemyOpen = en.stunned ||
    (ec && (ec.phase === 'recover' || ec.phase === 'air')) ||
    (ec && ec.skill === 'charge' && ec.phase === 'dash' && !inChargeLane) ||
    (en.airborne && dist > 5);

  const desperate = (t - lastLaser > 4.5) && dist > 7.5;

  if (!handled && !locked && !me.busy && api.ready('laser') &&
      en.visible && dist < 22.0 && api.los(pred.x, pred.z)) {
    const aim = V.norm({ x: pred.x - me.x, z: pred.z - me.z });
    const err = Math.abs(V.angleTo(me.heading, aim));
    const ok = ((chargeSafe && meleeSafe) || enemyOpen || desperate) &&
      !(ec && ec.skill === 'charge' && ec.phase !== 'dash' && dist < 15) &&
      !(ec && ec.skill === 'smash' && dist < 7.5);
    if (ok && err < 0.55) {
      api.use('laser');
      lastLaser = t;
    }
  }

  // ---- movement ---------------------------------------------------------
  if (!handled) {
    let desired = chargeSafe ? 12.5 : 17.0;
    if (!en.visible) desired = 13.0;
    if (p.timeLeft < 12 && me.hp / me.maxHp > en.hp / en.maxHp) desired = 19.0;

    const tangent = { x: lat.x * 0, z: 0 };
    const perpToEn = { x: -toEn.z * circleSign, z: toEn.x * circleSign };
    const biasW = en.visible ? 1.6 : 3.2;
    const dir = chooseMove(p, api, desired, perpToEn, biasW);
    if (dir) api.move(dir.x, dir.z);
  }

  if (t - saidAt > 6) {
    saidAt = t;
    api.say(dist > 14 ? "eight arms, one beam" : "too close, ape");
  }
}

// ---------------------------------------------------------------------
let lastT = 0;
let circleSign = 1;
let lastFlip = 0;
let lastLaser = -9;
let lastHurt = -9;
let saidAt = -9;
let enemyCd = { charge: 0, smash: 0, jump: 0 };

function resetBrain() {
  circleSign = 1;
  lastFlip = 0;
  lastLaser = -9;
  lastHurt = -9;
  saidAt = -9;
  enemyCd = { charge: 0, smash: 0, jump: 0 };
}

function steerInside(me, dir, look) {
  let d = { x: dir.x, z: dir.z };
  const nx = me.x + d.x * look, nz = me.z + d.z * look;
  const lim = 18.0;
  let ax = 0, az = 0;
  if (nx > lim) ax = -(nx - lim);
  else if (nx < -lim) ax = (-lim - nx);
  if (nz > lim) az = -(nz - lim);
  else if (nz < -lim) az = (-lim - nz);
  if (ax !== 0 || az !== 0) {
    d = V.norm({ x: d.x * look + ax * 1.4, z: d.z * look + az * 1.4 });
  }
  const l = V.len(d);
  if (l < 0.001) return { x: -me.x, z: -me.z };
  return V.norm(d);
}

function wallPen(v) {
  const m = 20 - Math.abs(v);
  if (m >= 5.5) return 0;
  const d = 5.5 - m;
  return d * d * 1.4;
}

function chooseMove(p, api, desired, bias, biasW) {
  const me = p.self, en = p.enemy;
  const enFut = { x: en.x + en.vx * 0.45, z: en.z + en.vz * 0.45 };
  const step = 2.6;
  let best = null, bestS = -1e9;
  for (let i = 0; i < 24; i++) {
    const a = i * Math.PI * 2 / 24;
    const d = { x: Math.sin(a), z: Math.cos(a) };
    const np = { x: me.x + d.x * step, z: me.z + d.z * step };
    let s = 0;
    const r = api.ray(d.x, d.z, step + 1.8);
    if (r.hit && r.dist < step + 1.4) s -= (step + 1.4 - r.dist) * 16;
    const de = Math.hypot(np.x - enFut.x, np.z - enFut.z);
    if (de < desired) s += (de - desired) * 3.4;
    else s -= (de - desired) * 0.9;
    s -= wallPen(np.x) + wallPen(np.z);
    s += (d.x * me.vx + d.z * me.vz) * 0.3;
    if (bias) s += (d.x * bias.x + d.z * bias.z) * biasW;
    if (s > bestS) { bestS = s; best = d; }
  }
  return best;
}
