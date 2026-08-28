function dodgeDir(p) {
  const me = p.self, en = p.enemy;
  const cd = (en.speed > 3) ? V.norm({ x: en.vx, z: en.vz }) : V.fromHeading(en.heading);
  const per = V.perp(cd);
  const aw = V.norm({ x: me.x - en.x, z: me.z - en.z });
  const half = p.arena.half;
  const cands = [];
  for (const s of [1, -1]) {
    for (const b of [0, 0.6, 1.3]) {
      const d = V.norm({ x: per.x * s + aw.x * b, z: per.z * s + aw.z * b });
      if (d.x !== 0 || d.z !== 0) cands.push(d);
    }
  }
  let best = aw, bs = -1e9;
  for (const d of cands) {
    const L = { x: me.x + d.x * 7.5, z: me.z + d.z * 7.5 };
    const lat = Math.abs((L.x - en.x) * per.x + (L.z - en.z) * per.z);
    const fwd = (L.x - en.x) * cd.x + (L.z - en.z) * cd.z;
    let s = lat * 1.6;
    if (fwd < 0) s += 3;
    const m = Math.min(half - Math.abs(L.x), half - Math.abs(L.z));
    s += Math.min(m, 6) * 1.3;
    if (m < 1.0) s -= 25;
    if (s > bs) { bs = s; best = d; }
  }
  return best;
}

function kite(p, api, desired, prev) {
  const me = p.self, en = p.enemy;
  const half = p.arena.half;
  const N = 24;
  let best = V.norm({ x: me.x - en.x, z: me.z - en.z }), bs = -1e9;
  for (let i = 0; i < N; i++) {
    const a = i * 2 * Math.PI / N;
    const d = { x: Math.sin(a), z: Math.cos(a) };
    let clear = 4.5;
    try {
      const r = api.ray(d.x, d.z, 4.5);
      if (r && typeof r.dist === 'number') clear = r.dist;
    } catch (e) { clear = 4.5; }
    const step = Math.min(3.0, Math.max(0, clear - 1.35));
    const q = { x: me.x + d.x * step, z: me.z + d.z * step };
    let s = 0;
    const de = Math.hypot(q.x - en.x, q.z - en.z);
    s -= Math.abs(de - desired) * 1.2;
    if (de < desired) s -= (desired - de) * 2.2;
    const m = Math.min(half - Math.abs(q.x), half - Math.abs(q.z));
    if (m < 6.5) s -= (6.5 - m) * 2.6;
    if (clear < 2.2) s -= 22 * (2.2 - clear);
    const dc = Math.hypot(q.x, q.z);
    if (dc > 15) s -= (dc - 15) * 1.5;
    if (prev) s += (d.x * prev.x + d.z * prev.z) * 1.8;
    if (s > bs) { bs = s; best = d; }
  }
  return best;
}

let prevDir = null;
let lastCharge = -99, lastSmash = -99, said = false;

function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me || !me.alive || !en) return;
  const t = p.t;

  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      if (e.skill === 'charge') lastCharge = t;
      else if (e.skill === 'smash') lastSmash = t;
    }
  }

  const dist = en.dist;
  const half = p.arena.half;

  if (!said) { said = true; api.say("eight arms, one beam"); }

  // ---------- facing ----------
  let lead = 0.22;
  if (me.casting && me.casting.skill === 'laser' && me.casting.telegraph) {
    lead = Math.max(0, me.casting.remaining);
  }
  api.faceAt(en.x + en.vx * lead * 0.9, en.z + en.vz * lead * 0.9);

  if (me.airborne || me.stunned) return;

  const ec = en.casting;
  const chargeNow = !!(ec && ec.skill === 'charge' &&
    (ec.phase === 'dash' || (ec.phase === 'windup' && ec.remaining <= 0.09)));
  const smashWind = !!(ec && ec.skill === 'smash' && ec.telegraph);

  let handled = false;

  // ---------- dodge the charge ----------
  if (chargeNow) {
    const d = dodgeDir(p);
    api.move(d.x, d.z);
    prevDir = d;
    if (!me.busy && api.ready('blink')) api.use('blink', d.x, d.z);
    handled = true;
  }
  // ---------- dodge the smash ----------
  else if (smashWind && dist < 5.9) {
    const d = kite(p, api, 15, prevDir);
    api.move(d.x, d.z);
    prevDir = d;
    if (!me.busy) {
      if (api.ready('jump')) api.use('jump');
      else if (api.ready('blink')) api.use('blink', d.x, d.z);
    }
    handled = true;
  }
  // ---------- too close, break away ----------
  else if (dist < 5.0 && !me.busy && api.ready('blink')) {
    const d = kite(p, api, 15, prevDir);
    api.move(d.x, d.z);
    prevDir = d;
    api.use('blink', d.x, d.z);
    handled = true;
  }

  if (!handled) {
    const cdL = api.cooldown('laser');

    // ---------- fire ----------
    const freeWindow = en.stunned || en.airborne || (ec && ec.phase === 'recover');
    const minRange = freeWindow ? 2.0 : 8.0;
    if (!me.busy && api.ready('laser') && en.visible && dist <= 22.5 &&
        dist >= minRange && !smashWind && !(ec && ec.skill === 'charge')) {
      api.use('laser');
    }

    // ---------- movement ----------
    let desired;
    if (cdL < 0.45) desired = 12.5;
    else if (cdL < 1.2) desired = 15;
    else desired = 17;
    if (me.hp < 55) desired += 2;

    if (!en.visible && dist > 10 && cdL < 0.8) {
      let stepped = false;
      const path = api.pathTo(en.x, en.z);
      if (path && path.points && path.points.length) {
        const w = path.points[0];
        const d = V.norm({ x: w.x - me.x, z: w.z - me.z });
        if (d.x !== 0 || d.z !== 0) {
          api.move(d.x, d.z);
          prevDir = d;
          stepped = true;
        }
      }
      if (!stepped) {
        const d = kite(p, api, desired, prevDir);
        api.move(d.x, d.z);
        prevDir = d;
      }
    } else {
      const d = kite(p, api, desired, prevDir);
      api.move(d.x, d.z);
      prevDir = d;
    }
  }
}
