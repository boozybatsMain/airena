const CONE_HALF_FALLBACK = 55 * Math.PI / 180;
let usedAt = {};
let lastDir = null;
let lastSay = -9;
let mode = 'start';

function num(v, fb) { return (typeof v === 'number' && isFinite(v)) ? v : fb; }

function pickSkill(kit, names, test) {
  for (const n of names || []) {
    const k = kit && kit[n];
    if (k && test(String(k.kind || '').toLowerCase(), k)) return n;
  }
  return null;
}

function skillsOf(kit, names) {
  const dash = pickSkill(kit, names, (kd, k) => /dash|lunge/.test(kd) || k.dashSpeed !== undefined);
  const cone = pickSkill(kit, names, (kd, k) => /cone|fan|wedge/.test(kd) || k.halfAngle !== undefined);
  const self = pickSkill(kit, names, (kd, k) => /self|aura/.test(kd) || (k.aim === 'none' && kd !== 'dash'));
  return { dash, cone, self };
}

function halfAngleOf(k) {
  const h = num(k && k.halfAngle, CONE_HALF_FALLBACK);
  return h > Math.PI ? h * Math.PI / 180 : h;
}

function clampArena(p, pos, r) {
  const lim = p.arena.half - r;
  return { x: Math.max(-lim, Math.min(lim, pos.x)), z: Math.max(-lim, Math.min(lim, pos.z)) };
}

function predEnemy(p, dt) {
  const e = p.enemy, s = p.self;
  const en = { x: e.x, z: e.z };
  if (e.stunned || e.rooted) return en;
  const c = e.casting;
  const k = c && e.kit[c.skill];
  const isDash = k && (/dash|lunge/.test(String(k.kind || '').toLowerCase()) || k.dashSpeed !== undefined);
  if (isDash && (c.telegraph || c.phase === 'dash')) {
    const sp = num(k.dashSpeed, 20), total = num(k.distance, 8), wu = num(k.windup, 0.2);
    const tStart = c.telegraph ? Math.max(0, wu - c.elapsed) : 0;
    const travelLeft = c.telegraph ? total : Math.max(0, total - sp * (c.elapsed - wu));
    const dir = c.telegraph ? V.toward(en, s) : V.fromHeading(e.heading);
    let mv = Math.min(travelLeft, sp * Math.max(0, dt - tStart));
    const toMe = V.sub(s, en);
    if (V.dot(V.norm(toMe), dir) > 0.85) mv = Math.min(mv, Math.max(0, V.len(toMe) - s.radius - e.radius));
    return clampArena(p, V.add(en, V.scale(dir, mv)), e.radius);
  }
  return clampArena(p, { x: e.x + e.vx * dt, z: e.z + e.vz * dt }, e.radius);
}

function steer(p, api, target, extra) {
  const s = p.self;
  const me = { x: s.x, z: s.z };
  const sp = num(s.maxSpeed, 6);
  const dt = 0.5;
  const ep = predEnemy(p, dt);
  let best = null, bs = -1e9;
  for (let i = 0; i < 16; i++) {
    const dir = V.fromHeading(i * Math.PI * 2 / 16);
    const pos = { x: me.x + dir.x * sp * dt, z: me.z + dir.z * sp * dt };
    let sc = -Math.abs(V.dist(pos, ep) - target) * 2;
    const r = api.ray(dir.x, dir.z, 4.5);
    if (r.hit) sc -= (4.5 - r.dist) * 2.5;
    const margin = p.arena.half - Math.max(Math.abs(pos.x), Math.abs(pos.z)) - s.radius;
    if (margin < 2.5) sc -= (2.5 - margin) * 3;
    sc -= V.len(pos) * 0.05;
    if (extra) sc += extra(dir, pos);
    if (lastDir) sc += V.dot(dir, lastDir) * 0.4;
    if (sc > bs) { bs = sc; best = dir; }
  }
  lastDir = best;
  api.move(best.x, best.z);
}

function say(p, api, text, gap) {
  if (p.t - lastSay < (gap || 4)) return;
  lastSay = p.t;
  api.say(text);
}

function think(p, api) {
  const s = p.self, e = p.enemy;
  for (const ev of p.events) {
    if (ev.type === 'enemyStarted') usedAt[ev.skill] = p.t;
  }
  if (p.t < 0.2) say(p, api, "Heavier, faster, hungrier. Come on.", 0);

  const my = skillsOf(s.kit, s.skills), th = skillsOf(e.kit, e.skills);
  const me = { x: s.x, z: s.z }, en = { x: e.x, z: e.z };
  const d = e.dist;
  const kd = my.dash ? s.kit[my.dash] : null;
  const kc = my.cone ? s.kit[my.cone] : null;
  const ks = my.self ? s.kit[my.self] : null;
  const ekd = th.dash ? e.kit[th.dash] : null;
  const ekc = th.cone ? e.kit[th.cone] : null;
  const myDashReach = kd ? num(kd.distance, 8) + s.radius + e.radius : 0;
  const myConeReach = kc ? num(kc.range, 3.4) + e.radius : 0;
  const theirDashReach = ekd ? num(ekd.distance, 8) + s.radius + e.radius : 0;
  const theirConeReach = ekc ? num(ekc.range, 3.4) + s.radius : 0;
  const enemyCd = (n) => {
    if (!n) return 99;
    const t0 = usedAt[n];
    if (t0 === undefined) return 0;
    return Math.max(0, num(e.kit[n].cooldown, 3) - (p.t - t0));
  };
  const dashReady = !!(kd && api.ready(my.dash));
  const coneReady = !!(kc && api.ready(my.cone));
  const selfReady = !!(ks && api.ready(my.self));
  const canAct = !s.busy && !s.stunned;
  const ec = e.casting;

  if (s.stunned) { mode = 'stunned'; api.remember('mode', mode); return; }
  if (s.casting && s.casting.phase === 'dash') { mode = 'dashing'; api.remember('mode', mode); return; }

  api.faceAt(en.x, en.z);

  const angleOk = (pt, windup, turnMult, tol) => {
    const dir = V.toward(me, pt);
    const need = Math.abs(V.angleTo(s.heading, dir));
    return need <= num(s.turnRate, 5) * turnMult * windup + tol;
  };

  const tryCone = (pt) => {
    if (!coneReady || !canAct) return false;
    const wu = num(kc.windup, 0.3);
    const target = pt || predEnemy(p, wu);
    const pd = V.dist(me, target);
    if (pd > myConeReach - 0.25) return false;
    if (!api.los(target.x, target.z)) return false;
    if (!angleOk(target, wu, 0.83, halfAngleOf(kc) - 0.1)) return false;
    api.faceAt(target.x, target.z);
    api.use(my.cone, { x: target.x, z: target.z });
    mode = 'cone';
    return true;
  };

  const tryDash = () => {
    if (!dashReady || !canAct || !e.visible) return false;
    const wu = num(kd.windup, 0.2);
    const target = predEnemy(p, wu);
    const pd = V.dist(me, target);
    if (pd > myDashReach - 0.8) return false;
    if (!api.los(target.x, target.z)) return false;
    if (!angleOk(target, wu, 0.89, Math.atan2(2.4, Math.max(1, pd)))) return false;
    api.faceAt(target.x, target.z);
    api.use(my.dash, { x: target.x, z: target.z });
    mode = 'dash';
    say(p, api, "Hold still.", 6);
    return true;
  };

  // ---- threat handling: enemy telegraphs ----
  if (ec && ec.telegraph && e.visible) {
    const ek = e.kit[ec.skill] || {};
    if (ec.skill === th.dash && d <= theirDashReach + 1.5) {
      if (tryCone()) { api.move(0, 0); api.remember('mode', 'counter'); return; }
      const lineDir = V.toward(en, me);
      if (d <= theirDashReach - 2.5 && selfReady && canAct && !coneReady) {
        api.use(my.self);
        mode = 'brace';
      } else mode = 'dodge';
      steer(p, api, d + 3, (dir, pos) => {
        const rel = V.sub(pos, en);
        const along = V.dot(rel, lineDir);
        const lat = Math.abs(rel.x * lineDir.z - rel.z * lineDir.x);
        return Math.min(lat, 5) * 2.2 + (along < 0 ? 3 : 0);
      });
      api.remember('mode', mode);
      return;
    }
    if (ec.skill === th.cone && d <= theirConeReach + 2.5 && !e.stunned) {
      mode = 'backoff';
      steer(p, api, 14, null);
      api.remember('mode', mode);
      return;
    }
  }
  if (ec && ec.phase === 'dash' && e.visible) {
    const lineDir = V.fromHeading(e.heading);
    const rel = V.sub(me, en);
    const lat = Math.abs(rel.x * lineDir.z - rel.z * lineDir.x);
    if (V.dot(rel, lineDir) > 0 && lat < 4) {
      if (tryCone()) { api.move(0, 0); api.remember('mode', 'counter'); return; }
      mode = 'dodge';
      steer(p, api, d + 3, (dir, pos) => {
        const r2 = V.sub(pos, en);
        const l2 = Math.abs(r2.x * lineDir.z - r2.z * lineDir.x);
        return Math.min(l2, 5) * 2.2;
      });
      api.remember('mode', mode);
      return;
    }
  }

  // ---- aggression assessment ----
  const hpF = s.hp / s.maxHp, ehF = e.hp / e.maxHp;
  const theirConeCd = enemyCd(th.cone);
  const aggressive = !ekc || theirConeCd > 0.55 || e.stunned || e.rooted
    || (ec && ec.phase === 'recover' && ec.remaining > 0.35)
    || p.t > 20 || hpF - ehF > 0.12 || !kc
    || e.hp <= num(kd && kd.damage, 0) + num(kc && kc.damage, 0);

  // ---- offense ----
  if (canAct) {
    if (tryCone()) { steer(p, api, 0, null); api.remember('mode', mode); return; }
    if (aggressive && !(ec && ec.telegraph) && tryDash()) { api.remember('mode', mode); return; }
  }

  // ---- heal / shield ----
  if (selfReady && canAct) {
    const missing = s.maxHp - s.hp;
    const wu = num(ks.windup, 0.3);
    const predD = V.dist(me, predEnemy(p, wu));
    const want = missing >= 30 || (p.burn > 0 && missing >= 15) || (s.hp < 45 && missing >= 5);
    const safe = !e.visible || predD > theirConeReach + 1.2 || e.stunned || theirConeCd > wu + 0.1
      || (ec && ec.phase === 'recover' && ec.remaining > wu + 0.05);
    if (want && safe) {
      api.use(my.self);
      mode = 'mend';
      say(p, api, "Breathe. Not done yet.", 8);
    }
  }

  // ---- movement ----
  const somethingReady = dashReady || coneReady;
  if (!e.visible) {
    if (aggressive && somethingReady) { api.moveTo(en.x, en.z); mode = 'hunt'; }
    else { steer(p, api, 12.5, null); mode = 'wait'; }
  } else if (aggressive && somethingReady) {
    const path = api.pathTo(en.x, en.z);
    if (path && !path.direct) { api.moveTo(en.x, en.z); mode = 'hunt'; }
    else if (!dashReady && coneReady && !(e.stunned || e.rooted) && theirConeCd < 0.3 && ekc) {
      steer(p, api, theirConeReach + 1.2, null); mode = 'probe';
    } else { steer(p, api, 0, null); mode = 'hunt'; }
  } else if (somethingReady && coneReady) {
    steer(p, api, Math.max(theirConeReach + 2.5, 8.5), null); mode = 'bait';
  } else {
    const kite = Math.max(theirDashReach + 1.3, 12.5);
    steer(p, api, kite, null); mode = 'kite';
  }
  if (mode === 'kite' && p.t > 5) say(p, api, "Chase me. You're slower.", 12);
  api.remember('mode', mode);
}