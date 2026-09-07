const KITE = 13.0;
const LMIN = 8.6;
const LMAX = 22.0;

let eT = { smash: -99, charge: -99, jump: -99 };
let chargeLock = null;
let side = 1;
let sideT = -99;
let lastSay = -99;

function blockedPoint(p, x, z, m) {
  if (Math.abs(x) > p.arena.half - m || Math.abs(z) > p.arena.half - m) return true;
  for (const o of p.arena.obstacles) {
    if (Math.abs(x - o.x) < o.hx + m && Math.abs(z - o.z) < o.hz + m) return true;
  }
  return false;
}

function bestDir(p, api, base, wEnemy, wTurn, span) {
  const b = V.norm(base);
  if (b.x === 0 && b.z === 0) return { x: 0, z: 1 };
  let best = null, bs = -1e9;
  const N = 9;
  for (let i = -N; i <= N; i++) {
    const a = (i / N) * span;
    const d = V.rot(b, a);
    const r = api.ray(d.x, d.z, 7);
    const clr = Math.min(r.dist, 7);
    if (clr < 1.7) continue;
    const step = Math.min(clr - 0.6, 4);
    const fx = p.self.x + d.x * step, fz = p.self.z + d.z * step;
    const de = Math.hypot(fx - p.enemy.x, fz - p.enemy.z);
    const wall = p.arena.half - Math.max(Math.abs(fx), Math.abs(fz));
    const s = clr * 0.8 + de * wEnemy + Math.min(wall, 7) * 0.9 - Math.abs(a) * wTurn;
    if (s > bs) { bs = s; best = d; }
  }
  return best || b;
}

function blinkDir(p, api, base) {
  const b = V.norm(base);
  let best = null, bs = -1e9;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const d = V.fromHeading(a);
    const al = V.dot(d, b);
    if (al < 0.15) continue;
    const lx = p.self.x + d.x * 7.2, lz = p.self.z + d.z * 7.2;
    if (blockedPoint(p, lx, lz, 1.5)) continue;
    const de = Math.hypot(lx - p.enemy.x, lz - p.enemy.z);
    const wall = p.arena.half - Math.max(Math.abs(lx), Math.abs(lz));
    const s = de * 1.0 + Math.min(wall, 7) * 0.9 + al * 2.5;
    if (s > bs) { bs = s; best = d; }
  }
  return best;
}

function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en) return;

  for (const e of p.events) {
    if (e.type === 'enemyStarted' && eT[e.skill] !== undefined) eT[e.skill] = p.t;
    if (e.type === 'enemyCommitted' && e.skill === 'charge') {
      chargeLock = { d: V.fromHeading(en.heading), t: p.t };
    }
    if (e.type === 'blocked') { side = -side; sideT = p.t; }
    if (e.type === 'chargeStopped') chargeLock = null;
  }
  if (chargeLock && p.t - chargeLock.t > 1.15) chargeLock = null;

  const dist = en.dist;
  const cast = me.casting;
  const lead = (cast && cast.skill === 'laser' && cast.telegraph)
    ? Math.min(Math.max(cast.remaining, 0), 0.72) : 0.6;
  const aim = { x: en.x + en.vx * lead, z: en.z + en.vz * lead };
  api.faceAt(aim.x, aim.z);

  if (me.airborne || me.stunned) return;

  const enCast = en.casting;
  const chg = enCast && enCast.skill === 'charge';
  const dashing = chg && enCast.phase === 'dash';
  if (dashing && !chargeLock) chargeLock = { d: V.fromHeading(en.heading), t: p.t };
  const smashTele = enCast && enCast.skill === 'smash' && enCast.telegraph;

  const away = V.toward(en, me);
  const toEn = V.toward(me, en);

  // ---- charge evasion ----
  if (chargeLock) {
    const dir = chargeLock.d;
    const rel = { x: me.x - en.x, z: me.z - en.z };
    const along = V.dot(rel, dir);
    const perpL = { x: dir.z, z: -dir.x };
    const lat = V.dot(rel, perpL);
    if (along > -1.5 && along < 14 && Math.abs(lat) < 3.4) {
      const s = lat >= 0 ? 1 : -1;
      const dodge = V.norm({ x: perpL.x * s + away.x * 0.35, z: perpL.z * s + away.z * 0.35 });
      const safeDir = bestDir(p, api, dodge, 0.35, 0.9, 1.0);
      api.move(safeDir.x, safeDir.z);
      if (!me.busy && Math.abs(lat) < 2.7 && dist < 15 && api.ready('blink')) {
        const bd = blinkDir(p, api, dodge) || dodge;
        api.use('blink', bd.x, bd.z);
      }
      return;
    }
  }
  if (chg && enCast.phase === 'windup') {
    const dir = V.fromHeading(en.heading);
    const perpL = { x: dir.z, z: -dir.x };
    const rel = { x: me.x - en.x, z: me.z - en.z };
    const s = V.dot(rel, perpL) >= 0 ? 1 : -1;
    const dodge = V.norm({ x: perpL.x * s + away.x * 0.5, z: perpL.z * s + away.z * 0.5 });
    const safeDir = bestDir(p, api, dodge, 0.4, 0.9, 1.1);
    api.move(safeDir.x, safeDir.z);
    return;
  }

  // ---- smash evasion ----
  if (smashTele && dist < 6.8) {
    const esc = bestDir(p, api, away, 1.1, 1.0, 2.0);
    api.move(esc.x, esc.z);
    if (!me.busy) {
      if (enCast.remaining > 0.13 && api.ready('jump')) {
        api.use('jump');
      } else if (api.ready('blink')) {
        const bd = blinkDir(p, api, away) || away;
        api.use('blink', bd.x, bd.z);
      }
    }
    return;
  }

  // ---- opportunistic escape blink to make firing room ----
  let usedSkill = false;
  if (!me.busy && dist < 7.4 && api.ready('blink') && !smashTele && !chg) {
    const bd = blinkDir(p, api, away);
    if (bd) {
      api.use('blink', bd.x, bd.z);
      usedSkill = true;
      const esc = bestDir(p, api, away, 1.1, 0.9, 2.0);
      api.move(esc.x, esc.z);
      return;
    }
  }

  // ---- laser ----
  if (!usedSkill && !me.busy && api.ready('laser') && en.visible && !smashTele && !chg && !chargeLock) {
    const enemyLocked = enCast && enCast.skill === 'jump' && enCast.remaining > 0.55;
    const inRange = dist > LMIN && dist < LMAX;
    const punish = enemyLocked && dist > 4.0 && dist < LMAX;
    if ((inRange || punish) && api.los(aim.x, aim.z)) {
      const err = Math.abs(V.angleTo(me.heading, V.toward(me, aim)));
      if (err < 1.0) {
        api.use('laser');
        usedSkill = true;
        if (p.t - lastSay > 6) { lastSay = p.t; api.say("ink and light"); }
      }
    }
  }

  // ---- positioning ----
  let mv = null;
  if (!en.visible) {
    if (dist > 11.5) {
      const pa = api.pathTo(en.x, en.z);
      if (pa && pa.points && pa.points.length) {
        const w = pa.points[0];
        api.moveTo(en.x, en.z);
        mv = null;
      } else {
        mv = bestDir(p, api, toEn, -0.4, 0.8, 1.4);
      }
      if (mv) api.move(mv.x, mv.z);
      return;
    } else {
      const perp = { x: toEn.z * side, z: -toEn.x * side };
      mv = bestDir(p, api, V.norm({ x: perp.x + away.x * 0.7, z: perp.z + away.z * 0.7 }), 0.7, 0.9, 1.5);
      api.move(mv.x, mv.z);
      return;
    }
  }

  const want = api.cooldown('laser') > 1.2 ? KITE + 1.5 : KITE;
  if (dist < want - 1.2) {
    mv = bestDir(p, api, away, 1.1, 0.9, 2.1);
    api.move(mv.x, mv.z);
  } else if (dist > want + 3.5) {
    const tx = en.x + away.x * want, tz = en.z + away.z * want;
    if (!blockedPoint(p, tx, tz, 1.2)) {
      api.moveTo(tx, tz);
    } else {
      mv = bestDir(p, api, toEn, -0.5, 0.8, 1.3);
      api.move(mv.x, mv.z);
    }
  } else {
    if (p.t - sideT > 1.4 + api.rand() * 1.2) { side = api.rand() < 0.5 ? -1 : 1; sideT = p.t; }
    const perp = { x: toEn.z * side, z: -toEn.x * side };
    let base = perp;
    const edge = p.arena.half - Math.max(Math.abs(me.x), Math.abs(me.z));
    if (edge < 5) {
      const toC = V.norm({ x: -me.x, z: -me.z });
      base = V.norm({ x: perp.x + toC.x * 1.1, z: perp.z + toC.z * 1.1 });
    }
    mv = bestDir(p, api, base, 0.45, 1.0, 1.6);
    api.move(mv.x, mv.z);
  }
}
