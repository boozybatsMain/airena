function predict(e, t) {
  return { x: e.x + (e.vx || 0) * t, z: e.z + (e.vz || 0) * t };
}

function clampArena(pt, lim) {
  return {
    x: Math.max(-lim, Math.min(lim, pt.x)),
    z: Math.max(-lim, Math.min(lim, pt.z))
  };
}

function coverPoint(p, api, me, en) {
  let best = null, bestScore = 1e9;
  for (const o of p.arena.obstacles) {
    let away = V.norm({ x: o.x - en.x, z: o.z - en.z });
    if (away.x === 0 && away.z === 0) continue;
    const off = Math.max(o.hx, o.hz) + 2.2;
    const pt = clampArena({ x: o.x + away.x * off, z: o.z + away.z * off }, 18.0);
    const dme = Math.hypot(pt.x - me.x, pt.z - me.z);
    const den = Math.hypot(pt.x - en.x, pt.z - en.z);
    const score = dme - 0.6 * den;
    if (score < bestScore) { bestScore = score; best = pt; }
  }
  return best;
}

function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me || !en || !me.alive) return;
  if (me.airborne) return;

  const now = p.t;
  const d = en.dist;

  // ---------- read events ----------
  let blocked = false;
  for (const ev of p.events) {
    if (ev.type === 'blocked') blocked = true;
  }
  if (blocked) api.remember('blockUntil', now + 0.5);
  const pathing = now < api.recall('blockUntil', 0);

  // ---------- strafe side ----------
  let side = api.recall('side', 1);
  if (now >= api.recall('flipAt', 0)) {
    side = api.rand() < 0.5 ? 1 : -1;
    api.remember('side', side);
    api.remember('flipAt', now + 0.5 + api.rand() * 0.9);
  }

  // ---------- enemy cast state ----------
  const ec = en.casting;
  const laserCasting = !!(ec && ec.skill === 'laser' && ec.telegraph);
  const laserRem = laserCasting ? ec.remaining : 99;
  const enUntouchable = !!(en.invulnerable || en.airborne);

  const myFrac = me.hp / me.maxHp;
  const enFrac = en.hp / en.maxHp;
  const stalling = p.timeLeft < 14 && myFrac > enFrac + 0.04;

  // ---------- FACING ----------
  const mc = me.casting;
  let faceP;
  if (mc && mc.skill === 'charge' && mc.phase === 'windup') {
    const tt = mc.remaining + Math.max(0, d - 2.25) / 15;
    faceP = predict(en, tt);
  } else if (mc && mc.skill === 'smash' && mc.phase === 'windup') {
    faceP = predict(en, mc.remaining);
  } else {
    faceP = predict(en, Math.min(0.3, d / 12));
  }
  api.faceAt(faceP.x, faceP.z);

  // ---------- SKILLS ----------
  const canAct = !me.busy && !me.stunned;

  if (canAct) {
    const smashOk = api.ready('smash');
    const chargeOk = api.ready('charge');

    const fut = predict(en, 0.30);
    const fd = Math.hypot(fut.x - me.x, fut.z - me.z);

    const tImpact = 0.34 + Math.max(0, d - 2.25) / 15;
    const wantInterrupt = laserCasting && chargeOk && d <= 12 &&
      tImpact <= laserRem + 0.15;

    let acted = false;

    // charge to break a laser cast, top priority
    if (wantInterrupt && en.visible) {
      const aim = predict(en, tImpact);
      const dir = V.norm(V.sub(aim, me));
      if (dir.x !== 0 || dir.z !== 0) {
        const ang = Math.abs(V.angleTo(me.heading, dir));
        if (ang < 1.0) {
          const r = api.ray(dir.x, dir.z, Math.min(d + 1.0, 12));
          if (!r.hit || r.dist > d - 1.7) {
            if (api.use('charge')) { api.face(dir.x, dir.z); acted = true; }
          }
        }
      }
    }

    // melee smash
    if (!acted && smashOk && !enUntouchable && d < 4.1 && fd < 4.4) {
      if (api.use('smash')) acted = true;
    }

    // charge as a closer / opener
    if (!acted && chargeOk && en.visible && !stalling) {
      const lo = smashOk ? 3.3 : 2.0;
      if (d >= lo && d <= 11.5) {
        const aim = predict(en, tImpact);
        const dir = V.norm(V.sub(aim, me));
        if (dir.x !== 0 || dir.z !== 0) {
          const ang = Math.abs(V.angleTo(me.heading, dir));
          if (ang < 0.8) {
            const r = api.ray(dir.x, dir.z, Math.min(d + 1.0, 12));
            if (!r.hit || r.dist > d - 1.7) {
              if (api.use('charge')) { api.face(dir.x, dir.z); acted = true; }
            }
          }
        }
      }
    }
  }

  // ---------- MOVEMENT ----------
  if (stalling && d > 3.0) {
    const cp = coverPoint(p, api, me, en);
    const gx = api.recall('sgx', null);
    if (cp && (gx === null || Math.hypot(cp.x - gx, cp.z - api.recall('sgz', 0)) > 1.2 ||
      now - api.recall('sgt', -9) > 0.6)) {
      api.moveTo(cp.x, cp.z);
      api.remember('sgx', cp.x);
      api.remember('sgz', cp.z);
      api.remember('sgt', now);
    } else if (!cp) {
      const away = V.away(me, en);
      api.move(away.x, away.z);
    }
    return;
  }

  if (en.visible && !pathing) {
    let lead = V.lead(me, en, { x: en.vx, z: en.vz }, me.maxSpeed);
    if (!lead || (!isFinite(lead.x) || !isFinite(lead.z))) lead = { x: en.x, z: en.z };
    lead = clampArena(lead, 19.0);
    let dir = V.norm(V.sub(lead, me));
    if (dir.x === 0 && dir.z === 0) dir = V.toward(me, en);

    let lateral = 0;
    if (d > 3.2) lateral = laserCasting ? 0.8 : 0.3;
    let mv = dir;
    if (lateral > 0) {
      const perp = V.perp(dir);
      mv = V.norm(V.add(dir, V.scale(perp, side * lateral)));
      const r = api.ray(mv.x, mv.z, 2.6);
      if (r.hit && r.dist < 2.2) mv = dir;
    }
    api.move(mv.x, mv.z);
    api.forget('gx');
  } else {
    const gx = api.recall('gx', null);
    const stale = gx === null ||
      Math.hypot(en.x - gx, en.z - api.recall('gz', 0)) > 1.5 ||
      now - api.recall('gt', -9) > 0.45;
    if (stale) {
      api.moveTo(en.x, en.z);
      api.remember('gx', en.x);
      api.remember('gz', en.z);
      api.remember('gt', now);
    }
  }
}
