function pickDir(api, me, desired) {
  const baseH = Math.atan2(desired.x, desired.z);
  let best = desired, bestS = -1e9;
  for (let i = -6; i <= 6; i++) {
    const a = baseH + i * (Math.PI / 12);
    const dir = { x: Math.sin(a), z: Math.cos(a) };
    const r = api.ray(dir.x, dir.z, 6);
    let s = Math.min(r.dist, 6) * 1.5 - Math.abs(i) * 0.9;
    const nx = me.x + dir.x * 5, nz = me.z + dir.z * 5;
    if (Math.abs(nx) > 18.3) s -= (Math.abs(nx) - 18.3) * 4;
    if (Math.abs(nz) > 18.3) s -= (Math.abs(nz) - 18.3) * 4;
    if (r.dist < 1.9) s -= 12;
    if (s > bestS) { bestS = s; best = dir; }
  }
  return best;
}

function blinkDir(me, en, prefer) {
  let best = prefer, bestS = -1e9;
  const baseH = Math.atan2(prefer.x, prefer.z);
  for (let i = -4; i <= 4; i++) {
    const a = baseH + i * (Math.PI / 9);
    const dir = { x: Math.sin(a), z: Math.cos(a) };
    const px = me.x + dir.x * 7.5, pz = me.z + dir.z * 7.5;
    let s = 0;
    const ox = Math.abs(px) - 18.0, oz = Math.abs(pz) - 18.0;
    if (ox > 0) s -= ox * 6;
    if (oz > 0) s -= oz * 6;
    const dd = Math.hypot(px - en.x, pz - en.z);
    s += Math.min(dd, 15) * 1.2 - Math.abs(i) * 0.45;
    if (s > bestS) { bestS = s; best = dir; }
  }
  return best;
}

let strafeSign = 1;
let flipT = -99;
let lastDodge = -99;

function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive) return;
  if (me.stunned) return;

  const d = en.dist;
  const toEn = V.toward(me, en);
  const away = V.away(me, en);

  for (const e of p.events) {
    if ((e.type === 'blocked') || (e.type === 'damaged')) {
      if (p.t - flipT > 0.6) { strafeSign = -strafeSign; flipT = p.t; }
    }
  }

  const canAct = !me.busy && !me.airborne;
  const cast = en.casting;
  const skill = cast ? cast.skill : null;
  const chargeWind = skill === 'charge' && cast.phase === 'windup';
  const chargeDash = skill === 'charge' && cast.phase === 'dash';
  const smashThreat = skill === 'smash' && cast.telegraph;

  let acted = false;
  let moveDir = null;
  let faceTarget = { x: en.x, z: en.z };

  // ---- charge dodge ----
  if (chargeWind || chargeDash) {
    const hdir = V.fromHeading(en.heading);
    const rel = { x: me.x - en.x, z: me.z - en.z };
    const along = V.dot(rel, hdir);
    const lat = Math.abs(hdir.x * rel.z - hdir.z * rel.x);
    const inLane = along > -1 && along < 14.5 && lat < 3.2;
    if (inLane) {
      let side = V.perp(hdir);
      if (V.dot(rel, side) < 0) side = V.scale(side, -1);
      const px = me.x + side.x * 7.5, pz = me.z + side.z * 7.5;
      if (Math.abs(px) > 19 || Math.abs(pz) > 19) side = V.scale(side, -1);
      const urgent = chargeDash || (cast.remaining !== undefined && cast.remaining < 0.16);
      if (urgent && canAct && api.ready('blink')) {
        const bd = blinkDir(me, en, side);
        api.use('blink', bd.x, bd.z);
        acted = true;
        lastDodge = p.t;
      }
      moveDir = V.norm(V.add(side, V.scale(away, 0.35)));
    }
  }

  // ---- smash dodge ----
  if (!acted && smashThreat && d < 6.6) {
    if (canAct && api.ready('jump')) {
      api.use('jump');
      acted = true;
    } else if (canAct && api.ready('blink')) {
      const bd = blinkDir(me, en, away);
      api.use('blink', bd.x, bd.z);
      acted = true;
    }
    if (!moveDir) moveDir = V.norm(V.add(away, V.scale(V.perp(toEn), strafeSign * 0.8)));
  }

  // ---- preemptive escape from melee ----
  if (!acted && canAct && d < 3.9 && api.ready('blink')) {
    const bd = blinkDir(me, en, away);
    api.use('blink', bd.x, bd.z);
    acted = true;
  }

  // ---- laser ----
  const enemySafeWindow = en.busy || en.stunned || en.airborne;
  const minRange = enemySafeWindow ? 4.0 : 6.2;
  if (!acted && canAct && api.ready('laser') && en.visible && !en.invulnerable &&
      d >= minRange && d <= 23.5 && !chargeWind && !chargeDash) {
    const angErr = Math.abs(V.angleTo(me.heading, toEn));
    if (angErr < 0.9) {
      api.use('laser');
      acted = true;
    }
  }

  // ---- aim (lead a little) ----
  {
    let lead = 0.55;
    if (me.casting && me.casting.skill === 'laser') lead = Math.min(me.casting.remaining || 0.3, 0.7) * 0.9;
    let lx = en.x + en.vx * lead, lz = en.z + en.vz * lead;
    if (en.speed > 9) { lx = en.x + en.vx * 0.12; lz = en.z + en.vz * 0.12; }
    faceTarget = { x: lx, z: lz };
  }

  // ---- movement ----
  if (!moveDir) {
    const PREF = 11.0;
    let w = (PREF - d) / 4.5;
    w = Math.max(-1, Math.min(1, w));
    const tan = V.scale(V.perp(toEn), strafeSign);
    if (w >= 0) {
      moveDir = V.norm(V.add(V.scale(away, w), V.scale(tan, (1 - w) * 0.95)));
    } else {
      const app = en.visible ? 0.2 : 0.95;
      moveDir = V.norm(V.add(V.scale(toEn, app), V.scale(tan, (1 - app) * 0.9)));
    }
    const wallD = 20 - Math.max(Math.abs(me.x), Math.abs(me.z));
    if (wallD < 6) {
      const toC = V.norm({ x: -me.x, z: -me.z });
      moveDir = V.norm(V.add(moveDir, V.scale(toC, ((6 - wallD) / 6) * 1.4)));
    }
  }

  if (!en.visible && d > 13.5) {
    api.moveTo(en.x, en.z);
  } else {
    const dir = pickDir(api, me, moveDir);
    api.move(dir.x, dir.z);
  }

  api.faceAt(faceTarget.x, faceTarget.z);
}
