const CHARGE_CD = 4.033;
const S = { lastCharge: -99, lastSmash: -99, lastJump: -99, said: false, lastBlinkT: -99 };

function resetMind() {
  S.lastCharge = -99; S.lastSmash = -99; S.lastJump = -99; S.said = false; S.lastBlinkT = -99;
}

function enemyChargeReady(p) {
  const ec = p.enemy.casting;
  if (ec && ec.skill === 'charge') return false;
  return (p.t - S.lastCharge) >= CHARGE_CD - 0.08;
}

function bestBlinkDir(p, api, base) {
  const self = p.self, en = p.enemy;
  let best = base, bs = -1e9;
  for (let i = -3; i <= 3; i++) {
    const dir = V.rot(base, i * 0.35);
    const lx = Math.max(-18.5, Math.min(18.5, self.x + dir.x * 7.5));
    const lz = Math.max(-18.5, Math.min(18.5, self.z + dir.z * 7.5));
    const dEn = Math.hypot(lx - en.x, lz - en.z);
    const wm = 20 - Math.max(Math.abs(lx), Math.abs(lz));
    const s = Math.min(dEn, 17) + Math.min(wm, 6) * 0.8 - Math.abs(i) * 0.3;
    if (s > bs) { bs = s; best = dir; }
  }
  return best;
}

function steer(p, api, want, biasDir, biasW) {
  const self = p.self, en = p.enemy;
  let bestDir = null, bestScore = -1e9;
  const vl = Math.hypot(self.vx, self.vz);
  const vn = vl > 0.6 ? { x: self.vx / vl, z: self.vz / vl } : null;
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8;
    const dir = { x: Math.sin(a), z: Math.cos(a) };
    let clear = 6;
    const r = api.ray(dir.x, dir.z, 6);
    if (r && typeof r.dist === 'number') clear = r.dist;
    if (clear < 1.45) continue;
    const step = Math.min(clear - 1.15, 3.0);
    const fx = self.x + dir.x * step, fz = self.z + dir.z * step;
    const dEn = Math.hypot(fx - en.x, fz - en.z);
    let s = 0;
    if (dEn < want) s -= (want - dEn) * 2.2; else s -= (dEn - want) * 0.55;
    s += Math.min(clear, 6) * 0.45;
    const wallM = 20 - Math.max(Math.abs(fx), Math.abs(fz));
    s += Math.min(wallM, 5) * 0.75;
    if (vn) s += (dir.x * vn.x + dir.z * vn.z) * 0.7;
    if (biasDir) s += (dir.x * biasDir.x + dir.z * biasDir.z) * (biasW || 3.0);
    if (s > bestScore) { bestScore = s; bestDir = dir; }
  }
  if (bestDir) api.move(bestDir.x, bestDir.z);
  else {
    const aw = V.norm({ x: self.x - en.x, z: self.z - en.z });
    api.move(aw.x, aw.z);
  }
}

function think(p, api) {
  if (p.tick <= 4) resetMind();
  const self = p.self, en = p.enemy;
  if (!self || !en || !self.alive) return;

  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      if (e.skill === 'charge') S.lastCharge = p.t;
      else if (e.skill === 'smash') S.lastSmash = p.t;
      else if (e.skill === 'jump') S.lastJump = p.t;
    } else if (e.type === 'blinked') {
      S.lastBlinkT = p.t;
    }
  }
  if (!S.said) { S.said = true; api.say("eight arms, one beam"); }

  const d = en.dist;
  const ec = en.casting;
  const chargeReady = enemyChargeReady(p);
  const free = !self.busy && !self.stunned && !self.airborne;

  // ---------- facing ----------
  let lead = 0.12;
  if (self.casting && self.casting.skill === 'laser' && self.casting.telegraph) {
    lead = Math.max(0, self.casting.remaining);
  } else if (api.ready('laser')) {
    lead = 0.5;
  }
  const aimX = en.x + en.vx * lead;
  const aimZ = en.z + en.vz * lead;
  api.faceAt(aimX, aimZ);

  // ---------- situation ----------
  const relS = { x: self.x - en.x, z: self.z - en.z };
  const away = V.norm(relS);
  let want = chargeReady ? 15.5 : 11.0;
  let biasDir = null, biasW = 3.0;
  let skill = null, skillA = 0, skillB = 0;

  // charge in flight -> dodge sideways / blink
  let dodging = false;
  if (ec && ec.skill === 'charge' && (ec.phase === 'dash' || (!ec.telegraph && ec.phase !== 'windup'))) {
    let dv = { x: en.vx, z: en.vz };
    if (Math.hypot(dv.x, dv.z) < 2) dv = V.fromHeading(en.heading);
    dv = V.norm(dv);
    const along = relS.x * dv.x + relS.z * dv.z;
    const pv = V.perp(dv);
    const lat = relS.x * pv.x + relS.z * pv.z;
    if (along > -2 && along < 15 && Math.abs(lat) < 3.4) {
      dodging = true;
      const side = lat >= 0 ? pv : V.scale(pv, -1);
      biasDir = side; biasW = 5.0;
      want = 16;
      const tHit = Math.max(0, along - 2.3) / 15;
      if (free && api.ready('blink') && tHit < 0.8) {
        const base = V.norm(V.add(side, V.scale(away, 0.35)));
        const bd = bestBlinkDir(p, api, base);
        skill = 'blink'; skillA = bd.x; skillB = bd.z;
      }
    }
  }

  // charge winding up -> strafe hard, widen
  if (!dodging && ec && ec.skill === 'charge' && ec.telegraph) {
    const pv = V.perp(away);
    const l = { x: self.x + pv.x * 4, z: self.z + pv.z * 4 };
    const r2 = { x: self.x - pv.x * 4, z: self.z - pv.z * 4 };
    const wl = 20 - Math.max(Math.abs(l.x), Math.abs(l.z));
    const wr = 20 - Math.max(Math.abs(r2.x), Math.abs(r2.z));
    biasDir = wl >= wr ? pv : V.scale(pv, -1);
    biasW = 4.0;
    want = Math.max(want, 16);
  }

  // smash winding up close -> hop over it or blink out
  if (!dodging && ec && ec.skill === 'smash' && ec.telegraph && d < 8.0) {
    biasDir = away; biasW = 4.0;
    if (!skill && free) {
      if (d < 6.4 && ec.remaining > 0.16 && api.ready('jump')) {
        skill = 'jump';
      } else if (d < 5.8 && api.ready('blink')) {
        const bd = bestBlinkDir(p, api, away);
        skill = 'blink'; skillA = bd.x; skillB = bd.z;
      }
    }
  }

  // pinned at knife range -> get out
  if (!skill && !dodging && free && d < 5.3 && api.ready('blink')) {
    const bd = bestBlinkDir(p, api, away);
    skill = 'blink'; skillA = bd.x; skillB = bd.z;
  }

  // ---------- laser ----------
  if (!skill && free && api.ready('laser') && en.visible && d <= 23.5 && !en.invulnerable) {
    const dirAim = { x: aimX - self.x, z: aimZ - self.z };
    const ang = Math.abs(V.angleTo(self.heading, dirAim));
    let ok = ang < 0.55;
    const safeWindow = en.stunned || (ec && ec.phase === 'recover') ||
      (ec && ec.skill === 'jump' && d > 6.5);
    if (!safeWindow) {
      if (d < 7.0) ok = false;
      if (chargeReady && d < 9.2) ok = false;
      if (ec && ec.skill === 'charge') ok = false;
      if (ec && ec.skill === 'smash' && d < 9.5) ok = false;
    }
    if (ok) skill = 'laser';
  }

  // ---------- move ----------
  if (!en.visible && d > 6) want = Math.min(want, 12);
  steer(p, api, want, biasDir, biasW);

  if (skill) {
    if (skill === 'blink') api.use('blink', skillA, skillB);
    else api.use(skill);
  }
}
