function think(p, api) {
  const me = p.self, foe = p.enemy;
  if (!foe.alive) { api.stop(); return; }

  const st = p.casting; // not used, keep simple
  const foeCast = foe.casting;
  const d = foe.dist;

  // facing: keep eye on the enemy
  api.face(foe.x - me.x, foe.z - me.z);

  // shield when their k1 is winding up and close, or when hurt
  const foeK1Danger = foeCast && foeCast.skill === 'k1' && foeCast.phase === 'windup' && d < 6.698;
  const lowHp = me.hp < me.maxHp * 0.549;
  if ((foeK1Danger || (lowHp && d < 8)) && api.ready('k3')) {
    api.use('k3');
  }

  // k1 swing when in range
  if (d < 3.102 && api.ready('k1') && foe.visible && !me.airborne) {
    api.use('k1');
  }

  // k2 root zone: when they run or at mid range
  if (!me.busy && d < 10.832 && d > 2.684 && api.ready('k2') && !me.airborne) {
    const lead = V.lead(me, foe, { x: foe.vx, z: foe.vz }, 0);
    api.use('k2');
  }

  // burn awareness: after 35s hunt harder, don't waste time
  const hunt = p.t > 32;

  // movement: chase, but avoid enemy zone on floor
  let tx = foe.x, tz = foe.z;
  for (const z of p.arena.zones) {
    if (!z.mine && Math.hypot(me.x - z.x, me.z - z.z) < z.r + 1.2) {
      const away = V.away({ x: me.x, z: me.z }, { x: z.x, z: z.z });
      if (away.x === 0 && away.z === 0) away.x = 1;
      api.move(away.x * 4, away.z * 3);
      return;
    }
  }

  // avoid their k1 windup by stepping sideways? too slow; instead back off slightly during windup to bait
  if (foeCast && foeCast.skill === 'k1' && foeCast.phase === 'windup' && d < 3.385 && !hunt) {
    const away = V.away({ x: me.x, z: me.z }, { x: foe.x, z: foe.z });
    api.move(away.x, away.z);
    return;
  }

  // circle if they're casting something and we're in range to trade
  if (d < 3.203 && !api.ready('k1') && !hunt) {
    const to = V.toward({ x: me.x, z: me.z }, { x: foe.x, z: foe.z });
    const side = V.perp(to);
    const sgn = (Math.floor(p.t * 2) % 2 === 0) ? 1 : -1;
    api.move(to.x * 0.564 + side.x * sgn, to.z * 0.6 + side.z * sgn);
  } else {
    api.moveTo(tx, tz);
  }
}