/**
 * KITER — a kit-agnostic distance-keeper. Reads its abilities from p.self.kit
 * (never a typed number), holds the range of its longest damaging delivery,
 * backs off with a tangent, blinks/dashes AWAY, hides while its damage is on
 * cooldown, leads targets, dodges telegraphs and projectiles, never stands still.
 *
 * Every magnitude it weighs — a shield's size, a heal's cap, how hard a burn
 * bites, how long a control holds, how far a boost lifts — comes out of
 * `p.self.kit[name].magnitudes`, live, on the thought that uses it. Mortars
 * and fields are ordered at a PLACE (`api.use(name, { x, z })`), led onto
 * where the body will be and held inside the ability's own reach.
 */

let lastSay = -99;
let side = 1;          // tangential side for strafing and retreat
let sideUntil = 0;     // when to reconsider it
let escapeName = null; // a dash being lined up for an escape
let escapeDir = null;
let pokeUntil = -1;    // while set, hold the range of a short ability instead
const enemyReadyAt = {}; // enemy skill -> when its cooldown ends (from enemyStarted)
const LEAD = 0.7;      // fraction of enemy velocity trusted when leading: strafers reverse

function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me || !me.alive || !en) return;
  const kit = me.kit || {}, ekit = en.kit || {};
  const half = (p.arena && p.arena.half) || 20;
  const obs = (p.arena && p.arena.obstacles) || [];
  const R = me.radius || 1, ER = en.radius || 1;
  const P = { x: me.x, z: me.z };
  const EV = { x: en.vx || 0, z: en.vz || 0 };
  // Blinded, the enemy view is about a second old: extrapolate it rather than aim at the past.
  const E = me.blinded ? { x: en.x + EV.x, z: en.z + EV.z } : { x: en.x, z: en.z };
  if (me.blinded) en.dist = V.dist(P, E);
  const hpF = me.hp / me.maxHp, enF = en.hp / en.maxHp;
  const toE = V.toward(P, E), awayE = V.scale(toE, -1);
  const closing = -V.dot(EV, toE);           // m/s of enemy motion toward me
  const turn = me.turnRate || 3;
  const say = (t, gap) => { if (p.t - lastSay > gap) { api.say(t); lastSay = p.t; } };
  const has = (k, id) => k.effects.indexOf(id) >= 0;
  /*
   * LIVE MAGNITUDES. Every number an effect carries sits in the kit under
   * `magnitudes[effect]` — `mag`, `duration`, `immune` — and the effect-count
   * share is ALREADY applied there (`src/skills/compile.js` divides before
   * perception is built), so this reads and never re-divides.
   *
   * `null` means the kit did not name it. The reference fixture is the kit
   * that does that: it presents damage.mag, knock.mag and stun.duration and
   * nothing else, so each reader answers the missing case on its own terms
   * rather than with a typed-in number.
   */
  const mag = (k, id, field) => {
    const m = k && k.magnitudes && k.magnitudes[id];
    const v = m ? m[field] : undefined;
    return (typeof v === 'number' && isFinite(v)) ? v : null;
  };
  /* How long a control keeps them still. Unnamed — the fixture again — reads
     as a short hold, never as a guess at a longer one. */
  const holdOf = (k, e) => { const d = mag(k, e, 'duration'); return d === null ? 0.8 : d; };
  /*
   * THE UNIVERSAL SLOT — the free body verb: a leap with nothing on it that no
   * budget paid for. A dodge and a gap-crosser, never a card to score. Its own
   * flag first, its shape second, so it works whether or not it is here yet.
   */
  const universal = (k) => k.universal === true || (k.kind === 'jump' && k.effects.length === 0);
  const clampA = (q) => ({ x: V.clamp(q.x, -half + R + 0.6, half - R - 0.6), z: V.clamp(q.z, -half + R + 0.6, half - R - 0.6) });
  const room = (q) => Math.min(half - Math.abs(q.x), half - Math.abs(q.z));
  const inBox = (q, o, pad) => Math.abs(q.x - o.x) <= o.hx + pad && Math.abs(q.z - o.z) <= o.hz + pad;
  const blocked = (q) => obs.some((o) => inBox(q, o, R * 0.9));
  // Segment a→b against every block (slab test) — LOS between two arbitrary points.
  const clearLine = (a, b) => {
    for (const o of obs) {
      let t0 = 0, t1 = 1;
      const dx = b.x - a.x, dz = b.z - a.z;
      const lo = [o.x - o.hx, o.z - o.hz], hi = [o.x + o.hx, o.z + o.hz], pa = [a.x, a.z], dd = [dx, dz];
      let ok = true;
      for (let i = 0; i < 2 && ok; i++) {
        if (Math.abs(dd[i]) < 1e-9) { if (pa[i] < lo[i] || pa[i] > hi[i]) ok = false; continue; }
        let u0 = (lo[i] - pa[i]) / dd[i], u1 = (hi[i] - pa[i]) / dd[i];
        if (u0 > u1) { const s = u0; u0 = u1; u1 = s; }
        t0 = Math.max(t0, u0); t1 = Math.min(t1, u1);
        if (t0 > t1) ok = false;
      }
      if (ok) return false;
    }
    return true;
  };
  if (p.t > sideUntil) { side = api.rand() < 0.5 ? -1 : 1; sideUntil = p.t + 1 + api.rand() * 1.8; }
  for (const ev of p.events || []) {
    if (ev.type === 'blocked') { side = -side; sideUntil = p.t + 1.5; }
    if (ev.type === 'enemyStarted' && ekit[ev.skill]) enemyReadyAt[ev.skill] = p.t + (ekit[ev.skill].cooldown || 0);
  }

  // ── the kit, classified ───────────────────────────────────────────────────
  const names = [];
  for (const n of me.skills || []) if (kit[n]) names.push(n);
  const damaging = (k) => has(k, 'damage') || has(k, 'burn');
  const hostile = (k) => k.effects.some((e) => ['damage', 'burn', 'knock', 'pull', 'stun', 'root', 'blind', 'silence', 'weaken'].indexOf(e) >= 0);
  /*
   * The reach rule the world actually uses — the line `src/brain/prompt.js`
   * prints under `reach` and `tools/checkbehaviour.mjs` measures by binary
   * search: beam = muzzle (caster radius + 0.2) + range + target radius +
   * 0.4 of margin; cone = range + target radius; bolt = muzzle (caster radius
   * + 0.3) + range + target radius + 0.35 of touch; lob = range + splash +
   * target radius; zone = range + radius + target radius; dash = distance +
   * both radii. `mine` swaps who is casting at whom.
   */
  const reachOf = (k, mine) => {
    const mr = mine ? R : ER, tr = mine ? ER : R;
    if (k.kind === 'beam') return mr + 0.2 + (k.range || 0) + tr + 0.4;
    if (k.kind === 'cone') return (k.range || 0) + tr;
    if (k.kind === 'bolt') return mr + 0.3 + (k.range || 0) + tr + 0.35;
    if (k.kind === 'lob') return (k.range || 0) + (k.splash || 0) + tr;
    if (k.kind === 'zone') return (k.range || 0) + (k.radius || 0) + tr;
    if (k.kind === 'dash') return (k.distance || 0) + mr + tr;
    return Infinity;
  };
  const HOLD = { beam: 0.8, bolt: 0.7, lob: 0.65, zone: 0.8, cone: 0.85, dash: 0.7 };
  let want = 4 * R + ER, dmgWait = 99, shortWant = 0;
  for (const n of names) {
    const k = kit[n];
    if (!damaging(k) || reachOf(k, true) > 1e8) continue;
    const w = reachOf(k, true) * (HOLD[k.kind] || 0.7);
    if (w > want) want = w;
    const cd = (me.cooldowns && me.cooldowns[n]) || 0;
    if (cd < dmgWait) dmgWait = cd;
    if (cd <= 0 && w > shortWant) shortWant = w;
  }
  if (p.burn > 0 && hpF < enF) want *= 0.7;                 // the arena burns me first: press
  // How long the enemy's hostile abilities stay on cooldown (0 when unknown).
  let disarmed = Object.keys(ekit).length ? 99 : 0;
  for (const n of Object.keys(ekit)) if (hostile(ekit[n])) disarmed = Math.min(disarmed, Math.max(0, (enemyReadyAt[n] || 0) - p.t));
  // A short hostile ability gets its window when the enemy is disarmed or losing: step in, use it, step out.
  let pokeWant = 0;
  for (const n of names) {
    const k = kit[n], r = reachOf(k, true);
    if (r > 1e8 || !hostile(k) || ((me.cooldowns && me.cooldowns[n]) || 0) > 0) continue;
    const w = r * (HOLD[k.kind] || 0.7);
    if (w < want - 1 && w > pokeWant) pokeWant = w;
  }
  const enemyNeedsLos = Object.keys(ekit).length === 0
    || Object.values(ekit).some((k) => hostile(k) && ['beam', 'cone', 'bolt', 'dash'].indexOf(k.kind) >= 0);

  // ── threats ───────────────────────────────────────────────────────────────
  let tele = null;
  if (en.casting && en.casting.telegraph && ekit[en.casting.skill]) {
    const inc = ekit[en.casting.skill];
    if (hostile(inc) && ['blink', 'self', 'jump'].indexOf(inc.kind) < 0) {
      tele = { kind: inc.kind, left: Math.max(0, (inc.windup || 0) - (en.casting.elapsed || 0)),
        ground: inc.kind === 'cone' || inc.kind === 'zone' || inc.kind === 'dash' };
    }
  }
  let proj = null, arcHit = null, splashMax = 1.8;
  for (const k of Object.values(ekit)) if (k.splash && k.splash > splashMax) splashMax = k.splash;
  for (const pr of (p.arena && p.arena.projectiles) || []) {
    if (pr.mine) continue;
    const v = { x: pr.vx, z: pr.vz }, s = V.len(v);
    if (pr.arc) {
      const land = { x: pr.x + pr.vx * pr.left, z: pr.z + pr.vz * pr.left };
      if (V.dist(P, land) < splashMax + R + 0.7 && (!arcHit || pr.left < arcHit.left)) arcHit = { land, left: pr.left };
      continue;
    }
    if (s < 0.1) continue;
    const rel = V.sub(P, { x: pr.x, z: pr.z });
    const tc = V.dot(rel, v) / (s * s);
    if (tc < -0.05 || tc > pr.left + 0.1) continue;
    const gap = V.len(V.sub(rel, V.scale(v, tc)));
    if (gap < R + 0.35 + 0.9 && (!proj || tc < proj.t)) proj = { t: tc, v, cross: v.x * rel.z - v.z * rel.x };
  }
  let zoneOut = null;
  for (const z of (p.arena && p.arena.zones) || []) {
    if (!z.mine && V.dist(P, z) <= z.r + R + 0.3) { zoneOut = V.add(z, V.scale(V.away(P, z), z.r + R + 2)); break; }
  }
  if (pokeWant > 0 && !tele && !proj && closing < 0.5 && (disarmed > 0.6 || hpF > enF + 0.15)) pokeUntil = p.t + 1.2;
  if (p.t < pokeUntil && pokeWant > 0) want = pokeWant;
  const band = Math.max(1.5, want * 0.12);
  const panicD = want * 0.5;
  const tooClose = en.dist < want - band;
  const panic = en.dist < panicD && closing > -0.5;

  // ── choosing an ability ───────────────────────────────────────────────────
  const enemyCasting = !!(en.casting && en.casting.telegraph);
  // Knock, pull, stun and silence cancel a wind-up over 0.2 s — if they land before it does.
  const castInc = enemyCasting && ekit[en.casting.skill] ? ekit[en.casting.skill] : null;
  const breaks = (k) => !!castInc && (castInc.windup || 0) > 0.2
    && ((castInc.windup || 0) - (en.casting.elapsed || 0)) > (k.windup || 0) + 0.1;
  // A wall pays only when it blocks something: a closing body, or a cast that needs a line to me.
  const wallVal = (k) => {
    if (tele && !tele.ground && tele.kind !== 'lob' && tele.left > (k.windup || 0) + 0.05) return 14;
    if (tele && tele.kind === 'dash' && tele.left > (k.windup || 0) + 0.05) return 14;
    return en.dist < want * 1.1 && closing > 1 && en.visible ? 12 : 0;
  };
  const selfVal = (id, k) => {
    if (id === 'shield') {
      /* A shell still worth most of what it put up is a shell I keep. `mag`
         is what THIS one puts up; with none named, any shell counts as up. */
      const amt = mag(k, id, 'mag');
      const up = amt === null ? me.shield > 0 : me.shield > amt * 0.4;
      return (proj && proj.t < 0.8) || tele ? 14 : (hpF < 0.85 && en.dist < want * 1.2 ? 8 : (up ? 0 : 3));
    }
    if (id === 'heal') {
      /* A HEAL IS A CAP PLUS A SHARE OF WHAT IS MISSING (`src/core/effects.js`).
         The kit names the cap (`mag`) and neither the floor nor the share, so
         the most it can ever give is that cap: ask for room to hold it before
         spending a slot on it. No cap named — any wound will do. */
      const cap = mag(k, id, 'mag');
      const room = cap === null ? me.maxHp - me.hp > 0 : me.maxHp - me.hp >= cap * 0.6;
      if (!room) return hpF < 0.97 ? 1 : 0;
      return hpF < 0.75 ? 6 + 16 * (1 - hpF) : 2;
    }
    if (id === 'cleanse') return me.rooted ? 14 : me.silenced ? 12 : me.burning ? 8 : me.blinded ? 6 : 0;
    if (id === 'boost') {
      const c = k.channel;
      /* `mag` on a boost is the MULTIPLIER the world applies, not an amount:
         a 1.4 lifts more than a 1.12, and a slot is worth what it lifts. */
      const m = mag(k, id, 'mag');
      const lift = 0.6 + (m === null ? 0.3 : Math.max(0, m - 1));
      const base = c === 'speed' ? (closing > 0.5 || tooClose ? 11 : 5)
        : c === 'cooldown' ? (dmgWait > 0.5 ? 8 : 4)
          : c === 'armor' ? (en.dist < want ? 8 : 3)
            : c === 'range' ? (en.dist > want ? 8 : 4)
              : c === 'damage' ? 7 : 4;
      return base * lift;
    }
    return 0;
  };
  const hitVal = (k) => {
    let v = 0;
    for (const e of k.effects) {
      /* `damage` and `burn` both name their bite in the kit; a burn is that
         bite times the seconds it runs. A field's `ticks` multiplies neither:
         holding someone in one is a movement problem, not a scoring one. */
      if (e === 'damage') { const m = mag(k, e, 'mag'); v += 10 + (m === null ? (k.damage || 0) : m) * 0.25; }
      else if (e === 'burn') v += (en.burning ? 3 : 8) + (mag(k, e, 'mag') || 0) * (mag(k, e, 'duration') || 0) * 0.1;
      else if (e === 'knock') v += breaks(k) ? 14 : (en.dist < want ? 9 : 2);
      else if (e === 'pull') v += breaks(k) ? 12 : (en.dist > want + band ? 6 : 0);
      /* Every control is worth the seconds it actually buys me. */
      else if (e === 'stun') v += (breaks(k) ? 16 : (en.dist < want ? 8 : 4)) + holdOf(k, e);
      else if (e === 'silence') v += (breaks(k) ? 14 : 5) + holdOf(k, e);
      else if (e === 'root') v += (closing > 0.5 || en.dist < want ? 12 : 4) + holdOf(k, e);
      else if (e === 'blind') v += 8 + holdOf(k, e);
      else if (e === 'weaken') {
        /* A weaken's `mag` is a multiplier under one: how deep it cuts is
           1 − mag, and a shallow cut is worth less than a deep one. */
        const m = mag(k, e, 'mag');
        const bite = 0.7 + (m === null ? 0.3 : Math.max(0, 1 - m));
        v += (k.channel === 'speed' ? (closing > 0.5 || en.dist < want ? 12 : 6) : (k.channel === 'turn' || k.channel === 'vision' ? 5 : 7)) * bite;
      } else if (e === 'wall') v += wallVal(k);
      else v += selfVal(e, k) * 0.8;
    }
    return v;
  };
  // Aim point for a targeted delivery: where the enemy will be when it lands.
  const aimOf = (k) => {
    const w = k.windup || 0, EVl = V.scale(EV, LEAD);
    /* Wind-up alone is the lead for everything that resolves the moment the
       cast ends — a fan, a lunge, a FIELD (the disc is placed, it does not
       fly). Anything that travels adds its flight on top. */
    const E1 = V.add(E, V.scale(EVl, w));
    if (k.kind === 'bolt') return V.lead(P, E1, EVl, k.speed || 0);
    if (k.kind === 'lob') {
      /* THE ESTIMATE: flight time is the distance to the landing spot over the
         shell's speed. It is an estimate and not the truth, because the spot
         moves with the lead that the flight time produces — so it is solved
         twice, which is close enough at a metre a tenth of a second. With no
         speed named the wind-up is the whole lead. */
      let d = en.dist, pe = E1;
      for (let i = 0; i < 2; i++) {
        const flight = k.speed > 0 ? d / k.speed : 0;
        pe = V.add(E, V.scale(EVl, w + flight));
        d = V.dist(P, pe);
      }
      return pe;
    }
    return E1;
  };
  /*
   * A POINT ORDER, clamped the way the world clamps it.
   *
   * `api.use(name, { x, z })` names a PLACE, and the sim reads it as a
   * direction plus a distance along that direction (`src/core/deliver.js`): a
   * mortar lands at that distance held inside [my radius + splash, range], a
   * field at min(range, distance), a blink steps min(distance, that). Held to
   * the same bounds here, so the spot I scored is the spot that happens.
   */
  const pointFor = (k, at) => {
    const dir = V.toward(P, at);
    if (V.len(dir) < 1e-9) return { x: at.x, z: at.z };
    let d = V.dist(P, at);
    if (k.kind === 'lob') d = V.clamp(d, R + (k.splash || 0), k.range || d);
    else if (k.kind === 'zone') d = Math.min(d, k.range || d);
    else if (k.kind === 'blink') d = Math.min(d, k.distance || d);
    return { x: P.x + dir.x * d, z: P.z + dir.z * d };
  };
  /* Does this slot take a place rather than an angle? The kit says so. */
  const aimsAtPoint = (k) => k.aim === 'point' || k.kind === 'lob' || k.kind === 'zone';
  const allowed = (k) => Math.min(1.2, 0.15 + (k.windup || 0) * turn * 0.3 + (k.kind === 'cone' ? 0.5 : 0));
  // Where to blink or dash to: away, with a tangent, off the enemy's aim line, inside the arena.
  const jumpReady = names.some((n) => kit[n].kind === 'jump' && api.ready(n));
  const escapeTo = (dist, needRay) => {
    const f = V.fromHeading(en.heading || 0);
    let best = null;
    for (let i = -2; i <= 2; i++) {
      const dir = V.rot(awayE, i * Math.PI / 4);
      if (needRay) { const r = api.ray(dir.x, dir.z, dist); if (!r || (r.hit && r.dist < dist * 0.6)) continue; }
      const land = clampA(V.add(P, V.scale(dir, dist)));
      const d = V.sub(land, E);
      let sc = V.dist(land, V.add(E, V.scale(EV, 0.4))) + Math.min(room(land), 6) * 0.5
        + Math.abs(f.x * d.z - f.z * d.x) * 0.4 + (clearLine(land, E) ? 0 : 2);
      if (blocked(land)) sc -= 3;
      if (!best || sc > best.sc) best = { dir, land, sc };
    }
    return best;
  };

  let best = null, faceAt = null;
  for (const n of names) {
    const k = kit[n];
    if (!api.ready(n)) continue;
    let v = 0, args = null, aim = null, mode = 'hit';
    if (k.kind === 'self') v = k.effects.reduce((s, e) => s + selfVal(e, k), 0);
    else if (k.kind === 'jump') {
      /* Air clears the three GROUND shapes and nothing else. The free body
         verb carries no effects, so this dodge is the whole of what it is
         worth — never a utility card, and a hair under a paid leap that
         answers the same wind-up AND carries something. */
      const lift = (tele && tele.ground && tele.left > 0.08 && !me.airborne) ? 20 : 0;
      const safe = !tele && !proj && en.dist > want * 0.8;
      v = universal(k) ? lift * 0.95
        : lift + (safe ? 0.7 : 0) * k.effects.reduce((s, e) => s + selfVal(e, k), 0);
    } else if (k.kind === 'blink') {
      const dodge = tele ? (tele.ground ? (jumpReady ? 0 : 12) : (tele.left <= 0.35 ? 16 : 0)) : 0;
      v = Math.max(dodge, proj && proj.t < 0.4 ? 12 : 0, panic ? 12 : (tooClose && closing > 1 ? 8 : 0));
      v += k.effects.reduce((s, e) => s + selfVal(e, k), 0);
      if (v > 0) {
        const esc = escapeTo(k.distance || 7, false);
        /* A blink is aimed at a PLACE too: named as a point it stops there
           rather than sailing the full length into a wall. */
        if (esc) args = k.aim === 'point' ? [pointFor(k, esc.land)] : [esc.dir.x, esc.dir.z];
      }
    } else {
      // A targeted delivery: reach, cover and aim all have to agree.
      aim = aimOf(k);
      const reach = reachOf(k, true);
      const dAim = V.dist(P, aim);
      const needLos = k.kind === 'beam' || k.kind === 'cone' || k.kind === 'bolt' || k.kind === 'dash';
      // The range test trusts the enemy's FULL speed over the wind-up: a runner is out of a fan by the time it lands.
      const drift = (k.kind === 'cone' || k.kind === 'dash') ? V.len(EV) * (k.windup || 0) * (1 - LEAD) : 0;
      let canHit = dAim + drift <= reach - 0.3 && en.dist <= reach + 1 && !en.invulnerable
        && !(needLos && (!en.visible || !clearLine(P, aim)));
      if (canHit && k.kind === 'dash') {
        // The whole path has to be clear of blocks and walls, not only the line to them.
        const h = V.fromHeading(me.heading), ray = api.ray(h.x, h.z, k.distance || 8);
        if (ray && ray.hit && ray.dist < dAim - ER) canHit = false;
      }
      if (canHit && Math.abs(V.angleTo(me.heading, V.sub(aim, P))) > allowed(k)) { if (!faceAt) faceAt = aim; }
      else if (canHit) {
        // A dash through them is also a way out, so in a panic it counts double.
        v = hitVal(k) + (k.kind === 'dash' && panic ? 6 : 0);
        /* The mortar and the field are ordered at the LED point, not at a
           distance along whatever my nose happens to be doing when the cast
           lands: the lead is the whole reason a slow shape ever connects. */
        args = aimsAtPoint(k) ? [pointFor(k, aim)] : [];
      } else if (has(k, 'wall') && wallVal(k) >= 10 && k.kind !== 'dash') {
        // A wall is a world atom: it grows along my facing whether or not the delivery connects.
        v = wallVal(k); args = aimsAtPoint(k) ? [pointFor(k, E)] : [];
      } else if (k.kind === 'dash' && panic) {
        const esc = escapeTo(k.distance || 8, true);
        if (esc) { v = 11; aim = esc.land; mode = 'escape'; }
      }
    }
    if (v <= 0) continue;
    if (!best || v > best.v) best = { n, v, k, args, aim, mode };
  }
  if (best && best.mode === 'hit') {
    api.use(best.n, ...(best.args || []));
    if (best.aim) faceAt = best.aim;
    if (best.k.kind === 'blink') say('not today', 6);
    else if (best.k.kind === 'jump') say('over it', 6);
    else say(damaging(best.k) ? 'from here' : 'hold still', 7);
  }
  // Pre-aim the longest damaging delivery while nothing is ready, so a shot is never late.
  if (!faceAt) {
    let far = null;
    for (const n of names) if (damaging(kit[n]) && reachOf(kit[n], true) < 1e8 && (!far || reachOf(kit[n], true) > reachOf(far, true))) far = kit[n];
    faceAt = far ? aimOf(far) : E;
  }
  // A dash escape needs the body pointed away first: line it up, fire when the nose is round.
  if (best && best.mode === 'escape') { escapeName = best.n; escapeDir = best.aim; }
  if (escapeName && kit[escapeName] && panic && api.ready(escapeName)) {
    faceAt = escapeDir;
    if (Math.abs(V.angleTo(me.heading, V.sub(escapeDir, P))) < 0.5) { api.use(escapeName); escapeName = null; say('not today', 6); }
  } else if (escapeName && !panic) escapeName = null;
  api.faceAt(faceAt.x, faceAt.z);
  if (me.silenced) say('no voice, still legs', 8);

  // ── movement: one goal, chosen in order of urgency ────────────────────────
  let goal = null;
  const step = 4 * R;
  if (tele) {
    // Sidestep off the enemy's aim line, drifting away as well.
    const f = V.fromHeading(en.heading || 0), d = V.sub(P, E);
    let lat = V.sub(d, V.scale(f, V.dot(d, f)));
    lat = V.len(lat) < 0.3 ? V.scale(V.perp(f), side) : V.norm(lat);
    goal = clampA(V.add(P, V.add(V.scale(lat, step), V.scale(awayE, R))));
    say('seen it', 6);
  } else if (proj) {
    const pv = V.norm(proj.v);
    const lat = V.scale(V.perp(pv), proj.cross >= 0 ? 1 : -1);
    goal = clampA(V.add(P, V.scale(lat, step)));
  } else if (arcHit) {
    goal = clampA(V.add(P, V.scale(V.away(P, arcHit.land), step)));
  } else if (zoneOut) { goal = clampA(zoneOut); say('too hot', 8); }
  else if (tooClose || (panic && closing > 0)) {
    // Retreat with a tangent: shallow when a fast chaser would gain on it, wide near a wall.
    const ang = room(P) < 6 ? 0.9 : (closing > 3 ? 0.3 : 0.6);
    let dir = V.rot(awayE, side * ang);
    goal = clampA(V.add(P, V.scale(dir, step)));
    if (room(goal) < 3 || blocked(goal) || V.dist(P, goal) < step * 0.5) {
      side = -side; sideUntil = p.t + 1.5;
      dir = V.rot(awayE, side * ang); goal = clampA(V.add(P, V.scale(dir, step)));
      if (room(goal) < 3 || blocked(goal) || V.dist(P, goal) < step * 0.5) {
        dir = V.scale(V.perp(toE), side); goal = clampA(V.add(P, V.scale(dir, step)));
      }
    }
    say('back off', 8);
  } else if (dmgWait > 1.2 && enemyNeedsLos && !panic && p.t >= pokeUntil) {
    // Damage is on cooldown: break line of sight behind the nearest block that actually covers.
    let cover = null;
    for (const o of obs) {
      const away = V.away(o, E);
      let c = clampA(V.add(o, V.scale(away, Math.max(o.hx, o.hz) + R + 0.9)));
      if (blocked(c)) c = clampA(V.add(o, V.scale(away, Math.max(o.hx, o.hz) + R + 2)));
      if (clearLine(c, E) || V.dist(c, E) < 4) continue;
      const sc = V.dist(P, c) + (V.dist(c, E) < panicD ? 8 : 0);
      if (!cover || sc < cover.sc) cover = { c, sc };
    }
    if (cover && cover.sc < dmgWait * me.maxSpeed * 0.5 + 2) {
      const near = V.dist(P, cover.c) < 1.2;
      goal = near ? clampA(V.add(cover.c, V.scale(V.perp(toE), side * 0.8))) : cover.c;
      say('catch me', 9);
    }
  }
  if (!goal) {
    const target = shortWant > 0 && shortWant < want && closing < 0.5 && dmgWait > 0.8 ? shortWant : want;
    const needLos = names.some((n) => { const k = kit[n]; return damaging(k) && api.ready(n) && ['beam', 'cone', 'bolt', 'dash'].indexOf(k.kind) >= 0; });
    if (en.dist > target + band || (!en.visible && needLos)) {
      // Approach to the hold distance, cutting off where they are going, to a spot that can see them.
      const E2 = V.add(E, V.scale(EV, 0.5));
      goal = clampA(V.add(E2, V.scale(V.away(E2, P), target)));
      if (!clearLine(goal, E)) {
        for (const a of [0.35, -0.35, 0.7, -0.7, 1.05, -1.05, 1.4, -1.4]) {
          const c = clampA(V.add(E2, V.scale(V.rot(V.away(E2, P), a), target)));
          if (!blocked(c) && clearLine(c, E)) { goal = c; break; }
        }
      }
    } else {
      // In the band: strafe, never stand.
      goal = clampA(V.add(P, V.scale(V.perp(toE), side * step)));
      if (room(goal) < 2.5 || blocked(goal)) { side = -side; sideUntil = p.t + 1.5; goal = clampA(V.add(P, V.scale(V.perp(toE), side * step))); }
    }
  }
  if (me.blinded && !tele && !proj) goal = clampA(V.add(P, V.scale(awayE, step)));
  api.moveTo(goal.x, goal.z);
}
