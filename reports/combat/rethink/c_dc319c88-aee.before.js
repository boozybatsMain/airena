// Осьминог: скользкий стрелок. Держит дистанцию, ломает линию огня, наказывает замахи.

function segAABB(ax, az, bx, bz, minx, minz, maxx, maxz) {
  const dx = bx - ax, dz = bz - az;
  let t0 = 0, t1 = 1;
  if (Math.abs(dx) < 1e-9) {
    if (ax < minx || ax > maxx) return false;
  } else {
    let ta = (minx - ax) / dx, tb = (maxx - ax) / dx;
    if (ta > tb) { const tt = ta; ta = tb; tb = tt; }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return false;
  }
  if (Math.abs(dz) < 1e-9) {
    if (az < minz || az > maxz) return false;
  } else {
    let ta = (minz - az) / dz, tb = (maxz - az) / dz;
    if (ta > tb) { const tt = ta; ta = tb; tb = tt; }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return false;
  }
  return true;
}

function losBetween(a, b, obs) {
  for (const o of obs) {
    if (segAABB(a.x, a.z, b.x, b.z, o.x - o.hx, o.z - o.hz, o.x + o.hx, o.z + o.hz)) return false;
  }
  return true;
}

function clampArena(pt) {
  return { x: Math.max(-18.6, Math.min(18.6, pt.x)), z: Math.max(-18.6, Math.min(18.6, pt.z)) };
}

function k1Aim(S, E, windLeft) {
  let t = windLeft + E.dist / 22;
  let ax = E.x + E.vx * t, az = E.z + E.vz * t;
  const d2 = Math.hypot(ax - S.x, az - S.z);
  t = windLeft + d2 / 22;
  ax = E.x + E.vx * t; az = E.z + E.vz * t;
  const c = clampArena({ x: ax, z: az });
  return { x: c.x, z: c.z, d: Math.hypot(c.x - S.x, c.z - S.z) };
}

function bestCover(p, api, E) {
  let best = null;
  for (const o of p.arena.obstacles) {
    const away = V.norm({ x: o.x - E.x, z: o.z - E.z });
    if (away.x === 0 && away.z === 0) continue;
    const ext = Math.max(o.hx, o.hz) + 1.6;
    const pt = clampArena({ x: o.x + away.x * ext, z: o.z + away.z * ext });
    if (losBetween(E, pt, p.arena.obstacles)) continue;
    const path = api.pathTo(pt.x, pt.z);
    if (!path) continue;
    const score = path.dist - V.dist(pt, E) * 0.25;
    if (!best || score < best.score) best = { pt, dist: path.dist, score };
  }
  return best;
}

let orbitSign = 1;
let nextFlip = 0;
let k1ReadyAt = 0;
let k2ReadyAt = 0;
let prevCd1 = 0;
let prevCd2 = 0;
let lastSay = -10;

function say(p, api, txt) {
  if (p.t - lastSay > 4) { api.say(txt); lastSay = p.t; }
}

function think(p, api) {
  const S = p.self, E = p.enemy;
  const obs = p.arena.obstacles;

  // events
  for (const ev of p.events) {
    if (ev.type === 'blocked') { orbitSign = -orbitSign; nextFlip = p.t + 1.5; }
    if (ev.type === 'dealt') say(p, api, 'Присоска в лоб!');
    if (ev.type === 'enemyStarted' && ev.skill === 'k1') {
      orbitSign = api.rand() < 0.5 ? -1 : 1;
    }
  }

  // cooldown-ready timestamps
  const cd1 = api.cooldown('k1'), cd2 = api.cooldown('k2');
  if (cd1 === 0 && prevCd1 > 0) k1ReadyAt = p.t;
  if (cd2 === 0 && prevCd2 > 0) k2ReadyAt = p.t;
  prevCd1 = cd1; prevCd2 = cd2;

  const myFrac = S.hp / S.maxHp, eFrac = E.hp / E.maxHp;
  const ahead = myFrac > eFrac + 0.03;
  const desperate = p.t > 44 && !ahead;

  const eCast = E.casting && E.casting.telegraph ? E.casting : null;
  const beamThreat = !!(eCast && eCast.skill === 'k2' && E.visible && E.dist < 26);
  const boltWindup = !!(eCast && eCast.skill === 'k1');

  // ---- incoming bolt dodge ----
  let dodge = null;
  for (const pr of p.arena.projectiles) {
    if (pr.mine) continue;
    const vv = pr.vx * pr.vx + pr.vz * pr.vz;
    if (vv < 1) continue;
    const rx = S.x - pr.x, rz = S.z - pr.z;
    const tca = (rx * pr.vx + rz * pr.vz) / vv;
    if (tca < 0 || tca > 1.3) continue;
    const cx = S.x - (pr.x + pr.vx * tca), cz = S.z - (pr.z + pr.vz * tca);
    const miss = Math.hypot(cx, cz);
    if (miss < S.radius + 1.2) {
      let d;
      if (miss > 0.05) d = { x: cx / miss, z: cz / miss };
      else {
        const pv = V.norm({ x: -pr.vz, z: pr.vx });
        const toC = V.norm({ x: -S.x, z: -S.z });
        d = (pv.x * toC.x + pv.z * toC.z) >= 0 ? pv : { x: -pv.x, z: -pv.z };
      }
      dodge = d;
      break;
    }
  }

  // ---- movement ----
  let fleeing = false;
  const toE = V.toward(S, E);
  const perp = V.scale(V.perp(toE), orbitSign);

  if (p.t > nextFlip) {
    orbitSign = api.rand() < 0.5 ? -1 : 1;
    nextFlip = p.t + 1.5 + api.rand() * 2;
  }

  const hideMode = ahead && p.t > 26 && !desperate;

  if (beamThreat) {
    fleeing = true;
    const cov = bestCover(p, api, E);
    const reach = (eCast.remaining + 0.2) * Math.max(S.maxSpeed, 4.3);
    if (cov && cov.dist < reach + 2) {
      api.moveTo(cov.pt.x, cov.pt.z);
      say(p, api, 'Чернильная завеса!');
    } else {
      const d = V.add(perp, V.scale(toE, -0.6));
      api.move(d.x, d.z);
    }
  } else if (dodge) {
    const d = V.add(dodge, V.scale(perp, 0.5));
    api.move(d.x, d.z);
  } else if (desperate) {
    api.moveTo(E.x, E.z);
  } else if (hideMode) {
    const cov = bestCover(p, api, E);
    if (E.visible && cov) {
      api.moveTo(cov.pt.x, cov.pt.z);
      say(p, api, 'Скользкого не поймать...');
    } else if (!E.visible && E.dist > 7) {
      api.stop();
    } else if (cov) {
      api.moveTo(cov.pt.x, cov.pt.z);
    } else {
      const d = V.scale(toE, -1);
      api.move(d.x, d.z);
    }
  } else {
    const dr = boltWindup ? 13 : 11;
    let radial = (E.dist - dr) * 0.35;
    radial = Math.max(-1, Math.min(1, radial));
    let dir = V.add(perp, V.scale(toE, radial));
    if (E.dist < 5.5) dir = V.add(dir, V.scale(toE, -1.2));
    const dn = V.norm(dir);
    const probe = api.ray(dn.x, dn.z, 2.3);
    if (probe.hit) {
      orbitSign = -orbitSign;
      nextFlip = p.t + 1.5;
      dir = V.add(V.scale(V.perp(toE), orbitSign), V.scale(toE, radial));
    }
    api.move(dir.x, dir.z);
  }

  // ---- our casting: track aim, no new orders ----
  if (S.casting && S.casting.telegraph) {
    if (S.casting.skill === 'k1') {
      const aim = k1Aim(S, E, S.casting.remaining);
      api.faceAt(aim.x, aim.z);
    } else if (S.casting.skill === 'k2') {
      const t = Math.min(S.casting.remaining, 0.7);
      api.faceAt(E.x + E.vx * t, E.z + E.vz * t);
    } else {
      api.faceAt(E.x, E.z);
    }
    return;
  }

  // ---- attacks ----
  let attack = null;
  let aimPt = null;
  const eBusyLong = !!(eCast && eCast.remaining > 0.4);
  const eK2Winding = !!(eCast && eCast.skill === 'k2');

  if (!S.busy && !beamThreat) {
    const k2ok = api.ready('k2') && E.visible && E.dist < 21;
    const k2trigger = eBusyLong || E.stunned || E.dist < 11 || (p.t - k2ReadyAt > 3.5 && E.dist < 18);
    const k2allowed = hideMode ? (eBusyLong || E.stunned) : true;
    if (k2ok && k2trigger && k2allowed && !eK2Winding) {
      attack = 'k2';
    } else if (api.ready('k1') && E.visible) {
      const aim = k1Aim(S, E, 0.367);
      const closing = (E.vx * (S.x - E.x) + E.vz * (S.z - E.z)) > 0.4 * Math.max(E.speed, 0.1);
      const limit = hideMode ? 15 : 17;
      if (aim.d < limit && api.los(aim.x, aim.z) &&
          (E.busy || E.stunned || E.dist < 10 || closing || E.speed < 1.5 || p.t - k1ReadyAt > 2.5 || desperate)) {
        attack = 'k1';
        aimPt = aim;
      }
    }
  }

  if (!attack && api.ready('k3') && !S.busy && !beamThreat && !boltWindup) {
    if (E.dist < 9 || fleeing || p.t > 29 || (hideMode && E.visible)) {
      attack = 'k3';
    }
  }

  if (attack === 'k1' && aimPt) {
    api.faceAt(aimPt.x, aimPt.z);
    api.use('k1');
  } else if (attack === 'k2') {
    api.faceAt(E.x + E.vx * 0.65, E.z + E.vz * 0.65);
    api.use('k2');
    say(p, api, 'Восемь щупалец — один луч!');
  } else if (attack === 'k3') {
    api.use('k3');
    api.faceAt(E.x + E.vx * 0.2, E.z + E.vz * 0.2);
  } else {
    api.faceAt(E.x + E.vx * 0.2, E.z + E.vz * 0.2);
  }

  if (p.t < 1) say(p, api, 'Гррль... обезьяна против глубин? Смешно.');
}