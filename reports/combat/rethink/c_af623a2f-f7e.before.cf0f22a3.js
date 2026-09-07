function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en.alive) return;

  const dist = en.dist;
  const kit = me.kit || {};
  const has = n => me.skills && me.skills.indexOf(n) >= 0;

  // keep a lead estimate
  const lead = (speed) => {
    if (!speed) return { x: en.x, z: en.z };
    return V.lead({ x: me.x, z: me.z }, { x: en.x, z: en.z }, { x: en.vx, z: en.vz }, speed);
  };

  if (p.t < 0.2) api.say("Fire finds everything eventually.");

  // --- defensive self skill (k3-like: aim none, self) ---
  let selfSkill = null, discSkill = null, lobSkill = null;
  for (const n of (me.skills || [])) {
    const k = kit[n];
    if (!k) continue;
    if (k.kind === 'self' || k.aim === 'none') { if (!selfSkill) selfSkill = n; }
    else if (k.kind === 'zone' || k.radius && k.ticks) { if (!discSkill) discSkill = n; }
    else if (k.speed || k.splash) { if (!lobSkill) lobSkill = n; }
  }
  if (!discSkill && has('k1')) discSkill = 'k1';
  if (!lobSkill && has('k2')) lobSkill = 'k2';
  if (!selfSkill && has('k3')) selfSkill = 'k3';

  const busy = me.busy || me.casting;

  // --- ability use ---
  if (!busy && !me.stunned && !me.silenced) {
    let used = false;

    // lob: main damage, use whenever in range and visible-ish
    if (!used && lobSkill && api.ready(lobSkill)) {
      const k = kit[lobSkill] || {};
      const rng = k.range || 15;
      const sp = k.speed || 18;
      if (dist < rng + 2.5) {
        const t = lead(sp);
        // clamp to range from me
        const d = V.sub(t, { x: me.x, z: me.z });
        const L = V.len(d) || 1;
        const cl = Math.min(L, rng - 0.2);
        const aim = { x: me.x + d.x / L * cl, z: me.z + d.z / L * cl };
        api.use(lobSkill, aim);
        used = true;
      }
    }

    // disc: place on enemy when close/mid
    if (!used && discSkill && api.ready(discSkill)) {
      const k = kit[discSkill] || {};
      const rng = k.range || 12;
      if (dist < rng + 2.0) {
        const t = lead(4);
        const d = V.sub(t, { x: me.x, z: me.z });
        const L = V.len(d) || 1;
        const cl = Math.min(L, rng - 0.2);
        api.use(discSkill, { x: me.x + d.x / L * cl, z: me.z + d.z / L * cl });
        used = true;
      }
    }

    // self shield/heal: when hurt or burning or enemy close/casting
    if (!used && selfSkill && api.ready(selfSkill)) {
      const hurt = me.hp < me.maxHp * 0.92;
      const danger = me.burning || (en.casting && en.casting.telegraph) || dist < 9 || p.burn > 0;
      if (hurt && danger && (me.shield || 0) < 3) {
        api.use(selfSkill);
        used = true;
      }
    }
  }

  // --- movement ---
  const toEn = V.toward({ x: me.x, z: me.z }, { x: en.x, z: en.z });
  let dest = null;

  // avoid enemy zones
  let flee = { x: 0, z: 0 };
  for (const z of (p.arena.zones || [])) {
    if (z.mine) continue;
    const dz = V.dist({ x: me.x, z: me.z }, z);
    if (dz < z.r + me.radius + 1.5) {
      const a = V.away({ x: me.x, z: me.z }, z);
      flee = V.add(flee, V.scale(a, 3));
    }
  }

  const ideal = 8.5;
  let radial = 0;
  if (dist > ideal + 1.5) radial = 1;
  else if (dist < ideal - 1.5) radial = -1;

  // strafe direction, flip occasionally
  if (typeof think._s !== 'number') think._s = 1;
  if (!think._flip) think._flip = 0;
  if (p.t - think._flip > 2.5 + api.rand() * 2) { think._s = -think._s; think._flip = p.t; }

  const perp = V.perp(toEn);
  let dir = V.add(V.scale(toEn, radial), V.scale(perp, think._s * 0.9));
  dir = V.add(dir, flee);

  // stay off walls
  const edge = 16.5;
  if (me.x > edge) dir.x -= 2; if (me.x < -edge) dir.x += 2;
  if (me.z > edge) dir.z -= 2; if (me.z < -edge) dir.z += 2;

  if (!en.visible && dist > 6) {
    const path = api.pathTo(en.x, en.z);
    if (path && path.points && path.points.length) {
      const wp = path.points[0];
      api.moveTo(wp.x, wp.z);
    } else {
      api.move(toEn.x, toEn.z);
    }
  } else {
    api.move(dir.x, dir.z);
  }

  if (!me.casting) api.faceAt(en.x, en.z);
}