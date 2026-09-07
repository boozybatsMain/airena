const V_ZERO = { x: 0, z: 0 };

let orbitSide = 1;
let dodgeSide = 1;
let lastSpokeTick = -1000;

function clampArena(x, z) {
  return { x: Math.max(-19, Math.min(19, x)), z: Math.max(-19, Math.min(19, z)) };
}

function say(api, p, text) {
  if (p.t - lastSpokeTick > 4) {
    api.say(text);
    lastSpokeTick = p.t;
  }
}

function think(p, api) {
  const self = p.self;
  const enemy = p.enemy;
  if (!self.alive) return;

  // detect a fresh enemy k1 windup to pick a dodge side
  for (const e of p.events) {
    if (e.type === 'enemyStarted' && e.skill === 'k1') {
      dodgeSide = api.rand() < 0.5 ? 1 : -1;
    }
  }

  const dist = enemy.dist;
  const toEnemy = V.norm(V.sub({ x: enemy.x, z: enemy.z }, { x: self.x, z: self.z }));
  const away = V.scale(toEnemy, -1);

  // default facing: look at the enemy unless a windup lock is holding it
  if (!self.casting) {
    api.faceAt(enemy.x, enemy.z);
  }

  const enemyBeaming = enemy.casting && enemy.casting.telegraph && enemy.casting.skill === 'k1';

  // ---- movement ----
  const desiredRange = 13;
  let moveDir = null;

  if (enemyBeaming) {
    const perp = V.perp(toEnemy);
    moveDir = V.scale(perp, dodgeSide);
  } else {
    orbitSide = Math.sin(p.t * 0.45) >= 0 ? 1 : -1;
    if (dist > desiredRange + 2.5) {
      moveDir = toEnemy;
    } else if (dist < desiredRange - 2.5) {
      moveDir = away;
    } else {
      moveDir = V.scale(V.perp(toEnemy), orbitSide);
    }
  }

  if (moveDir) {
    const target = clampArena(self.x + moveDir.x * 8, self.z + moveDir.z * 8);
    api.moveTo(target.x, target.z);
  }

  // ---- offense ----
  if (!self.busy) {
    const k1 = self.kit.k1;
    const k3 = self.kit.k3;

    if (k1 && api.ready('k1') && enemy.visible && dist <= 23) {
      const wu = k1.windup || 0.5;
      const lead = clampArena(enemy.x + enemy.vx * wu, enemy.z + enemy.vz * wu);
      api.use('k1', lead);
      say(api, p, 'Hold still.');
    } else if (k3 && api.ready('k3') && dist <= 11) {
      const wu = k3.windup || 0.467;
      const lead = clampArena(enemy.x + enemy.vx * wu, enemy.z + enemy.vz * wu);
      api.use('k3', lead);
      say(api, p, 'Burn.');
    } else if (api.ready('k2')) {
      let doBlink = false;
      let pt = null;

      if (self.silenced) {
        doBlink = true;
        pt = clampArena(self.x + away.x * 6.5, self.z + away.z * 6.5);
      } else if (self.burning && self.hp < self.maxHp * 0.6) {
        doBlink = true;
        pt = clampArena(self.x + away.x * 6.5, self.z + away.z * 6.5);
      } else if (self.hp < self.maxHp * 0.3 && dist < 7) {
        doBlink = true;
        pt = clampArena(self.x + away.x * 6.5, self.z + away.z * 6.5);
      } else if (enemyBeaming && dist < 5) {
        doBlink = true;
        const perp = V.perp(toEnemy);
        pt = clampArena(self.x + perp.x * dodgeSide * 6.5, self.z + perp.z * dodgeSide * 6.5);
      }

      if (doBlink && pt) {
        api.use('k2', pt);
      }
    }
  }

  // ---- reactive chatter ----
  for (const e of p.events) {
    if (e.type === 'dealt' && e.amount > 0) {
      say(api, p, 'That landed.');
      break;
    }
    if (e.type === 'evaded') {
      say(api, p, 'Missed me.');
      break;
    }
  }
}