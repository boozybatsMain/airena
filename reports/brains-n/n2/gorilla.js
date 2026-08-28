function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive) return;

  const dist = en.dist;
  const toEnemy = V.toward(me, en);

  // ---- event bookkeeping ----
  for (const e of p.events) {
    if (e.type === 'enemyStarted' && e.skill === 'laser') {
      lastLaserStart = p.t;
    }
    if (e.type === 'enemyStarted' && e.skill === 'blink') lastBlink = p.t;
    if (e.type === 'blocked') lastBlocked = p.t;
    if (e.type === 'damaged') lastDamaged = p.t;
  }

  // ---- always face the enemy unless committed otherwise ----
  const canAct = !me.busy && !me.stunned && !me.airborne;

  // Predict enemy position slightly ahead
  const lead = { x: en.x + en.vx * 0.12, z: en.z + en.vz * 0.12 };

  // ---------- SMASH ----------
  // Effective smash reach centre-to-centre: 2.9 + my radius + their radius = 5.15
  // Order it early so it lands when they are within reach.
  const smashReach = 2.9 + me.radius + en.radius;
  if (canAct && api.ready('smash')) {
    // where will they be in 0.3s (windup)?
    const px = en.x + en.vx * 0.3, pz = en.z + en.vz * 0.3;
    const pd = Math.hypot(px - me.x, pz - me.z);
    // Don't smash if they're airborne now and likely still airborne
    const theyAir = en.airborne;
    const airSoon = theyAir && !(en.casting && en.casting.skill === 'jump' && en.casting.remaining < 0.25);
    if (pd < smashReach - 0.15 && !airSoon && !en.invulnerable) {
      api.use('smash');
      api.faceAt(px, pz);
      // keep pressing in
      api.move(px - me.x, pz - me.z);
      return;
    }
  }

  // If currently winding up smash, keep facing them (turn is allowed).
  if (me.casting && me.casting.skill === 'smash') {
    const px = en.x + en.vx * me.casting.remaining;
    const pz = en.z + en.vz * me.casting.remaining;
    api.faceAt(px, pz);
    api.move(px - me.x, pz - me.z);
    return;
  }

  // ---------- CHARGE ----------
  // Charge is the closer: 12m of travel at 15 m/s, 30 damage + stun.
  // Best used when they are 4..11m away, visible, and roughly in front.
  if (canAct && api.ready('charge') && en.visible) {
    const goodRange = dist > 3.4 && dist < 11.5;
    // predicted position at end of windup + travel time
    const travel = Math.max(0, (dist - me.radius - en.radius) / 15);
    const tt = 0.3 + travel;
    const px = en.x + en.vx * tt * 0.6, pz = en.z + en.vz * tt * 0.6;
    const dirAng = Math.abs(V.angleTo(me.heading, V.toward(me, { x: px, z: pz })));
    // only if we can turn into it during windup (0.3s * 4 * 0.85 = 1.02 rad)
    if (goodRange && dirAng < 1.0 && !en.invulnerable) {
      api.use('charge');
      api.faceAt(px, pz);
      api.move(px - me.x, pz - me.z);
      chargeAimX = px; chargeAimZ = pz;
      return;
    }
  }

  if (me.casting && me.casting.skill === 'charge') {
    if (me.casting.phase === 'windup') {
      const tt = me.casting.remaining + Math.max(0, (dist - 2) / 15);
      const px = en.x + en.vx * tt * 0.6, pz = en.z + en.vz * tt * 0.6;
      api.faceAt(px, pz);
      api.move(px - me.x, pz - me.z);
    }
    return;
  }

  // ---------- DODGING THE LASER ----------
  // Laser cast 0.667s; if they are casting, break line of sight or strafe hard.
  let dodging = false;
  if (en.casting && en.casting.skill === 'laser' && en.casting.telegraph) {
    const rem = en.casting.remaining;
    // Strafe perpendicular to their aim. Their turn rate while casting is 6*0.35=2.1 rad/s
    // We need lateral offset > ~1.65m relative to the beam line.
    const perp = V.perp(V.fromHeading(en.heading));
    // choose the side we're already drifting toward / that has room
    const rel = V.sub(me, en);
    const side = V.dot(perp, rel) >= 0 ? 1 : -1;
    let dir = V.scale(perp, side);
    // also back away a bit if very close is not needed; move mostly lateral
    const cand = { x: me.x + dir.x * 3, z: me.z + dir.z * 3 };
    if (Math.abs(cand.x) > 19 || Math.abs(cand.z) > 19) dir = V.scale(dir, -1);

    // If a jump would dodge... it doesn't (laser ignores height). So strafe.
    if (rem < 0.5 && dist > 3) {
      api.move(dir.x, dir.z);
      api.faceAt(en.x, en.z);
      dodging = true;
    }
  }

  if (dodging) return;

  // ---------- APPROACH ----------
  // Gorilla wins in melee. Close distance relentlessly, using cover when far.
  api.faceAt(lead.x, lead.z);

  if (dist > 2.0) {
    // Use pathTo to route around blocks
    const tx = en.x, tz = en.z;
    if (api.los(tx, tz)) {
      // direct approach, with slight juke to make lasers harder
      const jitter = Math.sin(p.t * 3.3) * 0.45;
      const d = V.toward(me, { x: tx, z: tz });
      const perp = V.perp(d);
      api.move(d.x + perp.x * jitter, d.z + perp.z * jitter);
    } else {
      api.moveTo(tx, tz);
    }
  } else {
    // In their face: circle slightly to stay behind/beside, keep contact
    const d = toEnemy;
    const perp = V.perp(d);
    api.move(d.x * 0.6 + perp.x * 0.8, d.z * 0.6 + perp.z * 0.8);
  }
}

let lastLaserStart = -99;
let lastBlink = -99;
let lastBlocked = -99;
let lastDamaged = -99;
let chargeAimX = 0, chargeAimZ = 0;
