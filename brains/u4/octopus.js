const ECD = { smash: 1.3, charge: 4.033, jump: 2.8 };
let eReady = { smash: 0, charge: 0, jump: 0 };
let side = 1;
let sideT = 0;
let saidT = -99;

function unit(h) { return { x: Math.sin(h), z: Math.cos(h) }; }

function insideBlock(p, x, z) {
  for (const o of p.arena.obstacles) {
    if (Math.abs(x - o.x) < o.hx + 1.15 && Math.abs(z - o.z) < o.hz + 1.15) return true;
  }
  return false;
}

function chooseDir(p, api, pref, edw) {
  const me = p.self, en = p.enemy, half = p.arena.half;
  let bestDir = pref, bestScore = -1e9;
  const vlen = Math.hypot(me.vx, me.vz);
  const vd = vlen > 0.6 ? { x: me.vx / vlen, z: me.vz / vlen } : null;
  for (let k = 0; k < 24; k++) {
    const dir = unit(k * Math.PI / 12);
    let clear = 3.2;
    const r = api.ray(dir.x, dir.z, 3.2);
    if (r && r.hit) clear = r.dist;
    if (clear < 1.45) continue;
    const fx = me.x + dir.x * 2.5, fz = me.z + dir.z * 2.5;
    let s = 3.2 * (dir.x * pref.x + dir.z * pref.z);
    s += 0.5 * (Math.min(clear, 3.2) / 3.2);
    const wall = Math.min(half - Math.abs(fx), half - Math.abs(fz));
    if (wall < 6) s -= (6 - wall) * 0.55;
    const ed = Math.hypot(fx - en.x, fz - en.z);
    s += edw * 0.15 * ed;
    if (vd) s += 0.3 * (dir.x * vd.x + dir.z * vd.z);
    if (s > bestScore) { bestScore = s; bestDir = dir; }
  }
  return bestDir;
}

function chooseBlink(p, api, pref) {
  const me = p.self, en = p.enemy, half = p.arena.half;
  let best = pref, bs = -1e9;
  for (let k = 0; k < 16; k++) {
    const dir = unit(k * Math.PI / 8);
    const x = me.x + dir.x * 7.5, z = me.z + dir.z * 7.5;
    const cx = Math.max(-half + 1.3, Math.min(half - 1.3, x));
    const cz = Math.max(-half + 1.3, Math.min(half - 1.3, z));
    let s = 2.2 * (dir.x * pref.x + dir.z * pref.z);
    s -= Math.hypot(cx - x, cz - z) * 0.7;
    s += 0.14 * Math.hypot(cx - en.x, cz - en.z);
    if (insideBlock(p, cx, cz)) s -= 2.5;
    const wall = Math.min(half - Math.abs(cx), half - Math.abs(cz));
    if (wall < 5) s -= (5 - wall) * 0.45;
    if (s > bs) { bs = s; best = dir; }
  }
  return best;
}

function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive) return;
  const t = p.t, d = en.dist;

  for (const e of p.events) {
    if (e.type === 'enemyStarted' && ECD[e.skill] != null) eReady[e.skill] = t + ECD[e.skill];
  }
  const chargeReady = t >= eReady.charge;

  const toEn = d > 0.001 ? V.toward(me, en) : { x: 0, z: 1 };
  const away = { x: -toEn.x, z: -toEn.z };
  const perpE = V.perp(toEn);
  if (t > sideT) { sideT = t + 1.1 + api.rand() * 1.2; side = api.rand() < 0.5 ? -1 : 1; }

  const busy = me.busy || me.airborne || me.stunned;
  const blinkOk = api.ready('blink') && !busy;
  const jumpOk = api.ready('jump') && !busy;

  const ec = en.casting;
  const dashing = ec && ec.skill === 'charge' && ec.phase === 'dash';

  const myCast = me.casting && me.casting.skill === 'laser' ? me.casting : null;
  let lead = myCast ? Math.min(0.667, Math.max(0, (myCast.remaining || 0) - 0.1)) : 0.667;
  if (dashing && ec.remaining != null) lead = Math.min(lead, Math.max(0, ec.remaining));
  const kk = dashing ? 1.0 : (en.speed > 1.2 ? 0.7 : 0.3);
  const H = p.arena.half - 0.6;
  let px = Math.max(-H, Math.min(H, en.x + en.vx * lead * kk));
  let pz = Math.max(-H, Math.min(H, en.z + en.vz * lead * kk));

  let moveCmd = null;
  let useSkill = null, useA = 0, useB = 0;
  let handled = false;

  if (ec && ec.skill === 'charge') {
    const cdir = (ec.phase === 'dash' && en.speed > 2) ? V.norm({ x: en.vx, z: en.vz }) : V.fromHeading(en.heading);
    const rel = { x: me.x - en.x, z: me.z - en.z };
    const along = V.dot(rel, cdir);
    const perpV = { x: rel.x - cdir.x * along, z: rel.z - cdir.z * along };
    const perp = V.len(perpV);
    const sd = perp > 0.35 ? V.norm(perpV) : V.perp(cdir);
    if (along > -1.5 && perp < 3.6 && along < 16) {
      handled = true;
      const eta = (ec.phase === 'dash' ? 0 : 0.3) + Math.max(0, along - 2.25) / 15;
      if (blinkOk && eta < 0.42) {
        const bp = V.norm({ x: sd.x + away.x * 0.35, z: sd.z + away.z * 0.35 });
        const bd = chooseBlink(p, api, bp);
        useSkill = 'blink'; useA = bd.x; useB = bd.z;
        moveCmd = { type: 'dir', x: sd.x, z: sd.z };
      } else {
        const pref = ec.phase === 'dash' ? sd : V.norm({ x: sd.x + away.x * 0.55, z: sd.z + away.z * 0.55 });
        const dir = chooseDir(p, api, pref, 0.5);
        moveCmd = { type: 'dir', x: dir.x, z: dir.z };
      }
    }
  }

  if (!handled && ec && ec.skill === 'smash' && ec.telegraph && d < 6.1) {
    handled = true;
    const dir = chooseDir(p, api, away, 1);
    moveCmd = { type: 'dir', x: dir.x, z: dir.z };
    if (!busy) {
      if (!chargeReady && blinkOk) {
        const bd = chooseBlink(p, api, away);
        useSkill = 'blink'; useA = bd.x; useB = bd.z;
      } else if (jumpOk && d < 6.0) {
        useSkill = 'jump';
      } else if (blinkOk) {
        const bd = chooseBlink(p, api, away);
        useSkill = 'blink'; useA = bd.x; useB = bd.z;
      }
    }
  }

  if (!handled && d < 4.4 && blinkOk && (!chargeReady || d < 3.3)) {
    handled = true;
    const bd = chooseBlink(p, api, away);
    useSkill = 'blink'; useA = bd.x; useB = bd.z;
    const dir = chooseDir(p, api, away, 1);
    moveCmd = { type: 'dir', x: dir.x, z: dir.z };
  }

  if (!handled) {
    const want = chargeReady ? 15.0 : 11.0;
    let pref, edw;
    if (d < want - 1.5) {
      pref = V.norm({ x: away.x + perpE.x * 0.5 * side, z: away.z + perpE.z * 0.5 * side });
      edw = 1;
    } else if (d > want + 3.5) {
      pref = toEn; edw = -1;
    } else {
      pref = V.norm({ x: perpE.x * side + away.x * 0.18, z: perpE.z * side + away.z * 0.18 });
      edw = 0.25;
    }
    if (!en.visible && d > 7) {
      moveCmd = { type: 'to', x: en.x, z: en.z };
    } else {
      const dir = chooseDir(p, api, pref, edw);
      moveCmd = { type: 'dir', x: dir.x, z: dir.z };
    }

    if (!busy && api.ready('laser') && en.visible && d < 21 && d > 2.5) {
      const enBusyFar = en.stunned ||
        (ec && ec.skill === 'jump') ||
        (ec && ec.skill === 'charge');
      const safe = d > 15.5 || (!chargeReady && d > 8.5) || (enBusyFar && d > 6.5);
      const aimErr = Math.abs(V.angleTo(me.heading, V.toward(me, { x: px, z: pz })));
      if (safe && aimErr < 0.9 && api.los(px, pz)) useSkill = 'laser';
    }
  }

  if (moveCmd) {
    if (moveCmd.type === 'to') api.moveTo(moveCmd.x, moveCmd.z);
    else api.move(moveCmd.x, moveCmd.z);
  }
  api.faceAt(px, pz);
  if (useSkill) api.use(useSkill, useA, useB);

  if (t - saidT > 6) {
    saidT = t;
    api.say(d < 6 ? "too close, ink and go" : "eight arms, one beam");
  }
}
