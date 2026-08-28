function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me || !me.alive) return;
  const t = p.t;
  const half = p.arena.half;
  const obs = p.arena.obstacles || [];
  const dist = en.dist;

  // ---------- digest events ----------
  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      if (e.skill === 'charge') { lastChargeStart = t; chargeCommitted = false; }
      else if (e.skill === 'smash') lastSmashStart = t;
    } else if (e.type === 'enemyCommitted') {
      if (e.skill === 'charge') {
        chargeCommitted = true;
        chargeCommitTime = t;
        chargeDir = { x: Math.sin(en.heading), z: Math.cos(en.heading) };
        chargeOrigin = { x: en.x, z: en.z };
      }
    } else if (e.type === 'dealt') {
      hits++;
    } else if (e.type === 'missed') {
      misses++;
    } else if (e.type === 'blinked') {
      lastBlink = t;
    }
  }

  // fallback detection straight from their cast state
  const ec = en.casting;
  if (ec && ec.skill === 'charge') {
    lastChargeStart = Math.max(lastChargeStart, t - (ec.elapsed || 0));
    if (ec.phase === 'dash') {
      if (!chargeCommitted || t - chargeCommitTime > 1.0) {
        chargeCommitted = true;
        chargeCommitTime = t;
        chargeDir = { x: Math.sin(en.heading), z: Math.cos(en.heading) };
        chargeOrigin = { x: en.x, z: en.z };
      }
    }
  }
  if (ec && ec.skill === 'smash') lastSmashStart = Math.max(lastSmashStart, t - (ec.elapsed || 0));
  if (chargeCommitted && t - chargeCommitTime > 1.25) chargeCommitted = false;

  let chargeCd = Math.max(0, 4.5 - (t - lastChargeStart));
  if (en.cooldowns && typeof en.cooldowns.charge === 'number') {
    chargeCd = Math.min(chargeCd, en.cooldowns.charge);
  }
  const chargeThreat = chargeCd < 0.35;

  const dashActive = chargeCommitted && (t - chargeCommitTime) < 0.95;
  const smashSoon = !!(ec && ec.skill === 'smash' && ec.telegraph);

  // ---------- geometry ----------
  const toEn = { x: en.x - me.x, z: en.z - me.z };
  const toEnN = V.norm(toEn);
  const awayN = { x: -toEnN.x, z: -toEnN.z };

  // ---------- 1. dodge an in-flight charge ----------
  if (dashActive) {
    const rel = { x: me.x - en.x, z: me.z - en.z };
    const along = rel.x * chargeDir.x + rel.z * chargeDir.z;
    const cross = rel.x * chargeDir.z - rel.z * chargeDir.x;
    const inLane = along > -1.2 && along < 15 && Math.abs(cross) < 3.4;
    if (inLane) {
      let sign = cross >= 0 ? 1 : -1;
      let perp = { x: chargeDir.z * sign, z: -chargeDir.x * sign };
      // avoid slamming into a wall sideways
      const px = me.x + perp.x * 6, pz = me.z + perp.z * 6;
      if (Math.abs(px) > half - 1.5 || Math.abs(pz) > half - 1.5) {
        perp = { x: -perp.x, z: -perp.z };
      }
      if (api.ready('blink') && Math.abs(along) < 13) {
        const bd = chooseBlink(p, api, perp);
        api.use('blink', bd.x, bd.z);
        api.face(toEnN.x, toEnN.z);
        prevMoveDir = perp;
        api.move(perp.x, perp.z);
        return;
      }
      const escape = V.norm({ x: perp.x * 1.6 + awayN.x * 0.5, z: perp.z * 1.6 + awayN.z * 0.5 });
      prevMoveDir = escape;
      api.move(escape.x, escape.z);
      api.face(toEnN.x, toEnN.z);
      return;
    }
  }

  // ---------- 2. dodge a smash ----------
  if (smashSoon && dist < 4.8 && !me.airborne) {
    if (api.ready('blink')) {
      const bd = chooseBlink(p, api, awayN);
      api.use('blink', bd.x, bd.z);
      api.move(awayN.x, awayN.z);
      api.face(toEnN.x, toEnN.z);
      prevMoveDir = awayN;
      return;
    }
    if (api.ready('jump') && ec && ec.remaining !== undefined && ec.remaining > 0.12) {
      api.use('jump');
      api.move(awayN.x, awayN.z);
      api.face(toEnN.x, toEnN.z);
      prevMoveDir = awayN;
      return;
    }
    prevMoveDir = awayN;
    api.move(awayN.x, awayN.z);
    api.face(toEnN.x, toEnN.z);
    return;
  }

  // ---------- distance policy ----------
  const myFrac = me.hp / me.maxHp, enFrac = en.hp / en.maxHp;
  let wantDist;
  if (chargeCd > 1.3) wantDist = 9.0;
  else wantDist = 16.0;
  if (p.timeLeft < 14 && myFrac > enFrac + 0.02) wantDist = 18.0;
  if (dist > 24) wantDist = Math.min(wantDist, 15.0);

  // ---------- 3. preemptive escape blink ----------
  if (!me.busy && api.ready('blink') && !me.airborne) {
    const cramped = (chargeThreat && dist < 9.5) || dist < 4.2 ||
                    (chargeCd < 1.0 && dist < 7.0);
    if (cramped) {
      const bd = chooseBlink(p, api, awayN);
      api.use('blink', bd.x, bd.z);
      api.face(toEnN.x, toEnN.z);
      prevMoveDir = awayN;
      api.move(awayN.x, awayN.z);
      return;
    }
  }

  // ---------- 4. laser ----------
  const casting = me.casting && me.casting.skill === 'laser';
  let aim = null;

  if (casting) {
    aim = predict(api, me, en, Math.max(0.02, (me.casting.remaining || 0.2) + 0.03));
  } else if (!me.busy && !me.airborne && !me.stunned && api.ready('laser')) {
    const safeWindow = (chargeCd > 1.0) || dist > 15.0;
    if (en.visible && dist < 22.5 && dist > 2.6 && safeWindow && !dashActive) {
      api.use('laser');
      aim = predict(api, me, en, 0.6);
    }
  }

  // ---------- 5. movement ----------
  const laneBonus = (chargeThreat && dist < 15) ? 1.0 : 0.15;
  let mv = null;

  if (!en.visible && dist > wantDist + 2.5 && chargeCd > 0.6) {
    api.moveTo(en.x, en.z);
    prevMoveDir = toEnN;
  } else {
    mv = chooseMove(p, api, wantDist, laneBonus, toEnN);
    if (mv) {
      prevMoveDir = mv;
      api.move(mv.x, mv.z);
    } else {
      api.move(awayN.x, awayN.z);
    }
  }

  // ---------- 6. facing ----------
  if (!aim) aim = predict(api, me, en, 0.12);
  api.face(aim.x - me.x, aim.z - me.z);

  if (t - lastSay > 7.5) {
    lastSay = t;
    api.say(dist > 12 ? "eight arms, one beam" : "too close, ape");
  }
}

let lastChargeStart = -99;
let lastSmashStart = -99;
let chargeCommitted = false;
let chargeCommitTime = -99;
let chargeDir = { x: 0, z: 1 };
let chargeOrigin = { x: 0, z: 0 };
let prevMoveDir = null;
let lastBlink = -99;
let lastSay = -99;
let hits = 0, misses = 0;

const DIRS = (() => {
  const a = [];
  for (let i = 0; i < 24; i++) {
    const h = (i * Math.PI * 2) / 24;
    a.push({ x: Math.sin(h), z: Math.cos(h) });
  }
  return a;
})();

function wallPen(x, z, half) {
  const m = Math.min(half - Math.abs(x), half - Math.abs(z));
  return m < 4.5 ? (4.5 - m) * 1.15 : 0;
}

function insideObs(obs, x, z, pad) {
  for (const o of obs) {
    if (Math.abs(x - o.x) < o.hx + pad && Math.abs(z - o.z) < o.hz + pad) return true;
  }
  return false;
}

function predict(api, me, en, lead) {
  let vx = en.vx || 0, vz = en.vz || 0;
  if (en.casting && en.casting.telegraph && en.casting.skill !== 'charge') { vx *= 0.35; vz *= 0.35; }
  let L = lead;
  const sp = Math.hypot(vx, vz);
  if (sp > 13) L = Math.min(L, 0.5);
  let px = en.x + vx * L, pz = en.z + vz * L;
  const half = 20;
  px = Math.max(-half + 0.5, Math.min(half - 0.5, px));
  pz = Math.max(-half + 0.5, Math.min(half - 0.5, pz));
  if (!api.los(px, pz) && en.visible) return { x: en.x, z: en.z };
  return { x: px, z: pz };
}

function chooseMove(p, api, wantDist, laneBonus, toEnN) {
  const me = p.self, en = p.enemy, half = p.arena.half, obs = p.arena.obstacles || [];
  let best = null, bestS = -1e9;
  for (const d of DIRS) {
    const r = api.ray(d.x, d.z, 4.2);
    const clear = Math.min(r && r.dist !== undefined ? r.dist : 4.2, 4.2);
    const step = Math.max(0, Math.min(clear - 1.15, 3.0));
    const fx = me.x + d.x * step, fz = me.z + d.z * step;
    const nd = Math.hypot(fx - en.x, fz - en.z);
    let s = -1.35 * Math.abs(nd - wantDist);
    s += 0.5 * clear;
    s -= wallPen(fx, fz, half);
    if (step < 0.7) s -= 5;
    if (insideObs(obs, fx, fz, 1.15)) s -= 6;
    const lateral = Math.abs(d.x * toEnN.z - d.z * toEnN.x);
    s += laneBonus * lateral;
    if (prevMoveDir) s += 0.65 * (d.x * prevMoveDir.x + d.z * prevMoveDir.z);
    if (s > bestS) { bestS = s; best = d; }
  }
  return best;
}

function chooseBlink(p, api, prefer) {
  const me = p.self, en = p.enemy, half = p.arena.half, obs = p.arena.obstacles || [];
  let best = prefer, bestS = -1e9;
  for (const d of DIRS) {
    const dotp = d.x * prefer.x + d.z * prefer.z;
    if (dotp < 0.1) continue;
    const lx = me.x + d.x * 7.4, lz = me.z + d.z * 7.4;
    const cx = Math.max(-half + 1.4, Math.min(half - 1.4, lx));
    const cz = Math.max(-half + 1.4, Math.min(half - 1.4, lz));
    let s = 0;
    s += Math.hypot(cx - me.x, cz - me.z) * 0.9;
    s += Math.hypot(cx - en.x, cz - en.z) * 1.0;
    s -= wallPen(cx, cz, half) * 0.7;
    s += dotp * 1.4;
    if (insideObs(obs, cx, cz, 1.2)) s -= 4;
    if (s > bestS) { bestS = s; best = d; }
  }
  return best;
}
