const CHARGE_CD = 4.033;
let lastCharge = -99, lastSmash = -99, orbit = 1, lastFlip = -99, greeted = false;

function norm2(x, z) {
  const l = Math.hypot(x, z);
  if (l < 1e-6) return { x: 0, z: 0 };
  return { x: x / l, z: z / l };
}

function leadPoint(en, lead) {
  const s = Math.hypot(en.vx, en.vz);
  if (s < 0.05) return { x: en.x, z: en.z };
  const L = Math.min(3.2, s * lead);
  return { x: en.x + (en.vx / s) * L, z: en.z + (en.vz / s) * L };
}

function clearDir(p, api, dir, want) {
  const r = api.ray(dir.x, dir.z, want + 0.3);
  if (r.dist < want) return false;
  const a = V.rot(dir, 0.35), b = V.rot(dir, -0.35);
  const w2 = Math.min(want, 2.0);
  if (api.ray(a.x, a.z, w2 + 0.3).dist < w2) return false;
  if (api.ray(b.x, b.z, w2 + 0.3).dist < w2) return false;
  const nx = p.self.x + dir.x * want, nz = p.self.z + dir.z * want;
  if (Math.abs(nx) > 19.0 || Math.abs(nz) > 19.0) return false;
  return true;
}

function steer(p, api, dir) {
  const u = norm2(dir.x, dir.z);
  if (u.x === 0 && u.z === 0) { api.stop(); return; }
  const offs = [0, 0.35, -0.35, 0.75, -0.75, 1.15, -1.15, 1.6, -1.6, 2.2, -2.2];
  for (const o of offs) {
    const c = o === 0 ? u : V.rot(u, o);
    if (clearDir(p, api, c, 2.6)) { api.move(c.x, c.z); return; }
  }
  api.move(u.x, u.z);
}

function inPath(p) {
  const me = p.self, en = p.enemy;
  const eh = V.fromHeading(en.heading);
  const rx = me.x - en.x, rz = me.z - en.z;
  const along = rx * eh.x + rz * eh.z;
  const lat = rx * eh.z - rz * eh.x;
  return along > -1.5 && along < 15 && Math.abs(lat) < 3.6;
}

function dodgeDir(p, api) {
  const me = p.self, en = p.enemy;
  const eh = V.fromHeading(en.heading);
  const rx = me.x - en.x, rz = me.z - en.z;
  const lat = rx * eh.z - rz * eh.x;
  const a = { x: eh.z, z: -eh.x };
  let dir = lat >= 0 ? a : { x: -a.x, z: -a.z };
  const opp = { x: -dir.x, z: -dir.z };
  const r1 = api.ray(dir.x, dir.z, 7.5), r2 = api.ray(opp.x, opp.z, 7.5);
  if (r1.dist < 4 && r2.dist > r1.dist + 1) dir = opp;
  const nx = me.x + dir.x * 7, nz = me.z + dir.z * 7;
  if (Math.abs(nx) > 19 || Math.abs(nz) > 19) {
    const o = { x: -dir.x, z: -dir.z };
    const ox = me.x + o.x * 7, oz = me.z + o.z * 7;
    if (Math.abs(ox) <= 19 && Math.abs(oz) <= 19) dir = o;
  }
  return dir;
}

function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en.alive) return;
  const t = p.t, d = en.dist;

  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      if (e.skill === 'charge') lastCharge = t;
      else if (e.skill === 'smash') lastSmash = t;
    } else if (e.type === 'blocked') {
      if (t - lastFlip > 0.5) { orbit = -orbit; lastFlip = t; }
    } else if (e.type === 'damaged' && e.skill === 'smash') {
      if (t - lastFlip > 0.4) { orbit = -orbit; lastFlip = t; }
    }
  }

  const chargeReady = (t - lastCharge) >= CHARGE_CD - 0.25;
  const ec = en.casting, ph = ec ? ec.phase : null;
  const chargeDash = !!ec && ec.skill === 'charge' && ph === 'dash';
  const chargeWind = !!ec && ec.skill === 'charge' && ph === 'windup';
  const smashWind = !!ec && ec.skill === 'smash' && ec.telegraph;

  const myFrac = me.hp / me.maxHp, enFrac = en.hp / en.maxHp;
  const flee = t > 26 && myFrac - enFrac > 0.06;
  const aggro = (t > 33 && enFrac - myFrac > 0.04) || en.hp < 30;

  const castingLaser = !!me.casting && me.casting.skill === 'laser' && me.casting.telegraph;
  const lead = castingLaser ? Math.max(0, Math.min(0.7, me.casting.remaining)) : 0.6;
  const aim = leadPoint(en, lead);
  api.faceAt(aim.x, aim.z);

  if (!greeted) { greeted = true; api.say("ink and light"); }

  const toEn = norm2(en.x - me.x, en.z - me.z);
  const awayV = { x: -toEn.x, z: -toEn.z };
  const tang = { x: -toEn.z * orbit, z: toEn.x * orbit };
  const canAct = !me.busy && !me.stunned && !me.airborne;
  let used = null;

  if (chargeDash || (chargeWind && ec.remaining <= 0.075)) {
    const dd = dodgeDir(p, api);
    if (canAct && api.ready('blink') && inPath(p)) used = ['blink', dd.x, dd.z];
    steer(p, api, { x: dd.x + awayV.x * 0.3, z: dd.z + awayV.z * 0.3 });
  } else if (chargeWind) {
    steer(p, api, { x: tang.x + awayV.x * 0.55, z: tang.z + awayV.z * 0.55 });
  } else if (smashWind && d < 6.5) {
    if (canAct && api.ready('jump') && d < 5.8 && ec.remaining >= 0.11 && ec.remaining <= 0.34) {
      used = ['jump'];
    } else if (canAct && d < 3.7 && api.ready('blink')) {
      const bd = norm2(awayV.x + tang.x * 0.6, awayV.z + tang.z * 0.6);
      used = ['blink', bd.x, bd.z];
    }
    steer(p, api, { x: awayV.x + tang.x * 0.55, z: awayV.z + tang.z * 0.55 });
  } else {
    let desired = chargeReady ? 13.5 : 8.5;
    if (flee) desired = 20;
    if (aggro) desired = 6.5;
    if (castingLaser) desired = Math.max(desired, d + 2);
    if (!en.visible && !flee) desired = Math.min(desired, 9);

    if (canAct && d < 3.2 && api.ready('blink') && !aggro) {
      const bd = norm2(awayV.x + tang.x * 0.5, awayV.z + tang.z * 0.5);
      used = ['blink', bd.x, bd.z];
    }

    const err = d - desired;
    const k = Math.max(-1, Math.min(1, err / 4));
    let dir = { x: toEn.x * k + tang.x * 0.85, z: toEn.z * k + tang.z * 0.85 };
    const edge = Math.max(Math.abs(me.x), Math.abs(me.z));
    if (edge > 13.5) {
      const inw = norm2(-me.x, -me.z);
      const w = Math.min(2.0, (edge - 13.5) / 5.5 * 1.8);
      dir = { x: dir.x + inw.x * w, z: dir.z + inw.z * w };
    }

    if (!en.visible && d > desired + 1 && !flee) {
      const pa = api.pathTo(en.x, en.z);
      if (pa) api.moveTo(en.x, en.z); else steer(p, api, dir);
    } else {
      steer(p, api, dir);
    }
  }

  if (!used && canAct && api.ready('laser') && en.visible && d < 21 && !chargeDash) {
    const minD = flee ? 13 : (chargeReady ? 9.5 : (aggro ? 4.5 : 5.8));
    const window = d >= minD || en.stunned ||
      (!!ec && ec.skill === 'charge' && ph === 'recover') ||
      (!!ec && ec.skill === 'jump');
    const dirA = norm2(aim.x - me.x, aim.z - me.z);
    const ang = Math.abs(V.angleTo(me.heading, dirA));
    if (window && ang < 1.1 && api.los(aim.x, aim.z) && !(smashWind && d < 6.5)) {
      used = ['laser'];
    }
  }

  if (used) api.use(used[0], used[1], used[2]);
}
