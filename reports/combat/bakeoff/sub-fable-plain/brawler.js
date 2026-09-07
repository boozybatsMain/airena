const B = {};
function think(p, api) {
  const s = p.self, e = p.enemy, kit = s.kit;
  const dist = e.dist;
  const toE = V.toward(s, e);
  const ec = e.casting;
  const eTel = ec && ec.telegraph ? ec.skill : null;
  const ek = eTel ? e.kit[eTel] : null;
  const k1 = kit.k1 || {}, k2 = kit.k2 || {}, k3 = kit.k3 || {};
  const dashDist = k1.distance || 8;
  const dashReach = dashDist + s.radius + e.radius;
  const coneReach = (k2.range || 3.4) + e.radius;
  const eConeReach = (ek && ek.range ? ek.range : 3.4) + s.radius;
  const eDashReach = (ek && ek.distance ? ek.distance : 8) + s.radius + e.radius;
  const lead = (t) => ({ x: e.x + e.vx * t, z: e.z + e.vz * t });
  const facingErr = Math.abs(V.angleTo(s.heading, toE));

  if (!B.said) { B.said = true; api.say("Heavy feet, heavier hands. Come closer."); }

  // 1. Threat reactions
  if (eTel && ek) {
    if (ek.kind === 'cone' || (ek.range && !ek.distance)) {
      if (dist < eConeReach + 1.5 && !s.busy) {
        api.move(-toE.x, -toE.z);
        api.face(toE.x, toE.z);
        return;
      }
    } else if (ek.distance) {
      if (dist < eDashReach + 1 && !s.busy) {
        const side = V.perp(toE);
        const sign = B.side || (B.side = api.rand() < 0.5 ? 1 : -1);
        api.move(side.x * sign - toE.x * 0.3, side.z * sign - toE.z * 0.3);
        api.face(toE.x, toE.z);
        return;
      }
    }
  }

  if (s.busy) { api.face(toE.x, toE.z); return; }

  // 2. Offense: cone when in reach
  if (api.ready('k2') && e.visible && dist < coneReach - 0.2 && !e.invulnerable && !e.immune.includes('act')) {
    api.use('k2', lead(k2.windup || 0.3));
    api.move(toE.x, toE.z);
    return;
  }
  if (api.ready('k2') && e.visible && (e.stunned || e.rooted) && dist < coneReach + 1.2) {
    api.use('k2', { x: e.x, z: e.z });
    api.move(toE.x, toE.z);
    return;
  }

  // 3. Heal/shield when safe
  const missing = s.maxHp - s.hp;
  const safe = dist > eDashReach + 2 || e.stunned || e.rooted || (ec && ec.phase === 'recover') || !e.visible;
  if (api.ready('k3') && ((missing >= 34 && safe) || (s.hp / s.maxHp < 0.4))) {
    api.use('k3');
    api.move(toE.x, toE.z);
    api.face(toE.x, toE.z);
    return;
  }

  // 4. Dash when it will land
  if (api.ready('k1') && e.visible && dist > coneReach - 0.5 && dist < dashReach - 0.8 && facingErr < 0.6 && !e.airborne) {
    const tgt = lead((k1.windup || 0.2) + 0.15);
    if (api.los(tgt.x, tgt.z)) {
      api.use('k1', tgt);
      api.move(toE.x, toE.z);
      return;
    }
  }

  // 5. Approach
  api.face(toE.x, toE.z);
  if (e.visible && dist < dashReach + 3) api.move(toE.x, toE.z);
  else api.moveTo(e.x, e.z);
}