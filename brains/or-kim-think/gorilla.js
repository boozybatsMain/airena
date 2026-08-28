function think(p, api) {
  const s = p.self, e = p.enemy;
  const S = api.recall("st", null) || {};
  const st = S;
  st.lastTick = p.tick;
  for (const ev of p.events) {
    if (ev.type === "enemyStarted") st.enemySkill = { skill: ev.skill, t: p.t };
    if (ev.type === "damaged") st.lastHurt = p.t;
    if (ev.type === "interruptedEnemy") api.say("haha");
  }
  api.remember("st", st);

  if (!s.alive || !e.alive) return;

  const dist = e.dist;
  const toE = V.toward(s, e);
  const behindE = { x: e.x + toE.x * 3.2, z: e.z + toE.z * 3.2 };
  const touchRange = dist <= s.radius + e.radius + 3.1;
  const smashMax = 5.2;

  api.faceAt(e.x, e.z);

  // Dodge incoming laser: jump if casting and we're in the open
  const laserIncoming = e.casting && e.casting.skill === "laser" && e.casting.telegraph;
  if (laserIncoming && api.ready("jump") && p.enemy.visible && !s.busy) {
    const r = api.ray(toE.x, toE.z, dist);
    if (!r.hit || r.dist > dist - 1) {
      const side = api.rand() < 0.5 ? 1 : -1;
      const perp = V.perp(toE);
      api.move(perp.x * side, perp.z * side);
      api.use("jump");
      return;
    }
  }

  if (s.busy || s.stunned) return;

  // Charge when at range with clear LOS-ish path and it's ready
  if (api.ready("charge") && dist > 6 && dist < 13 && p.enemy.visible && !e.invulnerable) {
    const r = api.ray(toE.x, toE.z, dist);
    if (!r.hit || r.dist >= dist - 1.2) {
      api.faceAt(e.x + e.vx * 0.25, e.z + e.vz * 0.25);
      api.use("charge");
      return;
    }
  }

  // Smash when in reach
  if (api.ready("smash") && dist < smashMax && !e.airborne && !e.invulnerable) {
    api.faceAt(e.x, e.z);
    api.use("smash");
    return;
  }

  // Close distance
  if (dist > 3.4) {
    if (p.enemy.visible) {
      api.moveTo(e.x, e.z);
    } else {
      const path = api.pathTo(e.x, e.z);
      if (path && path.points.length > 1) {
        api.moveTo(path.points[1].x, path.points[1].z);
      } else {
        api.moveTo(e.x, e.z);
      }
    }
  } else {
    // stay in smashing range, slight strafe
    api.move(toE.x, toE.z);
  }

  // Burn pressure: if we're behind on hp fraction late, get aggressive anyway
  if (p.burn > 0 && s.hp / s.maxHp < e.hp / e.maxHp && api.ready("charge") && dist < 15) {
    api.faceAt(e.x, e.z);
    api.use("charge");
  }
}