function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive) return;

  const now = p.t;
  const dist = en.dist;
  const toEn = V.toward(me, en);

  // ---- memory of enemy skill starts ----
  for (const ev of p.events) {
    if (ev.type === 'enemyStarted') {
      if (ev.skill === 'charge') { lastChargeStart = now; chargeSeen = true; }
      if (ev.skill === 'smash') lastSmashStart = now;
      if (ev.skill === 'jump') lastJumpStart = now;
    }
    if (ev.type === 'damaged') { lastHurt = now; lastHurtBy = ev.skill; }
    if (ev.type === 'dealt' && ev.skill === 'laser') hits++;
  }

  const chargeCd = chargeSeen ? Math.max(0, 4.033 - (now - lastChargeStart)) : 0;
  const smashCd = lastSmashStart > 0 ? Math.max(0, 1.3 - (now - lastSmashStart)) : 0;

  // ---- danger assessment ----
  const enCast = en.casting;
  const enCharging = enCast && enCast.skill === 'charge';
  const enSmashing = enCast && enCast.skill === 'smash' && enCast.telegraph;

  // predicted charge line
  let chargeDanger = false;
  if (enCharging) {
    const dir = V.fromHeading(en.heading);
    const rel = V.sub(me, en);
    const along = V.dot(rel, dir);
    const perp = Math.abs(rel.x * dir.z - rel.z * dir.x);
    if (along > -1 && along < 14 && perp < 3.2) chargeDanger = true;
  }

  const smashDanger = enSmashing && dist < 6.2;
  const meleeDanger = dist < 6.5;

  // ---- ESCAPE / DEFENCE ----
  // Blink out of a committed charge or an incoming smash.
  if (!me.busy && (chargeDanger || smashDanger)) {
    if (api.ready('blink')) {
      // blink perpendicular to the threat direction, prefer arena centre side
      let dir;
      if (chargeDanger) {
        const cd = V.fromHeading(en.heading);
        let side = V.perp(cd);
        // choose side that leads away from walls
        const a = { x: me.x + side.x * 7, z: me.z + side.z * 7 };
        const b = { x: me.x - side.x * 7, z: me.z - side.z * 7 };
        const sa = Math.max(Math.abs(a.x), Math.abs(a.z));
        const sb = Math.max(Math.abs(b.x), Math.abs(b.z));
        dir = sa <= sb ? side : V.scale(side, -1);
      } else {
        dir = V.away(me, en);
        // bias sideways so we end up with a firing lane
        const s = V.perp(dir);
        dir = V.norm(V.add(dir, V.scale(s, api.rand() < 0.5 ? 0.6 : -0.6)));
      }
      // avoid blinking into a wall corner
      let target = { x: me.x + dir.x * 7.4, z: me.z + dir.z * 7.4 };
      if (Math.abs(target.x) > 18.5 || Math.abs(target.z) > 18.5) {
        dir = V.norm(V.sub({ x: 0, z: 0 }, me));
        if (V.len(dir) < 0.01) dir = V.away(me, en);
      }
      api.use('blink', dir.x, dir.z);
      api.face(toEn.x, toEn.z);
      return;
    }
    if (smashDanger && api.ready('jump') && enCast && enCast.remaining < 0.28) {
      // hop over the ground sweep
      const away = V.away(me, en);
      api.move(away.x, away.z);
      api.use('jump');
      api.face(toEn.x, toEn.z);
      return;
    }
  }

  // If they're winding up a charge and we can't blink, sidestep hard.
  if (enCharging && !me.busy) {
    const cd = V.fromHeading(en.heading);
    let side = V.perp(cd);
    const rel = V.sub(me, en);
    if (rel.x * side.x + rel.z * side.z < 0) side = V.scale(side, -1);
    let dest = { x: me.x + side.x * 5, z: me.z + side.z * 5 };
    dest.x = Math.max(-18.5, Math.min(18.5, dest.x));
    dest.z = Math.max(-18.5, Math.min(18.5, dest.z));
    api.move(side.x, side.z);
    api.face(toEn.x, toEn.z);
    return;
  }

  // ---- If busy casting, keep aiming ----
  if (me.casting && me.casting.skill === 'laser') {
    // lead very slightly: beam is instant, aim at where they'll be at fire time
    const tt = me.casting.remaining || 0;
    const pred = { x: en.x + en.vx * tt * 0.8, z: en.z + en.vz * tt * 0.8 };
    api.faceAt(pred.x, pred.z);
    // keep drifting away from them while casting
    if (dist < 9) {
      const away = V.away(me, en);
      api.move(away.x, away.z);
    } else {
      api.stop();
    }
    return;
  }

  if (me.busy) {
    api.faceAt(en.x, en.z);
    return;
  }

  // ---- Desired range: stay far, out of charge reach (12m dash + 1.25) ----
  const IDEAL = 14.5;
  const canSee = en.visible;

  // ---- Offense: fire laser when we have a clean line and are safe-ish ----
  const laserReady = api.ready('laser');
  const safeToCast = dist > 7.5 && !enCharging && chargeCd > 0.9;
  const facingErr = Math.abs(V.angleTo(me.heading, toEn));

  if (laserReady && canSee && dist < 24 && (safeToCast || dist > 13)) {
    // check muzzle line clear
    if (facingErr < 0.75) {
      api.use('laser');
      api.faceAt(en.x + en.vx * 0.7, en.z + en.vz * 0.7);
      // maintain kiting movement during cast
      const away = V.away(me, en);
      const side = V.perp(away);
      if (dist < IDEAL) api.move(away.x, away.z);
      else api.move(side.x * 0.6 + away.x * 0.2, side.z * 0.6 + away.z * 0.2);
      return;
    }
  }

  // ---- Movement: kite ----
  api.faceAt(en.x, en.z);

  let mv;
  if (!canSee) {
    // reposition to gain line of sight, but keep distance
    const r = api.pathTo(en.x, en.z);
    if (r && r.points && r.points.length) {
      const wp = r.points[0];
      if (r.dist > IDEAL + 4) {
        api.moveTo(wp.x, wp.z);
        return;
      }
    }
    // circle to find an angle
    const side = V.perp(toEn);
    mv = { x: side.x, z: side.z };
  } else if (dist < IDEAL - 2) {
    // back off, with a sideways component so charges miss
    const away = V.away(me, en);
    const side = V.perp(away);
    const s = orbitDir(now, api);
    mv = V.norm(V.add(away, V.scale(side, s * 0.55)));
  } else if (dist > IDEAL + 3) {
    const side = V.perp(toEn);
    const s = orbitDir(now, api);
    mv = V.norm(V.add(toEn, V.scale(side, s * 0.5)));
  } else {
    const side = V.perp(toEn);
    const s = orbitDir(now, api);
    mv = V.scale(side, s);
  }

  // wall avoidance: steer back toward centre if hugging an edge
  const H = p.arena.half - 2.2;
  let corr = { x: 0, z: 0 };
  if (me.x > H) corr.x -= (me.x - H);
  if (me.x < -H) corr.x -= (me.x + H);
  if (me.z > H) corr.z -= (me.z - H);
  if (me.z < -H) corr.z -= (me.z + H);
  if (corr.x || corr.z) mv = V.norm(V.add(mv, V.scale(V.norm(corr), 1.4)));

  // obstacle avoidance: don't jam into a block
  const probe = api.ray(mv.x, mv.z, 2.6);
  if (probe && probe.hit && probe.dist < 2.2) {
    const alt1 = V.rot(mv, 1.1), alt2 = V.rot(mv, -1.1);
    const r1 = api.ray(alt1.x, alt1.z, 3);
    const r2 = api.ray(alt2.x, alt2.z, 3);
    mv = (r1.dist >= r2.dist) ? alt1 : alt2;
  }

  api.move(mv.x, mv.z);
}

let lastChargeStart = -99;
let lastSmashStart = -99;
let lastJumpStart = -99;
let lastHurt = -99;
let lastHurtBy = null;
let chargeSeen = false;
let hits = 0;
let orbitSign = 1;
let orbitFlip = 0;

function orbitDir(now, api) {
  if (now - orbitFlip > 2.2) {
    orbitFlip = now;
    if (api.rand() < 0.45) orbitSign = -orbitSign;
  }
  return orbitSign;
}
