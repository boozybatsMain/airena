function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en.alive) return;

  const k = me.kit || {};
  const names = me.skills || [];
  const find = (pred) => names.find(n => k[n] && pred(k[n]));

  const zone = find(s => s.kind === 'zone' || (s.ticks > 1 && s.radius));
  const lob = find(s => s.kind === 'lob' || s.kind === 'mortar' || s.arc || (s.speed && s.splash));
  const selfBuff = find(s => s.aim === 'none' || s.kind === 'self');

  const dist = en.dist;
  const vis = en.visible;

  // face enemy always
  api.faceAt(en.x, en.z);

  // defensive buff when hurt or enemy casting
  if (selfBuff && api.ready(selfBuff) &&
      (me.hp < me.maxHp * 0.75 || (en.casting && en.casting.telegraph) || dist < 8)) {
    api.use(selfBuff);
  } else if (!me.busy) {
    if (lob && api.ready(lob) && vis) {
      const kk = k[lob];
      const rng = kk.range || 15;
      if (dist <= rng + (kk.splash || 1.8) + en.radius) {
        const wind = kk.windup || 0.5;
        const spd = kk.speed || 12;
        const flight = Math.max(0, dist - 1.8) / spd;
        const lead = wind + flight;
        let tx = en.x + en.vx * lead * 0.65;
        let tz = en.z + en.vz * lead * 0.65;
        const d = Math.hypot(tx - me.x, tz - me.z);
        if (d > rng) { tx = me.x + (tx - me.x) / d * rng; tz = me.z + (tz - me.z) / d * rng; }
        tx = Math.max(-18.2, Math.min(18.2, tx));
        tz = Math.max(-18.2, Math.min(18.2, tz));
        api.use(lob, { x: tx, z: tz });
      }
    } else if (zone && api.ready(zone) && vis) {
      const kk = k[zone];
      const rng = kk.range || 12;
      if (dist <= rng + (kk.radius || 3) + en.radius) {
        const lead = (kk.windup || 0.47) + 0.15;
        let tx = en.x + en.vx * lead, tz = en.z + en.vz * lead;
        const d = Math.hypot(tx - me.x, tz - me.z);
        if (d > rng) { tx = me.x + (tx - me.x) / d * rng; tz = me.z + (tz - me.z) / d * rng; }
        api.use(zone, { x: tx, z: tz });
      }
    }
  }

  // movement: kite at mid range, avoid enemy zones
  let mx = 0, mz = 0;
  const want = 9;
  const to = V.toward(me, en);
  if (!vis || dist > want + 3) {
    api.moveTo(en.x, en.z);
  } else {
    if (dist < want - 2) { mx -= to.x; mz -= to.z; }
    else if (dist > want + 1) { mx += to.x; mz += to.z; }
    const per = V.perp(to);
    const s = (Math.floor(p.t / 2.5) % 2) ? 1 : -1;
    mx += per.x * s * 1.1; mz += per.z * s * 1.1;
    // dodge zones
    for (const z of p.arena.zones || []) {
      if (z.mine) continue;
      const dx = me.x - z.x, dz = me.z - z.z;
      const dd = Math.hypot(dx, dz);
      if (dd < z.r + 3) { mx += dx / (dd || 1) * 2.5; mz += dz / (dd || 1) * 2.5; }
    }
    // keep off walls
    if (me.x > 16) mx -= 2; if (me.x < -16) mx += 2;
    if (me.z > 16) mz -= 2; if (me.z < -16) mz += 2;
    api.move(mx, mz);
  }

  if (p.t < 0.2) api.say("Blue. Let's make this quick.");
}