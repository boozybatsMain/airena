const LASER_CAST = 0.667;
const CHARGE_CD = 4.033;

let prevDir = { x: 0, z: 1 };
let enemyLast = { charge: -99, smash: -99, jump: -99 };
let committedDir = null;
let committedT = -99;
let lastSay = -99;
let blockedT = -99;

function clearanceOf(api, d, max) {
  const r = api.ray(d.x, d.z, max);
  if (!r) return max;
  return typeof r.dist === "number" ? r.dist : max;
}

function chooseDir(p, api, mode, towardE) {
  const me = p.self, en = p.enemy;
  const dist = en.dist;
  let best = null, bestS = -1e9;
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    const d = { x: Math.sin(a), z: Math.cos(a) };
    const c = Math.min(clearanceOf(api, d, 5.5), 5.5);
    let s = 0;
    if (c < 1.7) s -= 70;
    s += Math.min(c, 4) * 0.5;
    const step = Math.min(Math.max(c - 0.9, 0), 3.2);
    const fp = { x: me.x + d.x * step, z: me.z + d.z * step };
    const dEn = Math.hypot(fp.x - en.x, fp.z - en.z);
    if (mode === "away") s += (dEn - dist) * 3.5;
    else if (mode === "toward") s += (dist - dEn) * 3.0;
    else {
      s += (dEn - dist) * 1.0;
      s += (1 - Math.abs(d.x * towardE.x + d.z * towardE.z)) * 2.4;
    }
    const wm = 20 - Math.max(Math.abs(fp.x), Math.abs(fp.z));
    s += Math.min(wm, 6) * 0.55;
    if (wm < 2.4) s -= 30;
    s += (d.x * prevDir.x + d.z * prevDir.z) * 0.9;
    if (s > bestS) { bestS = s; best = d; }
  }
  return best || towardE;
}

function doMove(api, d) {
  if (!d) return;
  prevDir = d;
  api.move(d.x, d.z);
}

function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me || !en || !me.alive || !en.alive) return;

  for (const e of p.events) {
    if (e.type === "enemyStarted") {
      if (e.skill === "charge") enemyLast.charge = p.t;
      else if (e.skill === "smash") enemyLast.smash = p.t;
      else if (e.skill === "jump") enemyLast.jump = p.t;
    } else if (e.type === "enemyCommitted") {
      committedT = p.t;
      committedDir = { x: Math.sin(en.heading), z: Math.cos(en.heading) };
    } else if (e.type === "blocked") {
      blockedT = p.t;
    }
  }

  const dist = en.dist;
  const toE = V.norm({ x: en.x - me.x, z: en.z - me.z });
  const away = { x: -toE.x, z: -toE.z };
  const enC = en.casting;
  const chargeReadyEst = (p.t - enemyLast.charge) >= (CHARGE_CD - 0.25);

  // ---------- aiming ----------
  let lt = 0;
  if (me.casting && me.casting.skill === "laser" && me.casting.telegraph) lt = me.casting.remaining;
  else if (api.cooldown("laser") < 0.2) lt = LASER_CAST;
  const k = en.speed > 8 ? 1.0 : 0.55;
  api.faceAt(en.x + en.vx * lt * k, en.z + en.vz * lt * k);

  // ---------- charge threat ----------
  let chargeDir = null;
  if (enC && enC.skill === "charge") {
    if (enC.phase === "dash" || (enC.phase === "windup" && enC.remaining <= 0.1)) {
      chargeDir = { x: Math.sin(en.heading), z: Math.cos(en.heading) };
    }
  } else if (p.t - committedT < 0.25 && committedDir) {
    chargeDir = committedDir;
  }

  let inChargeLine = false;
  if (chargeDir) {
    const rx = me.x - en.x, rz = me.z - en.z;
    const along = rx * chargeDir.x + rz * chargeDir.z;
    const perp = Math.abs(rx * chargeDir.z - rz * chargeDir.x);
    if (along > -1.5 && along < 15.0 && perp < 3.6) inChargeLine = true;
  }

  // ---------- emergency: dodge the charge ----------
  if (inChargeLine && !me.airborne && !me.stunned) {
    const sides = [
      { x: chargeDir.z, z: -chargeDir.x },
      { x: -chargeDir.z, z: chargeDir.x }
    ];
    let bd = null, bs = -1e9;
    for (const s of sides) {
      const dir = V.norm({ x: s.x + away.x * 0.35, z: s.z + away.z * 0.35 });
      const lx = me.x + dir.x * 7.5, lz = me.z + dir.z * 7.5;
      let sc = 0;
      sc += Math.min(20 - Math.abs(lx), 20 - Math.abs(lz)) * 1.2;
      sc += Math.min(clearanceOf(api, dir, 6), 6) * 0.6;
      sc += Math.hypot(lx - en.x, lz - en.z) * 0.3;
      if (sc > bs) { bs = sc; bd = dir; }
    }
    if (api.ready("blink")) {
      api.use("blink", bd.x, bd.z);
      doMove(api, bd);
      return;
    }
    doMove(api, bd);
    return;
  }

  // ---------- smash threat ----------
  const smashTele = enC && enC.skill === "smash" && enC.telegraph;
  if (smashTele && dist < 6.2 && !me.airborne && !me.stunned) {
    const d = chooseDir(p, api, "away", toE);
    if (dist < 4.9) {
      if (api.ready("jump")) {
        doMove(api, d);
        api.use("jump");
        return;
      }
      if (api.ready("blink") && !chargeReadyEst) {
        const dir = V.norm({ x: away.x + d.x * 0.6, z: away.z + d.z * 0.6 });
        api.use("blink", dir.x, dir.z);
        doMove(api, dir);
        return;
      }
    }
    doMove(api, d);
    return;
  }

  // ---------- panic escape from melee ----------
  if (dist < 3.6 && !me.busy && !me.stunned && api.ready("blink") && !chargeReadyEst) {
    const d = chooseDir(p, api, "away", toE);
    const dir = V.norm({ x: away.x + d.x * 0.7, z: away.z + d.z * 0.7 });
    api.use("blink", dir.x, dir.z);
    doMove(api, dir);
    return;
  }

  // ---------- laser ----------
  const enRecovering = enC && !enC.telegraph;
  const smashWindow = (p.t - enemyLast.smash) > 0.28 && (p.t - enemyLast.smash) < 0.66;
  const safeClose = en.stunned || enRecovering || smashWindow;
  const chargeWindingUp = enC && enC.skill === "charge" && enC.phase === "windup";

  if (!me.busy && !me.stunned && !me.airborne && api.ready("laser") &&
      en.visible && !en.invulnerable && dist < 23.5) {
    const closeOk = dist > 5.6 || safeClose;
    const chargeOk = !(chargeWindingUp && dist < 15.5);
    if (closeOk && chargeOk) {
      api.use("laser");
    }
  }

  // ---------- positioning ----------
  let desired = chargeReadyEst ? 17.0 : 8.0;
  if (me.hp < 45) desired += 2.0;

  if (!en.visible) {
    if (dist > 6) {
      api.moveTo(en.x, en.z);
    } else {
      doMove(api, chooseDir(p, api, "strafe", toE));
    }
    return;
  }

  if (dist > 23.0) {
    api.moveTo(en.x, en.z);
    return;
  }

  if (dist < desired - 0.8) {
    doMove(api, chooseDir(p, api, "away", toE));
  } else if (dist > desired + 3.0) {
    doMove(api, chooseDir(p, api, "toward", toE));
  } else {
    doMove(api, chooseDir(p, api, "strafe", toE));
  }

  if (p.t - lastSay > 9) {
    lastSay = p.t;
    api.say(chargeReadyEst ? "eight arms, one beam" : "come closer, ape");
  }
}
