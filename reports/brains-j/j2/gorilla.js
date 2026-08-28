const PAD = 0.12;

function segHitsBox(ax, az, bx, bz, box, pad) {
  const minx = box.x - box.hx - pad, maxx = box.x + box.hx + pad;
  const minz = box.z - box.hz - pad, maxz = box.z + box.hz + pad;
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

function clearLine(p, ax, az, bx, bz) {
  for (const o of p.arena.obstacles) if (segHitsBox(ax, az, bx, bz, o, PAD)) return false;
  return true;
}

function pointFree(p, x, z, pad) {
  const h = p.arena.half;
  if (Math.abs(x) > h - pad || Math.abs(z) > h - pad) return false;
  for (const o of p.arena.obstacles) {
    if (Math.abs(x - o.x) < o.hx + pad && Math.abs(z - o.z) < o.hz + pad) return false;
  }
  return true;
}

function leadPos(en, t) {
  return { x: en.x + en.vx * t, z: en.z + en.vz * t };
}

function chargeAim(p) {
  const me = p.self, en = p.enemy;
  const gap = Math.max(0, en.dist - me.radius - en.radius);
  const t = 0.28 + gap / 15;
  return { x: en.x + en.vx * t * 0.75, z: en.z + en.vz * t * 0.75 };
}

function steer(p, api, dir) {
  const base = V.norm(dir);
  if (base.x === 0 && base.z === 0) { api.move(0, 0); return; }
  const offs = [0, 0.35, -0.35, 0.7, -0.7, 1.05, -1.05, 1.45, -1.45, 1.9, -1.9];
  for (const off of offs) {
    const d = V.rot(base, off);
    let r;
    try { r = api.ray(d.x, d.z, 2.6); } catch (e) { break; }
    if (!r || !r.hit || r.dist > 2.3) { api.move(d.x, d.z); return; }
  }
  api.move(base.x, base.z);
}

let strafeSign = 1;
let nextFlip = 2.0;
let lastLaserStart = -99;
let lastBlinkStart = -99;
let lastSay = -99;

function think(p, api) {
  try { brain(p, api); } catch (e) {
    try { api.moveTo(p.enemy.x, p.enemy.z); api.faceAt(p.enemy.x, p.enemy.z); } catch (e2) {}
  }
}

function brain(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en.alive) return;

  for (const ev of p.events) {
    if (ev.type === 'enemyStarted') {
      if (ev.skill === 'laser') lastLaserStart = p.t;
      if (ev.skill === 'blink') lastBlinkStart = p.t;
    }
    if (ev.type === 'blocked') { strafeSign = -strafeSign; nextFlip = p.t + 1.6; }
  }
  if (p.t > nextFlip) { strafeSign = api.rand() < 0.5 ? -1 : 1; nextFlip = p.t + 1.4 + api.rand() * 1.8; }

  if (me.stunned) return;

  const d = en.dist;
  const cast = me.casting;

  if (me.airborne) {
    api.faceAt(en.x, en.z);
    return;
  }

  // committed skills
  if (cast && cast.skill === 'charge') {
    if (cast.phase === 'windup') {
      const aim = chargeAim(p);
      api.face(aim.x - me.x, aim.z - me.z);
      api.move(aim.x - me.x, aim.z - me.z);
    }
    return;
  }
  if (cast && cast.skill === 'smash') {
    if (cast.phase === 'windup') {
      const lp = leadPos(en, Math.max(0.05, cast.remaining));
      api.faceAt(lp.x, lp.z);
      if (d > 2.4) api.move(en.x - me.x, en.z - me.z); else api.move(0, 0);
      return;
    }
  }

  // facing: always track a slightly led enemy
  const fp = leadPos(en, 0.22);
  api.faceAt(fp.x, fp.z);

  const enemyCasting = en.casting && en.casting.skill === 'laser' && en.casting.telegraph;
  const laserSoon = (p.t - lastLaserStart) > 1.9;

  // ---------- offense ----------
  if (!me.busy) {
    // SMASH
    const pred = leadPos(en, 0.28);
    const pd = Math.hypot(pred.x - me.x, pred.z - me.z);
    let enemyGrounded = !en.airborne;
    if (en.airborne && en.casting && typeof en.casting.remaining === 'number' && en.casting.remaining <= 0.3) enemyGrounded = true;
    if (api.ready('smash') && enemyGrounded && pd < 4.25 && d < 4.6) {
      const angErr = Math.abs(V.angleTo(me.heading, V.norm({ x: pred.x - me.x, z: pred.z - me.z })));
      if (angErr < 1.5) {
        api.use('smash');
        return;
      }
    }

    // CHARGE
    if (api.ready('charge') && en.visible && d > 2.3 && d < 11.5) {
      const wantInterrupt = enemyCasting;
      const wantClose = d > 5.0;
      if (wantInterrupt || wantClose) {
        const aim = chargeAim(p);
        const dir = V.norm({ x: aim.x - me.x, z: aim.z - me.z });
        const ang = Math.abs(V.angleTo(me.heading, dir));
        if (ang < 0.9) {
          const r = api.ray(dir.x, dir.z, Math.min(12, d + 1.5));
          if (!r || !r.hit || r.dist > d - 1.4) {
            api.face(dir.x, dir.z);
            api.use('charge');
            if (p.t - lastSay > 6) { lastSay = p.t; api.say('SMASH THE SQUID'); }
            return;
          }
        }
      }
    }
  }

  // ---------- movement ----------
  const toE = V.norm({ x: en.x - me.x, z: en.z - me.z });
  const perp = { x: toE.z * strafeSign, z: -toE.x * strafeSign };

  if (!en.visible && d > 3.0) {
    // route around cover toward them
    api.moveTo(en.x, en.z);
    return;
  }

  // far, being lasered, no charge: try to break line of sight while closing
  if (enemyCasting && d > 7.0 && !api.ready('charge')) {
    let best = null, bestScore = 1e9;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const px = me.x + Math.sin(a) * 4.0, pz = me.z + Math.cos(a) * 4.0;
      if (!pointFree(p, px, pz, 1.5)) continue;
      if (clearLine(p, px, pz, en.x, en.z)) continue;
      if (!clearLine(p, me.x, me.z, px, pz)) continue;
      const sc = Math.hypot(px - en.x, pz - en.z);
      if (sc < bestScore) { bestScore = sc; best = { x: px, z: pz }; }
    }
    if (best) { steer(p, api, { x: best.x - me.x, z: best.z - me.z }); return; }
  }

  const desired = 2.9;
  let radial;
  if (d > desired + 0.5) radial = 1.0;
  else if (d < desired - 0.6) radial = -0.7;
  else radial = 0.12;

  let tan = 0.55;
  if (d > 6) tan = enemyCasting || laserSoon ? 0.75 : 0.30;
  if (d < 4.5) tan = 0.9;

  let dir = { x: toE.x * radial + perp.x * tan, z: toE.z * radial + perp.z * tan };

  // keep off the walls
  const h = p.arena.half;
  if (me.x > h - 2.5) dir.x -= 1.0;
  if (me.x < -h + 2.5) dir.x += 1.0;
  if (me.z > h - 2.5) dir.z -= 1.0;
  if (me.z < -h + 2.5) dir.z += 1.0;

  steer(p, api, dir);
}
