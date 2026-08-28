function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en.alive) return;

  const dist = en.dist;
  const toEn = V.toward(me, en);
  const awayEn = V.away(me, en);

  // ---- threat tracking ----
  let charging = false, chargeCommitted = false, smashing = false;
  if (en.casting) {
    if (en.casting.skill === 'charge') { charging = true; chargeCommitted = en.casting.phase === 'dash'; }
    if (en.casting.skill === 'smash') smashing = true;
  }
  for (const e of p.events) {
    if (e.type === 'enemyStarted' && e.skill === 'charge') charging = true;
    if (e.type === 'enemyCommitted' && e.skill === 'charge') chargeCommitted = true;
    if (e.type === 'damaged') api.remember('lastHit', p.t);
  }

  const lastBlinkT = api.recall('lastBlinkT', -99);

  // ---- helpers ----
  const clampPt = (x, z) => ({ x: Math.max(-19, Math.min(19, x)), z: Math.max(-19, Math.min(19, z)) });

  function blockedAt(x, z, pad) {
    for (const o of p.arena.obstacles) {
      if (Math.abs(x - o.x) < o.hx + pad && Math.abs(z - o.z) < o.hz + pad) return true;
    }
    return Math.abs(x) > 19.2 || Math.abs(z) > 19.2;
  }

  // score a retreat direction: away from enemy, open space
  function pickRetreat() {
    let best = null, bestScore = -1e9;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const d = { x: Math.sin(a), z: Math.cos(a) };
      const r = api.ray(d.x, d.z, 8);
      const open = Math.min(r.dist, 8);
      const align = V.dot(d, awayEn);
      const tgt = clampPt(me.x + d.x * open * 0.9, me.z + d.z * open * 0.9);
      const wallPen = (Math.abs(tgt.x) > 16 || Math.abs(tgt.z) > 16) ? -4 : 0;
      const s = open * 0.9 + align * 5 + wallPen;
      if (s > bestScore) { bestScore = s; best = d; }
    }
    return best || awayEn;
  }

  // ---- BLINK: emergency dodge ----
  const blinkReady = api.ready('blink');
  if (blinkReady) {
    let doBlink = false, bd = null;
    if (chargeCommitted) {
      // dash direction is enemy heading; blink perpendicular
      const hv = V.fromHeading(en.heading);
      const rel = V.sub(me, en);
      const lateral = V.dot(rel, V.perp(hv));
      const side = lateral >= 0 ? 1 : -1;
      bd = V.scale(V.perp(hv), side);
      doBlink = dist < 15;
    } else if (charging && dist < 14) {
      const hv = V.fromHeading(en.heading);
      const rel = V.sub(me, en);
      const lateral = V.dot(rel, V.perp(hv));
      const side = lateral >= 0 ? 1 : -1;
      bd = V.scale(V.perp(hv), side);
      doBlink = true;
    } else if (smashing && dist < 6.0) {
      bd = awayEn;
      doBlink = true;
    } else if (dist < 4.5 && !en.stunned) {
      bd = awayEn;
      doBlink = true;
    } else if (dist < 9 && me.hp < 55 && p.t - lastBlinkT > 1.5) {
      bd = awayEn;
      doBlink = true;
    }
    if (doBlink && bd) {
      // avoid blinking into a corner: bias
      let cand = { x: me.x + bd.x * 7.5, z: me.z + bd.z * 7.5 };
      if (Math.abs(cand.x) > 18 || Math.abs(cand.z) > 18) {
        const alt = V.scale(bd, -1);
        const c2 = { x: me.x + alt.x * 7.5, z: me.z + alt.z * 7.5 };
        if (Math.abs(c2.x) < 18 && Math.abs(c2.z) < 18 && V.dist(c2, en) > 5) bd = alt;
      }
      api.remember('lastBlinkT', p.t);
      api.use('blink', bd.x, bd.z);
      api.face(toEn.x, toEn.z);
      api.move(bd.x, bd.z);
      return;
    }
  }

  // ---- JUMP: dodge smash landing ----
  if (smashing && dist < 6.2 && api.ready('jump') && !me.busy && !blinkReady) {
    const rem = en.casting ? en.casting.remaining : 0.15;
    if (rem <= 0.22) {
      api.move(awayEn.x, awayEn.z);
      api.face(toEn.x, toEn.z);
      api.use('jump');
      return;
    }
  }

  // ---- LASER logic ----
  const laserReady = api.ready('laser');
  const canSee = en.visible;
  const inRange = dist < 24.5;

  // Predict where enemy will be at fire time (0.667s) — mostly use current pos
  function aimPoint() {
    const lead = 0.30;
    let px = en.x + en.vx * lead, pz = en.z + en.vz * lead;
    return { x: px, z: pz };
  }

  // If currently casting laser, keep aiming
  if (me.casting && me.casting.skill === 'laser') {
    const ap = aimPoint();
    api.faceAt(ap.x, ap.z);
    // strafe while casting (slow anyway) — sidestep away if close
    if (dist < 8) {
      const side = V.perp(toEn);
      const sgn = api.recall('strafe', 1);
      api.move(awayEn.x * 0.8 + side.x * sgn * 0.6, awayEn.z * 0.8 + side.z * sgn * 0.6);
    } else if (dist > 16) {
      api.move(toEn.x * 0.5, toEn.z * 0.5);
    } else {
      const side = V.perp(toEn);
      const sgn = api.recall('strafe', 1);
      api.move(side.x * sgn, side.z * sgn);
    }
    return;
  }

  // start laser?
  if (laserReady && !me.busy && canSee && inRange && !me.airborne) {
    const ap = aimPoint();
    const ang = Math.abs(V.angleTo(me.heading, V.toward(me, ap)));
    // don't cast if a charge is inbound and we can't blink out
    const danger = (charging && dist < 16) || (dist < 5.0);
    if (!danger && ang < 1.2) {
      api.use('laser');
      api.faceAt(ap.x, ap.z);
      return;
    }
  }

  // ---- Movement / positioning ----
  // ideal range: 12-18m, keep line of sight, keep away from walls
  api.remember('strafe', api.recall('strafe', 1));
  if (p.tick % 60 === 0) api.remember('strafe', -api.recall('strafe', 1));

  const sgn = api.recall('strafe', 1);
  const side = V.perp(toEn);

  let mv;
  if (charging && !chargeCommitted && dist < 16) {
    // sidestep hard
    mv = V.norm({ x: side.x * sgn * 1.2 + awayEn.x * 0.6, z: side.z * sgn * 1.2 + awayEn.z * 0.6 });
  } else if (chargeCommitted) {
    const hv = V.fromHeading(en.heading);
    const rel = V.sub(me, en);
    const lat = V.dot(rel, V.perp(hv));
    const s = lat >= 0 ? 1 : -1;
    mv = V.scale(V.perp(hv), s);
  } else if (dist < 9) {
    mv = V.norm({ x: awayEn.x * 1.3 + side.x * sgn * 0.7, z: awayEn.z * 1.3 + side.z * sgn * 0.7 });
  } else if (dist > 19 || !canSee) {
    mv = toEn;
  } else {
    mv = V.norm({ x: side.x * sgn + awayEn.x * 0.25, z: side.z * sgn + awayEn.z * 0.25 });
  }

  // avoid walls: steer inward if the chosen dir runs into one
  const probe = api.ray(mv.x, mv.z, 3.0);
  if (probe.hit && probe.dist < 2.2) {
    const center = V.norm({ x: -me.x, z: -me.z });
    let bestD = null, bestS = -1e9;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const d = { x: Math.sin(a), z: Math.cos(a) };
      const r = api.ray(d.x, d.z, 5);
      const s = Math.min(r.dist, 5) * 1.0 + V.dot(d, mv) * 2.5 + V.dot(d, center) * 1.0;
      if (s > bestS) { bestS = s; bestD = d; }
    }
    mv = bestD || center;
    api.remember('strafe', -sgn);
  }

  api.move(mv.x, mv.z);
  api.faceAt(en.x, en.z);
}
