const OBS_PAD = 0.0;
let prevDir = { x: 0, z: 1 };
let lastChargeStart = -99;
let lastSmashStart = -99;
let said = false;

function segHitsBox(ax, az, bx, bz, o, pad) {
  const minx = o.x - o.hx - pad, maxx = o.x + o.hx + pad;
  const minz = o.z - o.hz - pad, maxz = o.z + o.hz + pad;
  const dx = bx - ax, dz = bz - az;
  let t0 = 0, t1 = 1;
  if (Math.abs(dx) < 1e-9) {
    if (ax < minx || ax > maxx) return false;
  } else {
    let ta = (minx - ax) / dx, tb = (maxx - ax) / dx;
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  if (Math.abs(dz) < 1e-9) {
    if (az < minz || az > maxz) return false;
  } else {
    let ta = (minz - az) / dz, tb = (maxz - az) / dz;
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  return true;
}

function losClear(a, b, obs, pad) {
  for (const o of obs) if (segHitsBox(a.x, a.z, b.x, b.z, o, pad || 0)) return false;
  return true;
}

function pickDir(p, api, obs, R, wantLos) {
  const me = p.self, en = p.enemy;
  const ep = { x: en.x + en.vx * 0.35, z: en.z + en.vz * 0.35 };
  let best = null, bestScore = -1e9;
  const N = 24;
  for (let i = 0; i < N; i++) {
    const a = i * Math.PI * 2 / N;
    const d = { x: Math.sin(a), z: Math.cos(a) };
    let probe;
    try { probe = api.ray(d.x, d.z, 3.6); } catch (e) { probe = { hit: false, dist: 3.6 }; }
    let step = 3.0;
    if (probe && probe.hit) step = Math.min(3.0, probe.dist - 1.2);
    if (step < 0.7) continue;
    const pos = { x: me.x + d.x * step, z: me.z + d.z * step };
    let s = 0;
    const dE = Math.hypot(pos.x - ep.x, pos.z - ep.z);
    s -= Math.abs(dE - R) * 1.7;
    const margin = 19 - Math.max(Math.abs(pos.x), Math.abs(pos.z));
    if (margin < 4.5) s -= (4.5 - margin) * (4.5 - margin) * 1.3;
    s += (d.x * prevDir.x + d.z * prevDir.z) * 1.5;
    if (wantLos !== 0) {
      const clear = losClear(pos, { x: en.x, z: en.z }, obs, 0);
      if (wantLos > 0 && clear) s += wantLos;
      if (wantLos < 0 && !clear) s += -wantLos;
    }
    if (s > bestScore) { bestScore = s; best = d; }
  }
  return best;
}

function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive) return;
  const obs = p.arena.obstacles || [];
  const t = p.t;

  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      if (e.skill === 'charge') lastChargeStart = t;
      else if (e.skill === 'smash') lastSmashStart = t;
    }
  }

  if (!said) { said = true; api.say("eight arms, one beam"); }

  if (me.stunned || me.airborne) {
    api.faceAt(en.x, en.z);
    return;
  }

  const dist = en.dist;
  const enCast = en.casting;

  // ---- aim prediction ----
  let tf = 0.7;
  if (me.casting && me.casting.skill === 'laser') {
    tf = Math.max(0, Math.min(0.7, (me.casting.remaining || 0.7) - 0.1));
  }
  let lead = { x: en.vx * tf, z: en.vz * tf };
  const lm = Math.hypot(lead.x, lead.z);
  if (lm > 6) { lead.x *= 6 / lm; lead.z *= 6 / lm; }
  const aim = { x: en.x + lead.x, z: en.z + lead.z };

  // ---- charge dodge ----
  const dashing = (enCast && enCast.skill === 'charge' && enCast.phase === 'dash') || en.speed > 8.5;
  const chargeWindup = !!(enCast && enCast.skill === 'charge' && enCast.phase === 'windup');
  const smashWindup = !!(enCast && enCast.skill === 'smash' && enCast.telegraph);

  if (dashing) {
    let dir = en.speed > 3 ? V.norm({ x: en.vx, z: en.vz }) : V.fromHeading(en.heading);
    const rel = { x: me.x - en.x, z: me.z - en.z };
    const q = { x: dir.z, z: -dir.x };
    const along = rel.x * dir.x + rel.z * dir.z;
    const lat = rel.x * q.x + rel.z * q.z;
    if (along > -2.5 && along < 15.5 && Math.abs(lat) < 3.5) {
      const side = lat >= 0 ? 1 : -1;
      if (api.ready('blink') && !me.busy) {
        const cands = [
          { x: q.x * side, z: q.z * side },
          { x: -q.x * side, z: -q.z * side },
          { x: -dir.x, z: -dir.z }
        ];
        let bd = null;
        for (const c of cands) {
          const tx = me.x + c.x * 7.0, tz = me.z + c.z * 7.0;
          if (Math.abs(tx) < 18.5 && Math.abs(tz) < 18.5) { bd = c; break; }
        }
        if (!bd) bd = cands[0];
        api.use('blink', bd.x, bd.z);
        api.move(bd.x, bd.z);
        api.faceAt(en.x, en.z);
        prevDir = bd;
        return;
      } else {
        let d = { x: q.x * side, z: q.z * side };
        if (Math.abs(me.x + d.x * 4) > 18.5 || Math.abs(me.z + d.z * 4) > 18.5) d = { x: -d.x, z: -d.z };
        api.move(d.x, d.z);
        api.faceAt(en.x, en.z);
        prevDir = d;
        return;
      }
    }
  }

  // ---- smash dodge ----
  if (smashWindup && dist < 6.8 && !me.busy) {
    const away = V.away({ x: me.x, z: me.z }, { x: en.x, z: en.z });
    let d = away;
    if (Math.abs(me.x + d.x * 4) > 18.6 || Math.abs(me.z + d.z * 4) > 18.6) d = V.perp(away);
    if (api.ready('jump')) {
      api.move(d.x, d.z);
      api.use('jump');
      api.faceAt(en.x, en.z);
      prevDir = d;
      return;
    } else if (api.ready('blink')) {
      let bd = away;
      if (Math.abs(me.x + bd.x * 7) > 18.5 || Math.abs(me.z + bd.z * 7) > 18.5) bd = V.perp(away);
      api.use('blink', bd.x, bd.z);
      api.move(bd.x, bd.z);
      api.faceAt(en.x, en.z);
      prevDir = bd;
      return;
    }
  }

  // ---- panic escape from melee range ----
  const chargeLikelyDown = (t - lastChargeStart) < 3.5;
  if (!me.busy && !dashing && !chargeWindup && api.ready('blink') &&
      (dist < 3.4 || (dist < 5.0 && chargeLikelyDown))) {
    const away = V.away({ x: me.x, z: me.z }, { x: en.x, z: en.z });
    let bd = away;
    if (Math.abs(me.x + bd.x * 7) > 18.5 || Math.abs(me.z + bd.z * 7) > 18.5) {
      const alt = V.perp(away);
      bd = (Math.abs(me.x + alt.x * 7) < 18.5 && Math.abs(me.z + alt.z * 7) < 18.5)
        ? alt : { x: -alt.x, z: -alt.z };
    }
    api.use('blink', bd.x, bd.z);
    api.move(bd.x, bd.z);
    api.faceAt(en.x, en.z);
    prevDir = bd;
    return;
  }

  // ---- laser ----
  let fired = false;
  if (api.ready('laser') && !me.busy && en.visible && dist < 22 && !en.invulnerable) {
    const recovering = !!(enCast && enCast.phase === 'recover');
    const safe = dist > 7.0 || en.stunned || en.airborne || recovering;
    const ang = Math.abs(V.angleTo(me.heading, V.toward({ x: me.x, z: me.z }, aim)));
    if (safe && ang < 1.1 && losClear({ x: me.x, z: me.z }, aim, obs, OBS_PAD)) {
      api.use('laser');
      fired = true;
    }
  }

  // ---- ranging ----
  const cd = api.cooldown('laser');
  const casting = !!(me.casting && me.casting.skill === 'laser');
  let R;
  if (casting || fired) R = 12.5;
  else if (cd > 1.3) R = 16.5;
  else R = 12.5;
  if (dist < 6) R = Math.max(R, 14);

  let wantLos = 0;
  if (casting || fired || cd < 0.8) wantLos = 3.0;
  else if (cd > 1.4 && dist < 12) wantLos = -2.5;

  let d = null;
  if (!en.visible && dist > 9.5) {
    let path = null;
    try { path = api.pathTo(en.x, en.z); } catch (e) { path = null; }
    if (path && path.points && path.points.length) {
      const w = path.points[0];
      const dd = V.toward({ x: me.x, z: me.z }, { x: w.x, z: w.z });
      if (V.len(dd) > 0.001) d = dd;
    }
  }

  if (!d) d = pickDir(p, api, obs, R, wantLos);

  if (!d) {
    const away = V.away({ x: me.x, z: me.z }, { x: en.x, z: en.z });
    d = (Math.abs(me.x) > 17 || Math.abs(me.z) > 17)
      ? V.toward({ x: me.x, z: me.z }, { x: 0, z: 0 })
      : away;
  }

  // strafe bias while the gorilla winds up a charge
  if (chargeWindup) {
    const away = V.away({ x: me.x, z: me.z }, { x: en.x, z: en.z });
    let q = V.perp(away);
    if (q.x * d.x + q.z * d.z < 0) q = { x: -q.x, z: -q.z };
    if (Math.abs(me.x + q.x * 4) > 18.5 || Math.abs(me.z + q.z * 4) > 18.5) q = { x: -q.x, z: -q.z };
    d = V.norm({ x: d.x * 0.35 + q.x, z: d.z * 0.35 + q.z });
  }

  prevDir = d;
  api.move(d.x, d.z);
  api.faceAt(aim.x, aim.z);
}
