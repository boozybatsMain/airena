const KITE_DIST = 14;
const LEAD = 0.72;

let strafe = 1;
let lastFlip = -99;
let enemyCdT = { smash: 0, charge: 0, jump: 0 };
let saidHello = false;

function perpR(a) { return { x: a.z, z: -a.x }; }

function offLine(eh, toMe) {
  const d = toMe.x * eh.x + toMe.z * eh.z;
  let px = toMe.x - eh.x * d, pz = toMe.z - eh.z * d;
  const l = Math.hypot(px, pz);
  if (l < 0.2) { px = eh.z; pz = -eh.x; }
  else { px /= l; pz /= l; }
  return { x: px, z: pz };
}

function clearDir(p, api, desired, enemy) {
  if (!desired || (desired.x === 0 && desired.z === 0)) return { x: 0, z: 0 };
  const base = V.heading(desired);
  let best = null, bestScore = -1e9;
  for (let k = -4; k <= 4; k++) {
    const h = base + k * 0.34;
    const d = V.fromHeading(h);
    let cl = api.ray(d.x, d.z, 4.5).dist;
    if (cl > 4.5) cl = 4.5;
    if (cl < 1.35) continue;
    const nx = p.self.x + d.x * 2.5, nz = p.self.z + d.z * 2.5;
    const margin = Math.min(19.2 - Math.abs(nx), 19.2 - Math.abs(nz));
    const de = Math.hypot(nx - enemy.x, nz - enemy.z);
    const s = cl * 1.1 + Math.cos(k * 0.34) * 4.5 + Math.min(margin, 6) * 0.85 + Math.min(de, 16) * 0.3;
    if (s > bestScore) { bestScore = s; best = d; }
  }
  return best || V.norm(desired);
}

function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me || !me.alive || !en) return;
  const t = p.t;

  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      if (e.skill === 'charge') enemyCdT.charge = t + 4.033;
      else if (e.skill === 'smash') enemyCdT.smash = t + 1.3;
      else if (e.skill === 'jump') enemyCdT.jump = t + 2.8;
    } else if (e.type === 'blocked') {
      if (t - lastFlip > 0.6) { strafe = -strafe; lastFlip = t; }
    }
  }

  if (!saidHello) { saidHello = true; api.say("eight arms, one beam"); }
  if (me.stunned) return;

  const dist = en.dist;
  const rad = V.toward(me, en);
  const away = { x: -rad.x, z: -rad.z };
  const tanv = perpR(rad);
  const cen = V.norm({ x: -me.x, z: -me.z });
  const margin = 19 - Math.max(Math.abs(me.x), Math.abs(me.z));

  // ---- aiming point (lead only the lateral component) ----
  const vt = en.vx * tanv.x + en.vz * tanv.z;
  const aim = {
    x: en.x + tanv.x * vt * LEAD * 0.9,
    z: en.z + tanv.z * vt * LEAD * 0.9
  };
  api.faceAt(aim.x, aim.z);

  const ec = en.casting;
  const charging = !!ec && ec.skill === 'charge';
  const dashing = charging && ec.phase === 'dash';
  const smashTel = !!ec && ec.skill === 'smash' && ec.telegraph;
  const chargeCdLeft = enemyCdT.charge - t;

  let dir = null;
  let usedMoveTo = false;

  if (charging && dist < 18) {
    // ---- dodge the charge: get off the locked line ----
    const eh = V.fromHeading(en.heading);
    const off = offLine(eh, V.toward(en, me));
    const c1 = api.ray(off.x, off.z, 7).dist;
    const c2 = api.ray(-off.x, -off.z, 7).dist;
    let dd = off;
    if (c2 > c1 + 1.5) dd = { x: -off.x, z: -off.z };
    const bl = V.norm({ x: dd.x + away.x * 0.35, z: dd.z + away.z * 0.35 });
    if (dashing && !me.busy && !me.airborne && api.ready('blink')) {
      api.use('blink', bl.x, bl.z);
    }
    dir = V.norm({ x: dd.x + away.x * 0.25, z: dd.z + away.z * 0.25 });
  } else if (smashTel && dist < 7.2) {
    // ---- duck the ground sweep ----
    dir = V.norm({ x: away.x + cen.x * 0.4, z: away.z + cen.z * 0.4 });
    if (!me.busy && !me.airborne) {
      if (api.ready('jump')) api.use('jump');
      else if (api.ready('blink') && chargeCdLeft > 0.9) api.use('blink', dir.x, dir.z);
    }
  } else if (dist < 6.9) {
    // ---- too close for comfort: open the gap ----
    dir = V.norm({ x: away.x + tanv.x * strafe * 0.55 + cen.x * (margin < 6 ? 0.6 : 0), z: away.z + tanv.z * strafe * 0.55 + cen.z * (margin < 6 ? 0.6 : 0) });
    if (!me.busy && !me.airborne && api.ready('blink') &&
        (chargeCdLeft > 1.2 || dist < 3.4 || me.hp < 55)) {
      api.use('blink', dir.x, dir.z);
    }
  } else {
    // ---- kite and burn them down ----
    if (!en.visible) {
      if (dist > 10.5) {
        api.moveTo(en.x, en.z);
        usedMoveTo = true;
      } else {
        dir = V.norm({ x: tanv.x * strafe + away.x * 0.25, z: tanv.z * strafe + away.z * 0.25 });
      }
    } else {
      if (!me.busy && !me.airborne && api.ready('laser') && dist <= 21.5) {
        const toAim = V.toward(me, aim);
        const ang = Math.abs(V.angleTo(me.heading, toAim));
        if (ang < 1.25) api.use('laser');
      }
      const err = dist - KITE_DIST;
      const k = Math.max(-1, Math.min(1, err / 4.5));
      const tw = 1 - Math.abs(k) * 0.5;
      dir = V.norm({
        x: rad.x * k + tanv.x * strafe * tw,
        z: rad.z * k + tanv.z * strafe * tw
      });
      if (margin < 5.5) {
        const w = (5.5 - margin) * 0.4;
        dir = V.norm({ x: dir.x + cen.x * w, z: dir.z + cen.z * w });
      }
      // cornered with the ape near: teleport toward open ground
      if (margin < 2.6 && dist < 9.5 && !me.busy && !me.airborne &&
          api.ready('blink') && chargeCdLeft > 1.4) {
        api.use('blink', cen.x, cen.z);
      }
    }
  }

  if (!usedMoveTo) {
    const tanClear = api.ray(tanv.x * strafe, tanv.z * strafe, 3).dist;
    if (tanClear < 1.7 && t - lastFlip > 0.7) { strafe = -strafe; lastFlip = t; }
    const d = clearDir(p, api, dir, en);
    if (d.x === 0 && d.z === 0) api.move(away.x, away.z);
    else api.move(d.x, d.z);
  }
}
