function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive) return;

  const D = en.dist;
  const toEnemy = V.toward(me, en);
  const awayEnemy = V.away(me, en);

  // ---- event bookkeeping ----
  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      if (e.skill === 'charge') { lastChargeStart = p.t; chargeWindup = true; }
      if (e.skill === 'smash') lastSmashStart = p.t;
      if (e.skill === 'jump') lastJumpStart = p.t;
    }
    if (e.type === 'enemyCommitted' && e.skill === 'charge') {
      chargeWindup = false; chargeCommitted = p.t;
      chargeDir = { x: Math.sin(en.heading), z: Math.cos(en.heading) };
      chargeOrigin = { x: en.x, z: en.z };
    }
    if (e.type === 'damaged') lastHurt = p.t;
    if (e.type === 'chargeStopped') { chargeCommitted = -99; }
  }
  if (en.casting && en.casting.skill === 'charge' && en.casting.phase === 'dash') {
    chargeCommitted = p.t;
    if (!chargeDir) chargeDir = { x: Math.sin(en.heading), z: Math.cos(en.heading) };
  }
  if (!en.casting || en.casting.skill !== 'charge') {
    if (p.t - chargeCommitted > 0.9) chargeCommitted = -99;
  }

  const enemyCasting = en.casting;
  const enemyChargingNow = enemyCasting && enemyCasting.skill === 'charge';
  const enemySmashing = enemyCasting && enemyCasting.skill === 'smash' && enemyCasting.telegraph;

  // ---- threat: incoming charge ----
  let dodgeCharge = false;
  if (enemyChargingNow && (enemyCasting.phase === 'dash' || (enemyCasting.phase === 'windup' && enemyCasting.remaining < 0.16))) {
    // are we in the charge corridor?
    const dir = enemyCasting.phase === 'dash' && chargeDir ? chargeDir : { x: Math.sin(en.heading), z: Math.cos(en.heading) };
    const rel = V.sub(me, en);
    const along = V.dot(rel, dir);
    const lateral = Math.abs(rel.x * dir.z - rel.z * dir.x);
    if (along > -1 && along < 14 && lateral < 2.8) dodgeCharge = true;
  }

  // ---- laser aiming helper ----
  const CAST = 0.65;
  const laserReady = api.ready('laser');
  const casting = me.casting && me.casting.skill === 'laser';

  // predicted enemy position at fire time
  function predictEnemy(dtAhead) {
    return { x: en.x + en.vx * dtAhead * 0.7, z: en.z + en.vz * dtAhead * 0.7 };
  }

  // ---- decide facing/movement ----
  let didMove = false, didFace = false;

  // 1. Emergency dodge of a committed charge -> blink perpendicular
  if (dodgeCharge) {
    const dir = chargeDir && enemyChargingNow && enemyCasting.phase === 'dash' ? chargeDir : { x: Math.sin(en.heading), z: Math.cos(en.heading) };
    let perp = V.perp(dir);
    // choose side pointing away from wall
    if (Math.abs(me.x + perp.x * 6) > 19 || Math.abs(me.z + perp.z * 6) > 19) perp = V.scale(perp, -1);
    if (api.ready('blink') && !me.busy) {
      api.use('blink', perp.x, perp.z);
      api.face(toEnemy.x, toEnemy.z);
      api.remember('act', 'dodge-blink');
      return;
    }
    if (!me.busy || casting) {
      api.move(perp.x, perp.z);
      api.face(toEnemy.x, toEnemy.z);
      didMove = didFace = true;
    }
  }

  // 2. Smash range danger: within 6m and they can smash
  const smashDanger = D < 6.2;

  // ---- main policy ----
  // Preferred: keep at 8-14 m with LOS, laser them.
  const IDEAL_MIN = 8.5, IDEAL_MAX = 15;

  if (!didFace) {
    if (en.visible) {
      const pr = predictEnemy(casting ? me.casting.remaining : CAST);
      api.faceAt(pr.x, pr.z);
    } else {
      api.faceAt(en.x, en.z);
    }
    didFace = true;
  }

  // fire laser
  if (!didMove || true) {
    if (laserReady && !me.busy && en.visible && D < 25 && !me.airborne && !me.stunned) {
      // don't cast if enemy is very close (they'll smash) unless we can blink after
      const aim = V.angleTo(me.heading, toEnemy);
      const okAngle = Math.abs(aim) < 0.9;
      if (okAngle && (D > 6.0 || en.stunned || en.busy)) {
        api.use('laser');
        api.remember('act', 'laser');
      }
    }
  }

  // ---- movement ----
  if (!didMove) {
    let mv = null;
    if (me.busy && casting) {
      // during cast, strafe slightly to dodge, keep facing handled
      const perp = V.perp(toEnemy);
      const side = (Math.floor(p.t * 0.7) % 2 === 0) ? 1 : -1;
      let s = V.scale(perp, side);
      if (D < IDEAL_MIN) s = V.add(s, V.scale(awayEnemy, 1.2));
      mv = s;
    } else if (smashDanger) {
      // get out
      if (api.ready('blink') && D < 4.6 && !me.busy) {
        let dirB = awayEnemy;
        // blink away, prefer keeping in arena
        const cand = [awayEnemy, V.rot(awayEnemy, 0.7), V.rot(awayEnemy, -0.7), V.perp(toEnemy), V.scale(V.perp(toEnemy), -1)];
        let best = null, bestScore = -1e9;
        for (const c of cand) {
          const px = me.x + c.x * 7.0, pz = me.z + c.z * 7.0;
          const cx = Math.max(-19, Math.min(19, px)), cz = Math.max(-19, Math.min(19, pz));
          const d2 = Math.hypot(cx - en.x, cz - en.z);
          const wallPen = (Math.abs(px) > 19 ? 3 : 0) + (Math.abs(pz) > 19 ? 3 : 0);
          const sc = d2 - wallPen;
          if (sc > bestScore) { bestScore = sc; best = c; }
        }
        api.use('blink', best.x, best.z);
        api.remember('act', 'kite-blink');
        return;
      }
      mv = V.add(awayEnemy, V.scale(V.perp(toEnemy), 0.6));
    } else if (D < IDEAL_MIN) {
      mv = V.add(awayEnemy, V.scale(V.perp(toEnemy), 0.5));
    } else if (D > IDEAL_MAX || !en.visible) {
      if (!en.visible) {
        const path = api.pathTo(en.x, en.z);
        if (path && path.points && path.points.length) {
          const pt = path.points[0];
          api.moveTo(pt.x, pt.z);
          didMove = true;
        } else {
          mv = toEnemy;
        }
      } else {
        mv = toEnemy;
      }
    } else {
      // orbit at ideal range
      const side = orbitSide;
      mv = V.scale(V.perp(toEnemy), side);
      // slight radial correction
      const mid = (IDEAL_MIN + IDEAL_MAX) / 2;
      mv = V.add(mv, V.scale(toEnemy, (D - mid) * 0.12));
    }

    if (!didMove && mv) {
      // wall avoidance
      const nx = me.x + mv.x * 3, nz = me.z + mv.z * 3;
      if (Math.abs(nx) > 18.2 || Math.abs(nz) > 18.2) {
        const inward = V.norm({ x: -me.x, z: -me.z });
        mv = V.add(V.scale(mv, 0.4), inward);
        orbitSide = -orbitSide;
      }
      // obstacle avoidance
      const r = api.ray(mv.x, mv.z, 3.0);
      if (r && r.hit && r.dist < 2.2) {
        const alt1 = V.rot(mv, 1.0), alt2 = V.rot(mv, -1.0);
        const r1 = api.ray(alt1.x, alt1.z, 3.0), r2 = api.ray(alt2.x, alt2.z, 3.0);
        mv = (r1.dist >= r2.dist) ? alt1 : alt2;
      }
      api.move(mv.x, mv.z);
      didMove = true;
    }
  }

  // flip orbit direction occasionally
  if (p.t - lastFlip > 2.2 + api.rand() * 1.5) { orbitSide = -orbitSide; lastFlip = p.t; }

  // jump to evade a landing smash
  if (enemySmashing && D < 5.6 && api.ready('jump') && !me.busy && enemyCasting.remaining < 0.2) {
    api.use('jump');
  }
}

let orbitSide = 1;
let lastFlip = 0;
let lastChargeStart = -99;
let lastSmashStart = -99;
let lastJumpStart = -99;
let lastHurt = -99;
let chargeWindup = false;
let chargeCommitted = -99;
let chargeDir = null;
let chargeOrigin = null;
