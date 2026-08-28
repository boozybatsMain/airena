// ============ Gorilla mind ============
// Doctrine: the beam cannot be out-strafed, so time in the open is the only
// currency that matters. Track the octopus' laser clock, advance behind the
// blocks, and spend charge to buy melee. In melee the trade math is ours:
// 35 of 155 beats 27 of 205.

let laserReadyAt = 0;
let blinkReadyAt = 0;
let enemyJumpReadyAt = 0;
let lastSay = -99;
let stuckTicks = 0;
let lastPos = null;
let jukeSign = 1;
let jukeUntil = 0;

const ARENA_LIM = 19.3;

function clampA(v) {
  return v < -ARENA_LIM ? -ARENA_LIM : (v > ARENA_LIM ? ARENA_LIM : v);
}

function pred(b, t) {
  return {
    x: clampA(b.x + (b.vx || 0) * t),
    z: clampA(b.z + (b.vz || 0) * t)
  };
}

function d2d(ax, az, bx, bz) {
  const dx = ax - bx, dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

// segment vs axis aligned box, slab clipping
function segBox(ax, az, bx, bz, o, pad) {
  const minx = o.x - o.hx - pad, maxx = o.x + o.hx + pad;
  const minz = o.z - o.hz - pad, maxz = o.z + o.hz + pad;
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dz = bz - az;
  if (Math.abs(dx) < 1e-9) {
    if (ax < minx || ax > maxx) return false;
  } else {
    let ta = (minx - ax) / dx, tb = (maxx - ax) / dx;
    if (ta > tb) { const t = ta; ta = tb; tb = t; }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return false;
  }
  if (Math.abs(dz) < 1e-9) {
    if (az < minz || az > maxz) return false;
  } else {
    let ta = (minz - az) / dz, tb = (maxz - az) / dz;
    if (ta > tb) { const t = ta; ta = tb; tb = t; }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return false;
  }
  return true;
}

function laneBlocked(ax, az, bx, bz, obs, pad) {
  for (let i = 0; i < obs.length; i++) {
    if (segBox(ax, az, bx, bz, obs[i], pad)) return true;
  }
  return false;
}

const OFFS = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1]
];

// points that hide us from the enemy, scored on how far they carry us forward
function findCover(s, e, obs) {
  let best = null, bestScore = 1e9;
  const myD = d2d(s.x, s.z, e.x, e.z);
  for (let i = 0; i < obs.length; i++) {
    const o = obs[i];
    for (let k = 0; k < OFFS.length; k++) {
      const px = o.x + OFFS[k][0] * (o.hx + 2.1);
      const pz = o.z + OFFS[k][1] * (o.hz + 2.1);
      if (Math.abs(px) > ARENA_LIM || Math.abs(pz) > ARENA_LIM) continue;
      // must genuinely eat the beam: shrink the box for the test
      if (!laneBlocked(px, pz, e.x, e.z, obs, -0.35)) continue;
      const d = d2d(px, pz, s.x, s.z);
      const de = d2d(px, pz, e.x, e.z);
      if (d > 9) continue;
      const score = d * 1.0 + de * 1.15;
      if (score < bestScore) {
        bestScore = score;
        best = { x: px, z: pz, d: d, de: de, gain: myD - de };
      }
    }
  }
  return best;
}

function think(p, api) {
  const s = p.self, e = p.enemy;
  if (!s || !s.alive || !e || !e.alive) return;
  const obs = p.arena.obstacles || [];
  const t = p.t;

  // ---- read the announcements, keep their clocks ----
  for (let i = 0; i < p.events.length; i++) {
    const ev = p.events[i];
    if (ev.type === 'enemyStarted') {
      if (ev.skill === 'laser') laserReadyAt = t + 2.2;
      else if (ev.skill === 'blink') blinkReadyAt = t + 3.933;
      else if (ev.skill === 'jump') enemyJumpReadyAt = t + 2.8;
    }
  }
  const ec = e.casting;
  const castingLaser = !!(ec && ec.skill === 'laser' && ec.telegraph !== false && ec.phase !== 'recover');
  if (castingLaser) laserReadyAt = t - (ec.elapsed || 0) + 2.2;
  const laserThreat = castingLaser || t >= laserReadyAt - 0.25;
  const laserWindow = laserReadyAt - t; // > 0 means they cannot fire yet

  // ---- stuck watch ----
  if (lastPos) {
    const moved = d2d(s.x, s.z, lastPos.x, lastPos.z);
    if (moved < 0.035 && !s.busy && !s.stunned) stuckTicks++;
    else stuckTicks = Math.max(0, stuckTicks - 1);
  }
  lastPos = { x: s.x, z: s.z };

  const dist = e.dist;
  const lead = pred(e, 0.28);
  const dirLead = V.norm({ x: lead.x - s.x, z: lead.z - s.z });
  const dirNow = V.norm({ x: e.x - s.x, z: e.z - s.z });

  let faceCmd = dirLead.x === 0 && dirLead.z === 0 ? dirNow : dirLead;
  let moveCmd = null;      // {mode:'dir'|'to', x, z}
  let skill = null, sa = 0, sb = 0;

  const busy = s.busy;
  const casting = s.casting;

  // ---- while our own charge winds up, facing IS the commitment ----
  if (casting && casting.skill === 'charge' && casting.phase === 'windup') {
    const flight = 0.3 + Math.max(0, dist - 2.2) / 15;
    const cp = pred(e, Math.min(0.85, flight));
    faceCmd = V.norm({ x: cp.x - s.x, z: cp.z - s.z });
    api.face(faceCmd.x, faceCmd.z);
    api.move(faceCmd.x, faceCmd.z);
    return;
  }

  // ---- smash geometry ----
  const myFut = { x: s.x + (s.vx || 0) * 0.14, z: s.z + (s.vz || 0) * 0.14 };
  const sp = pred(e, 0.3);
  const dSmash = d2d(myFut.x, myFut.z, sp.x, sp.z);
  const dirSmash = V.norm({ x: sp.x - myFut.x, z: sp.z - myFut.z });
  const angErr = Math.abs(V.angleTo(s.heading, dirSmash));
  const turnable = 0.55 * s.turnRate * 0.3;          // ~0.66 rad of windup turn
  const residual = Math.max(0, angErr - turnable);
  const halfCone = 0.9599 + Math.asin(Math.min(0.95, (e.radius || 1) / Math.max(1.2, dSmash)));

  let smashOk = dSmash <= 4.75 && residual < halfCone * 0.7 && !e.invulnerable;
  if (e.airborne) {
    // a ground sweep passes under a hop: only swing to catch the landing
    smashOk = smashOk && !!(ec && ec.remaining !== undefined && ec.remaining <= 0.34);
  }
  const smashClear = dSmash < 3.0 || !laneBlocked(s.x, s.z, e.x, e.z, obs, 0.05);

  // ---- charge geometry ----
  let chargeOk = false;
  if (api.ready('charge') && !busy && !s.airborne && !s.stunned && !e.invulnerable) {
    const wantGap = dist > 4.6 && dist < 12.2;
    const punish = castingLaser && dist < 12.2 && dist > 2.6;
    const chaseAir = e.airborne && dist < 11.5 && dist > 2.6;
    if ((wantGap || punish || chaseAir) && e.visible) {
      const flight = 0.3 + Math.max(0, dist - 2.2) / 15;
      const cp = pred(e, Math.min(0.85, flight));
      const cd = V.norm({ x: cp.x - s.x, z: cp.z - s.z });
      if (cd.x !== 0 || cd.z !== 0) {
        const r = api.ray(cd.x, cd.z, Math.min(14, dist + 1.5));
        const clear = !r.hit || r.dist >= dist - (e.radius || 1) - 0.35;
        if (clear && !laneBlocked(s.x, s.z, cp.x, cp.z, obs, 0.15)) {
          chargeOk = true;
          sa = cd.x; sb = cd.z;
        }
      }
    }
  }

  // ---- pick the strike ----
  if (!busy && !s.stunned && !s.airborne) {
    if (api.ready('smash') && smashOk && smashClear) {
      skill = 'smash';
      faceCmd = dirSmash;
    } else if (chargeOk) {
      skill = 'charge';
      const cp = pred(e, Math.min(0.85, 0.3 + Math.max(0, dist - 2.2) / 15));
      faceCmd = V.norm({ x: cp.x - s.x, z: cp.z - s.z });
    }
  }

  // ---- movement ----
  const meleeBand = 2.55;
  if (dist <= 4.4) {
    // stay glued: we are the heavier body, we win the shove
    if (dist < meleeBand) {
      const side = V.perp(dirNow);
      const mix = V.norm({
        x: dirNow.x * 0.55 + side.x * 0.5 * jukeSign,
        z: dirNow.z * 0.55 + side.z * 0.5 * jukeSign
      });
      moveCmd = { mode: 'dir', x: mix.x, z: mix.z };
    } else {
      moveCmd = { mode: 'dir', x: dirLead.x, z: dirLead.z };
    }
    if (t > jukeUntil) { jukeSign = api.rand() < 0.5 ? -1 : 1; jukeUntil = t + 0.9; }
  } else {
    let took = false;
    if (e.visible && dist > 5.0 && laserThreat) {
      const cover = findCover(s, e, obs);
      if (cover) {
        const emergency = castingLaser && cover.d <= 3.4;
        const advance = cover.gain > 1.4 && cover.d <= 7.5;
        if (emergency || advance) {
          moveCmd = { mode: 'to', x: cover.x, z: cover.z };
          took = true;
        }
      }
    }
    if (!took) {
      // free window (their laser is cooling) or nothing better: run them down
      const direct = !laneBlocked(s.x, s.z, lead.x, lead.z, obs, 1.35);
      if (direct && dist < 26) {
        moveCmd = { mode: 'dir', x: dirLead.x, z: dirLead.z };
      } else {
        moveCmd = { mode: 'to', x: e.x, z: e.z };
      }
    }
  }

  // shake off a wall or a corner
  if (stuckTicks > 6) {
    const side = V.perp(dirNow);
    moveCmd = { mode: 'dir', x: dirNow.x * 0.4 + side.x * jukeSign, z: dirNow.z * 0.4 + side.z * jukeSign };
    if (stuckTicks > 14) { jukeSign = -jukeSign; stuckTicks = 0; }
  }

  // ---- emit exactly one of each ----
  if (faceCmd && (faceCmd.x !== 0 || faceCmd.z !== 0)) api.face(faceCmd.x, faceCmd.z);
  if (moveCmd) {
    if (moveCmd.mode === 'to') api.moveTo(moveCmd.x, moveCmd.z);
    else api.move(moveCmd.x, moveCmd.z);
  }
  if (skill === 'smash') api.use('smash');
  else if (skill === 'charge') api.use('charge', sa, sb);

  if (t - lastSay > 6.5) {
    lastSay = t;
    if (dist < 4.5) api.say('close enough.');
    else if (laserWindow > 0.6) api.say('your beam is cold. mine is not.');
    else api.say('walls first, then you.');
  }
}
