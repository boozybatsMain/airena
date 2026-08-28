const CD_E = { smash: 1.3, charge: 4.033, jump: 2.8 };
const TWO_PI = Math.PI * 2;
let eStart = {};
let lastDir = { x: 0, z: 1 };
let hits = 0, misses = 0;
let saidAt = -9;

function clampA(v) { return v < -19.2 ? -19.2 : (v > 19.2 ? 19.2 : v); }

function segHitsBox(ax, az, bx, bz, minx, minz, maxx, maxz) {
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dz = bz - az;
  if (Math.abs(dx) < 1e-9) { if (ax < minx || ax > maxx) return false; }
  else {
    let ta = (minx - ax) / dx, tb = (maxx - ax) / dx;
    if (ta > tb) { const t = ta; ta = tb; tb = t; }
    if (ta > t0) t0 = ta; if (tb < t1) t1 = tb;
    if (t0 > t1) return false;
  }
  if (Math.abs(dz) < 1e-9) { if (az < minz || az > maxz) return false; }
  else {
    let ta = (minz - az) / dz, tb = (maxz - az) / dz;
    if (ta > tb) { const t = ta; ta = tb; tb = t; }
    if (ta > t0) t0 = ta; if (tb < t1) t1 = tb;
    if (t0 > t1) return false;
  }
  return true;
}

function blockedLine(ax, az, bx, bz, obs) {
  for (const o of obs) {
    if (segHitsBox(ax, az, bx, bz, o.x - o.hx, o.z - o.hz, o.x + o.hx, o.z + o.hz)) return true;
  }
  return false;
}

function insideObs(x, z, obs, pad) {
  for (const o of obs) {
    if (x > o.x - o.hx - pad && x < o.x + o.hx + pad && z > o.z - o.hz - pad && z < o.z + o.hz + pad) return true;
  }
  return false;
}

function predictEnemy(p, dt) {
  const en = p.enemy;
  let vx = en.vx, vz = en.vz;
  if (en.casting && en.casting.skill === 'charge' && en.casting.phase === 'dash') {
    const f = V.fromHeading(en.heading);
    vx = f.x * 15; vz = f.z * 15;
  }
  return { x: clampA(en.x + vx * dt), z: clampA(en.z + vz * dt) };
}

function bestBlinkDir(p, awayFrom) {
  const me = p.self, obs = p.arena.obstacles;
  let best = null, bs = -1e9;
  for (let i = 0; i < 20; i++) {
    const a = i * TWO_PI / 20;
    const dx = Math.sin(a), dz = Math.cos(a);
    let t = 7.5;
    for (let k = 0; k < 14; k++) {
      const px = me.x + dx * t, pz = me.z + dz * t;
      if (Math.abs(px) < 19.2 && Math.abs(pz) < 19.2 && !insideObs(px, pz, obs, 1.15)) break;
      t -= 0.5;
    }
    if (t < 1.0) continue;
    const px = me.x + dx * t, pz = me.z + dz * t;
    const dd = Math.hypot(px - awayFrom.x, pz - awayFrom.z);
    let s = dd * 1.0 + t * 0.35;
    const wall = 20 - Math.max(Math.abs(px), Math.abs(pz));
    if (wall < 4.5) s -= (4.5 - wall) * 2.0;
    if (s > bs) { bs = s; best = { x: dx, z: dz }; }
  }
  return best;
}

function chooseMove(p, api, ctx) {
  const me = p.self, en = p.enemy, obs = p.arena.obstacles;
  const ep = ctx.epred;
  let best = null, bs = -1e9;
  const f = V.fromHeading(en.heading);
  for (let i = 0; i < 24; i++) {
    const a = i * TWO_PI / 24;
    const dx = Math.sin(a), dz = Math.cos(a);
    const r = api.ray(dx, dz, 6.5);
    const clear = r.dist;
    const step = Math.min(2.8, Math.max(0, clear - 1.4));
    const nx = clampA(me.x + dx * step), nz = clampA(me.z + dz * step);
    const nd = Math.hypot(nx - ep.x, nz - ep.z);
    let s = 0;
    s -= Math.abs(nd - ctx.want) * (nd < ctx.want ? 2.4 : 0.9);
    s += Math.min(clear, 6.5) * 0.6;
    const wall = 20 - Math.max(Math.abs(nx), Math.abs(nz));
    if (wall < 4.5) s -= (4.5 - wall) * 2.6;
    const vis = !blockedLine(nx, nz, ep.x, ep.z, obs);
    if (ctx.wantVis) s += vis ? 2.2 : -2.6; else s += vis ? -2.2 : 3.2;
    if (ctx.chargeDanger) {
      const rx = nx - en.x, rz = nz - en.z;
      const along = rx * f.x + rz * f.z;
      const perp = Math.abs(rx * f.z - rz * f.x);
      if (along > -1 && along < 14 && perp < 3.4) s -= (3.4 - perp) * 3.5;
    }
    s += (dx * lastDir.x + dz * lastDir.z) * 0.8;
    if (s > bs) { bs = s; best = { x: dx, z: dz }; }
  }
  if (!best) best = lastDir;
  lastDir = best;
  api.move(best.x, best.z);
}

function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive) return;
  if (p.t < 0.2) { eStart = {}; hits = 0; misses = 0; saidAt = -9; }

  for (const e of p.events) {
    if (e.type === 'enemyStarted') eStart[e.skill] = p.t;
    else if (e.type === 'dealt' && e.skill === 'laser') hits++;
    else if (e.type === 'missed' && e.skill === 'laser') misses++;
  }
  const ecd = (s) => {
    const t0 = eStart[s];
    return t0 === undefined ? 0 : Math.max(0, CD_E[s] - (p.t - t0));
  };

  const d = en.dist;
  const obs = p.arena.obstacles;
  const cast = me.casting;
  const casting = !!cast && cast.skill === 'laser' && cast.telegraph;

  // ---- aim ----
  const leadT = casting ? Math.max(0, cast.remaining) : 0.73;
  const aimP = predictEnemy(p, leadT * 0.9);
  api.faceAt(aimP.x, aimP.z);

  const toAim = Math.atan2(aimP.x - me.x, aimP.z - me.z);
  let angErr = toAim - me.heading;
  while (angErr > Math.PI) angErr -= TWO_PI;
  while (angErr < -Math.PI) angErr += TWO_PI;

  // ---- threat model ----
  const chargeCd = ecd('charge'), smashCd = ecd('smash');
  const eCast = en.casting;
  const eCharging = !!eCast && eCast.skill === 'charge';
  const eSmashing = !!eCast && eCast.skill === 'smash' && eCast.telegraph;
  const f = V.fromHeading(en.heading);
  const rx = me.x - en.x, rz = me.z - en.z;
  const along = rx * f.x + rz * f.z;
  const perp = Math.abs(rx * f.z - rz * f.x);
  const inLine = along > -0.5 && along < 14.5 && perp < 3.2;

  const fm = me.hp / me.maxHp, fe = en.hp / en.maxHp;
  const turtle = p.t > 25 && fm > fe + 0.02;

  // ---- reactive skills ----
  let acted = false;
  if (!me.busy && !me.stunned && !me.airborne) {
    // dodge charge with blink
    if (eCharging && api.ready('blink') &&
        ((eCast.phase === 'dash' && inLine && along < 13) ||
         (eCast.phase === 'windup' && eCast.remaining < 0.13 && d < 13.5))) {
      const ahead = { x: en.x + f.x * Math.min(12, Math.max(4, along)), z: en.z + f.z * Math.min(12, Math.max(4, along)) };
      const bd = bestBlinkDir(p, ahead);
      if (bd) { api.use('blink', bd.x, bd.z); acted = true; }
    }
    // dodge smash
    if (!acted && eSmashing && d < 6.6) {
      if (eCast.remaining > 0.12 && api.ready('jump')) { api.use('jump'); acted = true; }
      else if (api.ready('blink')) {
        const bd = bestBlinkDir(p, { x: en.x, z: en.z });
        if (bd) { api.use('blink', bd.x, bd.z); acted = true; }
      }
    }
    // emergency spacing
    if (!acted && d < 4.0 && api.ready('blink') && (smashCd < 0.3 || chargeCd < 0.3 || turtle)) {
      const bd = bestBlinkDir(p, { x: en.x, z: en.z });
      if (bd) { api.use('blink', bd.x, bd.z); acted = true; }
    }
  }

  // ---- laser ----
  let minCast = 3.0;
  if (chargeCd < 0.35) minCast = 10.2;
  else if (smashCd < 0.5) minCast = 7.8;
  if (eCharging) minCast = 99;
  if (eSmashing) minCast = Math.max(minCast, 7.5);
  if (en.airborne) minCast -= 3.0;
  if (en.stunned) minCast -= 4.0;
  if (turtle) minCast += 2.5;

  if (!acted && !me.busy && !me.stunned && !me.airborne && api.ready('laser')) {
    if (en.visible && d > minCast && d < 22.5 && Math.abs(angErr) < 1.25) {
      api.use('laser');
      acted = true;
    }
  }

  // ---- movement ----
  let want = 13.5;
  if (chargeCd > 1.2) want = 10.5;
  if (chargeCd < 0.4) want = 15.0;
  if (turtle) want = 17.5;
  if (fm < 0.3) want += 2.0;

  let wantVis = true;
  const lcd = api.cooldown('laser');
  if (lcd > 0.9 && d < 12) wantVis = false;
  if (turtle && d < 16) wantVis = false;
  if (casting) wantVis = true;

  const chargeDanger = (chargeCd < 0.6 || eCharging) && d < 16;
  const epred = predictEnemy(p, 0.55);
  chooseMove(p, api, { epred, want, wantVis, chargeDanger });

  if (p.t - saidAt > 7) {
    saidAt = p.t;
    api.say(turtle ? "eight arms, zero patience" : "beam first, ask later");
  }
}
