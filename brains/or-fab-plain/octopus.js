let strafeSide = 1;

function predict(p, t) {
  const E = p.enemy;
  const x = Math.max(-19, Math.min(19, E.x + E.vx * t));
  const z = Math.max(-19, Math.min(19, E.z + E.vz * t));
  return { x, z };
}

function chargeInfo(p) {
  const c = p.enemy.casting;
  if (!c || c.skill !== 'charge') return null;
  const E = p.enemy, S = p.self;
  if (c.phase === 'windup') return { stage: 'windup' };
  if (c.phase !== 'dash') return null;
  let dir = { x: E.vx, z: E.vz };
  if (V.len(dir) < 1) dir = V.fromHeading(E.heading);
  dir = V.norm(dir);
  const rel = V.sub({ x: S.x, z: S.z }, { x: E.x, z: E.z });
  const along = V.dot(rel, dir);
  const perp = V.len(V.sub(rel, V.scale(dir, along)));
  if (along > -1 && along < 15 && perp < 3.2) return { stage: 'dash', dir };
  return { stage: 'dashMiss', dir };
}

function bestBlink(p, dirs, avoidLine) {
  const me = { x: p.self.x, z: p.self.z }, en = { x: p.enemy.x, z: p.enemy.z };
  let best = null, bs = -1e9;
  for (const d0 of dirs) {
    const d = V.norm(d0);
    if (!d.x && !d.z) continue;
    const landing = V.clamp(V.add(me, V.scale(d, 7.5)), -19, 19);
    let s = Math.min(V.dist(landing, en), 14);
    s += Math.min(20 - Math.abs(landing.x), 20 - Math.abs(landing.z), 5) * 0.9;
    if (avoidLine) {
      const rel = V.sub(landing, en);
      const along = V.dot(rel, avoidLine);
      const perp = V.len(V.sub(rel, V.scale(avoidLine, along)));
      if (along > -1 && perp < 3.5) s -= 25;
    }
    if (s > bs) { bs = s; best = d; }
  }
  return best;
}

function bestMoveDir(api, base) {
  let best = base, bs = -1e9;
  for (const ang of [0, 0.45, -0.45, 0.9, -0.9, 1.35, -1.35, 1.9, -1.9]) {
    const d = V.rot(base, ang);
    const r = api.ray(d.x, d.z, 7);
    const s = Math.min(r.dist, 7) + 3.5 * V.dot(d, base);
    if (s > bs) { bs = s; best = d; }
  }
  return best;
}

function think(p, api) {
  const S = p.self, E = p.enemy;
  const me = { x: S.x, z: S.z }, en = { x: E.x, z: E.z };
  const dist = E.dist;
  const away = V.away(me, en);
  const twd = V.toward(me, en);

  for (const ev of p.events) {
    if (ev.type === 'blocked') strafeSide = -strafeSide;
  }

  const ct = chargeInfo(p);
  const myFrac = S.hp / S.maxHp, eFrac = E.hp / E.maxHp;
  const aggro = p.t > 28 && myFrac <= eFrac + 0.02;

  if (S.stunned || S.airborne) {
    api.faceAt(en.x, en.z);
    return;
  }

  // incoming charge dash: blink perpendicular or scramble sideways
  if (ct && ct.stage === 'dash') {
    if (!S.busy && api.ready('blink')) {
      const perp = V.perp(ct.dir);
      const d = bestBlink(p, [perp, V.scale(perp, -1)], ct.dir) || perp;
      api.use('blink', d.x, d.z);
      api.faceAt(en.x, en.z);
      return;
    }
    const perp = V.perp(ct.dir);
    const base = V.dot(perp, away) >= 0 ? perp : V.scale(perp, -1);
    const d = bestMoveDir(api, base);
    api.move(d.x, d.z);
    api.faceAt(en.x, en.z);
    return;
  }

  // smash winding up close: hop over it, or blink out
  const ec = E.casting;
  if (ec && ec.skill === 'smash' && ec.telegraph && dist < 6.2 && !S.busy) {
    if (api.ready('jump') && ec.remaining > 0.1) {
      api.move(away.x, away.z);
      api.use('jump');
      api.faceAt(en.x, en.z);
      return;
    }
    if (api.ready('blink')) {
      const d = bestBlink(p, [away, V.rot(away, 0.7), V.rot(away, -0.7)]) || away;
      api.use('blink', d.x, d.z);
      return;
    }
    const d = bestMoveDir(api, away);
    api.move(d.x, d.z);
    api.faceAt(en.x, en.z);
    return;
  }

  // mid-cast: track the target, drift back if crowded
  if (S.casting && S.casting.skill === 'laser') {
    if (S.casting.telegraph) {
      const rem = Math.max(S.casting.remaining - 0.03, 0);
      const tgt = predict(p, rem);
      api.faceAt(tgt.x, tgt.z);
    }
    if (dist < 8) {
      const d = bestMoveDir(api, away);
      api.move(d.x, d.z);
    } else {
      api.move(0, 0);
    }
    return;
  }

  // enemy charge windup: hold fire, drift sideways so the lock misses
  if (ct && ct.stage === 'windup') {
    const perp = V.scale(V.perp(twd), strafeSide);
    const base = V.norm(V.add(perp, V.scale(away, 0.5)));
    const d = bestMoveDir(api, base);
    api.move(d.x, d.z);
    api.faceAt(en.x, en.z);
    return;
  }

  // too close for comfort: blink out before the smash even starts
  if (dist < 3.4 && !S.busy && api.ready('blink')) {
    const d = bestBlink(p, [away, V.rot(away, 0.9), V.rot(away, -0.9), V.rot(away, 1.6), V.rot(away, -1.6)]) || away;
    api.use('blink', d.x, d.z);
    return;
  }

  // fire when it is safe to stand in a 0.667s cast
  const enemyTiedUp = E.stunned || (ec && (ec.phase === 'recover' || ec.skill === 'smash'));
  const safeToFire = dist > 6.5 || enemyTiedUp || aggro;
  if (!S.busy && api.ready('laser') && E.visible && !E.invulnerable && dist < 25.5 && safeToFire) {
    const tgt = predict(p, 0.63);
    const aimDir = V.sub(tgt, me);
    const ang = Math.abs(V.angleTo(S.heading, aimDir));
    if (ang < 1.25 && api.los(tgt.x, tgt.z)) {
      api.faceAt(tgt.x, tgt.z);
      api.use('laser');
      if (dist < 10) {
        const d = bestMoveDir(api, away);
        api.move(d.x, d.z);
      } else {
        api.move(0, 0);
      }
      return;
    }
    api.faceAt(tgt.x, tgt.z);
  } else {
    api.faceAt(en.x, en.z);
  }

  // positioning
  const want = aggro ? 10 : 12;
  if (!E.visible) {
    api.moveTo(en.x, en.z);
    return;
  }
  if (dist < want - 3) {
    const d = bestMoveDir(api, away);
    api.move(d.x, d.z);
    return;
  }
  if (dist > want + 6) {
    api.moveTo(en.x, en.z);
    return;
  }
  const perp = V.scale(V.perp(twd), strafeSide);
  const bias = dist < want ? V.scale(away, 0.5) : (dist > want + 2 ? V.scale(twd, 0.4) : { x: 0, z: 0 });
  let d = V.norm(V.add(perp, bias));
  const r = api.ray(d.x, d.z, 3);
  if (r.hit && r.dist < 2.2) {
    strafeSide = -strafeSide;
    d = V.norm(V.add(V.scale(perp, -1), bias));
  }
  api.move(d.x, d.z);
}