const CHARGE_CD = 4.0, SMASH_CD = 1.3;
let enemyLast = { charge: -99, smash: -99, jump: -99 };
let lastMove = { x: 0, z: 1 };
let strafeSign = 1;
let lastFlip = 0;
let dangerBias = 0;
let saidT = -99;

function edgeOf(q) { return 20 - Math.max(Math.abs(q.x), Math.abs(q.z)); }

function steer(p, api, pref, tang) {
  const s = p.self, e = p.enemy;
  let best = null, bestScore = -1e9;
  const ex = e.x - s.x, ez = e.z - s.z;
  const el = Math.hypot(ex, ez) || 1;
  const tx = ez / el, tz = -ex / el;
  for (let i = 0; i < 20; i++) {
    const a = i * Math.PI * 2 / 20;
    const d = { x: Math.sin(a), z: Math.cos(a) };
    let clr = 6;
    const r = api.ray(d.x, d.z, 6);
    if (r) clr = r.dist;
    const step = Math.min(3, Math.max(0.4, clr - 1.3));
    const q = { x: s.x + d.x * step, z: s.z + d.z * step };
    const dn = Math.hypot(q.x - e.x, q.z - e.z);
    let sc = -1.35 * Math.abs(dn - pref);
    if (clr < 1.4) sc -= 12; else sc += Math.min(clr, 4) * 0.3;
    const ed = edgeOf(q);
    if (ed < 5) sc -= (5 - ed) * 2.2;
    sc += 1.3 * (d.x * lastMove.x + d.z * lastMove.z);
    sc += tang * strafeSign * (d.x * tx + d.z * tz);
    if (sc > bestScore) { bestScore = sc; best = d; }
  }
  if (best) lastMove = best;
  return best || { x: 0, z: 0 };
}

function think(p, api) {
  const s = p.self, e = p.enemy;
  if (!s || !e || !s.alive) return;

  for (const ev of p.events) {
    if (ev.type === 'enemyStarted' && ev.skill) enemyLast[ev.skill] = p.t;
    if (ev.type === 'blocked') { strafeSign = -strafeSign; lastFlip = p.t; }
    if (ev.type === 'damaged') {
      dangerBias = Math.min(3.5, dangerBias + (ev.skill === 'smash' ? 1.3 : 0.9));
    }
  }
  dangerBias *= 0.995;

  const dist = e.dist;
  const chargeIn = Math.max(0, CHARGE_CD - (p.t - enemyLast.charge));
  const smashIn = Math.max(0, SMASH_CD - (p.t - enemyLast.smash));
  const ec = e.casting;
  const myFrac = s.hp / s.maxHp, hisFrac = e.hp / e.maxHp;

  // occasional strafe flip
  if (p.t - lastFlip > 2.5 && api.rand() < 0.06) { strafeSign = -strafeSign; lastFlip = p.t; }

  // ---------- airborne / stunned: only turn ----------
  if (s.airborne || s.stunned) {
    api.faceAt(e.x, e.z);
    return;
  }

  // ---------- dodge a committed charge ----------
  if (ec && ec.skill === 'charge' && ec.phase === 'dash') {
    let dir = { x: e.vx, z: e.vz };
    if (Math.hypot(dir.x, dir.z) < 0.5) dir = V.fromHeading(e.heading);
    dir = V.norm(dir);
    const rel = { x: s.x - e.x, z: s.z - e.z };
    const along = rel.x * dir.x + rel.z * dir.z;
    const lat = rel.x * dir.z - rel.z * dir.x;
    if (along > -1.5 && along < 15 && Math.abs(lat) < 3.6) {
      const side = lat >= 0 ? 1 : -1;
      const perp = { x: dir.z * side, z: -dir.x * side };
      let px = s.x + perp.x * 7.0, pz = s.z + perp.z * 7.0;
      if (Math.abs(px) > 19 || Math.abs(pz) > 19) { perp.x = -perp.x; perp.z = -perp.z; }
      api.move(perp.x, perp.z);
      api.faceAt(e.x, e.z);
      lastMove = perp;
      if (!s.busy && api.ready('blink')) api.use('blink', perp.x, perp.z);
      return;
    }
  }

  // ---------- dodge a smash ----------
  if (ec && ec.skill === 'smash' && ec.telegraph && dist < 6.4 && !s.busy) {
    const away = V.away(s, e);
    let ax = away.x, az = away.z;
    if (Math.abs(s.x + ax * 4) > 19 || Math.abs(s.z + az * 4) > 19) {
      const t = V.perp(away); ax = t.x; az = t.z;
    }
    api.move(ax, az);
    api.faceAt(e.x, e.z);
    lastMove = { x: ax, z: az };
    if (api.ready('jump')) { api.use('jump'); return; }
    if (api.ready('blink')) { api.use('blink', ax, az); return; }
    return;
  }

  // ---------- emergency spacing ----------
  if (!s.busy && dist < 4.4 && api.ready('blink') && chargeIn > 1.0) {
    const away = V.away(s, e);
    let d = { x: away.x + strafeSign * away.z * 0.6, z: away.z - strafeSign * away.x * 0.6 };
    d = V.norm(d);
    api.use('blink', d.x, d.z);
    api.move(d.x, d.z);
    api.faceAt(e.x, e.z);
    lastMove = d;
    return;
  }

  // ---------- preferred range ----------
  let pref = api.ready('laser') ? 12.5 : 15.0;
  if (chargeIn < 0.6) pref = Math.max(pref, 16.0);
  if (ec && ec.skill === 'charge') pref = Math.max(pref, 17.0);
  pref += dangerBias;
  if (p.timeLeft < 15 && myFrac > hisFrac + 0.02) pref = Math.max(pref, 17.5);
  if (!e.visible && api.cooldown('laser') < 0.5) pref = Math.min(pref, Math.max(7, dist - 3));
  pref = Math.max(6.5, Math.min(18.5, pref));

  // ---------- keep casting: re-aim with lead ----------
  if (s.casting && s.casting.skill === 'laser') {
    const r = s.casting.remaining || 0;
    const px = Math.max(-19.5, Math.min(19.5, e.x + e.vx * r * 0.9));
    const pz = Math.max(-19.5, Math.min(19.5, e.z + e.vz * r * 0.9));
    api.faceAt(px, pz);
    const d = steer(p, api, Math.max(pref, dist), 0.9);
    api.move(d.x, d.z);
    return;
  }

  // ---------- fire the laser ----------
  const chargeThreat = chargeIn < 0.35 && dist < 16.5;
  const smashThreat = dist < 7.0 && smashIn < 0.7;
  const laserOK = !s.busy && api.ready('laser') && e.visible && !e.invulnerable &&
    dist > 4.5 && dist < 23.0;
  if (laserOK && (e.stunned || (!chargeThreat && !smashThreat))) {
    const px = Math.max(-19.5, Math.min(19.5, e.x + e.vx * 0.62 * 0.9));
    const pz = Math.max(-19.5, Math.min(19.5, e.z + e.vz * 0.62 * 0.9));
    if (api.los(px, pz) || api.los(e.x, e.z)) {
      api.faceAt(px, pz);
      api.use('laser');
      const d = steer(p, api, Math.max(pref, dist), 0.9);
      api.move(d.x, d.z);
      if (p.t - saidT > 6) { saidT = p.t; api.say("eight arms, one beam"); }
      return;
    }
  }

  // ---------- default: kite ----------
  let tang = 1.1;
  if (ec && ec.skill === 'charge' && ec.phase === 'windup') tang = 2.4;
  if (!e.visible) tang = 1.6;
  const d = steer(p, api, pref, tang);
  api.move(d.x, d.z);
  api.faceAt(e.x, e.z);
}
