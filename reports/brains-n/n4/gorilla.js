function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive) return;

  const dist = en.dist;
  const toEn = { x: en.x - me.x, z: en.z - me.z };
  const enDir = V.norm(toEn);

  // ---- event bookkeeping ----
  let enemyLaserStarted = false, gotHit = false;
  for (const e of p.events) {
    if (e.type === 'enemyStarted' && e.skill === 'laser') enemyLaserStarted = true;
    if (e.type === 'damaged') gotHit = true;
    if (e.type === 'blocked') api.remember('blockedAt', p.t);
  }
  if (gotHit) api.remember('lastHit', p.t);

  // ---- if busy in an uncancellable state, just steer facing ----
  const casting = me.casting;

  // ================= FACING =================
  // Almost always face the enemy (or lead point).
  const aimPt = { x: en.x + en.vx * 0.25, z: en.z + en.vz * 0.25 };

  // ================= COMBAT DECISIONS =================
  const surfaceDist = dist - me.radius - en.radius;

  // SMASH: in range and not airborne enemy
  const smashMaxCenter = me.radius + 2.9 + en.radius; // 5.15
  const canSmash = api.ready('smash');
  const canCharge = api.ready('charge');
  const canJump = api.ready('jump');

  // Angle to enemy relative to facing
  const angErr = Math.abs(V.angleTo(me.heading, enDir));

  // predicted distance at smash land (0.3s)
  const relx = (en.vx - me.vx), relz = (en.vz - me.vz);
  const futDist = Math.hypot(toEn.x + relx * 0.3, toEn.z + relz * 0.3);

  // ---- Dodging the laser ----
  // Laser cast is 0.667s. If enemy is casting laser, break line of sight or strafe hard.
  let dodging = false;
  let moveOrder = null;

  if (en.casting && en.casting.skill === 'laser' && en.casting.telegraph) {
    dodging = true;
  }

  // ================= ACTIONS =================
  let acted = false;

  if (!me.busy && !me.stunned && !me.airborne) {
    // SMASH when it will land in range
    if (canSmash && !en.airborne && futDist <= smashMaxCenter - 0.15 && angErr < 1.2) {
      api.use('smash');
      acted = true;
    }
    // CHARGE: good gap closer. Use when enemy is at mid range, visible, and lined up.
    else if (canCharge && en.visible && dist > 4.0 && dist < 13.5) {
      // check the dash path is roughly clear
      const r = api.ray(enDir.x, enDir.z, Math.min(12.5, dist + 0.5));
      const clear = !r.hit || r.dist >= Math.min(dist - 0.6, 12);
      if (clear && angErr < 0.9) {
        api.use('charge');
        acted = true;
      }
    }
  }

  // ================= MOVEMENT =================
  if (!acted) {
    if (dodging && en.visible) {
      // try to get behind cover, else strafe perpendicular fast
      const perp = V.perp(enDir);
      // pick side that's more open / away from wall
      const cand1 = { x: me.x + perp.x * 4, z: me.z + perp.z * 4 };
      const cand2 = { x: me.x - perp.x * 4, z: me.z - perp.z * 4 };
      const score = (c) => {
        let s = 0;
        if (Math.abs(c.x) > 18.5 || Math.abs(c.z) > 18.5) s -= 10;
        if (!api.los(c.x, c.z)) s -= 3;
        s += 20 - Math.max(Math.abs(c.x), Math.abs(c.z));
        return s;
      };
      const pick = score(cand1) >= score(cand2) ? cand1 : cand2;
      // blend strafe with closing in
      const dirv = V.norm({ x: (pick.x - me.x) + enDir.x * dist * 0.35, z: (pick.z - me.z) + enDir.z * dist * 0.35 });
      moveOrder = () => api.move(dirv.x, dirv.z);
    } else if (dist > smashMaxCenter - 0.6) {
      // close in
      if (en.visible && dist < 9) {
        // direct approach with slight weave to dodge beams
        const weave = Math.sin(p.t * 3.3) * 0.55;
        const d = V.rot(enDir, weave);
        moveOrder = () => api.move(d.x, d.z);
      } else {
        moveOrder = () => api.moveTo(en.x, en.z);
      }
    } else {
      // in smash range: stay glued, orbit slightly
      const orbit = V.perp(enDir);
      const side = (Math.floor(p.t * 0.7) % 2 === 0) ? 1 : -1;
      const d = V.norm({ x: enDir.x * 0.85 + orbit.x * side * 0.5, z: enDir.z * 0.85 + orbit.z * side * 0.5 });
      moveOrder = () => api.move(d.x, d.z);
    }
  }

  if (moveOrder) moveOrder();

  api.faceAt(aimPt.x, aimPt.z);
}
