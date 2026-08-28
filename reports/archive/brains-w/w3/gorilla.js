function pred(e, t) {
  const tt = Math.max(0, Math.min(1.2, t));
  return { x: e.x + (e.vx || 0) * tt, z: e.z + (e.vz || 0) * tt };
}

function boxHit(ax, az, bx, bz, b, pad) {
  const minx = b.x - b.hx - pad, maxx = b.x + b.hx + pad;
  const minz = b.z - b.hz - pad, maxz = b.z + b.hz + pad;
  if (minx > maxx || minz > maxz) return false;
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dz = bz - az;
  if (Math.abs(dx) < 1e-9) {
    if (ax < minx || ax > maxx) return false;
  } else {
    let ta = (minx - ax) / dx, tb = (maxx - ax) / dx;
    if (ta > tb) { const t = ta; ta = tb; tb = t; }
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  if (Math.abs(dz) < 1e-9) {
    if (az < minz || az > maxz) return false;
  } else {
    let ta = (minz - az) / dz, tb = (maxz - az) / dz;
    if (ta > tb) { const t = ta; ta = tb; tb = t; }
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  return true;
}

function blocked(a, b, obs, pad) {
  for (const o of obs) if (boxHit(a.x, a.z, b.x, b.z, o, pad)) return true;
  return false;
}

function inBox(x, z, obs, pad) {
  for (const o of obs) if (Math.abs(x - o.x) <= o.hx + pad && Math.abs(z - o.z) <= o.hz + pad) return true;
  return false;
}

function coverMove(me, e, obs, reach) {
  let best = null, bs = -1e9;
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8;
    const px = me.x + Math.sin(a) * reach;
    const pz = me.z + Math.cos(a) * reach;
    if (Math.abs(px) > 19.0 || Math.abs(pz) > 19.0) continue;
    if (inBox(px, pz, obs, me.radius + 0.15)) continue;
    if (blocked({ x: me.x, z: me.z }, { x: px, z: pz }, obs, me.radius * 0.8)) continue;
    if (!blocked({ x: px, z: pz }, { x: e.x, z: e.z }, obs, -0.25)) continue;
    const s = -Math.hypot(px - e.x, pz - e.z);
    if (s > bs) { bs = s; best = { x: px, z: pz }; }
  }
  return best;
}

let stuck = 0;
let sideSign = 1;
let sideUntil = -1;
let lastSay = -99;

function think(p, api) {
  const me = p.self, e = p.enemy;
  if (!me || !me.alive) return;
  if (!e) { api.stop(); return; }
  const obs = (p.arena && p.arena.obstacles) || [];
  const d = e.dist;
  const cast = me.casting;
  const eCast = e.casting;
  const eLaserCast = !!(eCast && eCast.skill === 'laser' && eCast.telegraph);
  const eSafe = !!(e.invulnerable || e.airborne);

  // stuck bookkeeping
  let bumped = false;
  for (const ev of p.events || []) {
    if (ev.type === 'blocked') bumped = true;
    if (ev.type === 'blinked') { /* enemy motion noise */ }
  }
  if (bumped && me.speed < 1.2) stuck++; else stuck = Math.max(0, stuck - 1);
  if (stuck > 5 && p.t > sideUntil) {
    sideUntil = p.t + 0.7;
    sideSign = api.rand() < 0.5 ? -1 : 1;
    stuck = 0;
  }

  // ---- locked-in phases ----
  if (cast) {
    if (cast.skill === 'charge' && cast.phase === 'windup') {
      const tt = cast.remaining + Math.min(0.8, d / 15);
      const aim = pred(e, tt * 0.85);
      api.faceAt(aim.x, aim.z);
      api.move(aim.x - me.x, aim.z - me.z);
      return;
    }
    if (cast.skill === 'smash' && cast.phase === 'windup') {
      const aim = pred(e, cast.remaining + 0.03);
      api.faceAt(aim.x, aim.z);
      api.move(aim.x - me.x, aim.z - me.z);
      return;
    }
    if (cast.phase === 'dash' || cast.phase === 'air' || cast.phase === 'strike') return;
  }

  const canAct = !me.busy && !me.stunned && !me.airborne;
  let acted = false;

  if (canAct) {
    const aimS = pred(e, 0.3);
    const myFut = { x: me.x + me.vx * 0.28, z: me.z + me.vz * 0.28 };
    const distLand = Math.hypot(myFut.x - aimS.x, myFut.z - aimS.z);
    const willBeAir = e.airborne || (eCast && eCast.skill === 'jump');
    if (api.ready('smash') && distLand < 3.45 && !willBeAir && !e.invulnerable) {
      const ang = Math.abs(V.angleTo(me.heading, V.toward(me, aimS)));
      if (ang < 1.45) {
        api.use('smash');
        api.faceAt(aimS.x, aimS.z);
        api.move(aimS.x - me.x, aimS.z - me.z);
        acted = true;
      }
    }
    if (!acted && api.ready('charge') && e.visible && !eSafe) {
      const wantClose = d > 4.2 && d < 12.5;
      const interrupt = eLaserCast && d > 2.6 && d < 13.0;
      if (wantClose || interrupt) {
        const tt = 0.34 + Math.min(0.8, d / 15);
        const aim = pred(e, tt * 0.85);
        if (!blocked(me, aim, obs, 0.9)) {
          api.use('charge');
          api.faceAt(aim.x, aim.z);
          api.move(aim.x - me.x, aim.z - me.z);
          acted = true;
          if (p.t - lastSay > 6) { lastSay = p.t; api.say("come here, squid"); }
        }
      }
    }
  }

  // ---- movement ----
  let moved = acted;

  if (!moved && eLaserCast && d > 3.6 && eCast.remaining > 0.18) {
    const reach = Math.min(3.2, Math.max(1.2, 5.0 * eCast.remaining));
    const spot = coverMove(me, e, obs, reach);
    if (spot) {
      api.move(spot.x - me.x, spot.z - me.z);
      moved = true;
    }
  }

  if (!moved) {
    let tgt;
    if (e.airborne && eCast) tgt = pred(e, Math.min(0.6, eCast.remaining || 0.3));
    else tgt = pred(e, Math.min(0.45, d / 10));

    if (p.t < sideUntil) {
      const dir = V.toward(me, e);
      const per = V.perp(dir);
      tgt = { x: me.x + dir.x * 1.5 + per.x * 3.5 * sideSign, z: me.z + dir.z * 1.5 + per.z * 3.5 * sideSign };
      api.move(tgt.x - me.x, tgt.z - me.z);
    } else if (blocked(me, tgt, obs, me.radius * 0.85)) {
      let wp = null;
      const path = api.pathTo(tgt.x, tgt.z);
      if (path && path.points) {
        for (const q of path.points) {
          if (Math.hypot(q.x - me.x, q.z - me.z) > 0.8) { wp = q; break; }
        }
      }
      if (wp) api.move(wp.x - me.x, wp.z - me.z);
      else api.moveTo(tgt.x, tgt.z);
    } else {
      api.move(tgt.x - me.x, tgt.z - me.z);
    }
  }

  if (!acted) {
    const f = pred(e, 0.2);
    api.faceAt(f.x, f.z);
  }
}
