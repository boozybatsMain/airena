function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en.alive) return;

  // ---- event processing ----
  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      lastEnemySkill = e.skill;
      lastEnemySkillT = p.t;
      if (e.skill === 'charge') chargeSeenT = p.t;
    }
    if (e.type === 'enemyCommitted') chargeCommitT = p.t;
    if (e.type === 'damaged') {
      lastHitT = p.t;
      if (e.skill === 'charge') enChargeCdT = p.t;
      if (e.skill === 'smash') enSmashCdT = p.t;
    }
  }
  if (en.casting && en.casting.skill === 'charge') enChargeCdT = p.t - (en.casting.elapsed || 0);
  if (en.casting && en.casting.skill === 'smash') enSmashCdT = p.t - (en.casting.elapsed || 0);

  const dist = en.dist;
  const toEn = V.toward(me, en);
  const awayEn = V.away(me, en);

  // ---- danger assessment ----
  const enCharging = en.casting && en.casting.skill === 'charge';
  const enChargeWindup = enCharging && en.casting.phase === 'windup';
  const enChargeDash = enCharging && en.casting.phase === 'dash';
  const enSmashWind = en.casting && en.casting.skill === 'smash' && en.casting.telegraph;

  // are we in the charge line?
  let inChargeLine = false;
  if (enChargeDash || enChargeWindup) {
    const eh = V.fromHeading(en.heading);
    const rel = V.sub(me, en);
    const along = V.dot(rel, eh);
    const lat = Math.abs(rel.x * eh.z - rel.z * eh.x);
    if (along > 0 && along < 13.5 && lat < 2.6) inChargeLine = true;
  }

  const chargeCdLeft = Math.max(0, 4 - (p.t - enChargeCdT));

  // ================= EMERGENCY REACTIONS =================

  // 1. dodge active charge dash with blink sideways
  if (inChargeLine && enChargeDash && dist < 13) {
    if (api.ready('blink')) {
      const eh = V.fromHeading(en.heading);
      const side = V.perp(eh);
      const rel = V.sub(me, en);
      const s = (rel.x * eh.z - rel.z * eh.x) >= 0 ? 1 : -1;
      let d = V.scale(side, s);
      // prefer direction that stays in arena
      const test = { x: me.x + d.x * 7, z: me.z + d.z * 7 };
      if (Math.abs(test.x) > 18.5 || Math.abs(test.z) > 18.5) d = V.scale(d, -1);
      api.use('blink', d.x, d.z);
      api.faceAt(en.x, en.z);
      return;
    }
    // no blink: strafe hard perpendicular
    const eh = V.fromHeading(en.heading);
    const side = V.perp(eh);
    const rel = V.sub(me, en);
    const s = (rel.x * eh.z - rel.z * eh.x) >= 0 ? 1 : -1;
    let d = V.scale(side, s);
    if (Math.abs(me.x + d.x * 4) > 19 || Math.abs(me.z + d.z * 4) > 19) d = V.scale(d, -1);
    api.move(d.x, d.z);
    api.faceAt(en.x, en.z);
    return;
  }

  // 2. charge wind-up: sidestep so its locked direction misses
  if (enChargeWindup && dist < 14) {
    const side = V.perp(toEn);
    let s = strafeDir;
    let d = V.scale(side, s);
    if (Math.abs(me.x + d.x * 5) > 18.5 || Math.abs(me.z + d.z * 5) > 18.5) { strafeDir = -strafeDir; d = V.scale(d, -1); }
    api.move(d.x, d.z);
    api.faceAt(en.x, en.z);
    return;
  }

  // 3. smash wind-up nearby -> get out / jump over
  if (enSmashWind && dist < 4.6) {
    if (api.ready('blink')) {
      let d = awayEn;
      const test = { x: me.x + d.x * 7, z: me.z + d.z * 7 };
      if (Math.abs(test.x) > 18.5 || Math.abs(test.z) > 18.5) d = V.perp(toEn);
      api.use('blink', d.x, d.z);
      api.faceAt(en.x, en.z);
      return;
    }
    if (api.ready('jump')) {
      api.move(awayEn.x, awayEn.z);
      api.use('jump');
      api.faceAt(en.x, en.z);
      return;
    }
    api.move(awayEn.x, awayEn.z);
    api.faceAt(en.x, en.z);
    return;
  }

  // ================= KITING GEOMETRY =================
  // Ideal: keep 10-16 m, in line of sight, and fire laser.

  const IDEAL = 13;
  const MINDIST = 8.5;

  // If casting laser, just keep aiming and drift away.
  if (me.casting && me.casting.skill === 'laser') {
    const lead = V.lead(me, en, { x: en.vx, z: en.vz }, 40);
    api.faceAt(lead.x, lead.z);
    if (dist < IDEAL) {
      api.move(awayEn.x + strafeDir * V.perp(toEn).x * 0.6, awayEn.z + strafeDir * V.perp(toEn).z * 0.6);
    } else {
      const side = V.perp(toEn);
      api.move(side.x * strafeDir * 0.8, side.z * strafeDir * 0.8);
    }
    return;
  }

  // ---- fire laser ----
  if (api.ready('laser') && en.visible && dist < 22 && !me.airborne && !me.busy) {
    // don't fire if charge could reach us mid-cast at close range with charge ready
    const risky = dist < 9 && chargeCdLeft < 0.8;
    if (!risky) {
      const lead = V.lead(me, en, { x: en.vx, z: en.vz }, 40);
      api.faceAt(lead.x, lead.z);
      api.use('laser');
      return;
    }
  }

  // ---- positioning ----
  api.faceAt(en.x, en.z);

  // strafe flip occasionally / on blocks
  for (const e of p.events) if (e.type === 'blocked') strafeDir = -strafeDir;
  if (p.tick % 90 === 0 && api.rand() < 0.5) strafeDir = -strafeDir;

  const side = V.perp(toEn);
  let dir;

  if (dist < MINDIST) {
    // back off with a tangential component
    dir = V.norm({ x: awayEn.x * 1.2 + side.x * strafeDir * 0.9, z: awayEn.z * 1.2 + side.z * strafeDir * 0.9 });
  } else if (dist > IDEAL + 4 || !en.visible) {
    // close in / reacquire sight
    dir = V.norm({ x: toEn.x + side.x * strafeDir * 0.35, z: toEn.z + side.z * strafeDir * 0.35 });
  } else {
    dir = V.norm({ x: side.x * strafeDir + toEn.x * 0.05, z: side.z * strafeDir + toEn.z * 0.05 });
  }

  // avoid walls: steer inward if heading near edge
  const nx = me.x + dir.x * 3.5, nz = me.z + dir.z * 3.5;
  if (Math.abs(nx) > 18 || Math.abs(nz) > 18) {
    strafeDir = -strafeDir;
    const inward = V.norm({ x: -me.x, z: -me.z });
    dir = V.norm({ x: dir.x * 0.3 + inward.x, z: dir.z * 0.3 + inward.z });
  }

  // blink to escape when very close and blink ready and threatened
  if (dist < 5.5 && api.ready('blink') && chargeCdLeft < 1.5) {
    let d = dir;
    api.use('blink', d.x, d.z);
    return;
  }

  if (!en.visible && dist > 6) {
    const path = api.pathTo(en.x, en.z);
    if (path && path.points && path.points.length) {
      api.moveTo(en.x, en.z);
      return;
    }
  }

  api.move(dir.x, dir.z);
}

let strafeDir = 1;
let lastEnemySkill = null;
let lastEnemySkillT = -99;
let chargeSeenT = -99;
let chargeCommitT = -99;
let enChargeCdT = -99;
let enSmashCdT = -99;
let lastHitT = -99;
