const CDX = { smash: 1.3, charge: 4.0, jump: 2.8 };

const S = {
  lastDir: { x: 0, z: 1 },
  eCd: { smash: 0, charge: 0, jump: 0 },
  chargeDir: null,
  chargeFrom: null,
  lastBlink: -99,
  shots: 0,
  hits: 0,
  said: -99
};

function clampArena(v) {
  return Math.max(-19.2, Math.min(19.2, v));
}

function predictEnemy(e, T) {
  if (T <= 0) return { x: e.x, z: e.z };
  let f = 0.8;
  if (e.casting && e.casting.skill === 'charge' && e.casting.phase === 'dash') f = 1.0;
  if (e.casting && e.casting.skill === 'smash') f = 0.35;
  if (e.speed < 0.6) f = 0;
  return {
    x: clampArena(e.x + e.vx * T * f),
    z: clampArena(e.z + e.vz * T * f)
  };
}

function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const L = dx * dx + dz * dz;
  if (L < 1e-6) return Math.hypot(px - ax, pz - az);
  let t = ((px - ax) * dx + (pz - az) * dz) / L;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

function pickBlink(p, api, seg) {
  const me = p.self, e = p.enemy;
  let best = null, bs = -1e9;
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8;
    const d = { x: Math.sin(a), z: Math.cos(a) };
    let lx = me.x + d.x * 7.2, lz = me.z + d.z * 7.2;
    let s = 0;
    if (Math.abs(lx) > 19 || Math.abs(lz) > 19) s -= 10;
    lx = Math.max(-19, Math.min(19, lx));
    lz = Math.max(-19, Math.min(19, lz));
    s += Math.min(15, Math.hypot(lx - e.x, lz - e.z)) * 1.6;
    if (seg) s += Math.min(9, segDist(lx, lz, seg.ax, seg.az, seg.bx, seg.bz)) * 3.0;
    const margin = Math.min(20 - Math.abs(lx), 20 - Math.abs(lz));
    if (margin < 4.5) s -= (4.5 - margin) * 4;
    if (s > bs) { bs = s; best = d; }
  }
  return best || { x: -Math.sin(p.self.heading), z: -Math.cos(p.self.heading) };
}

function chooseMove(p, api, want, ePred) {
  const me = p.self;
  let best = null, bs = -1e9;
  for (let i = 0; i < 20; i++) {
    const a = i * Math.PI * 2 / 20;
    const d = { x: Math.sin(a), z: Math.cos(a) };
    let s = 0;
    const probe = api.ray(d.x, d.z, 3.4);
    if (probe.hit && probe.dist < 3.0) s -= (3.0 - probe.dist) * 16;
    const step = 2.6;
    const nx = me.x + d.x * step, nz = me.z + d.z * step;
    const de = Math.hypot(nx - ePred.x, nz - ePred.z);
    s -= Math.abs(de - want) * 4.5;
    const margin = Math.min(20 - Math.abs(nx), 20 - Math.abs(nz));
    if (margin < 5.5) s -= (5.5 - margin) * 5.5;
    s += V.dot(d, S.lastDir) * 3.0;
    if (s > bs) { bs = s; best = d; }
  }
  return best || { x: 0, z: 0 };
}

function think(p, api) {
  const me = p.self, e = p.enemy;
  if (!me || !me.alive) return;
  const t = p.t;

  for (const ev of p.events) {
    if (ev.type === 'enemyStarted' && CDX[ev.skill] != null) {
      S.eCd[ev.skill] = t + CDX[ev.skill];
    }
    if (ev.type === 'enemyCommitted' && ev.skill === 'charge') {
      S.chargeDir = V.fromHeading(e.heading);
      S.chargeFrom = { x: e.x, z: e.z };
    }
    if (ev.type === 'dealt' && ev.skill === 'laser') S.hits++;
    if (ev.type === 'missed' && ev.skill === 'laser') S.shots++;
    if (ev.type === 'blinked') S.lastBlink = t;
  }

  if (!e || !e.alive) { api.stop(); return; }

  const dist = e.dist;
  const chargeReady = t >= S.eCd.charge - 0.1;
  const enemyCast = e.casting;
  const dashing = enemyCast && enemyCast.skill === 'charge' && enemyCast.phase === 'dash';
  const chargeWind = enemyCast && enemyCast.skill === 'charge' && enemyCast.phase === 'windup';
  const smashWind = enemyCast && enemyCast.skill === 'smash' && enemyCast.telegraph;

  const myCast = me.casting;
  const lasering = myCast && myCast.skill === 'laser' && myCast.telegraph;

  // ---------- aiming target ----------
  let leadT = 0.0;
  if (lasering) leadT = Math.max(0, Math.min(0.7, myCast.remaining));
  else leadT = 0.62;
  const aim = predictEnemy(e, leadT);
  const ePredMove = predictEnemy(e, 0.45);

  // ---------- emergency: dodge the charge ----------
  let acted = false;
  if (!me.stunned && !me.airborne) {
    if (dashing && dist < 15) {
      const dirv = (e.speed > 1) ? V.norm({ x: e.vx, z: e.vz }) : (S.chargeDir || V.fromHeading(e.heading));
      const seg = { ax: e.x, az: e.z, bx: e.x + dirv.x * 13, bz: e.z + dirv.z * 13 };
      const near = segDist(me.x, me.z, seg.ax, seg.az, seg.bx, seg.bz);
      if (near < 3.6) {
        if (api.ready('blink') && !me.busy) {
          const bd = pickBlink(p, api, seg);
          api.use('blink', bd.x, bd.z);
          api.face(dirv.x, dirv.z);
          acted = true;
        } else {
          // sidestep hard
          const perp = V.perp(dirv);
          const s1 = { x: me.x + perp.x * 4, z: me.z + perp.z * 4 };
          const s2 = { x: me.x - perp.x * 4, z: me.z - perp.z * 4 };
          const pick = (segDist(s1.x, s1.z, seg.ax, seg.az, seg.bx, seg.bz) + (Math.max(Math.abs(s1.x), Math.abs(s1.z)) > 18 ? -6 : 0)) >
            (segDist(s2.x, s2.z, seg.ax, seg.az, seg.bx, seg.bz) + (Math.max(Math.abs(s2.x), Math.abs(s2.z)) > 18 ? -6 : 0)) ? perp : V.scale(perp, -1);
          api.move(pick.x, pick.z);
          S.lastDir = pick;
          api.faceAt(aim.x, aim.z);
          acted = true;
        }
      }
    } else if (chargeWind && dist < 14) {
      // start drifting sideways before they lock
      const dirv = V.toward({ x: e.x, z: e.z }, { x: me.x, z: me.z });
      const perp = V.perp(dirv);
      const a1 = { x: me.x + perp.x * 5, z: me.z + perp.z * 5 };
      const a2 = { x: me.x - perp.x * 5, z: me.z - perp.z * 5 };
      const m1 = Math.min(20 - Math.abs(a1.x), 20 - Math.abs(a1.z));
      const m2 = Math.min(20 - Math.abs(a2.x), 20 - Math.abs(a2.z));
      let pick = m1 >= m2 ? perp : V.scale(perp, -1);
      const away = V.away({ x: me.x, z: me.z }, { x: e.x, z: e.z });
      const mix = V.norm({ x: pick.x * 0.75 + away.x * 0.6, z: pick.z * 0.75 + away.z * 0.6 });
      const probe = api.ray(mix.x, mix.z, 2.6);
      if (!(probe.hit && probe.dist < 2.2)) {
        api.move(mix.x, mix.z);
        S.lastDir = mix;
      } else {
        const d = chooseMove(p, api, 16, ePredMove);
        api.move(d.x, d.z);
        S.lastDir = d;
      }
      api.faceAt(aim.x, aim.z);
      acted = true;
    } else if (smashWind && dist < 6.0 && !me.busy) {
      if (api.ready('blink')) {
        const bd = pickBlink(p, api, null);
        api.use('blink', bd.x, bd.z);
        acted = true;
      } else if (api.ready('jump')) {
        const away = V.away({ x: me.x, z: me.z }, { x: e.x, z: e.z });
        api.move(away.x, away.z);
        S.lastDir = away;
        api.use('jump');
        acted = true;
      }
    } else if (dist < 4.2 && !me.busy && api.ready('blink') && !chargeWind) {
      const bd = pickBlink(p, api, null);
      api.use('blink', bd.x, bd.z);
      api.faceAt(e.x, e.z);
      acted = true;
    }
  }

  // ---------- laser ----------
  if (!acted && !me.stunned && !me.airborne) {
    if (lasering) {
      api.faceAt(aim.x, aim.z);
    } else if (api.ready('laser') && !me.busy && e.visible && !e.airborne &&
      dist < 22 && dist > 2.5 && !dashing) {
      const safe = (!chargeReady && dist > 4.0) || dist > 13.0;
      if (safe && api.los(aim.x, aim.z)) {
        api.faceAt(aim.x, aim.z);
        api.use('laser');
        S.shots++;
      } else {
        api.faceAt(aim.x, aim.z);
      }
    } else {
      api.faceAt(aim.x, aim.z);
    }
  } else if (!acted) {
    api.faceAt(aim.x, aim.z);
  }

  // ---------- movement ----------
  if (!acted && !me.airborne && !me.stunned) {
    let want = chargeReady ? 15.5 : 12.0;
    if (p.burnStartsIn <= 0 && me.hp / me.maxHp < e.hp / e.maxHp) want = chargeReady ? 14.0 : 10.0;

    if (!e.visible && dist > 11) {
      const path = api.pathTo(e.x, e.z);
      if (path && path.points && path.points.length) {
        const wp = path.points[0];
        const d = V.norm({ x: wp.x - me.x, z: wp.z - me.z });
        if (V.len(d) > 0) {
          api.move(d.x, d.z);
          S.lastDir = d;
        }
      } else {
        const d = chooseMove(p, api, want, ePredMove);
        api.move(d.x, d.z);
        S.lastDir = d;
      }
    } else {
      const d = chooseMove(p, api, want, ePredMove);
      api.move(d.x, d.z);
      S.lastDir = d;
    }
  }

  if (t - S.said > 7.5) {
    S.said = t;
    api.say(dist > 12 ? "eight arms, one beam — stay out there" : "too close, folding away");
  }
}
