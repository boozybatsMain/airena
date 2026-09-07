function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en.alive) return;

  const k = me.kit || {};
  const names = me.skills || [];
  // classify by kind
  let beam = null, dash = null, cone = null;
  for (const n of names) {
    const s = k[n];
    if (!s) continue;
    const kind = s.kind || '';
    if (kind === 'beam' || kind === 'bolt') { if (!beam) beam = n; }
    else if (kind === 'dash' || kind === 'lunge' || kind === 'charge') { if (!dash) dash = n; }
    else if (kind === 'cone' || kind === 'fan' || kind === 'smash') { if (!cone) cone = n; }
  }
  // fallbacks
  if (!beam && !dash && !cone && names.length) beam = names[0];

  const d = en.dist;
  const toEn = V.toward(me, en);

  // facing default
  api.faceAt(en.x, en.z);

  const coneReach = cone ? (k[cone].range || 3.4) + en.radius : 0;
  const dashReach = dash ? (k[dash].distance || 8) + 3 : 0;
  const beamReach = beam ? (k[beam].range || 24) + 1.7 + en.radius : 0;

  const ang = Math.abs(V.angleTo(me.heading, toEn));

  // dodge: if enemy casting a dash toward us, sidestep
  let dodging = false;
  if (en.casting && en.casting.telegraph) {
    const sk = en.kit ? en.kit[en.casting.skill] : null;
    if (sk && (sk.kind === 'dash' || sk.kind === 'lunge') && d < 12) {
      const per = V.perp(toEn);
      api.move(per.x, per.z);
      dodging = true;
    }
  }

  // Attack priority
  if (cone && api.ready(cone) && d <= coneReach - 0.4 && ang < 0.9 && en.visible) {
    api.use(cone, { x: en.x, z: en.z });
    if (!dodging) api.move(toEn.x, toEn.z);
    return;
  }

  if (dash && api.ready(dash) && d > coneReach && d <= dashReach - 1 && en.visible) {
    api.use(dash, { x: en.x, z: en.z });
    return;
  }

  if (beam && api.ready(beam) && en.visible && d <= beamReach - 1 && ang < 0.5) {
    api.use(beam, { x: en.x, z: en.z });
    if (!dodging) {
      const per = V.perp(toEn);
      const s = api.rand() < 0.5 ? 1 : -1;
      api.move(toEn.x * 0.3 + per.x * s * 0.5, toEn.z * 0.3 + per.z * s * 0.5);
    }
    return;
  }

  if (dodging) return;

  // Movement: close to cone range, strafe
  if (!en.visible) {
    api.moveTo(en.x, en.z);
    if (p.tick % 60 === 0) api.say("Where are you hiding?");
    return;
  }

  const strafeSign = (Math.floor(p.t / 1.7) % 2 === 0) ? 1 : -1;
  const per = V.perp(toEn);
  let want;
  if (d > coneReach + 0.5) {
    want = { x: toEn.x + per.x * strafeSign * 0.6, z: toEn.z + per.z * strafeSign * 0.6 };
  } else if (d < coneReach - 1.5) {
    want = { x: -toEn.x * 0.5 + per.x * strafeSign, z: -toEn.z * 0.5 + per.z * strafeSign };
  } else {
    want = { x: per.x * strafeSign, z: per.z * strafeSign };
  }
  // keep off walls
  const nx = me.x + want.x * 3, nz = me.z + want.z * 3;
  const h = p.arena.half - 2;
  if (nx > h || nx < -h || nz > h || nz < -h) {
    want = V.toward(me, { x: 0, z: 0 });
  }
  api.move(want.x, want.z);
}