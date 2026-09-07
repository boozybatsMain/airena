const P = { strafe: 1, flipAt: 0, said: 0 };

function kitName(p, kind, fb) {
  for (const n of p.self.skills) { const k = p.self.kit[n]; if (k && k.kind === kind) return n; }
  return p.self.kit[fb] ? fb : null;
}

function windupOf(kit, name) { const k = kit && kit[name]; return k ? (k.windup || 0) : 0; }

function think(p, api) {
  const s = p.self, e = p.enemy;
  const BOLT = kitName(p, 'bolt', 'k1');
  const BLINK = kitName(p, 'blink', 'k2');
  const BEAM = kitName(p, 'beam', 'k3');
  const dist = e.dist, vis = e.visible;
  const toE = V.toward(s, e);
  const perp = V.perp(toE);

  let rooted = e.rooted;
  for (const ev of p.events) {
    if (ev.type === 'blocked') { P.strafe = -P.strafe; P.flipAt = p.t; }
  }

  // enemy telegraph
  const ec = e.casting;
  const eSkill = ec && ec.telegraph ? ec.skill : null;
  const eKind = eSkill && e.kit[eSkill] ? e.kit[eSkill].kind : null;
  const strikeIn = eSkill ? windupOf(e.kit, eSkill) - ec.elapsed : Infinity;

  // incoming bolts
  let boltThreat = null;
  for (const pr of p.arena.projectiles) {
    if (pr.mine || pr.arc) continue;
    const rel = V.sub(s, pr);
    const sp = V.len({ x: pr.vx, z: pr.vz }) || 1;
    const dir = { x: pr.vx / sp, z: pr.vz / sp };
    const along = V.dot(rel, dir);
    if (along < 0 || along > sp * pr.left + 3) continue;
    const side = V.dot(rel, V.perp(dir));
    const tHit = along / sp;
    if (Math.abs(side) < 3.2 && (!boltThreat || tHit < boltThreat.tHit)) boltThreat = { tHit, side, dir };
  }

  // ---- defence: blink ----
  let blinked = false;
  if (BLINK && api.ready(BLINK)) {
    const beamComing = eKind === 'beam' && vis && strikeIn > 0 && strikeIn <= 0.3;
    const boltComing = boltThreat && boltThreat.tHit < 0.28 && Math.abs(boltThreat.side) < 2.4;
    const desperate = (s.rooted || s.silenced) && dist < 10;
    if (beamComing || boltComing || desperate) {
      let d = V.add(V.scale(perp, P.strafe), V.scale(toE, dist < 9 ? -0.8 : -0.3));
      const r = api.ray(d.x, d.z, 7);
      if (r.hit && r.dist < 4) d = V.add(V.scale(perp, -P.strafe), V.scale(toE, -0.3));
      api.use(BLINK, d.x, d.z);
      blinked = true;
    }
  }

  // ---- offence ----
  const predict = (lead) => {
    const t = Math.max(0, lead);
    return { x: e.x + e.vx * t, z: e.z + e.vz * t };
  };
  if (!blinked && !s.busy && vis) {
    if (BOLT && api.ready(BOLT) && dist <= (s.kit[BOLT].range || 18) + 2) {
      const k = s.kit[BOLT];
      const at = predict(k.windup || 0);
      const aim = V.lead(s, at, { x: e.vx, z: e.vz }, k.speed || 22);
      if (api.los(aim.x, aim.z)) api.use(BOLT, aim);
    } else if (BEAM && api.ready(BEAM) && dist <= 26) {
      const k = s.kit[BEAM];
      const boltReady = BOLT && api.cooldown(BOLT) < 0.5;
      const good = rooted || (ec && ec.telegraph) || s.shield > 0 || !boltReady || dist > 21;
      const danger = eKind === 'bolt' && strikeIn < 0.4 && dist < 12;
      if (good && !danger) api.use(BEAM, predict(k.windup || 0));
    }
  }
  // keep aim fresh during a facing cast
  if (s.casting && s.casting.telegraph && s.kit[s.casting.skill] && s.kit[s.casting.skill].aim === 'facing') {
    const k = s.kit[s.casting.skill];
    const left = (k.windup || 0) - s.casting.elapsed;
    if (k.kind === 'bolt') {
      const at = predict(left);
      api.faceAt(...Object.values(V.lead(s, at, { x: e.vx, z: e.vz }, k.speed || 22)));
    } else api.faceAt(...Object.values(predict(left)));
  }

  // ---- movement ----
  if (!vis) {
    api.moveTo(e.x, e.z);
    api.faceAt(e.x, e.z);
  } else {
    if (boltThreat) {
      const want = boltThreat.side >= 0 ? 1 : -1;
      const sd = V.dot(perp, V.perp(boltThreat.dir)) >= 0 ? want : -want;
      P.strafe = sd;
    } else if (p.t - P.flipAt > 0.9 + api.rand() * 0.8) {
      P.strafe = -P.strafe; P.flipAt = p.t;
    }
    let radial = 0;
    if (dist > 17) radial = 1; else if (dist < 10) radial = -1; else radial = (14 - dist) * -0.1;
    let d = V.add(V.scale(perp, P.strafe), V.scale(toE, radial));
    const r = api.ray(d.x, d.z, 6);
    if (r.hit && r.dist < 3) {
      P.strafe = -P.strafe; P.flipAt = p.t;
      d = V.add(V.scale(perp, P.strafe), V.scale(toE, radial));
      const r2 = api.ray(d.x, d.z, 6);
      if (r2.hit && r2.dist < 3) d = V.scale(toE, dist > 12 ? 1 : -1);
    }
    if (dist > 22 && !s.busy) api.moveTo(e.x, e.z); else api.move(d.x, d.z);
    if (!s.casting) api.faceAt(e.x, e.z);
  }

  if (p.t - P.said > 6) {
    P.said = p.t;
    const frac = s.hp / s.maxHp, ef = e.hp / e.maxHp;
    api.say(frac >= ef ? "Too slow. Keep chasing." : "Fine. Now I get serious.");
  }
}