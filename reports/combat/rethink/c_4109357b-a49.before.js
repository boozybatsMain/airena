const CLK = { lastSay: -9, saidHi: false };
let strafeSign = 1;
let lastFlip = 0;
let comboUntil = -1;
let wantFireSince = -1;

function clampArena(pt) {
  return { x: Math.max(-18.6, Math.min(18.6, pt.x)), z: Math.max(-18.6, Math.min(18.6, pt.z)) };
}

function insideBlock(p, pt, pad) {
  for (const o of p.arena.obstacles) {
    if (Math.abs(pt.x - o.x) < o.hx + pad && Math.abs(pt.z - o.z) < o.hz + pad) return true;
  }
  return false;
}

function clampRange(self, pt, range) {
  const d = V.dist(self, pt);
  if (d > range) {
    const dir = V.toward(self, pt);
    return V.add({ x: self.x, z: self.z }, V.scale(dir, range - 0.25));
  }
  return pt;
}

function dirOk(p, from, dir) {
  const pt = { x: from.x + dir.x * 3, z: from.z + dir.z * 3 };
  if (Math.abs(pt.x) > 19 || Math.abs(pt.z) > 19) return false;
  if (insideBlock(p, pt, 1.9)) return false;
  return true;
}

function pickEscape(p, from, want) {
  const opts = [0, 0.9, -0.738, 1.7, -1.7, Math.PI];
  for (const a of opts) {
    const d = V.rot(want, a);
    if (dirOk(p, from, d)) return d;
  }
  return want;
}

function say(p, api, txt) {
  if (p.t - CLK.lastSay > 3.5) { api.say(txt); CLK.lastSay = p.t; }
}

function think(p, api) {
  const me = p.self, en = p.enemy;
  const mePos = { x: me.x, z: me.z };
  const enPos = { x: en.x, z: en.z };
  api.faceAt(en.x, en.z);

  if (!CLK.saidHi) { CLK.saidHi = true; api.say('Тяжёлый шаг — тяжёлый удар.'); CLK.lastSay = p.t; }

  for (const ev of p.events) {
    if (ev.type === 'blocked') { strafeSign = -strafeSign; lastFlip = p.t; }
    if (ev.type === 'dealt' && ev.skill === 'k3') say(p, api, 'Прямо в цель!');
    if (ev.type === 'damaged' && me.hp < me.maxHp * 0.35) say(p, api, 'Крепче, чем ты думал.');
  }

  const myFrac = me.hp / me.maxHp;
  const enFrac = en.hp / en.maxHp;
  const lateGame = p.t > 28;
  const winning = myFrac > enFrac + 0.03;

  // ---------- MOVEMENT DECISION ----------
  let moved = false;

  // 1) dodge incoming lobs
  let threat = null, threatT = 1e9;
  for (const pr of p.arena.projectiles) {
    if (pr.mine) continue;
    const impact = { x: pr.x + pr.vx * pr.left, z: pr.z + pr.vz * pr.left };
    const d = V.dist(impact, mePos);
    if (d < 4.644 && pr.left < threatT) { threat = impact; threatT = pr.left; }
  }
  if (threat) {
    let want = V.toward(threat, mePos);
    if (V.len(want) < 0.01) want = V.perp(V.toward(mePos, enPos));
    const d = pickEscape(p, mePos, want);
    api.move(d.x, d.z);
    moved = true;
  }

  // 2) escape enemy zones
  if (!moved) {
    for (const z of p.arena.zones) {
      if (z.mine) continue;
      if (V.dist(z, mePos) < z.r + me.radius + 0.5) {
        let want = V.norm(V.add(V.toward(z, mePos), V.scale(V.toward(enPos, mePos), 0.8)));
        if (V.len(want) < 0.01) want = V.perp(V.toward(mePos, enPos));
        const d = pickEscape(p, mePos, want);
        api.move(d.x, d.z);
        moved = true;
        break;
      }
    }
  }

  // 3) tactical positioning
  if (!moved) {
    let desired = 9.748;
    if (lateGame) desired = winning ? 12.5 : 6;
    if (en.dist > 17.69) {
      api.moveTo(en.x, en.z);
    } else {
      if (p.t - lastFlip > 3.172 && api.rand() < 0.25) { strafeSign = -strafeSign; lastFlip = p.t; }
      const toEn = V.toward(mePos, enPos);
      let dir = V.scale(V.perp(toEn), strafeSign);
      const err = en.dist - desired;
      dir = V.add(dir, V.scale(toEn, Math.max(-1, Math.min(1, err * 0.35))));
      dir = V.norm(dir);
      // avoid walking into enemy zones or blocks
      const ahead = { x: me.x + dir.x * 2.2, z: me.z + dir.z * 2.2 };
      let bad = insideBlock(p, ahead, 2.052) || Math.abs(ahead.x) > 19 || Math.abs(ahead.z) > 19;
      if (!bad) {
        for (const z of p.arena.zones) {
          if (!z.mine && V.dist(z, ahead) < z.r + me.radius) { bad = true; break; }
        }
      }
      if (bad) {
        strafeSign = -strafeSign; lastFlip = p.t;
        dir = pickEscape(p, mePos, V.scale(dir, -1));
      }
      api.move(dir.x, dir.z);
    }
  }

  // ---------- OFFENSE ----------
  if (me.busy) return;

  const enInMyZone = p.arena.zones.some(z => z.mine && V.dist(z, enPos) < z.r + en.radius * 0.6);
  const enSlowed = en.speed < 3.6;
  const enBusy = !!en.casting;

  // k2: setup zone (pull + slow) to anchor them for the lob
  if (api.ready('k2') && en.visible && en.dist < 11.3 && !enInMyZone) {
    let aim = { x: en.x + en.vx * 0.55, z: en.z + en.vz * 0.55 };
    aim = clampArena(clampRange(mePos, aim, 11.8));
    if (insideBlock(p, aim, 0.2)) aim = clampRange(mePos, enPos, 11.8);
    api.use('k2', aim.x, aim.z);
    comboUntil = p.t + 3.2;
    say(p, api, 'Иди сюда.');
    return;
  }

  // k3: the real damage — fire over walls when the shot is good
  if (api.ready('k3') && en.dist < 15.2) {
    if (wantFireSince < 0) wantFireSince = p.t;
    const good = enInMyZone || enSlowed || enBusy || en.dist < 7.5 ||
                 comboUntil > p.t || (p.t - wantFireSince > 1.6);
    if (good) {
      const T = 0.55 + en.dist / 12;
      let aim;
      if (enInMyZone) {
        // pull drags them toward me — aim slightly on my side of them
        aim = V.add(enPos, V.scale(V.toward(enPos, mePos), 0.9));
      } else {
        const lf = enBusy || enSlowed ? 1.0 : 0.55 + api.rand() * 0.4;
        aim = { x: en.x + en.vx * T * lf, z: en.z + en.vz * T * lf };
      }
      aim = clampArena(clampRange(mePos, aim, 12.136));
      api.use('k3', aim.x, aim.z);
      wantFireSince = -1;
      return;
    }
  } else {
    wantFireSince = -1;
  }

  // k1: damage zone when they are anchored or close
  if (api.ready('k1') && en.visible && en.dist < 13.786 &&
      (enInMyZone || enSlowed || en.dist < 6.5 || enBusy)) {
    let aim = { x: en.x + en.vx * 0.5, z: en.z + en.vz * 0.5 };
    if (enInMyZone) aim = V.add(enPos, V.scale(V.toward(enPos, mePos), 0.8));
    aim = clampArena(clampRange(mePos, aim, 11.8));
    if (insideBlock(p, aim, 0.2)) aim = clampRange(mePos, enPos, 11.8);
    api.use('k1', aim.x, aim.z);
    return;
  }
}