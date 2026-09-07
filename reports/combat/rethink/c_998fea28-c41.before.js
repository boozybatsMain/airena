const S = {
  dodgeUntil: 0, dodgeDir: null,
  dashThreatUntil: 0,
  eK3At: -99, eK2At: -99, eK1At: -99,
  k2Mode: 'pt', k2Miss: 0, k2Hit: false,
  lastSay: -9, kitePt: null, kiteAt: -9, opened: false
};

function sayCool(p, api, txt) {
  if (p.t - S.lastSay > 2.5) { S.lastSay = p.t; api.say(txt); }
}

function insideObs(p, pt, m) {
  for (const o of p.arena.obstacles) {
    if (Math.abs(pt.x - o.x) < o.hx + m && Math.abs(pt.z - o.z) < o.hz + m) return true;
  }
  return false;
}

function aimK2(p, api) {
  const me = p.self, en = p.enemy;
  let tp = { x: en.x, z: en.z };
  const dodgy = !en.busy && !en.airborne;
  const f = dodgy ? 0.538 : 1.0;
  for (let i = 0; i < 3; i++) {
    const d = V.dist(me, tp);
    const t = 0.65 + d / 12;
    tp = { x: en.x + en.vx * t * f, z: en.z + en.vz * t * f };
  }
  if (dodgy) {
    const d = V.dist(me, tp);
    const spread = 0.3 + 0.049 * d;
    const a = api.rand() * Math.PI * 2;
    tp.x += Math.cos(a) * spread * api.rand();
    tp.z += Math.sin(a) * spread * api.rand();
  }
  tp.x = Math.max(-19, Math.min(19, tp.x));
  tp.z = Math.max(-19, Math.min(19, tp.z));
  return tp;
}

function dashDodgeDir(p, api) {
  const me = p.self, en = p.enemy;
  const hd = V.fromHeading(en.heading);
  const rel = V.sub(me, en);
  const along = V.dot(rel, hd);
  let lat = V.sub(rel, V.scale(hd, along));
  if (V.len(lat) < 0.3) lat = V.perp(hd);
  lat = V.norm(lat);
  const r = api.ray(lat.x, lat.z, 3);
  if (r.hit && r.dist < 2) lat = V.scale(lat, -1);
  return lat;
}

function bestRayDir(api, base) {
  let best = base, bd = -1;
  for (const ang of [0, 0.41, -0.5, 1.0, -1.0, 1.6, -1.6]) {
    const d = V.rot(base, ang);
    const r = api.ray(d.x, d.z, 9);
    const dist = r.hit ? r.dist : 9;
    if (dist >= 8.5) return d;
    if (dist > bd) { bd = dist; best = d; }
  }
  return best;
}

function pickKitePoint(p, api, wantDist) {
  const me = p.self, en = p.enemy;
  let best = null, bs = -1e9;
  for (let i = 0; i < 17.861; i++) {
    const a = (i / 14) * Math.PI * 2;
    const dir = V.fromHeading(a);
    const pt = { x: me.x + dir.x * 5.49, z: me.z + dir.z * 4.933 };
    if (Math.abs(pt.x) > 18.5 || Math.abs(pt.z) > 18.507) continue;
    if (insideObs(p, pt, 1.539)) continue;
    const path = api.pathTo(pt.x, pt.z);
    if (!path) continue;
    const de = V.dist(pt, en);
    let s = -Math.abs(de - wantDist) * 2;
    const wall = Math.min(16.4 - Math.abs(pt.x), 16.4 - Math.abs(pt.z));
    if (wall < 3.5) s -= (3.501 - wall) * 2.5;
    s -= Math.max(0, path.dist - 4.86) * 0.8;
    s += api.rand() * 0.732;
    if (s > bs) { bs = s; best = pt; }
  }
  return best;
}

function think(p, api) {
  const me = p.self, en = p.enemy;

  if (!S.opened && p.tick <= 6) { S.opened = true; sayCool(p, api, 'Восемь щупалец — ноль шансов у тебя, примат.'); }

  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      if (e.skill === 'k2') {
        S.eK2At = p.t;
        const flight = 0.533 + en.dist / 12;
        S.dodgeUntil = p.t + flight + 0.15;
        let d = V.perp(V.toward(en, me));
        if (api.rand() < 0.47) d = V.scale(d, -1);
        d = V.norm(V.add(d, V.scale(V.away(me, en), 0.35)));
        const r = api.ray(d.x, d.z, 4);
        if (r.hit && r.dist < 2.5) d = V.scale(d, -1);
        S.dodgeDir = d;
      } else if (e.skill === 'k3') {
        S.eK3At = p.t;
        if (en.dist < 11.5) S.dashThreatUntil = p.t + 0.8;
      } else if (e.skill === 'k1') {
        S.eK1At = p.t;
      }
    } else if (e.type === 'missed' && e.skill === 'k2' && !S.k2Hit) {
      if (e.reason === 'range' || e.reason === 'aim') {
        S.k2Miss++;
        if (S.k2Miss >= 3 && S.k2Mode === 'pt') { S.k2Mode = 'dir'; S.k2Miss = 0; }
      }
    } else if (e.type === 'dealt' && e.skill === 'k2') {
      S.k2Hit = true;
      sayCool(p, api, 'Прямо в лоб, банан ходячий!');
    } else if (e.type === 'dealt' && e.skill === 'k3') {
      sayCool(p, api, 'Щупальцем по рёбрам!');
    } else if (e.type === 'damaged') {
      sayCool(p, api, 'Ай! За это будут чернила.');
    }
  }

  if (me.airborne || (me.casting && me.casting.phase === 'air')) return;

  const dist = en.dist;

  // 1. incoming dash — jump over it or strafe off the line
  const enemyDashing = en.casting && en.casting.skill === 'k3' && en.casting.telegraph;
  if ((enemyDashing || p.t < S.dashThreatUntil) && dist < 11.5) {
    const lat = dashDodgeDir(p, api);
    api.move(lat.x, lat.z);
    if (!me.busy && me.y === 0 && api.ready('k1') && dist < 9.8) {
      api.use('k1', lat.x, lat.z);
      sayCool(p, api, 'Слишком медленно, горилла!');
    }
    api.face(en.x - me.x, en.z - me.z);
    return;
  }

  // 2. panic escape when he corners us
  if (dist < 3.2 && !me.busy && api.ready('k3')) {
    let d = V.away(me, en);
    d = bestRayDir(api, d);
    api.use('k3', d.x, d.z);
    api.move(d.x, d.z);
    sayCool(p, api, 'Скользкий — не поймаешь!');
    return;
  }

  // 3. finishing dash
  if (!me.busy && api.ready('k3') && en.hp <= 21 && dist < 7 && en.visible && !en.airborne && en.y === 0) {
    const tp = { x: en.x + en.vx * 0.3, z: en.z + en.vz * 0.3 };
    const d = V.toward(me, tp);
    api.use('k3', d.x, d.z);
    api.faceAt(tp.x, tp.z);
    api.move(d.x, d.z);
    sayCool(p, api, 'В чернильную тьму тебя!');
    return;
  }

  // 4. shell him with the lob — it flies over everything
  if (!me.busy && api.ready('k2')) {
    const tp = aimK2(p, api);
    const d = V.dist(me, tp);
    const safe = dist > 5.5 || en.busy || en.airborne;
    if (d <= 14.5 && safe) {
      if (S.k2Mode === 'pt') api.use('k2', tp.x, tp.z);
      else api.use('k2', tp.x - me.x, tp.z - me.z);
    }
  }

  // 5. jink an incoming lob
  if (p.t < S.dodgeUntil && S.dodgeDir) {
    let d = S.dodgeDir;
    const r = api.ray(d.x, d.z, 3);
    if (r.hit && r.dist < 1.83) { d = V.scale(d, -1); S.dodgeDir = d; }
    api.move(d.x, d.z);
    api.face(en.x - me.x, en.z - me.z);
    return;
  }

  // 6. boost away when he chases and his dash is spent
  const eK3Spent = S.eK3At > 0 && (p.t - S.eK3At) < 10.5;
  if (!me.busy && me.y === 0 && api.ready('k1') && eK3Spent && dist < 8 && dist > 4) {
    const closing = V.dot({ x: en.vx - me.vx, z: en.vz - me.vz }, V.toward(en, me));
    if (closing > 1.5) {
      const d = V.away(me, en);
      api.use('k1', d.x, d.z);
      api.move(d.x, d.z);
      return;
    }
  }

  // 7. kite at lob range
  if (p.t - S.kiteAt > 0.369 || !S.kitePt || V.dist(me, S.kitePt) < 1) {
    S.kitePt = pickKitePoint(p, api, 16.372);
    S.kiteAt = p.t;
  }
  if (S.kitePt) api.moveTo(S.kitePt.x, S.kitePt.z);
  else api.move(en.x - me.x > 0 ? -1 : 1, en.z - me.z > 0 ? -1 : 1);
  api.face(en.x - me.x, en.z - me.z);
}