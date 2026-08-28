function think(p, api) {
  const self = p.self, enemy = p.enemy;
  if (!self.alive) return;

  const half = p.arena.half - 1.1;

  function clampToArena(pt) {
    return {
      x: Math.max(-half, Math.min(half, pt.x)),
      z: Math.max(-half, Math.min(half, pt.z))
    };
  }

  const dist = enemy.dist;
  const toEnemy = V.toward(self, enemy);
  const awayFromEnemy = V.away(self, enemy);

  // ---- Evasion check ----
  let evading = false;
  if (enemy.casting) {
    const cs = enemy.casting;
    if (cs.skill === 'charge' && (cs.phase === 'windup' || cs.phase === 'dash')) {
      evading = true;
    } else if (cs.skill === 'smash' && cs.phase === 'windup' && dist < 7) {
      evading = true;
    }
  }
  const tooClose = dist < 5.5;

  if (evading || tooClose) {
    api.faceAt(enemy.x, enemy.z);

    if (api.ready('blink')) {
      const perp = V.perp(awayFromEnemy);
      const cand1 = {
        x: self.x + (awayFromEnemy.x * 0.6 + perp.x * 0.8) * 7.5,
        z: self.z + (awayFromEnemy.z * 0.6 + perp.z * 0.8) * 7.5
      };
      const cand2 = {
        x: self.x + (awayFromEnemy.x * 0.6 - perp.x * 0.8) * 7.5,
        z: self.z + (awayFromEnemy.z * 0.6 - perp.z * 0.8) * 7.5
      };
      function score(c) {
        return Math.min(half - Math.abs(c.x), half - Math.abs(c.z));
      }
      let dirx, dirz;
      if (score(cand1) >= score(cand2)) {
        dirx = awayFromEnemy.x * 0.6 + perp.x * 0.8;
        dirz = awayFromEnemy.z * 0.6 + perp.z * 0.8;
      } else {
        dirx = awayFromEnemy.x * 0.6 - perp.x * 0.8;
        dirz = awayFromEnemy.z * 0.6 - perp.z * 0.8;
      }
      api.use('blink', dirx, dirz);
    } else if (api.ready('jump') && dist < 5.5) {
      api.use('jump');
    } else {
      const perp = V.perp(awayFromEnemy);
      const side = ((self.x * perp.x + self.z * perp.z) >= 0) ? -1 : 1;
      api.move(awayFromEnemy.x + perp.x * side, awayFromEnemy.z + perp.z * side);
    }
    return;
  }

  // ---- Normal kiting behaviour ----
  const preferred = 15;

  if (dist > preferred + 2) {
    api.moveTo(enemy.x, enemy.z);
  } else if (dist < preferred - 2) {
    const rp = clampToArena({
      x: self.x + awayFromEnemy.x * 6,
      z: self.z + awayFromEnemy.z * 6
    });
    api.moveTo(rp.x, rp.z);
  } else {
    api.move(0, 0);
  }

  // ---- Aim ----
  let aimPoint = { x: enemy.x, z: enemy.z };
  if (self.casting && self.casting.skill === 'laser') {
    const r = self.casting.remaining;
    aimPoint = { x: enemy.x + enemy.vx * r, z: enemy.z + enemy.vz * r };
  }
  api.faceAt(aimPoint.x, aimPoint.z);

  // ---- Fire laser ----
  const enemyThreat = enemy.casting && (
    enemy.casting.skill === 'charge' ||
    (enemy.casting.skill === 'smash' && dist < 8)
  );

  if (api.ready('laser') && !enemyThreat && enemy.visible && dist <= 25) {
    const angleDiff = Math.abs(V.angleTo(self.heading, toEnemy));
    if (angleDiff < 1.4) {
      api.use('laser');
    }
  }
}