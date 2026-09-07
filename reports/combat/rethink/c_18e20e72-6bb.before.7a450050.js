function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en.alive) return;
  if (me.stunned || me.busy) return;

  const kit = me.kit || {};
  const names = me.skills || [];
  let cone = null, dashStun = null, dashDmg = null;
  for (const n of names) {
    const k = kit[n];
    if (!k) continue;
    const eff = (k.effects || []).join(',');
    if (k.kind === 'dash' || k.distance) {
      if (eff.indexOf('stun') >= 0) dashStun = n;
      else if (!dashDmg) dashDmg = n;
    } else if (!cone) cone = n;
  }
  if (!cone) cone = names[0];

  const d = en.dist;
  const toE = { x: en.x - me.x, z: en.z - me.z };

  api.faceAt(en.x, en.z);

  const coneReach = cone && kit[cone] ? (kit[cone].range || 3.4) + en.radius : 4.9;
  const dashReach = 10;

  // Melee cone
  if (cone && d < coneReach - 0.4 && api.ready(cone) && en.visible && !en.invulnerable) {
    api.use(cone, { x: en.x, z: en.z });
    api.moveTo(en.x, en.z);
    return;
  }

  // Stun dash when in range
  if (dashStun && d > 3 && d < dashReach && api.ready(dashStun) && en.visible &&
      !en.stunned && !(en.immune || []).includes('act')) {
    api.use(dashStun, { x: en.x, z: en.z });
    return;
  }

  // Damage dash to close / punish
  if (dashDmg && d > 3.5 && d < dashReach && api.ready(dashDmg) && en.visible) {
    api.use(dashDmg, { x: en.x, z: en.z });
    return;
  }

  // Sidestep dodge if they telegraph a dash at us
  if (en.casting && en.casting.telegraph && d < 12) {
    const perp = V.perp(V.norm(toE));
    const s = api.rand() < 0.5 ? 1 : -1;
    const tx = me.x + perp.x * s * 5, tz = me.z + perp.z * s * 5;
    if (Math.abs(tx) < 19 && Math.abs(tz) < 19) {
      api.move(perp.x * s, perp.z * s);
      return;
    }
  }

  api.moveTo(en.x, en.z);
  if (p.tick % 150 === 0) api.say("Come closer.");
}