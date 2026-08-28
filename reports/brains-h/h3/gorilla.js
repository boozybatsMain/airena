const BOXES = [
  { x: -7, z: -3, hx: 1.2, hz: 3.5 },
  { x: 7, z: 3, hx: 1.2, hz: 3.5 },
  { x: 0, z: -10, hx: 3.6, hz: 1.2 },
  { x: 0, z: 10, hx: 3.6, hz: 1.2 },
  { x: -12.5, z: 11, hx: 1.6, hz: 1.6 },
  { x: 12.5, z: -11, hx: 1.6, hz: 1.6 }
];

const DIRS = (() => {
  const a = [];
  for (let i = 0; i < 20; i++) {
    const th = (i * Math.PI * 2) / 20;
    a.push({ x: Math.sin(th), z: Math.cos(th) });
  }
  return a;
})();

let lastLaserStart = -99;
let lastBlinkStart = -99;
let lastJumpStart = -99;
let jukeSign = 1;
let jukeUntil = 0;
let stuckSince = -1;
let lastSay = -99;
let chargeOrderedAt = -99;

function segBox(ax, az, bx, bz, b, m) {
  const minx = b.x - b.hx - m, maxx = b.x + b.hx + m;
  const minz = b.z - b.hz - m, maxz = b.z + b.hz + m;
  const dx = bx - ax, dz = bz - az;
  let t0 = 0, t1 = 1;
  const P = [-dx, dx, -dz, dz];
  const Q = [ax - minx, maxx - ax, az - minz, maxz - az];
  for (let i = 0; i < 4; i++) {
    const p = P[i], q = Q[i];
    if (p === 0) {
      if (q < 0) return false;
    } else {
      const r = q / p;
      if (p < 0) {
        if (r > t1) return false;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return false;
        if (r < t1) t1 = r;
      }
    }
  }
  return true;
}

function segBlocked(ax, az, bx, bz, m) {
  for (const b of BOXES) if (segBox(ax, az, bx, bz, b, m)) return true;
  return false;
}

function inBox(x, z, m) {
  for (const b of BOXES) {
    if (Math.abs(x - b.x) < b.hx + m && Math.abs(z - b.z) < b.hz + m) return true;
  }
  return false;
}

function think(p, api) {
  const S = p.self, E = p.enemy;
  if (!S || !E || !S.alive || !E.alive) return;
  const t = p.t;

  for (const ev of p.events) {
    if (ev.type === 'enemyStarted') {
      if (ev.skill === 'laser') lastLaserStart = t;
      else if (ev.skill === 'blink') lastBlinkStart = t;
      else if (ev.skill === 'jump') lastJumpStart = t;
    } else if (ev.type === 'damaged' && ev.skill === 'laser') {
      if (t - lastLaserStart > 2.0) lastLaserStart = t - 0.65;
    }
  }

  const dist = E.dist;
  const eCast = E.casting;
  const eLasering = !!(eCast && eCast.skill === 'laser' && eCast.telegraph);
  const laserReadyIn = Math.max(0, 2.2 - (t - lastLaserStart));

  const predE = (dt) => ({ x: E.x + E.vx * dt, z: E.z + E.vz * dt });

  // ---- committed / locked states ----
  const c = S.casting;
  if (c && c.skill === 'charge') {
    if (c.phase === 'windup') {
      let time = (c.remaining != null ? c.remaining : 0.14);
      for (let i = 0; i < 3; i++) {
        const q = predE(time);
        const d = Math.hypot(q.x - S.x, q.z - S.z);
        time = (c.remaining != null ? c.remaining : 0.14) + Math.max(0, (d - (S.radius + E.radius)) / 15);
      }
      const q = predE(Math.min(time, 1.1));
      api.faceAt(q.x, q.z);
      const d = V.toward(S, q);
      api.move(d.x, d.z);
      return;
    }
    if (c.phase === 'dash') {
      return;
    }
  }
  if (S.airborne) {
    api.faceAt(E.x, E.z);
    return;
  }

  const canAct = !S.busy && !S.stunned && !S.airborne;

  // ---- facing ----
  const faceP = predE(0.12);
  if (E.visible || dist < 9) api.faceAt(faceP.x, faceP.z);

  // ---- attacks ----
  let acted = false;
  if (canAct) {
    // SMASH
    const sp = predE(0.28);
    const myFwd = { x: S.x + S.vx * 0.14, z: S.z + S.vz * 0.14 };
    const sd = Math.hypot(sp.x - myFwd.x, sp.z - myFwd.z);
    const angErr = Math.abs(V.angleTo(S.heading, V.toward(S, sp)));
    if (api.ready('smash') && !E.airborne && !E.invulnerable && sd <= 4.3 && angErr < 1.15) {
      api.use('smash');
      acted = true;
    }

    // CHARGE
    if (!acted && api.ready('charge') && E.visible && !E.airborne) {
      const wantClose = dist > 3.6 && dist < 12.0;
      const punish = (eLasering || E.stunned) && dist > 2.2 && dist < 12.0;
      if (wantClose || punish) {
        let time = 0.28;
        for (let i = 0; i < 3; i++) {
          const q = predE(time);
          const d = Math.hypot(q.x - S.x, q.z - S.z);
          time = 0.28 + Math.max(0, (d - (S.radius + E.radius)) / 15);
        }
        const q = predE(Math.min(time, 1.1));
        const dirq = V.toward(S, q);
        const err = Math.abs(V.angleTo(S.heading, dirq));
        const clear = !segBlocked(S.x, S.z, E.x, E.z, 0.35);
        if (err < 0.9 && clear) {
          api.faceAt(q.x, q.z);
          api.use('charge');
          chargeOrderedAt = t;
          acted = true;
        } else {
          api.faceAt(q.x, q.z);
        }
      }
    }
  }

  // ---- movement ----
  const cur = S.speed > 0.4 ? V.norm({ x: S.vx, z: S.vz }) : V.fromHeading(S.heading);

  // stuck detection
  if (S.speed < 0.5 && dist > 3.0) {
    if (stuckSince < 0) stuckSince = t;
  } else stuckSince = -1;
  const stuck = stuckSince > 0 && t - stuckSince > 0.55;

  if (t > jukeUntil) {
    jukeUntil = t + 0.55 + api.rand() * 0.5;
    jukeSign = api.rand() < 0.5 ? -1 : 1;
  }

  const threat = eLasering || (laserReadyIn <= 0.35 && dist > 7);
  const coverW = eLasering ? 30 : (dist > 9 ? 9 : 0);
  const closeW = eLasering ? 3.0 : (laserReadyIn > 0.7 ? 7.0 : 5.0);

  if (dist < 3.3) {
    // melee: stay glued, shove them
    const q = predE(0.15);
    let d = V.toward(S, q);
    const perp = V.perp(d);
    // drift so we don't get pinned in a corner ourselves
    let wx = 0, wz = 0;
    if (S.x > 16) wx = -1; else if (S.x < -16) wx = 1;
    if (S.z > 16) wz = -1; else if (S.z < -16) wz = 1;
    let mv = { x: d.x + perp.x * 0.25 * jukeSign + wx * 0.5, z: d.z + perp.z * 0.25 * jukeSign + wz * 0.5 };
    api.move(mv.x, mv.z);
  } else if (!E.visible && !stuck) {
    const path = api.pathTo(E.x, E.z);
    if (path && path.points && path.points.length) {
      const wp = path.points[0];
      api.moveTo(E.x, E.z);
      if (!E.visible) api.faceAt(wp.x, wp.z);
    } else {
      api.moveTo(E.x, E.z);
    }
  } else {
    const step = 3.0;
    let best = null, bestScore = -1e18;
    for (const d of DIRS) {
      const nx = S.x + d.x * step, nz = S.z + d.z * step;
      if (Math.abs(nx) > 19.3 || Math.abs(nz) > 19.3) continue;
      if (inBox(nx, nz, S.radius + 0.25)) continue;
      if (segBlocked(S.x, S.z, nx, nz, S.radius + 0.15)) continue;
      let s = 0;
      const nd = Math.hypot(E.x - nx, E.z - nz);
      s += (dist - nd) * closeW;
      if (coverW > 0 && segBlocked(E.x, E.z, nx, nz, 0.15)) s += coverW;
      s -= Math.max(0, Math.abs(nx) - 15.5) * 3;
      s -= Math.max(0, Math.abs(nz) - 15.5) * 3;
      s += V.dot(d, cur) * 1.6;
      if (nd < 2.2) s -= 4;
      if (threat) {
        const perp = V.perp(V.toward(S, E));
        s += Math.abs(V.dot(d, perp)) * 2.0;
        s += V.dot(d, perp) * jukeSign * 1.2;
      }
      if (stuck) s += api.rand() * 8;
      if (s > bestScore) { bestScore = s; best = d; }
    }
    if (best) api.move(best.x, best.z);
    else api.moveTo(E.x, E.z);
  }

  if (t - lastSay > 6.5) {
    lastSay = t;
    if (dist < 4) api.say("come here, calamari");
    else if (eLasering) api.say("beam telegraphed. closing.");
    else api.say("205 hp of bad news");
  }
}
