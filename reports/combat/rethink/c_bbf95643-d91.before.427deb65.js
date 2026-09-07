function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en || !en.alive) return;

  const k = me.kit || {};
  const names = me.skills || [];
  let beamDmg = null, beamBurn = null, boost = null;
  for (const n of names) {
    const s = k[n];
    if (!s) continue;
    const eff = (s.effects || []).join(',');
    if (s.kind === 'self' || s.aim === 'none') { if (!boost) boost = n; continue; }
    if (eff.indexOf('burn') >= 0 || eff.indexOf('fire') >= 0) { if (!beamBurn) beamBurn = n; }
    else if (!beamDmg) beamDmg = n;
  }
  if (!beamDmg) beamDmg = beamBurn;

  const dist = en.dist;
  const vis = en.visible;
  const rng = (n) => (k[n] && k[n].range ? k[n].range : 20) + 1.7 + 0.4 + en.radius;

  // aim lead: beam has no travel, but enemy moves during windup
  const wu = (n) => (k[n] && k[n].windup) || 0.6;
  const aimPoint = (n) => {
    const t = wu(n);
    return { x: en.x + en.vx * t * 0.85, z: en.z + en.vz * t * 0.85 };
  };

  const desired = 12;

  // Movement: strafe-orbit at desired range, keeping LOS
  let mv = null;
  if (!vis) {
    mv = { to: [en.x, en.z] };
  } else {
    const away = V.toward({ x: en.x, z: en.z }, me);
    const per = V.perp(away);
    let side = api.recall('side', 1);
    if (p.tick % 90 === 0) { side = -side; api.remember('side', side); }
    let radial = 0;
    if (dist > desired + 2) radial = -1;
    else if (dist < desired - 2) radial = 1;
    const dir = V.norm(V.add(V.scale(away, radial), V.scale(per, side * 0.9)));
    let tx = me.x + dir.x * 5, tz = me.z + dir.z * 5;
    const lim = 18.5;
    if (tx > lim) tx = lim; if (tx < -lim) tx = -lim;
    if (tz > lim) tz = lim; if (tz < -lim) tz = -lim;
    mv = { dir: [tx - me.x, tz - me.z] };
  }

  // dodge enemy telegraph: sidestep hard
  if (en.casting && en.casting.telegraph && vis) {
    const away = V.toward({ x: en.x, z: en.z }, me);
    const per = V.perp(away);
    const s = api.recall('side', 1);
    const d = V.norm(V.add(V.scale(per, s), V.scale(away, 0.3)));
    mv = { dir: [d.x, d.z] };
  }

  if (mv.to) api.moveTo(mv.to[0], mv.to[1]);
  else api.move(mv.dir[0], mv.dir[1]);

  api.faceAt(en.x, en.z);

  if (me.busy) return;

  // boost when it helps and beams on cooldown-ish
  if (boost && api.ready(boost) && vis && dist > rng(beamDmg || boost) * 0.7 &&
      (!beamDmg || !api.ready(beamDmg))) {
    api.use(boost);
    return;
  }

  const tryBeam = (n) => {
    if (!n || !api.ready(n)) return false;
    if (!vis) return false;
    if (dist > rng(n)) return false;
    api.use(n, aimPoint(n));
    return true;
  };

  if (en.burning) {
    if (tryBeam(beamDmg)) { api.say("Hold still."); return; }
    if (tryBeam(beamBurn)) return;
  } else {
    if (tryBeam(beamBurn)) { api.say("Burn."); return; }
    if (tryBeam(beamDmg)) return;
  }

  if (boost && api.ready(boost) && vis) api.use(boost);
}