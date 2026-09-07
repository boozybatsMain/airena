function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en.alive) return;

  const kit = me.kit || {};
  const beam = kit.k1, boost = kit.k2, bolt = kit.k3;
  const boosted = !!(me.buffs && false);

  const d = en.dist;
  const toE = V.toward(me, en);

  // ranges (live)
  const beamRange = beam ? (beam.range || 0) + 1.7 + 0.4 + en.radius : 0;
  const boltRange = bolt ? (bolt.range || 0) + 1.8 + 1.85 : 0;

  // desired band
  const want = 12;

  // Facing: always toward enemy unless casting aimed
  api.faceAt(en.x, en.z);

  // Dodge incoming bolts
  let dodge = null;
  for (const pr of (p.arena.projectiles || [])) {
    if (pr.mine) continue;
    const rel = { x: me.x - pr.x, z: me.z - pr.z };
    const sp = Math.hypot(pr.vx, pr.vz) || 1;
    const dir = { x: pr.vx / sp, z: pr.vz / sp };
    const along = V.dot(rel, dir);
    if (along < 0 || along > sp * (pr.left || 0) + 2) continue;
    const perp = Math.abs(rel.x * dir.z - rel.z * dir.x);
    if (perp < 3.0) {
      const side = (rel.x * dir.z - rel.z * dir.x) >= 0 ? 1 : -1;
      dodge = { x: dir.z * side, z: -dir.x * side };
      break;
    }
  }

  // Enemy beam telegraph -> strafe hard perpendicular / break LOS
  const theirCast = en.casting;
  let strafeUrgent = false;
  if (theirCast && theirCast.telegraph && theirCast.skill && (en.kit[theirCast.skill] || {}).kind !== 'self') {
    strafeUrgent = true;
  }

  const strafeSign = api.recall('ss', 1);
  if (p.tick % 60 === 0) api.remember('ss', -strafeSign);
  const perpV = { x: toE.z * strafeSign, z: -toE.x * strafeSign };

  // Movement
  let mv;
  if (dodge) mv = dodge;
  else if (strafeUrgent) mv = V.add(perpV, V.scale(toE, d > want ? 0.3 : -0.3));
  else if (d > want + 2) mv = V.add(toE, V.scale(perpV, 0.35));
  else if (d < want - 3) mv = V.add(V.scale(toE, -1), V.scale(perpV, 0.5));
  else mv = perpV;

  // wall avoidance
  const h = p.arena.half - 2.5;
  if (me.x > h) mv.x -= 1.5; if (me.x < -h) mv.x += 1.5;
  if (me.z > h) mv.z -= 1.5; if (me.z < -h) mv.z += 1.5;
  api.move(mv.x, mv.z);

  if (me.busy || me.stunned || me.silenced) return;

  const vis = en.visible;

  // Boost when it will be used
  if (boost && api.ready('k2') && d < boltRange * 1.5 && d > 6 && !vis) {
    api.use('k2');
    api.say("Winding wider.");
    return;
  }

  if (!vis) return;

  // Bolt: lead the target
  if (bolt && api.ready('k3') && d <= boltRange - 1) {
    const aim = V.lead(me, en, { x: en.vx, z: en.vz }, bolt.speed || 22);
    api.use('k3', { x: aim.x, z: aim.z });
    return;
  }

  // Beam: safest when they're committed or close
  if (beam && api.ready('k1') && d <= beamRange - 1) {
    const t = (beam.windup || 0.667);
    const aim = { x: en.x + en.vx * t * 0.55, z: en.z + en.vz * t * 0.55 };
    api.use('k1', aim);
    api.say("Hold still.");
    return;
  }

  if (boost && api.ready('k2') && d > boltRange) api.use('k2');
}