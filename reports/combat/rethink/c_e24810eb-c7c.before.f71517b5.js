function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en.alive) return;

  const kit = me.kit || {};
  const names = me.skills || [];
  let beam = null, boost = null, blink = null;
  for (const n of names) {
    const k = kit[n];
    if (!k) continue;
    const kind = k.kind || '';
    if (kind === 'beam' || (k.range && k.aim === 'facing' && !beam)) beam = n;
    else if (kind === 'blink' || k.distance) blink = n;
    else if (k.aim === 'none') boost = n;
  }
  if (!beam && names.length) {
    for (const n of names) { const k = kit[n]; if (k && k.range) { beam = n; break; } }
  }

  const dist = en.dist;
  const beamK = beam ? kit[beam] : null;
  const beamReach = beamK ? (beamK.range || 20) + 1.7 + 0.4 + en.radius : 0;

  // face enemy generally
  api.faceAt(en.x, en.z);

  // Boost before firing
  if (boost && api.ready(boost) && en.visible && dist < beamReach + 4 &&
      (!beam || api.cooldown(beam) < 1.0)) {
    api.use(boost);
    api.say("Charging up.");
    return;
  }

  // Beam when in reach and visible
  if (beam && api.ready(beam) && en.visible && dist < beamReach - 1) {
    api.use(beam, { x: en.x + en.vx * 0.7, z: en.z + en.vz * 0.7 });
    api.say("Line up. Burn.");
    return;
  }

  // Defensive/offensive blink
  if (blink && api.ready(blink)) {
    const bk = kit[blink];
    const d = bk.distance || 6;
    const incoming = en.casting && en.casting.telegraph;
    if (incoming && en.visible && dist < 26) {
      // sidestep out of beam line
      const per = V.perp(V.toward(me, en));
      const sgn = api.rand() < 0.5 ? 1 : -1;
      api.use(blink, { x: me.x + per.x * d * sgn, z: me.z + per.z * d * sgn });
      api.say("Not there.");
      return;
    }
    if (me.hp < me.maxHp * 0.5 && dist < 8) {
      const a = V.away(me, en);
      api.use(blink, { x: me.x + a.x * d, z: me.z + a.z * d });
      return;
    }
    if (!en.visible && dist > 14) {
      const t = V.toward(me, en);
      api.use(blink, { x: me.x + t.x * d, z: me.z + t.z * d });
      return;
    }
  }

  // Movement: keep mid range, kite, get LOS
  const t = V.toward(me, en);
  const per = V.perp(t);
  let strafe = api.recall('strafe', 1);
  if (p.tick % 60 === 0) { strafe = api.rand() < 0.5 ? 1 : -1; api.remember('strafe', strafe); }

  const ideal = Math.min(beamReach - 4, 16);
  if (!en.visible) {
    api.moveTo(en.x, en.z);
  } else if (dist > ideal + 2) {
    api.move(t.x * 0.9 + per.x * strafe * 0.4, t.z * 0.9 + per.z * strafe * 0.4);
  } else if (dist < ideal - 4) {
    api.move(-t.x * 0.8 + per.x * strafe * 0.6, -t.z * 0.8 + per.z * strafe * 0.6);
  } else {
    api.move(per.x * strafe, per.z * strafe);
  }

  // wall guard
  const nx = me.x + me.vx * 0.5, nz = me.z + me.vz * 0.5;
  if (Math.abs(nx) > 18.5 || Math.abs(nz) > 18.5) {
    api.remember('strafe', -strafe);
    api.moveTo(en.x * 0.3, en.z * 0.3);
  }
}