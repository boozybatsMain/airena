let strafeDir = 1;
let lastFlip = -10;

function think(p, api) {
  const self = p.self, enemy = p.enemy;
  if (!self.alive) return;

  if (p.t < 1.5) api.say("Let's dance.");

  const selfPos = { x: self.x, z: self.z };
  const enemyPos = { x: enemy.x, z: enemy.z };
  const dist = enemy.dist;

  if (p.t - lastFlip > 2.2 + api.rand() * 2.2) {
    strafeDir *= -1;
    lastFlip = p.t;
  }

  const desiredRange = 15.5;
  const radial = V.norm(V.sub(enemyPos, selfPos));
  const tangent = V.scale(V.perp(radial), strafeDir);
  const rangeError = dist - desiredRange;
  const radialComp = V.scale(radial, Math.max(-1, Math.min(1, rangeError / 5)));
  let moveVec = V.add(tangent, radialComp);
  if (V.len(moveVec) < 0.05) moveVec = radial.x || radial.z ? radial : { x: 0, z: 1 };

  const lookDir = V.norm(moveVec);
  const target = V.add(selfPos, V.scale(lookDir, 4));
  const cx = Math.max(-19, Math.min(19, target.x));
  const cz = Math.max(-19, Math.min(19, target.z));
  api.moveTo(cx, cz);

  const enemyTelegraph = enemy.casting && enemy.casting.telegraph && enemy.casting.phase === 'windup';

  let actionTaken = false;

  if (!actionTaken && self.kit.k1 && api.ready('k1') && dist <= 25 && enemy.visible) {
    const w = self.kit.k1.windup || 0.5;
    const aim = { x: enemy.x + enemy.vx * w, z: enemy.z + enemy.vz * w };
    api.use('k1', aim);
    actionTaken = true;
  }

  if (!actionTaken && self.kit.k3 && api.ready('k3') && dist <= 20 && enemy.visible) {
    const w = self.kit.k3.windup || 0.367;
    const speed = self.kit.k3.speed || 22;
    const heading = self.heading;
    const muzzle = { x: self.x + Math.sin(heading) * 1.8, z: self.z + Math.cos(heading) * 1.8 };
    const strikePos = { x: enemy.x + enemy.vx * w, z: enemy.z + enemy.vz * w };
    const lead = V.lead(muzzle, strikePos, { x: enemy.vx, z: enemy.vz }, speed);
    api.use('k3', lead);
    actionTaken = true;
  }

  if (!actionTaken && enemyTelegraph && api.ready('k2') && !self.busy && !self.stunned) {
    const away = V.scale(V.perp(radial), strafeDir);
    let tx = self.x + away.x * 6.5;
    let tz = self.z + away.z * 6.5;
    tx = Math.max(-18, Math.min(18, tx));
    tz = Math.max(-18, Math.min(18, tz));
    api.use('k2', { x: tx, z: tz });
    actionTaken = true;
  }

  if (!actionTaken && self.hp < 70 && dist < 9 && api.ready('k2') && !self.busy && !self.stunned) {
    const away = V.away(selfPos, enemyPos);
    let tx = self.x + away.x * 6.5;
    let tz = self.z + away.z * 6.5;
    tx = Math.max(-18, Math.min(18, tx));
    tz = Math.max(-18, Math.min(18, tz));
    api.use('k2', { x: tx, z: tz });
    actionTaken = true;
  }

  if (!actionTaken) {
    api.faceAt(enemy.x, enemy.z);
  }
}