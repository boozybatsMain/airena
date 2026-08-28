const CAST = 0.667;
const lastSkill = {};
let orbitSign = 1;
let flipT = 0;
let committedT = -99;
let committedDir = { x: 0, z: 1 };
let saidT = -99;

function segDist(pt, a, b) {
  const vx = b.x - a.x, vz = b.z - a.z;
  const L2 = vx * vx + vz * vz;
  let t = L2 > 0 ? ((pt.x - a.x) * vx + (pt.z - a.z) * vz) / L2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(pt.x - (a.x + vx * t), pt.z - (a.z + vz * t));
}

function chargeReadyEst(p) {
  const l = lastSkill['charge'];
  if (l === undefined) return true;
  return (p.t - l) >= 3.85;
}

function scoreDir(p, api, d, desired) {
  const s = p.self;
  let sc = (d.x * desired.x + d.z * desired.z) * 3;
  const px = s.x + d.x * 3.5, pz = s.z + d.z * 3.5;
  const h = p.arena.half;
  const m = Math.min(h - Math.abs(px), h - Math.abs(pz));
  if (m < 3.0) sc -= (3.0 - m) * 1.8;
  let r;
  try { r = api.ray(d.x, d.z, 3.5); } catch (err) { r = null; }
  if (r && r.dist < 3.0) sc -= (3.0 - r.dist) * 1.6;
  return sc;
}

function pickMove(p, api, desired) {
  if (desired.x === 0 && desired.z === 0) return { x: 0, z: 0 };
  let best = desired, bs = -1e9;
  for (let i = 0; i < 20; i++) {
    const a = i * Math.PI / 10;
    const d = { x: Math.sin(a), z: Math.cos(a) };
    const sc = scoreDir(p, api, d, desired);
    if (sc > bs) { bs = sc; best = d; }
  }
  return best;
}

function bestEscape(p, api, ax, az) {
  let best = { x: 0, z: 1 }, bs = -1e9;
  const s = p.self;
  const h = p.arena.half - 1.4;
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8;
    const d = { x: Math.sin(a), z: Math.cos(a) };
    let lx = s.x + d.x * 7.5, lz = s.z + d.z * 7.5, pen = 0;
    if (Math.abs(lx) > h) { pen += (Math.abs(lx) - h) * 2.5; lx = (lx > 0 ? 1 : -1) * h; }
    if (Math.abs(lz) > h) { pen += (Math.abs(lz) - h) * 2.5; lz = (lz > 0 ? 1 : -1) * h; }
    const de = Math.min(Math.hypot(lx - ax, lz - az), 15);
    const cen = -Math.hypot(lx, lz) * 0.12;
    const sc = de - pen + cen;
    if (sc > bs) { bs = sc; best = d; }
  }
  return best;
}

function bestDodgeLine(p, api, e, cd) {
  const A = { x: e.x, z: e.z };
  const B = { x: e.x + cd.x * 12.5, z: e.z + cd.z * 12.5 };
  const s = p.self;
  const h = p.arena.half - 1.4;
  let best = { x: -cd.x, z: -cd.z }, bs = -1e9;
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8;
    const d = { x: Math.sin(a), z: Math.cos(a) };
    let lx = s.x + d.x * 7.5, lz = s.z + d.z * 7.5, pen = 0;
    if (Math.abs(lx) > h) { pen += (Math.abs(lx) - h) * 2.5; lx = (lx > 0 ? 1 : -1) * h; }
    if (Math.abs(lz) > h) { pen += (Math.abs(lz) - h) * 2.5; lz = (lz > 0 ? 1 : -1) * h; }
    const dl = Math.min(segDist({ x: lx, z: lz }, A, B), 9);
    const de = Math.min(Math.hypot(lx - e.x, lz - e.z), 14);
    const sc = dl * 2.2 + de * 0.5 - pen - Math.hypot(lx, lz) * 0.08;
    if (sc > bs) { bs = sc; best = d; }
  }
  return best;
}

function think(p, api) {
  const s = p.self, e = p.enemy;
  if (!s.alive || !e.alive) return;

  for (const ev of p.events) {
    if (ev.type === 'enemyStarted') lastSkill[ev.skill] = p.t;
    else if (ev.type === 'enemyCommitted') {
      committedT = p.t;
      committedDir = V.fromHeading(e.heading);
    } else if (ev.type === 'blocked') { orbitSign = -orbitSign; flipT = p.t; }
  }
  if (p.t - flipT > 2.5 && api.rand() < 0.04) { orbitSign = -orbitSign; flipT = p.t; }

  if (p.t - saidT > 6) { saidT = p.t; api.say("eight arms, one beam"); }

  const dist = Math.max(0.001, e.dist);
  const toE = { x: (e.x - s.x) / dist, z: (e.z - s.z) / dist };
  const away = { x: -toE.x, z: -toE.z };
  const tang = { x: toE.z * orbitSign, z: -toE.x * orbitSign };

  // aim point (lead)
  let leadT = 0.15;
  if (s.casting && s.casting.skill === 'laser' && s.casting.telegraph) leadT = s.casting.remaining;
  else if (api.ready('laser')) leadT = CAST;
  let ax = e.x + e.vx * leadT, az = e.z + e.vz * leadT;
  const hh = p.arena.half - 0.8;
  ax = Math.max(-hh, Math.min(hh, ax));
  az = Math.max(-hh, Math.min(hh, az));
  if (!api.los(ax, az)) { ax = e.x; az = e.z; }

  if (s.stunned) { api.faceAt(ax, az); return; }
  if (s.airborne) { api.faceAt(ax, az); return; }

  const eCast = e.casting;
  const charging = !!eCast && eCast.skill === 'charge';
  const committed = (charging && eCast.phase !== 'windup') || (p.t - committedT < 0.5);
  const nearCommit = charging && eCast.phase === 'windup' && eCast.remaining < 0.12;
  const smashing = !!eCast && eCast.skill === 'smash' && eCast.telegraph;

  // --- committed charge: get off the line ---
  if (committed && dist < 16) {
    let cd = (e.speed > 6) ? V.norm({ x: e.vx, z: e.vz }) : V.fromHeading(e.heading);
    if (p.t - committedT < 0.5 && e.speed <= 6) cd = committedDir;
    const lineD = segDist({ x: s.x, z: s.z }, { x: e.x, z: e.z },
      { x: e.x + cd.x * 12.5, z: e.z + cd.z * 12.5 });
    if (lineD < 3.2) {
      if (api.ready('blink') && !s.busy) {
        const d = bestDodgeLine(p, api, e, cd);
        api.use('blink', d.x, d.z);
        api.move(d.x, d.z);
        api.faceAt(e.x, e.z);
        return;
      }
      let perp = { x: cd.z, z: -cd.x };
      const rx = s.x - e.x, rz = s.z - e.z;
      if (perp.x * rx + perp.z * rz < 0) perp = { x: -perp.x, z: -perp.z };
      const want = V.norm({ x: perp.x * 1.4 + away.x * 0.5, z: perp.z * 1.4 + away.z * 0.5 });
      api.move2 = null;
      const md = pickMove(p, api, want);
      api.move(md.x, md.z);
      api.faceAt(ax, az);
      return;
    }
  }

  // --- smash telegraph: hop over the sweep ---
  if (smashing && dist < 6.6) {
    if (!s.busy && api.ready('jump')) {
      const md = pickMove(p, api, V.norm({ x: away.x + tang.x * 0.6, z: away.z + tang.z * 0.6 }));
      api.move(md.x, md.z);
      api.use('jump');
      api.faceAt(ax, az);
      return;
    }
    if (!s.busy && api.ready('blink')) {
      const d = bestEscape(p, api, e.x, e.z);
      api.use('blink', d.x, d.z);
      api.move(d.x, d.z);
      api.faceAt(ax, az);
      return;
    }
    const md = pickMove(p, api, V.norm({ x: away.x + tang.x * 0.5, z: away.z + tang.z * 0.5 }));
    api.move(md.x, md.z);
    api.faceAt(ax, az);
    return;
  }

  // --- too close: teleport out ---
  if (!s.busy && dist < 5.6 && api.ready('blink')) {
    const d = bestEscape(p, api, e.x + e.vx * 0.3, e.z + e.vz * 0.3);
    api.use('blink', d.x, d.z);
    api.move(d.x, d.z);
    api.faceAt(ax, az);
    return;
  }

  const cReady = chargeReadyEst(p);

  // --- fire ---
  let fired = false;
  if (!s.busy && api.ready('laser') && e.visible && dist < 21.5 && !committed && !nearCommit) {
    const safe = dist > 6.8 || e.airborne || e.stunned;
    const ang = Math.abs(V.angleTo(s.heading, { x: ax - s.x, z: az - s.z }));
    if (safe && ang < 1.35) {
      api.use('laser');
      fired = true;
    }
  }

  // --- movement ---
  const casting = fired || (s.casting && s.casting.skill === 'laser');
  let want = cReady ? 14.0 : 9.5;
  if (p.burn > 0 && s.hp / s.maxHp > e.hp / e.maxHp) want += 2.5;
  let radial = 0;
  if (dist < want - 0.8) radial = -1.05;
  else if (dist > want + 1.5) radial = 0.85;
  if (casting) radial = Math.min(radial, -0.2);

  let dv = { x: toE.x * radial + tang.x * 0.85, z: toE.z * radial + tang.z * 0.85 };
  if (!e.visible) {
    if (dist > 8) { dv.x += toE.x * 1.0; dv.z += toE.z * 1.0; }
    else { dv.x += tang.x * 0.6; dv.z += tang.z * 0.6; }
  }
  if (nearCommit || (cReady && dist < 11)) {
    dv.x += tang.x * 0.7 + away.x * 0.4;
    dv.z += tang.z * 0.7 + away.z * 0.4;
  }
  const cx = -s.x, cz = -s.z;
  const rc = Math.hypot(cx, cz);
  if (rc > 14) { dv.x += (cx / rc) * 1.2; dv.z += (cz / rc) * 1.2; }

  const md = pickMove(p, api, V.norm(dv));
  api.move(md.x, md.z);
  api.faceAt(ax, az);
}
