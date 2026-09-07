function think(p, api) {
  const me = p.self, e = p.enemy;
  if (!me.alive || !e.alive) return;

  const k = me.kit || {};
  const beam = pick(k, 'beam');
  const dash = pick(k, 'dash');
  const cone = pick(k, 'fan');

  const d = e.dist;

  if (p.t < 0.4) api.say("Let's dance.");

  // pick action
  if (!me.busy) {
    if (cone && d < 4.4 && api.ready(cone) && e.y < 0.35) {
      api.use(cone, { x: e.x, z: e.z });
      api.move(e.x - me.x, e.z - me.z);
      return;
    }
    if (dash && d > 4.0 && d < 10.0 && api.ready(dash) && api.los(e.x, e.z)) {
      api.use(dash, { x: e.x, z: e.z });
      return;
    }
    if (beam && api.ready(beam) && e.visible) {
      const r = api.ray(Math.sin(headTo(me, e)), Math.cos(headTo(me, e)), Math.min(d + 2, 30));
      if (!r.hit || r.dist > d - 1.6) {
        const aim = { x: e.x + e.vx * 0.5, z: e.z + e.vz * 0.5 };
        api.use(beam, aim);
        api.move(0, 0);
        return;
      }
    }
  }

  // movement
  api.faceAt(e.x, e.z);
  if (!e.visible) {
    api.moveTo(e.x, e.z);
    return;
  }
  const want = 5.0;
  const to = V.toward(me, e);
  let dir;
  if (d > want + 1.5) dir = to;
  else if (d < want - 1.5) dir = V.scale(to, -1);
  else {
    const s = ((Math.floor(p.t / 2.2) % 2) === 0) ? 1 : -1;
    dir = V.scale(V.perp(to), s);
  }
  let tx = me.x + dir.x * 5, tz = me.z + dir.z * 5;
  tx = Math.max(-18, Math.min(18, tx));
  tz = Math.max(-18, Math.min(18, tz));
  api.move(tx - me.x, tz - me.z);
}

function headTo(a, b) { return Math.atan2(b.x - a.x, b.z - a.z); }

function pick(kit, kind) {
  for (const n of Object.keys(kit)) {
    const s = kit[n];
    if (!s) continue;
    if (kind === 'beam' && s.kind === 'beam') return n;
    if (kind === 'dash' && (s.kind === 'dash' || s.kind === 'lunge' || s.kind === 'charge')) return n;
    if (kind === 'fan' && (s.kind === 'cone' || s.kind === 'fan')) return n;
  }
  return null;
}