function think(p, api) {
  const me = p.self, en = p.enemy;
  const dist = en.dist;
  const laserRange = 26.5;

  // Track enemy charge timing / intentions
  let mem = api.recall("m", { charge: 0, smash: 0, lastHp: en.hp, side: 1 });
  for (const e of p.events) {
    if (e.type === "enemyStarted" && e.skill === "charge") mem.charge = p.t;
    if (e.type === "enemyStarted" && e.skill === "smash") mem.smash = p.t;
    if (e.type === "contact") mem.side = api.rand() < 0.5 ? -1 : 1;
  }
  api.remember("m", mem);

  const toMe = V.toward(me, en);          // enemy -> me
  const toEn = V.away(me, en);            // me -> enemy
  const myVec = { x: me.x, z: me.z };

  // --- Emergency: enemy charging near -> blink away or jump over
  const ec = en.casting;
  if (ec && ec.skill === "charge" && ec.phase === "dash" && dist < 7) {
    // dodge perpendicular-ish, away from dash line
    const dashDir = V.fromHeading(en.heading);
    const perp = V.perp(dashDir);
    const side = V.dot(perp, toMe) >= 0 ? 1 : -1;
    const dodge = V.add(V.scale(perp, side), V.scale(toMe, 0.6));
    if (me.airborne) return;
    if (api.ready("jump") && dist < 4.5) {
      api.move(dodge.x, dodge.z);
      api.use("jump");
      return;
    }
    if (api.ready("blink")) {
      api.use("blink", dodge.x, dodge.z);
      api.faceAt(en.x, en.z);
      return;
    }
    api.move(dodge.x, dodge.z);
    api.faceAt(en.x, en.z);
    return;
  }

  // --- Smash threat: if they're winding smash close and we're grounded, jump over it
  if (ec && ec.skill === "smash" && ec.phase === "windup" && dist < 5.5 && !me.airborne) {
    if (api.ready("jump")) {
      api.move(toMe.x, toMe.z);
      api.use("jump");
    } else {
      api.move(toMe.x, toMe.z);
    }
    api.faceAt(en.x, en.z);
    return;
  }

  // --- Too close: retreat, blink out if pinned
  if (dist < 5.5) {
    if (api.ready("blink") && dist < 4 && !me.airborne) {
      api.use("blink", toMe.x, toMe.z);
      api.faceAt(en.x, en.z);
      return;
    }
    // strafe while retreating
    const perp = V.perp(toMe);
    const mv = V.add(toMe, V.scale(perp, mem.side * 0.6));
    api.move(mv.x, mv.z);
    api.faceAt(en.x, en.z);
    return;
  }

  // --- Fire the laser when lined up
  const canHit = en.visible && !en.airborne && !en.invulnerable &&
    dist < laserRange && dist > 2 && p.los(en.x, en.z) && api.ready("laser");
  // Only cast when facing is roughly toward them, so the beam doesn't waste
  const aimAngle = Math.abs(V.angleTo(me.heading, V.toward(myVec, { x: en.x, z: en.z })));
  if (canHit && (aimAngle < 0.5 || dist > 12)) {
    api.faceAt(en.x, en.z);
    // aim slightly ahead of their motion
    const lead = 0.4;
    api.faceAt(en.x + en.vx * lead, en.z + en.vz * lead);
    api.use("laser");
    // hold position to keep the line, drift back a little
    if (dist < 10) api.move(toMe.x * 0.5, toMe.z * 0.5);
    else api.stop();
    return;
  }

  // --- While casting: keep facing them, drift away
  if (me.casting && me.casting.skill === "laser") {
    const lead = 0.35;
    api.faceAt(en.x + en.vx * lead, en.z + en.vz * lead);
    if (dist < 9) api.move(toMe.x, toMe.z);
    return;
  }

  // --- Mid range: maintain a good beam distance (12-18m), kite
  let mv;
  if (dist > 18) {
    // approach but hug cover-free lines; just move toward
    mv = V.toward(myVec, { x: en.x, z: en.z });
  } else if (dist < 11) {
    const perp = V.perp(toMe);
    mv = V.add(toMe, V.scale(perp, mem.side * 0.7));
  } else {
    // orbit at good range
    const perp = V.perp(toMe);
    mv = V.add(V.scale(toMe, 0.2), V.scale(perp, mem.side));
  }

  // Stay off the walls
  const m = 2.5, h = p.arena.half - m;
  if (me.x > h && mv.x > 0) mv.x = -0.5;
  if (me.x < -h && mv.x < 0) mv.x = 0.5;
  if (me.z > h && mv.z > 0) mv.z = -0.5;
  if (me.z < -h && mv.z < 0) mv.z = 0.5;

  // Occasionally flip orbit direction
  if (api.rand() < 0.02) { mem.side *= -1; api.remember("m", mem); }

  api.move(mv.x, mv.z);
  api.faceAt(en.x, en.z);
}