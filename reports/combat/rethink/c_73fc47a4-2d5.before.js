function think(p, api) {
  const me = p.self;
  const en = p.enemy;

  // Track incoming threats
  let incomingProj = null;
  let minProjDist = 999;
  for (const proj of p.arena.projectiles) {
    if (!proj.mine) {
      const d = V.dist(me, proj);
      if (d < minProjDist) {
        minProjDist = d;
        incomingProj = proj;
      }
    }
  }

  const enIsCasting = en.casting && en.casting.telegraph;
  const dist = en.dist;
  const dirToEn = V.toward(me, en);
  const dirAwayEn = V.away(me, en);

  // Helper: check if a position is safe and inside bounds
  function isSafe(pos, margin = 2.0) {
    const bound = p.arena.half - margin;
    if (Math.abs(pos.x) > bound || Math.abs(pos.z) > bound) return false;
    for (const ob of p.arena.obstacles) {
      if (
        Math.abs(pos.x - ob.x) < (ob.hx + margin) &&
        Math.abs(pos.z - ob.z) < (ob.hz + margin)
      ) {
        return false;
      }
    }
    return true;
  }

  // 1. DEFENSIVE BLINK (k1)
  if (api.ready('k1')) {
    let needBlink = false;
    let blinkDir = dirAwayEn;

    if (incomingProj && minProjDist < 5.0) {
      // Dodge projectile perpendicular or away
      const pDir = V.norm({ x: incomingProj.vx, z: incomingProj.vz });
      const side = V.perp(pDir);
      blinkDir = V.add(dirAwayEn, side);
      needBlink = true;
    } else if (enIsCasting && dist < 9.0) {
      // Gorilla winding up a skill close to us
      blinkDir = dirAwayEn;
      needBlink = true;
    } else if (dist < 4.5 && !en.stunned) {
      // Too close to heavy brawler
      blinkDir = dirAwayEn;
      needBlink = true;
    }

    if (needBlink) {
      let targetBlinkDir = V.norm(blinkDir);
      let targetPos = V.add(me, V.scale(targetBlinkDir, 7.5));
      if (!isSafe(targetPos, 1.5)) {
        // Find an open direction
        for (let angle = 0.5; angle < Math.PI * 2; angle += 0.7) {
          const altDir = V.rot(targetBlinkDir, angle);
          const altPos = V.add(me, V.scale(altDir, 7.5));
          if (isSafe(altPos, 1.5)) {
            targetBlinkDir = altDir;
            break;
          }
        }
      }
      api.say('Скольжу сквозь тьму!');
      api.use('k1', targetBlinkDir.x, targetBlinkDir.z);
      return;
    }
  }

  // 2. OFFENSIVE COMBO: k3 (Dash) and k2 (Bolt)
  // Octopus k2 has 18m range, speed 22, applies blind
  // Octopus k3 has 8m dash, 26 damage
  const canSee = api.los(en.x, en.z);

  // Dash strike if lined up, ready, and gorilla is vulnerable or in range
  if (api.ready('k3') && canSee && dist >= 3.0 && dist <= 7.8) {
    const angleDiff = Math.abs(V.angleTo(me.heading, dirToEn));
    if (angleDiff < 0.25) {
      api.say('Щупальца настигнут!');
      api.use('k3');
      return;
    } else {
      api.faceAt(en.x, en.z);
    }
  }

  // Long range Bolt / Blind
  if (api.ready('k2') && canSee && dist <= 17.5) {
    // Lead enemy
    const leadTime = dist / 22.0;
    const targetSpot = {
      x: en.x + en.vx * leadTime * 0.8,
      z: en.z + en.vz * leadTime * 0.8
    };
    const shootDir = V.toward(me, targetSpot);
    const angleDiff = Math.abs(V.angleTo(me.heading, shootDir));

    if (angleDiff < 0.3) {
      api.say('Чернильный плевок!');
      api.use('k2');
      return;
    } else {
      api.face(shootDir.x, shootDir.z);
    }
  }

  // 3. FACING & MOVEMENT (Kiting & Spacing)
  // Always face enemy for fast reaction/aim
  if (!me.busy) {
    api.faceAt(en.x, en.z);
  }

  // Optimal distance is around 9 - 13 meters (out of Gorilla's dash/blink, inside our bolt)
  const idealDistMin = 9.0;
  const idealDistMax = 13.0;

  let moveTarget = null;

  if (dist < idealDistMin) {
    // Back away while circling slightly
    const perp = V.perp(dirAwayEn);
    const kiteDir = V.norm(V.add(V.scale(dirAwayEn, 1.2), V.scale(perp, 0.8)));
    const dest = V.add(me, V.scale(kiteDir, 5.0));
    if (isSafe(dest, 1.5)) {
      moveTarget = dest;
    } else {
      moveTarget = V.add(me, V.scale(dirAwayEn, 5.0));
    }
  } else if (dist > idealDistMax) {
    // Close in carefully maintaining line of sight
    moveTarget = en;
  } else {
    // Circle around the Gorilla to make incoming shots miss
    const perp = V.perp(dirToEn);
    const circlePos = V.add(me, V.scale(perp, 4.0));
    if (isSafe(circlePos, 1.5)) {
      moveTarget = circlePos;
    } else {
      const altCirclePos = V.add(me, V.scale(perp, -4.0));
      moveTarget = isSafe(altCirclePos, 1.5) ? altCirclePos : en;
    }
  }

  if (moveTarget) {
    // Keep away from obstacles and walls
    if (Math.abs(me.x) > 16 || Math.abs(me.z) > 16) {
      api.moveTo(0, 0);
    } else {
      api.moveTo(moveTarget.x, moveTarget.z);
    }
  }
}