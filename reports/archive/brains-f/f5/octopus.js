function think(p, api) {
  const me = p.self, e = p.enemy;
  if (!me || !me.alive) return;
  if (!e || !e.alive) { api.stop(); return; }

  const dist = e.dist;
  const mePos = { x: me.x, z: me.z };
  const ePos = { x: e.x, z: e.z };
  const toE = V.toward(mePos, ePos);
  const away = { x: -toE.x, z: -toE.z };

  // ---- events -------------------------------------------------------
  for (const ev of p.events) {
    if (ev.type === 'blocked' && p.t - lastFlip > 0.35) { orbit = -orbit; lastFlip = p.t; }
    if (ev.type === 'damaged') { lastHurt = p.t; }
    if (ev.type === 'knockback') { lastHurt = p.t; }
    if (ev.type === 'enemyStarted' && ev.skill === 'charge') { chargeSeen = p.t; }
  }
  if (!said && p.t > 0.5) { said = true; api.say("eight arms, one beam"); }

  if (me.airborne || me.stunned) { api.faceAt(e.x, e.z); return; }

  // ---- aim prediction ------------------------------------------------
  const castLeft = (me.casting && me.casting.skill === 'laser' && me.casting.telegraph)
    ? Math.max(0.05, me.casting.remaining || 0.3) : 0.55;
  const aim = predictEnemy(p, castLeft);
  api.faceAt(aim.x, aim.z);

  // ---- threat: charge dash -------------------------------------------
  let dash = null;
  if (e.casting && e.casting.skill === 'charge' &&
      (e.casting.phase === 'dash' || e.casting.phase === 'strike')) {
    let dir = (e.speed > 2) ? V.norm({ x: e.vx, z: e.vz }) : V.fromHeading(e.heading);
    const rel = { x: me.x - e.x, z: me.z - e.z };
    const along = V.dot(rel, dir);
    const perpv = { x: dir.z, z: -dir.x };
    const lat = V.dot(rel, perpv);
    if (along > -1.5 && Math.abs(lat) < 3.4) {
      dash = {
        dir, perpv,
        time: Math.max(0, (along - 2.4) / 15),
        side: lat >= 0 ? 1 : -1
      };
    }
  }
  const chargeWind = !!(e.casting && e.casting.skill === 'charge' && e.casting.phase === 'windup');

  // ---- threat: smash --------------------------------------------------
  let smashLand = -1;
  if (e.casting && e.casting.skill === 'smash' && e.casting.telegraph) {
    smashLand = (e.casting.phase === 'windup')
      ? Math.max(0, 0.28 - (e.casting.elapsed || 0)) : 0;
  }
  const smashDanger = smashLand >= 0 && dist < 5.2;

  // ================= EMERGENCY: incoming dash ==========================
  if (dash) {
    const side1 = V.scale(dash.perpv, dash.side);
    const side2 = V.scale(dash.perpv, -dash.side);
    const back1 = V.norm(V.add(V.scale(side1, 1.0), V.scale(dash.dir, -0.45)));
    if (!me.busy && api.ready('blink') && dash.time < 0.55) {
      const cands = [side1, back1, side2, away];
      const best = bestLanding(p, api, cands, ePos);
      if (best) {
        api.use('blink', best.dir.x, best.dir.z);
        api.move(best.dir.x, best.dir.z);
        return;
      }
    }
    const steer = pickDir(p, api, V.norm(V.add(side1, V.scale(away, 0.25))));
    api.move(steer.x, steer.z);
    return;
  }

  // ================= EMERGENCY: smash about to land ====================
  if (smashDanger) {
    if (!me.busy && api.ready('jump') && smashLand >= 0.12 && smashLand <= 0.30) {
      const steer = pickDir(p, api, away);
      api.move(steer.x, steer.z);
      api.use('jump');
      return;
    }
    if (!me.busy && api.ready('blink')) {
      const cands = [away, V.norm(V.add(away, V.perp(toE))), V.norm(V.sub(away, V.perp(toE)))];
      const best = bestLanding(p, api, cands, ePos);
      if (best) {
        api.use('blink', best.dir.x, best.dir.z);
        api.move(best.dir.x, best.dir.z);
        return;
      }
    }
    const steer = pickDir(p, api, away);
    api.move(steer.x, steer.z);
    return;
  }

  // ================= too close: break away with blink ==================
  if (!me.busy && dist < 4.3 && api.ready('blink')) {
    const cands = [away, V.norm(V.add(away, V.scale(V.perp(toE), 0.8))),
                   V.norm(V.sub(away, V.scale(V.perp(toE), 0.8)))];
    const best = bestLanding(p, api, cands, ePos);
    if (best && V.dist(best.land, ePos) > dist + 2.0) {
      api.use('blink', best.dir.x, best.dir.z);
      api.move(best.dir.x, best.dir.z);
      return;
    }
  }

  // ================= laser =============================================
  const canFire = api.ready('laser') && !me.busy;
  if (canFire && e.visible && dist <= 21.5 && dist >= 1.8) {
    const okAngle = Math.abs(V.angleTo(me.heading, V.toward(mePos, aim))) < 1.35;
    const dangerous = (chargeWind && dist < 9.5) || (smashLand >= 0 && dist < 7);
    if (okAngle && !dangerous && api.los(aim.x, aim.z)) {
      api.use('laser');
    }
  }

  // ================= movement ==========================================
  const laserCd = api.cooldown('laser');
  let radial;
  if (dist < 6.5) radial = 1.5;
  else if (dist < 10) radial = 0.9;
  else if (dist < 13.5) radial = 0.3;
  else if (dist > 18.5) radial = -0.7;
  else radial = 0.05;

  if (!e.visible) {
    if (laserCd < 0.35) radial = Math.min(radial, -0.55);
    else radial = Math.max(radial, 0.3);
  }
  if (chargeWind && dist < 14) radial = Math.max(radial, 0.8);

  let tan = V.scale(V.perp(toE), orbit);
  // flip orbit if that way is blocked
  const tprobe = api.ray(tan.x, tan.z, 5.5);
  if (tprobe.dist < 2.6 && p.t - lastFlip > 0.5) { orbit = -orbit; lastFlip = p.t; tan = V.scale(tan, -1); }

  let desired = V.add(V.scale(away, radial), V.scale(tan, 1.0));

  // pull off the walls
  const wx = Math.abs(me.x), wz = Math.abs(me.z);
  if (wx > 13.5) desired = V.add(desired, { x: -Math.sign(me.x) * (wx - 13.5) * 0.42, z: 0 });
  if (wz > 13.5) desired = V.add(desired, { x: 0, z: -Math.sign(me.z) * (wz - 13.5) * 0.42 });

  desired = V.norm(desired);
  if (desired.x === 0 && desired.z === 0) desired = away;
  const steer = pickDir(p, api, desired);
  api.move(steer.x, steer.z);
}

// ---------------- persistent state --------------------------------------
let orbit = 1;
let lastFlip = 0;
let lastHurt = -99;
let chargeSeen = -99;
let said = false;

const NDIRS = 16;

function predictEnemy(p, t) {
  const e = p.enemy;
  let f = 0.85;
  if (e.casting && e.casting.skill === 'charge' && e.casting.phase === 'dash') f = 1.0;
  if (e.speed < 0.4) f = 0;
  let x = e.x + e.vx * t * f;
  let z = e.z + e.vz * t * f;
  x = Math.max(-19.4, Math.min(19.4, x));
  z = Math.max(-19.4, Math.min(19.4, z));
  return { x, z };
}

function inBlock(o, x, z, m) {
  return Math.abs(x - o.x) <= o.hx + m && Math.abs(z - o.z) <= o.hz + m;
}

function landingFor(p, dir, maxD) {
  const n = V.norm(dir);
  if (n.x === 0 && n.z === 0) return null;
  for (let d = maxD; d >= 1.2; d -= 0.6) {
    const x = p.self.x + n.x * d;
    const z = p.self.z + n.z * d;
    if (Math.abs(x) > 18.9 || Math.abs(z) > 18.9) continue;
    let ok = true;
    for (const o of p.arena.obstacles) { if (inBlock(o, x, z, 1.3)) { ok = false; break; } }
    if (ok) return { x, z, d, dir: n };
  }
  return null;
}

function bestLanding(p, api, cands, ePos) {
  let best = null, bestScore = -1e9;
  for (const c of cands) {
    const L = landingFor(p, c, 7.5);
    if (!L) continue;
    const d = V.dist({ x: L.x, z: L.z }, ePos);
    const edge = Math.min(20 - Math.abs(L.x), 20 - Math.abs(L.z));
    const s = d * 1.0 + Math.min(edge, 6) * 0.55 + L.d * 0.2;
    if (s > bestScore) { bestScore = s; best = { dir: L.dir, land: { x: L.x, z: L.z }, score: s }; }
  }
  return best;
}

function pickDir(p, api, desired) {
  let best = desired, bestScore = -1e9;
  for (let i = 0; i < NDIRS; i++) {
    const a = (i * 2 * Math.PI) / NDIRS;
    const d = { x: Math.sin(a), z: Math.cos(a) };
    const r = api.ray(d.x, d.z, 4.0);
    const clear = Math.min(r.dist === undefined ? 4 : r.dist, 4.0);
    let s = V.dot(d, desired) * 2.4 + (clear / 4.0) * 1.1;
    if (clear < 1.6) s -= (1.6 - clear) * 3.4;
    const nx = p.self.x + d.x * 2.5, nz = p.self.z + d.z * 2.5;
    if (Math.abs(nx) > 18 || Math.abs(nz) > 18) s -= 2.2;
    if (s > bestScore) { bestScore = s; best = d; }
  }
  return best;
}
