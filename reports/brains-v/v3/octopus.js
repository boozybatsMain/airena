const CDS = { smash: 1.3, charge: 4.033, jump: 2.8 };
const LASER_MAX = 22.0;
let prevDir = { x: 0, z: 1 };
let lastSkill = { smash: -99, charge: -99, jump: -99 };
let commit = null;
let lastSay = -99;

function estCd(name, t) {
  return Math.max(0, lastSkill[name] + CDS[name] - t);
}

function safeBlinkDir(p, base) {
  const me = p.self;
  const cands = [0, 0.7, -0.7, 1.4, -1.4, 2.4, -2.4, Math.PI];
  for (const a of cands) {
    const d = V.rot(base, a);
    const bx = me.x + d.x * 7.2, bz = me.z + d.z * 7.2;
    if (Math.abs(bx) < 18.2 && Math.abs(bz) < 18.2) return d;
  }
  return base;
}

function pickDir(p, api, target, bias) {
  const me = p.self, en = p.enemy;
  let best = null, bs = -1e9;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const d = { x: Math.sin(a), z: Math.cos(a) };
    let free = 5;
    const r = api.ray(d.x, d.z, 5);
    if (r && r.hit) free = r.dist;
    if (free < 1.5) continue;
    const step = Math.min(4.2, free - 1.2);
    const fx = me.x + d.x * step, fz = me.z + d.z * step;
    const nd = Math.hypot(fx - en.x, fz - en.z);
    let s = -Math.abs(nd - target);
    const wc = 20 - Math.max(Math.abs(fx), Math.abs(fz));
    if (wc < 6) s -= (6 - wc) * 1.7;
    s += V.dot(d, prevDir) * 1.1;
    s += free * 0.14;
    if (bias) s += V.dot(d, bias) * 2.2;
    if (s > bs) { bs = s; best = d; }
  }
  return best;
}

function think(p, api) {
  const me = p.self, en = p.enemy, t = p.t;
  if (!me || !me.alive || !en) return;

  for (const e of p.events) {
    if (e.type === 'enemyStarted' && lastSkill[e.skill] !== undefined) lastSkill[e.skill] = t;
    else if (e.type === 'enemyCommitted' && e.skill === 'charge') {
      commit = { t: t, dir: V.fromHeading(en.heading) };
    }
  }
  if (commit && t - commit.t > 1.1) commit = null;

  if (me.airborne || me.stunned) {
    api.faceAt(en.x, en.z);
    return;
  }

  const dist = en.dist;
  const away = V.away(me, en);
  const enCast = en.casting;
  const charging = enCast && enCast.skill === 'charge';
  const chargeDash = charging && enCast.phase === 'dash';
  const chargeWind = charging && enCast.phase === 'windup';
  const smashTel = enCast && enCast.skill === 'smash' && enCast.telegraph;
  const casting = me.casting && me.casting.skill === 'laser';

  let cdir = null;
  if (chargeDash) cdir = V.fromHeading(en.heading);
  else if (commit && !charging) cdir = commit.dir;

  let evadeDir = null, inLine = false;
  if (cdir) {
    const rel = { x: me.x - en.x, z: me.z - en.z };
    const along = V.dot(rel, cdir);
    const pp = V.perp(cdir);
    const l = V.dot(rel, pp);
    inLine = along > -2.5 && along < 15 && Math.abs(l) < 3.8;
    const s = l >= 0 ? 1 : -1;
    let cand = V.norm({ x: pp.x * s + away.x * 0.45, z: pp.z * s + away.z * 0.45 });
    const bx = me.x + cand.x * 7.2, bz = me.z + cand.z * 7.2;
    if (Math.abs(bx) > 18.2 || Math.abs(bz) > 18.2) {
      const alt = V.norm({ x: -pp.x * s + away.x * 0.45, z: -pp.z * s + away.z * 0.45 });
      const ax = me.x + alt.x * 7.2, az = me.z + alt.z * 7.2;
      if (Math.abs(ax) <= 18.2 && Math.abs(az) <= 18.2) cand = alt;
    }
    evadeDir = cand;
  }

  let mv = null, skill = null;
  let faceX = en.x, faceZ = en.z;

  if (inLine && evadeDir) {
    if (!me.busy && api.ready('blink')) skill = ['blink', evadeDir.x, evadeDir.z];
    mv = evadeDir;
  } else if (smashTel && dist < 6.6) {
    if (!me.busy && api.ready('jump')) { skill = ['jump']; mv = away; }
    else if (!me.busy && api.ready('blink')) {
      const b = safeBlinkDir(p, away);
      skill = ['blink', b.x, b.z]; mv = b;
    } else mv = away;
  } else {
    const chCd = estCd('charge', t);
    const smCd = estCd('smash', t);
    const myFrac = me.hp / me.maxHp, enFrac = en.hp / en.maxHp;
    const stalling = p.timeLeft < 7 && myFrac > enFrac + 0.04;

    let safe = false;
    if (dist > 14.8) safe = true;
    else if (dist > 9.4 && chCd > 0.85) safe = true;
    else if ((en.stunned || (enCast && enCast.phase === 'recover')) && dist > 4.5 && chCd > 0.4) safe = true;
    if (charging || commit) safe = false;
    if (dist < 6.6 && smCd < 0.5) safe = false;
    if (stalling && dist < 15) safe = false;

    if (!me.busy && safe && api.ready('laser') && en.visible && dist < LASER_MAX && dist > 2.5) {
      const k = chargeDash ? 0.75 : 0.35;
      const ax = en.x + en.vx * 0.667 * k, az = en.z + en.vz * 0.667 * k;
      if (api.los(ax, az)) { faceX = ax; faceZ = az; }
      skill = ['laser'];
    } else if (!me.busy && dist < 6.3 && api.ready('blink') && !charging) {
      const b = safeBlinkDir(p, away);
      skill = ['blink', b.x, b.z];
      mv = b;
    }
  }

  if (casting) {
    const rem = Math.max(0, me.casting.remaining || 0);
    const px = en.x + en.vx * rem * 0.5, pz = en.z + en.vz * rem * 0.5;
    if (api.los(px, pz)) { faceX = px; faceZ = pz; } else { faceX = en.x; faceZ = en.z; }
  }

  if (!mv) {
    let target = 14.5;
    if (chargeWind) target = 20;
    else if (casting) target = 16.5;
    else if (api.cooldown('laser') > 0.9) target = 16.0;
    if (p.timeLeft < 7 && me.hp / me.maxHp > en.hp / en.maxHp + 0.04) target = 19;
    const bias = dist < 8.5 ? away : null;
    const d = pickDir(p, api, target, bias);
    mv = d || away;
  }

  const n = V.norm(mv);
  if (n.x !== 0 || n.z !== 0) prevDir = n;

  api.move(mv.x, mv.z);
  api.faceAt(faceX, faceZ);
  if (skill) api.use(skill[0], skill[1], skill[2]);

  if (t - lastSay > 9) {
    lastSay = t;
    api.say(dist > 12 ? "eight arms, one beam" : "too close, ape");
  }
}
