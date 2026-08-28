const CLAMP = 19.2;

function clampPt(x, z) {
  return { x: Math.max(-CLAMP, Math.min(CLAMP, x)), z: Math.max(-CLAMP, Math.min(CLAMP, z)) };
}

function lead(en, t) {
  return clampPt(en.x + en.vx * t, en.z + en.vz * t);
}

function chargeAim(p) {
  const me = p.self, en = p.enemy;
  let t = 0.3 + en.dist / 15;
  let px = en.x + en.vx * t * 0.85, pz = en.z + en.vz * t * 0.85;
  const dd = Math.hypot(px - me.x, pz - me.z);
  t = 0.3 + dd / 15;
  px = en.x + en.vx * t * 0.85;
  pz = en.z + en.vz * t * 0.85;
  return clampPt(px, pz);
}

function coverPoint(p, api) {
  const me = p.self, en = p.enemy;
  let best = null, bestScore = 1e9;
  for (const o of p.arena.obstacles) {
    const away = V.norm({ x: o.x - en.x, z: o.z - en.z });
    if (away.x === 0 && away.z === 0) continue;
    const r = Math.max(o.hx, o.hz) + 2.0;
    const pt = clampPt(o.x + away.x * r, o.z + away.z * r);
    if (Math.abs(pt.x) > 18.5 || Math.abs(pt.z) > 18.5) continue;
    const path = api.pathTo(pt.x, pt.z);
    if (!path) continue;
    const score = path.dist + V.dist(pt, { x: en.x, z: en.z }) * 0.35;
    if (score < bestScore) { bestScore = score; best = pt; }
  }
  return best;
}

let strafeSign = 1;
let strafeNext = 0;
let lastSay = -9;
let lastSmashT = -9;

function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en.alive) return;

  const d = en.dist;
  const toEn = V.toward({ x: me.x, z: me.z }, { x: en.x, z: en.z });
  const angToEn = V.angleTo(me.heading, toEn);

  for (const e of p.events) {
    if (e.type === 'blocked' && p.t > strafeNext - 0.5) {
      strafeSign = -strafeSign;
      strafeNext = p.t + 0.7;
    }
    if (e.type === 'damaged' && e.skill === 'laser') {
      strafeSign = -strafeSign;
      strafeNext = p.t + 0.6;
    }
  }
  if (p.t > strafeNext) {
    strafeNext = p.t + 0.5 + api.rand() * 0.9;
    if (api.rand() < 0.45) strafeSign = -strafeSign;
  }

  const lasering = !!(en.casting && en.casting.skill === 'laser' && en.casting.telegraph);

  // ---- committed states ----
  const c = me.casting;
  if (c) {
    if (c.skill === 'charge' && c.phase === 'windup') {
      const a = chargeAim(p);
      api.faceAt(a.x, a.z);
      api.move(a.x - me.x, a.z - me.z);
      return;
    }
    if (c.skill === 'charge' && c.phase === 'dash') return;
    if (c.skill === 'smash' && c.phase === 'windup') {
      const a = lead(en, Math.min(c.remaining, 0.3));
      api.faceAt(a.x, a.z);
      api.move(toEn.x, toEn.z);
      return;
    }
    if (c.skill === 'jump') {
      api.faceAt(en.x, en.z);
      return;
    }
  }
  if (me.stunned || me.airborne) {
    api.faceAt(en.x, en.z);
    return;
  }

  const visible = en.visible;
  const canSmash = api.ready('smash');
  const canCharge = api.ready('charge');

  let faceP = lead(en, Math.min(0.3, 0.12 + d / 45));
  let ordered = null;

  // ---- offence ----
  const smashCut = en.speed > 2.5 ? 4.25 : 4.75;
  if (canSmash && !en.airborne && d <= smashCut && Math.abs(angToEn) < 1.35 && visible) {
    ordered = 'smash';
    faceP = lead(en, 0.3);
    lastSmashT = p.t;
  } else if (canCharge && visible && d >= 2.8 && d <= 11.6 && Math.abs(angToEn) < 1.0) {
    const a = chargeAim(p);
    const dir = V.norm({ x: a.x - me.x, z: a.z - me.z });
    const want = Math.hypot(a.x - me.x, a.z - me.z);
    const r = api.ray(dir.x, dir.z, Math.min(12.5, want + 1.0));
    if (r.dist >= Math.min(want - 1.6, 12)) {
      ordered = 'charge';
      faceP = a;
    }
  }

  if (ordered === 'smash') api.use('smash');
  else if (ordered === 'charge') api.use('charge');

  // ---- movement ----
  let mdir = { x: toEn.x, z: toEn.z };
  let usedMoveTo = false;

  if (!visible) {
    api.moveTo(en.x, en.z);
    usedMoveTo = true;
  } else if (lasering && !canCharge && !canSmash && d > 9) {
    const cp = coverPoint(p, api);
    if (cp) {
      api.moveTo(cp.x, cp.z);
      usedMoveTo = true;
    }
  }

  if (!usedMoveTo) {
    const pp = V.perp(toEn);
    let w = 0;
    if (lasering && d > 2.2) w = 1.15;
    else if (d > 6.5) w = 0.4;
    else if (d > 3.0) w = 0.25;

    if (w > 0) {
      let fwd = lasering ? 0.7 : 1.0;
      let cand = V.norm({ x: toEn.x * fwd + pp.x * strafeSign * w, z: toEn.z * fwd + pp.z * strafeSign * w });
      const probe = { x: me.x + cand.x * 2.6, z: me.z + cand.z * 2.6 };
      if (Math.abs(probe.x) > 19.0 || Math.abs(probe.z) > 19.0) {
        strafeSign = -strafeSign;
        cand = V.norm({ x: toEn.x * fwd + pp.x * strafeSign * w, z: toEn.z * fwd + pp.z * strafeSign * w });
      }
      mdir = cand;
    }

    if (d > 6.5) {
      const path = api.pathTo(en.x, en.z);
      if (path && !path.direct) {
        api.moveTo(en.x, en.z);
        usedMoveTo = true;
      }
    }
    if (!usedMoveTo) api.move(mdir.x, mdir.z);
  }

  api.faceAt(faceP.x, faceP.z);

  if (p.t - lastSay > 6.5) {
    lastSay = p.t;
    const lines = ['Come here, squid.', 'No blink saves you.', 'FISTS.', 'I am the mountain.'];
    api.say(lines[Math.floor(api.rand() * lines.length)]);
  }
}
