function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en) return;

  const d = en.dist;
  const toEn = V.toward(me, en);

  // dodge incoming mortars
  let flee = null;
  for (const pr of p.arena.projectiles) {
    if (pr.mine) continue;
    const land = { x: pr.x + pr.vx * pr.left, z: pr.z + pr.vz * pr.left };
    if (V.dist(me, land) < 4.2) {
      flee = V.norm(V.perp(V.sub(land, me)));
    }
  }

  if (me.busy || me.airborne) {
    if (flee) api.move(flee.x, flee.z);
    return;
  }

  api.faceAt(en.x, en.z);

  // k2 lob
  if (api.ready('k2') && d < 17 && d > 3.5) {
    const k = me.kit['k2'];
    const spd = (k && k.speed) || 18;
    const aim = V.lead(me, en, { x: en.vx, z: en.vz }, spd);
    api.use('k2', { x: aim.x, z: aim.z });
    return;
  }

  // k3 dash when close and visible
  if (api.ready('k3') && d < 10.5 && d > 2 && en.visible && !en.airborne) {
    api.use('k3', { x: en.x, z: en.z });
    return;
  }

  // k1 boost for mobility
  if (api.ready('k1') && me.maxSpeed <= 5.9 && (d > 9 || me.hp < en.hp)) {
    api.use('k1');
    return;
  }

  if (flee) { api.move(flee.x, flee.z); return; }

  // positioning: keep mid range, strafe
  const strafe = V.perp(toEn);
  const sign = (Math.floor(p.t * 0.5) % 2 === 0) ? 1 : -1;
  let want;
  if (d > 13) want = V.add(toEn, V.scale(strafe, 0.3 * sign));
  else if (d < 6) want = V.add(V.scale(toEn, -1), V.scale(strafe, 0.8 * sign));
  else want = V.add(V.scale(toEn, 0.15), V.scale(strafe, sign));

  const tgt = { x: me.x + want.x * 6, z: me.z + want.z * 6 };
  const h = 18.5;
  tgt.x = Math.max(-h, Math.min(h, tgt.x));
  tgt.z = Math.max(-h, Math.min(h, tgt.z));
  api.moveTo(tgt.x, tgt.z);
}