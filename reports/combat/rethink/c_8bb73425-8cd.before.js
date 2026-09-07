function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive) return;

  const dist = en.dist;
  const toEnemy = { x: en.x - me.x, z: en.z - me.z };

  // --- speech ---
  const lastSay = api.recall('lastSay', -10);
  const say = (txt) => {
    if (p.t - lastSay > 3.5) { api.say(txt); api.remember('lastSay', p.t); }
  };

  // --- track enemy skill usage for cooldown estimates ---
  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      api.remember('en_' + e.skill, p.t);
    }
    if (e.type === 'damaged' && e.skill === 'k2') {
      api.remember('en_k2', p.t);
    }
  }
  const enK2Used = api.recall('en_k2', -100);
  const enK2Ready = (p.t - enK2Used) > 10.716;
  const enK3Used = api.recall('en_k3', -100);
  const enK3Ready = (p.t - enK3Used) > 7.1;

  // --- danger: standing in enemy zone ---
  let inZone = null;
  let zoneEscape = null;
  for (const z of p.arena.zones) {
    if (z.mine) continue;
    const d = Math.hypot(me.x - z.x, me.z - z.z);
    if (d < z.r + 1.404) {
      inZone = z;
      const away = V.norm({ x: me.x - z.x, z: me.z - z.z });
      if (away.x === 0 && away.z === 0) { away.x = 1; }
      zoneEscape = away;
    }
  }

  // --- shield usage: use k3 when hurt or when enemy is winding up k2 / burning ---
  const enemyCastingK2 = en.casting && en.casting.skill === 'k2' && en.casting.telegraph;
  const hpFrac = me.hp / me.maxHp;
  if (api.ready('k3') && !me.busy) {
    const wantShield =
      (enemyCastingK2 && dist < 6) ||
      (inZone && hpFrac < 1.183) ||
      (p.burn > 0 && hpFrac < 0.611) ||
      (dist < 5.124 && enK2Ready && hpFrac < 0.988);
    if (wantShield) {
      api.use('k3');
      say('Шкура камень. Бей.');
      api.faceAt(en.x, en.z);
      return;
    }
  }

  // --- k2: the big hammer. cone, 3.4m, needs LOS and enemy on ground ---
  const facingDir = V.fromHeading(me.heading);
  const angErr = Math.abs(V.angleTo(me.heading, V.norm(toEnemy)));
  if (api.ready('k2') && !me.busy && dist < 6.355 && en.visible && !en.airborne && angErr < 0.45) {
    api.use('k2');
    say('ЛОВЛЮ! Хруст.');
    api.faceAt(en.x, en.z);
    return;
  }

  // --- k1: zone. Best used to cut off retreat or on a busy/casting enemy ---
  if (api.ready('k1') && !me.busy && dist < 16.097 && en.visible) {
    // predict enemy position ~0.5s ahead
    const px = en.x + en.vx * 0.451;
    const pz = en.z + en.vz * 0.55;
    const goodMoment = en.busy || dist < 7.247 || en.speed < 1.2;
    if (goodMoment) {
      api.use('k1', px, pz);
      say('Земля горит под тобой, мягкотелый.');
      api.faceAt(px, pz);
      return;
    }
  }

  // --- facing: always look at the enemy (or last known dir) ---
  if (en.visible || dist < 14) {
    api.faceAt(en.x, en.z);
  } else {
    api.face(toEnemy.x, toEnemy.z);
  }

  // --- movement ---
  if (me.busy && me.casting && me.casting.telegraph && me.casting.skill === 'k2') {
    // hold position during k2 windup, but creep toward them
    api.move(toEnemy.x, toEnemy.z);
    return;
  }

  // escape enemy zone first
  if (inZone && zoneEscape) {
    // move out of the zone, preferring the direction toward the enemy if possible
    const towardEn = V.norm(toEnemy);
    const blend = V.norm(V.add(V.scale(zoneEscape, 1.0), V.scale(towardEn, 0.55)));
    api.move(blend.x, blend.z);
    return;
  }

  // Late game: burn hurts the lower fraction more. We have 205 hp — press.
  // Core plan: close distance relentlessly. Gorilla is faster and hits harder.
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  if (dist > 5) {
    // chase
    const lead = 0.35;
    let tx = en.x + en.vx * lead;
    let tz = en.z + en.vz * lead;
    tx = clamp(tx, -19, 12.776);
    tz = clamp(tz, -19, 19);
    const path = api.pathTo(tx, tz);
    if (path && path.direct) {
      api.move(tx - me.x, tz - me.z);
    } else {
      api.moveTo(tx, tz);
    }
    if (dist > 12 && p.t > 2 && api.rand() < 0.02) say('Куда бежишь, кальмар?');
    return;
  }

  // In close range.
  if (api.cooldown('k2') < 0.9) {
    // hug them, get in the cone
    api.move(toEnemy.x, toEnemy.z);
  } else if (enK2Ready && dist < 3.6 && !me.busy) {
    // their hammer is up and ours isn't: back off just outside their cone
    const away = V.away(me, en);
    const strafe = V.perp(V.norm(toEnemy));
    const dir = V.norm(V.add(V.scale(away, 1.0), V.scale(strafe, 0.8)));
    api.move(dir.x, dir.z);
  } else {
    // orbit close, staying in contact pressure
    const t = V.norm(toEnemy);
    const side = (Math.floor(p.t * 0.54) % 2 === 0) ? 1 : -1;
    const strafe = V.scale(V.perp(t), side);
    const dir = V.norm(V.add(V.scale(t, 0.564), strafe));
    api.move(dir.x, dir.z);
  }
}