const CD = { charge: 4.0, smash: 1.3, jump: 2.8 };
let eLast = { charge: -99, smash: -99, jump: -99 };
let prevDir = null;
let lastHitT = -99;
let blockedT = -99;
let saidT = -99;

function segBlocked(ax, az, bx, bz, obs) {
  const dx = bx - ax, dz = bz - az;
  for (const o of obs) {
    const minx = o.x - o.hx, maxx = o.x + o.hx, minz = o.z - o.hz, maxz = o.z + o.hz;
    let t0 = 0, t1 = 1, ok = true;
    if (Math.abs(dx) < 1e-9) { if (ax < minx || ax > maxx) ok = false; }
    else {
      let ta = (minx - ax) / dx, tb = (maxx - ax) / dx;
      if (ta > tb) { const s = ta; ta = tb; tb = s; }
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    }
    if (ok) {
      if (Math.abs(dz) < 1e-9) { if (az < minz || az > maxz) ok = false; }
      else {
        let ta = (minz - az) / dz, tb = (maxz - az) / dz;
        if (ta > tb) { const s = ta; ta = tb; tb = s; }
        t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
      }
    }
    if (ok && t0 <= t1) return true;
  }
  return false;
}

function clearRay(api, dx, dz, max) {
  const r = api.ray(dx, dz, max);
  if (!r) return max;
  return r.hit ? r.dist : max;
}

function chooseDir(p, api, R, wantLos) {
  const me = p.self, en = p.enemy;
  const obs = p.arena.obstacles || [];
  let best = null, bs = -1e9;
  for (let i = 0; i < 24; i++) {
    const a = i * (Math.PI * 2 / 24);
    const d = { x: Math.sin(a), z: Math.cos(a) };
    const clear = clearRay(api, d.x, d.z, 5);
    if (clear < 1.5) continue;
    const step = Math.min(3.0, clear - 1.2);
    const nx = me.x + d.x * step, nz = me.z + d.z * step;
    const nd = Math.hypot(nx - en.x, nz - en.z);
    let s = 0;
    s -= nd < R ? (R - nd) * 2.6 : (nd - R) * 0.9;
    s += Math.min(clear, 4.5) * 0.55;
    const edge = Math.max(Math.abs(nx), Math.abs(nz));
    if (edge > 14.5) s -= (edge - 14.5) * 2.4;
    if (prevDir) s += (d.x * prevDir.x + d.z * prevDir.z) * 1.3;
    if (wantLos && !segBlocked(nx, nz, en.x, en.z, obs)) s += 3.5;
    if (s > bs) { bs = s; best = d; }
  }
  return best;
}

function pickEscape(p, api) {
  const me = p.self, en = p.enemy;
  const base = V.away({ x: me.x, z: me.z }, { x: en.x, z: en.z });
  let best = base, bs = -1e9;
  for (let k = -3; k <= 3; k++) {
    const d = V.rot(base, k * 0.45);
    const clear = clearRay(api, d.x, d.z, 7.5);
    const step = Math.min(7.5, Math.max(0.5, clear - 1.15));
    const nx = me.x + d.x * step, nz = me.z + d.z * step;
    const nd = Math.hypot(nx - en.x, nz - en.z);
    let s = nd * 1.0 + step * 0.5;
    const edge = Math.max(Math.abs(nx), Math.abs(nz));
    if (edge > 15) s -= (edge - 15) * 3.0;
    if (s > bs) { bs = s; best = d; }
  }
  return best;
}

function think(p, api) {
  const me = p.self, en = p.enemy, t = p.t;
  const obs = p.arena.obstacles || [];

  for (const ev of p.events) {
    if (ev.type === 'enemyStarted') { if (eLast[ev.skill] !== undefined) eLast[ev.skill] = t; }
    else if (ev.type === 'damaged') lastHitT = t;
    else if (ev.type === 'blocked') blockedT = t;
  }

  if (!me.alive) return;
  let mv = null, fc = null, sk = null, say = null;

  if (!en || !en.alive) {
    api.stop();
    return;
  }

  const dist = en.dist;
  const chargeReady = (t - eLast.charge) >= CD.charge - 0.25;
  const smashReady = (t - eLast.smash) >= CD.smash - 0.12;
  const ec = en.casting;
  const dashing = ec && ec.skill === 'charge' && (ec.phase === 'dash' || ec.phase === 'strike');
  const chWind = ec && ec.skill === 'charge' && ec.phase === 'windup';
  const smWind = ec && ec.skill === 'smash' && ec.telegraph && ec.phase !== 'recover';

  const casting = me.casting && me.casting.skill === 'laser' && me.casting.telegraph;
  const aimT = casting ? Math.max(0, me.casting.remaining - 0.03) : 0.28;
  const aim = { x: en.x + en.vx * aimT * 0.9, z: en.z + en.vz * aimT * 0.9 };
  fc = { x: aim.x, z: aim.z };

  const apply = () => {
    if (mv) {
      if (mv.t === 'move') { api.move(mv.x, mv.z); prevDir = V.norm({ x: mv.x, z: mv.z }); }
      else if (mv.t === 'moveTo') api.moveTo(mv.x, mv.z);
      else api.stop();
    }
    if (fc) api.faceAt(fc.x, fc.z);
    if (sk) api.use(sk[0], sk[1], sk[2]);
    if (say && t - saidT > 3.5) { api.say(say); saidT = t; }
  };

  // ---- 1. dodge a charge -------------------------------------------------
  if (dashing || (chWind && ec.remaining <= 0.11)) {
    const hd = V.fromHeading(en.heading);
    let perp = V.perp(hd);
    const rel = V.norm({ x: me.x - en.x, z: me.z - en.z });
    if (V.dot(rel, perp) < 0) perp = V.scale(perp, -1);
    let d = V.norm(V.add(perp, V.scale(rel, 0.4)));
    const c1 = clearRay(api, d.x, d.z, 8);
    if (c1 < 3.2) {
      const d2 = V.norm(V.add(V.scale(perp, -1), V.scale(rel, 0.4)));
      if (clearRay(api, d2.x, d2.z, 8) > c1) d = d2;
    }
    mv = { t: 'move', x: d.x, z: d.z };
    fc = { x: en.x, z: en.z };
    if (api.ready('blink') && !me.busy) { sk = ['blink', d.x, d.z]; say = 'eight arms, none of them where you aimed'; }
    apply();
    return;
  }

  // ---- 2. dodge a smash --------------------------------------------------
  if (smWind && dist < 7.2) {
    const away = V.away({ x: me.x, z: me.z }, { x: en.x, z: en.z });
    mv = { t: 'move', x: away.x, z: away.z };
    fc = { x: en.x, z: en.z };
    const rem = ec.remaining === undefined ? 0.2 : ec.remaining;
    if (!me.busy && !me.airborne && api.ready('jump') && rem > 0.05 && rem < 0.32) {
      sk = ['jump'];
    } else if (!me.busy && api.ready('blink') && dist < 6.0) {
      const bd = pickEscape(p, api);
      sk = ['blink', bd.x, bd.z];
    }
    apply();
    return;
  }

  // ---- 3. target range ---------------------------------------------------
  let R;
  if (chargeReady) R = 15.5; else R = 11.0;
  if (dist > 24) R = 14.0;
  if (p.burn > 0 && me.hp / me.maxHp > en.hp / en.maxHp) R = Math.max(R, 16.5);

  const laserSoon = api.cooldown('laser') < 0.6;
  const seeEnemy = en.visible;

  // ---- 4. movement -------------------------------------------------------
  if (!seeEnemy && laserSoon && dist > 9.5) {
    mv = { t: 'moveTo', x: en.x, z: en.z };
  } else {
    const d = chooseDir(p, api, R, laserSoon);
    if (d) mv = { t: 'move', x: d.x, z: d.z };
    else {
      const away = V.away({ x: me.x, z: me.z }, { x: en.x, z: en.z });
      mv = { t: 'move', x: away.x, z: away.z };
    }
  }

  // ---- 5. skills ---------------------------------------------------------
  if (!me.busy && !me.airborne && !me.stunned) {
    let fired = false;
    if (api.ready('laser') && seeEnemy && !en.airborne && dist <= 22.5 && dist >= 2.5) {
      const aimClear = !segBlocked(me.x, me.z, aim.x, aim.z, obs);
      let ok = false;
      if (en.stunned) ok = true;
      else if (dist >= 13.5) ok = true;
      else if (dist >= 9.0 && !chargeReady) ok = true;
      if (ok && aimClear) {
        sk = ['laser'];
        fired = true;
        if (dist < 12) say = 'hold still, ape';
      }
    }
    if (!fired && api.ready('blink')) {
      const desperate = dist < 5.4 || (dist < 7.0 && smashReady && t - lastHitT < 1.2);
      if (desperate) {
        const bd = pickEscape(p, api);
        sk = ['blink', bd.x, bd.z];
        say = 'ink and distance';
      }
    }
  }

  apply();
}
