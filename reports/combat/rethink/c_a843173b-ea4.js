const DESIRED_RANGE = 3.0;
const ORBIT_SPEED = 0.9; // rad/s
const HALF = 20;

let orbitDir = null;
let sayIdx = 0;
const taunts = [
  "Hold still.",
  "That's going to leave a mark.",
  "Too slow.",
  "Feel that?",
  "You're mine.",
];

function clamp(v, lo, hi) {
  return v < lo ? lo : (v > hi ? hi : v);
}

function think(p, api) {
  const self = p.self, enemy = p.enemy;
  if (!self.alive) return;

  if (orbitDir === null) {
    orbitDir = api.rand() < 0.5 ? -1 : 1;
  }

  const d = enemy.dist;
  const los = enemy.visible;

  // Keep facing the enemy whenever we're free to
  if (!self.casting) {
    api.faceAt(enemy.x, enemy.z);
  }

  // Attack priority: biggest dps-per-cooldown first, at appropriate range
  if (!self.busy) {
    if (d <= 4.7 && los && api.ready('k3')) {
      api.use('k3', { x: enemy.x, z: enemy.z });
      sayIdx = (sayIdx + 1) % taunts.length;
      api.say(taunts[sayIdx]);
    } else if (d <= 10.3 && api.ready('k2')) {
      api.use('k2', { x: enemy.x, z: enemy.z });
    } else if (d <= 23.0 && los && api.ready('k1')) {
      api.use('k1', { x: enemy.x, z: enemy.z });
    }
  }

  // Movement: close in when far, orbit at close range to stay in k3 window
  let tx, tz;
  if (d > 12) {
    tx = enemy.x;
    tz = enemy.z;
  } else {
    const theta = orbitDir * ORBIT_SPEED * p.t;
    const dir = V.fromHeading(theta);
    tx = enemy.x + dir.x * DESIRED_RANGE;
    tz = enemy.z + dir.z * DESIRED_RANGE;
  }

  tx = clamp(tx, -HALF + 1, HALF - 1);
  tz = clamp(tz, -HALF + 1, HALF - 1);

  api.moveTo(tx, tz);
}