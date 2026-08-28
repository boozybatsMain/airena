const DESIRED_BASE = 15;
let lastMove = { x: 0, z: 0 };
let lastEnemySkill = null;
let lastEnemySkillT = -99;
let lastBlinkT = -99;
let saidT = -99;

function segAabb(ax, az, bx, bz, minx, minz, maxx, maxz) {
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dz = bz - az;
  const ps = [-dx, dx, -dz, dz];
  const qs = [ax - minx, maxx - ax, az - minz, maxz - az];
  for (let i = 0; i < 4; i++) {
    const pp = ps[i], qq = qs[i];
    if (pp === 0) { if (qq < 0) return false; }
    else {
      const r = qq / pp;
      if (pp < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
      else { if (r < t0) return false; if (r < t1) t1 = r; }
    }
  }
  return true;
}

function blockedSeg(ax, az, bx, bz, obs) {
  for (const o of obs) {
    if (segAabb(ax, az, bx, bz, o.x - o.hx, o.z - o.hz, o.x + o.hx, o.z + o.hz)) return true;
  }
  return false;
}

function safeBlinkDir(me, base) {
  if (base.x === 0 && base.z === 0) base = { x: 1, z: 0 };
  const angles = [0, 0.7, -0.7, 1.4, -1.4, 2.2, -2.2, 3.14159];
  for (const a of angles) {
    const d = V.rot(base, a);
    const lx = me.x + d.x * 7.2, lz = me.z + d.z * 7.2;
    if (Math.abs(lx) < 18.4 && Math.abs(lz) < 18.4) return d;
  }
  return base;
}

function chooseMove(p, api, desired, chargeInfo) {
  const me = p.self, en = p.enemy, obs = p.arena.obstacles;
  const wantLos = api.cooldown('laser') < 0.55;
  let best = null;
  const N = 24;
  for (let i = 0; i < N; i++) {
    const a = i * 2 * Math.PI / N;
    const d = { x: Math.sin(a), z: Math.cos(a) };
    let clear = 4;
    try { clear = api.ray(d.x, d.z, 4).dist; } catch (e) { clear = 4; }
    if (clear < 1.45) continue;
    const step = Math.min(clear - 1.2, 2.6);
    const px = me.x + d.x * step, pz = me.z + d.z * step;
    const nd = Math.hypot(px - en.x, pz - en.z);
    let s = -Math.abs(nd - desired) * 3.0;
    s += Math.min(clear, 4) * 0.9;
    const m = Math.min(20 - Math.abs(px), 20 - Math.abs(pz));
    if (m < 5.5) s -= (5.5 - m) * 3.2;
    s += (d.x * lastMove.x + d.z * lastMove.z) * 2.2;
    const blk = blockedSeg(px, pz, en.x, en.z, obs);
    if (wantLos) s += blk ? -5 : 2.5;
    else s += blk ? 3.5 : 0;
    if (chargeInfo) {
      const rx = px - en.x, rz = pz - en.z;
      const lt = Math.abs(rx * chargeInfo.z - rz * chargeInfo.x);
      s += Math.min(lt, 7) * 1.6;
    }
    if (!best || s > best.s) best = { s, d };
  }
  return best ? best.d : { x: 0, z: 0 };
}

function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive) return;
  const obs = p.arena.obstacles;
  const dist = en.dist;

  let committed = false;
  for (const e of p.events) {
    if (e.type === 'enemyStarted') { lastEnemySkill = e.skill; lastEnemySkillT = p.t; }
    else if (e.type === 'enemyCommitted' && e.skill === 'charge') committed = true;
    else if (e.type === 'blinked') lastBlinkT = p.t;
  }

  const enc = en.casting;
  const dashing = !!(enc && enc.skill === 'charge' && enc.phase === 'dash');
  const chargeWind = !!(enc && enc.skill === 'charge' && enc.phase === 'windup');
  const smashWind = !!(enc && enc.skill === 'smash' && enc.telegraph);
  const enRecover = !!(enc && enc.phase === 'recover');

  const cdir = (en.speed > 2.0)
    ? { x: en.vx / en.speed, z: en.vz / en.speed }
    : V.fromHeading(en.heading);
  const rel = { x: me.x - en.x, z: me.z - en.z };
  const fwd = rel.x * cdir.x + rel.z * cdir.z;
  const lat = rel.x * cdir.z - rel.z * cdir.x;
  const chargeThreat = (dashing || committed) && Math.abs(lat) < 3.5 && fwd > -2 && fwd < 15;

  const castingLaser = !!(me.casting && me.casting.skill === 'laser' && me.casting.telegraph);
  const tFire = castingLaser ? Math.max(0, me.casting.remaining) : 0.667;
  const lead = Math.min(tFire, 0.8);
  const pred = { x: en.x + en.vx * lead, z: en.z + en.vz * lead };

  if (p.t - saidT > 9) { saidT = p.t; api.say("eight arms, one beam"); }

  // ---- 1. dodge a committed charge ----
  if (chargeThreat) {
    if (api.ready('blink') && !me.busy && !me.airborne && !me.stunned) {
      const s = lat >= 0 ? 1 : -1;
      let d = { x: cdir.z * s, z: -cdir.x * s };
      d = safeBlinkDir(me, d);
      api.use('blink', d.x, d.z);
      api.move(d.x, d.z);
      api.faceAt(en.x, en.z);
      lastMove = d;
      return;
    }
    const s = lat >= 0 ? 1 : -1;
    const d = { x: cdir.z * s, z: -cdir.x * s };
    api.move(d.x, d.z);
    api.faceAt(pred.x, pred.z);
    lastMove = d;
    return;
  }

  // ---- 2. dodge an incoming smash ----
  if (smashWind && dist < 6.8 && !me.airborne && !me.stunned) {
    const away = V.away(me, en);
    if (!me.busy && api.ready('jump')) {
      api.use('jump');
      api.move(away.x, away.z);
      api.faceAt(en.x, en.z);
      lastMove = away;
      return;
    }
    if (!me.busy && api.ready('blink')) {
      const d = safeBlinkDir(me, away);
      api.use('blink', d.x, d.z);
      api.move(d.x, d.z);
      api.faceAt(en.x, en.z);
      lastMove = d;
      return;
    }
  }

  // ---- 3. panic blink when they are on top of us ----
  if (dist < 3.5 && !me.busy && !me.airborne && !me.stunned && api.ready('blink')) {
    const d = safeBlinkDir(me, V.away(me, en));
    api.use('blink', d.x, d.z);
    api.move(d.x, d.z);
    api.faceAt(en.x, en.z);
    lastMove = d;
    return;
  }

  // ---- 4. laser ----
  const minFire = (enRecover || en.stunned || en.airborne) ? 3.4 : 6.3;
  const losPred = en.visible && !blockedSeg(me.x, me.z, pred.x, pred.z, obs);
  if (api.ready('laser') && !me.busy && !me.airborne && !me.stunned &&
      dist <= 21.5 && dist >= minFire && losPred &&
      (!chargeWind || dist > 15)) {
    api.use('laser');
  }

  // ---- 5. movement ----
  let desired = DESIRED_BASE;
  const myFrac = me.hp / me.maxHp, enFrac = en.hp / en.maxHp;
  if (p.t > 27 && myFrac > enFrac + 0.02) desired = 18;
  if (dist > 23) desired = 16;
  if (enRecover || en.stunned) desired = Math.max(9, desired - 5);
  if (castingLaser) desired = Math.max(desired, 14);

  let moved = false;
  if (!en.visible && dist > 9 && api.cooldown('laser') < 0.8) {
    const path = api.pathTo(en.x, en.z);
    if (path && path.points && path.points.length) {
      const wp = path.points[0];
      const d = V.norm({ x: wp.x - me.x, z: wp.z - me.z });
      if (d.x !== 0 || d.z !== 0) {
        api.move(d.x, d.z);
        lastMove = d;
        moved = true;
      }
    }
  }

  if (!moved) {
    const d = chooseMove(p, api, desired, (chargeWind || dashing) ? cdir : null);
    api.move(d.x, d.z);
    lastMove = { x: lastMove.x * 0.35 + d.x * 0.65, z: lastMove.z * 0.35 + d.z * 0.65 };
  }

  api.faceAt(pred.x, pred.z);
}
