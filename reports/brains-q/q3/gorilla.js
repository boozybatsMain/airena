const ST = { laserFire: -1, lastFire: -99, juke: 1, jukeT: -99, said: 0 };

function segHitsBox(ax, az, bx, bz, o) {
  const minx = o.x - o.hx, maxx = o.x + o.hx, minz = o.z - o.hz, maxz = o.z + o.hz;
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dz = bz - az;
  if (Math.abs(dx) < 1e-9) { if (ax < minx || ax > maxx) return false; }
  else {
    let ta = (minx - ax) / dx, tb = (maxx - ax) / dx;
    if (ta > tb) { const t = ta; ta = tb; tb = t; }
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  if (Math.abs(dz) < 1e-9) { if (az < minz || az > maxz) return false; }
  else {
    let ta = (minz - az) / dz, tb = (maxz - az) / dz;
    if (ta > tb) { const t = ta; ta = tb; tb = t; }
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  return true;
}

function blockedLine(obs, ax, az, bx, bz) {
  for (const o of obs) if (segHitsBox(ax, az, bx, bz, o)) return true;
  return false;
}

function chargeAim(s, e) {
  let t = 0.3 + Math.max(0, V.dist(s, e) - 2.2) / 15;
  for (let i = 0; i < 4; i++) {
    const px = e.x + e.vx * t, pz = e.z + e.vz * t;
    const d = Math.hypot(px - s.x, pz - s.z);
    t = 0.3 + Math.max(0, d - 2.2) / 15;
    if (t > 1.1) t = 1.1;
  }
  let px = e.x + e.vx * t, pz = e.z + e.vz * t;
  px = Math.max(-19.5, Math.min(19.5, px));
  pz = Math.max(-19.5, Math.min(19.5, pz));
  return { x: px - s.x, z: pz - s.z };
}

function avoidDir(api, dx, dz) {
  const d = V.norm({ x: dx, z: dz });
  if (!d.x && !d.z) return d;
  const r = api.ray(d.x, d.z, 2.8);
  if (r.hit && r.dist < 2.0) {
    for (const a of [0.6, -0.6, 1.1, -1.1, 1.7, -1.7, 2.3, -2.3]) {
      const c = V.rot(d, a);
      const rr = api.ray(c.x, c.z, 2.8);
      if (!rr.hit || rr.dist > 2.5) return c;
    }
  }
  return d;
}

function findCover(p, api, obs, remaining) {
  const s = p.self, e = p.enemy;
  const reach = Math.max(1.2, Math.min(3.4, 5.0 * remaining));
  let best = null, bestScore = 1e9;
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8;
    const d = { x: Math.sin(a), z: Math.cos(a) };
    const q = { x: s.x + d.x * reach, z: s.z + d.z * reach };
    if (Math.abs(q.x) > 19 || Math.abs(q.z) > 19) continue;
    if (!blockedLine(obs, q.x, q.z, e.x, e.z)) continue;
    const r = api.ray(d.x, d.z, reach + 0.8);
    if (r.hit && r.dist < reach + 0.5) continue;
    const score = V.dist(q, e);
    if (score < bestScore) { bestScore = score; best = d; }
  }
  return best;
}

function coverPoint(p, api, obs) {
  const s = p.self, e = p.enemy;
  let best = null, bs = 1e9;
  for (const o of obs) {
    const d = V.norm({ x: o.x - e.x, z: o.z - e.z });
    if (!d.x && !d.z) continue;
    const rr = Math.max(o.hx, o.hz) + 2.0;
    const q = { x: o.x + d.x * rr, z: o.z + d.z * rr };
    if (Math.abs(q.x) > 18.5 || Math.abs(q.z) > 18.5) continue;
    if (!blockedLine(obs, q.x, q.z, e.x, e.z)) continue;
    const de = V.dist(q, e);
    if (de > e.dist - 1.0) continue;
    const pa = api.pathTo(q.x, q.z);
    if (!pa) continue;
    const score = pa.dist + de * 0.8;
    if (score < bs) { bs = score; best = q; }
  }
  return best;
}

function think(p, api) {
  const s = p.self, e = p.enemy;
  if (!s || !s.alive || !e || !e.alive) return;
  const obs = p.arena.obstacles || [];

  for (const ev of p.events) {
    if (ev.type === 'enemyStarted' && ev.skill === 'laser') ST.laserFire = p.t + 0.667;
    if (ev.type === 'damaged' && ev.skill === 'laser') { ST.lastFire = p.t; ST.laserFire = -1; }
  }
  if (e.casting && e.casting.skill === 'laser' && e.casting.telegraph) {
    const rem = (typeof e.casting.remaining === 'number') ? e.casting.remaining : 0.3;
    ST.laserFire = p.t + rem;
  } else if (ST.laserFire > 0 && p.t >= ST.laserFire - 0.06) {
    ST.lastFire = ST.laserFire; ST.laserFire = -1;
  }

  const dist = e.dist;
  const eP = { x: e.x + e.vx * 0.3, z: e.z + e.vz * 0.3 };
  const laserSoon = ST.laserFire > 0 && (ST.laserFire - p.t) < 0.85 && e.visible;
  const safeRush = (p.t - ST.lastFire) < 1.35;

  let faceCmd = { t: 'at', x: eP.x, z: eP.z };
  let moveCmd = null;
  let skill = null;

  if (p.t - ST.jukeT > 0.9) { ST.jukeT = p.t; ST.juke = api.rand() < 0.5 ? -1 : 1; }

  const busy = s.busy || s.stunned || s.airborne;

  if (busy) {
    if (s.casting && s.casting.skill === 'charge' && s.casting.phase === 'windup') {
      const ad = V.norm(chargeAim(s, e));
      if (ad.x || ad.z) { faceCmd = { t: 'dir', x: ad.x, z: ad.z }; moveCmd = { t: 'dir', x: ad.x, z: ad.z }; }
    } else {
      const td = V.toward(s, e);
      moveCmd = { t: 'dir', x: td.x, z: td.z };
    }
  } else {
    // --- SMASH ---
    const toE = V.norm({ x: e.x - s.x, z: e.z - s.z });
    const selfP = { x: s.x + toE.x * 0.45, z: s.z + toE.z * 0.45 };
    const pd = V.dist(selfP, eP);
    const angS = Math.abs(V.angleTo(s.heading, { x: eP.x - s.x, z: eP.z - s.z }));
    if (api.ready('smash') && !e.airborne && !e.invulnerable && pd <= 4.7 && angS < 1.45) {
      skill = 'smash';
      faceCmd = { t: 'at', x: eP.x, z: eP.z };
    }

    // --- CHARGE ---
    if (!skill && api.ready('charge') && e.visible && !e.invulnerable && dist > 2.2 && dist < 13.5) {
      const aim = chargeAim(s, e);
      const ad = V.norm(aim);
      if (ad.x || ad.z) {
        const need = Math.min(Math.max(dist - 1.0, 1), 12);
        const r = api.ray(ad.x, ad.z, Math.min(12.5, dist + 1.5));
        const clear = !r.hit || r.dist >= need;
        const angA = Math.abs(V.angleTo(s.heading, ad));
        const want = laserSoon || e.stunned || dist > 4.2 || (api.cooldown('smash') > 0.5 && dist > 2.6);
        if (clear && want) {
          faceCmd = { t: 'dir', x: ad.x, z: ad.z };
          moveCmd = { t: 'dir', x: ad.x, z: ad.z };
          if (angA < 0.85) skill = 'charge';
        }
      }
    }

    // --- MOVEMENT ---
    if (!skill || skill === 'smash') {
      if (laserSoon && dist > 3.4) {
        const rem = Math.max(0.05, ST.laserFire - p.t);
        const cov = findCover(p, api, obs, rem);
        if (cov) moveCmd = { t: 'dir', x: cov.x, z: cov.z };
      } else if (laserSoon) {
        const td = V.toward(s, e);
        const per = V.perp(td);
        const d = V.norm({ x: per.x * ST.juke + td.x * 0.45, z: per.z * ST.juke + td.z * 0.45 });
        const a = avoidDir(api, d.x, d.z);
        moveCmd = { t: 'dir', x: a.x, z: a.z };
      }

      if (!moveCmd) {
        if (!e.visible) {
          moveCmd = { t: 'to', x: e.x, z: e.z };
        } else {
          const path = api.pathTo(e.x, e.z);
          if (path && !path.direct) {
            moveCmd = { t: 'to', x: e.x, z: e.z };
          } else {
            let target = null;
            if (dist > 9.5 && !safeRush && !e.stunned) target = coverPoint(p, api, obs);
            if (target && V.dist(s, target) > 1.6) {
              moveCmd = { t: 'to', x: target.x, z: target.z };
            } else {
              let d = V.toward(s, e);
              if (dist > 5) {
                const per = V.perp(d);
                const amt = (dist > 9 ? 0.35 : 0.18) * ST.juke;
                d = V.norm({ x: d.x + per.x * amt, z: d.z + per.z * amt });
              }
              const a = avoidDir(api, d.x, d.z);
              moveCmd = { t: 'dir', x: a.x, z: a.z };
            }
          }
        }
      }
    }
  }

  if (faceCmd) {
    if (faceCmd.t === 'at') api.faceAt(faceCmd.x, faceCmd.z);
    else api.face(faceCmd.x, faceCmd.z);
  }
  if (moveCmd) {
    if (moveCmd.t === 'to') api.moveTo(moveCmd.x, moveCmd.z);
    else api.move(moveCmd.x, moveCmd.z);
  }
  if (skill) api.use(skill);

  if (p.t - ST.said > 6) {
    ST.said = p.t;
    api.say(dist < 5 ? "close enough" : "eight arms, no fists");
  }
}
