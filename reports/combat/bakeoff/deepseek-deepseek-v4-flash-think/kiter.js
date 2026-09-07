function think(p, api) {
  const me = p.self, enemy = p.enemy, V = window.V;
  const dist = enemy.dist;
  const vis = enemy.visible;
  const busy = me.busy || me.stunned || me.silenced || !me.alive || me.airborne;
  const hdg2en = V.heading(V.sub(enemy, me));
  const ang2en = V.angleTo(me.heading, V.sub(enemy, me));

  const boltK = me.kit.k1, blinkK = me.kit.k2, beamK = me.kit.k3;
  const bCD = me.cooldowns.k1||0, blCD = me.cooldowns.k2||0, beCD = me.cooldowns.k3||0;

  // ---- dodge enemy cast ----
  let dodge = false, dodgeDir = null;
  if (enemy.casting && enemy.casting.telegraph && vis) {
    const sk = enemy.casting.skill;
    if ((sk === 'k1' || sk === 'k3') && enemy.kit[sk] && dist <= (enemy.kit[sk].range||0)) {
      dodge = true;
      const away = V.norm(V.sub(me, enemy));
      dodgeDir = V.perp(away);
      if (api.rand() < 0.5) dodgeDir = V.scale(dodgeDir, -1);
    }
  }

  // ---- choose skill ----
  let skill = null, aim = null;

  if (!busy) {
    if (dodge && blCD <= 0) {
      let t = V.add(me, V.scale(dodgeDir, 6.5));
      t.x = Math.max(-20, Math.min(20, t.x));
      t.z = Math.max(-20, Math.min(20, t.z));
      skill = 'k2'; aim = t;
    } else if (enemy.rooted && beCD <= 0 && vis && dist <= (beamK.range||24)) {
      skill = 'k3'; aim = {x:enemy.x, z:enemy.z};
    } else if (bCD <= 0 && vis && dist <= (boltK.range||18) && !dodge) {
      const lead = V.lead(me, {x:enemy.x,z:enemy.z}, {x:enemy.vx,z:enemy.vz}, boltK.speed||22);
      skill = 'k1'; aim = lead;
    } else if (beCD <= 0 && vis && dist <= (beamK.range||24) && !dodge) {
      skill = 'k3'; aim = {x:enemy.x, z:enemy.z};
    } else if (blCD <= 0 && !dodge && (me.hp < me.maxHp * 0.4) && !me.invulnerable) {
      const a = api.rand() * 2 * Math.PI;
      let t = V.add(me, {x:Math.sin(a)*3, z:Math.cos(a)*3});
      t.x = Math.max(-20, Math.min(20, t.x));
      t.z = Math.max(-20, Math.min(20, t.z));
      skill = 'k2'; aim = t;
    } else if (blCD <= 0 && !dodge && dist > 15) {
      skill = 'k2'; aim = {x:enemy.x, z:enemy.z};
    }
  }

  if (skill) {
    if (skill === 'k2') api.use('k2', aim);
    else if (skill === 'k1') api.use('k1', aim);
    else if (skill === 'k3') api.use('k3', aim);
  }

  // ---- movement ----
  const idealMin = 15, idealMax = 20;
  let mDir;
  if (dist < idealMin) mDir = V.norm(V.sub(me, enemy));
  else if (dist > idealMax) mDir = V.norm(V.sub(enemy, me));
  else {
    mDir = V.perp(V.norm(V.sub(enemy, me)));
    if (Math.floor(p.t * 2) % 2 === 0) mDir = V.scale(mDir, -1);
  }
  let t = V.add(me, V.scale(mDir, 10));
  t.x = Math.max(-19, Math.min(19, t.x));
  t.z = Math.max(-19, Math.min(19, t.z));
  api.moveTo(t.x, t.z);

  if (!skill) api.faceAt(enemy.x, enemy.z);
}