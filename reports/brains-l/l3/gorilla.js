function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me || !me.alive) return;

  // ---- event bookkeeping ----
  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      if (e.skill === 'laser') S.lastLaser = p.t;
      else if (e.skill === 'blink') S.lastBlink = p.t;
      else if (e.skill === 'jump') S.lastJump = p.t;
    } else if (e.type === 'damaged') {
      if (e.skill === 'laser') S.lastLaser = p.t - 0.65;
      S.lastHurt = p.t;
    } else if (e.type === 'blocked') {
      S.serp = -S.serp; S.serpT = p.t;
    } else if (e.type === 'chargeStopped') {
      S.chargeEnd = p.t;
    }
  }

  const OB = p.arena.obstacles;
  const dist = en.dist;
  const lead = { x: en.x + en.vx * 0.30, z: en.z + en.vz * 0.30 };

  // ---- facing: always toward where they'll be ----
  api.faceAt(lead.x, lead.z);

  if (!en.alive) { api.stop(); return; }

  // if we can't act at all, still keep a sane movement order
  const canAct = !me.busy && !me.stunned && !me.airborne;

  const enCasting = en.casting && en.casting.skill === 'laser' && en.casting.telegraph;
  const castLeft = enCasting ? en.casting.remaining : 99;

  // ================= SKILLS =================
  let used = false;

  // --- SMASH ---
  if (canAct && api.ready('smash')) {
    const st = 0.28;
    const fe = { x: en.x + en.vx * st, z: en.z + en.vz * st };
    const fm = { x: me.x + me.vx * st * 0.45, z: me.z + me.vz * st * 0.45 };
    const d = Math.max(0.01, V.dist(fm, fe));
    const reach = 2.9 + me.radius + en.radius;
    if (d < reach - 0.30 && !en.airborne && !en.invulnerable) {
      const dir = V.toward(fm, fe);
      const ang = Math.abs(V.angleTo(me.heading, dir));
      const half = 0.9599 + Math.asin(Math.min(0.98, en.radius / Math.max(d, en.radius + 0.02)));
      if (ang < half + 0.50) {
        api.use('smash');
        used = true;
      }
    }
  }

  // --- CHARGE ---
  if (!used && canAct && api.ready('charge') && en.visible && !en.invulnerable) {
    const gap = Math.max(0, dist - me.radius - en.radius);
    const tHit = 0.28 + gap / 15;
    const wantInterrupt = enCasting && castLeft > 0.10 && dist < 12.5;
    const wantClose = dist > 5.2 && dist < 11.5;
    if ((wantInterrupt || wantClose) && dist > 2.6) {
      const px = en.x + en.vx * tHit * 0.8, pz = en.z + en.vz * tHit * 0.8;
      const d2 = V.norm({ x: px - me.x, z: pz - me.z });
      const r = api.ray(d2.x, d2.z, Math.min(13, dist + 1.5));
      if (!r.hit || r.dist > dist - 1.0) {
        api.faceAt(px, pz);
        api.use('charge');
        used = true;
      }
    }
  }

  // ================= MOVEMENT =================
  // endgame stall: if clearly ahead on fraction and clock nearly out, hide
  const myFrac = me.hp / me.maxHp, enFrac = en.hp / en.maxHp;
  const stalling = p.timeLeft < 4.0 && myFrac > enFrac + 0.04;

  if (stalling) {
    const spot = coverSpot(p, api, me, en, OB);
    if (spot) api.moveTo(spot.x, spot.z);
    else api.move(-(en.x - me.x), -(en.z - me.z));
    return;
  }

  // dodge a beam that is about to fire, if a short step breaks line of sight
  if (enCasting && castLeft < 0.75 && dist > 3.0) {
    const step = Math.min(3.4, Math.max(0.8, castLeft * me.maxSpeed * 1.05));
    let best = null, bestScore = -1;
    for (let k = 0; k < 16; k++) {
      const a = k * Math.PI / 8;
      const nx = me.x + Math.sin(a) * step, nz = me.z + Math.cos(a) * step;
      if (Math.abs(nx) > 19.0 || Math.abs(nz) > 19.0) continue;
      if (insideAny(nx, nz, OB, me.radius + 0.15)) continue;
      if (!hiddenFrom(nx, nz, en.x + en.vx * castLeft, en.z + en.vz * castLeft, OB)) continue;
      const closer = -V.dist({ x: nx, z: nz }, en);
      if (closer > bestScore) { bestScore = closer; best = { x: nx, z: nz }; }
    }
    if (best) { api.move(best.x - me.x, best.z - me.z); return; }
  }

  // point-blank sidestep against an imminent beam
  if (enCasting && castLeft < 0.42 && dist < 6.0) {
    const away = V.toward(en, me);
    const per = V.perp(away);
    let sx = me.x + per.x * 3.0, sz = me.z + per.z * 3.0;
    let sgn = 1;
    if (Math.abs(sx) > 18.5 || Math.abs(sz) > 18.5 || insideAny(sx, sz, OB, me.radius + 0.2)) sgn = -1;
    const dir = { x: per.x * sgn - away.x * 0.25, z: per.z * sgn - away.z * 0.25 };
    api.move(dir.x, dir.z);
    return;
  }

  if (dist < 5.6) {
    // glue: stay inside smash reach, push with our mass
    const t = V.toward(me, en);
    api.move(t.x, t.z);
    return;
  }

  // approach
  const path = api.pathTo(en.x, en.z);
  if (path && !path.direct) {
    api.moveTo(en.x, en.z);
    return;
  }

  if (p.t - S.serpT > 0.55) { S.serp = -S.serp; S.serpT = p.t; }
  const toEn = V.toward(me, en);
  let ang = dist > 9 ? 0.50 : 0.32;
  const d3 = V.rot(toEn, S.serp * ang);
  const px = me.x + d3.x * 3.0, pz = me.z + d3.z * 3.0;
  if (Math.abs(px) > 19.0 || Math.abs(pz) > 19.0 || insideAny(px, pz, OB, me.radius + 0.2)) {
    S.serp = -S.serp; S.serpT = p.t;
    const d4 = V.rot(toEn, S.serp * ang);
    api.move(d4.x, d4.z);
  } else {
    api.move(d3.x, d3.z);
  }
}

const S = { lastLaser: -99, lastBlink: -99, lastJump: -99, lastHurt: -99, serp: 1, serpT: 0, chargeEnd: -99 };

function segHitsBox(ax, az, bx, bz, o, pad) {
  const minx = o.x - o.hx - pad, maxx = o.x + o.hx + pad;
  const minz = o.z - o.hz - pad, maxz = o.z + o.hz + pad;
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

function hiddenFrom(px, pz, ex, ez, obs) {
  for (const o of obs) if (segHitsBox(px, pz, ex, ez, o, 0)) return true;
  return false;
}

function insideAny(px, pz, obs, pad) {
  for (const o of obs) {
    if (px > o.x - o.hx - pad && px < o.x + o.hx + pad && pz > o.z - o.hz - pad && pz < o.z + o.hz + pad) return true;
  }
  return false;
}

function coverSpot(p, api, me, en, obs) {
  let best = null, bestC = 1e9;
  for (const o of obs) {
    for (let k = 0; k < 8; k++) {
      const a = k * Math.PI / 4;
      const px = o.x + Math.sin(a) * (o.hx + 2.1), pz = o.z + Math.cos(a) * (o.hz + 2.1);
      if (Math.abs(px) > 18.5 || Math.abs(pz) > 18.5) continue;
      if (insideAny(px, pz, obs, me.radius + 0.1)) continue;
      if (!hiddenFrom(px, pz, en.x, en.z, obs)) continue;
      const path = api.pathTo(px, pz);
      if (!path) continue;
      if (path.dist < bestC) { bestC = path.dist; best = { x: px, z: pz }; }
    }
  }
  return best;
}
