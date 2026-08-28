const SMASH_LAND = 0.30;
let orbitSide = 1;
let lastFlip = 0;
let said = false;

function predict(o, t) {
  return { x: o.x + (o.vx || 0) * t, z: o.z + (o.vz || 0) * t };
}

function clampArena(pt) {
  const h = 19.0;
  return { x: Math.max(-h, Math.min(h, pt.x)), z: Math.max(-h, Math.min(h, pt.z)) };
}

function coverPoint(p, s, e) {
  let best = null, bestScore = 1e9;
  for (const o of p.arena.obstacles) {
    const d = V.norm({ x: o.x - e.x, z: o.z - e.z });
    if (d.x === 0 && d.z === 0) continue;
    const r = Math.max(o.hx, o.hz) + 1.8;
    const pt = clampArena({ x: o.x + d.x * r, z: o.z + d.z * r });
    const dd = V.dist(s, pt);
    const score = dd + V.dist(pt, e) * 0.35;
    if (score < bestScore) { bestScore = score; best = { pt, dd }; }
  }
  return best;
}

function think(p, api) {
  const s = p.self, e = p.enemy;
  if (!s.alive || !e.alive) return;

  if (!said) { said = true; api.say("Come down here, squid."); }

  for (const ev of p.events) {
    if (ev.type === 'blocked') orbitSide = -orbitSide;
    if (ev.type === 'enemyStarted') api.remember('last_' + ev.skill, p.t);
    if (ev.type === 'damaged') api.remember('hp', ev.hp);
  }

  if (p.t - lastFlip > 2.2 && api.rand() < 0.25) { orbitSide = -orbitSide; lastFlip = p.t; }

  const dist = e.dist;
  const dirE = V.toward(s, e);
  const c = s.casting;

  // ---- locked-in states ----
  if (c && c.skill === 'charge') {
    if (c.phase === 'windup') {
      const tt = c.remaining + Math.max(0, dist - 2.25) / 15;
      const tp = clampArena(predict(e, Math.min(1.0, tt)));
      api.faceAt(tp.x, tp.z);
      api.move(tp.x - s.x, tp.z - s.z);
    }
    return;
  }
  if (s.airborne) { api.faceAt(e.x, e.z); return; }
  if (c && c.skill === 'smash' && c.phase === 'windup') {
    const tp = predict(e, Math.max(0.05, c.remaining));
    api.faceAt(tp.x, tp.z);
    if (V.dist(s, tp) > 3.0) api.move(tp.x - s.x, tp.z - s.z); else api.stop();
    return;
  }

  let acted = false;
  const laserThreat = !!(e.casting && e.casting.skill === 'laser' && e.casting.telegraph);
  const enemyHopping = !!(e.casting && e.casting.skill === 'jump') || e.airborne;

  // ---- SMASH ----
  if (!s.busy && !s.stunned && api.ready('smash') && !enemyHopping && !e.invulnerable) {
    const pe = predict(e, SMASH_LAND);
    const dpe = V.dist(s, pe);
    if (dpe < 4.85) {
      const dirP = V.toward(s, pe);
      const err = Math.abs(V.angleTo(s.heading, dirP));
      const residual = Math.max(0, err - 2.2 * 0.28);
      const half = 0.96 + Math.asin(Math.min(0.95, e.radius / Math.max(1.3, dpe)));
      if (residual < half - 0.18) {
        api.use('smash');
        api.faceAt(pe.x, pe.z);
        acted = true;
      }
    }
  }

  // ---- CHARGE ----
  if (!acted && !s.busy && !s.stunned && api.ready('charge') && !enemyHopping && !e.invulnerable) {
    const eta = 0.28 + Math.max(0, dist - 2.25) / 15;
    const tp = clampArena(predict(e, Math.min(1.0, eta)));
    const dir = V.toward(s, tp);
    const want = V.dist(s, tp);
    const r = api.ray(dir.x, dir.z, Math.min(13, want + 0.6));
    const clear = !r.hit || r.dist >= want - 1.0;
    const inRange = dist < 12.0;
    const good = laserThreat ? (dist > 1.6) : (dist > 4.6);
    if (clear && inRange && good && e.visible) {
      api.use('charge');
      api.faceAt(tp.x, tp.z);
      acted = true;
    }
  }

  // ---- MOVEMENT ----
  if (!acted) {
    let moved = false;
    if (dist > 5.4) {
      if (laserThreat && dist > 6.5 && e.visible && e.casting) {
        const cov = coverPoint(p, s, e);
        const reach = e.casting.remaining * s.maxSpeed + 0.7;
        if (cov && cov.dd < reach) { api.moveTo(cov.pt.x, cov.pt.z); moved = true; }
      }
      if (!moved) {
        const tp = clampArena(predict(e, 0.35));
        api.moveTo(tp.x, tp.z);
        moved = true;
      }
    } else {
      const want = 2.7;
      const per = V.perp(dirE);
      let dirMv;
      if (dist > want + 1.1) dirMv = V.add(V.scale(dirE, 1.0), V.scale(per, orbitSide * 0.35));
      else if (dist < want - 0.7) dirMv = V.add(V.scale(dirE, -0.55), V.scale(per, orbitSide * 0.9));
      else dirMv = V.add(V.scale(dirE, 0.2), V.scale(per, orbitSide * 1.0));
      const n = V.norm(dirMv);
      const rr = api.ray(n.x, n.z, 2.3);
      if (rr.hit && rr.dist < 1.9) {
        orbitSide = -orbitSide;
        dirMv = V.add(V.scale(dirE, 0.45), V.scale(V.perp(dirE), orbitSide * 1.0));
      }
      api.move(dirMv.x, dirMv.z);
    }
    const fa = predict(e, 0.12);
    api.faceAt(fa.x, fa.z);
  }
}
