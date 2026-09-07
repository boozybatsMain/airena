function think(p, api) {
  const me = p.self;
  const en = p.enemy;

  // Always keep facing target or target lead
  const dist = V.dist(me, en);
  const dirToEn = V.toward(me, en);
  const angDiff = Math.abs(V.angleTo(me.heading, dirToEn));

  // Determine skill names mapped to Gorilla's kit
  // Skills list contains: smash, charge, jump
  // smash: cone/close-range (k2 or k1 depending on mapping, let's detect from p.self.skills)
  const skills = me.skills || ['smash', 'charge', 'jump'];
  const chargeName = skills.find(s => s === 'charge' || s === 'k1') || 'charge';
  const smashName = skills.find(s => s === 'smash' || s === 'k2') || 'smash';
  const jumpName = skills.find(s => s === 'jump' || s === 'k3') || 'jump';

  // Check dangerous enemy actions to react
  if (en.casting && en.casting.telegraph) {
    // Enemy winding up laser or zone or charge
    // If we have jump or charge ready, we can reposition or punish
  }

  // Aim towards enemy with slight lead if moving
  const leadPos = V.add(en, V.scale({ x: en.vx || 0, z: en.vz || 0 }, 0.25));
  api.faceAt(leadPos.x, leadPos.z);

  // Tactical logic:
  // 1. In close combat (< 3.2m), smash/cone reduces enemy damage and hurts them.
  // 2. Dash/Charge deals massive 26 damage across 8m. Best when clear line & facing target.
  // 3. Jump/Zone (12m range, 3m radius) applies damage + knockback.

  let usedSkill = false;

  // 1. Smash / Cone if close
  if (!me.busy && api.ready(smashName)) {
    if (dist <= 3.204 && p.enemy.visible && angDiff < 0.656) {
      api.use(smashName);
      api.say('КРУШИТЬ!');
      usedSkill = true;
    }
  }

  // 2. Charge / Dash if medium range, clear straight path and facing enemy
  if (!usedSkill && !me.busy && api.ready(chargeName)) {
    if (dist >= 2.05 && dist <= 6.121 && p.enemy.visible && angDiff < 0.35) {
      const ray = api.ray(dirToEn.x, dirToEn.z, dist);
      if (!ray.hit || ray.dist >= dist - 0.5) {
        api.use(chargeName);
        api.say('ВПЕРЁД!');
        usedSkill = true;
      }
    }
  }

  // 3. Jump / Zone for area denial & ranged punish
  if (!usedSkill && !me.busy && api.ready(jumpName)) {
    if (dist >= 3 && dist <= 10.204 && p.enemy.visible) {
      api.use(jumpName);
      api.say('ПРЫЖОК!');
      usedSkill = true;
    }
  }

  // Movement & Navigation
  // Avoid sitting in enemy ground zones
  let inDangerZone = false;
  if (p.arena && p.arena.zones) {
    for (const z of p.arena.zones) {
      if (!z.mine && V.dist(me, z) < (z.r + me.radius)) {
        inDangerZone = true;
        const escapeDir = V.away(me, z);
        api.move(escapeDir.x, escapeDir.z);
        break;
      }
    }
  }

  if (!inDangerZone) {
    // Aggressively hunt down the Octopus using pathTo around obstacles
    if (!p.enemy.visible || dist > 5) {
      api.moveTo(en.x, en.z);
    } else {
      // Direct raw pursuit when clear line to maximize acceleration and cornering
      const path = api.pathTo(en.x, en.z);
      if (path && path.direct) {
        api.move(dirToEn.x, dirToEn.z);
      } else {
        api.moveTo(en.x, en.z);
      }
    }
  }
}