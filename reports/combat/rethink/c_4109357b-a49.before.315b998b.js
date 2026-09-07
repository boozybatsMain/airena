function think(p, api) {
  const me = p.self, e = p.enemy;
  if (!me.alive || !e || !e.alive) return;

  const kit = me.kit || {};
  const names = me.skills || [];

  // classify skills
  let lob = null, discs = [];
  for (const n of names) {
    const k = kit[n];
    if (!k) continue;
    const kind = (k.kind || '') + '';
    if (kind === 'lob' || k.splash != null) lob = lob || n;
    else if (kind === 'zone' || (k.ticks != null && k.radius != null)) discs.push(n);
    else discs.push(n);
  }

  const dist = e.dist;
  const eVel = { x: e.vx || 0, z: e.vz || 0 };

  // desired range: hover around 8-10m
  const toE = V.toward(me, e);
  const wantMin = 7, wantMax = 10.5;

  // movement: strafe while keeping range, break line if hurt badly
  let mv = null;
  if (!e.visible) {
    api.moveTo(e.x, e.z);
  } else {
    let radial = 0;
    if (dist > wantMax) radial = 1;
    else if (dist < wantMin) radial = -1;
    const side = (Math.floor(p.t / 2.5) % 2 === 0) ? 1 : -1;
    const perp = V.perp(toE);
    mv = V.add(V.scale(toE, radial * 1.0), V.scale(perp, side * 0.9));
    let nx = me.x + mv.x * 3, nz = me.z + mv.z * 3;
    const lim = 18.5;
    if (nx > lim || nx < -lim || nz > lim || nz < -lim) {
      mv = V.norm(V.sub({ x: 0, z: 0 }, me));
    }
    api.move(mv.x, mv.z);
  }

  api.faceAt(e.x, e.z);

  if (me.busy || me.stunned || me.silenced) return;

  // lead prediction
  const predict = (t) => ({ x: e.x + eVel.x * t, z: e.z + eVel.z * t });

  // lob first: biggest burst
  if (lob && api.ready(lob)) {
    const k = kit[lob];
    const wu = k.windup != null ? k.windup : 0.5;
    const sp = k.speed || 12;
    const p1 = predict(wu);
    const flight = V.dist(me, p1) / sp;
    const aim = predict(wu + flight * 0.9);
    const d = V.dist(me, aim);
    const rng = k.range || 15;
    if (d <= rng + 1.0 && d >= 2.0) {
      const cl = Math.min(d, rng - 0.2);
      const dir = V.norm(V.sub(aim, me));
      api.use(lob, { x: me.x + dir.x * cl, z: me.z + dir.z * cl });
      api.say("Fall down.");
      return;
    }
  }

  // discs: place where they're heading
  for (const n of discs) {
    if (!api.ready(n)) continue;
    const k = kit[n];
    const wu = k.windup != null ? k.windup : 0.467;
    const rng = k.range || 12;
    const aim = predict(wu + 0.25);
    let d = V.dist(me, aim);
    if (d > rng) {
      const dir = V.norm(V.sub(aim, me));
      aim.x = me.x + dir.x * (rng - 0.1);
      aim.z = me.z + dir.z * (rng - 0.1);
      d = rng - 0.1;
    }
    const rad = k.radius || 3;
    if (V.dist(aim, e) <= rad + e.radius + 0.5) {
      api.use(n, aim);
      return;
    }
  }
}