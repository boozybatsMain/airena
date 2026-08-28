const CAST = 0.667;
const G_CHARGE_CD = 4.033;
const G_SMASH_CD = 1.3;

let enemyLast = { smash: -99, charge: -99, jump: -99 };
let chargeRay = null;
let prevMove = null;
let lastSay = -99;

function clampPt(x, z) {
  return { x: Math.max(-19.0, Math.min(19.0, x)), z: Math.max(-19.0, Math.min(19.0, z)) };
}

function chooseDir(p, api, awayW, avoid, tangW) {
  const me = p.self, e = p.enemy;
  const away = V.norm({ x: me.x - e.x, z: me.z - e.z });
  const per = V.perp(away);
  const rc = Math.hypot(me.x, me.z);
  const toC = rc > 0.5 ? { x: -me.x / rc, z: -me.z / rc } : { x: 0, z: 1 };
  let best = away, bestS = -1e9;
  for (let i = 0; i < 20; i++) {
    const a = i * Math.PI / 10;
    const d = { x: Math.sin(a), z: Math.cos(a) };
    let clear;
    try { clear = api.ray(d.x, d.z, 8).dist; } catch (err) { clear = 8; }
    if (clear < 1.45) continue;
    let s = Math.min(clear, 5.5) * 0.75;
    s += (d.x * away.x + d.z * away.z) * awayW;
    s += Math.abs(d.x * per.x + d.z * per.z) * (tangW === undefined ? 0.5 : tangW);
    if (rc > 11) s += (d.x * toC.x + d.z * toC.z) * (rc - 11) * 1.2;
    if (prevMove) s += (d.x * prevMove.x + d.z * prevMove.z) * 0.85;
    if (avoid) s -= Math.max(0, d.x * avoid.x + d.z * avoid.z) * 3.5;
    if (s > bestS) { bestS = s; best = d; }
  }
  prevMove = best;
  return best;
}

function think(p, api) {
  const me = p.self, e = p.enemy, t = p.t;
  if (!me.alive) return;

  // ---------- digest events ----------
  for (const ev of p.events) {
    if (ev.type === 'enemyStarted') {
      if (enemyLast[ev.skill] !== undefined) enemyLast[ev.skill] = t;
      else enemyLast[ev.skill] = t;
    } else if (ev.type === 'enemyCommitted' && ev.skill === 'charge') {
      chargeRay = { t: t, x: e.x, z: e.z, dx: Math.sin(e.heading), dz: Math.cos(e.heading) };
      enemyLast.charge = Math.min(enemyLast.charge, t) === enemyLast.charge ? enemyLast.charge : t;
    } else if (ev.type === 'damaged') {
      if (ev.skill === 'smash' || ev.skill === 'charge') {
        if (t - enemyLast[ev.skill] > 0.6) enemyLast[ev.skill] = t - 0.3;
      }
    }
  }

  // observe enemy cast state directly (more reliable than events)
  if (e.casting) {
    const sk = e.casting.skill;
    if (enemyLast[sk] === undefined) enemyLast[sk] = t;
    const started = t - (e.casting.elapsed || 0);
    if (started > enemyLast[sk] + 0.15) enemyLast[sk] = started;
    if (sk === 'charge' && e.casting.phase === 'dash') {
      const sp = Math.hypot(e.vx, e.vz);
      const dx = sp > 2 ? e.vx / sp : Math.sin(e.heading);
      const dz = sp > 2 ? e.vz / sp : Math.cos(e.heading);
      chargeRay = { t: t, x: e.x, z: e.z, dx: dx, dz: dz };
    }
  }

  const cdCharge = Math.max(0, G_CHARGE_CD - (t - enemyLast.charge));
  const cdSmash = Math.max(0, G_SMASH_CD - (t - enemyLast.smash));
  const chargeReady = cdCharge <= 0.12;
  const dist = e.dist;

  // ---------- charge line threat ----------
  let chargeThreat = false, dodgeDir = null;
  if (chargeRay && t - chargeRay.t < 0.75) {
    const relx = me.x - chargeRay.x, relz = me.z - chargeRay.z;
    const along = relx * chargeRay.dx + relz * chargeRay.dz;
    const cross = relx * chargeRay.dz - relz * chargeRay.dx;
    if (along > -2.0 && along < 15 && Math.abs(cross) < 4.0) {
      chargeThreat = true;
      let sgn = cross >= 0 ? 1 : -1;
      let q = { x: chargeRay.dz * sgn, z: -chargeRay.dx * sgn };
      // if that side runs us into something hard, flip
      let cl = 8;
      try { cl = api.ray(q.x, q.z, 6).dist; } catch (err) { cl = 8; }
      if (cl < 2.2) {
        const q2 = { x: -q.x, z: -q.z };
        let cl2 = 8;
        try { cl2 = api.ray(q2.x, q2.z, 6).dist; } catch (err) { cl2 = 8; }
        if (cl2 > cl) q = q2;
      }
      dodgeDir = q;
    }
  }
  // also treat an aimed windup at short range as a threat line
  if (!chargeThreat && e.casting && e.casting.skill === 'charge' && e.casting.telegraph && dist < 14) {
    const d = { x: Math.sin(e.heading), z: Math.cos(e.heading) };
    const relx = me.x - e.x, relz = me.z - e.z;
    const cross = relx * d.z - relz * d.x;
    const sgn = cross >= 0 ? 1 : -1;
    dodgeDir = { x: d.z * sgn, z: -d.x * sgn };
  }

  const smashTele = !!(e.casting && e.casting.skill === 'smash' && e.casting.telegraph);

  // ---------- aim prediction ----------
  const myFrac = me.hp / me.maxHp, hisFrac = e.hp / e.maxHp;
  const laserCd = api.cooldown('laser');
  const casting = me.casting && me.casting.skill === 'laser' && me.casting.telegraph;
  const lead = casting ? Math.max(0, me.casting.remaining) + 0.03 : CAST + 0.05;
  let px = e.x + e.vx * lead, pz = e.z + e.vz * lead;
  const mvx = px - e.x, mvz = pz - e.z;
  const mvl = Math.hypot(mvx, mvz);
  if (mvl > 6.5) { px = e.x + mvx / mvl * 6.5; pz = e.z + mvz / mvl * 6.5; }
  const pred = clampPt(px, pz);

  let moveDir = null, moveTo = null, faceAt = pred, useSkill = null, useA = 0, useB = 0;

  // ---------- reactive defence ----------
  const canAct = !me.busy && !me.stunned && !me.airborne;

  if (chargeThreat && dodgeDir) {
    if (canAct && api.ready('blink')) {
      useSkill = 'blink'; useA = dodgeDir.x; useB = dodgeDir.z;
    }
    moveDir = dodgeDir;
    faceAt = { x: e.x, z: e.z };
  } else if (smashTele && dist < 6.3) {
    if (canAct && api.ready('jump')) {
      useSkill = 'jump';
      moveDir = chooseDir(p, api, 3.2, null, 0.4);
    } else if (canAct && api.ready('blink')) {
      const aw = V.norm({ x: me.x - e.x, z: me.z - e.z });
      const q = V.perp(aw);
      useSkill = 'blink'; useA = aw.x * 0.8 + q.x * 0.6; useB = aw.z * 0.8 + q.z * 0.6;
      moveDir = aw;
    } else {
      moveDir = chooseDir(p, api, 3.2, null, 0.4);
    }
    faceAt = { x: e.x, z: e.z };
  } else if (dist < 4.8 && canAct && api.ready('blink') && cdCharge > 0.9) {
    const aw = V.norm({ x: me.x - e.x, z: me.z - e.z });
    const q = V.perp(aw);
    useSkill = 'blink'; useA = aw.x + q.x * 0.5; useB = aw.z + q.z * 0.5;
    moveDir = aw;
  } else if (dist < 3.6 && canAct && api.ready('blink')) {
    const aw = V.norm({ x: me.x - e.x, z: me.z - e.z });
    useSkill = 'blink'; useA = aw.x; useB = aw.z;
    moveDir = aw;
  }

  // ---------- laser ----------
  if (!useSkill && canAct && api.ready('laser') && e.visible) {
    const busyT = (e.casting && e.casting.remaining) ? e.casting.remaining : 0;
    const tCharge = Math.max(cdCharge, busyT) + 0.30 + Math.max(0, (dist - 2.5) / 15);
    const tSmash = Math.max(cdSmash, busyT) + 0.30 + Math.max(0, (dist - 5.1) / 5.35);
    let threatIn = Math.min(tCharge, tSmash);
    if (e.stunned) threatIn += 0.45;
    let window = 0.78;
    if (t > 32 && myFrac < hisFrac) window = 0.50;
    if (e.hp <= 28) window = 0.30;
    let safe = threatIn > window;
    if (e.casting && e.casting.skill === 'charge' && e.casting.phase !== 'recover' && dist < 16) safe = false;

    const dpx = pred.x - me.x, dpz = pred.z - me.z;
    const pdist = Math.hypot(dpx, dpz);
    const err = Math.abs(V.angleTo(me.heading, { x: dpx, z: dpz }));
    let clear = false;
    try { clear = api.los(pred.x, pred.z); } catch (err2) { clear = false; }
    if (safe && pdist < 22.5 && pdist > 2.0 && err < 1.15 && clear) {
      useSkill = 'laser';
      faceAt = pred;
    }
  }

  // ---------- movement ----------
  if (!moveDir && !moveTo) {
    let desired, awayW;
    if (chargeReady || cdCharge < 0.7) {
      desired = 15.5;
      if (dist < desired) awayW = 3.0;
      else if (dist > 21) awayW = -1.0;
      else awayW = 0.6;
    } else {
      desired = 9.5;
      if (dist < 7.5) awayW = 2.8;
      else if (dist > 12.5) awayW = -1.4;
      else awayW = 0.4;
    }
    if (!e.visible) {
      if (laserCd < 0.4 && dist > 6) {
        moveTo = { x: e.x, z: e.z };
      } else {
        moveDir = chooseDir(p, api, Math.max(awayW, 0.8), null, 0.6);
      }
    } else {
      moveDir = chooseDir(p, api, awayW, null, 0.55);
    }
  }

  // ---------- issue orders ----------
  if (moveTo) api.moveTo(moveTo.x, moveTo.z);
  else if (moveDir) api.move(moveDir.x, moveDir.z);

  if (casting) api.faceAt(pred.x, pred.z);
  else api.faceAt(faceAt.x, faceAt.z);

  if (useSkill === 'blink') api.use('blink', useA, useB);
  else if (useSkill) api.use(useSkill);

  if (t - lastSay > 6.5) {
    lastSay = t;
    const lines = ['eight arms, one beam', 'come closer, ape', 'ink and light', 'you are slow where it counts'];
    api.say(lines[Math.floor(api.rand() * lines.length) % lines.length]);
  }
}
