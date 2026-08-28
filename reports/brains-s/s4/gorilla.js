function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en.alive) return;

  const dist = en.dist;
  const toEn = V.toward(me, en);

  // ---- event bookkeeping ----
  let enemyCasting = null;
  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      lastEnemySkill = e.skill;
      lastEnemySkillT = p.t;
    }
    if (e.type === 'damaged' && e.skill === 'laser') lastLaserHitT = p.t;
    if (e.type === 'blocked') lastBlockedT = p.t;
  }
  if (en.casting) enemyCasting = en.casting;

  // ---- helpers ----
  const dodgeDir = () => {
    // perpendicular to enemy facing/line, pick the side with more room
    const perp = V.perp(toEn);
    const a = { x: me.x + perp.x * 4, z: me.z + perp.z * 4 };
    const b = { x: me.x - perp.x * 4, z: me.z - perp.z * 4 };
    const inA = Math.abs(a.x) < 19 && Math.abs(a.z) < 19;
    const inB = Math.abs(b.x) < 19 && Math.abs(b.z) < 19;
    if (inA && !inB) return perp;
    if (inB && !inA) return V.scale(perp, -1);
    return strafeSign > 0 ? perp : V.scale(perp, -1);
  };

  // flip strafe direction occasionally or on block
  if (p.t - lastFlipT > 1.1 || (p.t - lastBlockedT < 0.1)) {
    strafeSign = -strafeSign;
    lastFlipT = p.t;
  }

  // ---- always face the enemy (unless charging committed) ----
  let facingSet = false;
  const faceEnemy = () => { api.faceAt(en.x, en.z); facingSet = true; };

  // If we're airborne or busy with uninterruptible stuff, just steer facing.
  if (me.airborne) {
    faceEnemy();
    return;
  }

  // ---- SMASH: highest priority when in range ----
  const smashReach = 2.9 + me.radius + en.radius; // 5.15
  // predict enemy position 0.3s ahead (windup)
  const predX = en.x + en.vx * 0.30;
  const predZ = en.z + en.vz * 0.30;
  const predDist = Math.hypot(predX - me.x, predZ - me.z);
  const ang = Math.abs(V.angleTo(me.heading, V.toward(me, { x: predX, z: predZ })));

  if (!me.busy && api.ready('smash') && predDist < smashReach - 0.35 &&
      !en.airborne && !en.invulnerable && ang < 1.0) {
    api.use('smash');
    api.faceAt(predX, predZ);
    facingSet = true;
    // keep pressing in
    api.move(toEn.x, toEn.z);
    return;
  }

  // ---- CHARGE: closer, when in a lane and mid range ----
  if (!me.busy && api.ready('charge') && en.visible && !en.invulnerable) {
    // lead enemy over windup + travel
    const travel = Math.max(0, dist - me.radius - en.radius);
    const tHit = 0.3 + travel / 15;
    const lx = en.x + en.vx * tHit * 0.7;
    const lz = en.z + en.vz * tHit * 0.7;
    const d2 = Math.hypot(lx - me.x, lz - me.z);
    const dir = V.norm({ x: lx - me.x, z: lz - me.z });
    const r = api.ray(dir.x, dir.z, Math.min(13, d2 + 1));
    const clearPath = !r.hit || r.dist >= d2 - 0.3;
    if (d2 > 3.2 && d2 < 11.5 && clearPath) {
      // Best when they are committed (casting laser) or just far away
      const good = (enemyCasting && enemyCasting.skill === 'laser') || d2 > 4.5;
      if (good) {
        api.use('charge');
        api.face(dir.x, dir.z);
        api.move(dir.x, dir.z);
        return;
      }
    }
  }

  // ---- Laser dodge: they are casting, we can't reach, sidestep hard ----
  if (enemyCasting && enemyCasting.skill === 'laser' && enemyCasting.telegraph) {
    faceEnemy();
    const d = dodgeDir();
    // move perpendicular plus slight forward push to close
    const mv = V.norm({ x: d.x * 1.0 + toEn.x * 0.55, z: d.z * 1.0 + toEn.z * 0.55 });
    api.move(mv.x, mv.z);
    return;
  }

  // ---- default: hunt ----
  if (!facingSet) faceEnemy();

  if (dist > 7 && !en.visible) {
    // route to them around blocks
    api.moveTo(en.x, en.z);
    return;
  }

  if (dist > 6) {
    const path = api.pathTo(en.x, en.z);
    if (path && !path.direct && path.points && path.points.length) {
      const wp = path.points[0];
      api.moveTo(en.x, en.z);
    } else {
      // approach with slight weave to spoil aim
      const perp = V.perp(toEn);
      const w = Math.sin(p.t * 3.2) * 0.5;
      api.move(toEn.x + perp.x * w, toEn.z + perp.z * w);
    }
    return;
  }

  // close range: circle-strafe inward to stay in smash arc
  const perp = V.perp(toEn);
  const s = strafeSign;
  const want = dist > 3.0 ? 1.0 : (dist < 2.2 ? -0.35 : 0.2);
  const mv = V.norm({
    x: toEn.x * want + perp.x * s * 0.85,
    z: toEn.z * want + perp.z * s * 0.85
  });
  api.move(mv.x, mv.z);
}

let strafeSign = 1;
let lastFlipT = 0;
let lastBlockedT = -99;
let lastEnemySkill = null;
let lastEnemySkillT = -99;
let lastLaserHitT = -99;
