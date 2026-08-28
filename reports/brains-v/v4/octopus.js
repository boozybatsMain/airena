const CD = { smash: 1.3, charge: 4.033, jump: 2.8 };
const KITE_MIN = 12.5;
const KITE_MAX = 19.0;

let enSeen = { smash: -99, charge: -99, jump: -99 };
let strafeSign = 1;
let lastFlip = -99;
let lastSay = -99;

function pickDir(api, want, me) {
  const w = V.norm(want);
  if (w.x === 0 && w.z === 0) return { x: 0, z: 0 };
  const rC = Math.hypot(me.x, me.z);
  const toC = rC > 0.001 ? { x: -me.x / rC, z: -me.z / rC } : { x: 0, z: 0 };
  let best = w, bs = -1e9;
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8;
    const dir = { x: Math.sin(a), z: Math.cos(a) };
    let clear = 7;
    try { clear = api.ray(dir.x, dir.z, 7).dist; } catch (e) { clear = 7; }
    let s = 2.2 * V.dot(dir, w) + Math.min(clear, 7) / 7 * 0.9;
    if (clear < 1.8) s -= 4;
    else if (clear < 3.0) s -= 1;
    if (rC > 12) s += V.dot(dir, toC) * (rC - 12) * 0.28;
    if (s > bs) { bs = s; best = dir; }
  }
  return best;
}

function sideEscape(api, me, en, refDir) {
  let perp = V.perp(refDir);
  const rel = { x: me.x - en.x, z: me.z - en.z };
  let s = V.dot(perp, rel) >= 0 ? 1 : -1;
  let a = { x: perp.x * s, z: perp.z * s };
  let b = { x: -a.x, z: -a.z };
  let ca = 9, cb = 9;
  try { ca = api.ray(a.x, a.z, 9).dist; } catch (e) {}
  try { cb = api.ray(b.x, b.z, 9).dist; } catch (e) {}
  if (ca < 3.5 && cb > ca + 1.5) return b;
  return a;
}

function think(p, api) {
  const me = p.self, en = p.enemy, t = p.t;

  if (p.events) {
    for (const e of p.events) {
      if (e.type === 'enemyStarted' && e.skill && enSeen[e.skill] !== undefined) enSeen[e.skill] = t;
      else if (e.type === 'blocked') { if (t - lastFlip > 0.5) { strafeSign = -strafeSign; lastFlip = t; } }
    }
  }

  if (!en || !en.alive) { api.stop(); return; }

  const d = en.dist;
  const toEn = V.toward(me, en);
  const away = { x: -toEn.x, z: -toEn.z };
  const enCast = en.casting;
  const chargeCd = Math.max(0, CD.charge - (t - enSeen.charge));
  const smashCd = Math.max(0, CD.smash - (t - enSeen.smash));

  // ---------- facing ----------
  let fx = en.x, fz = en.z;
  if (me.casting && me.casting.skill === 'laser' && me.casting.telegraph) {
    const rem = Math.max(0, me.casting.remaining || 0);
    fx = en.x + (en.vx || 0) * rem * 0.85;
    fz = en.z + (en.vz || 0) * rem * 0.85;
  } else {
    fx = en.x + (en.vx || 0) * 0.45;
    fz = en.z + (en.vz || 0) * 0.45;
  }
  api.faceAt(fx, fz);

  if (me.stunned) return;

  let mv = null;
  let skill = null;
  const free = !me.busy && !me.airborne;

  // ---------- danger: charge ----------
  if (enCast && enCast.skill === 'charge') {
    const cdir = V.fromHeading(en.heading);
    const esc = sideEscape(api, me, en, cdir);
    mv = esc;
    const rel = { x: me.x - en.x, z: me.z - en.z };
    const along = V.dot(rel, cdir);
    const lat = Math.abs(V.dot(rel, V.perp(cdir)));
    const dashing = enCast.phase === 'dash';
    const willMiss = dashing && (along < 0.5 || along > 13.5 || lat > 3.4);
    const late = dashing || (enCast.remaining !== undefined && enCast.remaining < 0.17);
    if (free && late && !willMiss && d < 14.5 && api.ready('blink')) {
      skill = ['blink', esc.x, esc.z];
    }
  }
  // ---------- danger: smash ----------
  else if (enCast && enCast.skill === 'smash' && enCast.telegraph && d < 6.6) {
    mv = away;
    if (free && d < 6.0) {
      if (api.ready('blink')) {
        const esc = sideEscape(api, me, en, toEn);
        const dir = V.norm({ x: away.x * 0.75 + esc.x * 0.55, z: away.z * 0.75 + esc.z * 0.55 });
        skill = ['blink', dir.x, dir.z];
      } else if (api.ready('jump') && (enCast.remaining === undefined || enCast.remaining > 0.15)) {
        skill = ['jump'];
      }
    }
  }
  // ---------- danger: too close ----------
  else if (d < 5.2 && free) {
    mv = away;
    if (api.ready('blink')) {
      const esc = sideEscape(api, me, en, toEn);
      const dir = V.norm({ x: away.x * 0.8 + esc.x * 0.5, z: away.z * 0.8 + esc.z * 0.5 });
      skill = ['blink', dir.x, dir.z];
    }
  }

  // ---------- offense ----------
  if (!skill && free && api.ready('laser') && d < 21.5) {
    const rem = 0.72;
    const px = en.x + (en.vx || 0) * rem * 0.8;
    const pz = en.z + (en.vz || 0) * rem * 0.8;
    let clear = false;
    try { clear = en.visible && api.los(px, pz); } catch (e) { clear = en.visible; }
    if (clear) {
      const ang = Math.abs(V.angleTo(me.heading, V.toward(me, { x: px, z: pz })));
      const enemyPinned = en.stunned || en.airborne ||
        (enCast && (enCast.skill === 'jump' || (enCast.skill === 'charge' && enCast.phase === 'dash')));
      const safe = enemyPinned || d > 15.2 || (chargeCd > 0.95 && d > 9.9 && smashCd >= 0);
      if (safe && ang < 1.0) skill = ['laser'];
    }
  }

  // ---------- movement ----------
  if (!mv) {
    let want;
    if (!en.visible) {
      let path = null;
      try { path = api.pathTo(en.x, en.z); } catch (e) { path = null; }
      let dirw = toEn;
      if (path && path.points && path.points.length) {
        let wp = path.points[0];
        if (V.dist(me, wp) < 1.5 && path.points.length > 1) wp = path.points[1];
        dirw = V.toward(me, wp);
      }
      want = d < 9 ? V.add(V.scale(dirw, 0.45), V.scale(away, 0.85)) : dirw;
    } else if (d < KITE_MIN) {
      want = away;
    } else if (d > KITE_MAX) {
      want = toEn;
    } else {
      if (t - lastFlip > 2.2 && api.rand() < 0.35) { strafeSign = -strafeSign; lastFlip = t; }
      const perp = V.perp(toEn);
      const bias = d < 15.5 ? away : toEn;
      want = V.add(V.scale(perp, strafeSign), V.scale(bias, 0.45));
    }
    mv = pickDir(api, want, me);
  } else {
    mv = pickDir(api, mv, me);
  }

  api.move(mv.x, mv.z);

  if (skill) {
    if (skill.length === 3) api.use(skill[0], skill[1], skill[2]);
    else api.use(skill[0]);
  }

  if (t - lastSay > 7 && api.rand() < 0.3) {
    lastSay = t;
    api.say(d > 14 ? "eight arms, one beam" : "too close, ape");
  }
}
