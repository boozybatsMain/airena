function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en) return;

  const k = me.kit || {};
  const names = me.skills || [];
  const beam = names.find(n => k[n] && k[n].kind === 'beam');
  const bolt = names.find(n => k[n] && k[n].kind === 'bolt');
  const boost = names.find(n => k[n] && (k[n].effects || []).some(e => (e.id || e) === 'boost' || String(e).includes('boost')));

  const dist = en.dist;
  const toEn = { x: en.x - me.x, z: en.z - me.z };
  const clear = api.los(en.x, en.z);

  // say once
  if (!said && p.t > 1) { said = true; api.say("Line up. Burn down."); }

  // boost when nothing better and enemy in sight-ish
  if (boost && api.ready(boost) && !me.busy && p.t > 0.5 && boostAt + 3.6 < p.t) {
    boostAt = p.t;
    api.use(boost);
  } else if (bolt && api.ready(bolt) && clear && dist < (k[bolt].range || 18) + 3) {
    const spd = k[bolt].speed || 22;
    const lead = V.lead({ x: me.x, z: me.z }, { x: en.x, z: en.z }, { x: en.vx, z: en.vz }, spd);
    api.use(bolt, { x: lead.x, z: lead.z });
  } else if (beam && api.ready(beam) && clear && dist < (k[beam].range || 24) + 2) {
    const lead = V.lead({ x: me.x, z: me.z }, { x: en.x, z: en.z }, { x: en.vx, z: en.vz }, 45);
    api.use(beam, { x: lead.x, z: lead.z });
  }

  // movement: keep mid range, strafe
  api.faceAt(en.x, en.z);
  const want = 12;
  const dir = V.norm(toEn);
  const perp = V.perp(dir);
  if (p.t - flipAt > 1.6) { flipAt = p.t; sign = api.rand() < 0.5 ? -1 : 1; }

  let mv;
  if (!clear) {
    const path = api.pathTo(en.x, en.z);
    if (path && path.points && path.points.length) {
      const q = path.points[0];
      mv = V.norm({ x: q.x - me.x, z: q.z - me.z });
    } else mv = dir;
  } else {
    const radial = dist > want + 2 ? 1 : (dist < want - 3 ? -1 : 0);
    mv = V.norm(V.add(V.scale(dir, radial), V.scale(perp, sign * 0.9)));
  }

  // wall avoidance
  const nx = me.x + mv.x * 4, nz = me.z + mv.z * 4;
  if (Math.abs(nx) > 18 || Math.abs(nz) > 18) {
    mv = V.norm({ x: -me.x, z: -me.z });
  }
  api.move(mv.x, mv.z);
}

let said = false;
let boostAt = -99;
let flipAt = 0;
let sign = 1;