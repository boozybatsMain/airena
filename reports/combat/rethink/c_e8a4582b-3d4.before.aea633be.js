function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en.alive) return;

  const kit = me.kit || {};
  const names = me.skills || [];
  const beam = names.find(n => kit[n] && kit[n].kind === 'beam');
  const bolt = names.find(n => kit[n] && kit[n].kind === 'bolt');
  const blink = names.find(n => kit[n] && (kit[n].kind === 'blink' || kit[n].distance) && kit[n].aim !== 'facing' && kit[n].kind !== 'bolt' && kit[n].kind !== 'beam');

  const d = en.dist;
  const vis = en.visible;

  // dodge incoming bolts
  let threat = null;
  for (const pr of (p.arena.projectiles || [])) {
    if (pr.mine || pr.arc) continue;
    const rel = { x: me.x - pr.x, z: me.z - pr.z };
    const v = { x: pr.vx, z: pr.vz };
    const vl = V.len(v) || 1;
    const t = V.dot(rel, V.scale(v, 1 / vl)) / vl;
    if (t < 0 || t > pr.left) continue;
    const cp = { x: pr.x + pr.vx * t, z: pr.z + pr.vz * t };
    if (V.dist(cp, me) < 2.6) { threat = v; break; }
  }

  if (threat) {
    const side = V.perp(V.norm(threat));
    const cand = { x: me.x + side.x * 4, z: me.z + side.z * 4 };
    if (Math.abs(cand.x) > 18 || Math.abs(cand.z) > 18) api.move(-side.x, -side.z);
    else api.move(side.x, side.z);
    if (blink && api.ready(blink)) { api.use(blink, side.x, side.z); api.say("Not today."); }
  }

  // aim point: lead for bolt
  const aimBolt = bolt && kit[bolt].speed
    ? V.lead(me, en, { x: en.vx, z: en.vz }, kit[bolt].speed)
    : { x: en.x, z: en.z };

  api.faceAt(en.x, en.z);

  const beamReach = beam ? (kit[beam].range || 20) + 3 : 0;
  const boltReach = bolt ? (kit[bolt].range || 16) + 3 : 0;

  let acted = false;
  if (!me.busy && vis) {
    if (beam && d < beamReach - 1 && api.ready(beam)) {
      api.use(beam, { x: en.x + en.vx * 0.7, z: en.z + en.vz * 0.7 });
      acted = true;
    } else if (bolt && d < boltReach - 1 && api.ready(bolt)) {
      api.use(bolt, aimBolt);
      acted = true;
    }
  }
  if (acted) api.say("Line up. Fire.");

  // movement: keep mid range, strafe
  if (!threat) {
    if (!vis) {
      api.moveTo(en.x, en.z);
    } else {
      const want = Math.min(beamReach, 14) * 0.65 + 2;
      const to = V.toward(me, en);
      const per = V.perp(to);
      const s = ((Math.floor(p.t / 2.2) % 2) === 0) ? 1 : -1;
      let dir;
      if (d > want + 2) dir = V.add(to, V.scale(per, 0.5 * s));
      else if (d < want - 2) dir = V.add(V.scale(to, -1), V.scale(per, 0.5 * s));
      else dir = V.scale(per, s);
      // wall avoidance
      const nx = me.x + dir.x * 4, nz = me.z + dir.z * 4;
      if (Math.abs(nx) > 17 || Math.abs(nz) > 17) dir = V.toward(me, { x: 0, z: 0 });
      api.move(dir.x, dir.z);
    }
  }

  // escape blink if hurt and enemy casting beam
  if (blink && api.ready(blink) && !threat && me.hp < en.hp - 30 && en.casting && en.casting.telegraph && d < 20) {
    const away = V.away(me, en);
    api.use(blink, away.x, away.z);
  }
}