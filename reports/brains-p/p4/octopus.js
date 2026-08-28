// ── Octopus mind ────────────────────────────────────────────────────────────
// Ranged kiter: laser from outside smash reach, blink through walls when the
// ape gets close, hop over ground smashes, sidestep charges.

let tanSign = 1;
let lastCharge = -99;
let lastSmash = -99;
let lastEJump = -99;
let lastFlip = -99;
let saidOpener = false;

function pointBlocked(p, x, z, pad) {
  for (const o of p.arena.obstacles) {
    if (Math.abs(x - o.x) <= o.hx + pad && Math.abs(z - o.z) <= o.hz + pad) return true;
  }
  return false;
}

function segAabb(x0, z0, x1, z1, minx, minz, maxx, maxz) {
  const dx = x1 - x0, dz = z1 - z0;
  let t0 = 0, t1 = 1;
  const axes = [[x0, dx, minx, maxx], [z0, dz, minz, maxz]];
  for (const a of axes) {
    const p0 = a[0], d = a[1], lo = a[2], hi = a[3];
    if (Math.abs(d) < 1e-9) {
      if (p0 < lo || p0 > hi) return false;
    } else {
      let ta = (lo - p0) / d, tb = (hi - p0) / d;
      if (ta > tb) { const s = ta; ta = tb; tb = s; }
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
      if (t0 > t1) return false;
    }
  }
  return true;
}

function segHitsBlock(p, ax, az, bx, bz, pad) {
  for (const o of p.arena.obstacles) {
    if (segAabb(ax, az, bx, bz, o.x - o.hx - pad, o.z - o.hz - pad, o.x + o.hx + pad, o.z + o.hz + pad)) return true;
  }
  return false;
}

// pick the best 7.5 m teleport: far from the ape, ideally with a block between
function chooseBlink(p, prefer) {
  const me = p.self, en = p.enemy;
  let best = null;
  for (let i = 0; i < 24; i++) {
    const a = i * Math.PI / 12;
    const d = { x: Math.sin(a), z: Math.cos(a) };
    let len = 7.5, px = 0, pz = 0, ok = false;
    while (len > 1.5) {
      px = me.x + d.x * len; pz = me.z + d.z * len;
      if (Math.abs(px) < 19.1 && Math.abs(pz) < 19.1 && !pointBlocked(p, px, pz, 1.1)) { ok = true; break; }
      len -= 0.6;
    }
    if (!ok) continue;
    let score = Math.min(Math.hypot(px - en.x, pz - en.z), 17);
    if (segHitsBlock(p, en.x, en.z, px, pz, 0.15)) score += 5;
    const wall = 20 - Math.max(Math.abs(px), Math.abs(pz));
    if (wall < 3.5) score -= (3.5 - wall) * 1.6;
    if (prefer) score += 2.5 * (d.x * prefer.x + d.z * prefer.z);
    if (!best || score > best.score) best = { score: score, d: d, px: px, pz: pz };
  }
  return best;
}

// obstacle aware steering: keep the intent, slide around what is in the way
function steer(p, api, dir) {
  const base = V.heading(dir);
  const offs = [0, 0.3, -0.3, 0.65, -0.65, 1.0, -1.0, 1.4, -1.4, 1.9, -1.9, 2.5, -2.5];
  let best = dir, bestScore = -1e9;
  for (const o of offs) {
    const h = base + o;
    const d = { x: Math.sin(h), z: Math.cos(h) };
    let clear = 4.5;
    try { clear = api.ray(d.x, d.z, 4.5).dist; } catch (e) { clear = 4.5; }
    let score = Math.min(clear, 4.5) * 1.25 - Math.abs(o) * 1.15;
    const px = p.self.x + d.x * 3.2, pz = p.self.z + d.z * 3.2;
    if (Math.abs(px) > 19.2 || Math.abs(pz) > 19.2) score -= 7;
    if (clear < 1.4) score -= 5;
    if (score > bestScore) { bestScore = score; best = d; }
  }
  return best;
}

function think(p, api) {
  const me = p.self, en = p.enemy, t = p.t;

  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      if (e.skill === 'charge') lastCharge = t;
      else if (e.skill === 'smash') lastSmash = t;
      else if (e.skill === 'jump') lastEJump = t;
    } else if (e.type === 'blocked' || e.type === 'contact') {
      if (t - lastFlip > 0.5) { tanSign = -tanSign; lastFlip = t; }
    }
  }

  if (!me.alive) return;
  if (!saidOpener) { saidOpener = true; api.say("eight arms, one beam"); }

  const dist = en.dist;
  const toEn = V.toward(me, en);
  const awayEn = { x: -toEn.x, z: -toEn.z };
  const smashCd = Math.max(0, 1.3 - (t - lastSmash));
  const chargeCd = Math.max(0, 4.033 - (t - lastCharge));
  const enC = en.casting;

  // ── aim: lead them by the time left in my cast
  const leadT = (me.casting && me.casting.skill === 'laser') ? Math.min(0.75, me.casting.remaining || 0) : 0.22;
  api.faceAt(en.x + en.vx * leadT * 0.85, en.z + en.vz * leadT * 0.85);

  if (me.stunned || me.airborne) return;

  // ── incoming charge: get off the line
  if (enC && enC.skill === 'charge') {
    const dirToMe = V.toward(en, me);
    const eh = V.fromHeading(en.heading);
    const aimDot = eh.x * dirToMe.x + eh.z * dirToMe.z;
    const imminent = enC.phase === 'dash' || (enC.remaining !== undefined && enC.remaining <= 0.14);
    if (imminent && aimDot > 0.7 && dist < 16.5) {
      const perp = V.perp(eh);
      const cands = [perp, { x: -perp.x, z: -perp.z }];
      let pick = cands[0], pickScore = -1e9;
      for (const c of cands) {
        const px = me.x + c.x * 7.5, pz = me.z + c.z * 7.5;
        let s = 0;
        s -= Math.max(0, Math.max(Math.abs(px), Math.abs(pz)) - 16) * 3;
        if (pointBlocked(p, px, pz, 1.1)) s -= 2;
        s += (c.x * awayEn.x + c.z * awayEn.z) * 0.7;
        if (s > pickScore) { pickScore = s; pick = c; }
      }
      if (!me.busy && api.ready('blink')) {
        api.move(pick.x, pick.z);
        api.use('blink', pick.x, pick.z);
        return;
      }
      if (!me.busy) {
        const d = steer(p, api, pick);
        api.move(d.x, d.z);
        return;
      }
    }
  }

  // ── incoming smash: hop over it, or blink out
  if (enC && enC.skill === 'smash' && enC.telegraph && dist < 6.8 && !me.busy) {
    const rem = enC.remaining === undefined ? 0.3 : enC.remaining;
    if (api.ready('jump') && rem >= 0.12) {
      const d = steer(p, api, awayEn);
      api.move(d.x, d.z);
      api.use('jump');
      return;
    }
    if (api.ready('blink')) {
      const b = chooseBlink(p, awayEn);
      if (b) { api.move(b.d.x, b.d.z); api.use('blink', b.d.x, b.d.z); return; }
    }
    const d = steer(p, api, awayEn);
    api.move(d.x, d.z);
    return;
  }

  // ── glued to me: teleport away, preferably through a wall
  if (dist < 5.2 && !me.busy && !en.stunned) {
    if (api.ready('blink') && (chargeCd > 0.7 || dist < 3.8 || smashCd < 0.4)) {
      const b = chooseBlink(p, awayEn);
      if (b) { api.move(b.d.x, b.d.z); api.use('blink', b.d.x, b.d.z); return; }
    }
  }

  // ── the beam
  const enemyLocked = !!(en.stunned || (enC && (enC.phase === 'recover' ||
    (enC.skill === 'jump' && enC.phase === 'air'))));
  let castMin = 5.3 + 3.7 * Math.max(0, 0.85 - smashCd);
  if (enemyLocked) castMin = 3.6;
  const ang = Math.abs(V.angleTo(me.heading, toEn));
  const canCast = api.ready('laser') && !me.busy && en.visible && !en.invulnerable &&
    dist <= 22.5 && dist >= castMin && ang <= 1.15 &&
    !(enC && enC.skill === 'charge' && dist < 16.5);
  if (canCast) api.use('laser');

  // ── kiting
  let want = (chargeCd < 0.6) ? 13.5 : 9.8;
  if (me.hp < 45) want += 2;
  const diff = dist - want;
  const wRad = Math.min(1, Math.abs(diff) / 4);
  const radial = diff > 0 ? toEn : awayEn;
  const tang = V.scale(V.perp(toEn), tanSign);
  let dir = V.add(V.scale(radial, wRad), V.scale(tang, 0.85 - 0.5 * wRad));

  const H = p.arena.half, margin = 5.0;
  const rep = { x: 0, z: 0 };
  if (me.x > H - margin) rep.x -= (me.x - (H - margin)) / margin;
  if (me.x < -H + margin) rep.x += ((-H + margin) - me.x) / margin;
  if (me.z > H - margin) rep.z -= (me.z - (H - margin)) / margin;
  if (me.z < -H + margin) rep.z += ((-H + margin) - me.z) / margin;
  dir = V.add(dir, V.scale(rep, 1.8));

  if (!en.visible && dist > 9) dir = V.add(dir, V.scale(toEn, 0.9));

  dir = V.norm(dir);
  if (V.len(dir) < 0.05) dir = awayEn;
  const go = steer(p, api, dir);
  api.move(go.x, go.z);
}
