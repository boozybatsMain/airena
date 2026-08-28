let dodgeSide = 1;
let flipped = false;

function chargeLead(me, en) {
  let t = 0.3;
  for (let i = 0; i < 3; i++) {
    const px = en.x + en.vx * t, pz = en.z + en.vz * t;
    const d = Math.hypot(px - me.x, pz - me.z);
    t = 0.3 + Math.max(0, d - 2.25) / 15;
  }
  let px = en.x + en.vx * t, pz = en.z + en.vz * t;
  px = Math.max(-18.5, Math.min(18.5, px));
  pz = Math.max(-18.5, Math.min(18.5, pz));
  return { x: px, z: pz };
}

function think(p, api) {
  const me = p.self, en = p.enemy;
  const dist = en.dist;
  const toEn = V.toward(me, en);

  if (p.tick === 2) api.say("ook.");

  for (const e of p.events) {
    if (e.type === 'enemyStarted' && e.skill === 'laser') {
      dodgeSide = api.rand() < 0.5 ? 1 : -1;
      flipped = false;
    }
  }

  const ecast = en.casting;
  const laserIncoming = !!(ecast && ecast.skill === 'laser' && ecast.telegraph);
  const rem = laserIncoming ? ecast.remaining : 0;

  const pSmash = { x: en.x + en.vx * 0.3, z: en.z + en.vz * 0.3 };
  const smashDir = V.norm({ x: pSmash.x - me.x, z: pSmash.z - me.z });

  // Steering while a skill of ours is running.
  if (me.busy && me.casting) {
    const c = me.casting;
    if (c.skill === 'smash' && c.phase === 'windup') {
      api.face(smashDir.x, smashDir.z);
      api.move(toEn.x, toEn.z);
      return;
    }
    if (c.skill === 'charge' && c.phase === 'windup') {
      const lead = chargeLead(me, en);
      api.faceAt(lead.x, lead.z);
      return;
    }
    api.move(toEn.x, toEn.z);
    api.face(toEn.x, toEn.z);
    return;
  }

  // Smash when it will land.
  const airDodge = en.airborne && !(ecast && ecast.remaining <= 0.25);
  const dSm = Math.hypot(pSmash.x - me.x, pSmash.z - me.z);
  const angErr = Math.abs(V.angleTo(me.heading, smashDir));
  if (api.ready('smash') && !en.invulnerable && !airDodge &&
      dSm < 4.95 && dist < 5.4 && angErr < 1.35) {
    api.use('smash');
    api.face(smashDir.x, smashDir.z);
    api.move(toEn.x, toEn.z);
    return;
  }

  // Charge: interrupt their laser, or close and stun.
  if (api.ready('charge') && en.visible && !me.airborne && !me.stunned) {
    const lead = chargeLead(me, en);
    const dLead = Math.hypot(lead.x - me.x, lead.z - me.z);
    const clear = api.los(lead.x, lead.z);
    const wantInterrupt = laserIncoming && dist < 14 && dist > 3.2;
    const wantOffense = dist > 4.5 && dLead < 12.5;
    if (clear && (wantInterrupt || wantOffense)) {
      const dirL = V.norm({ x: lead.x - me.x, z: lead.z - me.z });
      const aErr = Math.abs(V.angleTo(me.heading, dirL));
      api.face(dirL.x, dirL.z);
      if (aErr < 0.95) {
        api.use('charge');
        api.move(dirL.x, dirL.z);
      } else {
        api.move(toEn.x, toEn.z);
      }
      return;
    }
  }

  // Dodge an incoming beam we cannot interrupt.
  if (laserIncoming && en.visible && dist < 28) {
    if (!flipped && rem < 0.34) { dodgeSide = -dodgeSide; flipped = true; }
    const perp = V.perp(toEn);
    const closeBias = dist > 6 ? 0.45 : 0.2;
    let dir = V.norm(V.add(V.scale(perp, dodgeSide), V.scale(toEn, closeBias)));
    const r = api.ray(dir.x, dir.z, 3);
    if (r.hit && r.dist < 2.2) {
      dodgeSide = -dodgeSide;
      dir = V.norm(V.add(V.scale(perp, dodgeSide), V.scale(toEn, closeBias)));
    }
    api.move(dir.x, dir.z);
    api.face(toEn.x, toEn.z);
    return;
  }

  // Default: hunt.
  const tx = Math.max(-19, Math.min(19, en.x + en.vx * 0.25));
  const tz = Math.max(-19, Math.min(19, en.z + en.vz * 0.25));
  api.moveTo(tx, tz);
  api.face(toEn.x, toEn.z);
}