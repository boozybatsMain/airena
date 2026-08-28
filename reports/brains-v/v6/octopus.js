const OBS_MARGIN = 1.05;
let lastCharge = -99, lastSmash = -99, lastJump = -99, lastSayT = -99;

function clearAt(p, x, z) {
  const m = p.self.radius + 0.05;
  if (Math.abs(x) > p.arena.half - m || Math.abs(z) > p.arena.half - m) return false;
  for (const o of p.arena.obstacles) {
    if (Math.abs(x - o.x) <= o.hx + m && Math.abs(z - o.z) <= o.hz + m) return false;
  }
  return true;
}

function blinkLanding(p, d) {
  const me = p.self;
  const n = Math.hypot(d.x, d.z) || 1;
  const ux = d.x / n, uz = d.z / n;
  for (let r = 7.5; r > 0.4; r -= 0.5) {
    const x = me.x + ux * r, z = me.z + uz * r;
    if (clearAt(p, x, z)) return { x, z, r };
  }
  return { x: me.x, z: me.z, r: 0 };
}

function blinkDir(p, prefer) {
  const me = p.self, en = p.enemy;
  let best = prefer, bs = -1e9;
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8;
    const d = { x: Math.sin(a), z: Math.cos(a) };
    const land = blinkLanding(p, d);
    if (land.r < 2) continue;
    const de = Math.hypot(land.x - en.x, land.z - en.z);
    let s = de * 1.0 + land.r * 0.7;
    const c = Math.hypot(land.x, land.z);
    if (c > 15) s -= (c - 15) * 2.0;
    if (prefer) s += (d.x * prefer.x + d.z * prefer.z) * 5;
    if (s > bs) { bs = s; best = d; }
  }
  return best || prefer || { x: 1, z: 0 };
}

function bestDir(p, api, target, epos) {
  const me = p.self;
  let best = null, bs = -1e9;
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8;
    const d = { x: Math.sin(a), z: Math.cos(a) };
    let clear = 6;
    try { clear = api.ray(d.x, d.z, 6).dist; } catch (e) { clear = 6; }
    const px = me.x + d.x * 3, pz = me.z + d.z * 3;
    const fd = Math.hypot(px - epos.x, pz - epos.z);
    let s = -Math.abs(fd - target) * 1.0 + Math.min(clear, 6) * 0.45;
    s -= Math.hypot(px, pz) * 0.12;
    if (clear < 1.7) s -= 15;
    else if (clear < 3) s -= 3;
    if (s > bs) { bs = s; best = d; }
  }
  return best || { x: 0, z: 1 };
}

function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me || !me.alive) return;
  const t = p.t;

  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      if (e.skill === 'charge') lastCharge = t;
      else if (e.skill === 'smash') lastSmash = t;
      else if (e.skill === 'jump') lastJump = t;
    }
  }

  let mv = null, skill = null, faceT = null;

  try {
    if (!en || !en.alive) {
      api.move(0, 0);
      return;
    }
    const dist = en.dist;
    const ec = en.casting;
    const chargeCd = Math.max(0, 4.033 - (t - lastCharge));
    const smashCd = Math.max(0, 1.3 - (t - lastSmash));

    let lead = 0.28;
    if (me.casting && me.casting.skill === 'laser' && me.casting.telegraph) lead = me.casting.remaining;
    const aim = { x: en.x + en.vx * lead * 0.85, z: en.z + en.vz * lead * 0.85 };
    faceT = aim;

    if (me.airborne || me.stunned) {
      api.faceAt(faceT.x, faceT.z);
      return;
    }

    const awayV = { x: me.x - en.x, z: me.z - en.z };
    const an = Math.hypot(awayV.x, awayV.z) || 1;
    const away = { x: awayV.x / an, z: awayV.z / an };

    let chargeThreat = false;

    // ---- charge dodge ----
    if (ec && ec.skill === 'charge') {
      chargeThreat = true;
      let dir;
      if (ec.phase === 'dash' && en.speed > 3) dir = { x: en.vx / en.speed, z: en.vz / en.speed };
      else dir = V.fromHeading(en.heading);
      const rel = { x: me.x - en.x, z: me.z - en.z };
      const along = rel.x * dir.x + rel.z * dir.z;
      const cross = rel.x * dir.z - rel.z * dir.x;
      const inPath = along > -1.5 && along < 15 && Math.abs(cross) < 3.6;
      const pa = { x: dir.z, z: -dir.x };
      const sgn = cross >= 0 ? 1 : -1;
      const esc = { x: pa.x * sgn, z: pa.z * sgn };
      const escMix = { x: esc.x * 0.85 + away.x * 0.35, z: esc.z * 0.85 + away.z * 0.35 };
      if (inPath) {
        const spd = ec.phase === 'dash' ? Math.max(en.speed, 12) : 6;
        const tti = (along - 2.4) / spd;
        if (ec.phase === 'dash' && tti < 0.42 && api.ready('blink') && !me.busy) {
          skill = ['blink', esc.x, esc.z];
        }
        mv = { k: 'dir', x: escMix.x, z: escMix.z };
      }
    }

    // ---- smash dodge ----
    if (!skill && ec && ec.skill === 'smash' && ec.telegraph && dist < 6.6 && !me.busy) {
      if (api.ready('blink')) {
        const d = blinkDir(p, away);
        skill = ['blink', d.x, d.z];
      } else if (api.ready('jump') && ec.remaining > 0.16) {
        skill = ['jump'];
      } else {
        mv = { k: 'dir', x: away.x, z: away.z };
      }
    }

    // ---- proactive spacing ----
    if (!skill && !me.busy && dist < 5.6 && smashCd < 0.4 && api.ready('blink') && !me.airborne) {
      const d = blinkDir(p, away);
      skill = ['blink', d.x, d.z];
    }

    // ---- laser ----
    if (!skill && !me.busy && api.ready('laser') && en.visible && !en.invulnerable && dist < 23.5) {
      const escapeReady = api.ready('blink');
      let minD = chargeCd > 1.0 ? (escapeReady ? 6.8 : 8.6) : 13.0;
      if (chargeThreat) minD = 17.5;
      const safe = dist > minD || en.stunned || en.airborne ||
        (ec && ec.phase === 'recover') || (ec && ec.skill === 'jump');
      const dirToAim = V.toward({ x: me.x, z: me.z }, aim);
      const angErr = Math.abs(V.angleTo(me.heading, dirToAim));
      if (safe && angErr < 1.15) skill = ['laser'];
    }

    // ---- movement ----
    if (!mv) {
      let target = chargeCd > 1.3 ? 10.5 : 16.5;
      if (p.burnStartsIn === 0 && me.hp / me.maxHp < en.hp / en.maxHp) target = Math.min(target, 11);
      if (!en.visible && dist > target) {
        const path = api.pathTo(en.x, en.z);
        if (path && path.points && path.points.length) {
          const w = path.points[0];
          mv = { k: 'dir', x: w.x - me.x, z: w.z - me.z };
        }
      }
      if (!mv) {
        const ep = { x: en.x + en.vx * 0.45, z: en.z + en.vz * 0.45 };
        const d = bestDir(p, api, target, ep);
        mv = { k: 'dir', x: d.x, z: d.z };
      }
    }

    if (t - lastSayT > 6.5) {
      lastSayT = t;
      api.say(dist < 9 ? "too close, ape" : "eight arms, one beam");
    }
  } catch (err) {
    if (!mv) mv = { k: 'dir', x: p.self.x - p.enemy.x, z: p.self.z - p.enemy.z };
    if (!faceT) faceT = { x: p.enemy.x, z: p.enemy.z };
  }

  if (mv) {
    if (mv.k === 'dir') api.move(mv.x, mv.z);
    else if (mv.k === 'to') api.moveTo(mv.x, mv.z);
    else api.stop();
  }
  if (faceT) api.faceAt(faceT.x, faceT.z);
  if (skill) {
    if (skill.length === 3) api.use(skill[0], skill[1], skill[2]);
    else api.use(skill[0]);
  }
}
