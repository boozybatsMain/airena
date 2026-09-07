const S = { strafe: 1, strafeAt: 0, silUntil: 0, ecd: {}, lastSay: -99, told: false };

function skillOf(p, kind) {
  const kit = p.self.kit || {};
  for (const n of (p.self.skills || [])) if (kit[n] && kit[n].kind === kind) return n;
  return null;
}
function enemySkillOf(p, kind) {
  const kit = p.enemy.kit || {};
  for (const n of (p.enemy.skills || [])) if (kit[n] && kit[n].kind === kind) return n;
  return null;
}
function safeDir(api, dir) {
  const n = V.norm(dir);
  if (!n.x && !n.z) return n;
  for (const a of [0, 0.6, -0.6, 1.2, -1.2, 1.9, -1.9, 2.6, -2.6]) {
    const d = V.rot(n, a);
    const r = api.ray(d.x, d.z, 3.2);
    if (!r.hit) return d;
  }
  return n;
}
function sayOnce(p, api, text, gap) {
  if (p.t - S.lastSay > gap) { api.say(text); S.lastSay = p.t; }
}

function think(p, api) {
  const me = p.self, en = p.enemy;
  const kit = me.kit || {};
  const bolt = skillOf(p, 'bolt');
  const blink = skillOf(p, 'blink');
  const zone = skillOf(p, 'zone');
  const eBlink = enemySkillOf(p, 'blink');
  const eBolt = enemySkillOf(p, 'bolt');
  const eZone = enemySkillOf(p, 'zone');
  const mePos = { x: me.x, z: me.z };
  const enPos = { x: en.x, z: en.z };
  const enVel = { x: en.vx || 0, z: en.vz || 0 };
  const dist = en.dist;

  // ---- events
  for (const ev of p.events || []) {
    if (ev.type === 'dealt' && bolt && ev.skill === bolt) {
      const m = kit[bolt] && kit[bolt].magnitudes && kit[bolt].magnitudes.silence;
      S.silUntil = p.t + ((m && m.duration) || 1.8);
    }
    if (ev.type === 'enemyStarted' && en.kit && en.kit[ev.skill]) {
      S.ecd[ev.skill] = p.t + (en.kit[ev.skill].cooldown || 3);
    }
    if (ev.type === 'blocked') { S.strafe = -S.strafe; S.strafeAt = p.t; }
  }
  const enemySilenced = S.silUntil > p.t + 0.05;
  const enemyBlinkDown = eBlink ? (S.ecd[eBlink] || 0) > p.t + 0.3 : false;

  if (!S.told) { S.told = true; sayOnce(p, api, "Come closer. I dare you.", 0); }

  // ---- strafe sign flip
  if (p.t - S.strafeAt > 1.2 + api.rand() * 1.4) {
    if (api.rand() < 0.6) S.strafe = -S.strafe;
    S.strafeAt = p.t;
  }

  // ---- incoming projectile threat
  let threat = null;
  for (const pr of p.arena.projectiles || []) {
    if (pr.mine) continue;
    const v = { x: pr.vx, z: pr.vz };
    const v2 = V.dot(v, v);
    if (pr.arc) {
      const land = { x: pr.x + pr.vx * pr.left, z: pr.z + pr.vz * pr.left };
      const d = V.dist(land, mePos);
      if (d < 5) {
        const dir = V.away(mePos, land);
        if (!threat || pr.left < threat.t) threat = { t: pr.left, d, dir, arc: true };
      }
      continue;
    }
    if (v2 < 1e-6) continue;
    const rel = V.sub(mePos, { x: pr.x, z: pr.z });
    let tc = V.dot(rel, v) / v2;
    if (tc < -0.05) continue;
    tc = Math.min(Math.max(tc, 0), pr.left);
    const pt = { x: pr.x + v.x * tc, z: pr.z + v.z * tc };
    const d = V.dist(pt, mePos);
    if (d < 2.7) {
      const vn = V.norm(v);
      let side = V.sub(rel, V.scale(vn, V.dot(rel, vn)));
      let dir;
      if (V.len(side) < 0.25) dir = V.scale(V.perp(vn), S.strafe);
      else dir = V.norm(side);
      if (!threat || tc < threat.t) threat = { t: tc, d, dir, arc: false };
    }
  }

  // ---- enemy zone I'm standing in
  let inZone = null;
  for (const z of p.arena.zones || []) {
    if (z.mine) continue;
    const c = { x: z.x, z: z.z };
    const d = V.dist(c, mePos);
    const edge = z.r + me.radius + 0.4;
    if (d < edge) {
      const depth = edge - d;
      let dir = d > 0.1 ? V.away(mePos, c) : V.perp(V.toward(mePos, enPos));
      if (!inZone || depth > inZone.depth) inZone = { depth, dir, left: z.left };
    }
  }

  const enCast = en.casting && en.casting.telegraph ? en.casting : null;
  const enCastKind = enCast && en.kit && en.kit[enCast.skill] ? en.kit[enCast.skill].kind : null;
  const toEn = dist > 0.01 ? V.toward(mePos, enPos) : { x: 0, z: 1 };
  const perpEn = V.perp(toEn);

  // ---- predicted points
  const bw = bolt && kit[bolt] ? (kit[bolt].windup || 0.367) : 0.367;
  const bs = bolt && kit[bolt] ? (kit[bolt].speed || 22) : 22;
  const eAtStrike = V.add(enPos, V.scale(enVel, bw));
  const leadPt = V.lead(mePos, eAtStrike, enVel, bs);
  const zw = zone && kit[zone] ? (kit[zone].windup || 0.467) : 0.467;
  const zr = zone && kit[zone] ? (kit[zone].range || 12) : 12;
  const zrad = zone && kit[zone] ? (kit[zone].radius || 3) : 3;
  const mePred = V.add(mePos, V.scale({ x: me.vx || 0, z: me.vz || 0 }, zw * 0.7));
  let zonePt = V.add(enPos, V.scale(enVel, zw + 0.12));
  {
    const dz = V.dist(zonePt, mePred);
    if (dz > zr - 0.2) zonePt = V.add(mePred, V.scale(V.toward(mePred, zonePt), zr - 0.2));
  }
  const zoneHits = V.dist(zonePt, V.add(enPos, V.scale(enVel, zw + 0.12))) < zrad + en.radius - 0.6;

  // ---- defensive blink
  let blinked = false;
  const blinkReady = blink && api.ready(blink);
  if (blinkReady) {
    if (threat && !threat.arc && threat.t < 0.32 && threat.d < 2.3) {
      api.use(blink, threat.dir.x, threat.dir.z); blinked = true;
      sayOnce(p, api, "Too slow.", 4);
    } else if (threat && threat.arc && threat.t < 0.3) {
      api.use(blink, threat.dir.x, threat.dir.z); blinked = true;
    } else if (inZone && inZone.depth > 2.4 && inZone.left > 0.4) {
      api.use(blink, inZone.dir.x, inZone.dir.z); blinked = true;
    } else if (me.hp < 45 && dist < 6 && !me.busy && enCastKind === 'bolt') {
      const d = V.rot(V.away(mePos, enPos), (api.rand() < 0.5 ? 1 : -1) * 0.8);
      api.use(blink, d.x, d.z); blinked = true;
    } else if (enemySilenced && zone && api.ready(zone) && dist > zr + 2.5 && dist < zr + 8 && !me.busy && me.hp > 60) {
      api.use(blink, toEn.x, toEn.z); blinked = true;
      sayOnce(p, api, "Nowhere to run.", 4);
    }
  }

  // ---- offense
  const dangerNow = (threat && threat.t < 0.6) || (inZone && inZone.depth > 1.5);
  if (!blinked && !me.busy && !me.silenced && !me.stunned) {
    const boltReady = bolt && api.ready(bolt);
    const zoneReady = zone && api.ready(zone);
    const boltRange = bolt && kit[bolt] ? (kit[bolt].range || 18) + 2.2 : 20;
    const canBolt = boltReady && en.visible && !en.invulnerable && V.dist(leadPt, mePos) < boltRange && (() => {
      const dirL = V.toward(mePos, leadPt);
      const r = api.ray(dirL.x, dirL.z, Math.min(V.dist(leadPt, mePos) + 1, 40));
      return !r.hit || r.dist > V.dist(leadPt, mePos) - 1.5;
    })();
    const zoneWant = zoneReady && !en.invulnerable && zoneHits &&
      (enemySilenced || enemyBlinkDown || enCast || en.speed < 3.2 || dist < 8 || en.stunned || en.rooted || api.rand() < 0.35);
    if (zoneWant && (enemySilenced || en.stunned || !canBolt) && !(dangerNow && !enemySilenced)) {
      api.use(zone, { x: zonePt.x, z: zonePt.z });
      if (enemySilenced) sayOnce(p, api, "Hold still.", 5);
    } else if (canBolt && !(dangerNow && threat && threat.t < 0.25)) {
      api.use(bolt, { x: leadPt.x, z: leadPt.z });
    } else if (zoneWant && !dangerNow) {
      api.use(zone, { x: zonePt.x, z: zonePt.z });
    } else {
      api.faceAt(leadPt.x, leadPt.z);
    }
  } else if (!blinked && !me.busy) {
    api.faceAt(leadPt.x, leadPt.z);
  }

  // ---- movement
  const burnPhase = p.burn > 0 || p.burnStartsIn < 3;
  const ahead = me.hp / me.maxHp > en.hp / en.maxHp + 0.04;
  let R = 10.5;
  if (enemySilenced) R = 7;
  if (burnPhase && ahead) R = 15;
  if (burnPhase && !ahead) R = 8;
  if (me.silenced) R = 14;

  let mv = null;
  if (threat && threat.t < 0.9) {
    mv = threat.dir;
    if (threat.d > 1.4 && !threat.arc) mv = V.add(threat.dir, V.scale(perpEn, S.strafe * 0.3));
  } else if (inZone) {
    mv = inZone.dir;
  } else if (enCastKind === 'bolt' && dist < 16) {
    mv = V.add(V.scale(perpEn, S.strafe), V.scale(toEn, dist > R + 1 ? 0.35 : dist < R - 2 ? -0.5 : 0));
  } else if (enCastKind === 'zone') {
    mv = V.add(V.scale(perpEn, S.strafe * 1.2), V.scale(toEn, dist < 9 ? -0.6 : 0.2));
  } else if (!en.visible) {
    mv = null;
    if (burnPhase && ahead) {
      const away = V.away(mePos, enPos);
      mv = away;
    } else {
      api.moveTo(en.x, en.z);
    }
  } else {
    let radial = 0;
    if (dist > R + 1.5) radial = 0.9;
    else if (dist < R - 1.5) radial = -0.9;
    mv = V.add(V.scale(toEn, radial), V.scale(perpEn, S.strafe * 0.85));
  }
  if (mv) {
    const d = safeDir(api, mv);
    api.move(d.x, d.z);
  }

  if (p.burn > 0 && ahead) sayOnce(p, api, "Feel the heat? It likes you more.", 9);
  else if (me.hp < 50) sayOnce(p, api, "Not done yet.", 9);
}