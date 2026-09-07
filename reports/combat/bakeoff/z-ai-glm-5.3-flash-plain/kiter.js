function think(p, api) {
  const S = p.self, E = p.enemy;
  if (!E.alive) { api.stop(); return; }

  // persistent state
  if (state.t !== p.t) {
    state.last = state.t; state.t = p.t;
  }

  // event bookkeeping
  for (const ev of p.events) {
    if (ev.type === 'damaged') state.lastHit = p.t;
    if (ev.type === 'interruptedEnemy') state.interruptedAt = p.t;
  }

  const myPos = { x: S.x, z: S.z };
  const toE = V.toward(myPos, E);
  const dist = E.dist;
  const bolt = S.kit.k1, blink = S.kit.k2, beam = S.kit.k3;

  // track enemy casting for dodge/interrupt
  const ec = E.casting;
  if (ec && ec.telegraph) {
    const wu = E.kit[ec.skill] ? E.kit[ec.skill].windup : 0.4;
    if (wu > 0.2 && state.lastEnemyCast !== p.t + ec.skill) {
      state.enemyCastSkill = ec.skill;
      state.enemyCastAt = p.t;
    }
    state.lastEnemyCast = p.t + ec.skill;
  }

  // dodge incoming bolts
  for (const pr of p.arena.projectiles) {
    if (pr.mine || pr.arc) continue;
    const px = pr.x, pz = pr.z;
    const dx = px - myPos.x, dz = pz - myPos.z;
    const along = dx * pr.vx + dz * pr.vz;
    if (along <= 0) continue;
    const vv = pr.vx * pr.vx + pr.vz * pr.vz;
    const t = along / vv;
    const cx = px + pr.vx * t, cz = pz + pr.vz * t;
    const dd = Math.hypot(cx - myPos.x, cz - myPos.z);
    if (dd < 2.6) {
      // strafe perpendicular
      const pl = V.norm(V.perp({ x: pr.vx, z: pr.vz }));
      const side = (myPos.x * pl.z - myPos.z * pl.x) > 0 ? 1 : -1;
      api.move(pl.x * side, pl.z * side);
      state.dodging = p.t;
      break;
    }
  }

  // defensive blink: rooted & enemy beam winding, or taking heavy fire
  const rootedDanger = S.rooted && ec && ec.telegraph && E.kit[ec.skill];
  const lowHp = S.hp < S.maxHp * 0.35;
  if (api.ready('k2') && !S.busy && (rootedDanger || (lowHp && dist < 12))) {
    // blink away from enemy
    const away = V.away(E, myPos);
    const bx = V.clamp(myPos.x + away.x * 6.5, -19, 19);
    const bz = V.clamp(myPos.z + away.z * 6.5, -19, 19);
    api.use('k2', { x: bx, z: bz });
    api.say('gone.');
    return;
  }

  // offensive plan
  const beamWu = beam.windup;
  const eCasting = !!(ec && ec.telegraph && E.kit[ec.skill] && E.kit[ec.skill].windup > 0.2);
  const canFinishBeam = eCasting && (ec.remaining <= 0.01 ||
    (ec.total - ec.elapsed) - (ec.total - beamWu >= 0 ? beamWu : 0) >= 0);
  // interrupt: enemy winding up a long cast and beam ready
  if (api.ready('k3') && !S.busy && eCasting && dist < 26 && api.los(E.x, E.z)) {
    const timeLeftOnTheirCast = (E.kit[ec.skill].windup - ec.elapsed);
    const myTurn = Math.abs(V.angleTo(S.heading, toE)) / S.turnRate;
    if (myTurn + 0.667 <= timeLeftOnTheirCast + 0.25 || dist < 8) {
      api.use('k3', { x: E.x, z: E.z });
      api.say('quiet.');
      return;
    }
  }

  // bolt: root + chip
  if (api.ready('k1') && !S.busy && dist < 20 && api.los(E.x, E.z)) {
    const lead = V.lead(myPos, E, { x: E.vx, z: E.vz }, bolt.speed);
    api.use('k1', lead);
    state.shotAt = p.t;
  }

  // movement: kite at ~14m, keep los
  if (p.t - (state.dodging || -1) < 0.4) {
    // already strafing
  } else if (!E.visible) {
    // re-establish line of sight: move toward last known / enemy
    api.moveTo(E.x, E.z);
  } else if (dist < 9) {
    // too close — back off
    const away = V.away(E, myPos);
    const bx = V.clamp(myPos.x + away.x * 8, -19, 19);
    const bz = V.clamp(myPos.z + away.z * 8, -19, 19);
    api.moveTo(bx, bz);
  } else if (dist > 17) {
    api.moveTo(E.x, E.z);
  } else {
    // orbit: perpendicular strafe
    const pl = V.perp(toE);
    let dirx = pl.x, dirz = pl.z;
    if (state.orbitSign === undefined) state.orbitSign = api.rand() < 0.5 ? 1 : -1;
    if (api.rand() < 0.02) state.orbitSign = -state.orbitSign;
    dirx *= state.orbitSign; dirz *= state.orbitSign;
    const tx = V.clamp(myPos.x + dirx * 6, -19, 19);
    const tz = V.clamp(myPos.z + dirz * 6, -19, 19);
    if (api.pathTo(tx, tz) && api.pathTo(tx, tz).direct) api.moveTo(tx, tz);
    else api.moveTo(E.x, E.z);
  }

  // keep facing enemy for beams/bolts
  if (!S.busy) api.faceAt(E.x, E.z);

  // beam when close and rooted them or point blank
  if (api.ready('k3') && !S.busy && dist < 22 && api.los(E.x, E.z) && E.rooted) {
    api.use('k3', { x: E.x, z: E.z });
    api.say('burn for me.');
  }
}

const state = { t: 0, last: 0, dodging: -1, shotAt: -1, lastHit: -1, orbitSign: 1 };