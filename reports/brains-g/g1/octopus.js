function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive) return;

  // ---- events bookkeeping ----
  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      if (e.skill === 'charge') { lastChargeStart = p.t; chargeWarned = true; }
      if (e.skill === 'smash') lastSmashStart = p.t;
      lastEnemySkill = e.skill;
      enemyCd[e.skill] = p.t;
    }
    if (e.type === 'enemyCommitted') { chargeCommitted = p.t; }
    if (e.type === 'damaged') { lastHurt = p.t; }
    if (e.type === 'blocked') { blockedAt = p.t; }
  }

  const dist = en.dist;
  const toEn = V.toward(me, en);
  const awayEn = V.away(me, en);

  // ---- threat assessment ----
  const enCast = en.casting;
  let charging = false, chargeDash = false, smashing = false;
  if (enCast) {
    if (enCast.skill === 'charge') {
      charging = true;
      chargeDash = enCast.phase === 'dash';
    }
    if (enCast.skill === 'smash' && enCast.telegraph) smashing = true;
  }

  const chargeReady = (p.t - (enemyCd.charge ?? -99)) > 4.0;
  const smashReady = (p.t - (enemyCd.smash ?? -99)) > 1.1;

  // ---- helpers ----
  const clampArena = (x, z) => ({
    x: Math.max(-19, Math.min(19, x)),
    z: Math.max(-19, Math.min(19, z))
  });

  const inBlock = (x, z, pad) => {
    for (const o of p.arena.obstacles) {
      if (Math.abs(x - o.x) < o.hx + pad && Math.abs(z - o.z) < o.hz + pad) return true;
    }
    return false;
  };

  // ---------- EMERGENCY: enemy charge dash aimed at me ----------
  if (chargeDash || (charging && enCast && enCast.phase === 'windup' && enCast.remaining < 0.12)) {
    const eh = en.heading;
    const dir = { x: Math.sin(eh), z: Math.cos(eh) };
    const rel = V.sub(me, en);
    const along = V.dot(rel, dir);
    const lateral = Math.abs(rel.x * dir.z - rel.z * dir.x);
    const danger = along > -1 && along < 14 && lateral < 2.8;
    if (danger) {
      // dodge perpendicular
      const perp = V.perp(dir);
      const side = (rel.x * dir.z - rel.z * dir.x) >= 0 ? 1 : -1;
      let dodge = V.scale(perp, side);
      // avoid dodging into a wall
      const tgt = clampArena(me.x + dodge.x * 6, me.z + dodge.z * 6);
      if (Math.abs(tgt.x) > 18.5 || Math.abs(tgt.z) > 18.5 || inBlock(tgt.x, tgt.z, 1.2)) {
        dodge = V.scale(dodge, -1);
      }
      if (api.ready('blink') && dist < 13) {
        api.use('blink', dodge.x, dodge.z);
        api.move(dodge.x, dodge.z);
        api.faceAt(en.x, en.z);
        return;
      }
      api.move(dodge.x, dodge.z);
      api.faceAt(en.x, en.z);
      return;
    }
  }

  // ---------- EMERGENCY: smash cone ----------
  if (smashing && dist < 5.0) {
    // get out; jump over the sweep if it will land soon
    const rem = enCast.remaining;
    if (rem < 0.2 && api.ready('jump') && !me.airborne) {
      const perp = V.perp(toEn);
      api.move(perp.x - toEn.x, perp.z - toEn.z);
      api.use('jump');
      api.faceAt(en.x, en.z);
      return;
    }
    if (api.ready('blink')) {
      const d = pickRetreat(p, api, me, en, 7.0);
      api.use('blink', d.x, d.z);
      api.move(d.x, d.z);
      api.faceAt(en.x, en.z);
      return;
    }
    const d = pickRetreat(p, api, me, en, 5.0);
    api.move(d.x, d.z);
    api.faceAt(en.x, en.z);
    return;
  }

  // ---------- desired range ----------
  // Laser range 24. Gorilla charge reach ~12+. Stay beyond ~14 when possible.
  const KITE = 13.5;

  // ---------- Laser logic ----------
  const canLaser = api.ready('laser') && !me.airborne && !me.busy;
  const casting = me.casting && me.casting.skill === 'laser' && me.casting.telegraph;

  if (casting) {
    // keep aiming; predict where the beam should go at fire moment
    const rem = me.casting.remaining;
    const aim = predictAim(me, en, rem);
    api.faceAt(aim.x, aim.z);
    // strafe slowly while casting, away if close
    if (dist < 7) {
      const d = pickRetreat(p, api, me, en, 5);
      api.move(d.x, d.z);
    } else {
      const perp = V.perp(toEn);
      const s = strafeSign(p, api, me, en, perp);
      api.move(perp.x * s, perp.z * s);
    }
    return;
  }

  // fire the laser when: visible, in range, and enemy is not about to be safe
  if (canLaser && en.visible && dist < 22 && dist > 2.2) {
    // Don't start a laser if a charge could hit mid-cast at short range
    const risky = dist < 9 && chargeReady;
    if (!risky) {
      const aim = predictAim(me, en, 0.68);
      api.use('laser');
      api.faceAt(aim.x, aim.z);
      if (dist < KITE) {
        const d = pickRetreat(p, api, me, en, 5);
        api.move(d.x, d.z);
      } else {
        const perp = V.perp(toEn);
        const s = strafeSign(p, api, me, en, perp);
        api.move(perp.x * s, perp.z * s);
      }
      return;
    }
  }

  // ---------- positioning ----------
  api.faceAt(en.x, en.z);

  // Too close -> disengage
  if (dist < 8.5) {
    if (dist < 4.5 && api.ready('blink')) {
      const d = pickRetreat(p, api, me, en, 7.5);
      api.use('blink', d.x, d.z);
      api.move(d.x, d.z);
      return;
    }
    const d = pickRetreat(p, api, me, en, 6);
    api.move(d.x, d.z);
    return;
  }

  // Sweet spot: hold and strafe, wait for laser
  if (dist < 17) {
    const perp = V.perp(toEn);
    const s = strafeSign(p, api, me, en, perp);
    // slight bias to keep distance around KITE
    const radial = (dist < KITE) ? -1 : 0.4;
    let dir = { x: perp.x * s + toEn.x * radial, z: perp.z * s + toEn.z * radial };
    // avoid walls
    const probe = clampArena(me.x + dir.x * 4, me.z + dir.z * 4);
    if (Math.abs(me.x + dir.x * 3) > 18.5 || Math.abs(me.z + dir.z * 3) > 18.5) {
      dir = { x: -dir.x, z: -dir.z };
      api.remember('strafe', -s);
    }
    if (inBlock(me.x + dir.x * 2.2, me.z + dir.z * 2.2, 1.1)) {
      api.remember('strafe', -s);
      dir = V.perp(dir);
    }
    api.move(dir.x, dir.z);
    return;
  }

  // Far: close enough to get LOS / into laser range
  if (!en.visible || dist > 20) {
    const path = api.pathTo(en.x, en.z);
    if (path && path.points && path.points.length) {
      const next = path.points[0];
      api.moveTo(next.x, next.z);
    } else {
      api.move(toEn.x, toEn.z);
    }
    return;
  }
  api.move(toEn.x, toEn.z);
}

let lastChargeStart = -99;
let chargeCommitted = -99;
let lastSmashStart = -99;
let chargeWarned = false;
let lastHurt = -99;
let blockedAt = -99;
let lastEnemySkill = null;
const enemyCd = {};
let strafeDir = 1;
let strafeUntil = 0;

function predictAim(me, en, lead) {
  // gorilla velocity assumed roughly constant
  const px = en.x + en.vx * lead * 0.85;
  const pz = en.z + en.vz * lead * 0.85;
  return { x: px, z: pz };
}

function strafeSign(p, api, me, en, perp) {
  if (p.t > strafeUntil) {
    strafeUntil = p.t + 1.2 + api.rand() * 1.3;
    // choose the side with more open space
    const a = { x: me.x + perp.x * 5, z: me.z + perp.z * 5 };
    const b = { x: me.x - perp.x * 5, z: me.z - perp.z * 5 };
    const sa = openScore(p, api, a);
    const sb = openScore(p, api, b);
    strafeDir = sa >= sb ? 1 : -1;
    if (Math.abs(sa - sb) < 0.5) strafeDir = api.rand() < 0.5 ? 1 : -1;
  }
  // flip if heading into wall
  const t = { x: me.x + perp.x * strafeDir * 3.5, z: me.z + perp.z * strafeDir * 3.5 };
  if (Math.abs(t.x) > 18.5 || Math.abs(t.z) > 18.5) strafeDir = -strafeDir;
  return strafeDir;
}

function openScore(p, api, pt) {
  let s = 0;
  s += (20 - Math.abs(pt.x)) * 0.1;
  s += (20 - Math.abs(pt.z)) * 0.1;
  for (const o of p.arena.obstacles) {
    const dx = Math.abs(pt.x - o.x) - o.hx;
    const dz = Math.abs(pt.z - o.z) - o.hz;
    const d = Math.max(dx, dz);
    if (d < 2) s -= (2 - d);
  }
  return s;
}

function pickRetreat(p, api, me, en, len) {
  const away = V.away(me, en);
  const cands = [];
  for (let i = -4; i <= 4; i++) {
    const a = i * 0.32;
    const d = V.rot(away, a);
    const tx = me.x + d.x * len, tz = me.z + d.z * len;
    let score = -Math.abs(i) * 0.35;
    // penalize walls
    const ox = Math.abs(tx), oz = Math.abs(tz);
    if (ox > 18 || oz > 18) score -= 8;
    else score -= Math.max(0, ox - 14) * 0.8 + Math.max(0, oz - 14) * 0.8;
    // penalize blocks along path
    const r = api.ray(d.x, d.z, len);
    if (r.hit && r.dist < len) score -= (len - r.dist) * 0.9;
    // prefer keeping away from enemy
    const nd = Math.hypot(tx - en.x, tz - en.z);
    score += nd * 0.25;
    cands.push({ d, score });
  }
  cands.sort((a, b) => b.score - a.score);
  return cands[0].d;
}
