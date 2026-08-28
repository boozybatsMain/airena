const DEG = Math.PI / 180;

let lastLaserStart = -99;
let lastBlinkStart = -99;
let coverTgt = null;
let coverExp = 0;
let strafeSign = 1;
let nextFlip = 0;
let saidHi = false;

function segHitsBox(ax, az, bx, bz, o, pad) {
  const minx = o.x - o.hx - pad, maxx = o.x + o.hx + pad;
  const minz = o.z - o.hz - pad, maxz = o.z + o.hz + pad;
  const dx = bx - ax, dz = bz - az;
  let t0 = 0, t1 = 1;
  if (Math.abs(dx) < 1e-9) {
    if (ax < minx || ax > maxx) return false;
  } else {
    let ta = (minx - ax) / dx, tb = (maxx - ax) / dx;
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return false;
  }
  if (Math.abs(dz) < 1e-9) {
    if (az < minz || az > maxz) return false;
  } else {
    let ta = (minz - az) / dz, tb = (maxz - az) / dz;
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return false;
  }
  return true;
}

function blockedSeg(ax, az, bx, bz, obs, pad) {
  for (const o of obs) if (segHitsBox(ax, az, bx, bz, o, pad)) return true;
  return false;
}

function insideBox(x, z, obs, pad) {
  for (const o of obs) {
    if (x > o.x - o.hx - pad && x < o.x + o.hx + pad &&
        z > o.z - o.hz - pad && z < o.z + o.hz + pad) return true;
  }
  return false;
}

function pred(en, t) {
  let x = en.x + en.vx * t;
  let z = en.z + en.vz * t;
  if (x > 19.3) x = 19.3; if (x < -19.3) x = -19.3;
  if (z > 19.3) z = 19.3; if (z < -19.3) z = -19.3;
  return { x, z };
}

function findCover(p, me, en, maxR) {
  const obs = p.arena.obstacles;
  const curD = en.dist;
  let best = null, bestScore = 1e9;
  const radii = maxR > 6 ? [3.0, 5.0, 7.0, 9.0] : [2.2, 3.4, 4.6];
  for (const r of radii) {
    for (let i = 0; i < 16; i++) {
      const a = i * Math.PI / 8;
      const cx = me.x + Math.sin(a) * r;
      const cz = me.z + Math.cos(a) * r;
      if (Math.abs(cx) > 18.3 || Math.abs(cz) > 18.3) continue;
      if (insideBox(cx, cz, obs, 1.7)) continue;
      if (blockedSeg(me.x, me.z, cx, cz, obs, 1.3)) continue;
      if (!blockedSeg(cx, cz, en.x, en.z, obs, 0)) continue;
      const dEn = Math.hypot(cx - en.x, cz - en.z);
      if (dEn > curD - 0.6) continue;
      const score = dEn + r * 0.3;
      if (score < bestScore) { bestScore = score; best = { x: cx, z: cz, dEn }; }
    }
  }
  return best;
}

function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me || !me.alive) return;

  if (p.tick <= 4) {
    lastLaserStart = -99; lastBlinkStart = -99;
    coverTgt = null; coverExp = 0; strafeSign = 1; nextFlip = 0;
  }

  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      if (e.skill === 'laser') lastLaserStart = p.t;
      else if (e.skill === 'blink') lastBlinkStart = p.t;
    }
  }

  if (!saidHi && p.t > 0.2) { saidHi = true; api.say("Come here, little squid."); }

  const obs = p.arena.obstacles;
  const d = en.dist;
  const enLaser = en.casting && en.casting.skill === 'laser' && en.casting.telegraph;

  // ---- locked into something ----
  if (me.busy || me.stunned || me.airborne) {
    const c = me.casting;
    if (c && c.skill === 'charge' && c.phase === 'windup') {
      const tt = Math.max(0, 0.3 - c.elapsed) + Math.max(0, (d - 2.3)) / 15;
      const pe = pred(en, tt);
      api.faceAt(pe.x, pe.z);
      api.move(pe.x - me.x, pe.z - me.z);
    } else if (c && c.skill === 'smash' && c.phase === 'windup') {
      const pe = pred(en, Math.max(0, 0.3 - c.elapsed));
      api.faceAt(pe.x, pe.z);
      api.move(pe.x - me.x, pe.z - me.z);
    } else {
      api.faceAt(en.x, en.z);
    }
    return;
  }

  // ---- SMASH ----
  if (api.ready('smash') && !en.invulnerable) {
    const tw = 0.3;
    const pe = pred(en, tw);
    const mx = me.x + me.vx * tw * 0.45, mz = me.z + me.vz * tw * 0.45;
    const dx = pe.x - mx, dz = pe.z - mz;
    const dd = Math.hypot(dx, dz);
    const maxR = 2.9 + me.radius + en.radius;
    let enAirLater = false;
    if (en.airborne) {
      const ec = en.casting;
      enAirLater = !(ec && ec.remaining !== undefined && ec.remaining <= tw - 0.02);
    }
    if (dd <= maxR - 0.3 && !enAirLater) {
      const need = Math.abs(V.angleTo(me.heading, { x: dx, z: dz }));
      const turnAvail = 0.55 * me.turnRate * tw;
      const ratio = Math.min(0.999, en.radius / Math.max(dd, en.radius + 0.05));
      const half = 55 * DEG + Math.asin(ratio);
      if (need - turnAvail < half - 0.12) {
        api.use('smash');
        api.faceAt(pe.x, pe.z);
        api.move(dx, dz);
        api.remember('act', 'smash');
        return;
      }
    }
  }

  // ---- CHARGE ----
  if (api.ready('charge') && en.visible && !en.airborne) {
    const want = (d >= 4.8 && d <= 11.6) || (enLaser && d >= 2.6 && d <= 12.0) ||
                 (en.stunned && d >= 4.0 && d <= 11.6);
    if (want) {
      const tt = 0.3 + Math.max(0, (d - 2.3)) / 15;
      const pe = pred(en, tt);
      const dx = pe.x - me.x, dz = pe.z - me.z;
      const dd = Math.hypot(dx, dz);
      const need = Math.abs(V.angleTo(me.heading, { x: dx, z: dz }));
      if (dd > 1.5 && need < 1.0) {
        const r = api.ray(dx, dz, Math.min(dd + 0.6, 12.5));
        const clear = (!r.hit) || (r.dist >= Math.min(dd, 12.0) - 1.2);
        if (clear) {
          api.use('charge');
          api.faceAt(pe.x, pe.z);
          api.move(dx, dz);
          api.remember('act', 'charge');
          return;
        }
      }
    }
  }

  // ---- movement ----
  const late = p.burn > 0 || p.t > 25;
  const laserThreat = enLaser || (p.t - lastLaserStart) > 2.0;

  if (p.t > nextFlip) {
    nextFlip = p.t + 1.2 + api.rand() * 1.4;
    if (api.rand() < 0.5) strafeSign = -strafeSign;
  }

  if (d < 6.2 || !en.visible) {
    // close quarters or blind: press
    if (d < 3.4 && en.visible) {
      const tw = V.toward(me, en);
      const pr = V.perp(tw);
      const dirx = tw.x * 0.85 + pr.x * 0.55 * strafeSign;
      const dirz = tw.z * 0.85 + pr.z * 0.55 * strafeSign;
      const nx = me.x + dirx * 1.6, nz = me.z + dirz * 1.6;
      if (Math.abs(nx) < 19 && Math.abs(nz) < 19 && !insideBox(nx, nz, obs, 1.4)) {
        api.move(dirx, dirz);
      } else {
        api.move(tw.x, tw.z);
      }
      api.remember('act', 'brawl');
    } else {
      api.moveTo(en.x, en.z);
      api.remember('act', 'press');
    }
    coverTgt = null;
  } else if (late || !laserThreat) {
    api.moveTo(en.x, en.z);
    api.remember('act', 'rush');
    coverTgt = null;
  } else {
    let tgt = null;
    if (coverTgt && p.t < coverExp) {
      const cd = Math.hypot(coverTgt.x - me.x, coverTgt.z - me.z);
      if (cd > 1.2 && blockedSeg(coverTgt.x, coverTgt.z, en.x, en.z, obs, 0)) {
        tgt = coverTgt;
      }
    }
    if (!tgt) {
      const found = findCover(p, me, en, enLaser ? 4.6 : 9.0);
      if (found) {
        coverTgt = found;
        coverExp = p.t + 0.9;
        tgt = found;
      } else {
        coverTgt = null;
      }
    }
    if (tgt) {
      api.moveTo(tgt.x, tgt.z);
      api.remember('act', 'cover');
    } else if (enLaser) {
      // no cover: sidestep hard while closing
      const tw = V.toward(me, en);
      const pr = V.perp(tw);
      const dirx = tw.x * 0.55 + pr.x * 0.9 * strafeSign;
      const dirz = tw.z * 0.55 + pr.z * 0.9 * strafeSign;
      const nx = me.x + dirx * 2.2, nz = me.z + dirz * 2.2;
      if (Math.abs(nx) < 19 && Math.abs(nz) < 19 && !insideBox(nx, nz, obs, 1.4)) {
        api.move(dirx, dirz);
      } else {
        api.moveTo(en.x, en.z);
      }
      api.remember('act', 'juke');
    } else {
      api.moveTo(en.x, en.z);
      api.remember('act', 'rush');
    }
  }

  api.faceAt(en.x, en.z);
}
