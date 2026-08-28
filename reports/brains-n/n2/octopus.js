const S = {
  side: 1,
  lastCharge: -99,
  lastSmash: -99,
  lastFlip: 0,
  aimTol: 0.62,
  leadK: 0.85,
  says: 0
};

function clampArena(v) { return Math.max(-18.6, Math.min(18.6, v)); }

function chooseDir(p, api, pref, bias) {
  const s = p.self, e = p.enemy;
  const toE = V.toward(s, e);
  const per = V.perp(toE);
  const cen = V.norm({ x: -s.x, z: -s.z });
  const distErr = e.dist - pref;
  const desiredRadial = Math.max(-1, Math.min(1, distErr * 0.4));
  let best = { x: toE.x, z: toE.z }, bestSc = -1e9;
  for (let i = 0; i < 24; i++) {
    const a = i * (Math.PI * 2 / 24);
    const d = { x: Math.sin(a), z: Math.cos(a) };
    const r = api.ray(d.x, d.z, 4.2);
    const free = Math.min(r.dist, 4.2);
    let sc = free * 1.6;
    if (free < 1.4) sc -= 14;
    if (free < 2.4) sc -= 4;
    const radial = V.dot(d, toE);
    sc -= Math.abs(radial - desiredRadial) * 5.5;
    sc += V.dot(d, per) * S.side * 2.2;
    const edge = Math.min(20 - Math.abs(s.x), 20 - Math.abs(s.z));
    if (edge < 7) sc += V.dot(d, cen) * (7 - edge) * 1.7;
    if (bias) sc += V.dot(d, bias) * bias.w;
    if (sc > bestSc) { bestSc = sc; best = d; }
  }
  return best;
}

function blinkAway(p, api, dirHint) {
  const s = p.self, e = p.enemy;
  let best = dirHint, bestSc = -1e9;
  for (let i = 0; i < 20; i++) {
    const a = i * (Math.PI * 2 / 20);
    const d = { x: Math.sin(a), z: Math.cos(a) };
    const lx = s.x + d.x * 7.5, lz = s.z + d.z * 7.5;
    let sc = Math.hypot(lx - e.x, lz - e.z);
    const ox = Math.abs(lx) - 18.5, oz = Math.abs(lz) - 18.5;
    if (ox > 0) sc -= ox * 4;
    if (oz > 0) sc -= oz * 4;
    if (dirHint) sc += V.dot(d, dirHint) * 6;
    if (sc > bestSc) { bestSc = sc; best = d; }
  }
  return best;
}

function think(p, api) {
  const s = p.self, e = p.enemy;
  if (!s.alive) return;

  for (const ev of p.events) {
    if (ev.type === 'enemyStarted') {
      if (ev.skill === 'charge') S.lastCharge = p.t;
      else if (ev.skill === 'smash') S.lastSmash = p.t;
    } else if (ev.type === 'blocked') {
      S.side = -S.side; S.lastFlip = p.t;
    } else if (ev.type === 'missed' && ev.skill === 'laser') {
      if (ev.reason === 'aim') { S.aimTol = Math.max(0.32, S.aimTol - 0.12); S.leadK = Math.max(0.4, S.leadK - 0.12); }
    } else if (ev.type === 'dealt' && ev.skill === 'laser') {
      S.aimTol = Math.min(0.7, S.aimTol + 0.04);
    } else if (ev.type === 'damaged' && ev.skill === 'charge') {
      S.lastCharge = p.t - 0.9;
    } else if (ev.type === 'damaged' && ev.skill === 'smash') {
      S.lastSmash = p.t - 0.3;
    }
  }
  if (p.t - S.lastFlip > 2.4) { S.side = api.rand() < 0.5 ? -1 : 1; S.lastFlip = p.t; }

  const ec = e.casting;
  if (ec && ec.skill === 'charge') S.lastCharge = Math.max(S.lastCharge, p.t - 0.4);
  const chargeReady = (p.t - S.lastCharge) > 3.8;

  const away = V.away(s, e);
  const toE = V.toward(s, e);

  // ---- facing / aim target -------------------------------------------------
  const castLead = (s.casting && s.casting.skill === 'laser') ? s.casting.remaining : 0.667;
  let lx = e.x + e.vx * castLead * S.leadK;
  let lz = e.z + e.vz * castLead * S.leadK;
  if (ec && ec.skill === 'charge' && ec.phase === 'dash') { lx = e.x + e.vx * 0.12; lz = e.z + e.vz * 0.12; }
  const aimVec = { x: lx - s.x, z: lz - s.z };
  const aimLen = Math.max(0.001, V.len(aimVec));
  const aimDir = { x: aimVec.x / aimLen, z: aimVec.z / aimLen };

  // ---- 1. dodge a committed charge ----------------------------------------
  if (ec && ec.skill === 'charge' && ec.phase === 'dash') {
    const cd = V.fromHeading(e.heading);
    const rel = { x: s.x - e.x, z: s.z - e.z };
    const along = V.dot(rel, cd);
    const cross = rel.x * cd.z - rel.z * cd.x;
    const lat = Math.abs(cross);
    if (along > -1.5 && along < 15 && lat < 3.8) {
      let px = rel.x - along * cd.x, pz = rel.z - along * cd.z;
      const pl = Math.hypot(px, pz);
      let dir = pl > 0.5 ? { x: px / pl, z: pz / pl } : V.perp(cd);
      dir = V.norm({ x: dir.x - cd.x * 0.3, z: dir.z - cd.z * 0.3 });
      if (api.ready('blink') && !s.busy && !s.stunned && !s.airborne) {
        const bd = blinkAway(p, api, dir);
        api.use('blink', bd.x, bd.z);
        api.move(bd.x, bd.z);
      } else {
        const md = chooseDir(p, api, e.dist + 4, { x: dir.x, z: dir.z, w: 9 });
        api.move(md.x, md.z);
      }
      api.faceAt(e.x, e.z);
      return;
    }
  }

  // ---- 2. duck a smash ------------------------------------------------------
  if (ec && ec.skill === 'smash' && ec.telegraph && e.dist < 6.4) {
    if (!s.busy && !s.stunned && !s.airborne) {
      if (api.ready('jump') && ec.remaining > 0.11) {
        api.move(away.x, away.z);
        api.use('jump');
        api.faceAt(e.x, e.z);
        return;
      }
      if (api.ready('blink')) {
        const bd = blinkAway(p, api, away);
        api.use('blink', bd.x, bd.z);
        api.move(bd.x, bd.z);
        api.faceAt(e.x, e.z);
        return;
      }
    }
    const md = chooseDir(p, api, 12, { x: away.x, z: away.z, w: 6 });
    api.move(md.x, md.z);
    api.faceAt(e.x, e.z);
    return;
  }

  // ---- 3. emergency spacing -------------------------------------------------
  if (e.dist < 4.1 && !s.busy && !s.stunned && !s.airborne && !e.stunned && api.ready('blink')) {
    const bd = blinkAway(p, api, away);
    api.use('blink', bd.x, bd.z);
    api.move(bd.x, bd.z);
    api.faceAt(e.x, e.z);
    return;
  }

  // ---- 4. laser -------------------------------------------------------------
  let fired = false;
  if (!s.busy && !s.stunned && !s.airborne && api.ready('laser') && e.visible) {
    const err = Math.abs(V.angleTo(s.heading, aimDir));
    const r = api.ray(aimDir.x, aimDir.z, Math.min(25, aimLen + 2));
    const clear = r.dist >= aimLen - e.radius - 0.45;
    const chargeTell = ec && ec.skill === 'charge';
    const tooClose = e.dist < 4.6 && !e.stunned;
    const riskyClose = chargeReady && e.dist < 5.6 && !e.stunned;
    if (aimLen < 21.5 && err < S.aimTol && clear && !chargeTell && !tooClose && !riskyClose) {
      api.use('laser');
      fired = true;
    }
  }

  // ---- 5. movement ----------------------------------------------------------
  let pref;
  const enemyHelpless = e.stunned || (ec && (ec.phase === 'recover' || ec.skill === 'jump'));
  if (enemyHelpless) pref = 6.5;
  else if (chargeReady) pref = 13.0;
  else pref = 8.0;
  if (p.burn > 0 && s.hp / s.maxHp < e.hp / e.maxHp) pref = Math.min(pref, 9.0);

  if (!e.visible) {
    const back = V.norm({ x: s.x - e.x, z: s.z - e.z });
    const rd = V.rot(back, 0.8 * S.side);
    const want = Math.min(pref, 11);
    api.moveTo(clampArena(e.x + rd.x * want), clampArena(e.z + rd.z * want));
  } else {
    let bias = null;
    if (ec && ec.skill === 'charge' && ec.telegraph) {
      const per = V.perp(toE);
      bias = { x: per.x * S.side, z: per.z * S.side, w: 6 };
    } else if (chargeReady && e.dist < 14) {
      const per = V.perp(toE);
      bias = { x: per.x * S.side, z: per.z * S.side, w: 1.6 };
    }
    const md = chooseDir(p, api, pref, bias);
    api.move(md.x, md.z);
  }

  // ---- facing ---------------------------------------------------------------
  api.face(aimDir.x, aimDir.z);

  if (fired && S.says < 4 && api.rand() < 0.35) {
    S.says++;
    api.say(["eight arms, one beam", "hold still, ape", "ink and light", "geometry wins"][S.says - 1]);
  }
}
