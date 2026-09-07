// ── persistent match state ─────────────────────────────────────────────
let orbitSign = 1;
let nextFlip = 0;
let prevRooted = false;
let rootStart = -99;
let lastSay = -99;
let lastHurt = -99;
let enemyCd = {};
let seenTick = -1;

function effHas(k, name) {
  if (!k) return false;
  try { return JSON.stringify(k.effects || '').toLowerCase().indexOf(name) >= 0; }
  catch (e) { return false; }
}

function durOf(k, effName) {
  const m = k && k.magnitudes;
  if (m) {
    for (const key in m) {
      if (key.toLowerCase().indexOf(effName) >= 0 && m[key] && typeof m[key].duration === 'number') return m[key].duration;
    }
  }
  return 0;
}

function dmgOf(k) {
  if (typeof k.damage === 'number' && k.damage > 0) return k.damage;
  const m = k.magnitudes;
  let best = 0;
  if (m) {
    for (const key in m) {
      const v = m[key];
      if (!v || typeof v.mag !== 'number') continue;
      if (/damage|dmg|burn|fire/i.test(key)) best = Math.max(best, v.mag);
    }
  }
  return best;
}

function reachOf(k, myR, enR) {
  const r = k.range || 0;
  if (k.kind === 'beam') return r + 1.6 + 0.3 + enR;
  if (k.kind === 'bolt') return r + 1.6 + 1.6;
  if (k.kind === 'mortar') return r + (k.splash || 0) + enR;
  if (k.kind === 'disc') return r + (k.radius || 0) + enR;
  if (k.kind === 'fan') return r + enR;
  if (k.kind === 'lunge') return (k.distance || r) + myR + enR;
  if (k.kind === 'aura') return (k.radius || r) + enR;
  return r || k.distance || 3;
}

function kitInfo(p) {
  const kit = p.self.kit || {};
  const names = p.self.skills || Object.keys(kit);
  const info = { attacks: [], blink: null };
  for (const n of names) {
    const k = kit[n];
    if (!k) continue;
    const e = { name: n, k: k, kind: k.kind, reach: reachOf(k, p.self.radius, p.enemy.radius), dmg: dmgOf(k) };
    if ((k.kind === 'blink' || k.kind === 'leap') && !info.blink) info.blink = e;
    else if (e.dmg > 0 || ['beam', 'bolt', 'mortar', 'disc', 'fan', 'lunge'].indexOf(k.kind) >= 0) info.attacks.push(e);
  }
  return info;
}

function predictAim(k, me, en) {
  const w = k.windup || 0;
  const f = 0.85;
  const ex = en.x + en.vx * w * f, ez = en.z + en.vz * w * f;
  const sp = k.speed || 0;
  if (sp > 0 && (k.kind === 'bolt' || k.kind === 'mortar')) {
    const mx = me.x + me.vx * w * 0.8, mz = me.z + me.vz * w * 0.8;
    const lead = V.lead({ x: mx, z: mz }, { x: ex, z: ez }, { x: en.vx * f, z: en.vz * f }, sp);
    if (lead && isFinite(lead.x) && isFinite(lead.z)) return lead;
  }
  return { x: ex, z: ez };
}

function wallPush(p, dir) {
  const me = p.self, half = p.arena.half || 20, m = 5;
  let rx = 0, rz = 0;
  if (me.x > half - m) rx -= (me.x - (half - m)) / m;
  if (me.x < -half + m) rx += ((-half + m) - me.x) / m;
  if (me.z > half - m) rz -= (me.z - (half - m)) / m;
  if (me.z < -half + m) rz += ((-half + m) - me.z) / m;
  return V.norm({ x: dir.x + rx * 1.7, z: dir.z + rz * 1.7 });
}

function avoidSolid(api, dir, probe) {
  if (!dir || (dir.x === 0 && dir.z === 0)) return dir;
  const r = api.ray(dir.x, dir.z, probe);
  if (!r || !r.hit || r.dist > probe - 0.2) return dir;
  const opts = [0.5, -0.5, 1.0, -1.0, 1.6, -1.6, 2.3, -2.3];
  for (const a of opts) {
    const d2 = V.rot(dir, a);
    const r2 = api.ray(d2.x, d2.z, probe);
    if (!r2 || !r2.hit || r2.dist > probe - 0.2) return d2;
  }
  return V.rot(dir, Math.PI);
}

function hideSpot(p) {
  const me = p.self, en = p.enemy;
  let best = null, bestC = 1e9;
  for (const o of (p.arena.obstacles || [])) {
    const away = V.norm({ x: o.x - en.x, z: o.z - en.z });
    if (away.x === 0 && away.z === 0) continue;
    const pad = Math.max(o.hx, o.hz) + me.radius + 1.0;
    const px = o.x + away.x * pad, pz = o.z + away.z * pad;
    const half = (p.arena.half || 20) - 2;
    if (Math.abs(px) > half || Math.abs(pz) > half) continue;
    const c = Math.hypot(px - me.x, pz - me.z);
    if (c < bestC) { bestC = c; best = { x: px, z: pz, cost: c }; }
  }
  return best;
}

function think(p, api) {
  const me = p.self, en = p.enemy, t = p.t;
  if (!me.alive) return;
  if (p.tick === seenTick) return;
  seenTick = p.tick;

  const info = kitInfo(p);
  const beamS = info.attacks.filter(a => a.kind === 'beam')[0] || null;
  const boltS = info.attacks.filter(a => a.kind === 'bolt')[0] || null;
  const blink = info.blink;
  const blinkDist = blink ? (blink.k.distance || blink.k.range || 5) : 0;
  const blinkCleanses = blink ? effHas(blink.k, 'cleanse') : false;

  // ---- events -------------------------------------------------------
  for (const ev of (p.events || [])) {
    if (ev.type === 'enemyStarted' && ev.skill) {
      const ek = en.kit && en.kit[ev.skill];
      enemyCd[ev.skill] = t + ((ek && ek.cooldown) || 2.5);
    } else if (ev.type === 'blocked') {
      orbitSign = -orbitSign; nextFlip = t + 0.9;
    } else if (ev.type === 'damaged') {
      lastHurt = t;
    }
  }

  // ---- geometry -----------------------------------------------------
  const dx = en.x - me.x, dz = en.z - me.z;
  const dist = (typeof en.dist === 'number') ? en.dist : Math.hypot(dx, dz);
  const toE = V.norm({ x: dx, z: dz });
  const perp = { x: -toE.z, z: toE.x };
  const half = p.arena.half || 20;

  // enemy root bookkeeping
  if (en.rooted && !prevRooted) rootStart = t;
  prevRooted = !!en.rooted;
  const rootLen = boltS ? (durOf(boltS.k, 'root') || 0.9) : 0.9;
  const rootLeft = en.rooted ? Math.max(0, rootLen - (t - rootStart)) : 0;

  // enemy cast read
  let tts = 99, ecKind = null, ecName = null, ecInterrupts = false;
  if (en.casting && en.casting.telegraph) {
    ecName = en.casting.skill;
    const ek = en.kit && en.kit[ecName];
    ecKind = ek ? ek.kind : null;
    const w = (ek && ek.windup) || 0.4;
    tts = Math.max(0, w - (en.casting.elapsed || 0));
    if (ek) ecInterrupts = effHas(ek, 'silence') || effHas(ek, 'stun') || effHas(ek, 'knock') || effHas(ek, 'pull');
  }
  const enemyBeamName = (function () {
    const k = en.kit || {};
    for (const n in k) if (k[n] && k[n].kind === 'beam') return n;
    return null;
  })();
  const enemyBeamReady = !enemyBeamName || !enemyCd[enemyBeamName] || enemyCd[enemyBeamName] <= t;
  const enemyBlinkName = (function () {
    const k = en.kit || {};
    for (const n in k) if (k[n] && (k[n].kind === 'blink' || k[n].kind === 'leap')) return n;
    return null;
  })();
  const enemyBlinkReady = !enemyBlinkName || !enemyCd[enemyBlinkName] || enemyCd[enemyBlinkName] <= t;

  // ---- incoming projectiles ------------------------------------------
  const hitR = me.radius + 0.45;
  let threat = null;
  for (const pr of (p.arena.projectiles || [])) {
    if (pr.mine) continue;
    const vs2 = pr.vx * pr.vx + pr.vz * pr.vz;
    if (vs2 < 0.05) continue;
    let tt = ((me.x - pr.x) * pr.vx + (me.z - pr.z) * pr.vz) / vs2;
    if (tt < 0) tt = 0;
    const lim = pr.left || 0;
    if (tt > lim) tt = lim;
    const px = pr.x + pr.vx * tt, pz = pr.z + pr.vz * tt;
    const d = Math.hypot(px - me.x, pz - me.z);
    if (d < hitR + 1.8 && (!threat || tt < threat.tt)) {
      const n = V.norm({ x: -pr.vz, z: pr.vx });
      const side = (me.x - pr.x) * n.x + (me.z - pr.z) * n.z;
      threat = { tt: tt, d: d, dir: V.scale(n, side >= 0 ? 1 : -1) };
    }
  }

  // ---- blink decisions ------------------------------------------------
  let blinkPt = null;
  if (blink && api.ready(blink.name)) {
    const escapePerp = V.scale(perp, orbitSign);
    if ((me.rooted || me.silenced) && blinkCleanses) {
      const d = V.norm(V.add(V.scale(escapePerp, 1.0), V.scale(toE, dist > 12 ? 0.4 : -0.7)));
      blinkPt = { x: me.x + d.x * blinkDist, z: me.z + d.z * blinkDist };
    } else if (threat && threat.tt < 0.34 && threat.d < hitR + 0.9) {
      blinkPt = { x: me.x + threat.dir.x * blinkDist, z: me.z + threat.dir.z * blinkDist };
    } else if (tts <= 0.30 && ecKind && ecKind !== 'blink' && en.visible && dist < 30 &&
               (ecKind === 'beam' || ecKind === 'bolt' || ecKind === 'fan' || ecKind === 'lunge' || ecKind === 'mortar')) {
      const d = V.norm(V.add(V.scale(escapePerp, 1.2), V.scale(toE, -0.35)));
      blinkPt = { x: me.x + d.x * blinkDist, z: me.z + d.z * blinkDist };
    } else if (me.hp < me.maxHp * 0.30 && dist < 6.5 && t - lastHurt < 1.2) {
      blinkPt = { x: me.x - toE.x * blinkDist, z: me.z - toE.z * blinkDist };
    }
    if (blinkPt) {
      blinkPt.x = Math.max(-half + 2, Math.min(half - 2, blinkPt.x));
      blinkPt.z = Math.max(-half + 2, Math.min(half - 2, blinkPt.z));
    }
  }

  // ---- attack selection ----------------------------------------------
  const myFrac = me.hp / me.maxHp;
  const enFrac = en.hp / Math.max(1, en.maxHp);
  const ahead = myFrac - enFrac;
  const turtle = ahead > 0.06 && t > 22;

  let shot = null;
  if (!blinkPt && !me.stunned && !me.silenced && !me.busy && en.alive && !en.invulnerable) {
    const imminent = threat && threat.tt < 0.45;
    let bestScore = 0;
    for (const a of info.attacks) {
      if (!api.ready(a.name)) continue;
      const w = a.k.windup || 0;
      if (imminent && w > 0.05) continue;
      const aim = predictAim(a.k, me, en);
      const ad = Math.hypot(aim.x - me.x, aim.z - me.z);
      if (dist > a.reach - 0.8) continue;
      if (!en.visible && a.kind !== 'mortar') continue;
      if (!api.los(aim.x, aim.z) && a.kind !== 'mortar') continue;

      // lateral evasion speed of the enemy
      const perpSpd = Math.abs(en.vx * perp.x + en.vz * perp.z);
      let s = 10 + a.dmg * 0.6;
      if (a.kind === 'beam') {
        s += 4;
        s -= perpSpd * 2.6;
        s -= Math.min(6, w * 6);
        if (rootLeft > w + 0.15) s += 40;
        if (en.busy && !ecInterrupts) s += 8;
        if (ecInterrupts && tts < w + 0.1) s -= 45;
        if (!enemyBlinkReady) s += 7;
        if (dist > a.reach - 4) s -= 4;
      } else if (a.kind === 'bolt') {
        s += 6;
        s -= Math.max(0, dist - 12) * 0.9;
        s -= perpSpd * 1.0;
        if (rootLeft > 0.2) s += 6;
        if (ecInterrupts && tts < w + 0.1) s -= 25;
        if (en.rooted) s += 10;
      } else {
        s += 2;
        if (ecInterrupts && tts < w + 0.1 && w > 0.2) s -= 25;
      }
      if (turtle && a.kind === 'beam' && enemyBeamReady && dist < 12) s -= 5;
      if (s > bestScore) { bestScore = s; shot = { a: a, aim: aim }; }
    }
  }

  // ---- movement --------------------------------------------------------
  let desired = 13.5;
  if (turtle) desired = 16.5;
  if (rootLeft > 0.3) desired = 11;
  if (!enemyBeamReady && enemyCd[enemyBeamName] - t > 1.0) desired = 10.5;
  if (myFrac < 0.4 && enFrac > myFrac) desired = 15;

  let moveDir = null, movePt = null;

  if (threat && threat.tt < 0.9) {
    moveDir = V.norm(V.add(threat.dir, V.scale(toE, dist > desired + 3 ? 0.25 : -0.15)));
  } else if (tts < 90 && (ecKind === 'beam' || ecKind === 'fan') && en.visible) {
    // duck behind something if reachable in the wind-up, else hard juke
    const hs = hideSpot(p);
    if (hs && hs.cost < tts * me.maxSpeed * 0.95 + 1.0) {
      movePt = hs;
    } else {
      if (t > nextFlip - 0.25) { orbitSign = -orbitSign; nextFlip = t + 0.6; }
      moveDir = V.norm(V.add(V.scale(perp, orbitSign * 1.3), V.scale(toE, dist < desired ? -0.5 : 0.2)));
    }
  } else if (!en.visible) {
    if (turtle) {
      const hs = hideSpot(p);
      movePt = hs ? hs : { x: me.x, z: me.z };
    } else {
      movePt = { x: en.x, z: en.z };
    }
  } else {
    if (t > nextFlip) { orbitSign = -orbitSign; nextFlip = t + 0.7 + api.rand() * 1.1; }
    let radial = (dist - desired) / 5;
    if (radial > 1) radial = 1; if (radial < -1) radial = -1;
    moveDir = V.add(V.scale(perp, orbitSign), V.scale(toE, radial * 1.25));
    if (turtle && enemyBeamReady) {
      const hs = hideSpot(p);
      if (hs) {
        const toH = V.norm({ x: hs.x - me.x, z: hs.z - me.z });
        moveDir = V.add(moveDir, V.scale(toH, 0.6));
      }
    }
  }

  // ---- issue orders ----------------------------------------------------
  if (movePt) {
    api.moveTo(movePt.x, movePt.z);
  } else if (moveDir) {
    let d = wallPush(p, moveDir);
    d = avoidSolid(api, d, me.radius + 2.6);
    api.move(d.x, d.z);
  }

  if (blinkPt) {
    api.use(blink.name, { x: blinkPt.x, z: blinkPt.z });
    if (!me.casting) api.faceAt(en.x, en.z);
  } else if (shot) {
    api.use(shot.a.name, { x: shot.aim.x, z: shot.aim.z });
  } else if (!me.casting) {
    const fk = beamS ? beamS.k : (boltS ? boltS.k : null);
    const fa = fk ? predictAim(fk, me, en) : { x: en.x + en.vx * 0.2, z: en.z + en.vz * 0.2 };
    api.faceAt(fa.x, fa.z);
  }

  // ---- flavour ----------------------------------------------------------
  if (t - lastSay > 6.5) {
    lastSay = t;
    let line;
    if (rootLeft > 0.2) line = "Held still. Hold still a little longer.";
    else if (turtle) line = "I'm ahead. Chase me and burn.";
    else if (myFrac < 0.35) line = "Still standing. Still faster than you.";
    else if (!enemyBeamReady) line = "Your beam is cold. Mine isn't.";
    else line = "Wide circles, sharp lines.";
    api.say(line);
  }
}