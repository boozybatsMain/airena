function think(p, api) {
  const me = p.self;
  const en = p.enemy;
  const t = p.t;
  
  // Constants from my body
  const MY_RADIUS = me.radius;
  const MY_SPEED = me.maxSpeed;
  
  // Skill ranges / properties
  // k1: dash 8m, reach 11.183 between centers
  // k2: cone, reach 4.9 between centers (my radius 1.683, enemy radius 1.5)
  // k3: self heal+shield
  
  // State: tracked via api.remember (persists) and module vars (reset per match)
  if (!state.initialized) {
    state.initialized = true;
    state.lastHealT = -100;
    state.aggressiveMode = false;
    state.kitePhase = true;
  }
  
  // No target or dead -> stand
  if (!en.alive) {
    api.stop();
    return;
  }
  
  const dist = en.dist;
  const dx = en.x - me.x;
  const dz = en.z - me.z;
  const headingToEnemy = Math.atan2(dx, dz);
  const angleDiff = V.angleTo(me.heading, { x: dx, z: dz });
  const absAngle = Math.abs(angleDiff);
  
  // Read live kit info
  const k1 = me.kit.k1;
  const k2 = me.kit.k2;
  const k3 = me.kit.k3;
  
  const k1Ready = api.ready('k1');
  const k2Ready = api.ready('k2');
  const k3Ready = api.ready('k3');
  
  const hpFrac = me.hp / me.maxHp;
  const enHpFrac = en.hp / en.maxHp;
  
  // Enemy casting info
  const enCasting = en.casting;
  const enCastingSkill = enCasting ? enCasting.skill : null;
  const enCastingT = enCasting ? enCasting.telegraph : false;
  
  // Burn consideration - need to win burst war
  const burnOn = p.burn > 0;
  const burnFrac = p.burn;
  
  // === DECISION LOGIC ===
  
  // 1. If I'm being bursted and have no shield, use k3 to survive
  // k3: shield 9 hp for 1.875s, heal 5-15 (15% missing)
  const needShield = me.shield <= 0 && (
    hpFrac < 0.45 || 
    (enCastingSkill === 'k1' && dist < 12) ||
    (enCastingSkill === 'k2' && dist < 5.5)
  );
  
  if (needShield && k3Ready && !me.airborne && !me.stunned && !me.silenced) {
    // Heal+shield when low
    if (hpFrac < 0.5) {
      api.use('k3');
      api.say("Need HP");
      return;
    }
  }
  
  // 2. Counter their wind-ups
  if (enCastingT && enCastingSkill === 'k1' && dist < 11.5) {
    // They're dashing - kite perpendicular and prepare to punish after
    // Their dash travel is 0.4s, so we have time
    // If we can interrupt their dash with our own k1, do it
    if (k1Ready && dist > 4 && dist < 10) {
      // Our dash: 8m, theirs: 8m. Both rooted for 0.9s
      // If we're both dashing, we'd collide mid-dash
      // Better to dodge and punish after they land
      const perpX = -dz;
      const perpZ = dx;
      const len = Math.sqrt(perpX*perpX + perpZ*perpZ);
      if (len > 0) {
        api.move(perpX/len, perpZ/len);
        api.faceAt(en.x, en.z);
      }
      return;
    }
  }
  
  if (enCastingT && enCastingSkill === 'k2' && dist < 5) {
    // Cone attack - strafe perpendicular
    const perpX = -dz;
    const perpZ = dx;
    const len = Math.sqrt(perpX*perpX + perpZ*perpZ);
    if (len > 0) {
      api.move(perpX/len * 1.5, perpZ/len * 1.5);
      api.faceAt(en.x, en.z);
    }
    // Try to interrupt with our k1 if very close
    if (k1Ready && dist < 4.5 && absAngle < 0.5) {
      // We're too close to dash away - dash through them?
      // Actually their k2 is 0.3s windup - tight window
      // Use our k2 to stun them first if we can
      if (k2Ready && dist < 4.9 && absAngle < 0.9) {
        api.use('k2', en.x, en.z);
        return;
      }
    }
    return;
  }
  
  // 3. Use k2 (cone) when enemy is in range
  if (k2Ready && dist < 4.9 && absAngle < 1.0 && !en.airborne) {
    // Cone check - if facing is close enough, fire
    // Cone is 55 deg each side = 110 total, so |angle| < 1.57 needed technically
    // But we want to be sure of hitting
    if (absAngle < 0.8 && api.los(en.x, en.z)) {
      api.use('k2', en.x, en.z);
      api.say("Stun!");
      return;
    }
    // Turn to face them
    api.faceAt(en.x, en.z);
    return;
  }
  
  // 4. Use k1 (dash) when enemy is in range
  // k1: 8m dash, hit if center within 3.183m of path, reach 11.183 max
  if (k1Ready && dist < 11.183 && dist > 3 && !me.airborne && !me.stunned) {
    // Check if facing is roughly toward enemy
    // During dash we can't steer, so we need decent aim before committing
    // Aim with k1 turns us during wind-up
    if (absAngle < 1.2) {
      api.use('k1', en.x, en.z);
      api.say("Charge!");
      return;
    }
    // Turn first
    api.faceAt(en.x, en.z);
    api.move(dx, dz);
    return;
  }
  
  // 5. Positioning - get within range but stay safe
  // Prefer k2 range (4.9m) for stun, then k1 range (11m) for dash
  const IDEAL_DIST = 4.0; // Just inside k2 reach for stun
  
  if (dist > 5.5) {
    // Approach - move toward but kite if they have something ready
    // We don't know their cooldowns, so assume they always do
    const dir = V.toward({x: me.x, z: me.z}, {x: en.x, z: en.z});
    
    // If they're casting k2 or k1, kite
    if (enCastingT && (enCastingSkill === 'k2' || enCastingSkill === 'k1')) {
      // Strafe away perpendicular
      const perpX = -dir.z;
      const perpZ = dir.x;
      api.move(perpX, perpZ);
    } else {
      api.move(dir.x, dir.z);
    }
    api.faceAt(en.x, en.z);
    return;
  }
  
  // 6. Close range combat - circle strafe
  if (dist < 3.5) {
    // Too close - k2 might miss if they're airborne, but kite anyway
    const perpX = -dz;
    const perpZ = dx;
    const len = Math.sqrt(perpX*perpX + perpZ*perpZ);
    if (len > 0) {
      // Circle perpendicular
      api.move(perpX/len, perpZ/len);
    }
    api.faceAt(en.x, en.z);
    return;
  }
  
  // 7. Sweet spot - 3.5-5.5m, ideal k2 range
  // Strafe and wait for k2 cooldown
  const perpX = -dz;
  const perpZ = dx;
  const len = Math.sqrt(perpX*perpX + perpZ*perpZ);
  if (len > 0) {
    // Slow circle
    api.move(perpX/len * 0.5, perpZ/len * 0.5);
  }
  api.faceAt(en.x, en.z);
  
  // Heal when not in immediate danger
  if (k3Ready && hpFrac < 0.7 && !enCastingT && dist > 5) {
    api.use('k3');
    api.say("Recover");
    return;
  }
}

const state = {
  initialized: false,
  lastHealT: -100,
  aggressiveMode: false,
  kitePhase: true
};

// Vector helpers (in case V isn't fully available, but it is per spec)
const V = {
  toward: (a, b) => {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const l = Math.sqrt(dx*dx + dz*dz);
    if (l === 0) return { x: 0, z: 0 };
    return { x: dx/l, z: dz/l };
  },
  angleTo: (heading, dir) => {
    const targetHeading = Math.atan2(dir.x, dir.z);
    let diff = targetHeading - heading;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    return diff;
  }
};