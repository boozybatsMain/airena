const ecd = {};
let strafeSign = 1, nextFlip = 0, reversedCast = false, enemyBlinks = 0, saidStart = false, lastSay = -9;

function findKind(who, kind, fb) {
  for (const n of who.skills) if (who.kit[n] && who.kit[n].kind === kind) return n;
  return who.kit[fb] ? fb : null;
}

function boxHit(a, b, box) {
  let tmin = 0, tmax = 1;
  const d = { x: b.x - a.x, z: b.z - a.z };
  for (const ax of ['x', 'z']) {
    const h = ax === 'x' ? box.hx : box.hz;
    const lo = box[ax] - h, hi = box[ax] + h;
    if (Math.abs(d[ax]) < 1e-9) { if (a[ax] < lo || a[ax] > hi) return false; }
    else {
      let t1 = (lo - a[ax]) / d[ax], t2 = (hi - a[ax]) / d[ax];
      if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      if (tmin > tmax) return false;
    }
  }
  return true;
}

function losBetween(p, a, b) {
  for (const o of p.arena.obstacles) if (boxHit(a, b, o)) return false;
  return true;
}

function coverPoint(p, api, me, ePos) {
  const pad = me.radius + 0.6;
  const my = { x: me.x, z: me.z };
  const cands = [];
  for (const o of p.arena.obstacles) {
    for (const sx of [-1, 0, 1]) for (const sz of [-1, 0, 1]) {
      if (!sx && !sz) continue;
      const pt = { x: o.x + sx * (o.hx + pad), z: o.z + sz * (o.hz + pad) };
      if (Math.abs(pt.x) > 18.2 || Math.abs(pt.z) > 18.2) continue;
      if (V.dist(pt, ePos) < 4) continue;
      if (losBetween(p, ePos, pt)) continue;
      cands.push(pt);
    }
  }
  cands.sort((a, b) => V.dist(a, my) - V.dist(b, my));
  let best = null, bd = Infinity;
  for (const pt of cands.slice(0, 4)) {
    const r = api.pathTo(pt.x, pt.z);
    if (r && r.dist < bd) { bd = r.dist; best = pt; }
  }
  return best ? { pt: best, dist: bd } : null;
}

function chooseBlink(p, api, me, ePos, blinkDist, prefDir) {
  const my = { x: me.x, z: me.z };
  const away = V.away(ePos, my);
  let best = null, bs = -Infinity;
  for (let i = 0; i < 12; i++) {
    const dir = V.fromHeading(i * Math.PI / 6);
    const r = api.ray(dir.x, dir.z, blinkDist);
    const len = r.hit ? Math.max(0, r.dist - me.radius - 0.1) : blinkDist;
    if (len < 2.5) continue;
    const land = V.add(my, V.scale(dir, len));
    let s = (losBetween(p, ePos, land) ? 0 : 5) + Math.min(V.dist(land, ePos), 13) * 0.35;
    if (Math.max(Math.abs(land.x), Math.abs(land.z)) > 17) s -= 4;
    s += prefDir ? V.dot(dir, prefDir) * 4 : V.dot(dir, away) * 1.0;
    s += api.rand() * 0.3;
    if (s > bs) { bs = s; best = land; }
  }
  return best;
}

function think(p, api) {
  const me = p.self, en = p.enemy, t = p.t;
  for (const ev of p.events) {
    if (ev.type === 'enemyStarted' && en.kit[ev.skill]) {
      ecd[ev.skill] = t + en.kit[ev.skill].cooldown;
      if (en.kit[ev.skill].kind === 'blink') enemyBlinks++;
    }
  }
  const ecdRem = k => k ? Math.max(0, (ecd[k] || 0) - t) : 99;
  const my = { x: me.x, z: me.z }, ePos = { x: en.x, z: en.z }, eVel = { x: en.vx, z: en.vz };
  const dist = en.dist;
  const toE = V.toward(my, ePos), awayE = V.scale(toE, -1);
  const kit = me.kit;
  const beam = findKind(me, 'beam', 'k3'), bolt = findKind(me, 'bolt', 'k1'), blink = findKind(me, 'blink', 'k2');
  const eBeam = findKind(en, 'beam', 'k3'), eBlink = findKind(en, 'blink', 'k2');
  const blinkDist = blink ? (kit[blink].distance || 6.5) : 6.5;
  const blinkReady = blink ? api.ready(blink) : false;
  const myFrac = me.hp / me.maxHp, eFrac = en.hp / en.maxHp;
  const aggressive = t > 24 && myFrac < eFrac;

  if (!saidStart) { saidStart = true; api.say("Fast feet, sharp eyes. Let's dance."); lastSay = t; }

  let beamThreat = null, boltThreat = null;
  if (en.casting && en.casting.telegraph && en.kit[en.casting.skill]) {
    const ck = en.kit[en.casting.skill];
    const rem = (ck.windup || 0) - en.casting.elapsed;
    if (ck.kind === 'beam') beamThreat = { rem };
    else if (ck.kind === 'bolt') boltThreat = { rem };
  } else reversedCast = false;

  let moveDir = null, moveToPt = null, blinkTo = null, holdCasts = false;

  if (t >= nextFlip) { strafeSign = api.rand() < 0.5 ? -1 : 1; nextFlip = t + 0.5 + api.rand() * 0.7; }
  const perp = V.perp(toE);

  // Beam threat: blink through the strike
  if (beamThreat && en.visible && !me.invulnerable) {
    if (blinkReady && beamThreat.rem <= 0.24) {
      blinkTo = chooseBlink(p, api, me, ePos, blinkDist, null);
      if (blinkTo && t - lastSay > 4) { api.say("Not today."); lastSay = t; }
    } else if (blinkReady || beamThreat.rem > 0.32) {
      holdCasts = true;
      if (!blinkReady) {
        const c = coverPoint(p, api, me, ePos);
        if (c && c.dist < me.maxSpeed * beamThreat.rem * 0.9 + 1) moveToPt = c.pt;
      }
    }
  }

  // Bolt threat: telegraph strafe with a late reversal
  if (boltThreat && !reversedCast && boltThreat.rem <= 0.15) { strafeSign = -strafeSign; reversedCast = true; nextFlip = t + 0.8; }

  // Projectiles in flight
  let dodge = null;
  for (const pr of p.arena.projectiles) {
    if (pr.mine || pr.arc) continue;
    const vr = { x: pr.vx - me.vx, z: pr.vz - me.vz };
    const rel = { x: pr.x - me.x, z: pr.z - me.z };
    const vv = V.dot(vr, vr); if (vv < 1e-6) continue;
    const tca = -V.dot(rel, vr) / vv;
    if (tca < 0 || tca > pr.left + 0.1) continue;
    const dmin = V.len(V.add(rel, V.scale(vr, tca)));
    if (dmin > 2.6) continue;
    const pv = V.norm({ x: pr.vx, z: pr.vz });
    let n = V.perp(pv);
    if (V.dot(n, V.sub(my, { x: pr.x, z: pr.z })) < 0) n = V.scale(n, -1);
    if (!dodge || tca < dodge.tca) dodge = { n, tca, dmin };
  }
  if (dodge) {
    moveDir = dodge.n;
    if (!blinkTo && blinkReady && dodge.tca < 0.35 && dodge.dmin < 1.4 && !beamThreat && (me.rooted || ecdRem(eBeam) > 1.2))
      blinkTo = chooseBlink(p, api, me, ePos, blinkDist, dodge.n);
  }

  // Offense
  let castAim = null, casting = me.casting;
  if (blinkTo) {
    api.use(blink, { x: blinkTo.x, z: blinkTo.z });
  } else if (!holdCasts && !me.busy) {
    const enemyBusyNotBeam = en.casting && en.kit[en.casting.skill] && en.kit[en.casting.skill].kind !== 'beam';
    const safeInterrupt = ecdRem(eBeam) > 0.75 || enemyBusyNotBeam;
    const likelyHit = ecdRem(eBlink) > 0.72 || (enemyBusyNotBeam && en.casting.remaining >= 0.62) || aggressive || (enemyBlinks === 0 && t > 6) || en.rooted;
    if (beam && api.ready(beam) && en.visible && !en.invulnerable && dist <= (kit[beam].range || 24) + 1.5 && safeInterrupt && likelyHit) {
      api.use(beam); casting = { skill: beam, elapsed: 0 };
    } else if (bolt && api.ready(bolt) && en.visible && !en.invulnerable && dist <= Math.min(16, kit[bolt].range || 18) && !(beamThreat && beamThreat.rem > 0.35)) {
      api.use(bolt); casting = { skill: bolt, elapsed: 0 };
    }
  }

  // Facing / aim
  if (casting && kit[casting.skill] && (kit[casting.skill].kind === 'beam' || kit[casting.skill].kind === 'bolt')) {
    const k = kit[casting.skill];
    const remW = Math.max(0, (k.windup || 0) - (casting.elapsed || 0));
    const epos = V.add(ePos, V.scale(eVel, remW));
    if (k.kind === 'bolt') {
      const lead = V.lead(my, epos, eVel, k.speed || 22);
      castAim = V.lerp(epos, lead, 0.75);
    } else castAim = epos;
  }
  if (castAim) api.faceAt(castAim.x, castAim.z);
  else api.faceAt(en.x + en.vx * 0.2, en.z + en.vz * 0.2);

  // Movement
  if (moveDir) { api.move(moveDir.x, moveDir.z); return; }
  if (moveToPt) { api.moveTo(moveToPt.x, moveToPt.z); return; }

  const danger = !aggressive && eBeam && ecdRem(eBeam) < 0.35 && !blinkReady && (blink ? api.cooldown(blink) > 0.35 : true) && en.visible && !me.invulnerable;
  if (danger) {
    const c = coverPoint(p, api, me, ePos);
    if (c && c.dist < 12) { api.moveTo(c.pt.x, c.pt.z); return; }
  }
  if (!en.visible) { api.moveTo(en.x, en.z); return; }

  const near = aggressive ? 10 : 13, far = aggressive ? 7 : 8;
  const radial = dist > near ? 1 : dist < far ? -1 : 0;
  const tryDir = s => {
    const d = V.norm(V.add(V.scale(toE, radial), V.scale(perp, s)));
    const r = api.ray(d.x, d.z, 3);
    const pt = V.add(my, V.scale(d, 2.5));
    const ok = !r.hit && Math.abs(pt.x) < 18.3 && Math.abs(pt.z) < 18.3;
    return ok ? d : null;
  };
  let d = tryDir(strafeSign);
  if (!d) { strafeSign = -strafeSign; nextFlip = t + 0.7; d = tryDir(strafeSign); }
  if (!d) d = radial !== 0 ? V.scale(toE, radial) : awayE;
  api.move(d.x, d.z);
}