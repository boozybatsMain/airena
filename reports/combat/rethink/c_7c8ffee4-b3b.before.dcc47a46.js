function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en.alive) return;

  const kit = me.kit || {};
  const names = me.skills || [];
  const find = (kind) => names.find(n => kit[n] && kit[n].kind === kind);

  const lob = find('lob') || names.find(n => kit[n] && kit[n].aim === 'point');
  const dash = find('dash') || find('lunge');
  const leap = find('leap') || find('jump');

  const d = en.dist;
  const toEnemy = V.toward(me, en);

  if (!me.busy && !me.stunned) {
    // dash strike
    if (dash && api.ready(dash) && en.visible && !en.airborne) {
      const reach = (kit[dash].distance || 8) + me.radius + en.radius - 1;
      if (d < reach && d > 2.5) {
        api.faceAt(en.x, en.z);
        api.use(dash, { x: en.x, z: en.z });
        api.say("Closing.");
        return;
      }
    }
    // lob with lead
    if (lob && api.ready(lob) && en.visible) {
      const k = kit[lob];
      const rng = (k.range || 15) + (k.splash || 1.8) + en.radius;
      if (d < rng && d > 3.0) {
        const wind = k.windup || 0.5;
        const spd = k.speed || 12;
        const flight = Math.max(0, (d - 1.8)) / spd;
        const t = wind + flight;
        let ax = en.x + en.vx * t * 0.8;
        let az = en.z + en.vz * t * 0.8;
        const lim = p.arena.half - 1.9;
        ax = Math.max(-lim, Math.min(lim, ax));
        az = Math.max(-lim, Math.min(lim, az));
        api.use(lob, { x: ax, z: az });
        api.say("Sit still.");
        return;
      }
    }
    // boost
    if (leap && api.ready(leap) && (me.maxSpeed <= 6.0) && d > 6) {
      api.use(leap);
      return;
    }
  }

  // movement
  api.faceAt(en.x, en.z);
  const lowHp = me.hp < en.hp - 30;
  let want;
  if (!en.visible) {
    api.moveTo(en.x, en.z);
    return;
  }
  const desired = lowHp ? 12 : 8;
  if (d > desired + 2) want = toEnemy;
  else if (d < desired - 2) want = V.away(me, en);
  else want = V.perp(toEnemy);

  const nx = me.x + want.x * 4, nz = me.z + want.z * 4;
  const lim = p.arena.half - 2.5;
  if (Math.abs(nx) > lim || Math.abs(nz) > lim || !api.los(nx, nz)) {
    want = V.perp(V.scale(want, -1));
  }
  api.move(want.x, want.z);
}