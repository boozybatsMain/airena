// ── blue: patient lobber. speed is the shield, the mortar is the argument. ──

let strafeSign = 1;
let lastFlip = 0;
let lastSay = -99;
let stuckFor = 0;
let lastPos = null;

const ARENA_MARGIN = 1.85;

function say(p, api, text) {
  if (p.t - lastSay > 7) { lastSay = p.t; api.say(text); }
}

function clampArena(pt, m) {
  const lim = 20 - (m || ARENA_MARGIN);
  return { x: Math.max(-lim, Math.min(lim, pt.x)), z: Math.max(-lim, Math.min(lim, pt.z)) };
}

function classify(kit, names) {
  const r = { buff: null, zone: null, mortar: null, direct: null, blink: null, dash: null };
  for (const n of names || []) {
    const k = kit[n];
    if (!k) continue;
    const kind = String(k.kind || '');
    const eff = (k.effects || []).map(e => String(e));
    const hasEff = re => eff.some(e => re.test(e));
    const isSelf = k.aim === 'none' || /self|aura/.test(kind);
    if (/blink|teleport/.test(kind) || hasEff(/blink|teleport/)) { if (!r.blink) r.blink = n; continue; }
    if (isSelf && hasEff(/heal|shield|cleanse|regen/)) { if (!r.buff) r.buff = n; continue; }
    if (/zone|field|disc|trap/.test(kind) || (k.radius && k.duration && !isSelf)) { if (!r.zone) r.zone = n; continue; }
    if (/lob|mortar|arc/.test(kind) || (k.speed && k.splash)) { if (!r.mortar) r.mortar = n; continue; }
    if (/dash|lunge|charge|leap/.test(kind)) { if (!r.dash) r.dash = n; continue; }
    if (!r.direct) r.direct = n;
  }
  return r;
}

function skillDamage(k) {
  if (!k) return 0;
  let d = k.damage || 0;
  const mg = k.magnitudes || {};
  for (const key of Object.keys(mg)) {
    const m = mg[key];
    if (m && typeof m.mag === 'number' && /dmg|damage|burn|fire|strike/.test(key)) d = Math.max(d, m.mag);
  }
  return d;
}

function predictEnemy(en, t, factor) {
  return clampArena({ x: en.x + en.vx * t * factor, z: en.z + en.vz * t * factor }, 1.0);
}

function aimLobPoint(me, en, k, factor) {
  const windup = k.windup != null ? k.windup : 0.5;
  const speed = k.speed || 12;
  const range = k.range || 12;
  const splash = k.splash || 1.5;
  const from = { x: me.x + me.vx * windup, z: me.z + me.vz * windup };
  let target = { x: en.x, z: en.z };
  for (let i = 0; i < 3; i++) {
    const flight = V.dist(from, target) / speed;
    target = predictEnemy(en, windup + flight, factor);
  }
  let d = V.sub(target, from);
  let len = V.len(d);
  const minD = me.radius + splash + 0.05;
  if (len < 0.001) return clampArena({ x: from.x, z: from.z + minD }, ARENA_MARGIN);
  const clamped = Math.max(minD, Math.min(range * 0.98, len));
  const unit = V.scale(d, 1 / len);
  return clampArena({ x: from.x + unit.x * clamped, z: from.z + unit.z * clamped }, ARENA_MARGIN);
}

function safeDir(api, dir) {
  if (!dir || (dir.x === 0 && dir.z === 0)) return dir;
  const base = V.norm(dir);
  const probe = api.ray(base.x, base.z, 2.8);
  if (!probe || !probe.hit || probe.dist > 2.3) return base;
  const offs = [0.7, -0.7, 1.3, -1.3, 2.0, -2.0, 2.7, -2.7];
  for (const a of offs) {
    const r = V.rot(base, a);
    const pr = api.ray(r.x, r.z, 2.8);
    if (!pr || !pr.hit || pr.dist > 2.3) return r;
  }
  return V.rot(base, Math.PI);
}

function think(p, api) {
  const me = p.self;
  const en = p.enemy;
  if (!me || !me.alive) return;

  const kit = me.kit || {};
  const roles = classify(kit, me.skills || Object.keys(kit));

  // ── events ──────────────────────────────────────────────────────────────
  let tookHit = false;
  for (const ev of p.events || []) {
    if (ev.type === 'damaged') tookHit = true;
    if (ev.type === 'blocked' || ev.type === 'contact') { strafeSign = -strafeSign; lastFlip = p.t; }
  }
  if (tookHit && p.t - lastFlip > 0.5) { strafeSign = -strafeSign; lastFlip = p.t; }

  if (!en || !en.alive) {
    api.stop();
    say(p, api, "Arena's mine.");
    return;
  }

  const dist = typeof en.dist === 'number' ? en.dist : V.dist(me, en);
  const myFrac = me.hp / (me.maxHp || 1);
  const enFrac = en.hp / (en.maxHp || 1);

  // ── threat field ────────────────────────────────────────────────────────
  let threat = { x: 0, z: 0 };
  let urgent = false;
  const dangerR = 1.9 + me.radius;

  for (const pr of p.arena.projectiles || []) {
    if (pr.mine) continue;
    const left = Math.max(0, pr.left || 0);
    if (pr.arc) {
      const land = { x: pr.x + pr.vx * left, z: pr.z + pr.vz * left };
      const d = V.dist(me, land);
      const ring = dangerR + 2.6;
      if (d < ring) {
        let away = V.norm(V.sub(me, land));
        if (away.x === 0 && away.z === 0) away = V.fromHeading(me.heading + 1.57);
        const w = 1.4 + 2.4 * (ring - d) / ring;
        threat = V.add(threat, V.scale(away, w));
        if (d < dangerR + 1.4) urgent = true;
      }
    } else {
      const v = { x: pr.vx, z: pr.vz };
      const vl = V.len(v);
      if (vl > 0.01) {
        const rel = V.sub(me, { x: pr.x, z: pr.z });
        const tca = Math.max(0, Math.min(left, V.dot(rel, v) / (vl * vl)));
        const close = { x: pr.x + pr.vx * tca, z: pr.z + pr.vz * tca };
        const d = V.dist(me, close);
        if (d < me.radius + 2.6) {
          const perp = V.perp(V.norm(v));
          const side = V.dot(V.sub(me, close), perp) >= 0 ? 1 : -1;
          threat = V.add(threat, V.scale(perp, 2.4 * side));
          if (tca < 0.55) urgent = true;
        }
      }
    }
  }

  for (const z of p.arena.zones || []) {
    if (z.mine) continue;
    const d = V.dist(me, z);
    const ring = (z.r || 3) + me.radius + 1.4;
    if (d < ring) {
      let away = V.norm(V.sub(me, z));
      if (away.x === 0 && away.z === 0) away = V.fromHeading(me.heading + 2.0);
      threat = V.add(threat, V.scale(away, 2.0 + 2.0 * (ring - d) / ring));
      if (d < (z.r || 3) + me.radius) urgent = true;
    }
  }

  // ── stance ──────────────────────────────────────────────────────────────
  const ahead = myFrac - enFrac;
  let want = 8.6;
  if (ahead > 0.06) want = 12.0;
  if (ahead > 0.18 || (p.burn > 0 && ahead > 0.03)) want = 13.5;
  if (ahead < -0.12) want = 7.4;
  const mortarK = roles.mortar ? kit[roles.mortar] : null;
  if (mortarK && mortarK.range) want = Math.min(want, mortarK.range - 1.5);
  want = Math.max(5.5, want);

  // ── steering ────────────────────────────────────────────────────────────
  const toEn = V.norm(V.sub(en, me));
  const radial = V.scale(toEn, Math.max(-1.3, Math.min(1.3, (dist - want) * 0.45)));
  if (p.t - lastFlip > 1.6 + api.rand() * 1.6) { strafeSign = -strafeSign; lastFlip = p.t; }
  const tangent = V.scale(V.perp(toEn), strafeSign * 1.05);

  let steer = V.add(radial, tangent);
  steer = V.add(steer, V.scale(threat, urgent ? 2.2 : 1.1));

  // walls & corners
  const edge = 20 - 4.0;
  if (me.x > edge) steer = V.add(steer, { x: -(me.x - edge) * 0.9, z: 0 });
  if (me.x < -edge) steer = V.add(steer, { x: (-edge - me.x) * 0.9, z: 0 });
  if (me.z > edge) steer = V.add(steer, { x: 0, z: -(me.z - edge) * 0.9 });
  if (me.z < -edge) steer = V.add(steer, { x: 0, z: (-edge - me.z) * 0.9 });

  // stuck detection
  if (lastPos && V.dist(lastPos, me) < 0.06 && me.speed < 0.6) stuckFor += p.dt;
  else stuckFor = 0;
  lastPos = { x: me.x, z: me.z };
  if (stuckFor > 0.4) {
    strafeSign = -strafeSign;
    steer = V.add(V.scale(V.perp(toEn), strafeSign * 1.4), V.scale(toEn, -0.4));
    stuckFor = 0;
  }

  const dir = safeDir(api, steer);
  if (dir && (dir.x !== 0 || dir.z !== 0)) api.move(dir.x, dir.z);
  else api.move(toEn.x, toEn.z);

  // ── casting ─────────────────────────────────────────────────────────────
  if (me.busy || me.casting || me.stunned || me.silenced) {
    api.faceAt(en.x, en.z);
    return;
  }

  const evadeFactor = (en.casting || en.rooted || en.stunned) ? 0.45 : 0.85;
  const enemyThreatens = dist < 15 && (en.casting || dist < 11);

  // escape blink when badly hurt and crowded
  if (roles.blink && myFrac < 0.4 && dist < 5.5 && api.ready(roles.blink)) {
    const away = V.norm(V.sub(me, en));
    api.use(roles.blink, away.x, away.z);
    say(p, api, "Not today.");
    return;
  }

  // panic sustain
  if (roles.buff && myFrac < 0.6 && api.ready(roles.buff)) {
    api.faceAt(en.x, en.z);
    api.use(roles.buff);
    say(p, api, "Patch and press.");
    return;
  }

  // primary: the lob
  if (roles.mortar && api.ready(roles.mortar) && !urgent) {
    const k = kit[roles.mortar];
    const reach = (k.range || 12) + (k.splash || 1.5) + (en.radius || 1.5);
    if (dist <= reach - 0.4) {
      const pt = aimLobPoint(me, en, k, evadeFactor);
      api.use(roles.mortar, pt);
      say(p, api, "Look up.");
      return;
    }
  }

  // secondary: the disc, laid where they are going
  if (roles.zone && api.ready(roles.zone) && !urgent) {
    const k = kit[roles.zone];
    const range = k.range || 12;
    const reach = range + (k.radius || 3) + (en.radius || 1.5);
    if (dist <= reach - 1.0 && dist > (k.radius || 3) * 0.6) {
      const windup = k.windup != null ? k.windup : 0.5;
      let tgt = predictEnemy(en, windup + 0.18, evadeFactor);
      const from = { x: me.x + me.vx * windup, z: me.z + me.vz * windup };
      let d = V.sub(tgt, from);
      let len = V.len(d);
      if (len > range * 0.97) { const u = V.scale(d, 1 / len); tgt = { x: from.x + u.x * range * 0.97, z: from.z + u.z * range * 0.97 }; }
      if (V.dist(me, tgt) > (k.radius || 3) + me.radius - 0.4) {
        api.use(roles.zone, clampArena(tgt, 1.2));
        say(p, api, "Floor's hot now.");
        return;
      }
    }
  }

  // direct-fire fallback (bolt / beam / whatever is equipped instead)
  if (roles.direct && api.ready(roles.direct) && !urgent) {
    const k = kit[roles.direct];
    const range = k.range || k.distance || 10;
    if (dist <= range + (k.splash || 0) + (en.radius || 1.5) - 0.3 && en.visible) {
      const spd = k.speed || 0;
      const lead = spd > 0
        ? V.lead({ x: me.x, z: me.z }, { x: en.x, z: en.z }, { x: en.vx * evadeFactor, z: en.vz * evadeFactor }, spd)
        : { x: en.x, z: en.z };
      if (k.aim === 'point') api.use(roles.direct, clampArena(lead, 0.8));
      else { api.faceAt(lead.x, lead.z); api.use(roles.direct); }
      return;
    }
  }

  // top up shield/heal whenever it is not wasted
  if (roles.buff && api.ready(roles.buff)) {
    const wantBuff = myFrac < 0.97 || (me.shield <= 0 && enemyThreatens);
    if (wantBuff && !urgent) {
      api.faceAt(en.x, en.z);
      api.use(roles.buff);
      return;
    }
  }

  api.faceAt(en.x, en.z);
}