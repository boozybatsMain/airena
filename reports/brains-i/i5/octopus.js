const IDEAL = 13.5;
let strafeSign = 1;
let lastCharge = -99, lastSmash = -99, lastEJump = -99;
let lastFlip = -99;
let laserReadyAt = 0;
let lastVisible = 0;
let lastSay = -99;

function nrm(v) {
  const l = Math.hypot(v.x, v.z);
  return l > 1e-6 ? { x: v.x / l, z: v.z / l } : { x: 0, z: 1 };
}

function inArena(x, z, m) {
  return Math.abs(x) < 20 - m && Math.abs(z) < 20 - m;
}

function pickBlink(p, api, base, en) {
  const me = { x: p.self.x, z: p.self.z };
  let best = base, bestS = -1e9;
  for (let i = -3; i <= 3; i++) {
    const a = i * 0.45;
    const d = { x: base.x * Math.cos(a) + base.z * Math.sin(a), z: base.z * Math.cos(a) - base.x * Math.sin(a) };
    const lx = me.x + d.x * 7.2, lz = me.z + d.z * 7.2;
    let s = Math.hypot(lx - en.x, lz - en.z);
    if (!inArena(lx, lz, 2.0)) s -= 14;
    s -= Math.abs(i) * 0.4;
    if (s > bestS) { bestS = s; best = d; }
  }
  return best;
}

function steer(p, api, desired) {
  const me = { x: p.self.x, z: p.self.z };
  let best = null, bestS = -1e9;
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8;
    const d = { x: Math.sin(a), z: Math.cos(a) };
    let open;
    try { open = Math.min(api.ray(d.x, d.z, 5).dist, 5); } catch (e) { open = 5; }
    if (open < 1.35) continue;
    let s = (d.x * desired.x + d.z * desired.z) * 4 + open * 0.45;
    const nx = me.x + d.x * 3.2, nz = me.z + d.z * 3.2;
    const m = Math.max(Math.abs(nx), Math.abs(nz));
    if (m > 16.5) s -= (m - 16.5) * 4;
    if (s > bestS) { bestS = s; best = d; }
  }
  return best || desired;
}

function think(p, api) {
  const S = p.self, E = p.enemy;
  if (!S.alive) return;

  for (const ev of p.events) {
    if (ev.type === 'enemyStarted') {
      if (ev.skill === 'charge') lastCharge = p.t;
      else if (ev.skill === 'smash') lastSmash = p.t;
      else if (ev.skill === 'jump') lastEJump = p.t;
    } else if (ev.type === 'blocked') {
      if (p.t - lastFlip > 0.4) { strafeSign = -strafeSign; lastFlip = p.t; }
    } else if (ev.type === 'damaged' || ev.type === 'contact') {
      if (p.t - lastFlip > 0.7) { strafeSign = -strafeSign; lastFlip = p.t; }
    }
  }

  const me = { x: S.x, z: S.z }, en = { x: E.x, z: E.z };
  const dist = E.dist;
  const away = nrm({ x: me.x - en.x, z: me.z - en.z });
  const perp = { x: away.z * strafeSign, z: -away.x * strafeSign };
  if (E.visible) lastVisible = p.t;

  const cdL = api.cooldown('laser');
  if (cdL > 0.001) laserReadyAt = p.t + cdL;
  const readySince = p.t - laserReadyAt;

  // ---------- aiming ----------
  if (S.casting && S.casting.skill === 'laser') {
    const lead = Math.max(0, 0.66 - (S.casting.elapsed || 0));
    api.faceAt(E.x + E.vx * lead * 0.95, E.z + E.vz * lead * 0.95);
  } else {
    const lead = Math.min(0.3, dist / 55);
    api.faceAt(E.x + E.vx * lead, E.z + E.vz * lead);
  }

  // ---------- threat analysis ----------
  let threat = null;
  if (E.casting && E.casting.skill === 'charge') {
    const dir = V.fromHeading(E.heading);
    const rel = { x: me.x - en.x, z: me.z - en.z };
    const along = rel.x * dir.x + rel.z * dir.z;
    const latv = { x: rel.x - dir.x * along, z: rel.z - dir.z * along };
    const lat = Math.hypot(latv.x, latv.z);
    threat = { dir, along, lat, latv, phase: E.casting.phase };
  }
  const smashThreat = E.casting && E.casting.skill === 'smash' && E.casting.telegraph;

  let moveOverride = null;
  const canAct = !S.busy && !S.stunned && !S.airborne;

  // ---------- reactions ----------
  let acted = false;
  if (canAct) {
    if (threat && threat.along > -2.5 && threat.along < 14 && threat.lat < 3.4) {
      const side = threat.lat > 0.35 ? nrm(threat.latv) : { x: threat.dir.z, z: -threat.dir.x };
      const esc = nrm({ x: side.x * 1.0 + away.x * 0.35, z: side.z * 1.0 + away.z * 0.35 });
      if (threat.phase === 'dash' && api.ready('blink')) {
        const d = pickBlink(p, api, esc, en);
        api.use('blink', d.x, d.z);
        acted = true;
        if (p.t - lastSay > 3) { api.say("not there"); lastSay = p.t; }
      } else {
        moveOverride = esc;
      }
    } else if (smashThreat && dist < 5.4) {
      if (api.ready('blink')) {
        const d = pickBlink(p, api, away, en);
        api.use('blink', d.x, d.z);
        acted = true;
      } else if (api.ready('jump')) {
        api.move(away.x, away.z);
        api.use('jump');
        acted = true;
        moveOverride = away;
      } else {
        moveOverride = nrm({ x: away.x + perp.x * 0.8, z: away.z + perp.z * 0.8 });
      }
    } else if (dist < 4.6 && api.ready('blink')) {
      const d = pickBlink(p, api, nrm({ x: away.x + perp.x * 0.5, z: away.z + perp.z * 0.5 }), en);
      api.use('blink', d.x, d.z);
      acted = true;
    }
  }

  // ---------- laser ----------
  if (!acted && canAct && api.ready('laser')) {
    const lead = 0.66;
    const aim = { x: E.x + E.vx * lead * 0.95, z: E.z + E.vz * lead * 0.95 };
    const toAim = nrm({ x: aim.x - me.x, z: aim.z - me.z });
    const off = Math.abs(V.angleTo(S.heading, toAim));
    const relv = { x: E.vx, z: E.vz };
    const radial = relv.x * -away.x + relv.z * -away.z;
    const latSpeed = Math.abs(relv.x * perp.x + relv.z * perp.z);
    const enemyAir = E.airborne;
    const chargeWind = E.casting && E.casting.skill === 'charge';
    let ok = E.visible && dist > 2.6 && dist < 21 && off < 0.75 && !E.invulnerable && !enemyAir && !chargeWind;
    if (ok) ok = api.los(aim.x, aim.z);
    if (ok && latSpeed > 2.9 && readySince < 0.9 && dist > 11) ok = false;
    if (ok && dist < 7.5 && (p.t - lastCharge) > 3.85 && readySince < 0.5) ok = false;
    if (ok) {
      api.use('laser');
      acted = true;
      if (p.t - lastSay > 5) { api.say("eight arms, one beam"); lastSay = p.t; }
    }
  }

  // ---------- movement ----------
  let desired;
  if (moveOverride) {
    desired = moveOverride;
  } else {
    const noVis = !E.visible;
    if (noVis && dist > 9.5) {
      let wp = null;
      const path = api.pathTo(E.x, E.z);
      if (path && path.points && path.points.length) wp = path.points[0];
      if (wp) desired = nrm({ x: wp.x - me.x, z: wp.z - me.z });
      else desired = nrm({ x: -away.x, z: -away.z });
    } else if (noVis) {
      desired = nrm({ x: perp.x * 1.2 + away.x * 0.3, z: perp.z * 1.2 + away.z * 0.3 });
    } else {
      let rw;
      if (dist < IDEAL - 2.5) rw = 1.25;
      else if (dist > IDEAL + 3.5) rw = -0.85;
      else rw = 0.2;
      if (S.casting && S.casting.skill === 'laser') rw = Math.max(rw, 0.35);
      const cdist = Math.hypot(me.x, me.z);
      const cw = cdist > 12 ? Math.min(1.6, (cdist - 12) * 0.35) : 0;
      const toC = cdist > 0.01 ? { x: -me.x / cdist, z: -me.z / cdist } : { x: 0, z: 0 };
      desired = nrm({
        x: away.x * rw + perp.x * 1.0 + toC.x * cw,
        z: away.z * rw + perp.z * 1.0 + toC.z * cw
      });
    }
  }

  if (!S.airborne) {
    const d = steer(p, api, desired);
    api.move(d.x, d.z);
  }
}
