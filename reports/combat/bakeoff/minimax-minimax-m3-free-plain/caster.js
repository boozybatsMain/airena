function think(p, api) {
  const me = p.self;
  const en = p.enemy;
  const dt = p.dt;

  // --- State / memory (per-match, persisted) ---
  const S = api.recall('state', null);
  if (!S) {
    api.remember('state', {
      phase: 'open',
      lastHp: me.hp,
      lastEnemyHp: en.hp,
      k1Tried: 0,
      k2Tried: 0,
      k3Tried: 0,
      lastCast: 0,
      planUntil: 0,
      kiteDir: { x: 1, z: 0 },
      dodgeUntil: 0,
      lastEnemyCasting: '',
      retreatUntil: 0,
      chaseUntil: 0,
      engageRange: 10,
      retreatRange: 5,
      seenEnemyCast: ''
    });
    return planAndAct(p, api);
  }

  // --- Read live kit ---
  const k1 = me.kit.k1, k2 = me.kit.k2, k3 = me.kit.k3;

  // --- Conditions / priorities ---
  const lowHp = me.hp / me.maxHp < 0.45;
  const veryLowHp = me.hp / me.maxHp < 0.22;
  const enVisible = en.visible;
  const enCasting = en.casting ? en.casting.skill : null;
  const enBusy = !!en.casting;
  const enDist = en.dist;

  // Detect enemy started something new
  if (enCasting && S.seenEnemyCast !== enCasting) {
    S.seenEnemyCast = enCasting;
  }
  if (!enCasting) S.seenEnemyCast = '';

  // --- Self preservation: heal when safe and missing hp ---
  const k3Ready = api.ready('k3');
  const k1Ready = api.ready('k1');
  const k2Ready = api.ready('k2');

  // If we are blind, our k3 is still fine. If stunned, we cannot cast. Use events to detect.
  const gotDamaged = p.events.some(e => e.type === 'damaged');
  const gotBurned = p.events.some(e => e.type === 'burning');

  // Heuristic: if low hp and not busy, shield+heal up
  if (k3Ready && me.hp < me.maxHp - 10 && !me.busy) {
    // If enemy is far (>=9) and not casting, take the heal safely
    if ((enDist >= 9 || !enVisible) || lowHp) {
      // don't waste it if we are basically full
      const missing = me.maxHp - me.hp;
      if (missing >= 8 || (gotDamaged && me.hp < me.maxHp - 6)) {
        api.use('k3');
        S.lastCast = p.t;
        S.k3Tried++;
        // hold position while healing? No — keep kiting.
        return;
      }
    }
  }

  // --- If enemy started an ability we should respect ---
  // Enemy k1 (lob 15 dmg) — try to dodge by strafing perpendicular
  // Enemy k2 (zone root+burn) — don't walk into it; if close, back off
  if (enCasting === 'k1' && enDist < 14) {
    // Dodge perpendicular to enemy
    const dx = me.x - en.x, dz = me.z - en.z;
    const len = Math.hypot(dx, dz) || 1;
    const px = -dz / len, pz = dx / len; // perpendicular
    api.move(px * 6, pz * 6);
    api.faceAt(en.x, en.z);
    S.dodgeUntil = p.t + 0.6;
    return;
  }
  if (enCasting === 'k2') {
    // Stay out — if close, back off; if far, hold.
    if (enDist < 8) {
      api.move(me.x - en.x, me.z - en.z);
      api.faceAt(en.x, en.z);
      return;
    }
    // else just strafe
  }

  // --- Arena zoning: avoid their disc ---
  let avoidZones = [];
  for (const z of p.arena.zones) {
    if (!z.mine) {
      const d = Math.hypot(z.x - me.x, z.z - me.z);
      if (d < z.r + 2.5) avoidZones.push(z);
    }
  }
  if (avoidZones.length) {
    // Steer away from nearest enemy zone
    let best = avoidZones[0];
    let bd = Math.hypot(best.x - me.x, best.z - me.z);
    for (const z of avoidZones) {
      const d = Math.hypot(z.x - me.x, z.z - me.z);
      if (d < bd) { bd = d; best = z; }
    }
    const dx = me.x - best.x, dz = me.z - best.z;
    const len = Math.hypot(dx, dz) || 1;
    api.move(dx / len * 6, dz / len * 6);
    api.faceAt(en.x, en.z);
    return;
  }

  // --- Block occlusion: route around ---
  // Prefer direct fight only when range & LOS are good.
  const targetX = en.x, targetZ = en.z;
  const wantFight = enDist >= 4.5 && enDist <= 13 && enVisible && !me.busy;

  // --- Kiting: maintain ~9–11 m, lead with k1 lob ---
  if (wantFight) {
    // Movement: strafe while orbiting to keep distance
    const dx = me.x - en.x, dz = me.z - en.z;
    const len = Math.hypot(dx, dz) || 1;
    let mx = -dx / len, mz = -dz / len; // away
    if (enDist < 8) { mx = -dx / len; mz = -dz / len; }
    else if (enDist > 12) { mx = dx / len; mz = dz / len; } // close gap
    // Add perpendicular strafe for unpredictability
    const px = -dz / len, pz = dx / len;
    const strafeSign = (Math.floor(p.t * 2) % 2 === 0) ? 1 : -1;
    // Mix perpendicular in if at medium range
    let blend = 0;
    if (enDist > 7 && enDist < 12) blend = 0.5;
    const fx = mx * (1 - blend) + px * strafeSign * blend;
    const fz = mz * (1 - blend) + pz * strafeSign * blend;
    const flen = Math.hypot(fx, fz) || 1;
    api.move(fx / flen * 6, fz / flen * 6);

    // Face enemy
    api.faceAt(en.x, en.z);

    // Fire k1 lob with lead
    if (k1Ready && enDist >= 4 && enDist <= 15) {
      const kit = me.kit.k1;
      const sp = kit.speed || 12;
      const lead = V.lead({ x: me.x, z: me.z }, { x: en.x, z: en.z }, { x: en.vx, z: en.vz }, sp);
      // Clamp into arena [-18,18] margin
      lead.x = Math.max(-18, Math.min(18, lead.x));
      lead.z = Math.max(-18, Math.min(18, lead.z));
      // Don't aim point-blank (will be clamped to 3.24 anyway)
      api.use('k1', lead);
      S.k1Tried++;
      S.lastCast = p.t;
      return;
    }

    // If k1 not ready, drop a k2 zone if enemy likely to walk through it
    if (k2Ready && enDist >= 4 && enDist <= 11 && !p.arena.zones.some(z => z.mine)) {
      // Place zone slightly behind enemy along their velocity
      const ex = en.x + en.vx * 0.4;
      const ez = en.z + en.vz * 0.4;
      // clamp to range 12
      const dx2 = ex - me.x, dz2 = ez - me.z;
      const d2 = Math.hypot(dx2, dz2);
      let tx = ex, tz = ez;
      if (d2 > 12) {
        tx = me.x + dx2 / d2 * 12;
        tz = me.z + dz2 / d2 * 12;
      }
      // clamp inside arena margin
      tx = Math.max(-18, Math.min(18, tx));
      tz = Math.max(-18, Math.min(18, tz));
      api.use('k2', { x: tx, z: tz });
      S.k2Tried++;
      S.lastCast = p.t;
      return;
    }
    return;
  }

  // --- Default: reposition toward enemy ---
  if (enDist > 12) {
    api.moveTo(en.x, en.z);
    api.faceAt(en.x, en.z);
    return;
  }
  if (enDist < 4) {
    // Too close — back off
    api.move(me.x - en.x, me.z - en.z);
    api.faceAt(en.x, en.z);
    return;
  }
  // Mid range without fight-ready (e.g. no LOS): sidestep and face
  api.faceAt(en.x, en.z);
  api.move(0, 0);
}

function planAndAct(p, api) {
  // First call — bootstrap. Just face enemy and move to engage.
  const me = p.self, en = p.enemy;
  api.faceAt(en.x, en.z);
  if (en.dist > 10) {
    api.moveTo(en.x, en.z);
  } else if (en.dist < 5) {
    api.move(me.x - en.x, me.z - en.z);
  } else {
    api.move(0, 0);
  }
}