const ECD = { charge: 4.0, smash: 1.3, jump: 2.8 };
let enemyUse = {};
let strafe = 1;
let lastFlip = 0;
let lastSay = -9;

function clampN(v, a, b) { return v < a ? a : (v > b ? b : v); }

function predictPos(E, t) {
  const k = 0.85;
  return {
    x: clampN(E.x + E.vx * t * k, -19.4, 19.4),
    z: clampN(E.z + E.vz * t * k, -19.4, 19.4)
  };
}

function enemyReady(skill, now) {
  const last = enemyUse[skill];
  if (last === undefined) return true;
  return (now - last) >= ECD[skill];
}

function pickDir(p, api, want) {
  let best = null, bestS = -1e9;
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8;
    const d = { x: Math.sin(a), z: Math.cos(a) };
    let clear = 5;
    try { clear = api.ray(d.x, d.z, 5).dist; } catch (e) { clear = 5; }
    if (clear < 1.25) continue;
    let s = V.dot(d, want) * 3.2;
    s += Math.min(clear, 4.5) * 0.55;
    const px = p.self.x + d.x * 3.2, pz = p.self.z + d.z * 3.2;
    const edge = Math.min(20 - Math.abs(px), 20 - Math.abs(pz));
    s += Math.min(edge, 7) * 0.3;
    if (s > bestS) { bestS = s; best = d; }
  }
  return best;
}

function think(p, api) {
  const S = p.self, E = p.enemy;
  if (!S.alive) return;
  const now = p.t;

  for (const ev of p.events) {
    if (ev.type === 'enemyStarted' && ev.skill) enemyUse[ev.skill] = now;
    if (ev.type === 'blocked') { strafe = -strafe; lastFlip = now; }
    if (ev.type === 'damaged' && ev.skill === 'smash') { strafe = -strafe; lastFlip = now; }
  }
  if (now - lastFlip > 3.0) { strafe = api.rand() < 0.5 ? -1 : 1; lastFlip = now; }

  if (!E || !E.alive) { api.stop(); return; }

  const me = { x: S.x, z: S.z };
  const him = { x: E.x, z: E.z };
  const dist = E.dist;
  const away = V.toward(him, me);
  const toE = V.toward(me, him);

  const eCast = E.casting;
  const charging = !!(eCast && eCast.skill === 'charge');
  const chargeWind = charging && eCast.phase === 'windup';
  const chargeDash = charging && (eCast.phase === 'dash' || !eCast.telegraph);
  const smashWind = !!(eCast && eCast.skill === 'smash' && eCast.telegraph);

  // ---- facing / aim ----
  let aimT = 0.18;
  if (S.casting && S.casting.skill === 'laser' && S.casting.telegraph) {
    aimT = Math.max(0.02, S.casting.remaining || 0.3);
  }
  const aim = predictPos(E, aimT);
  api.faceAt(aim.x, aim.z);

  // ---- charge path geometry ----
  const eDir = V.fromHeading(E.heading);
  const rel = { x: me.x - him.x, z: me.z - him.z };
  const fwd = V.dot(rel, eDir);
  const cross = rel.x * eDir.z - rel.z * eDir.x;
  const lat = Math.abs(cross);
  const inPath = fwd > -1.5 && fwd < 13.5 && lat < 3.2;

  const sidePerp = V.perp(eDir);
  const escSign = (cross >= 0) ? 1 : -1;
  const escDir = { x: sidePerp.x * escSign, z: sidePerp.z * escSign };

  // ---- defensive skills ----
  let usedSkill = false;

  if (!S.busy && !S.stunned && !S.airborne) {
    if (chargeDash && inPath && !S.invulnerable && api.ready('blink')) {
      const bd = V.norm({ x: escDir.x * 1.0 + away.x * 0.45, z: escDir.z * 1.0 + away.z * 0.45 });
      api.use('blink', bd.x, bd.z);
      usedSkill = true;
    } else if (smashWind && dist < 6.2 && !S.invulnerable) {
      const rem = (eCast && eCast.remaining !== undefined) ? eCast.remaining : 0.2;
      if (api.ready('blink')) {
        const bd = V.norm({ x: away.x + escDir.x * 0.6, z: away.z + escDir.z * 0.6 });
        api.use('blink', bd.x, bd.z);
        usedSkill = true;
      } else if (api.ready('jump') && rem > 0.11) {
        api.use('jump');
        usedSkill = true;
      }
    } else if (dist < 3.0 && !S.invulnerable && api.ready('blink') && !chargeWind) {
      const bd = V.norm({ x: away.x + escDir.x * 0.4, z: away.z + escDir.z * 0.4 });
      api.use('blink', bd.x, bd.z);
      usedSkill = true;
    }
  }

  // ---- offense: laser ----
  if (!usedSkill && !S.busy && !S.stunned && !S.airborne && api.ready('laser')) {
    const chargeUp = enemyReady('charge', now);
    const busyNotCharge = E.busy && !charging;
    const safeClose = !chargeUp || busyNotCharge || E.stunned;
    const okDist = dist <= 22.5 && dist >= 1.5;
    const okRange = dist >= 8.5 || safeClose;
    if (E.visible && okDist && okRange && !chargeDash && !E.invulnerable && !(smashWind && dist < 6.5)) {
      api.use('laser');
      usedSkill = true;
    }
  }

  // ---- movement ----
  let want;
  if (chargeDash && inPath) {
    want = V.norm({ x: escDir.x * 1.6 + away.x * 0.5, z: escDir.z * 1.6 + away.z * 0.5 });
  } else if (chargeWind) {
    const perpMe = V.perp(toE);
    const sgn = strafe;
    want = V.norm({ x: perpMe.x * sgn * 1.4 + away.x * 0.7, z: perpMe.z * sgn * 1.4 + away.z * 0.7 });
  } else if (smashWind && dist < 7) {
    const perpMe = V.perp(toE);
    want = V.norm({ x: away.x * 1.2 + perpMe.x * strafe * 0.8, z: away.z * 1.2 + perpMe.z * strafe * 0.8 });
  } else if (!E.visible && dist > 7.5) {
    want = null;
  } else {
    const chargeUp = enemyReady('charge', now);
    let desired = chargeUp ? 12.0 : 8.5;
    if (S.casting && S.casting.skill === 'laser') desired += 1.0;
    let wAway = clampN((desired - dist) / 4.5, -1.0, 1.35);
    const perpMe = V.perp(toE);
    want = {
      x: away.x * wAway + perpMe.x * strafe * 0.85,
      z: away.z * wAway + perpMe.z * strafe * 0.85
    };
    const rr = Math.sqrt(me.x * me.x + me.z * me.z);
    if (rr > 14) {
      const inward = V.norm({ x: -me.x, z: -me.z });
      const w = (rr - 14) / 6;
      want.x += inward.x * w * 1.3;
      want.z += inward.z * w * 1.3;
    }
    want = V.norm(want);
  }

  if (want === null) {
    api.moveTo(him.x, him.z);
  } else {
    const d = pickDir(p, api, want);
    if (d) api.move(d.x, d.z);
    else api.move(want.x, want.z);
  }

  if (now - lastSay > 9) {
    lastSay = now;
    api.say(dist > 10 ? "eight arms, one beam" : "too close, ape");
  }
}
