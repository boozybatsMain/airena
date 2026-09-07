function think(p, api) {
    const S = api.recall('S', {});
    if (!S.enemyLast) S.enemyLast = {};

    // Update memory when not blinded
    if (!p.self.blinded) {
        const e = p.enemy;
        S.enemyLast = {
            x: e.x, z: e.z, vx: e.vx, vz: e.vz, t: p.t
        };
        api.remember('S', S);
    }

    // Predicted enemy position (account for blind)
    let ex, ez, evx, evz, dist;
    if (p.self.blinded) {
        const dt = p.t - S.enemyLast.t;
        ex = S.enemyLast.x + S.enemyLast.vx * dt;
        ez = S.enemyLast.z + S.enemyLast.vz * dt;
        evx = S.enemyLast.vx;
        evz = S.enemyLast.vz;
        dist = Math.sqrt((ex - p.self.x) ** 2 + (ez - p.self.z) ** 2);
    } else {
        ex = p.enemy.x; ez = p.enemy.z;
        evx = p.enemy.vx; evz = p.enemy.vz;
        dist = p.enemy.dist;
    }

    // Abilities use
    const hpFrac = p.self.hp / p.self.maxHp;

    // Heal and shield (k3)
    if (api.ready('k3') && (hpFrac < 0.55 || p.self.shield < 3)) {
        api.use('k3');
    }

    // Zone (k2) – place on enemy if within range, or at range if closer
    if (api.ready('k2') && dist < 14) {
        api.use('k2', { x: ex, z: ez });
    }

    // Mortar (k1) – aim ahead with simple lead
    if (api.ready('k1') && dist < 16) {
        const travel = dist / 12; // rough flight time
        const leadX = ex + evx * travel;
        const leadZ = ez + evz * travel;
        api.use('k1', { x: leadX, z: leadZ });
    }

    // Movement
    const toEnemy = { x: ex - p.self.x, z: ez - p.self.z };
    const len = Math.sqrt(toEnemy.x * toEnemy.x + toEnemy.z * toEnemy.z) || 1;
    const dir = { x: toEnemy.x / len, z: toEnemy.z / len };

    let moveX = 0, moveZ = 0;

    // Avoid enemy zone on ground
    const zones = p.arena.zones;
    let avoidZone = null;
    for (let i = 0; i < zones.length; i++) {
        if (!zones[i].mine) {
            const dz = { x: zones[i].x - p.self.x, z: zones[i].z - p.self.z };
            const dot = Math.sqrt(dz.x*dz.x + dz.z*dz.z);
            if (dot < zones[i].r + 2) {
                avoidZone = { x: -dz.x/dot, z: -dz.z/dot };
                break;
            }
        }
    }

    // Arena wall avoidance
    const hw = p.arena.half - 2;
    if (p.self.x < -hw) moveX = 1;
    else if (p.self.x > hw) moveX = -1;
    if (p.self.z < -hw) moveZ = 1;
    else if (p.self.z > hw) moveZ = -1;

    // Distance management
    const desired = 14;
    if (dist < 10) {
        moveX += -dir.x;
        moveZ += -dir.z;
    } else if (dist > 18) {
        moveX += dir.x;
        moveZ += dir.z;
    } else {
        // strafe perpendicular
        moveX += -dir.z;
        moveZ += dir.x;
    }

    if (avoidZone) {
        moveX += avoidZone.x * 2;
        moveZ += avoidZone.z * 2;
    }

    // Normalize and apply movement
    const mlen = Math.sqrt(moveX*moveX + moveZ*moveZ) || 1;
    api.move(moveX/mlen, moveZ/mlen);

    // Face enemy
    api.faceAt(ex, ez);

    api.remember('S', S);
}