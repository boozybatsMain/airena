function think(p, api) {
  const me = p.self;
  const en = p.enemy;
  const dist = en.dist;
  const myPos = { x: me.x, z: me.z };
  const enPos = { x: en.x, z: en.z };
  const toEn = V.toward(myPos, enPos);

  let lastBlink = api.recall('lb', -10);
  let lastLaser = api.recall('ll', -10);
  let lastEnJump = api.recall('ej', -10);
  let strafeSign = api.recall('ss', 1);

  for (const ev of p.events) {
    if (ev.type === 'enemyStarted') {
      if (ev.skill === 'blink') { lastBlink = p.t; api.remember('lb', p.t); }
      else if (ev.skill === 'laser') { lastLaser = p.t; api.remember('ll', p.t); }
      else if (ev.skill === 'jump') { lastEnJump = p.t; api.remember('ej', p.t); }
    }
  }

  const BLINK_CD = 3.933;
  const LASER_CD = 2.2;
  const blinkUp = (p.t - lastBlink) >= BLINK_CD;
  const laserUp = (p.t - lastLaser) >= LASER_CD;

  if (me.stunned || me.airborne) {
    api.faceAt(en.x, en.z);
    return;
  }

  if (me.busy) {
    if (me.casting) {
      if (me.casting.skill === 'smash' && me.casting.phase === 'windup') {
        const t = me.casting.remaining;
        api.faceAt(en.x + en.vx * t, en.z + en.vz * t);
      } else if (me.casting.skill === 'charge' && me.casting.phase === 'windup') {
        const t = me.casting.remaining;
        api.faceAt(en.x + en.vx * t, en.z + en.vz * t);
      }
    }
    return;
  }

  if (en.casting && en.casting.skill === 'laser') {
    if (api.ready('charge') && dist < 14 && api.los(en.x, en.z)) {
      api.faceAt(en.x, en.z);
      api.use('charge');
      return;
    }
    if (api.rand() < 0.04) { strafeSign = -strafeSign; api.remember('ss', strafeSign); }
    const perp = V.perp(toEn);
    api.move(perp.x * strafeSign, perp.z * strafeSign);
    api.faceAt(en.x, en.z);
    return;
  }

  if (en.invulnerable) {
    api.moveTo(en.x, en.z);
    api.faceAt(en.x, en.z);
    return;
  }

  if (en.airborne) {
    api.moveTo(en.x, en.z);
    api.faceAt(en.x, en.z);
    return;
  }

  if (en.stunned && dist < 5.0 && api.ready('smash')) {
    api.faceAt(en.x, en.z);
    api.use('smash');
    return;
  }

  if (dist < 5.2 && api.ready('smash')) {
    const predT = 0.3;
    const px = en.x + en.vx * predT;
    const pz = en.z + en.vz * predT;
    api.faceAt(px, pz);
    api.use('smash');
    api.moveTo(en.x, en.z);
    return;
  }

  if (api.ready('charge') && !blinkUp && dist > 3.5 && dist < 13 && !en.airborne && api.los(en.x, en.z)) {
    api.faceAt(en.x, en.z);
    api.use('charge');
    return;
  }

  if (p.burn > 0 && api.ready('charge') && dist > 6 && api.los(en.x, en.z)) {
    api.faceAt(en.x, en.z);
    api.use('charge');
    return;
  }

  if (dist > 3 && api.ready('smash') && !blinkUp && laserUp && api.los(en.x, en.z)) {
    api.moveTo(en.x, en.z);
    api.faceAt(en.x, en.z);
    return;
  }

  const lead = Math.min(dist / me.maxSpeed, 0.8) * 0.5;
  const tx = en.x + en.vx * lead;
  const tz = en.z + en.vz * lead;
  api.moveTo(tx, tz);
  api.faceAt(en.x, en.z);
}