const OBST_PAD = 0.6;
let lastStart = { smash: -99, charge: -99, jump: -99 };
let orbit = 1;
let lastFlip = -99;
let lastLaserT = -99;
let hitsLanded = 0;
let saidT = -99;

function perpOf(d) { return { x: d.z, z: -d.x }; }
function nrm(v) { const l = Math.hypot(v.x, v.z); return l > 1e-6 ? { x: v.x / l, z: v.z / l } : { x: 0, z: 1 }; }
function mix(a, wa, b, wb) { return nrm({ x: a.x * wa + b.x * wb, z: a.z * wa + b.z * wb }); }

function chooseDir(p, api, base) {
  const me = p.self;
  let best = base, bestS = -1e9;
  const N = 16;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const d = { x: Math.sin(a), z: Math.cos(a) };
    let r;
    try { r = api.ray(d.x, d.z, 5); } catch (err) { r = { dist: 5 }; }
    let s = Math.min(r.dist, 5) * 1.15 + 6.5 * (d.x * base.x + d.z * base.z);
    const px = me.x + d.x * 3.5, pz = me.z + d.z * 3.5;
    s -= Math.max(0, Math.abs(px) - 15.5) * 3.5 + Math.max(0, Math.abs(pz) - 15.5) * 3.5;
    if (s > bestS) { bestS = s; best = d; }
  }
  return best;
}

function safeBlinkDir(p, d) {
  const me = p.self;
  const lx = me.x + d.x * 7.5, lz = me.z + d.z * 7.5;
  if (Math.abs(lx) > 18.5 || Math.abs(lz) > 18.5) {
    const alt = { x: -d.x, z: -d.z };
    const ax = me.x + alt.x * 7.5, az = me.z + alt.z * 7.5;
    if (Math.abs(ax) <= 18.5 && Math.abs(az) <= 18.5) return alt;
    return nrm({ x: -me.x, z: -me.z });
  }
  return d;
}

function think(p, api) {
  const me = p.self, e = p.enemy;
  if (!me.alive || !e || !e.alive) return;
  const t = p.t;

  for (const ev of p.events) {
    if (ev.type === 'enemyStarted') { if (ev.skill) lastStart[ev.skill] = t; }
    else if (ev.type === 'blocked') { if (t - lastFlip > 0.6) { orbit = -orbit; lastFlip = t; } }
    else if (ev.type === 'dealt') hitsLanded++;
    else if (ev.type === 'damaged') { if (t - lastFlip > 0.8) { orbit = -orbit; lastFlip = t; } }
  }

  const mePos = { x: me.x, z: me.z }, ePos = { x: e.x, z: e.z };
  const dist = e.dist;
  const eCast = e.casting;
  const charging = !!eCast && eCast.skill === 'charge';
  const dashing = charging && eCast.phase === 'dash';
  const smashing = !!eCast && eCast.skill === 'smash' && eCast.telegraph;
  const chargeReady = lastStart.charge < 0 ? true : (t - lastStart.charge >= 3.85);

  const away = nrm({ x: me.x - e.x, z: me.z - e.z });
  const toward = { x: -away.x, z: -away.z };
  let tan = perpOf(away);
  if (orbit < 0) tan = { x: -tan.x, z: -tan.z };

  let mv = null;      // direction to move
  let mvTo = null;    // point to move to
  let skill = null;   // [name, a, b]

  // ---------- threat handling ----------
  if (dashing) {
    const dir = { x: Math.sin(e.heading), z: Math.cos(e.heading) };
    const to = { x: me.x - e.x, z: me.z - e.z };
    const along = to.x * dir.x + to.z * dir.z;
    const cross = to.x * dir.z - to.z * dir.x;
    const lat = Math.abs(cross);
    let perp = perpOf(dir);
    if (cross < 0) perp = { x: -perp.x, z: -perp.z };
    const timeToMe = Math.max(0, along) / 15;
    const evadeGain = 4.32 * timeToMe * 0.8;
    const inLane = along > -1.5 && along < 14.5;
    if (inLane && lat + evadeGain < 3.0 && api.ready('blink') && !me.airborne) {
      const bd = safeBlinkDir(p, mix(perp, 1.0, away, 0.35));
      skill = ['blink', bd.x, bd.z];
      mv = bd;
    } else {
      mv = mix(perp, 1.0, away, 0.3);
    }
  } else if (smashing && dist < 6.6) {
    const esc = mix(away, 1.0, tan, 0.6);
    mv = esc;
    const rem = eCast.remaining;
    if (rem > 0.18 && api.ready('jump') && !me.airborne) skill = ['jump'];
    else if (dist < 5.6 && api.ready('blink') && !me.airborne) {
      const bd = safeBlinkDir(p, esc);
      skill = ['blink', bd.x, bd.z];
    }
  } else if (charging) {
    // wind-up: break their aim lock with hard lateral movement
    mv = mix(tan, 1.0, away, 0.55);
  }

  // ---------- emergency spacing ----------
  if (!skill && !me.airborne && api.ready('blink')) {
    const panic = chargeReady ? 3.4 : 5.4;
    if (dist < panic) {
      const base = mix(away, 1.0, tan, 0.5);
      const bd = safeBlinkDir(p, chooseDir(p, api, base));
      skill = ['blink', bd.x, bd.z];
      if (!mv) mv = bd;
    }
  }

  // ---------- laser ----------
  if (!skill && !me.airborne && !me.busy && api.ready('laser')) {
    const okDist = dist >= 7.2 && dist <= 22.5;
    const notDodging = !dashing && !smashing && !(charging && dist < 15);
    if (okDist && e.visible && notDodging) {
      const lead = { x: e.x + e.vx * 0.35, z: e.z + e.vz * 0.35 };
      if (api.los(lead.x, lead.z) || api.los(e.x, e.z)) {
        skill = ['laser'];
        lastLaserT = t;
      }
    }
  }

  // ---------- default movement ----------
  if (!mv && !mvTo) {
    let base;
    if (!e.visible && dist > 5) {
      let path = null;
      try { path = api.pathTo(e.x, e.z); } catch (err) { path = null; }
      if (path && path.points && path.points.length) {
        const wp = path.points[0];
        base = nrm({ x: wp.x - me.x, z: wp.z - me.z });
        if (dist < 9) base = mix(base, 0.3, tan, 1.0);
      } else {
        base = mix(toward, 0.7, tan, 0.7);
      }
    } else if (dist < 8.5) {
      base = mix(away, 1.2, tan, 0.85);
    } else if (dist < 14) {
      base = mix(away, 0.35, tan, 1.0);
    } else if (dist < 19.5) {
      base = mix(tan, 1.0, away, -0.15);
    } else {
      base = mix(toward, 0.85, tan, 0.4);
    }
    if (Math.abs(me.x) > 13.5 || Math.abs(me.z) > 13.5) {
      const toC = nrm({ x: -me.x, z: -me.z });
      base = mix(base, 1.0, toC, 0.9);
    }
    mv = chooseDir(p, api, base);
  }

  // ---------- issue orders ----------
  const aimT = me.casting && me.casting.skill === 'laser' ? 0.12 : 0.3;
  api.faceAt(e.x + e.vx * aimT, e.z + e.vz * aimT);

  if (mvTo) api.moveTo(mvTo.x, mvTo.z);
  else if (mv) api.move(mv.x, mv.z);

  if (skill) {
    if (skill.length > 1) api.use(skill[0], skill[1], skill[2]);
    else api.use(skill[0]);
  }

  if (t - saidT > 6.5) {
    saidT = t;
    const frac = me.hp / me.maxHp, ef = e.hp / e.maxHp;
    api.say(frac >= ef ? "eight arms, one beam" : "ink and patience");
  }
}
