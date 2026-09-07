function think(p, api) {
  const me = p.self;
  const opp = p.enemy;

  // Always keep facing opponent
  api.faceAt(opp.x, opp.z);

  // Maintain defensive shield (k3) whenever available or taking pressure
  if (api.ready('k3')) {
    api.use('k3');
  }

  // Combat Zone Placement: predict opponent position during cast delay
  const dist = opp.dist;
  const castLeadTime = 0.57;
  const targetPos = {
    x: opp.x + opp.vx * castLeadTime,
    z: opp.z + opp.vz * castLeadTime
  };
  const targetDist = V.dist(me, targetPos);

  // Offensive priority: Root & Damage (k2), then Pull & Slow (k1)
  if (!me.busy) {
    if (api.ready('k2') && targetDist <= 16) {
      api.use('k2');
      api.say("Стой на месте!");
    } else if (api.ready('k1') && targetDist <= 12.005) {
      api.use('k1');
      api.say("Иди сюда!");
    }
  }

  // Zone Hazard Avoidance
  let avoidVector = { x: 0, z: 0 };
  if (p.arena && p.arena.zones) {
    for (const zone of p.arena.zones) {
      if (!zone.mine) {
        const d = V.dist(me, zone);
        if (d < zone.r + me.radius + 0.5) {
          const away = V.away(zone, me);
          const weight = (zone.r + me.radius + 0.5 - d);
          avoidVector = V.add(avoidVector, V.scale(away, weight));
        }
      }
    }
  }

  // Movement Strategy:
  // With high HP (300 vs 180) and lower speed, maintain medium combat range (5-9m)
  // Close enough to reliably cast zones, but not pinned by walls.
  let moveDir = { x: 0, z: 0 };
  const idealDist = 4.708;

  if (V.len(avoidVector) > 0.011) {
    moveDir = V.norm(avoidVector);
  } else {
    if (dist > idealDist + 1.23) {
      moveDir = V.toward(me, opp);
    } else if (dist < idealDist - 1.83) {
      moveDir = V.away(opp, me);
    } else {
      // Circle strafe to make enemy zone landing harder
      const perp = V.perp(V.toward(me, opp));
      moveDir = perp;
    }
  }

  // Wall repulsion to avoid getting cornered
  const arenaBound = 16;
  if (Math.abs(me.x) > arenaBound) {
    moveDir.x += (me.x > 0 ? -1 : 1) * 2.0;
  }
  if (Math.abs(me.z) > arenaBound) {
    moveDir.z += (me.z > 0 ? -1 : 1) * 2.0;
  }

  const finalDir = V.norm(moveDir);
  api.move(finalDir.x, finalDir.z);
}