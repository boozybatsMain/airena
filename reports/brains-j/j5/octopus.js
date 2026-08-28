function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me || !me.alive) return;
  const obs = (p.arena && p.arena.obstacles) || [];
  const HALF = (p.arena && p.arena.half) || 20;

  // ---------- event digest ----------
  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      if (e.skill === 'charge') { lastCharge = p.t; chargeLocked = false; }
      else if (e.skill === 'smash') lastSmash = p.t;
      else if (e.skill === 'jump') lastJump = p.t;
    } else if (e.type === 'enemyCommitted') {
      if (e.skill === 'charge') {
        chargeLocked = true;
        chargeAt = p.t;
        chargeOx = en.x; chargeOz = en.z;
        chargeDx = Math.sin(en.heading); chargeDz = Math.cos(en.heading);
      }
    } else if (e.type === 'damaged') {
      lastHurt = p.t;
    } else if (e.type === 'missed' && e.reason === 'cover') {
      coverMiss = p.t;
    } else if (e.type === 'blocked') {
      lastBlocked = p.t;
    }
  }

  const dxE = en.x - me.x, dzE = en.z - me.z;
  const dist = Math.max(0.001, Math.hypot(dxE, dzE));
  const ux = dxE / dist, uz = dzE / dist;

  const enCast = en.casting || null;
  const enSkill = enCast ? enCast.skill : null;
  const enPhase = enCast ? enCast.phase : null;
  const enTel = enCast ? !!enCast.telegraph : false;

  // enemy charge cooldown estimate
  const chargeReady = (p.t - lastCharge) >= 3.95;
  const smashReady = (p.t - lastSmash) >= 1.25;

  // ---------- charge threat ----------
  let dashing = false, dirx = 0, dirz = 0;
  if (enSkill === 'charge') {
    if (enPhase === 'dash' || (!enTel && en.speed > 8)) dashing = true;
  }
  if (!dashing && en.speed > 9.5 && !en.airborne) dashing = true;
  if (dashing) {
    if (en.speed > 6) { dirx = en.vx / en.speed; dirz = en.vz / en.speed; }
    else if (chargeLocked) { dirx = chargeDx; dirz = chargeDz; }
    else { dirx = Math.sin(en.heading); dirz = Math.cos(en.heading); }
  }

  let chargeDanger = 0;
  if (dashing) {
    const rx = me.x - en.x, rz = me.z - en.z;
    const along = rx * dirx + rz * dirz;
    const px = rx - dirx * along, pz = rz - dirz * along;
    const perp = Math.hypot(px, pz);
    if (along > -1.5 && along < 14 && perp < 3.4) chargeDanger = 1;
  } else if (enSkill === 'charge' && enTel && dist < 15.5) {
    chargeDanger = 0.6;
  }

  // smash danger
  const meleeReach = 2.9 + en.radius + me.radius + 0.4;
  let smashDanger = 0;
  if (enSkill === 'smash' && enTel && dist < meleeReach + 1.6) smashDanger = 1;

  // ---------- helpers ----------
  const blockedSeg = (ax, az, bx, bz, pad) => {
    for (const o of obs) {
      const minx = o.x - o.hx - pad, maxx = o.x + o.hx + pad;
      const minz = o.z - o.hz - pad, maxz = o.z + o.hz + pad;
      let t0 = 0, t1 = 1;
      const ddx = bx - ax, ddz = bz - az;
      let ok = true;
      if (Math.abs(ddx) < 1e-6) {
        if (ax < minx || ax > maxx) ok = false;
      } else {
        let ta = (minx - ax) / ddx, tb = (maxx - ax) / ddx;
        if (ta > tb) { const s = ta; ta = tb; tb = s; }
        if (ta > t0) t0 = ta; if (tb < t1) t1 = tb;
        if (t0 > t1) ok = false;
      }
      if (ok) {
        if (Math.abs(ddz) < 1e-6) {
          if (az < minz || az > maxz) ok = false;
        } else {
          let ta = (minz - az) / ddz, tb = (maxz - az) / ddz;
          if (ta > tb) { const s = ta; ta = tb; tb = s; }
          if (ta > t0) t0 = ta; if (tb < t1) t1 = tb;
          if (t0 > t1) ok = false;
        }
      }
      if (ok) return true;
    }
    return false;
  };

  const insideBlock = (x, z, pad) => {
    for (const o of obs) {
      if (x > o.x - o.hx - pad && x < o.x + o.hx + pad &&
          z > o.z - o.hz - pad && z < o.z + o.hz + pad) return true;
    }
    return false;
  };

  // ---------- fractions / phase ----------
  const myFrac = me.hp / me.maxHp;
  const enFrac = en.hp / en.maxHp;
  const ahead = myFrac > enFrac + 0.01;
  const late = p.t > 46;

  // ---------- desired standoff ----------
  let want = chargeReady ? 13.5 : 9.5;
  if (late && ahead) want += 3.0;
  if (dist < 6 && !chargeReady) want = 9.0;
  if (want > 17) want = 17;

  // ---------- BLINK: escape ----------
  const blinkReady = api.ready('blink');
  const pickBlink = (biasx, biasz) => {
    let bestS = -1e9, bx = biasx, bz = biasz;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const cx = Math.sin(a), cz = Math.cos(a);
      const lx = me.x + cx * 7.2, lz = me.z + cz * 7.2;
      let s = 0;
      const cl = Math.max(0, Math.abs(lx) - (HALF - 2.0)) + Math.max(0, Math.abs(lz) - (HALF - 2.0));
      s -= cl * 4;
      const nd = Math.hypot(en.x - lx, en.z - lz);
      s += Math.min(nd, 16) * 0.9;
      if (insideBlock(lx, lz, 1.3)) s -= 6;
      s += (cx * biasx + cz * biasz) * 3.0;
      if (!blockedSeg(lx, lz, en.x, en.z, 0.1)) s += 1.5;
      if (s > bestS) { bestS = s; bx = cx; bz = cz; }
    }
    return { x: bx, z: bz };
  };

  let acted = false;

  if (blinkReady && !me.busy && !me.stunned && !me.airborne) {
    if (chargeDanger >= 1) {
      // sidestep the lane
      let sx = -dirz, sz = dirx;
      const rx = me.x - en.x, rz = me.z - en.z;
      if (rx * sx + rz * sz < 0) { sx = -sx; sz = -sz; }
      const b = pickBlink(sx, sz);
      api.use('blink', b.x, b.z);
      api.say('slip');
      acted = true;
    } else if (dist < 5.0 && (smashDanger || en.speed > 3)) {
      const b = pickBlink(-ux, -uz);
      api.use('blink', b.x, b.z);
      acted = true;
    }
  }

  // ---------- JUMP over a smash we cannot outrun ----------
  if (!acted && smashDanger && dist < meleeReach && api.ready('jump') &&
      !me.busy && !me.stunned && !me.airborne) {
    const rem = enCast ? enCast.remaining : 0.2;
    if (rem > 0.04 && rem < 0.5) {
      api.use('jump');
      acted = true;
    }
  }

  // ---------- aim ----------
  let leadT = 0.30;
  if (me.casting && me.casting.skill === 'laser') leadT = Math.max(0, me.casting.remaining - 0.02);
  let axp = en.x + en.vx * leadT, azp = en.z + en.vz * leadT;
  const ldx = axp - me.x, ldz = azp - me.z;
  const lLen = Math.hypot(ldx, ldz) || 1;
  api.face(ldx / lLen, ldz / lLen);

  // ---------- LASER ----------
  if (!acted && api.ready('laser') && !me.busy && !me.stunned && !me.airborne) {
    if (en.visible && dist <= 21.5 && !en.invulnerable) {
      const want2 = Math.atan2(ldx, ldz);
      let err = want2 - me.heading;
      while (err > Math.PI) err -= Math.PI * 2;
      while (err < -Math.PI) err += Math.PI * 2;
      const risky = (chargeReady && dist < 10.5) || (enSkill === 'charge' && enTel) ||
                    (dist < meleeReach + 1.0);
      if (Math.abs(err) < 1.15 && !risky && chargeDanger < 1) {
        api.use('laser');
        acted = true;
      }
    }
  }

  // ---------- MOVEMENT ----------
  const L = 2.3;
  const lim = HALF - 2.2;
  let bestScore = -1e9, mvx = -ux, mvz = -uz;

  const wantCover = (chargeDanger >= 1);

  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const cx = Math.sin(a), cz = Math.cos(a);
    const px = me.x + cx * L, pz = me.z + cz * L;
    let s = 0;

    // arena walls
    const ox = Math.max(0, Math.abs(px) - lim);
    const oz = Math.max(0, Math.abs(pz) - lim);
    s -= (ox + oz) * 9;

    // solid clearance
    const r = api.ray(cx, cz, 3.4);
    if (r && r.hit && r.dist < 3.4) s -= (3.4 - r.dist) * 3.2;

    // distance band
    const nd = Math.hypot(en.x - px, en.z - pz);
    s -= Math.abs(nd - want) * 1.7;
    if (nd < 5.2) s -= (5.2 - nd) * 9;

    // line of sight preference
    const clear = !blockedSeg(px, pz, en.x, en.z, 0.2);
    if (wantCover) { s += clear ? -2.0 : 3.0; }
    else s += clear ? 3.2 : -3.2;

    // stay out of the middle-of-nowhere corners
    s -= Math.max(0, Math.hypot(px, pz) - 15.5) * 1.2;

    // charge lane avoidance
    if (dashing) {
      const rx = px - en.x, rz = pz - en.z;
      const along = rx * dirx + rz * dirz;
      if (along > -2 && along < 15) {
        const qx = rx - dirx * along, qz = rz - dirz * along;
        const perp = Math.hypot(qx, qz);
        if (perp < 4.5) s -= (4.5 - perp) * 5.0;
      }
      s += 0.0;
    } else if (enSkill === 'charge' && enTel) {
      // move sideways relative to enemy
      const tang = Math.abs(cx * (-uz) + cz * ux);
      s += tang * 3.0;
    }

    // smash: run away hard
    if (smashDanger) {
      s += (cx * -ux + cz * -uz) * 6.0;
    }

    // momentum / smoothness
    if (me.speed > 0.4) s += ((cx * me.vx + cz * me.vz) / me.maxSpeed) * 1.0;
    s += (cx * lastMvx + cz * lastMvz) * 0.9;

    if (s > bestScore) { bestScore = s; mvx = cx; mvz = cz; }
  }

  lastMvx = mvx; lastMvz = mvz;
  api.move(mvx, mvz);

  if (p.t - lastSay > 6.5) {
    lastSay = p.t;
    api.say(dist > 12 ? 'eight arms, one beam' : 'too close, ape');
  }
}

let lastCharge = -99;
let lastSmash = -99;
let lastJump = -99;
let lastHurt = -99;
let coverMiss = -99;
let lastBlocked = -99;
let chargeLocked = false;
let chargeAt = -99;
let chargeOx = 0, chargeOz = 0, chargeDx = 0, chargeDz = 1;
let lastMvx = 0, lastMvz = 0;
let lastSay = -99;
