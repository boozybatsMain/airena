function predict(e, t) { return { x: e.x + e.vx * t, z: e.z + e.vz * t }; }

function segAABB(x0, z0, x1, z1, minx, minz, maxx, maxz) {
  const dx = x1 - x0, dz = z1 - z0;
  let t0 = 0, t1 = 1;
  for (let i = 0; i < 2; i++) {
    const d = i ? dz : dx;
    const s = i ? z0 : x0;
    const lo = i ? minz : minx;
    const hi = i ? maxz : maxx;
    if (Math.abs(d) < 1e-9) {
      if (s < lo || s > hi) return false;
    } else {
      let ta = (lo - s) / d, tb = (hi - s) / d;
      if (ta > tb) { const tmp = ta; ta = tb; tb = tmp; }
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
      if (t0 > t1) return false;
    }
  }
  return true;
}

function lineBlocked(ax, az, bx, bz, obs, pad) {
  for (const o of obs) {
    if (segAABB(ax, az, bx, bz, o.x - o.hx - pad, o.z - o.hz - pad, o.x + o.hx + pad, o.z + o.hz + pad)) return true;
  }
  return false;
}

function steer(api, dir) {
  if (!dir || (dir.x === 0 && dir.z === 0)) { api.move(0, 0); return; }
  const r = api.ray(dir.x, dir.z, 2.4);
  if (r.hit && r.dist < 1.9) {
    for (const a of [0.55, -0.55, 1.1, -1.1, 1.7, -1.7, 2.3, -2.3]) {
      const d = V.rot(dir, a);
      const rr = api.ray(d.x, d.z, 2.4);
      if (!rr.hit || rr.dist > 2.2) { api.move(d.x, d.z); return; }
    }
  }
  api.move(dir.x, dir.z);
}

let strafeSign = 1;
let lastFlip = 0;
let lastSay = -99;

function think(p, api) {
  const me = p.self, e = p.enemy;
  if (!me || !e || !me.alive || !e.alive) return;

  for (const ev of p.events) {
    if (ev.type === 'blocked') strafeSign = -strafeSign;
    else if (ev.type === 'damaged' && ev.skill === 'laser') strafeSign = -strafeSign;
    else if (ev.type === 'chargeStopped' && ev.reason !== 'enemy') strafeSign = -strafeSign;
  }
  if (p.t - lastFlip > 1.4) { lastFlip = p.t; if (api.rand() < 0.4) strafeSign = -strafeSign; }

  if (me.stunned) return;
  if (me.airborne) { api.faceAt(e.x, e.z); return; }

  const dist = e.dist;
  const toE = V.toward(me, e);

  const cast = me.casting;
  if (cast) {
    if (cast.skill === 'smash') {
      const q = predict(e, cast.phase === 'windup' ? Math.min(cast.remaining, 0.3) : 0);
      api.faceAt(q.x, q.z);
      const d = V.toward(me, q);
      if (dist > 2.7) api.move(d.x, d.z); else api.move(0, 0);
      return;
    }
    if (cast.skill === 'charge') {
      if (cast.phase === 'windup') {
        const tt = Math.min(cast.remaining + Math.max(0, dist - 2.0) / 15, 1.0);
        const q = predict(e, tt);
        api.faceAt(q.x, q.z);
        api.move(q.x - me.x, q.z - me.z);
      }
      return;
    }
    return;
  }

  const eCast = e.casting;
  const laserTele = !!(eCast && eCast.skill === 'laser' && eCast.telegraph);
  const laserLeft = laserTele ? eCast.remaining : 99;

  const myFut = { x: me.x + me.vx * 0.28, z: me.z + me.vz * 0.28 };
  const eFut = predict(e, 0.28);
  const dFut = V.dist(myFut, eFut);
  const dirFut = V.toward(myFut, eFut);
  const angFut = Math.abs(V.angleTo(me.heading, dirFut));

  // --- SMASH ---
  if (api.ready('smash') && !e.airborne && !e.invulnerable &&
      dFut < 4.7 && angFut < 1.15 && (dist < 3.0 || api.los(e.x, e.z))) {
    api.use('smash');
    api.faceAt(eFut.x, eFut.z);
    if (dist > 2.7) api.move(dirFut.x, dirFut.z); else api.move(0, 0);
    if (p.t - lastSay > 6) { lastSay = p.t; api.say("FISTS"); }
    return;
  }

  // --- CHARGE ---
  if (api.ready('charge') && !e.invulnerable && e.visible && dist > 2.0) {
    const rr = api.ray(toE.x, toE.z, Math.min(dist + 1.5, 14));
    const clear = !rr.hit || rr.dist > dist - 1.3;
    const punish = laserTele && dist <= 11.5;
    const closer = dist >= 4.2 && dist <= 11.0 && !e.airborne;
    if (clear && (punish || closer)) {
      api.use('charge');
      const tt = Math.min(0.28 + Math.max(0, dist - 2.0) / 15, 1.0);
      const q = predict(e, tt);
      api.faceAt(q.x, q.z);
      api.move(toE.x, toE.z);
      if (p.t - lastSay > 5) { lastSay = p.t; api.say(punish ? "SHUT IT" : "COMING"); }
      return;
    }
  }

  // --- MOVEMENT ---
  const lead = predict(e, Math.min(0.55, dist / 7));
  api.faceAt(eFut.x, eFut.z);

  if (!e.visible) {
    api.moveTo(lead.x, lead.z);
    return;
  }

  // cover-seek only if the beam is coming and we can't punish it
  if (laserTele && laserLeft > 0.18 && dist > 4.5) {
    const obs = p.arena.obstacles;
    let best = null, bestScore = -1e9;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const dir = { x: Math.sin(a), z: Math.cos(a) };
      const reach = Math.min(3.2, Math.max(1.5, laserLeft * 5));
      const cx = Math.max(-18.8, Math.min(18.8, me.x + dir.x * reach));
      const cz = Math.max(-18.8, Math.min(18.8, me.z + dir.z * reach));
      if (!lineBlocked(cx, cz, e.x, e.z, obs, 0)) continue;
      const r = api.ray(dir.x, dir.z, reach + 0.6);
      if (r.hit && r.dist < reach + 0.4) continue;
      const score = -V.dist({ x: cx, z: cz }, e) + 3 * V.dot(dir, toE);
      if (score > bestScore) { bestScore = score; best = dir; }
    }
    if (best) { api.move(best.x, best.z); return; }
  }

  let dir = V.toward(me, lead);
  if (dir.x === 0 && dir.z === 0) dir = toE;
  const perp = V.perp(dir);
  let w = 0.25;
  if (dist < 3.2) w = 0.6;
  else if (laserTele) w = 0.5;
  const mixed = V.norm({ x: dir.x + perp.x * strafeSign * w, z: dir.z + perp.z * strafeSign * w });

  // don't grind into walls
  const nx = me.x + mixed.x * 2.5, nz = me.z + mixed.z * 2.5;
  if (Math.abs(nx) > 19.2 || Math.abs(nz) > 19.2) strafeSign = -strafeSign;

  steer(api, mixed);
}
