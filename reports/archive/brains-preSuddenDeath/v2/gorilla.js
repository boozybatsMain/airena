function hpFrac(b) { return b.hp / Math.max(1, b.maxHp); }

function leadPoint(en, t, factor) {
  const f = factor === undefined ? 1 : factor;
  return { x: en.x + en.vx * t * f, z: en.z + en.vz * t * f };
}

function coverPoint(p, api) {
  const me = p.self, en = p.enemy;
  let best = null, bs = 1e9;
  for (const o of p.arena.obstacles) {
    const dir = V.norm({ x: o.x - en.x, z: o.z - en.z });
    if (dir.x === 0 && dir.z === 0) continue;
    const r = Math.max(o.hx, o.hz) + 2.2;
    const pt = { x: o.x + dir.x * r, z: o.z + dir.z * r };
    if (Math.abs(pt.x) > 18.5 || Math.abs(pt.z) > 18.5) continue;
    let path = null;
    try { path = api.pathTo(pt.x, pt.z); } catch (err) { path = null; }
    if (!path) continue;
    const s = path.dist + V.dist(pt, en) * -0.15;
    if (s < bs) { bs = s; best = { pt: pt, path: path }; }
  }
  return best;
}

function goTo(p, api, x, z) {
  const me = p.self;
  let path = null;
  try { path = api.pathTo(x, z); } catch (err) { path = null; }
  if (path && !path.direct && path.points && path.points.length) {
    let wp = path.points[0];
    if (path.points.length > 1 && V.dist(me, wp) < 1.2) wp = path.points[1];
    api.move(wp.x - me.x, wp.z - me.z);
  } else {
    api.move(x - me.x, z - me.z);
  }
}

function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me || !me.alive) return;

  for (const ev of p.events) {
    if (ev.type === 'enemyStarted') {
      if (ev.skill === 'laser') api.remember('eLaser', p.t);
      else if (ev.skill === 'blink') api.remember('eBlink', p.t);
    }
  }

  if (me.stunned || me.airborne) return;

  const enCast = en.casting && en.casting.telegraph ? en.casting : null;
  const enLaserCast = enCast && enCast.skill === 'laser';

  // ---- while a skill of ours is running, keep steering the aim ----
  if (me.busy) {
    const c = me.casting;
    if (c && c.skill === 'charge' && c.phase === 'windup') {
      const tt = Math.max(0, c.remaining) + Math.max(0, (en.dist - 2.2) / 15);
      const lp = leadPoint(en, Math.min(tt, 1.1), 0.9);
      api.faceAt(lp.x, lp.z);
      api.move(Math.sin(me.heading), Math.cos(me.heading));
    } else if (c && c.skill === 'smash' && c.phase === 'windup') {
      const tt = Math.min(0.3, Math.max(0, c.remaining));
      const lp = leadPoint(en, tt, 0.85);
      api.faceAt(lp.x, lp.z);
      api.move(lp.x - me.x, lp.z - me.z);
    }
    return;
  }

  const d = en.dist;

  // ---- endgame: ahead on hp fraction, hide ----
  if (p.timeLeft < 9 && hpFrac(me) > hpFrac(en) + 0.03) {
    const cov = coverPoint(p, api);
    if (cov && (!en.visible || d > 4)) {
      goTo(p, api, cov.pt.x, cov.pt.z);
      api.faceAt(en.x, en.z);
      return;
    }
  }

  // ---- SMASH: the bread and butter ----
  const tSm = 0.28;
  const pe = leadPoint(en, tSm, en.stunned ? 0.2 : 0.8);
  const pm = { x: me.x + me.vx * tSm * 0.45, z: me.z + me.vz * tSm * 0.45 };
  const dSm = V.dist(pe, pm);
  const dirSm = V.toward(pm, pe);
  const angSm = Math.abs(V.angleTo(me.heading, dirSm));
  if (api.ready('smash') && !en.airborne && !en.invulnerable &&
      dSm < 4.0 && angSm < 1.05) {
    api.faceAt(pe.x, pe.z);
    api.move(pe.x - me.x, pe.z - me.z);
    api.use('smash');
    return;
  }

  // ---- CHARGE: gap closer, interrupter ----
  if (api.ready('charge') && en.visible && !en.invulnerable && d > 2.2 && d < 13.5) {
    const tt = 0.34 + Math.max(0, d - 2.2) / 15;
    const lp = leadPoint(en, tt, en.stunned || enLaserCast ? 0.35 : 0.85);
    const dir = V.toward(me, lp);
    if (dir.x !== 0 || dir.z !== 0) {
      const angErr = Math.abs(V.angleTo(me.heading, dir));
      let clear = true;
      try {
        const ray = api.ray(dir.x, dir.z, Math.min(12.5, d + 1.5));
        if (ray && ray.hit && ray.dist < d - 1.6) clear = false;
      } catch (err) { clear = true; }
      const worth = enLaserCast || d < 10.5;
      if (clear && worth && angErr < 1.15) {
        api.face(dir.x, dir.z);
        api.move(dir.x, dir.z);
        api.use('charge');
        return;
      }
      if (clear && worth && angErr >= 1.15) {
        // turn into it, then fire next thoughts
        api.face(dir.x, dir.z);
        api.move(dir.x, dir.z);
        return;
      }
    }
  }

  // ---- default: hunt him down ----
  const tChase = Math.min(1.2, d / 5.2);
  const lp2 = leadPoint(en, tChase, 0.55);

  if (d < 3.0) {
    // stay glued: shove him, we are the heavy one
    api.move(en.x - me.x, en.z - me.z);
    api.faceAt(pe.x, pe.z);
    return;
  }

  if (!en.visible) {
    goTo(p, api, en.x, en.z);
    api.faceAt(en.x, en.z);
    return;
  }

  goTo(p, api, lp2.x, lp2.z);
  api.faceAt(pe.x, pe.z);

  if (p.tick % 300 === 0) api.say("come here, little squid");
}
