function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me || !en || !me.alive) return;

  const mePos = { x: me.x, z: me.z };
  const enPos = { x: en.x, z: en.z };
  const dist = en.dist;
  const toEn = V.toward(mePos, enPos);
  const away = { x: -toEn.x, z: -toEn.z };

  // ---------- events ----------
  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      if (e.skill === 'charge') S.lastCharge = p.t;
      else if (e.skill === 'smash') S.lastSmash = p.t;
      else if (e.skill === 'jump') S.lastJump = p.t;
    } else if (e.type === 'enemyCommitted') {
      S.commitT = p.t;
      S.commitDir = V.fromHeading(en.heading);
      S.commitFrom = { x: en.x, z: en.z };
    } else if (e.type === 'blocked') {
      S.spin = -S.spin; S.spinT = p.t;
    } else if (e.type === 'damaged') {
      S.lastHit = p.t;
      if (e.skill === 'charge') S.lastCharge = p.t - 0.6;
      if (e.skill === 'smash') S.lastSmash = p.t - 0.3;
    }
  }

  const ec = en.casting;
  const enCharge = !!(ec && ec.skill === 'charge');
  const enDash = enCharge && (ec.phase === 'dash');
  const enWind = enCharge && (ec.phase === 'windup');
  const enSmash = !!(ec && ec.skill === 'smash' && ec.telegraph !== false && ec.phase === 'windup');
  const enHelpless = !!(en.stunned || (ec && ec.phase === 'recover') || (en.airborne && dist > 5));

  // charge availability guess
  const chargeCd = S.lastCharge < -50 ? 0 : Math.max(0, S.lastCharge + 4.033 - p.t);

  // ---------- dash line threat ----------
  let dashDir = null;
  if (enDash) {
    const sp = Math.hypot(en.vx, en.vz);
    dashDir = sp > 3 ? { x: en.vx / sp, z: en.vz / sp } : (S.commitDir || V.fromHeading(en.heading));
  } else if (enWind) {
    dashDir = V.fromHeading(en.heading);
  }
  let threat = false, threatPerp = 0, threatSide = 1, threatAlong = 0;
  if (dashDir) {
    const rel = V.sub(mePos, enPos);
    const along = rel.x * dashDir.x + rel.z * dashDir.z;
    const cross = rel.x * dashDir.z - rel.z * dashDir.x;
    threatAlong = along;
    threatPerp = Math.abs(cross);
    threatSide = cross >= 0 ? 1 : -1;
    if (enDash) threat = along > -1.5 && along < 14 && threatPerp < 2.9;
    else threat = along > -1 && along < 14 && threatPerp < 5.5 && dist < 15;
  }

  // ---------- outputs ----------
  let moveDir = null;
  let faceP = null;
  let skill = null;

  // ---------- aim prediction ----------
  const casting = me.casting && me.casting.skill === 'laser' && me.casting.telegraph;
  let lead = casting ? Math.max(0, me.casting.remaining - 0.05) : 0.70;
  if (en.speed > 8) lead = Math.min(lead, 0.12);
  let pred = { x: en.x + en.vx * lead, z: en.z + en.vz * lead };
  pred = clampArena(pred, 19.4);
  if (!api.los(pred.x, pred.z)) pred = enPos;
  faceP = pred;

  // ================= REACTIONS =================
  let handled = false;

  // 1. dodge a committed / live charge
  if (enDash && threat) {
    const perp = { x: dashDir.z * threatSide, z: -dashDir.x * threatSide };
    if (api.ready('blink') && !me.busy && !me.stunned && !me.airborne) {
      const bd = chooseBlink(p, api, (land, d) => {
        const rel = V.sub(land, enPos);
        const cr = Math.abs(rel.x * dashDir.z - rel.z * dashDir.x);
        const al = rel.x * dashDir.x + rel.z * dashDir.z;
        let s = Math.min(cr, 6) * 2.2 + Math.min(V.dist(land, enPos), 16) * 0.5;
        if (al > 0 && al < 13 && cr < 3) s -= 12;
        return s;
      });
      if (bd) { skill = ['blink', bd.x, bd.z]; }
    }
    moveDir = { x: perp.x - dashDir.x * 0.25, z: perp.z - dashDir.z * 0.25 };
    handled = true;
  }
  // 2. charge wind-up: strafe hard, keep blink
  else if (enWind && dist < 16) {
    const perp = { x: toEn.z * S.spin, z: -toEn.x * S.spin };
    moveDir = { x: perp.x * 1.0 + away.x * 0.55, z: perp.z * 1.0 + away.z * 0.55 };
    if (dist < 5.5 && api.ready('blink') && !me.busy && !me.airborne && !me.stunned) {
      const bd = chooseBlink(p, api, (land) => V.dist(land, enPos));
      if (bd) skill = ['blink', bd.x, bd.z];
    }
    handled = true;
  }
  // 3. smash wind-up close by
  else if (enSmash && dist < 7.0) {
    moveDir = away;
    if (!me.busy && !me.airborne && !me.stunned) {
      if (api.ready('jump')) skill = ['jump'];
      else if (api.ready('blink')) {
        const bd = chooseBlink(p, api, (land) => V.dist(land, enPos));
        if (bd) skill = ['blink', bd.x, bd.z];
      }
    }
    handled = true;
  }
  // 4. too close for comfort
  else if (dist < 4.6 && !me.busy && !me.airborne && !me.stunned) {
    if (api.ready('blink')) {
      const bd = chooseBlink(p, api, (land) => V.dist(land, enPos) + (api.los(land.x, land.z) ? 0 : 1.5));
      if (bd) skill = ['blink', bd.x, bd.z];
    } else if (api.ready('jump') && dist < 3.6) {
      skill = ['jump'];
    }
    moveDir = away;
    handled = true;
  }

  // ================= LASER =================
  if (!skill && !me.busy && !me.airborne && !me.stunned && api.ready('laser')) {
    const safeRange = dist > 6.8 || enHelpless || me.invulnerable;
    const noThreat = !enDash && !(enWind && dist < 13) && !(enSmash && dist < 7);
    if (en.visible && dist < 23.5 && dist > 1.6 && safeRange && noThreat) {
      const ang = Math.abs(V.angleTo(me.heading, V.toward(mePos, pred)));
      if (ang < 1.15) skill = ['laser'];
    }
  }

  // ================= MOVEMENT =================
  if (!moveDir) {
    // spin maintenance
    const tangRaw = { x: toEn.z * S.spin, z: -toEn.x * S.spin };
    const tr = api.ray(tangRaw.x, tangRaw.z, 4);
    if (tr.dist < 2.4) { S.spin = -S.spin; S.spinT = p.t; }
    else if (p.t - S.spinT > 5 && api.rand() < 0.03) { S.spin = -S.spin; S.spinT = p.t; }
    const tang = { x: toEn.z * S.spin, z: -toEn.x * S.spin };

    let radW;
    if (dist < 8) radW = 1.5;
    else if (dist < 13) radW = 0.9;
    else if (dist < 19) radW = 0.15;
    else radW = -0.35;

    const rad = Math.hypot(me.x, me.z);
    let cenW = 0;
    if (rad > 11) cenW = Math.min(1.4, Math.pow((rad - 10) / 8, 1.6) * 1.4);
    const cen = rad > 0.5 ? { x: -me.x / rad, z: -me.z / rad } : { x: 0, z: 0 };

    let pref = {
      x: away.x * radW + tang.x * 0.95 + cen.x * cenW,
      z: away.z * radW + tang.z * 0.95 + cen.z * cenW
    };

    // seek line of sight when armed and blind
    if (!en.visible && dist > 7 && api.cooldown('laser') < 0.5) {
      const path = api.pathTo(en.x, en.z);
      if (path && path.points && path.points.length) {
        const wp = path.points[0];
        const d = V.toward(mePos, wp);
        pref = { x: pref.x * 0.35 + d.x * 1.2, z: pref.z * 0.35 + d.z * 1.2 };
      }
    }
    pref = V.norm(pref);
    if (pref.x === 0 && pref.z === 0) pref = away;

    let best = null, bestS = -1e9;
    for (let i = 0; i < 20; i++) {
      const a = (i * Math.PI * 2) / 20;
      const d = { x: Math.sin(a), z: Math.cos(a) };
      const r = api.ray(d.x, d.z, 4.5);
      const step = Math.min(3.5, Math.max(0.5, r.dist - 1.0));
      const f = { x: me.x + d.x * step, z: me.z + d.z * step };
      let s = (d.x * pref.x + d.z * pref.z) * 3.2 + Math.min(r.dist, 4.5) * 0.45;
      const wm = 20 - Math.max(Math.abs(f.x), Math.abs(f.z));
      if (wm < 3.5) s -= (3.5 - wm) * 2.2;
      const fd = V.dist(f, enPos);
      if (fd < 6.5) s -= (6.5 - fd) * 1.6;
      if (r.dist < 1.4) s -= 5;
      if (s > bestS) { bestS = s; best = d; }
    }
    moveDir = best || away;
  }

  // ================= FACING =================
  if (!en.visible && !casting && dist > 8) {
    const path = api.pathTo(en.x, en.z);
    if (path && path.points && path.points.length && !path.direct) {
      faceP = path.points[0];
    }
  }

  // ================= EMIT =================
  if (moveDir) api.move(moveDir.x, moveDir.z);
  if (faceP) api.faceAt(faceP.x, faceP.z);
  if (skill) {
    if (skill.length === 3) api.use(skill[0], skill[1], skill[2]);
    else api.use(skill[0]);
  }

  if (p.t - S.sayT > 6.5) {
    S.sayT = p.t;
    api.say(TAUNTS[(S.sayI++) % TAUNTS.length]);
  }
}

const S = {
  spin: 1,
  spinT: 0,
  lastCharge: -99,
  lastSmash: -99,
  lastJump: -99,
  lastHit: -99,
  commitT: -99,
  commitDir: null,
  commitFrom: null,
  sayT: -99,
  sayI: 0
};

const TAUNTS = [
  "eight arms, one beam",
  "you are large and slow",
  "come closer, ape",
  "ink and light",
  "the floor is lava soon",
  "keep running at me"
];

function clampArena(pt, m) {
  return {
    x: Math.max(-m, Math.min(m, pt.x)),
    z: Math.max(-m, Math.min(m, pt.z))
  };
}

function inObst(p, x, z, pad) {
  const obs = p.arena.obstacles;
  for (let i = 0; i < obs.length; i++) {
    const o = obs[i];
    if (Math.abs(x - o.x) < o.hx + pad && Math.abs(z - o.z) < o.hz + pad) return true;
  }
  return false;
}

function landingFor(p, dir, maxd) {
  let d = maxd;
  while (d > 1.0) {
    const x = p.self.x + dir.x * d;
    const z = p.self.z + dir.z * d;
    if (Math.abs(x) < 19.2 && Math.abs(z) < 19.2 && !inObst(p, x, z, 1.05)) {
      return { x, z, d };
    }
    d -= 1.1;
  }
  return null;
}

function chooseBlink(p, api, scoreFn) {
  let best = null, bestS = -1e9;
  for (let i = 0; i < 24; i++) {
    const a = (i * Math.PI * 2) / 24;
    const dir = { x: Math.sin(a), z: Math.cos(a) };
    const land = landingFor(p, dir, 7.2);
    if (!land) continue;
    let s = scoreFn(land, land.d);
    const rad = Math.hypot(land.x, land.z);
    if (rad > 16) s -= (rad - 16) * 1.1;
    s += land.d * 0.12;
    if (s > bestS) { bestS = s; best = dir; }
  }
  return best;
}
