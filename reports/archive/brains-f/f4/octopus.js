const NDIR = 16;
const DIRS = [];
for (let i = 0; i < NDIR; i++) {
  const a = (i * 2 * Math.PI) / NDIR;
  DIRS.push({ x: Math.sin(a), z: Math.cos(a) });
}

let chargeReadyAt = 0;
let smashReadyAt = 0;
let orbitSign = 1;
let lastFlip = -99;
let leadScale = 0.9;
let missStreak = 0;
let lastSay = -99;

function leadPoint(e, tAhead) {
  let f = leadScale;
  if (e.casting && e.casting.telegraph) f *= 0.45;
  if (e.stunned) f = 0;
  return { x: e.x + e.vx * tAhead * f, z: e.z + e.vz * tAhead * f };
}

function bestOf(p, api, cands, dist) {
  const s = p.self;
  const r = Math.hypot(s.x, s.z);
  const c = r > 0.1 ? { x: -s.x / r, z: -s.z / r } : { x: 0, z: 1 };
  let best = null,
    bs = -1e9;
  for (const raw of cands) {
    const n = V.norm(raw);
    if (!n.x && !n.z) continue;
    const hit = api.ray(n.x, n.z, dist);
    let sc = Math.min(hit.dist, dist);
    const lx = s.x + n.x * dist,
      lz = s.z + n.z * dist;
    if (Math.abs(lx) > 18.5 || Math.abs(lz) > 18.5) sc -= 5;
    sc += (r > 12 ? 3 : 0.5) * (n.x * c.x + n.z * c.z);
    if (sc > bs) {
      bs = sc;
      best = n;
    }
  }
  return best || { x: 0, z: 1 };
}

function think(p, api) {
  const s = p.self,
    e = p.enemy,
    t = p.t;
  if (!s || !e || !s.alive) return;
  const d = e.dist;

  for (const ev of p.events) {
    if (ev.type === 'enemyStarted') {
      if (ev.skill === 'charge') chargeReadyAt = t + 4.5;
      else if (ev.skill === 'smash') smashReadyAt = t + 1.1;
    } else if (ev.type === 'damaged') {
      if (ev.skill === 'charge') chargeReadyAt = t + 4.5;
      else if (ev.skill === 'smash') smashReadyAt = t + 1.1;
    } else if (ev.type === 'blocked') {
      if (t - lastFlip > 0.7) {
        orbitSign = -orbitSign;
        lastFlip = t;
      }
    } else if (ev.type === 'missed' && ev.skill === 'laser') {
      if (ev.reason === 'aim') {
        missStreak++;
        if (missStreak >= 2) {
          leadScale = Math.max(0.45, leadScale - 0.15);
          missStreak = 0;
        }
      }
    } else if (ev.type === 'dealt' && ev.skill === 'laser') {
      missStreak = 0;
      leadScale = Math.min(0.95, leadScale + 0.05);
    }
  }

  if (!e.alive) {
    api.stop();
    return;
  }
  if (s.airborne || s.stunned) return;

  const chargeUp = t >= chargeReadyAt - 0.1;
  const blinkReady = api.ready('blink') && !s.busy;
  const eCast = e.casting;
  const dashing = !!(eCast && eCast.skill === 'charge' && eCast.phase === 'dash');
  const smashTel = !!(eCast && eCast.skill === 'smash' && eCast.telegraph);

  const toUs = { x: s.x - e.x, z: s.z - e.z };
  const hdir = V.fromHeading(e.heading);
  const along = toUs.x * hdir.x + toUs.z * hdir.z;
  const offv = { x: toUs.x - hdir.x * along, z: toUs.z - hdir.z * along };
  const off = V.len(offv);

  // ---- charge dodge ----
  if (dashing && d < 15 && along > 0 && off < 3.4) {
    const side = off > 0.3 ? V.norm(offv) : V.perp(hdir);
    const back = V.norm(toUs);
    if (blinkReady) {
      const dir = bestOf(
        p,
        api,
        [
          side,
          { x: -side.x, z: -side.z },
          V.norm({ x: side.x * 2 + back.x, z: side.z * 2 + back.z }),
          V.norm({ x: -side.x * 2 + back.x, z: -side.z * 2 + back.z })
        ],
        7.5
      );
      api.use('blink', dir.x, dir.z);
      api.faceAt(e.x, e.z);
      if (t - lastSay > 4) {
        lastSay = t;
        api.say('eight arms, zero of them there');
      }
      return;
    }
    const a = api.ray(side.x, side.z, 4.5).dist;
    const b = api.ray(-side.x, -side.z, 4.5).dist;
    const use = b > a + 1.2 ? { x: -side.x, z: -side.z } : side;
    api.move(use.x, use.z);
    api.faceAt(e.x, e.z);
    return;
  }

  // ---- smash dodge ----
  if (smashTel && d < 5.4 && !s.busy) {
    const back = V.norm(toUs);
    const per = V.perp(back);
    if (blinkReady && (!chargeUp || d < 4.0)) {
      const dir = bestOf(
        p,
        api,
        [
          back,
          V.norm({ x: back.x + per.x, z: back.z + per.z }),
          V.norm({ x: back.x - per.x, z: back.z - per.z })
        ],
        7.5
      );
      api.use('blink', dir.x, dir.z);
      api.faceAt(e.x, e.z);
      return;
    }
    if (
      api.ready('jump') &&
      eCast.remaining > 0.15 &&
      eCast.remaining < 0.33
    ) {
      api.move(back.x, back.z);
      api.use('jump');
      api.faceAt(e.x, e.z);
      return;
    }
  }

  // ---- melee escape ----
  if (d < 5.0 && blinkReady && !s.busy) {
    const back = V.norm(toUs);
    const per = V.perp(back);
    const dir = bestOf(
      p,
      api,
      [
        back,
        V.norm({ x: back.x * 2 + per.x, z: back.z * 2 + per.z }),
        V.norm({ x: back.x * 2 - per.x, z: back.z * 2 - per.z })
      ],
      7.5
    );
    api.use('blink', dir.x, dir.z);
    api.faceAt(e.x, e.z);
    return;
  }

  // ---- laser ----
  const casting = s.casting && s.casting.skill === 'laser';
  if (casting) {
    const lp = leadPoint(e, s.casting.remaining);
    api.faceAt(lp.x, lp.z);
  } else if (!s.busy) {
    const safeCharge =
      !chargeUp || d > 15.2 || e.stunned || (eCast && eCast.skill === 'charge');
    const safeSmash = d > 6.0 || e.stunned;
    if (
      api.ready('laser') &&
      e.visible &&
      d < 22 &&
      !e.airborne &&
      safeCharge &&
      safeSmash
    ) {
      const lp = leadPoint(e, 0.62);
      if (api.los(lp.x, lp.z)) {
        api.faceAt(lp.x, lp.z);
        api.use('laser');
      } else {
        api.faceAt(e.x, e.z);
      }
    } else if (e.visible) {
      const lp = leadPoint(e, 0.3);
      api.faceAt(lp.x, lp.z);
    }
  }

  // ---- positioning ----
  let desired = chargeUp ? 15.5 : 8.5;
  if (chargeUp && !api.ready('blink')) desired = 17.5;
  if (s.hp < 50) desired += 2;
  if (p.burn > 0 && s.hp / s.maxHp > e.hp / e.maxHp) desired += 2;

  let seek = null;
  if (!e.visible || d > desired + 2) {
    const path = api.pathTo(e.x, e.z);
    if (path && path.points && path.points.length && !path.direct) {
      let wp = path.points[0];
      if (
        path.points.length > 1 &&
        Math.hypot(wp.x - s.x, wp.z - s.z) < 0.8
      )
        wp = path.points[1];
      const dd = Math.hypot(wp.x - s.x, wp.z - s.z);
      if (dd > 0.4) seek = { x: (wp.x - s.x) / dd, z: (wp.z - s.z) / dd };
    }
  }

  const away = V.norm(toUs);
  const towardE = { x: -away.x, z: -away.z };
  const per = V.perp(away);
  const radial = Math.max(-1, Math.min(1, (d - desired) / 3));
  const r = Math.hypot(s.x, s.z);
  const cdir = r > 0.1 ? { x: -s.x / r, z: -s.z / r } : { x: 0, z: 1 };
  const cur =
    s.speed > 0.6 ? { x: s.vx / s.speed, z: s.vz / s.speed } : null;

  let best = null,
    bs = -1e9;
  for (const dir of DIRS) {
    const clr = api.ray(dir.x, dir.z, 5).dist;
    let sc = 1.5 * radial * (dir.x * towardE.x + dir.z * towardE.z);
    sc += 0.55 * orbitSign * (dir.x * per.x + dir.z * per.z);
    if (seek) sc += 1.3 * (dir.x * seek.x + dir.z * seek.z);
    if (clr < 1.3) sc -= 8;
    else if (clr < 3) sc -= 1.5 * (3 - clr);
    sc += 0.1 * Math.min(clr, 5);
    if (r > 13) sc += 0.45 * (r - 13) * (dir.x * cdir.x + dir.z * cdir.z);
    if (cur) sc += 0.2 * (dir.x * cur.x + dir.z * cur.z);
    if (sc > bs) {
      bs = sc;
      best = dir;
    }
  }
  if (best) api.move(best.x, best.z);

  if (t - lastSay > 9) {
    lastSay = t;
    api.say(chargeUp ? 'keeping the water between us' : 'window open');
  }
}
