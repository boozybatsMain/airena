function think(p, api) {
  const me = p.self, en = p.enemy, t = p.t;
  if (!me || !en || !me.alive || !en.alive) return;

  // ---- event digest ----
  for (const e of p.events) {
    if (e.type === 'blocked' && t - lastFlip > 0.4) { dodgeSign = -dodgeSign; lastFlip = t; }
    if (e.type === 'damaged' && e.skill === 'laser') { lasersEaten++; }
    if (e.type === 'enemyStarted' && e.skill === 'blink') lastBlinkSeen = t;
    if (e.type === 'dealt') lastHitLanded = t;
  }
  if (t - lastFlip > 1.7 && api.rand() < 0.25) { dodgeSign = -dodgeSign; lastFlip = t; }
  if (!saidOnce) { saidOnce = true; api.say("come here, little squid"); }

  const d = en.dist;
  const toEn = V.toward(me, en);

  // how long until their beam fires (99 = not casting)
  let fireIn = 99;
  const ec = en.casting;
  if (ec && ec.skill === 'laser' && ec.telegraph) {
    fireIn = Math.max(0, (ec.remaining != null ? ec.remaining : 0.3));
  }

  const pe = (dt) => ({ x: en.x + en.vx * dt, z: en.z + en.vz * dt });

  // ---- committed to my own skill ----
  const c = me.casting;
  if (c && c.telegraph) {
    if (c.skill === 'smash') {
      const rem = Math.max(0.05, c.remaining != null ? c.remaining : 0.15);
      const a = pe(rem);
      api.faceAt(a.x, a.z);
      if (d > 2.1) api.move(toEn.x, toEn.z); else api.stop();
      return;
    }
    if (c.skill === 'charge') {
      const rem = Math.max(0, c.remaining != null ? c.remaining : 0.1);
      const ttc = rem + Math.max(0, d - 2.2) / 15;
      const a = pe(ttc * 0.85);
      api.faceAt(a.x, a.z);
      return;
    }
    if (c.skill === 'jump') { api.faceAt(en.x, en.z); return; }
  }
  if (me.airborne) { api.faceAt(en.x, en.z); return; }
  if (me.stunned) return;

  const canAct = !me.busy;

  // ---- SMASH: the bread and butter ----
  if (canAct && api.ready('smash') && !en.airborne) {
    const a = pe(0.3);
    const mx = me.x + me.vx * 0.2, mz = me.z + me.vz * 0.2;
    const dirA = { x: a.x - mx, z: a.z - mz };
    const pd = Math.hypot(dirA.x, dirA.z);
    const ang = Math.abs(V.angleTo(me.heading, dirA));
    const reach = 2.9 + me.radius + en.radius - 0.3;
    if (pd <= reach && ang <= 1.15) {
      api.use('smash');
      api.faceAt(a.x, a.z);
      if (pd > 2.2) api.move(toEn.x, toEn.z); else api.stop();
      return;
    }
  }

  // ---- CHARGE: gap closer, interrupter, opener ----
  if (canAct && api.ready('charge') && en.visible && !en.airborne &&
      d >= 2.8 && d <= 12.5 && !(en.invulnerable && d < 5)) {
    const ttc = 0.3 + Math.max(0, d - 2.2) / 15;
    const a = pe(ttc * 0.85);
    const dir = { x: a.x - me.x, z: a.z - me.z };
    const ang = Math.abs(V.angleTo(me.heading, dir));
    if (ang <= 1.0) {
      const nd = V.norm(dir);
      const r = api.ray(nd.x, nd.z, Math.min(15, d + 1.5));
      if (!r || !r.hit || r.dist >= d - 1.4) {
        api.use('charge');
        api.faceAt(a.x, a.z);
        return;
      }
    } else {
      api.faceAt(a.x, a.z);
    }
  }

  // ---- movement ----
  let moved = false;

  // duck behind something while the beam charges
  if (fireIn < 90 && d > 4.5 && !api.ready('charge')) {
    const cp = findCover(p, me, en, Math.min(5.4, fireIn * 5.2 + 0.4));
    if (cp) {
      api.move(cp.x - me.x, cp.z - me.z);
      moved = true;
    }
  }

  // very last instant juke if no cover and beam imminent
  if (!moved && fireIn < 0.34 && d > 6) {
    const pp = V.perp(toEn);
    api.move(pp.x * dodgeSign + toEn.x * 0.25, pp.z * dodgeSign + toEn.z * 0.25);
    moved = true;
  }

  if (!moved) {
    if (d > 3.2) {
      let usedPath = false;
      if (!en.visible) {
        const path = api.pathTo(en.x, en.z);
        if (path && path.points && path.points.length && !path.direct) {
          let wp = path.points[path.points.length - 1];
          for (const q of path.points) {
            if (Math.hypot(q.x - me.x, q.z - me.z) > 1.1) { wp = q; break; }
          }
          api.move(wp.x - me.x, wp.z - me.z);
          usedPath = true;
        }
      }
      if (!usedPath) {
        let dir = { x: toEn.x, z: toEn.z };
        if (d > 7.5) {
          const pp = V.perp(toEn);
          const w = 0.38 * Math.sin(t * 2.3) * dodgeSign;
          dir = { x: toEn.x + pp.x * w, z: toEn.z + pp.z * w };
        }
        const nd = V.norm(dir);
        const probe = api.ray(nd.x, nd.z, 2.6);
        if (probe && probe.hit && probe.dist < 2.2) {
          const pp = V.perp(toEn);
          dir = { x: toEn.x * 0.4 + pp.x * dodgeSign, z: toEn.z * 0.4 + pp.z * dodgeSign };
        }
        api.move(dir.x, dir.z);
      }
    } else {
      // glued: orbit tight, stay inside smash reach
      const pp = V.perp(toEn);
      const inward = d > 2.7 ? 0.6 : (d < 2.0 ? -0.35 : 0.1);
      api.move(pp.x * dodgeSign * 0.85 + toEn.x * inward,
               pp.z * dodgeSign * 0.85 + toEn.z * inward);
    }
  }

  const fa = pe(0.18);
  api.faceAt(fa.x, fa.z);
}

let dodgeSign = 1;
let lastFlip = 0;
let lasersEaten = 0;
let lastBlinkSeen = -99;
let lastHitLanded = -99;
let saidOnce = false;

function segBox(ax, az, bx, bz, box, shrink) {
  const hx = box.hx - shrink, hz = box.hz - shrink;
  if (hx <= 0.05 || hz <= 0.05) return false;
  const dx = bx - ax, dz = bz - az;
  let tmin = 0, tmax = 1;
  if (Math.abs(dx) < 1e-9) {
    if (ax < box.x - hx || ax > box.x + hx) return false;
  } else {
    let t1 = (box.x - hx - ax) / dx, t2 = (box.x + hx - ax) / dx;
    if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return false;
  }
  if (Math.abs(dz) < 1e-9) {
    if (az < box.z - hz || az > box.z + hz) return false;
  } else {
    let t1 = (box.z - hz - az) / dz, t2 = (box.z + hz - az) / dz;
    if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return false;
  }
  return true;
}

function hiddenFrom(obs, ex, ez, x, z) {
  for (const o of obs) if (segBox(ex, ez, x, z, o, 0.45)) return true;
  return false;
}

function insideAny(obs, x, z, pad) {
  for (const o of obs) {
    if (Math.abs(x - o.x) < o.hx + pad && Math.abs(z - o.z) < o.hz + pad) return true;
  }
  return false;
}

function findCover(p, me, en, maxDist) {
  const obs = p.arena.obstacles;
  if (!obs || !obs.length) return null;
  const lim = p.arena.half - 1.6;
  let best = null, bestScore = 1e9;
  for (const o of obs) {
    const ox = o.hx + 1.9, oz = o.hz + 1.9;
    for (let i = 0; i < 8; i++) {
      let cx, cz;
      if (i === 0) { cx = o.x + ox; cz = o.z; }
      else if (i === 1) { cx = o.x - ox; cz = o.z; }
      else if (i === 2) { cx = o.x; cz = o.z + oz; }
      else if (i === 3) { cx = o.x; cz = o.z - oz; }
      else if (i === 4) { cx = o.x + ox; cz = o.z + oz; }
      else if (i === 5) { cx = o.x + ox; cz = o.z - oz; }
      else if (i === 6) { cx = o.x - ox; cz = o.z + oz; }
      else { cx = o.x - ox; cz = o.z - oz; }
      if (cx < -lim || cx > lim || cz < -lim || cz > lim) continue;
      if (insideAny(obs, cx, cz, 1.45)) continue;
      const dm = Math.hypot(cx - me.x, cz - me.z);
      if (dm > maxDist) continue;
      if (!hiddenFrom(obs, en.x, en.z, cx, cz)) continue;
      const de = Math.hypot(cx - en.x, cz - en.z);
      const score = dm + de * 0.45;
      if (score < bestScore) { bestScore = score; best = { x: cx, z: cz }; }
    }
  }
  return best;
}
