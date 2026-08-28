function think(p, api) {
  const self = p.self;
  const enemy = p.enemy;

  // Constants
  const LASER_RANGE = 26; // max center-to-center for beam to hit, slightly under 26.85
  const SAFE_CHARGE_DIST = 15; // if closer, don't start laser while charge windup
  const SMASH_DODGE_DIST = 5.2; // max smash reach + small margin
  const DESIRED_DIST = 18; // ideal distance from enemy

  // --- Helper functions ---
  function isChargingClose(distThreshold) {
    return enemy.casting && enemy.casting.skill === 'charge' && enemy.dist < distThreshold;
  }

  function canLaser() {
    if (!api.ready('laser')) return false;
    if (self.busy) return false;
    if (!enemy.visible) return false;
    if (enemy.dist > LASER_RANGE) return false;
    // Don't start laser if enemy is charging and within dash reach: they could interrupt
    if (isChargingClose(SAFE_CHARGE_DIST)) return false;
    return true;
  }

  function getChargeDanger() {
    if (!enemy.casting || enemy.casting.skill !== 'charge') return null;
    if (enemy.casting.phase !== 'dash') return null; // only dashing phase is dangerous

    const dashDir = V.fromHeading(enemy.heading);
    const toEnemy = V.sub(self, enemy); // vector from enemy to us
    const dot = V.dot(toEnemy, dashDir);
    // Only danger if we are in front of them and within dash distance
    if (dot <= 0) return null;
    const projDist = dot;
    // dash remaining time * speed gives max distance they'll travel
    const remaining = enemy.casting.remaining;
    const maxTravel = 15 * remaining;
    if (projDist > maxTravel) return null;

    // Perpendicular distance from dash line
    const perp = V.sub(toEnemy, V.scale(dashDir, dot));
    const perpDist = V.len(perp);
    const margin = self.radius + enemy.radius + 0.3; // hit margin
    if (perpDist > margin) return null;

    // We are in danger; provide a dodge direction perpendicular to dash
    const side = V.norm(V.perp(dashDir)); // one side, can be either
    return { side };
  }

  function shouldSmashDodge() {
    if (!enemy.casting || enemy.casting.skill !== 'smash') return false;
    if (enemy.casting.phase !== 'windup') return false;
    if (enemy.dist > SMASH_DODGE_DIST) return false;
    return api.ready('jump') && !self.airborne && !self.busy;
  }

  // --- Process events ---
  // (we might use them for tracking, but for now just rely on current state)

  // --- Decision ---
  // 1. Evade charge if dangerous
  const danger = getChargeDanger();
  if (danger && api.ready('blink') && !self.busy) {
    const side = danger.side;
    // Choose blink direction: move sideways relative to dash, also away from enemy if possible
    // but blink along side is good. We can also combine with away vector?
    // Pure side is fine.
    api.use('blink', side.x, side.z);
    return;
  }

  // If charge danger but blink not ready, try to move sideways quickly
  if (danger) {
    const side = danger.side;
    api.move(self.x + side.x * 10, self.z + side.z * 10); // crude: move sideways
    api.face(enemy.x, enemy.z);
    return;
  }

  // 2. Dodge smash
  if (shouldSmashDodge()) {
    api.use('jump');
    return;
  }

  // 3. Fire laser if possible
  if (canLaser()) {
    // Ensure we are facing them (standing order), then fire
    api.use('laser');
    return;
  }

  // 4. Move to desired distance
  const vecToEnemy = V.sub(self, enemy);
  const curDist = V.len(vecToEnemy);
  if (curDist > 0.1) {
    const dirAway = V.norm(vecToEnemy);
    // desired point: from enemy, along direction away from enemy, at DESIRED_DIST
    const goal = V.add(enemy, V.scale(dirAway, DESIRED_DIST));
    // But maybe that goal is into a wall? api.moveTo will handle pathfinding.
    api.moveTo(goal.x, goal.z);
  }

  // Always face enemy unless we have a specific reason not to
  api.faceAt(enemy.x, enemy.z);
}