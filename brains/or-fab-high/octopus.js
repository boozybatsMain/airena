let lastDir = null;

function pickMove(p, api, ideal) {
  const me = p.self, en = p.enemy;
  let best = { x: 0, z: 1 }, bestScore = -Infinity;
  const ex = en.x + en.vx * 0.5, ez = en.z + en.vz * 0.5;
  for (let i = 0; i < 16; i++) {
    const h = i * Math.PI / 8;
    const d = { x: Math.sin(h), z: Math.cos(h) };
    const tx = me.x + d.x * 3.2, tz = me.z + d.z * 3.2;
    let s = 0;
    const H = p.arena.half - 1.3;
    if (Math.abs(tx) > H || Math.abs(tz) > H) s -= 40;
    s -= (Math.max(0, Math.abs(tx) - 13) + Math.max(0, Math.abs(tz) - 13)) * 1.6;
    const r = api.ray(d.x, d.z, 3.4);
    if (r.hit) s -= (3.4 - r.dist) * 9;
    const nd = Math.hypot(tx - ex, tz - ez);
    s -= Math.abs(nd - ideal) * 3;
    if (lastDir) s += (d.x * lastDir.x + d.z * lastDir.z) * 1.5;
    if (s > bestScore) { bestScore = s; best = d; }
  }
  lastDir = best;
  return best;
}

function think(p, api) {
  const me = p.self, en = p.enemy;
  const dist = en.dist;
  const toEn = V.toward(me, en);
  const away = V.scale(toEn, -1);
  const cast = en.casting;
  const enemyCharging = !!(cast && cast.skill === 'charge');
  const chargeWindup = enemyCharging && cast.phase === 'windup';
  const chargeDash = enemyCharging && cast.phase === 'dash';
  const smashWindup = !!(cast && cast.skill === 'smash' && cast.telegraph);
  const enemyVulnerable = en.stunned || (cast && cast.phase === 'recover') || en.airborne;

  // --- aim point with lead
  let tLead = 0.25;
  if (me.casting && me.casting.skill === 'laser' && me.casting.telegraph) {
    tLead = me.casting.remaining;
  }
  let lead = { x: en.vx * tLead, z: en.vz * tLead };
  const ll = V.len(lead);
  if (ll > 4) lead = V.scale(lead, 4 / ll);
  let aim = { x: en.x + lead.x, z: en.z + lead.z };
  if (!api.los(aim.x, aim.z)) aim = { x: en.x, z: en.z };
  api.faceAt(aim.x, aim.z);

  // --- dodge a committed charge
  if (chargeDash && !me.invulnerable) {
    const dir = V.fromHeading(en.heading);
    const rel = V.sub(me, en);
    const along = V.dot(rel, dir);
    const perpV = V.sub(rel, V.scale(dir, along));
    const pd = V.len(perpV);
    if (along > -1.5 && along < 14 && pd < 4.2) {
      let side = pd > 0.05 ? V.norm(perpV) : { x: -dir.z, z: dir.x };
      const r = api.ray(side.x, side.z, 3);
      if (r.hit && r.dist < 2.2) side = V.scale(side, -1);
      if (api.ready('blink') && !me.busy && !me.airborne && along < 10 && pd < 3.4) {
        api.use('blink', side.x, side.z);
        api.move(side.x, side.z);
        return;
      }
      api.move(side.x, side.z);
      return;
    }
  }

  // --- pre-strafe while their charge winds up
  if (chargeWindup && dist < 15) {
    let side = { x: -toEn.z, z: toEn.x };
    const c1 = Math.hypot(me.x + side.x * 4, me.z + side.z * 4);
    const c2 = Math.hypot(me.x - side.x * 4, me.z - side.z * 4);
    if (c2 < c1) side = V.scale(side, -1);
    const r = api.ray(side.x, side.z, 3);
    if (r.hit && r.dist < 2.2) side = V.scale(side, -1);
    api.move(side.x + away.x * 0.4, side.z + away.z * 0.4);
    return;
  }

  // --- dodge smash: jump makes the ground sweep miss
  if (smashWindup && dist < 7 && !me.airborne && !me.invulnerable) {
    if (api.ready('jump') && !me.busy) {
      api.move(away.x, away.z);
      api.use('jump');
      return;
    }
    if (api.ready('blink') && !me.busy) {
      api.use('blink', away.x, away.z);
      api.move(away.x, away.z);
      return;
    }
    api.move(away.x, away.z);
    return;
  }

  // --- panic blink when they are on top of us
  if (dist < 3.2 && !enemyVulnerable && api.ready('blink') && !me.busy && !me.airborne) {
    const d = { x: away.x + (api.rand() - 0.5) * 0.6, z: away.z + (api.rand() - 0.5) * 0.6 };
    api.use('blink', d.x, d.z);
    api.move(away.x, away.z);
    return;
  }

  // --- laser
  if (!me.busy && !me.airborne && !me.stunned && api.ready('laser') && en.visible && dist < 25.5) {
    const angle = Math.abs(V.angleTo(me.heading, V.toward(me, aim)));
    const safe = dist > 7.5 || enemyVulnerable;
    const noThreat = !enemyCharging || cast.phase === 'recover';
    if (angle < 1.2 && safe && noThreat) {
      api.use('laser');
    }
  }

  // --- kiting distance
  let ideal = 13;
  const myFrac = me.hp / me.maxHp, enFrac = en.hp / en.maxHp;
  if (p.t > 30 && myFrac < enFrac) ideal = 10;
  else if (api.cooldown('laser') > 1.4) ideal = 14.5;

  if (!en.visible && dist > 9) {
    api.moveTo(en.x, en.z);
    return;
  }

  const d = pickMove(p, api, ideal);
  api.move(d.x, d.z);
}