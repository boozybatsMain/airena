/*
 * CONTROLLER — a setup-and-punish pilot for ANY legal kit. It knows no ability
 * by name: every thought it reads p.self.skills and the live numbers in
 * p.self.kit, sorts what it holds into SETUP (stun, root, silence, blind, pull,
 * wall, weaken, knock), PUNISH (damage, burn), GUARD (shield, heal, cleanse,
 * boost) and MOVES (blink, jump, dash), then runs one loop: open a window with
 * a setup effect, land damage inside it, guard itself while the window is shut,
 * and stand where the punish it intends to use will reach. It remembers when
 * the enemy last used each ability and, with their cooldowns from p.enemy.kit,
 * attacks hardest while their punch is down and times its own long casts into
 * the gaps between their interrupters. Cooldown lengths are never assumed.
 *
 * Nor is any other length. Every magnitude it weighs — how long a control
 * holds, how big a shield is, what a heal can cap at, how long a boost lifts
 * and a weaken bites — is read from `kit[name].magnitudes` on the thought
 * that uses it. Mortars and fields are ordered at a PLACE
 * (`api.use(name, { x, z })`), led onto where the body will be and held
 * inside the ability's own reach.
 */

let lastSay = -99;
const seen = {};           // enemy skill -> t of its last 'enemyStarted'
const refusedAt = {};      // my skill -> t of its last refusal
let pending = null;        // my control cast still in flight: { name, at, dur }
let windowUntil = -1;      // the enemy is held by my control until this t
let lastHurt = -99;        // t of the last hit I took
let strafe = 1;            // strafe side, flipped now and then by api.rand
let strafeAt = 0;
const boostedUntil = {};   // channel -> t my boost on it runs out
const weakenedUntil = {};  // channel -> t my weaken on the enemy runs out
let lastFlyer = null;      // the enemy's last bolt or lob: what their projectiles carry

const IMMUNE = { stun: ['act', 'move'], root: ['move'], silence: ['act'], blind: ['sense'] };
const LEAD = 0.5;          // lead a flying shot by half its travel time: measured best against a circling body
const THREAT = { damage: 10, burn: 8, stun: 7, silence: 7, root: 5, blind: 4, knock: 3, pull: 3, weaken: 3 };
/* The four effects that take a decision away. Their NAMES are grammar; their
   lengths are not, and are read off the ability that carries them. */
const HOLDS = ['stun', 'root', 'silence', 'blind'];

/*
 * LIVE MAGNITUDES — the one place an effect's numbers are true.
 *
 * `kit[name].magnitudes[effect]` carries `mag`, `duration` and `immune`, and
 * the effect-count share is ALREADY in them: `src/skills/compile.js` divides
 * before perception is built, so this reads and never re-divides.
 *
 * `null` means the kit did not name it, and only one kit does that — the
 * reference fixture, which presents damage.mag, knock.mag and stun.duration
 * and nothing else. Every reader below answers that case on its own terms.
 */
function magOf(k, id, field) {
  const m = k && k.magnitudes && k.magnitudes[id];
  const v = m ? m[field] : undefined;
  return (typeof v === 'number' && isFinite(v)) ? v : null;
}

function describe(name, k) {
  const eff = k.effects || [];
  const has = (id) => eff.indexOf(id) >= 0;
  const selfKind = k.kind === 'self' || k.kind === 'blink' || k.kind === 'jump';
  const reach = k.range !== undefined ? k.range : (k.distance !== undefined ? k.distance : (selfKind ? 1e9 : 3));
  /* How long this ability holds them still. Unnamed reads as a short hold:
     the fixture names its stun's own seconds and carries no other control. */
  let hold = 0;
  for (const e of eff) {
    if (HOLDS.indexOf(e) < 0) continue;
    const d = magOf(k, e, 'duration');
    hold = Math.max(hold, d === null ? 0.8 : d);
  }
  return {
    name, k, kind: k.kind, eff, has, selfKind, reach, hold, windup: k.windup || 0, cd: k.cooldown || 0,
    /* A heal is a CAP plus a share of the hp that is missing (`src/core/
       effects.js`). The kit names the cap and neither the floor nor the share,
       so this is the MOST it can ever give — `null` is "it did not say", and
       the reader falls back to asking for a wound rather than a number. A
       shield's `mag` is simply the amount it puts up. */
    healAmt: magOf(k, 'heal', 'mag'), shieldAmt: magOf(k, 'shield', 'mag'),
    point: k.aim === 'point', splash: k.splash || 0,
    /* THE FREE BODY VERB: a leap with nothing on it that no budget paid for.
       A dodge and a gap it crosses, never a damage or utility card. Its own
       flag first, its shape second, so it reads before and after it lands. */
    universal: k.universal === true || (k.kind === 'jump' && eff.length === 0),
    hurts: has('damage') || has('burn'), ground: k.kind === 'cone' || k.kind === 'zone' || k.kind === 'dash',
    los: k.kind === 'beam' || k.kind === 'cone' || k.kind === 'dash' || k.kind === 'bolt',
    /* Travel speed, live: a delivery without one resolves where the cast ends. */
    flight: (k.kind === 'bolt' || k.kind === 'lob') && k.speed > 0 ? k.speed : 0,
  };
}

/* Does the segment a→b cross the block o? Slab test on the ground plane. */
function crosses(a, b, o) {
  let t0 = 0, t1 = 1;
  const lo = [o.x - o.hx, o.z - o.hz], hi = [o.x + o.hx, o.z + o.hz];
  const s = [a.x, a.z], d = [b.x - a.x, b.z - a.z];
  for (let i = 0; i < 2; i++) {
    if (Math.abs(d[i]) < 1e-9) { if (s[i] < lo[i] || s[i] > hi[i]) return false; continue; }
    let u0 = (lo[i] - s[i]) / d[i], u1 = (hi[i] - s[i]) / d[i];
    if (u0 > u1) { const w = u0; u0 = u1; u1 = w; }
    if (u0 > t0) t0 = u0;
    if (u1 < t1) t1 = u1;
    if (t0 > t1) return false;
  }
  return true;
}

/* The nearest spot beside a block that the enemy cannot see. */
function coverSpot(me, en, obstacles, R, half) {
  let best = null, bestD = 9;
  for (const o of obstacles) {
    const c = { x: o.x, z: o.z };
    const away = V.away(c, en);
    if (V.len(away) < 0.5) continue;
    const lim = half - R - 0.5;
    const spot = V.add(c, V.scale(away, Math.max(o.hx, o.hz) + R + 1.2));
    spot.x = V.clamp(spot.x, -lim, lim); spot.z = V.clamp(spot.z, -lim, lim);
    if (V.dist(spot, en) < 5) continue;
    let hidden = false;
    for (const o2 of obstacles) if (crosses(en, spot, o2)) { hidden = true; break; }
    if (!hidden) continue;
    const d = V.dist(me, spot);
    if (d < bestD) { bestD = d; best = spot; }
  }
  return best;
}

function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me || !me.alive || !en) return;
  const t = p.t, R = me.radius || 1, half = (p.arena && p.arena.half) || 20;
  const mePos = { x: me.x, z: me.z }, enPos = { x: en.x, z: en.z };
  const say = (text, gap) => { if (t - lastSay > gap) { api.say(text); lastSay = t; } };

  // ── both kits, as they are held right now ──────────────────────────────
  /* Both sides always present a kit in the grammar's shape — a fighter that
     holds none is shown the reference fixture's skills in the same fields —
     so nothing here needs a table of ability names, and no ability is known
     by name anywhere in this file. */
  const myKit = me.kit || {}, enKit = en.kit || {};
  const mine = [], theirs = [];
  for (const n of me.skills || []) { const k = myKit[n]; if (k) mine.push(describe(n, k)); }
  for (const n of en.skills || []) { const k = enKit[n]; if (k) theirs.push(describe(n, k)); }
  let shortPunish = false, losOnly = false;
  for (const s of mine) if (s.hurts) { if (s.reach < 9) shortPunish = true; if (s.los) losOnly = true; }

  // ── what happened since the last thought ───────────────────────────────
  for (const ev of p.events || []) {
    if (ev.type === 'enemyStarted') { seen[ev.skill] = t; const k = enKit[ev.skill]; if (k && (k.kind === 'bolt' || k.kind === 'lob')) lastFlyer = ev.skill; }
    else if (ev.type === 'refused') refusedAt[ev.skill] = t;
    else if (ev.type === 'damaged') lastHurt = t;
    else if (ev.type === 'missed' && pending && ev.skill === pending.name) pending = null;
  }
  if (pending && t >= pending.at + 0.1) {
    windowUntil = Math.max(windowUntil, pending.at + pending.dur); pending = null;
    if (windowUntil > t) say('Window open.', 6);
  }

  // ── the enemy's cooldowns, as far as I have seen them ──────────────────
  const threatOf = (s) => { let v = 0; for (const e of s.eff) v += THREAT[e] || 0; return v; };
  const enReady = (s) => seen[s.name] === undefined || seen[s.name] + s.cd <= t;
  let dangerAll = 0, dangerUp = 0, bigUp = null, meleeUp = false, losUp = false;
  for (const s of theirs) {
    const v = threatOf(s);
    dangerAll += v;
    if (!enReady(s) || v <= 0) continue;
    dangerUp += v;
    if (!bigUp || v > threatOf(bigUp)) bigUp = s;
    if (s.kind === 'cone' || s.kind === 'dash') meleeUp = true; else if (s.kind === 'beam' || s.kind === 'bolt') losUp = true;
  }
  const exposed = dangerAll > 0 && dangerUp <= 0.45 * dangerAll;
  const enRecover = !!(en.casting && !en.casting.telegraph);
  const held = en.stunned || en.rooted;
  const immune = en.immune || [];
  const window = held || t < windowUntil;
  const cast = en.casting;
  let inc = null;
  if (cast && cast.telegraph) for (const s of theirs) if (s.name === cast.skill) inc = s;
  const toStrike = inc ? Math.max(0, inc.windup - cast.elapsed) : 99;
  const cancels = (s) => s.has('stun') || s.has('knock') || s.has('pull');
  const incCancels = !!inc && cancels(inc);
  /* When could the enemy next cancel a cast of mine? Their interrupters I have
     seen are on cooldown; ones I have not seen are assumed ready. */
  let nextCancel = 99;
  for (const s of theirs) if (cancels(s)) nextCancel = Math.min(nextCancel, seen[s.name] === undefined ? 0 : Math.max(0, seen[s.name] + s.cd - t));
  if (incCancels) nextCancel = Math.min(nextCancel, toStrike);
  const hpFrac = me.hp / me.maxHp;
  const afflicted = me.rooted || me.blinded || me.burning;
  const closeDanger = !!bigUp && en.dist <= (bigUp.reach < 1e8 ? bigUp.reach : 8) + R + 2;

  // ── where the enemy will be in T seconds: circling bodies curve ────────
  const toEn = V.toward(mePos, enPos);
  const enVel = { x: en.vx || 0, z: en.vz || 0 };
  const predict = (T) => {
    if (held) return enPos;
    const d = Math.max(en.dist, 0.5), lim = half - 1;
    const vr = V.dot(enVel, toEn), vt = V.dot(enVel, V.perp(toEn));
    const at = V.add(mePos, V.scale(V.rot(toEn, (vt / d) * T), Math.max(0.5, d + vr * T)));
    return { x: V.clamp(at.x, -lim, lim), z: V.clamp(at.z, -lim, lim) };
  };

  // ── threats in the air: step out of a bolt's line, off a mortar's mark ──
  const toMe = V.toward(enPos, mePos);
  const side = V.scale(V.len(toMe) ? V.perp(toMe) : { x: 1, z: 0 }, strafe);
  let dodgeGoal = null, blinkDir = null, jumpNow = false;
  const flyerCancels = !!lastFlyer && theirs.some((s) => s.name === lastFlyer && cancels(s));
  for (const pr of (p.arena && p.arena.projectiles) || []) {
    if (pr.mine) continue;
    if (pr.arc) {
      const spot = { x: pr.x + pr.vx * pr.left, z: pr.z + pr.vz * pr.left };
      const d = V.dist(mePos, spot);
      if (d < 1.8 + R + 0.6) {
        dodgeGoal = V.add(spot, V.scale(d > 0.2 ? V.away(mePos, spot) : side, 1.8 + R + 1.5));
        if (flyerCancels) nextCancel = Math.min(nextCancel, pr.left);
      }
    } else {
      const v = V.norm({ x: pr.vx, z: pr.vz });
      const rel = V.sub(mePos, { x: pr.x, z: pr.z });
      const along = V.dot(rel, v), speed = Math.hypot(pr.vx, pr.vz) || 1;
      const perp = V.perp(v), off = V.dot(rel, perp);
      if (along > 0 && Math.abs(off) < R + 1.0 && along / speed < 0.6) {
        if (flyerCancels) nextCancel = Math.min(nextCancel, along / speed);
        const dir = V.scale(perp, off >= 0 ? 1 : -1);
        dodgeGoal = V.add(mePos, V.add(V.scale(dir, 3), V.scale(toEn, shortPunish ? 2 : 0)));
        if (along / speed < 0.3) blinkDir = dir;
      }
    }
  }

  // ── which abilities can fire now, and how likely each is to land ───────
  const canCast = !me.busy && !me.stunned && !me.airborne && !me.silenced;
  const usable = (s) => canCast && (me.cooldowns[s.name] || 0) <= 0 && !(refusedAt[s.name] !== undefined && t - refusedAt[s.name] < 0.5);
  const hitp = (s, anywhere) => {
    if (s.selfKind) return 1;
    const at = predict(s.windup), pd = V.dist(mePos, at);
    const ang = Math.abs(V.angleTo(me.heading, V.toward(mePos, at)));
    const gap = en.radius || 0;
    const clearAhead = () => { const r = api.ray(Math.sin(me.heading), Math.cos(me.heading), s.reach); return !r || !r.hit || r.dist > en.dist - gap; };
    if (s.kind === 'beam') return (anywhere || (pd <= s.reach + gap && clearAhead())) && en.visible ? 1 : 0;
    if (s.kind === 'cone') return (anywhere || (pd <= s.reach + gap - 0.4 && ang < (s.k.halfAngle || 0.9) + 0.8)) && en.visible && !en.airborne ? 1 : 0;
    if (s.kind === 'dash') return (anywhere || (pd <= s.reach + gap && ang < Math.atan2(R + gap - 0.3, Math.max(pd, 0.1)) + 0.15)) && en.visible && !en.airborne ? 0.9 : 0;
    if (s.kind === 'bolt') return (anywhere || (en.dist <= s.reach + gap && clearAhead())) && en.visible ? (held ? 1 : (en.dist > 10 && en.speed > 4 ? 0.55 : 0.85)) : 0;
    /* A mortar cannot be dropped nearer than my own radius plus its splash —
       the world clamps it there, and inside that the circle covers me. */
    if (s.kind === 'lob') return (anywhere || en.dist <= s.reach + gap) && en.dist >= R + s.splash ? (held ? 1 : (en.speed > 3 ? 0.55 : 0.8)) : 0;
    if (s.kind === 'zone') return (anywhere || en.dist <= s.reach + gap) ? (en.airborne ? 0.3 : (held ? 1 : 0.65)) : 0;
    return 0.5;
  };
  const punishWithin = (dur) => mine.some((s) => s.hurts && (me.cooldowns[s.name] || 0) <= dur && hitp(s, true) > 0);
  const punishReady = punishWithin(0);
  const setupSoon = mine.some((s) => s.hold > 0 && !s.hurts && (me.cooldowns[s.name] || 0) < 1.0);

  // ── a wind-up aimed at me: sidestep, and time the i-frames or the hop.
  //    A ready punish of my own trades fan for fan when theirs cannot cancel it.
  if (inc && !me.airborne) {
    const trade = punishReady && inc.kind === 'cone' && !incCancels && hpFrac >= en.hp / en.maxHp - 0.15;
    if (inc.kind === 'cone' && en.dist < inc.reach + R + 2 && !trade) dodgeGoal = V.add(mePos, V.scale(V.norm(V.add(toMe, side)), 5));
    else if (inc.kind === 'dash' && en.dist < inc.reach + 3) dodgeGoal = V.add(mePos, V.scale(side, 5));
    if ((inc.kind === 'beam' || inc.kind === 'cone' || inc.kind === 'dash') && toStrike <= 0.24 && (inc.kind === 'beam' || dodgeGoal)) blinkDir = side;
    if (inc.ground && toStrike >= 0.1 && toStrike <= 0.5 && (inc.kind === 'zone' || dodgeGoal)) jumpNow = true;
  }
  const wantBarrier = (inc && inc.kind === 'dash' && toStrike > 0.25) ? 14
    : (meleeUp && !window && en.dist < 7 && !shortPunish) ? 10
    : (losUp && !window && en.visible && en.dist > 5 && !punishReady) ? 8
    : (hpFrac < 0.35 && closeDanger) ? 10 : 0;

  // ── worth of firing s right now (0 = not now) ──────────────────────────
  const score = (s, anywhere) => {
    const h = hitp(s, anywhere);
    let v = 0;
    if (s.hurts) {
      let d = 10 + (s.k.damage || 0) * 0.25 + (s.has('burn') ? 8 : 0);
      if (window) d *= 1.6; else if (exposed || enRecover) d *= 1.3;
      else if (setupSoon && !s.hold) d *= 0.6;
      if (s.kind === 'zone') d *= held ? 1.3 : 1;
      v += d * h;
    }
    const canPunish = punishWithin(s.hold + s.windup + 0.3);
    const open = (e) => !IMMUNE[e].some((c) => immune.indexOf(c) >= 0);
    const interrupt = inc && inc.windup > 0.2 && toStrike > s.windup + 0.07 && ((s.has('stun') && open('stun')) || s.has('knock') || s.has('pull'));
    if (s.has('stun') && open('stun')) v += (interrupt ? 16 : 0) + (held ? 2 : (canPunish ? 13 : 7)) * h;
    if (s.has('silence') && open('silence')) v += (dangerUp > 0 ? 12 : 4) * h;
    if (s.has('root') && open('root')) v += (held ? 2 : (canPunish ? 12 : 6)) * h;
    if (s.has('blind') && open('blind')) v += (canPunish ? 9 : 5) * h;
    if (s.has('knock')) v += ((interrupt ? 12 : 0) + (en.dist < 5 && meleeUp && !shortPunish ? 8 : 2)) * h;
    if (s.has('pull')) v += ((interrupt ? 8 : 0) + (shortPunish && en.dist > 6 ? 9 : (en.hp < me.hp && en.dist > 10 ? 6 : 2))) * h;
    if (s.has('weaken') && t >= (weakenedUntil[s.k.channel] || 0)) {
      const ch = s.k.channel;
      v += (ch === 'damage' ? (dangerUp > 0 ? 9 : 3) : ch === 'armor' ? (punishReady ? 9 : 4) : ch === 'speed' ? (meleeUp || en.dist > 8 ? 7 : 4)
        : ch === 'vision' ? 7 : ch === 'cooldown' ? 6 : 5) * h;
    }
    /* A wall lands whether or not the cast hits, and it blocks MY beams,
       bolts, cones and dashes as surely as theirs: worth it only when I want
       a barrier more than a line of sight, or the line is already broken. */
    if (s.has('wall')) v += wantBarrier > 0 ? wantBarrier : ((losOnly || shortPunish) && en.visible && en.dist < 14 ? -12 : 1.5);
    const g = s.selfKind ? 1 : h;   // self effects ride a targeted delivery only when it HITS
    /* Worn past most of what it put up counts as down; with no amount named,
       any shell at all counts as up. */
    const shieldDown = s.shieldAmt === null ? me.shield <= 0 : me.shield < s.shieldAmt * 0.4;
    if (s.has('shield')) v += ((t - lastHurt < 1.5 || (inc && toStrike > s.windup) || closeDanger) && shieldDown ? 10 : (hpFrac < 0.9 && me.shield <= 0 ? 4 : 1)) * g;
    /* The heal can never give more than its cap, so ask for room to hold the
       cap. No cap named — ask for a wound instead of inventing a number. */
    const healRoom = s.healAmt === null ? me.hp < me.maxHp : me.maxHp - me.hp >= s.healAmt * 0.9;
    if (s.has('heal')) v += (healRoom ? (hpFrac < 0.5 ? 8 : 2) + 14 * (1 - hpFrac) : 0) * g;
    if (s.has('cleanse')) v += (afflicted ? 14 : 0) * g;
    if (s.has('boost') && t >= (boostedUntil[s.k.channel] || 0)) {
      const ch = s.k.channel;
      v += (ch === 'damage' ? (punishReady || window ? 9 : 3) : ch === 'armor' ? (closeDanger ? 8 : 3) : ch === 'speed' ? (Math.abs(en.dist - 7) > 5 || hpFrac < 0.3 ? 7 : 3)
        : ch === 'cooldown' ? 4 : ch === 'range' ? (punishReady ? 6 : 3) : ch === 'vision' ? (me.blinded ? 6 : 2) : 4) * g;
    }
    if (s.kind === 'dash' && !s.hurts) v *= (shortPunish && en.dist > s.reach + 3 && en.visible && !meleeUp) ? 1.5 : (s.hold > 0 ? 1 : 0.5);
    if (s.kind === 'blink') {
      if (blinkDir) v += 18;
      else if (hpFrac < 0.35 && closeDanger) v += 12;
      else if (shortPunish && en.dist > 10 && !meleeUp && punishWithin(0.5)) v += 8;
    }
    if (s.windup > 0.2 && !s.selfKind) v *= nextCancel < s.windup + 0.1 ? 0.6 : 1.2;
    if (s.kind === 'jump') {
      /* Air clears the three GROUND shapes and nothing else. The free body
         verb carried no effect into the sums above, so the dodge is the whole
         of what it is ever worth — and a hair under a paid leap that answers
         the same wind-up AND carries something. */
      if (s.universal) return jumpNow ? 19 : 0;
      if (jumpNow) v += 20;
      else if (inc || held || window || punishWithin(0.9)) v = 0;
      else v *= 0.5;
    }
    return v;
  };

  // ── choose the shot ─────────────────────────────────────────────────────
  let best = null, bestV = 0;
  for (const s of mine) { if (!usable(s)) continue; const v = score(s, false); if (v > bestV) { bestV = v; best = s; } }
  // ── and the ability I intend to use next, ready or not, for footing ────
  let plan = null, planV = -1;
  for (const s of mine) {
    if (s.selfKind) continue;
    const cd = me.cooldowns[s.name] || 0;
    const v = Math.max(score(s, true), 1) * (s.hurts ? 1.6 : 1) / (1 + cd * 0.4);
    if (v > planV) { planV = v; plan = s; }
  }

  // ── aim: at the enemy, or ahead of them for anything slow ──────────────
  /*
   * THE LEAD. Where the body will be when the shape gets there: its own
   * motion carried over what is left of the wind-up, plus — for anything that
   * TRAVELS — the flight time.
   *
   * The flight time is an ESTIMATE, and it has to be: it is the distance to
   * the landing spot over the delivery's own speed, and the spot itself moves
   * with the lead the estimate produces. Solved three times, which settles to
   * inside a body's width at the cadence this game runs at. A delivery with no
   * speed of its own — a FIELD is placed, not thrown — leads on the wind-up
   * alone.
   */
  const leadOf = (s, elapsed) => {
    const left = Math.max(0, s.windup - (elapsed || 0));
    let T = left;
    if (s.flight > 0) for (let i = 0; i < 3; i++) T = left + V.dist(mePos, predict(T)) / s.flight;
    return predict(T * LEAD);
  };
  /*
   * A POINT ORDER, held to the bounds the world holds it to.
   *
   * `api.use(name, { x, z })` names a PLACE, and the sim reads it as a
   * direction plus a distance along that direction (`src/core/deliver.js`): a
   * mortar lands at that distance clamped into [my radius + splash, range], a
   * field at min(range, distance), a blink steps min(distance, that). Clamped
   * the same way here, so the spot I scored is the spot that happens.
   */
  const pointFor = (s, at) => {
    const d0 = V.dist(mePos, at);
    if (d0 < 1e-9) return { x: at.x, z: at.z };
    const dir = V.toward(mePos, at);
    let d = d0;
    if (s.kind === 'lob') d = V.clamp(d, R + s.splash, s.reach);
    else if (s.kind === 'zone' || s.kind === 'blink') d = Math.min(d, s.reach);
    return { x: mePos.x + dir.x * d, z: mePos.z + dir.z * d };
  };
  const leads = (s) => s.flight > 0 || s.kind === 'zone';

  let castingNow = null;
  if (me.casting) for (const s of mine) if (s.name === me.casting.skill) castingNow = s;
  const tracking = castingNow && leads(castingNow) ? castingNow : (best && leads(best) ? best : null);
  let aim = enPos;
  if (tracking) aim = leadOf(tracking, tracking === castingNow && me.casting ? me.casting.elapsed : 0);
  api.faceAt(aim.x, aim.z);

  if (best && api.ready(best.name)) {
    if (best.kind === 'blink') {
      const dir = blinkDir || ((hpFrac < 0.35 && closeDanger) ? V.away(mePos, enPos) : (en.dist > 10 && shortPunish && !meleeUp) ? toEn : side);
      if (best.point) {
        const at = pointFor(best, { x: me.x + dir.x * best.reach, z: me.z + dir.z * best.reach });
        api.use(best.name, { x: at.x, z: at.z });
      } else api.use(best.name, dir.x, dir.z);
      if (blinkDir) say('Not this time.', 7);
    } else if (best.point || best.kind === 'lob' || best.kind === 'zone') {
      /* A MORTAR AND A FIELD ARE ORDERED AT A PLACE, not at a distance along
         whatever my nose is doing when the cast lands: they are slow, and the
         lead is the only reason a slow shape ever connects. */
      const at = pointFor(best, leads(best) ? leadOf(best, 0) : aim);
      api.use(best.name, { x: at.x, z: at.z });
    } else {
      api.use(best.name);
      if (jumpNow && best.kind === 'jump') say('Over it.', 7);
    }
    /* How long my own boost lifts and my own weaken bites — the ability's own
       seconds, not a number typed here. One conservative second when the kit
       names none, which only the fixture ever does. */
    const spanOf = (e) => { const d = magOf(best.k, e, 'duration'); return d === null ? 1 : d; };
    if (best.has('boost') && best.selfKind) boostedUntil[best.k.channel] = t + spanOf('boost') - 0.3;
    if (best.has('weaken')) weakenedUntil[best.k.channel] = t + best.windup + spanOf('weaken') - 0.5;
    if (best.hold > 0 && !best.selfKind) {
      pending = { name: best.name, at: t + best.windup + (best.flight ? en.dist / best.flight : 0), dur: best.hold };
      say('Hold still.', 7);
    } else if (best.has('heal')) say('Patching up.', 7);
  }

  // ── footing: by the ability I mean to use next ─────────────────────────
  const gap = en.radius || 0;
  let want = 7 + gap;
  if (plan) want = (plan.kind === 'cone' || plan.kind === 'dash' ? plan.reach * 0.55 : plan.reach * 0.75) + gap;
  if (meleeUp && !window && plan && plan.reach > 6) want = Math.max(want, 6 + R + gap);
  if (exposed || window) want = Math.min(want, (plan ? plan.reach * 0.6 : 5) + gap);
  want = Math.max(want, 2.5 * R);

  let goal = null;
  for (const z of (p.arena && p.arena.zones) || []) {
    if (z.mine || V.dist(mePos, z) > z.r + R) continue;
    goal = V.add(z, V.scale(V.dist(mePos, z) > 0.2 ? V.away(mePos, z) : side, z.r + R + 2)); break;
  }
  if (!goal && dodgeGoal) goal = dodgeGoal;
  if (!goal && me.blinded && en.dist < 8) goal = V.add(mePos, V.scale(V.away(mePos, enPos), 6));
  /* Cover against a beam or bolt only when it costs me no shot of my own. */
  const waiting = !plan || (me.cooldowns[plan.name] || 0) > 3 || (hpFrac < 0.3 && dangerUp > 0);
  if (!goal && losUp && !window && en.visible && bigUp && (bigUp.kind === 'beam' || bigUp.kind === 'bolt') && (waiting || !plan.los)) {
    const spot = coverSpot(mePos, enPos, (p.arena && p.arena.obstacles) || [], R, half);
    if (spot) { goal = spot; say('Behind cover.', 9); }
  }
  if (!goal && plan && plan.los && !en.visible) goal = enPos;
  if (!goal) {
    if (t - strafeAt > 2.5 && api.rand() < 0.35) { strafe = -strafe; strafeAt = t; }
    const band = 1.5 * R, step = 4 * R;
    goal = en.dist > want + band ? V.sub(enPos, V.scale(toEn, want))
      : en.dist < want - band ? V.sub(mePos, V.scale(toEn, step)) : V.add(mePos, V.scale(V.perp(toEn), step * strafe));
  }
  const lim = half - R - 0.3;
  api.moveTo(V.clamp(goal.x, -lim, lim), V.clamp(goal.z, -lim, lim));
}
