function segBlocked(ax, az, bx, bz, obs) {
  for (let k = 0; k < obs.length; k++) {
    const o = obs[k];
    const dx = bx - ax, dz = bz - az;
    let t0 = 0, t1 = 1, ok = true;
    if (Math.abs(dx) < 1e-9) {
      if (ax < o.x - o.hx || ax > o.x + o.hx) ok = false;
    } else {
      let ta = (o.x - o.hx - ax) / dx, tb = (o.x + o.hx - ax) / dx;
      if (ta > tb) { const s = ta; ta = tb; tb = s; }
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
      if (t0 > t1) ok = false;
    }
    if (ok) {
      if (Math.abs(dz) < 1e-9) {
        if (az < o.z - o.hz || az > o.z + o.hz) ok = false;
      } else {
        let ta = (o.z - o.hz - az) / dz, tb = (o.z + o.hz - az) / dz;
        if (ta > tb) { const s = ta; ta = tb; tb = s; }
        if (ta > t0) t0 = ta;
        if (tb < t1) t1 = tb;
        if (t0 > t1) ok = false;
      }
    }
    if (ok) return true;
  }
  return false;
}

let lastSkillT = { charge: -99, smash: -99, jump: -99 };
let lastFireT = -99;
let prevDir = { x: 0, z: 0 };
let sayT = -99;

function pickDir(p, api, mode, wantLos, desired) {
  const me = p.self, e = p.enemy;
  let best = null;
  for (let i = 0; i < 24; i++) {
    const a = i * Math.PI / 12;
    const dir = { x: Math.sin(a), z: Math.cos(a) };
    const r = api.ray(dir.x, dir.z, 8);
    const clear = Math.min(r.dist, 8);
    if (clear < 1.5) continue;
    const step = Math.min(clear - 1.0, 4.0);
    const pt = { x: me.x + dir.x * step, z: me.z + dir.z * step };
    const de = Math.hypot(pt.x - e.x, pt.z - e.z);
    let s = 0;
    if (mode === 'retreat') s += de * 2.2;
    else if (mode === 'approach') s -= de * 1.6;
    else s -= Math.abs(de - desired) * 1.2;
    s += clear * 0.8;
    const wm = Math.min(20 - Math.abs(pt.x), 20 - Math.abs(pt.z));
    if (wm < 6) s -= (6 - wm) * 2.6;
    const blocked = segBlocked(pt.x, pt.z, e.x, e.z, p.arena.obstacles);
    if (wantLos) { if (blocked) s -= 7; }
    else { if (blocked) s += 4; }
    s += 2.2 * (dir.x * prevDir.x + dir.z * prevDir.z);
    if (!best || s > best.s) best = { s, dir };
  }
  if (!best) return { x: -(e.x - me.x), z: -(e.z - me.z) };
  return best.dir;
}

function bestOf(api, cands, maxd) {
  let best = null;
  for (const c of cands) {
    const n = V.norm(c);
    if (V.len(n) < 0.1) continue;
    const r = api.ray(n.x, n.z, maxd);
    const s = Math.min(r.dist, maxd);
    if (!best || s > best.s) best = { s, dir: n };
  }
  return best ? best.dir : { x: 0, z: 1 };
}

function think(p, api) {
  const me = p.self, e = p.enemy;
  if (!me.alive) return;

  for (const ev of p.events) {
    if (ev.type === 'enemyStarted' && lastSkillT[ev.skill] !== undefined) lastSkillT[ev.skill] = p.t;
    if (ev.type === 'dealt' && ev.skill === 'laser') lastFireT = p.t;
  }

  const d = e.dist;
  const ec = e.casting;
  const chargeReadyAt = lastSkillT.charge + 4.033;
  const chargeOnCd = p.t < chargeReadyAt - 0.2;

  const lead = (t) => ({ x: e.x + e.vx * t, z: e.z + e.vz * t });

  // ---------- threat assessment ----------
  let chargeDanger = false, chargeImminent = false, dodgeDir = null;
  if (ec && ec.skill === 'charge') {
    let cd = (ec.phase === 'dash') ? V.norm({ x: e.vx, z: e.vz }) : V.fromHeading(e.heading);
    if (V.len(cd) < 0.1) cd = V.fromHeading(e.heading);
    const rel = { x: me.x - e.x, z: me.z - e.z };
    const along = V.dot(rel, cd);
    const perpV = { x: rel.x - cd.x * along, z: rel.z - cd.z * along };
    const perp = V.len(perpV);
    const maxTravel = (ec.phase === 'dash') ? 15 * (ec.remaining || 0.3) + 1.5 : 13.5;
    if (along > -1.5 && along < maxTravel + 2.5 && perp < 3.6) chargeDanger = true;
    chargeImminent = chargeDanger && (ec.phase === 'dash' || (ec.remaining || 1) < 0.2);
    dodgeDir = perp > 0.5 ? V.norm(perpV) : V.perp(cd);
  }
  const smashDanger = !!(ec && ec.skill === 'smash' && ec.telegraph && d < 7.2);

  // ---------- facing ----------
  let faceP;
  if (me.casting && me.casting.skill === 'laser' && me.casting.telegraph) {
    const r = Math.max(0, Math.min(0.75, me.casting.remaining || 0.3));
    faceP = lead(r);
  } else {
    faceP = lead(0.15);
  }
  api.faceAt(faceP.x, faceP.z);

  // ---------- movement mode ----------
  const desired = chargeOnCd ? 11 : 16.5;
  let mode = 'hold';
  if (chargeDanger || d < desired - 2) mode = 'retreat';
  else if (d > desired + 3.5) mode = 'approach';
  const laserCd = api.cooldown('laser');
  const wantLos = laserCd < 0.7 && !chargeDanger;

  let mdir;
  if (chargeDanger && dodgeDir) {
    const away = { x: me.x - e.x, z: me.z - e.z };
    const c1 = { x: dodgeDir.x * 2 + away.x * 0.12, z: dodgeDir.z * 2 + away.z * 0.12 };
    const c2 = { x: -dodgeDir.x * 2 + away.x * 0.12, z: -dodgeDir.z * 2 + away.z * 0.12 };
    mdir = bestOf(api, [c1, c2], 6);
  } else {
    mdir = pickDir(p, api, mode, wantLos, desired);
  }
  prevDir = mdir;
  api.move(mdir.x, mdir.z);

  if (me.busy || me.stunned || me.airborne) return;

  // ---------- skills ----------
  const awayV = { x: me.x - e.x, z: me.z - e.z };

  // 1. smash coming: hop over it
  if (smashDanger && d < 6.4) {
    if (api.ready('jump') && !chargeDanger) { api.use('jump'); return; }
    if (api.ready('blink')) {
      const dir = bestOf(api, [
        awayV,
        { x: awayV.x + V.perp(awayV).x, z: awayV.z + V.perp(awayV).z },
        { x: awayV.x - V.perp(awayV).x, z: awayV.z - V.perp(awayV).z }
      ], 7.5);
      api.use('blink', dir.x, dir.z);
      return;
    }
  }

  // 2. charge inbound: sidestep with the blink
  if (chargeImminent && api.ready('blink') && !me.invulnerable) {
    const c1 = { x: dodgeDir.x * 3 + awayV.x * 0.15, z: dodgeDir.z * 3 + awayV.z * 0.15 };
    const c2 = { x: -dodgeDir.x * 3 + awayV.x * 0.15, z: -dodgeDir.z * 3 + awayV.z * 0.15 };
    const dir = bestOf(api, [c1, c2], 7.5);
    api.use('blink', dir.x, dir.z);
    return;
  }

  // 3. too close: get out
  if (d < 5.6 && api.ready('blink') && !me.invulnerable) {
    const per = V.perp(awayV);
    const dir = bestOf(api, [
      awayV,
      { x: awayV.x + per.x, z: awayV.z + per.z },
      { x: awayV.x - per.x, z: awayV.z - per.z }
    ], 7.5);
    api.use('blink', dir.x, dir.z);
    return;
  }

  // 4. shoot
  if (api.ready('laser') && e.visible && d <= 22 && !smashDanger && !chargeDanger && !e.airborne) {
    const safeSmash = d > 9.0 || e.stunned;
    const safeCharge = chargeOnCd || d > 14.5 || (e.busy && ec && ec.skill !== 'charge');
    const starving = (p.t - lastFireT) > 5.0 && d > 7.0;
    if ((safeSmash && safeCharge) || starving) {
      lastFireT = p.t;
      api.use('laser');
      if (p.t - sayT > 9) { sayT = p.t; api.say("eight arms, one beam"); }
      return;
    }
  }
}
