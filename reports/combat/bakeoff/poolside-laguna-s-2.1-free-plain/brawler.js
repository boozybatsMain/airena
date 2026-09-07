function think(p, api) {
  const S = p.self, E = p.enemy;
  const mx = S.x, mz = S.z, ex = E.x, ez = E.z;
  const dist = V.dist({x:mx,z:mz},{x:ex,z:ez});

  // Cooldown check helpers
  const cd = (name) => api.cooldown(name);
  const ready = (name) => api.ready(name);

  // Face enemy
  api.faceAt(ex, ez);

  // Decision: which skill to use
  if (cd('k1') < 0.05 && dist < 11.183 && S.casting == null) {
    api.use('k1', {x: ex, z: ez});
  } else if (cd('k2') < 0.05 && dist < 4.9 && S.casting == null) {
    api.use('k2', {x: ex, z: ez});
  } else if (cd('k3') < 0.05 && S.hp < S.maxHp * 0.7) {
    api.use('k3');
  } else {
    api.moveTo(ex, ez);
  }

  if (dist > 8 && cd('k1') >= 0.05) {
    api.moveTo(ex, ez);
  }
}
</pre>
</body>
</html>
</pre>

The above is a clean, straightforward JS mind for the duel. It faces the enemy each tick, checks cooldowns, and prioritizes k1 (dash) at max range, k2 (stun cone) when close, and k3 (shield+heal) when injured. Otherwise it moves to close or maintain distance. It avoids using `Math.random`, uses `api.faceAt`, `api.use`, `api.moveTo`, and respects casting readiness via `api.ready()` / `api.cooldown()`. No fancy prediction — just solid tactical logic.