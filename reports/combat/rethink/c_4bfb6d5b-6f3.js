const K3_MAX_REACH = 4.8;
const K1_MAX_REACH = 19.5;
const K2_MAX_REACH = 17.5;
const K2_MIN_REACH = 2.2;

function think(p, api) {
  try {
    const s = p.self, e = p.enemy;
    if (!s.alive) return;

    const dist = e.dist;
    const los = e.visible;
    const selfPos = { x: s.x, z: s.z };
    const enemyPos = { x: e.x, z: e.z };
    const enemyVel = { x: e.vx, z: e.vz };

    function leadPoint(skillName) {
      const k = s.kit[skillName];
      const spd = (k && k.speed) || 0;
      return V.lead(selfPos, enemyPos, enemyVel, spd);
    }

    let acted = false;

    // Priority 1: melee cone, best dps, cheapest cooldown
    if (!acted && dist <= K3_MAX_REACH && los && api.ready('k3')) {
      api.use('k3', enemyPos);
      acted = true;
    }

    // Priority 2: bolt at range, lead the shot
    if (!acted && dist <= K1_MAX_REACH && los && api.ready('k1')) {
      const pt = leadPoint('k1');
      api.use('k1', pt);
      acted = true;
    }

    // Priority 3: lob, splash, works even without clean los sometimes irrelevant (still needs to be sensible range)
    if (!acted && dist <= K2_MAX_REACH && dist >= K2_MIN_REACH && api.ready('k2')) {
      const pt = leadPoint('k2');
      api.use('k2', pt);
      acted = true;
    }

    // Movement decisions
    const enemyWindupMelee =
      e.casting && e.casting.telegraph && e.casting.skill === 'k3';

    if (enemyWindupMelee && dist < 5.5) {
      // back off from an incoming cone
      const away = V.toward(enemyPos, selfPos);
      api.move(away.x, away.z);
    } else if (dist > 4.3) {
      // close the distance toward melee range
      api.moveTo(e.x, e.z);
    } else if (dist < 2.3) {
      // too tight, ease off a touch to stay inside our own cone reliably
      const away = V.toward(enemyPos, selfPos);
      api.move(away.x * 0.6, away.z * 0.6);
    } else {
      // hold at brawling range, orbit a bit so we are not a stationary target
      const outward = V.toward(enemyPos, selfPos);
      const perp = V.perp(outward);
      const flip = Math.floor(p.t * 0.6) % 2 === 0 ? 1 : -1;
      api.move(perp.x * flip, perp.z * flip);
    }

    // Keep facing the enemy whenever nothing is locking our aim
    if (!s.casting) {
      api.faceAt(e.x, e.z);
    }
  } catch (err) {
    // never let a bad thought end the fight
  }
}