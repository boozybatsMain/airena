function think(p, api) {
  const me = p.self;
  const opp = p.enemy;

  // Always keep facing target for rapid skill execution
  const toOpp = V.sub(opp, me);
  const dist = V.len(toOpp);
  const dirOpp = V.norm(toOpp);
  
  // Aim with lead for projectile (k2)
  const boltLeadPos = V.lead(me, opp, { x: opp.vx, z: opp.vz }, 22);
  const boltDir = V.norm(V.sub(boltLeadPos, me));

  // Determine debuffs or need for speed
  const isRooted = me.speed < 0.1 && (me.vx !== 0 || me.vz !== 0);
  const enemyCasting = opp.casting && opp.casting.telegraph;
  
  // 1. Skill usage logic
  // k3 (Cleanse & Speed Boost): Use when rooted, or when ready to chase/engage
  if (api.ready('k3')) {
    if (isRooted || dist > 6 || (me.hp < me.maxHp * 0.854 && dist < 5)) {
      api.use('k3');
    }
  }

  // k1 (Melee Cone Burn + Burst): range 3.4
  // Target must be on ground
  if (api.ready('k1') && dist <= 3.008 && !opp.airborne) {
    // Face directly before casting
    api.face(dirOpp.x, dirOpp.z);
    api.use('k1');
  }

  // k2 (Ranged Bolt + Root): range 18, speed 22
  if (api.ready('k2') && dist <= 17 && api.los(opp.x, opp.z)) {
    api.face(boltDir.x, boltDir.z);
    api.use('k2');
  }

  // Dodge incoming projectiles or enemy k1/k2
  let dodgeDir = null;
  if (p.arena.projectiles && p.arena.projectiles.length > 0) {
    for (const proj of p.arena.projectiles) {
      if (!proj.mine) {
        const toProj = V.sub(proj, me);
        const pDist = V.len(toProj);
        if (pDist < 12) {
          // Perpendicular movement to projectile velocity
          const pVel = { x: proj.vx, z: proj.vz };
          const perp = V.norm(V.perp(pVel));
          dodgeDir = perp;
          break;
        }
      }
    }
  }

  // Movement strategy:
  // - We have more base HP (204 vs 180) and heavier mass (3.562 vs 2.536).
  // - Aggressive brawler: close the gap, hit with k2 to root, land k1 in melee.
  if (dodgeDir) {
    api.move(dodgeDir.x, dodgeDir.z);
    api.face(dirOpp.x, dirOpp.z);
  } else if (dist > 2.2) {
    api.moveTo(opp.x, opp.z);
    api.face(dirOpp.x, dirOpp.z);
  } else {
    // Close range: stick close, circle slightly to throw off skillshots
    const flank = V.perp(dirOpp);
    const moveVector = V.add(V.scale(dirOpp, 0.4), V.scale(flank, 0.6));
    api.move(moveVector.x, moveVector.z);
    api.face(dirOpp.x, dirOpp.z);
  }

  // Occasional war cries
  if (p.tick % 45 === 0) {
    if (dist <= 3.78) {
      api.say("Стой и гори!");
    } else if (opp.hp < me.hp) {
      api.say("Тебе не уйти.");
    } else {
      api.say("Сокрушу!");
    }
  }
}