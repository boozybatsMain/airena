const CDS = { smash: 1.3, charge: 4.033, jump: 2.8 };
const HOME = { x: 0, z: 0 };

let M = {
  last: { smash: -99, charge: -99, jump: -99 },
  jitter: 0,
  jitterT: -99,
  lastBlink: -99,
  saidT: -99
};

function clampArena(pt, m) {
  return {
    x: Math.max(-20 + m, Math.min(20 - m, pt.x)),
    z: Math.max(-20 + m, Math.min(20 - m, pt.z))
  };
}

function edgeRoom(pt) {
  return Math.min(20 - Math.abs(pt.x), 20 - Math.abs(pt.z));
}

function predictEnemy(p, ta) {
  const e = p.enemy;
  let vx = e.vx, vz = e.vz;
  if (e.casting && e.casting.skill === 'charge' && e.casting.phase === 'dash') {
    const h = V.fromHeading(e.heading);
    vx = h.x * 15; vz = h.z * 15;
  } else {
    vx *= 0.62; vz *= 0.62;
  }
  let pt = { x: e.x + vx * ta, z: e.z + vz * ta };
  return clampArena(pt, 1.3);
}

function pickDir(p, api, base) {
  const self = { x: p.self.x, z: p.self.z };
  const en = { x: p.enemy.x, z: p.enemy.z };
  let best = base, bs = -1e9;
  for (let i = -4; i <= 4; i++) {
    const d = V.rot(base, i * 0.36);
    if (V.len(d) < 0.001) continue;
    let clear = 6;
    try {
      const r = api.ray(d.x, d.z, 6);
      clear = Math.min(r.dist, 6);
    } catch (err) { clear = 6; }
    const step = Math.min(clear, 4.5);
    const probe = { x: self.x + d.x * step, z: self.z + d.z * step };
    const sc = clear * 1.3
      + Math.min(edgeRoom(probe), 7) * 1.1
      + V.dot(d, base) * 3.2
      + Math.min(V.dist(probe, en), 20) * 0.4;
    if (sc > bs) { bs = sc; best = d; }
  }
  return best;
}

function bestBlinkDir(p, api, base) {
  const self = { x: p.self.x, z: p.self.z };
  const en = { x: p.enemy.x, z: p.enemy.z };
  let best = base, bs = -1e9;
  for (let i = -3; i <= 3; i++) {
    const d = V.rot(base, i * 0.42);
    const raw = { x: self.x + d.x * 7.4, z: self.z + d.z * 7.4 };
    const land = clampArena(raw, 1.5);
    const clipped = Math.abs(land.x - raw.x) + Math.abs(land.z - raw.z);
    const sc = Math.min(V.dist(land, en), 22) * 1.0
      - clipped * 1.6
      + Math.min(edgeRoom(land), 8) * 0.5
      + V.dot(d, base) * 2.0;
    if (sc > bs) { bs = sc; best = d; }
  }
  return best;
}

function think(p, api) {
  const s = p.self, e = p.enemy;
  if (!s.alive) return;
  const t = p.t;

  for (const ev of p.events) {
    if (ev.type === 'enemyStarted' && M.last[ev.skill] !== undefined) M.last[ev.skill] = t;
    if (ev.type === 'blinked') M.lastBlink = t;
    if (ev.type === 'blocked') { M.jitter = (api.rand() - 0.5) * 1.4; M.jitterT = t; }
  }

  const self = { x: s.x, z: s.z };
  const en = { x: e.x, z: e.z };
  const dist = e.dist;
  const away = V.len(V.sub(self, en)) > 0.001 ? V.norm(V.sub(self, en)) : { x: 1, z: 0 };
  const toCenter = V.norm(V.sub(HOME, self));

  const chargeCd = Math.max(0, CDS.charge - (t - M.last.charge));
  const smashCd = Math.max(0, CDS.smash - (t - M.last.smash));
  const chargeThreat = chargeCd < 0.35;
  const smashThreat = smashCd < 0.3;

  const myFrac = s.hp / s.maxHp;
  const hisFrac = e.hp / e.maxHp;
  const losing = myFrac < hisFrac - 0.02;
  const late = t > 27;
  const desperate = late && losing;

  const ec = e.casting;
  const busy = s.busy;

  // ---------- mid-cast behaviour ----------
  if (busy && s.casting && s.casting.skill === 'laser') {
    const aim = predictEnemy(p, Math.max(0.05, s.casting.remaining));
    api.faceAt(aim.x, aim.z);
    let base = away;
    if (dist > 17) base = V.norm(V.add(V.perp(away), V.scale(away, -0.35)));
    const d = pickDir(p, api, V.norm(V.add(base, V.scale(toCenter, 0.25))));
    api.move(d.x, d.z);
    return;
  }
  if (busy) {
    api.faceAt(e.x, e.z);
    return;
  }
  if (s.stunned) {
    api.faceAt(e.x, e.z);
    return;
  }

  // ---------- dodging ----------
  // charge dodge: sidestep by blinking perpendicular to their locked line
  if (ec && ec.skill === 'charge' && dist < 17) {
    const aimedAt = Math.abs(V.angleTo(e.heading, away)) < 0.62;
    const committed = ec.phase === 'dash' || (ec.phase === 'windup' && ec.remaining < 0.14);
    if (aimedAt && committed && api.ready('blink')) {
      const eh = V.fromHeading(e.heading);
      const perp = V.perp(eh);
      const opts = [
        V.norm(V.add(perp, V.scale(away, 0.35))),
        V.norm(V.add(V.scale(perp, -1), V.scale(away, 0.35)))
      ];
      let pick = opts[0], bs = -1e9;
      for (const o of opts) {
        const land = clampArena({ x: self.x + o.x * 7.4, z: self.z + o.z * 7.4 }, 1.5);
        const sc = Math.min(edgeRoom(land), 8) * 1.0 + V.dist(land, en) * 0.5;
        if (sc > bs) { bs = sc; pick = o; }
      }
      const d = bestBlinkDir(p, api, pick);
      api.use('blink', d.x, d.z);
      api.move(d.x, d.z);
      api.faceAt(e.x, e.z);
      return;
    }
  }

  // smash dodge: hop over the ground sweep
  if (ec && ec.skill === 'smash' && ec.telegraph && dist < 7.0) {
    if (ec.remaining > 0.13 && api.ready('jump')) {
      const d = pickDir(p, api, V.norm(V.add(away, V.scale(toCenter, 0.25))));
      api.move(d.x, d.z);
      api.faceAt(e.x, e.z);
      api.use('jump');
      return;
    }
    if (api.ready('blink') && dist < 6.0) {
      const d = bestBlinkDir(p, api, V.norm(V.add(away, V.scale(toCenter, 0.3))));
      api.use('blink', d.x, d.z);
      api.move(d.x, d.z);
      api.faceAt(e.x, e.z);
      return;
    }
  }

  // panic disengage when the ape is on top of us
  if (dist < 5.6 && api.ready('blink') && (smashThreat || chargeThreat || dist < 4.2)) {
    const d = bestBlinkDir(p, api, V.norm(V.add(away, V.scale(toCenter, 0.3))));
    api.use('blink', d.x, d.z);
    api.move(d.x, d.z);
    api.faceAt(e.x, e.z);
    return;
  }

  // ---------- shooting ----------
  const aimPt = predictEnemy(p, 0.72);
  const toAim = V.norm(V.sub(aimPt, self));
  const angErr = Math.abs(V.angleTo(s.heading, toAim));

  let minFire = chargeThreat ? 10.6 : 6.2;
  if (desperate) minFire = chargeThreat ? 8.5 : 4.6;

  const losOk = e.visible && api.los(aimPt.x, aimPt.z);

  if (api.ready('laser') && losOk && dist > minFire && dist < 21.5 &&
      angErr < 1.15 && !e.invulnerable) {
    api.faceAt(aimPt.x, aimPt.z);
    api.use('laser');
    const d = pickDir(p, api, V.norm(V.add(away, V.scale(toCenter, 0.2))));
    api.move(d.x, d.z);
    if (t - M.saidT > 6) { M.saidT = t; api.say("ink and light"); }
    return;
  }

  // ---------- positioning ----------
  let desired = 15.8;
  if (desperate) desired = 12.0;
  if (chargeCd > 1.2 && !late) desired = 13.5;

  api.faceAt(aimPt.x, aimPt.z);

  if (!e.visible) {
    if (dist > desired - 1.5) {
      api.moveTo(e.x, e.z);
    } else {
      let base = V.norm(V.add(away, V.scale(toCenter, 0.35)));
      if (t - M.jitterT < 0.5) base = V.rot(base, M.jitter);
      const d = pickDir(p, api, base);
      api.move(d.x, d.z);
    }
    return;
  }

  if (dist < desired - 1.0) {
    let base = V.norm(V.add(away, V.scale(toCenter, 0.3)));
    if (t - M.jitterT < 0.5) base = V.rot(base, M.jitter);
    const d = pickDir(p, api, base);
    api.move(d.x, d.z);
  } else if (dist > desired + 2.5) {
    const path = api.pathTo(e.x, e.z);
    if (path && path.points && path.points.length && !path.direct) {
      const wp = path.points[0];
      api.moveTo(wp.x, wp.z);
    } else {
      const toE = V.norm(V.sub(en, self));
      const d = pickDir(p, api, V.norm(V.add(toE, V.scale(toCenter, 0.15))));
      api.move(d.x, d.z);
    }
  } else {
    // hold the ring: strafe to keep the line open and stay unpredictable
    let side = V.perp(away);
    const a = { x: self.x + side.x * 4, z: self.z + side.z * 4 };
    const b = { x: self.x - side.x * 4, z: self.z - side.z * 4 };
    if (edgeRoom(b) > edgeRoom(a)) side = V.scale(side, -1);
    let base = V.norm(V.add(side, V.scale(away, 0.25)));
    if (t - M.jitterT < 0.5) base = V.rot(base, M.jitter);
    const d = pickDir(p, api, base);
    api.move(d.x, d.z);
  }
}
