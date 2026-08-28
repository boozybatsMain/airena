const OB_PAD = 0.0;
let strafeSign = 1;
let lastSideCheck = -9;
let saidOnce = false;

function inBlock(p, x, z, pad) {
  for (const o of p.arena.obstacles) {
    if (Math.abs(x - o.x) < o.hx + pad && Math.abs(z - o.z) < o.hz + pad) return true;
  }
  return false;
}

function outArena(p, x, z, pad) {
  const h = p.arena.half - pad;
  return Math.abs(x) > h || Math.abs(z) > h;
}

function bad(p, x, z, pad) {
  return outArena(p, x, z, pad) || inBlock(p, x, z, pad);
}

function segBlocked(p, ax, az, bx, bz) {
  const n = 24;
  for (let i = 1; i < n; i++) {
    const t = i / n;
    if (inBlock(p, ax + (bx - ax) * t, az + (bz - az) * t, OB_PAD)) return true;
  }
  return false;
}

function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me || !me.alive || !en || !en.alive) return;

  if (!saidOnce) { saidOnce = true; api.say("Close the distance. Break the arms."); }

  const dist = en.dist;
  const dirTo = V.norm({ x: en.x - me.x, z: en.z - me.z });
  const perp = { x: -dirTo.z, z: dirTo.x };
  const cast = me.casting;

  for (const e of p.events) {
    if (e.type === 'blocked') { strafeSign = -strafeSign; lastSideCheck = p.t; }
  }

  // ---------- already committed to a charge ----------
  if (cast && cast.skill === 'charge') {
    if (cast.phase === 'windup') {
      const tt = Math.max(0, cast.remaining || 0) + Math.max(0, dist - 2.25) / 15;
      api.faceAt(en.x + en.vx * tt, en.z + en.vz * tt);
      api.move(dirTo.x, dirTo.z);
    } else {
      api.faceAt(en.x + en.vx * 0.2, en.z + en.vz * 0.2);
      if (cast.phase === 'recover') api.move(dirTo.x, dirTo.z);
    }
    return;
  }

  if (me.airborne || me.stunned) {
    api.faceAt(en.x + en.vx * 0.3, en.z + en.vz * 0.3);
    return;
  }

  const enemyLaser = !!(en.casting && en.casting.skill === 'laser' && en.casting.telegraph);
  const canAct = !me.busy;

  // ---------- pick the strafing side ----------
  const probeBadNow = bad(p, me.x + perp.x * strafeSign * 2.2, me.z + perp.z * strafeSign * 2.2, 1.4);
  if (p.t - lastSideCheck > 0.45 || probeBadNow) {
    lastSideCheck = p.t;
    let bestS = strafeSign, bestScore = -1e9;
    for (const s of [1, -1]) {
      const tx = me.x + perp.x * s * 2.6, tz = me.z + perp.z * s * 2.6;
      let sc = 0;
      if (bad(p, tx, tz, 1.5)) sc -= 100;
      const nd = V.norm({ x: tx - en.x, z: tz - en.z });
      sc += Math.abs(V.angleTo(en.heading, nd)) * 2;
      if (enemyLaser && segBlocked(p, en.x, en.z, tx, tz)) sc += 50;
      if (s === strafeSign) sc += 0.6;
      if (sc > bestScore) { bestScore = sc; bestS = s; }
    }
    strafeSign = bestS;
  }

  // ---------- skills ----------
  let ordered = false;
  let faceX = en.x + en.vx * 0.25, faceZ = en.z + en.vz * 0.25;

  if (canAct && api.ready('smash')) {
    const lp = { x: en.x + en.vx * 0.3, z: en.z + en.vz * 0.3 };
    const mp = { x: me.x + me.vx * 0.12, z: me.z + me.vz * 0.12 };
    const d2 = Math.hypot(lp.x - mp.x, lp.z - mp.z);
    const aimDir = V.norm({ x: lp.x - me.x, z: lp.z - me.z });
    const aimErr = Math.abs(V.angleTo(me.heading, aimDir));
    if (!en.airborne && !en.invulnerable && d2 < 4.6 && aimErr < 1.35) {
      api.use('smash');
      ordered = true;
      faceX = lp.x; faceZ = lp.z;
    }
  }

  if (!ordered && canAct && api.ready('charge')) {
    const tt = 0.3 + Math.max(0, dist - 2.25) / 15;
    const cp = { x: en.x + en.vx * tt, z: en.z + en.vz * tt };
    const cdir = V.norm({ x: cp.x - me.x, z: cp.z - me.z });
    const cerr = Math.abs(V.angleTo(me.heading, cdir));
    const wantRange = dist > 2.9 && dist < 12.5;
    if (wantRange && en.visible && !en.invulnerable && !en.airborne && cerr < 0.8) {
      const r = api.ray(cdir.x, cdir.z, Math.min(14, dist + 2));
      if (r && r.dist >= dist - 1.7) {
        api.use('charge');
        ordered = true;
        faceX = cp.x; faceZ = cp.z;
      }
    }
  }

  // ---------- movement ----------
  let mv;
  if (!en.visible && dist > 4.5) {
    let tgt = null;
    const path = api.pathTo(en.x, en.z);
    if (path && path.points && path.points.length) {
      tgt = path.points[path.points.length - 1];
      for (const pt of path.points) {
        if (Math.hypot(pt.x - me.x, pt.z - me.z) > 1.2) { tgt = pt; break; }
      }
    }
    mv = tgt ? V.norm({ x: tgt.x - me.x, z: tgt.z - me.z }) : dirTo;
    if (V.len(mv) < 0.001) mv = dirTo;
  } else {
    let perpFrac = dist < 6.5 ? 0.85 : (dist < 10 ? 0.45 : 0.22);
    let radial = 1;
    if (dist < 2.4) radial = 0.2;
    if (dist > 6.5) perpFrac *= 0.9;
    mv = V.norm({
      x: dirTo.x * radial + perp.x * strafeSign * perpFrac,
      z: dirTo.z * radial + perp.z * strafeSign * perpFrac
    });
    if (V.len(mv) < 0.001) mv = dirTo;
    if (bad(p, me.x + mv.x * 1.9, me.z + mv.z * 1.9, 1.35)) {
      const alt = V.norm({
        x: dirTo.x * radial - perp.x * strafeSign * perpFrac,
        z: dirTo.z * radial - perp.z * strafeSign * perpFrac
      });
      if (V.len(alt) > 0.001 && !bad(p, me.x + alt.x * 1.9, me.z + alt.z * 1.9, 1.35)) {
        mv = alt;
        strafeSign = -strafeSign;
      } else if (!bad(p, me.x + dirTo.x * 1.9, me.z + dirTo.z * 1.9, 1.2)) {
        mv = dirTo;
      } else {
        const path2 = api.pathTo(en.x, en.z);
        if (path2 && path2.points && path2.points.length) {
          let t2 = path2.points[path2.points.length - 1];
          for (const pt of path2.points) {
            if (Math.hypot(pt.x - me.x, pt.z - me.z) > 1.0) { t2 = pt; break; }
          }
          const d3 = V.norm({ x: t2.x - me.x, z: t2.z - me.z });
          if (V.len(d3) > 0.001) mv = d3;
        }
      }
    }
  }

  api.move(mv.x, mv.z);
  api.faceAt(faceX, faceZ);
}
