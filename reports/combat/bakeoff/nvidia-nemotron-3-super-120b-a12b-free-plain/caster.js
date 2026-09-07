function think(p, api) {
    const me = p.self;
    const them = p.enemy;
    const dist = me.dist;
    const dx = them.x - me.x;
    const dz = them.z - me.z;
    const angle = Math.atan2(dx, dz);
    const diff = V.angleTo(me.heading, angle);

    api.faceAt(them.x, them.z);

    const canMove = !me.stunned && !me.rooted && !me.airborne && me.alive;
    if (canMove) {
        if (dist > 8) {
            api.move(Math.sin(me.heading) * me.maxSpeed, Math.cos(me.heading) * me.maxSpeed);
        } else {
            api.move(-Math.sin(me.heading) * me.maxSpeed * 0.5, -Math.cos(me.heading) * me.maxSpeed * 0.5);
        }
    }

    const readyK1 = api.ready("k1");
    const readyK2 = api.ready("k2");
    const readyK3 = api.ready("k3");

    if (dist < 6 && readyK3 && !me.casting) {
        api.use("k3");
    } else if (dist > 10 && dist < 14 && readyK1 && !me.casting) {
        api.use("k1", { x: them.x, z: them.z });
    } else if (dist > 8 && dist < 12 && readyK2 && !me.casting) {
        api.use("k2", { x: them.x, z: them.z });
    }

    if (me.hp < me.maxHp * 0.3 && readyK3 && !me.casting) {
        api.use("k3");
    }
}