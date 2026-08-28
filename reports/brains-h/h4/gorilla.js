const SMASH_WINDUP = 0.28;

let jukeSign = 1;
let lastSay = -99;
let lastSeen = null;

function leadPoint(e, t, f) {
  return { x: e.x + e.vx * t * f, z: e.z + e.vz * t * f };
}

function inArena(pt) {
  return Math.abs(pt.x) < 19 && Math.abs(pt.z) < 19;
}

function firstWaypoint(api, s, x, z) {
  const path = api.pathTo(x, z);
  if (path && path.points && path.points.length && !path.direct) {
    for (const pt of path.points) {
      const dx = pt.x - s.x, dz = pt.z - s.z;
      if (dx * dx + dz * dz > 0.5) return { x: pt.x, z: pt.z };
    }
  }
  return { x, z };
}

function findCover(p, api, e, budget) {
  let best = null;
  for (const o of p.arena.obstacles) {
    const away = V.norm({ x: o.x - e.x, z: o.z - e.z });
    if (away.x === 0 && away.z === 0) continue;
    const pad = Math.max(o.hx, o.hz) + 1.8;
    const pt = { x: o.x + away.x * pad, z: o.z + away.z * pad };
    if (!inArena(pt)) continue;
    const path = api.pathTo(pt.x, pt.z);
    if (!path) continue;
    if (path.dist <= budget && (!best || path.dist < best.dist)) best = { dist: path.dist, pt };
  }
  return best;
}

function think(p, api) {
  const s = p.self, e = p.enemy;
  if (!s || !s.alive) return;

  for (const ev of p.events) {
    if (ev.type === 'enemyStarted' && ev.skill === 'laser') jukeSign = api.rand() < 0.5 ? -1 : 1;
    if (ev.type === 'blocked') jukeSign = -jukeSign;
    if (ev.type === 'knockback') jukeSign = api.rand() < 0.5 ? -1 : 1;
  }

  if (!e || !e.alive) { api.stop(); return; }

  if (e.visible) lastSeen = { x: e.x, z: e.z };
  const hunt = e.visible ? { x: e.x, z: e.z } : (lastSeen || { x: e.x, z: e.z });

  const d = e.dist;
  const toE = V.norm({ x: e.x - s.x, z: e.z - s.z });
  const perpRaw = V.perp(toE);
  const perp = { x: perpRaw.x * jukeSign, z: perpRaw.z * jukeSign };

  const cast = e.casting;
  const enemyLasering = !!(cast && cast.skill === 'laser' && cast.telegraph);
  const castLeft = enemyLasering ? (cast.remaining || 0.2) : 0;

  // ---------- default facing ----------
  let faceT = { x: e.x + e.vx * 0.2, z: e.z + e.vz * 0.2 };

  if (s.casting) {
    const c = s.casting;
    const rem = typeof c.remaining === 'number' ? c.remaining : 0.15;
    if (c.skill === 'smash') {
      faceT = leadPoint(e, Math.max(0.02, rem), 0.9);
    } else if (c.skill === 'charge' && c.phase === 'windup') {
      faceT = leadPoint(e, rem + Math.max(0, d - 2.3) / 15, 0.85);
    }
  }

  // ---------- skills ----------
  const canAct = !s.busy && !s.stunned && !s.airborne;
  let charging = false;

  if (canAct) {
    const pred = leadPoint(e, SMASH_WINDUP, 0.9);
    const dPred = Math.hypot(pred.x - s.x, pred.z - s.z);
    const pdir = V.norm({ x: pred.x - s.x, z: pred.z - s.z });
    const pang = Math.abs(V.angleTo(s.heading, pdir));

    const smashReady = api.ready('smash');
    const chargeReady = api.ready('charge');
    const hittable = !e.airborne && !e.invulnerable;

    if (smashReady && hittable && dPred < 3.85 && pang < 1.25) {
      api.use('smash');
      faceT = pred;
    } else if (chargeReady && e.visible && !e.invulnerable && d > 2.1 && d < 12.5) {
      const T = 0.28 + Math.max(0, d - 2.4) / 15;
      const cp = leadPoint(e, T, 0.85);
      const cdir = V.norm({ x: cp.x - s.x, z: cp.z - s.z });
      const cang = Math.abs(V.angleTo(s.heading, cdir));
      const ray = api.ray(cdir.x, cdir.z, Math.min(d + 2, 14));
      const blockedPath = ray && ray.hit && ray.dist < d - 1.9;
      if (!blockedPath && cang < 0.6) {
        api.use('charge');
        faceT = { x: s.x + cdir.x * 10, z: s.z + cdir.z * 10 };
        charging = true;
      } else {
        faceT = cp;
      }
    } else if (chargeReady && !smashReady && e.visible && !e.invulnerable && d <= 2.1 && d > 1.2) {
      api.use('charge');
      charging = true;
    }
  }

  // ---------- movement ----------
  if (!s.airborne) {
    let dir = null;
    let mv = null;

    if (charging || (s.casting && s.casting.skill === 'charge')) {
      dir = toE;
    } else if (enemyLasering && d > 4.2 && !s.stunned) {
      // cannot punish the cast right now: break line, or juke wide while closing
      let cover = null;
      if (d > 6 && castLeft > 0.3) cover = findCover(p, api, e, (castLeft - 0.1) * 5.0);
      if (cover) {
        mv = cover.pt;
      } else {
        const inward = castLeft > 0.28 ? 0.6 : 0.15;
        dir = V.norm({ x: perp.x + toE.x * inward, z: perp.z + toE.z * inward });
      }
    } else if (d < 3.2) {
      const tang = api.ready('smash') ? 0.15 : 0.5;
      dir = V.norm({ x: toE.x + perp.x * tang, z: toE.z + perp.z * tang });
    } else {
      const wp = (e.visible && d < 9) ? { x: hunt.x, z: hunt.z } : firstWaypoint(api, s, hunt.x, hunt.z);
      dir = V.norm({ x: wp.x - s.x, z: wp.z - s.z });
    }

    if (mv) api.moveTo(mv.x, mv.z);
    else if (dir) api.move(dir.x, dir.z);
  }

  api.faceAt(faceT.x, faceT.z);

  if (p.t - lastSay > 6) {
    lastSay = p.t;
    api.say(d > 8 ? "closing." : "eight arms, one fist.");
  }
}
