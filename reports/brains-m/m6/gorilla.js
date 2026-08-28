let orbitDir = 1;
let laserFireAt = -1;
let nextFlip = 0;

function predict(e, t, decay) {
  const k = decay === undefined ? 1 : decay;
  return { x: e.x + e.vx * t * k, z: e.z + e.vz * t * k };
}

function clearDir(api, me, dir, len) {
  const r = api.ray(dir.x, dir.z, len);
  if (r && r.hit && r.dist < len * 0.85) return false;
  const ax = me.x + dir.x * len, az = me.z + dir.z * len;
  if (Math.abs(ax) > 19.0 || Math.abs(az) > 19.0) return false;
  return true;
}

function coverPoint(p, me, en) {
  let best = null, bd = 1e9;
  for (const o of p.arena.obstacles) {
    const dir = V.norm({ x: o.x - en.x, z: o.z - en.z });
    if (dir.x === 0 && dir.z === 0) continue;
    const rad = Math.max(o.hx, o.hz) + 1.7;
    const pt = { x: o.x + dir.x * rad, z: o.z + dir.z * rad };
    if (Math.abs(pt.x) > 19 || Math.abs(pt.z) > 19) continue;
    const dd = Math.hypot(pt.x - me.x, pt.z - me.z);
    if (dd < bd) { bd = dd; best = pt; }
  }
  return bd < 5.5 ? best : null;
}

function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en.alive) return;
  const d = en.dist;

  for (const ev of p.events) {
    if (ev.type === 'enemyStarted' && ev.skill === 'laser') laserFireAt = p.t + 0.667;
    if (ev.type === 'blocked') { orbitDir = -orbitDir; nextFlip = p.t + 0.8; }
  }

  const ec = en.casting;
  const laserCast = !!(ec && ec.skill === 'laser' && ec.telegraph);

  // ---- committed states ----
  if (me.casting && me.casting.skill === 'charge') {
    if (me.casting.phase === 'windup') {
      const tau = Math.max(0, me.casting.remaining) + Math.min(0.8, d / 15);
      const tp = predict(en, tau, 0.8);
      api.face(tp.x - me.x, tp.z - me.z);
      api.move(tp.x - me.x, tp.z - me.z);
      return;
    }
    if (me.casting.phase === 'dash') return;
  }
  if (me.airborne) { api.faceAt(en.x, en.z); return; }
  if (me.stunned) return;

  const reach = me.radius + 2.9 + en.radius;
  const toE = V.norm({ x: en.x - me.x, z: en.z - me.z });

  // ---- skills ----
  let ordered = false;
  if (!me.busy) {
    const tp = predict(en, 0.3, 0.7);
    const pd = Math.hypot(tp.x - me.x, tp.z - me.z);
    const aim = { x: tp.x - me.x, z: tp.z - me.z };
    const ang = Math.abs(V.angleTo(me.heading, aim));
    const enemyAirLong = en.airborne && (!ec || ec.remaining > 0.3);

    if (api.ready('smash') && !enemyAirLong && (en.visible || d < 2.8) &&
        (pd <= reach - 0.3 || d <= 3.2) && ang < 1.15) {
      api.use('smash');
      ordered = true;
    } else if (api.ready('charge') && en.visible && !en.invulnerable && d > 2.9 && d < 11.5) {
      const tau = 0.3 + Math.min(0.8, d / 15);
      const tp2 = predict(en, tau, 0.75);
      const dir = V.norm({ x: tp2.x - me.x, z: tp2.z - me.z });
      const r = api.ray(dir.x, dir.z, Math.min(13, d + 1.0));
      const clear = !r || !r.hit || r.dist > d - 1.2;
      const worth = laserCast || d > 4.6 || !api.ready('smash') || api.cooldown('smash') > 0.5;
      if (clear && worth && Math.abs(V.angleTo(me.heading, dir)) < 1.7) {
        api.use('charge');
        api.face(dir.x, dir.z);
        api.move(dir.x, dir.z);
        return;
      }
    }
  }

  // ---- facing ----
  const fp = predict(en, 0.22, 0.7);
  api.faceAt(fp.x, fp.z);

  // ---- movement ----
  if (!en.visible) {
    const cp = api.pathTo(en.x, en.z);
    if (cp && cp.points && cp.points.length && !cp.direct) {
      const nxt = cp.points[0];
      api.moveTo(nxt.x, nxt.z);
    } else {
      api.moveTo(en.x, en.z);
    }
    return;
  }

  if (laserCast && d > 5.5 && !ordered) {
    const cp = coverPoint(p, me, en);
    if (cp) { api.moveTo(cp.x, cp.z); return; }
  }

  if (p.t > nextFlip && api.rand() < 0.12) { orbitDir = -orbitDir; nextFlip = p.t + 1.2; }

  const desired = 2.25;
  const tang = V.perp(toE);
  const build = (od) => {
    if (d > 6.5) {
      return V.norm(V.add(toE, V.scale(tang, od * 0.25)));
    }
    const radial = d > desired + 0.5 ? 1.0 : (d < desired - 0.4 ? -0.85 : 0.25);
    return V.norm(V.add(V.scale(toE, radial), V.scale(tang, od * 1.0)));
  };

  let mv = build(orbitDir);
  if (!clearDir(api, me, mv, 2.2)) {
    orbitDir = -orbitDir;
    mv = build(orbitDir);
    if (!clearDir(api, me, mv, 2.2)) {
      if (clearDir(api, me, toE, 2.2)) mv = toE;
      else {
        const c = V.norm({ x: -me.x, z: -me.z });
        mv = (c.x === 0 && c.z === 0) ? toE : c;
      }
    }
  }
  api.move(mv.x, mv.z);
}
