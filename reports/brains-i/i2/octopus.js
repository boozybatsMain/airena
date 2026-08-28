const CD = { charge: 4.0, smash: 1.3, jump: 2.8 };
let eReady = { charge: 0, smash: 0, jump: 0 };
let lastT = -1;
let strafeSide = 1;
let sideT = -99;

function resetAll() {
  eReady = { charge: 0, smash: 0, jump: 0 };
  strafeSide = 1;
  sideT = -99;
}

function pickSide(p, api, to) {
  const per = V.perp(to);
  const a = api.ray(per.x * strafeSide, per.z * strafeSide, 5).dist;
  if (a < 3.0 || p.t - sideT > 3.0) {
    const b = api.ray(-per.x * strafeSide, -per.z * strafeSide, 5).dist;
    if (b > a + 0.8) strafeSide = -strafeSide;
    sideT = p.t;
  }
  return strafeSide;
}

function steer(p, api, desired) {
  const me = p.self;
  if (!desired || (desired.x === 0 && desired.z === 0)) { api.stop(); return; }
  const base = Math.atan2(desired.x, desired.z);
  let best = desired, bestS = -1e9;
  for (let i = 0; i < 15; i++) {
    const off = (i === 0) ? 0 : (i % 2 ? 1 : -1) * Math.ceil(i / 2) * (Math.PI / 9);
    if (Math.abs(off) > Math.PI * 0.75) continue;
    const ang = base + off;
    const d = { x: Math.sin(ang), z: Math.cos(ang) };
    const r = api.ray(d.x, d.z, 5);
    const clear = r ? r.dist : 5;
    let s = Math.cos(off) * 7;
    if (clear < 2.4) s -= (2.4 - clear) * 9;
    const fx = me.x + d.x * 3.2, fz = me.z + d.z * 3.2;
    const ox = Math.abs(fx) - 18.2, oz = Math.abs(fz) - 18.2;
    if (ox > 0) s -= ox * 12;
    if (oz > 0) s -= oz * 12;
    if (s > bestS) { bestS = s; best = d; }
  }
  api.move(best.x, best.z);
}

function desiredDir(p, api, D) {
  const me = p.self, en = p.enemy;
  const to = V.toward(me, en);
  const dist = en.dist;
  const k = Math.max(-1, Math.min(1, (dist - D) / 3));
  let d = V.scale(to, k);
  const s = pickSide(p, api, to);
  const tw = dist < D + 2 ? 1.0 : 0.45;
  d = V.add(d, V.scale(V.perp(to), s * tw));
  const edge = Math.max(Math.abs(me.x), Math.abs(me.z));
  if (edge > 14.5) {
    const c = V.norm({ x: -me.x, z: -me.z });
    d = V.add(d, V.scale(c, (edge - 14.5) * 0.4));
  }
  const n = V.norm(d);
  if (n.x === 0 && n.z === 0) return V.perp(to);
  return n;
}

function think(p, api) {
  const me = p.self, en = p.enemy;
  if (p.t < lastT - 0.2) resetAll();
  lastT = p.t;

  for (const ev of p.events) {
    if (ev.type === 'enemyStarted') {
      if (CD[ev.skill] !== undefined) eReady[ev.skill] = p.t + CD[ev.skill];
    } else if (ev.type === 'blocked') {
      strafeSide = -strafeSide;
      sideT = p.t;
    }
  }

  if (!me.alive) return;
  if (!en || !en.alive) { api.stop(); return; }
  if (me.stunned) return;

  const dist = en.dist;
  const toEn = V.toward(me, en);
  const awayV = V.scale(toEn, -1);

  const aimT = (me.casting && me.casting.skill === 'laser')
    ? Math.max(0, Math.min(me.casting.remaining, 0.7))
    : 0.68;
  const pred = { x: en.x + en.vx * aimT * 0.95, z: en.z + en.vz * aimT * 0.95 };

  if (me.airborne) { api.faceAt(pred.x, pred.z); return; }

  const myFrac = me.hp / me.maxHp, enFrac = en.hp / en.maxHp;
  const turtle = (p.t > 41 && myFrac >= enFrac + 0.02);
  const chargeCd = Math.max(0, eReady.charge - p.t);
  const ec = en.casting;

  // ---- charge reaction ----
  if (ec && ec.skill === 'charge') {
    const dir = (en.speed > 7) ? V.norm({ x: en.vx, z: en.vz }) : V.fromHeading(en.heading);
    const rel = { x: me.x - en.x, z: me.z - en.z };
    const along = V.dot(rel, dir);
    const pv = { x: rel.x - dir.x * along, z: rel.z - dir.z * along };
    const perp = V.len(pv);
    let esc = perp > 0.4 ? V.norm(pv) : V.perp(dir);
    if (Math.abs(me.x + esc.x * 7) > 19.2 || Math.abs(me.z + esc.z * 7) > 19.2) {
      const alt = V.scale(esc, -1);
      if (Math.abs(me.x + alt.x * 7) < 19.2 && Math.abs(me.z + alt.z * 7) < 19.2) esc = alt;
    }
    const committed = ec.phase !== 'windup';
    if (committed) {
      if (along > -2 && along < 14 && perp < 3.6) {
        if (api.ready('blink') && along < 11.5 && !me.busy) {
          api.use('blink', esc.x, esc.z);
        }
        api.move(esc.x, esc.z);
        api.faceAt(pred.x, pred.z);
        return;
      }
    } else if (dist < 15) {
      const mix = V.norm(V.add(esc, V.scale(awayV, dist < 8 ? 0.9 : 0.25)));
      steer(p, api, mix);
      api.faceAt(pred.x, pred.z);
      return;
    }
  }

  // ---- smash reaction ----
  if (ec && ec.skill === 'smash' && ec.telegraph && dist < 7.2) {
    const side = pickSide(p, api, toEn);
    const esc = V.norm(V.add(awayV, V.scale(V.perp(toEn), side * 0.65)));
    steer(p, api, esc);
    api.faceAt(pred.x, pred.z);
    if (dist < 5.6 && !me.busy) {
      if (api.ready('jump') && ec.remaining > 0.13) api.use('jump');
      else if (api.ready('blink') && chargeCd > 1.0) api.use('blink', esc.x, esc.z);
    }
    return;
  }

  // ---- melee panic escape ----
  if (dist < 3.9 && !me.busy && api.ready('blink') && chargeCd > 1.1) {
    const side = pickSide(p, api, toEn);
    let esc = V.norm(V.add(awayV, V.scale(V.perp(toEn), side * 0.5)));
    if (Math.abs(me.x + esc.x * 7) > 19.2 || Math.abs(me.z + esc.z * 7) > 19.2) {
      esc = V.norm(V.add(esc, V.scale(V.norm({ x: -me.x, z: -me.z }), 1.2)));
    }
    api.use('blink', esc.x, esc.z);
    api.move(esc.x, esc.z);
    api.faceAt(pred.x, pred.z);
    return;
  }

  // ---- mid-cast steering ----
  if (me.casting && me.casting.skill === 'laser') {
    const side = pickSide(p, api, toEn);
    const d = V.norm(V.add(V.scale(awayV, dist < 13 ? 1.0 : 0.25),
      V.scale(V.perp(toEn), side * 0.55)));
    steer(p, api, d);
    api.faceAt(pred.x, pred.z);
    return;
  }

  // ---- laser decision ----
  let minD = 7.6;
  if (chargeCd < 0.7) minD = 14.2;
  if (turtle) minD = Math.max(minD, 15.0);
  const ang = Math.abs(V.angleTo(me.heading, V.toward(me, pred)));
  const canShoot = !me.busy && api.ready('laser') && en.visible && api.los(pred.x, pred.z) &&
    dist > minD && dist < 21.5 && ang < 1.1 &&
    !(ec && ec.skill === 'charge') && !en.invulnerable;

  if (canShoot) {
    api.faceAt(pred.x, pred.z);
    api.use('laser');
    const side = pickSide(p, api, toEn);
    steer(p, api, V.norm(V.add(V.scale(awayV, dist < 13 ? 0.9 : 0.2),
      V.scale(V.perp(toEn), side * 0.6))));
    return;
  }

  // ---- positioning ----
  let D;
  if (turtle) D = 22;
  else if (chargeCd < 0.8) D = 16.5;
  else D = 9.5;

  if (!en.visible && !turtle && chargeCd > 1.0 && dist > 6) {
    const path = api.pathTo(en.x, en.z);
    if (path && path.points && path.points.length) {
      let wp = path.points[0];
      if (V.dist(me, wp) < 1.2 && path.points.length > 1) wp = path.points[1];
      steer(p, api, V.toward(me, wp));
      api.faceAt(en.x, en.z);
      return;
    }
  }

  steer(p, api, desiredDir(p, api, D));
  api.faceAt(pred.x, pred.z);
}
