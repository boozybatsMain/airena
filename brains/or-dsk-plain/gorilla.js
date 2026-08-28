// Gorilla mind
// Strengths: smash (close cone, 35 dmg), charge (dash, 30 dmg + stun), jump (hop over attacks)
// Opponent: Octopus with laser (ranged), blink (teleport + invuln), jump

// Strategy: close distance aggressively, use jump to avoid lasers, smash when close
// Use charge to close gaps or punish predictable blinks/lasers

const SMASH_RANGE = 5.15;
const SMASH_DMG = 35;
const CHARGE_DMG = 30;
const CHARGE_SPEED = 15;
const CHARGE_DURATION = 0.8;
const CHARGE_MAX_DIST = CHARGE_SPEED * CHARGE_DURATION; // 12m
const BLINK_RANGE = 7.5;
const LASER_RANGE = 26.85;
const MY_HP = 205;
const ENEMY_HP = 155;
const ARENA_HALF = 20;
const JUMP_DURATION = 0.567;
const CHARGE_COOLDOWN = 4.033;
const SMASH_COOLDOWN = 1.3;
const JUMP_COOLDOWN = 2.8;

// State variables
let currentStrategy = 'approach';
let lastEnemyPos = null;
let lastEnemyHp = ENEMY_HP;
let aggressiveness = 0.8; // how aggressively we close distance
let dodgeDirection = 0;

function think(p, api) {
  const self = p.self;
  const enemy = p.enemy;
  const dist = enemy.dist;
  
  // Update enemy state tracking
  if (enemy.alive) {
    lastEnemyPos = { x: enemy.x, z: enemy.z };
    lastEnemyHp = enemy.hp;
  }
  
  // Process events
  for (const ev of p.events) {
    if (ev.type === 'enemyStarted' && ev.skill === 'laser') {
      // Dodge laser - move perpendicular to enemy facing
      const enemyDir = V.fromHeading(enemy.heading);
      dodgeDirection = (Math.sign(V.perp(enemyDir).x * (self.x - enemy.x) + V.perp(enemyDir).z * (self.z - enemy.z)) > 0) ? 1 : -1;
    }
    if (ev.type === 'enemyStarted' && ev.skill === 'blink') {
      // They might blink behind us, be ready to turn
    }
    if (ev.type === 'enemyStarted' && ev.skill === 'jump') {
      // They're airborne, dodge their landing
    }
  }
  
  // Determine if we're in smash range
  const inSmashRange = dist <= SMASH_RANGE && enemy.airborne === false;
  const inChargeRange = dist <= CHARGE_MAX_DIST && dist > SMASH_RANGE;
  
  // Check if enemy is casting laser (vulnerable to charge interrupt)
  const enemyCastingLaser = enemy.casting && enemy.casting.skill === 'laser' && enemy.casting.phase === 'windup';
  
  // Strategy selection
  if (inSmashRange && api.ready('smash') && !enemy.invulnerable && !enemy.airborne) {
    // Use smash when close
    api.use('smash');
    api.faceAt(enemy.x, enemy.z);
    return;
  }
  
  if (enemyCastingLaser && api.ready('charge') && dist <= CHARGE_MAX_DIST) {
    // Charge to interrupt laser
    const lead = V.lead(self, enemy, {x: enemy.vx, z: enemy.vz}, CHARGE_SPEED);
    api.face(lead.x - self.x, lead.z - self.z);
    api.use('charge');
    return;
  }
  
  if (inChargeRange && api.ready('charge') && !enemy.airborne && !enemy.invulnerable && dist > SMASH_RANGE * 1.5) {
    // Charge to close distance
    const lead = V.lead(self, enemy, {x: enemy.vx, z: enemy.vz}, CHARGE_SPEED);
    api.face(lead.x - self.x, lead.z - self.z);
    api.use('charge');
    return;
  }
  
  // Dodge incoming lasers by jumping
  if (enemy.casting && enemy.casting.skill === 'laser' && enemy.casting.phase === 'windup' && 
      enemy.casting.elapsed > 0.3 && api.ready('jump') && dist < LASER_RANGE) {
    api.use('jump');
    // Move perpendicular while jumping
    const enemyDir = V.fromHeading(enemy.heading);
    const perp = V.perp(enemyDir);
    api.move(perp.x * dodgeDirection, perp.z * dodgeDirection);
    return;
  }
  
  // General movement - close distance aggressively
  const toEnemy = V.toward(self, enemy);
  
  // If enemy is about to laser, dodge
  if (enemy.casting && enemy.casting.skill === 'laser' && dist < LASER_RANGE) {
    const perp = V.perp(toEnemy);
    api.move(perp.x * dodgeDirection, perp.z * dodgeDirection);
    api.faceAt(enemy.x, enemy.z);
    return;
  }
  
  // Default: approach enemy
  if (dist > SMASH_RANGE * 0.8) {
    // Move toward enemy
    api.moveTo(enemy.x, enemy.z);
    api.faceAt(enemy.x, enemy.z);
  } else {
    // Close range, circle slightly
    const circleDir = V.rot(toEnemy, (Math.sin(p.t * 3) * 0.5));
    const targetX = enemy.x + circleDir.x * SMASH_RANGE * 0.6;
    const targetZ = enemy.z + circleDir.z * SMASH_RANGE * 0.6;
    api.moveTo(targetX, targetZ);
    api.faceAt(enemy.x, enemy.z);
  }
  
  // Use jump defensively if laser is possible
  if (api.ready('jump') && !enemy.casting && dist < LASER_RANGE && Math.random() < 0.3) {
    // Sometimes jump preemptively to bait laser
    const perp = V.perp(toEnemy);
    api.move(perp.x * (Math.random() > 0.5 ? 1 : -1), perp.z * (Math.random() > 0.5 ? 1 : -1));
    api.use('jump');
  }
  
  // Track enemy for dodging
  if (enemy.vx !== 0 || enemy.vz !== 0) {
    api.remember('enemyVel', { x: enemy.vx, z: enemy.vz });
  }
}