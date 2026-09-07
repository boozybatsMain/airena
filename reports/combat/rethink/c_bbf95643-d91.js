const ORBIT_RADIUS = 9;
const ORBIT_SPEED = 0.9; // rad/s
const DODGE_KICK = 1.3;
const LEAD_T = 0.25;

function think(p, api) {
  const self = p.self, enemy = p.enemy;
  if (!self.alive) return;

  if (!enemy || !enemy.alive) {
    api.move(0, 0);
    return;
  }

  let dir = api.recall('orbitDir', null);
  if (dir === null) {
    dir = api.rand() < 0.5 ? 1 : -1;
    api.remember('orbitDir', dir);
  }

  const px = enemy.x + (enemy.vx || 0) * LEAD_T;
  const pz = enemy.z + (enemy.vz || 0) * LEAD_T;
  api.faceAt(px, pz);

  const dist = enemy.dist;

  let angle = V.heading({ x: self.x - enemy.x, z: self.z - enemy.z });
  angle += dir * ORBIT_SPEED * (p.dt || 0.066);

  const threat = enemy.casting && enemy.casting.telegraph &&
    (enemy.casting.skill === 'k1' || enemy.casting.skill === 'k2');
  if (threat) {
    angle += dir * DODGE_KICK;
  }

  const orbitX = enemy.x + Math.sin(angle) * ORBIT_RADIUS;
  const orbitZ = enemy.z + Math.cos(angle) * ORBIT_RADIUS;
  api.moveTo(orbitX, orbitZ);

  if (!self.busy) {
    const enemyRadius = enemy.radius || 1.5;
    const kit = self.kit || {};

    const canHit = (name) => {
      const k = kit[name];
      if (!k) return false;
      const reach = (k.range || 0) + 1.7 + 0.4 + enemyRadius;
      return dist <= reach && enemy.visible;
    };

    if (self.skills.includes('k1') && api.ready('k1') && canHit('k1')) {
      api.use('k1');
    } else if (self.skills.includes('k2') && api.ready('k2') && canHit('k2')) {
      api.use('k2');
    } else if (self.skills.includes('k3') && api.ready('k3')) {
      api.use('k3');
    } else {
      for (const name of self.skills) {
        if (name === 'k1' || name === 'k2' || name === 'k3') continue;
        if (api.ready(name)) {
          const k = kit[name];
          if (k && k.aim === 'point') {
            api.use(name, { x: px, z: pz });
          } else {
            api.use(name);
          }
          break;
        }
      }
    }
  }

  const lastSay = api.recall('sayTick', -100);
  if (p.t - lastSay > 8) {
    api.say('Hold still, this stings.');
    api.remember('sayTick', p.t);
  }
}