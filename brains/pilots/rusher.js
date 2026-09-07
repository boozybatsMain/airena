/**
 * RUSHER — a kit-agnostic pilot that closes and never idles.
 *
 * It knows no ability by name: p.self.skills gives the names, p.self.kit the
 * live numbers, and every delivery kind and effect is handled by its shape.
 * Nothing assumes a cooldown figure — readiness is asked of api.ready.
 *
 * Once per thought: (1) read the moment — contact distance, what the enemy is
 * winding up, which of its abilities are on cooldown (announced uses + its
 * kit's cooldown figures), which controls of mine sit inside their immunity
 * window; (2) score every READY ability and fire the best — damage whenever
 * it lands, close shapes first in contact, dash/blink as closers, control to
 * keep contact, heal/shield only when hurt, and the free body verb ONLY as a
 * dodge; (3) aim at the enemy or the lead point of a bolt/mortar, name a
 * PLACE for anything aimed at one, never start a cast the body cannot turn
 * into in time; (4) move — leave a hostile field or a landing shot, detour a
 * wall the navigator cannot see, otherwise chase along a route around the
 * blocks and orbit once in contact.
 *
 * Every magnitude and length it plans against — a shield's size, a heal's
 * cap, how long its burn or its boost runs, how long a control holds and how
 * long the immunity behind it lasts — is read out of
 * `p.self.kit[name].magnitudes` on the spot. There is no table of numbers in
 * this file, because a table would describe a game that has already moved.
 */

let lastSay = -99;
let strafeSign = 1;
let strafeFlipAt = 0;
/* Clocks: my controls' landings, my burn on the enemy, my shield and my
   boosts. Every LENGTH written into them is read out of the kit at the moment
   of the cast (`magnitudes`), never out of a table here: the kit changes
   without me, and a number typed in this file would be a number about a game
   that has already moved on. */
const ctlAt = {};
let burnUntil = -99;
let shieldUntil = -99;
const buffUntil = {};
let rangeMul = 1;
const enReadyAt = {};
/* Lead on a moving target: a bolt trusts the straight line, a mortar's slow arc does not. */
const LEAD_BOLT = 1.0;
const LEAD_LOB = 0.5;
/* The four effects that take a decision away. Their NAMES are grammar and do
   not change; their lengths are read from the kit. */
const CONTROLS = ['stun', 'root', 'silence', 'blind'];

function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me || !me.alive || !en || !en.alive) return;
  const say = function (text, gap) { if (p.t - lastSay > gap) { api.say(text); lastSay = p.t; } };

  /* ── 1. the moment ────────────────────────────────────────────────────── */
  const meP = { x: me.x, z: me.z };
  const enP = { x: en.x, z: en.z };
  const enVel = { x: en.vx || 0, z: en.vz || 0 };
  const to = V.toward(meP, enP);
  const R = me.radius || 1, ER = en.radius || 1;
  const hug = R + ER + 0.5;                   // centre-to-centre contact distance
  const inContact = en.dist <= hug + 1.0;
  const hpFrac = me.hp / Math.max(1, me.maxHp);
  const kit = me.kit || {};
  const names = [];
  for (let i = 0; i < (me.skills || []).length; i++) {
    const n = me.skills[i];
    if (kit[n] && Array.isArray(kit[n].effects)) names.push(n);
  }
  const enCast = (en.casting && en.casting.telegraph) ? en.casting : null;
  const enSkill = (enCast && en.kit && en.kit[enCast.skill]) || null;
  const isGround = (k) => k.kind === 'cone' || k.kind === 'zone' || k.kind === 'dash';
  const has = (k, id) => k.effects.indexOf(id) >= 0;
  const half = (p.arena && p.arena.half) || 20;
  /*
   * LIVE MAGNITUDES — the only place an effect's numbers are true.
   *
   * `p.self.kit[name].magnitudes[effect]` carries `mag`, `duration` and
   * `immune` for every effect the ability holds, and the effect-count share is
   * ALREADY in them: `src/skills/compile.js` divides before perception is
   * built. So this reads and never re-divides.
   *
   * `null` means "the kit did not name it". The reference fixture is the kit
   * that does that: it presents damage.mag, knock.mag and stun.duration and
   * nothing else, so every caller below answers the missing case on its own
   * terms — with a wound, a zero, or one short conservative second — and never
   * with a table of numbers from a version of the game that is gone.
   */
  const magOf = function (k, id, field) {
    const m = k && k.magnitudes && k.magnitudes[id];
    const v = m ? m[field] : undefined;
    return (typeof v === 'number' && isFinite(v)) ? v : null;
  };
  /*
   * THE UNIVERSAL SLOT — a body verb nobody paid for: a leap with nothing on
   * it, handed out free beside the three abilities I own. It is a DODGE and a
   * gap it crosses, never a card that damages or helps, and it may not be in
   * the kit at all. Recognised by its own flag first and by its shape second,
   * so it works before and after it lands, and its absence costs nothing.
   */
  const isUniversal = (k) => k.universal === true || (k.kind === 'jump' && k.effects.length === 0);
  const fleeing = Math.max(0, V.dot(enVel, to));   // enemy backing off along our line
  let myLines = false;                             // do I attack along lines a wall would cut?
  for (let i = 0; i < names.length; i++) {
    const kk = kit[names[i]].kind;
    if (kk === 'beam' || kk === 'cone' || kk === 'bolt' || kk === 'dash') myLines = true;
  }

  /* Events: enemy uses start their cooldowns; a missed cast of mine put nothing anywhere. */
  for (let i = 0; i < (p.events || []).length; i++) {
    const ev = p.events[i];
    if (ev.type === 'enemyStarted' && en.kit && en.kit[ev.skill]) enReadyAt[ev.skill] = p.t + (en.kit[ev.skill].cooldown || 0);
    if (ev.type !== 'missed' || !kit[ev.skill]) continue;
    const mk = kit[ev.skill];
    if (ev.reason === 'immune' && ev.effect) ctlAt[ev.effect] = p.t - 1.5;
    else {
      for (const e of mk.effects) if (CONTROLS.indexOf(e) >= 0) ctlAt[e] = -99;
      if (has(mk, 'burn')) burnUntil = -99;
      if (has(mk, 'boost') && mk.channel) buffUntil[mk.channel] = -99;
    }
  }
  const enReady = (n, within) => enReadyAt[n] === undefined || enReadyAt[n] <= p.t + within;
  const enBusyFor = (en.casting && en.casting.remaining) || 0;
  /* Could the enemy break a wind-up of mine lasting w seconds (a ready knock or stun)? */
  const enBreaksIn = function (w) {
    if (!en.kit || en.stunned || enBusyFor > w) return false;
    for (const n in en.kit) {
      const ek = en.kit[n];
      if (!ek || !ek.effects || ek.kind === 'self' || ek.kind === 'jump' || ek.kind === 'blink') continue;
      if ((ek.effects.indexOf('knock') >= 0 || ek.effects.indexOf('stun') >= 0) && enReady(n, w + 0.1)) return true;
    }
    return false;
  };
  /* Can the enemy get off the floor before a sweep of mine arrives? */
  let enCanHop = false;
  if (en.kit && !en.stunned && !en.airborne && enBusyFor < 0.45) {
    for (const n in en.kit) if (en.kit[n] && en.kit[n].kind === 'jump' && enReady(n, 0.15)) enCanHop = true;
  }
  /* A control holds for its own duration and leaves an immunity to itself
     behind it; both lengths are in the kit. Nothing named means the fixture's
     stun, which leaves no window at all: assume a short hold and no immunity
     rather than invent one. */
  const ctlWindow = function (e, k) {
    const dur = magOf(k, e, 'duration'), imm = magOf(k, e, 'immune');
    return (dur === null ? 0.8 : dur) + (imm === null ? 0 : imm) + 0.1;
  };
  const ctlFresh = (e, k) => !(ctlAt[e] !== undefined && p.t - ctlAt[e] < ctlWindow(e, k));

  /*
   * THE REACH RULE, both ways round. This is the line `src/brain/prompt.js`
   * prints under `reach` and `tools/checkbehaviour.mjs` measures by binary
   * search against the world itself: the beam leaves `caster radius + 0.2`
   * ahead of the centre and carries 0.4 m of margin; the bolt leaves
   * `caster radius + 0.3` and touches at `target radius + 0.35`; the fan, the
   * mortar and the field are measured to the target's SURFACE, so the target's
   * radius counts and the caster's does not; the lunge counts both radii
   * around its line. `cr` is whoever is casting, `tr` whoever is being hit —
   * so the same rule answers "does mine reach them" and "does theirs reach me".
   */
  const reachBetween = function (k, cr, tr, mul) {
    if (k.kind === 'beam') return cr + 0.2 + (k.range || 0) * mul + tr + 0.4;
    if (k.kind === 'cone') return (k.range || 0) * mul + tr;
    if (k.kind === 'bolt') return cr + 0.3 + (k.range || 0) * mul + tr + 0.35;
    if (k.kind === 'lob') return (k.range || 0) * mul + (k.splash || 0) + tr;
    if (k.kind === 'zone') return (k.range || 0) * mul + (k.radius || 0) + tr;
    if (k.kind === 'dash') return (k.distance || 0) + cr + tr;
    return 1e9;                                // blink, self, jump land on me
  };
  const rm = (buffUntil.range !== undefined && p.t < buffUntil.range) ? rangeMul : 1;
  const reachOf = (k) => reachBetween(k, R, ER, rm);

  /* Where to point for a delivery, and for a mortar how far to drop it. */
  const aimFor = function (k) {
    if (!k) return { at: { x: en.x + enVel.x * 0.07, z: en.z + enVel.z * 0.07 }, dist: en.dist };
    if (k.kind === 'bolt') {
      const w = k.windup || 0;
      const from = { x: en.x + enVel.x * w, z: en.z + enVel.z * w };
      const at = V.lerp(from, V.lead(meP, from, enVel, k.speed || 0), LEAD_BOLT);
      return { at, dist: V.dist(meP, at) };
    }
    if (k.kind === 'lob') {
      /* Flight time is the distance the shell has to cover over its speed;
         solved twice because the distance moves with the lead. */
      let d = en.dist, at = enP;
      for (let i = 0; i < 3; i++) {
        const flight = k.speed > 0 ? d / k.speed : 0;
        const t = ((k.windup || 0) + flight) * LEAD_LOB;
        at = { x: en.x + enVel.x * t, z: en.z + enVel.z * t };
        d = V.dist(meP, at);
      }
      return { at, dist: d };
    }
    /* A FIELD GOES WHERE THEY ARE, NOT WHERE THEY ARE GOING. I fight at hug
       distance: at two metres the lead is longer than the disc is wide and it
       lands behind the body I am already touching. */
    if (k.kind === 'zone') return { at: enP, dist: en.dist };
    const t = (k.windup || 0) * 0.5 + 0.07;
    return { at: { x: en.x + enVel.x * t, z: en.z + enVel.z * t }, dist: en.dist };
  };

  /*
   * A POINT ORDER, clamped the way the world clamps it.
   *
   * `api.use(name, { x, z })` names a PLACE. The sim reads it as a direction
   * and a distance along that direction (`src/core/deliver.js`): a mortar
   * lands at the point's distance held inside [my radius + splash, range], a
   * field at min(range, distance). Clamping identically here means the spot I
   * scored is the spot the disc or the shell actually lands on.
   */
  const pointFor = function (k, at) {
    const dir = V.toward(meP, at);
    if (V.len(dir) < 1e-9) return { x: at.x, z: at.z };
    let d = V.dist(meP, at);
    if (k.kind === 'lob') d = V.clamp(d, R + (k.splash || 0), (k.range || d) * rm);
    else if (k.kind === 'zone') d = Math.min(d, (k.range || d) * rm);
    return { x: me.x + dir.x * d, z: me.z + dir.z * d };
  };

  /* Is the line to a point clear with a margin w on both sides? */
  const lineRoom = function (at, w) {
    if (!api.los(at.x, at.z)) return 0;
    const sd = V.perp(V.toward(meP, at));
    return api.los(at.x + sd.x * w, at.z + sd.z * w) && api.los(at.x - sd.x * w, at.z - sd.z * w) ? 1 : 0.5;
  };
  /* Could this land now? Reach, cover, height, turn-in time, line room. 0..1 confidence. */
  const hittable = function (k) {
    const kind = k.kind;
    if (kind === 'self' || kind === 'jump' || kind === 'blink') return 1;
    if (en.dist > reachOf(k) - 0.2 - fleeing * (k.windup || 0)) return 0;
    if ((kind === 'beam' || kind === 'cone' || kind === 'bolt' || kind === 'dash') && !en.visible) return 0;
    if ((kind === 'cone' || kind === 'dash') && en.airborne) return 0;
    const at = aimFor(k).at;
    const off = Math.abs(V.angleTo(me.heading, V.toward(meP, at)));
    const slack = kind === 'cone' ? (k.halfAngle || 0.9) * 0.8 : 0.25;
    if (off > (me.turnRate || 7) * (k.windup || 0) * 0.55 + slack) return 0;
    if (kind === 'dash') return lineRoom(at, R * 0.9) === 1 ? 1 : 0;
    if (kind === 'beam' || kind === 'bolt') return lineRoom(at, 1.2) === 1 ? 1 : 0.6;
    return 1;
  };

  /*
   * ── THE DODGE ───────────────────────────────────────────────────────────
   *
   * Two body verbs answer a wind-up pointed at me and no others do: a LEAP,
   * whose air phase lets the three ground shapes (fan, field, lunge) pass
   * underneath, and a BLINK, whose i-frames swallow anything at all and whose
   * step takes me out of the shape besides.
   *
   * It is worth spending one when three things are true at once: they are
   * telegraphing, there is at least a quarter of a second of wind-up left to
   * react inside, and the shape they are holding ACTUALLY REACHES ME —
   * measured with `reachBetween` above, their body as the caster and mine as
   * the target, which is the rule `tools/checkbehaviour.mjs` measures against
   * the world. Dodging a fan that ends a metre short is a free hit for them.
   */
  let dodge = 0, dodgeBlink = 0, dodgeLeft = 0;
  if (enCast && enSkill && enCast.phase === 'windup') {
    dodgeLeft = (enSkill.windup || 0) - (enCast.elapsed || 0);
    /* Their range boost is not mine to see; the plain reach is the honest read. */
    const reaches = en.dist <= reachBetween(enSkill, ER, R, 1);
    if (reaches && dodgeLeft >= 0.25) {
      let bite = 4;
      if (enSkill.effects.indexOf('damage') >= 0 || enSkill.effects.indexOf('burn') >= 0) bite += 5;
      if (enSkill.effects.indexOf('stun') >= 0 || enSkill.effects.indexOf('root') >= 0) bite += 2;
      /* A leap only answers what runs along the floor. */
      dodge = isGround(enSkill) ? (enSkill.kind === 'zone' ? 4 : 9) + bite : 0;
      /* I-frames answer every shape — and they are the ONLY answer to a beam,
         a bolt or a mortar, which no amount of air clears. */
      dodgeBlink = 5 + bite;
    }
  }
  /*
   * WHICH verb, and WHEN. A leap has to still be in the air when the shape
   * arrives; a blink's i-frames have to still be running, and its step is
   * itself worth something a little earlier than that. Both windows are read
   * from the verb's own numbers (`airborne`, `iframes`), never guessed.
   */
  const dodgeNow = function (k) {
    if (k.kind === 'jump') return (dodge > 0 && dodgeLeft <= (k.windup || 0) + (k.airborne || 0) * 0.9) ? dodge : 0;
    if (k.kind === 'blink') return (dodgeBlink > 0 && dodgeLeft <= (k.windup || 0) + Math.max(k.iframes || 0, 0.35)) ? dodgeBlink : 0;
    return 0;
  };

  /*
   * Where a blink should put me. Dodging, it steps ACROSS the shape rather
   * than into it — square to the line between us, with a little of the closing
   * bias a rusher wants, so I come out of it still on them. Closing, it stops
   * at contact instead of sailing past. `null` means neither applies and the
   * old order — a plain direction — is the right one.
   */
  const blinkPoint = function (k) {
    const d = k.distance || 0;
    if (d <= 0) return null;
    if (dodgeNow(k) > 0) {
      const s = V.norm(V.add(V.scale(V.perp(to), strafeSign), V.scale(to, 0.35)));
      if (V.len(s) < 1e-9) return null;
      return { x: V.clamp(me.x + s.x * d, -half + R, half - R), z: V.clamp(me.z + s.z * d, -half + R, half - R) };
    }
    const gap = en.dist - hug;
    if (gap < 1) return null;
    const step = Math.min(d, gap);
    return { x: me.x + to.x * step, z: me.z + to.z * step };
  };

  const boostWorth = function (ch) {
    if (buffUntil[ch] !== undefined && p.t < buffUntil[ch] - 0.4) return 0;   // still up
    if (ch === 'speed') return en.dist > 6 ? 9 : 4;
    if (ch === 'damage') return en.dist < 8 ? 8 : 3;
    if (ch === 'armor') return (hpFrac < 0.85 || en.dist < 6) ? 8 : 3;
    if (ch === 'cooldown') return 7;
    if (ch === 'range') return 6;
    if (ch === 'turn') return 5;
    return 4;
  };

  /* Worth RIGHT NOW; zero or less means "not now". Targeted (atk) and self (own)
     effects are summed apart: shape bonuses belong to an attack. */
  const worth = function (k) {
    /* The free verb is a dodge and nothing else. It carries no effect to
       score, and the hair off its worth means a PAID slot that answers the
       same wind-up — a leap with a shield on it — wins the tie. */
    if (isUniversal(k)) return dodgeNow(k) * 0.95;
    let atk = 0, own = 0;
    /* A lunge stops on the body it meets; a blink lands its full length. */
    const closer = (k.kind === 'dash' && !inContact) || (k.kind === 'blink' && en.dist > 6);
    for (let i = 0; i < k.effects.length; i++) {
      const e = k.effects[i];
      if (e === 'damage') atk += 10 + (magOf(k, e, 'mag') === null ? (k.damage || 0) : magOf(k, e, 'mag')) * (k.ticks || 1) * 0.2;
      else if (e === 'burn') atk += !en.burning ? 9 : (p.t > burnUntil - 1.2 ? 7 : 3);
      else if (e === 'knock') atk += enCast ? 12 : 2;
      else if (e === 'pull') atk += en.dist > hug + 1.5 ? 10 : 2;
      else if (e === 'stun') atk += !ctlFresh(e, k) ? 0 : (enCast ? 15 : 9);
      else if (e === 'root') atk += !ctlFresh(e, k) || en.rooted ? 0 : (en.dist > hug + 1 ? 10 : 5);
      else if (e === 'silence') atk += !ctlFresh(e, k) ? 0 : (enCast ? 11 : 7);
      else if (e === 'blind') atk += !ctlFresh(e, k) ? 0 : (en.dist > 6 ? 8 : 5);
      else if (e === 'weaken') atk += (k.channel === 'speed' || k.channel === 'armor') ? 9 : 6;
      else if (e === 'shield') {
        /* Worn down or about to lapse counts as down: a fresh one absorbs more.
           `mag` is how much THIS shield puts up, live off the kit. With no
           amount named (a fixture names only damage, knock and stun), any
           shield at all counts as up — a guess at its size would be worse. */
        const amt = magOf(k, e, 'mag');
        const up = (amt === null ? me.shield > 0 : me.shield > 0.4 * amt) && p.t < shieldUntil - 0.8;
        own += up ? 0 : ((hpFrac < 0.9 || me.burning || inContact || enCast) ? 6 + 10 * (1 - hpFrac) : 0);
      } else if (e === 'heal') {
        /* A HEAL IS A CAP PLUS A SHARE OF WHAT IS MISSING. The kit names the
           cap (`mag`) and neither the floor nor the share, so the most it can
           ever give me is that cap and that is all I count on: ask only for
           room to hold it. No cap named — ask for a wound instead. */
        const cap = magOf(k, e, 'mag');
        const room = cap === null ? hpFrac < 0.92 : (me.maxHp - me.hp) >= 0.9 * cap;
        own += room ? 8 + 14 * (1 - hpFrac) : (p.burn > 0 && hpFrac < 0.95 ? 6 : 0);
      } else if (e === 'cleanse') own += (me.rooted || me.burning || me.blinded || me.silenced) ? 12 : 0;
      else if (e === 'wall') {
        /* Covers a beam/bolt winding up; otherwise cuts my lines and shoves the body away. */
        if (enSkill && (enSkill.kind === 'beam' || enSkill.kind === 'bolt')) own += 10;
        else if (hpFrac < 0.3 && en.dist > 6) own += 8;
        else own += (myLines ? -4 : 3) + (en.dist < 5 ? -3 : 0);
      } else if (e === 'boost') own += boostWorth(k.channel);
    }
    /* Against a body that can still hop a floor sweep: throw the cheap one first as bait. */
    if (isGround(k) && enCanHop && atk >= 5) atk = 4 + Math.max(0, 16 - atk) * 0.25;
    let v = atk + own;
    /* A wind-up the enemy can break is a poorer bet; a body in the air cannot answer a line. */
    if ((k.windup || 0) > 0.2 && atk > 0) v *= enBreaksIn((k.windup || 0) + 0.05) ? 0.7 : 1.1;
    if (en.airborne && !isGround(k) && atk >= 5) v += 4;
    /* Shape: close deliveries first, the slow arcs are for range. */
    if (atk >= 5) {
      if (isGround(k)) v += inContact ? 5 : 2;
      if (k.kind === 'lob' && inContact) v -= 6;
      if (k.kind === 'beam' && inContact) v -= 2;
    }
    if (closer) v += k.kind === 'blink' ? 10 + (en.dist - 6) * 0.5 : 6;
    if (k.kind === 'jump' || k.kind === 'blink') v += dodgeNow(k);
    return v;
  };

  /* ── 2. fire the best ready ability ───────────────────────────────────── */
  let best = null;
  if (!me.airborne && !me.silenced && !me.stunned && !me.busy) {
    for (let i = 0; i < names.length; i++) {
      const n = names[i], k = kit[n];
      if (!api.ready(n)) continue;
      const room = hittable(k);
      if (!room) continue;
      const v = worth(k) * room;
      if (v > 0 && (!best || v > best.v)) best = { name: n, k, v };
    }
  }

  /* ── 3. aim ───────────────────────────────────────────────────────────── */
  let aim = aimFor(null);
  if (best) {
    const k = best.k, a = aimFor(k);
    /* A slot AIMED AT A POINT is ordered with one. The mortar and the field
       land on it, the blink steps toward it, and `pointFor`/`blinkPoint` have
       already held it inside the reach the sim will hold it inside. A blink
       with nothing to aim at falls back to the direction pair, which is what
       the sim reads from two numbers. */
    if (k.kind === 'blink') {
      const at = blinkPoint(k);
      if (at) api.use(best.name, { x: at.x, z: at.z });
      else api.use(best.name, en.x - me.x, en.z - me.z);
    } else if (k.aim === 'point' || k.kind === 'lob' || k.kind === 'zone') {
      const at = pointFor(k, a.at);
      api.use(best.name, { x: at.x, z: at.z });
    } else api.use(best.name);
    aim = a;
    /*
     * Assume it lands and start the clocks; a 'missed' event resets them.
     * Every length here is the ability's OWN, out of `magnitudes`: how long
     * its burn smoulders, how long its shield stands, how long its boost runs
     * and how far a range boost carries. A length the kit does not name gets
     * one short conservative second — the fixture kit is the only one that
     * withholds them, and it withholds them because it has none.
     */
    const flight = (k.kind === 'bolt' || k.kind === 'lob') && k.speed > 0 ? en.dist / k.speed : 0;
    const lands = p.t + (k.windup || 0) + flight;
    const spanOf = (e) => { const d = magOf(k, e, 'duration'); return d === null ? 1 : d; };
    for (let i = 0; i < k.effects.length; i++) {
      const e = k.effects[i];
      if (CONTROLS.indexOf(e) >= 0) ctlAt[e] = lands;
      if (e === 'burn') burnUntil = lands + spanOf(e);
      if (e === 'shield') shieldUntil = lands + spanOf(e);
      if (e === 'boost' && k.channel) {
        buffUntil[k.channel] = lands + spanOf(e);
        /* A range boost's `mag` IS the multiplier the world applies. */
        if (k.channel === 'range') { const m = magOf(k, e, 'mag'); rangeMul = (m !== null && m > 0) ? m : 1; }
      }
    }
    if (k.kind === 'dash' || k.kind === 'blink') say('coming through', 5);
    else if (has(k, 'heal') || has(k, 'shield')) say('not done yet', 6);
    else if (has(k, 'root') || has(k, 'pull') || has(k, 'stun')) say('stay right there', 6);
    else say('on you', 7);
  } else if (me.casting && kit[me.casting.skill]) {
    aim = aimFor(kit[me.casting.skill]);     // keep tracking the lead through the wind-up
  }
  api.faceAt(aim.at.x, aim.at.z);

  /* ── 4. move ──────────────────────────────────────────────────────────── */
  let goal = null;

  /* A hostile field under my feet: leave by the exit nearest the enemy, never simply "away". */
  const zones = (p.arena && p.arena.zones) || [];
  for (let zi = 0; zi < zones.length && !goal; zi++) {
    const z = zones[zi];
    if (z.mine) continue;
    const zc = { x: z.x, z: z.z };
    if (V.dist(meP, zc) > z.r + R + 0.2) continue;
    let bestPt = null, bestCost = Infinity;
    for (let i = 0; i < 8; i++) {
      const dir = V.fromHeading(i * Math.PI / 4);
      const pt = { x: zc.x + dir.x * (z.r + R + 1.2), z: zc.z + dir.z * (z.r + R + 1.2) };
      if (Math.abs(pt.x) > half - R || Math.abs(pt.z) > half - R) continue;
      const cost = V.dist(meP, pt) + 0.8 * V.dist(pt, enP);
      if (cost < bestCost) { bestCost = cost; bestPt = pt; }
    }
    if (bestPt) { goal = bestPt; say('hot floor', 6); }
  }

  /* A mortar landing where I will be, or a bolt on its way: one sidestep, biased toward the enemy. */
  const shots = (p.arena && p.arena.projectiles) || [];
  for (let si = 0; si < shots.length && !goal; si++) {
    const s = shots[si];
    if (s.mine) continue;
    if (s.arc) {
      const land = { x: s.x + s.vx * s.left, z: s.z + s.vz * s.left };
      const there = { x: me.x + (me.vx || 0) * s.left, z: me.z + (me.vz || 0) * s.left };
      if (s.left < 1.0 && V.dist(there, land) < R + 2.4) {
        const out = V.away(there, land), side = V.perp(to);
        const dir = V.norm(V.add(out, V.scale(side, V.dot(out, side) >= 0 ? 1 : -1)));
        goal = { x: me.x + dir.x * 4, z: me.z + dir.z * 4 };
      }
    } else {
      const sp = V.len({ x: s.vx, z: s.vz });
      if (sp < 1e-6) continue;
      const dirv = { x: s.vx / sp, z: s.vz / sp };
      const rel = V.sub(meP, { x: s.x, z: s.z });
      const along = V.dot(rel, dirv);
      if (along < 0 || along / sp > 0.7) continue;
      const off = V.dot(rel, V.perp(dirv));
      if (Math.abs(off) > R + 1.0) continue;
      const side = V.scale(V.perp(dirv), off >= 0 ? 1 : -1);
      goal = { x: me.x + side.x * 3 + to.x * 1.5, z: me.z + side.z * 3 + to.z * 1.5 };
    }
  }

  /* The chase: a route around the blocks while apart, an orbit once close. */
  if (!goal) {
    if (!inContact) {
      const path = api.pathTo(en.x, en.z);
      goal = (path && path.points && path.points.length) ? path.points[0] : enP;
      if (!en.visible) say('coming around', 8);
      else if (me.silenced) say('muzzled, still coming', 6);
    } else {
      if (p.t >= strafeFlipAt) {
        strafeSign = api.rand() < 0.5 ? -1 : 1;
        strafeFlipAt = p.t + 1 + api.rand() * 1.5;
      }
      const side = V.scale(V.perp(to), strafeSign);
      goal = { x: en.x - to.x * (hug - 0.3) + side.x * 2.5, z: en.z - to.z * (hug - 0.3) + side.z * 2.5 };
    }
  }

  /* A temporary wall is unknown to the navigator: if the line to the goal is covered, round its end. */
  if (!api.los(goal.x, goal.z)) {
    const obs = (p.arena && p.arena.obstacles) || [];
    let wall = null, wd = Infinity;
    for (let i = 0; i < obs.length; i++) {
      const o = obs[i];
      if (o.hx * o.hz > 1.1) continue;                       // the six blocks are bigger
      const d = V.dist(meP, { x: o.x, z: o.z });
      if (d < wd) { wd = d; wall = o; }
    }
    if (wall) {
      const alongX = wall.hx >= wall.hz;
      const reach = (alongX ? wall.hx : wall.hz) + R + 0.7;
      let bestPt = null, bestCost = Infinity;
      for (let sgn = -1; sgn <= 1; sgn += 2) {
        const pt = alongX ? { x: wall.x + sgn * reach, z: wall.z } : { x: wall.x, z: wall.z + sgn * reach };
        const cost = V.dist(meP, pt) + V.dist(pt, goal);
        if (cost < bestCost) { bestCost = cost; bestPt = pt; }
      }
      goal = bestPt;
    }
  }
  api.moveTo(goal.x, goal.z);
}
