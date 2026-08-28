function intercept(me, en, speed, delay) {
  const vx = (en.vx || 0) * 0.7, vz = (en.vz || 0) * 0.7;
  let t = delay + Math.hypot(en.x - me.x, en.z - me.z) / speed;
  for (let i = 0; i < 3; i++) {
    const px = en.x + vx * t, pz = en.z + vz * t;
    t = delay + Math.hypot(px - me.x, pz - me.z) / speed;
  }
  const tc = Math.min(t, delay + 0.85);
  return { x: en.x + vx * tc, z: en.z + vz * tc };
}

function nearestObstacle(p, x, z) {
  let best = null, bd = 1e9;
  for (const o of p.arena.obstacles) {
    const dx = o.x - x, dz = o.z - z;
    const dd = Math.hypot(dx, dz);
    if (dd < bd) { bd = dd; best = o; }
  }
  return { o: best, d: bd };
}

function clampArena(x, z, half) {
  const l = half - 1.6;
  return { x: Math.max(-l, Math.min(l, x)), z: Math.max(-l, Math.min(l, z)) };
}

function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me || !me.alive) return;
  if (!en) { api.move(0, 0); return; }

  const d = en.dist;
  const toE = V.toward(me, en);
  const side = V.perp(toE);

  let blocked = 0, tookLaser = false;
  for (const ev of p.events) {
    if (ev.type === 'blocked') blocked++;
    if (ev.type === 'damaged' && ev.skill === 'laser') tookLaser = true;
  }
  if (blocked) api.remember('blk', Math.min(12, api.recall('blk', 0) + 1));
  else api.remember('blk', Math.max(0, api.recall('blk', 0) - 1));
  if (tookLaser) api.remember('hits', api.recall('hits', 0) + 1);

  if (me.stunned || me.airborne) return;

  const eCast = en.casting || null;
  const eLaser = !!(eCast && eCast.skill === 'laser' && eCast.telegraph);

  // ---- while one of our own skills is running ----
  if (me.busy && me.casting) {
    const c = me.casting;
    const rem = Math.max(0, Math.min(c.remaining || 0, 0.6));
    if (c.skill === 'charge' && c.phase === 'windup') {
      const aim = intercept(me, en, 15, rem);
      api.face(aim.x - me.x, aim.z - me.z);
      api.move(toE.x, toE.z);
      return;
    }
    if (c.skill === 'smash' && c.phase === 'windup') {
      const t = Math.min(rem, 0.28);
      api.faceAt(en.x + (en.vx || 0) * t * 0.8, en.z + (en.vz || 0) * t * 0.8);
      if (d > 2.5) api.move(toE.x, toE.z); else api.move(0, 0);
      return;
    }
    if (c.phase === 'dash' || c.phase === 'air') return;
    // recovery: keep pressing
    api.faceAt(en.x, en.z);
    if (d > 2.7) api.move(toE.x, toE.z); else api.move(toE.x * 0.4, toE.z * 0.4);
    return;
  }

  // ---- default facing: lead them slightly ----
  api.faceAt(en.x + (en.vx || 0) * 0.18, en.z + (en.vz || 0) * 0.18);

  // ---- SMASH ----
  const smashLimit = (en.stunned || (eCast && eCast.telegraph) || en.speed < 1.2) ? 4.3 : 3.6;
  if (api.ready('smash') && d <= smashLimit && !en.airborne) {
    const ang = Math.abs(V.angleTo(me.heading, toE));
    if (ang < 1.3) {
      api.use('smash');
      api.move(toE.x, toE.z);
      return;
    }
  }

  // ---- CHARGE ----
  if (api.ready('charge') && en.visible && !en.airborne) {
    const inRange = d >= 3.4 && d <= 11.5;
    const interruptOpp = eLaser && d >= 2.2 && d <= 12.0;
    if (inRange || interruptOpp) {
      const aim = intercept(me, en, 15, 0.34);
      const dir = V.toward(me, aim);
      if (dir.x !== 0 || dir.z !== 0) {
        const r = api.ray(dir.x, dir.z, Math.min(13, d + 2));
        const clear = !r || !r.hit || r.dist >= d - en.radius - 0.5;
        const need = Math.abs(V.angleTo(me.heading, dir));
        if (clear && need < 1.05) {
          api.use('charge');
          api.face(dir.x, dir.z);
          api.move(toE.x, toE.z);
          return;
        }
        if (clear) {
          // turn into position first, keep closing
          api.face(dir.x, dir.z);
        }
      }
    }
  }

  // ---- MOVEMENT ----
  if (d < 4.2) {
    // melee: shove in, heavier body wins contact; small orbit to stay on them
    let s = api.recall('orbit', 1);
    if (blocked) { s = -s; api.remember('orbit', s); }
    api.move(toE.x + side.x * 0.35 * s, toE.z + side.z * 0.35 * s);
    return;
  }

  if (eLaser && d > 4.2 && en.visible) {
    // beam incoming: break the line if cover is close, else close hard off-axis
    const nb = nearestObstacle(p, me.x, me.z);
    let s;
    if (nb.o && nb.d < 9) {
      const dirO = { x: nb.o.x - me.x, z: nb.o.z - me.z };
      s = V.dot(side, dirO) >= 0 ? 1 : -1;
    } else {
      s = api.recall('orbit', 1);
    }
    api.remember('orbit', s);
    const mv = { x: toE.x * 0.6 + side.x * s * 1.0, z: toE.z * 0.6 + side.z * s * 1.0 };
    const tgt = clampArena(me.x + mv.x * 4, me.z + mv.z * 4, p.arena.half);
    api.move(tgt.x - me.x, tgt.z - me.z);
    return;
  }

  const path = api.pathTo(en.x, en.z);
  if (!en.visible || (path && !path.direct) || api.recall('blk', 0) > 3) {
    api.moveTo(en.x, en.z);
    return;
  }

  const w = Math.sin(p.t * 2.3) * (d > 9 ? 0.5 : 0.18);
  api.move(toE.x + side.x * w, toE.z + side.z * w);
}
