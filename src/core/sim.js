/**
 * The world. One file, one tick function, no dependencies.
 *
 * ── the order of operations, and why it is that order ───────────────────────
 *
 * 1. clocks   — cooldowns, stun, i-frames, the say ticker
 * 2. perceive — BOTH perceptions are built before EITHER brain runs
 * 3. think    — both brains run against that frozen snapshot
 * 4. orders   — the queued orders are applied
 * 5. acts     — skill state machines advance; strikes resolve
 * 6. move     — acceleration, dash, knockback, the jump arc
 * 7. collide  — obstacles, walls, then body against body
 * 8. resolve  — deaths and the end of the match
 *
 * Steps 2 and 3 are split from 4 deliberately. If the octopus's brain ran, took
 * its turn, and then the gorilla's brain perceived the result, the second brain
 * would be reacting 33 ms sooner than the first every single tick — a bias that
 * is invisible in a replay and decisive over a hundred matches. Freezing the
 * snapshot costs one object allocation and makes the win rate mean something.
 */

import {
  ARENA_HALF, BEAM_RADIUS, BRAKE_ACCEL, DT, FAULT_LIMIT, FIGHTERS,
  KNOCKBACK_DRAG, KNOCKBACK_MIN, MATCH_SECONDS, MAX_ORDERS_PER_THINK,
  MAX_QUERIES_PER_THINK, MEM_MAX_KEYS, MEM_MAX_VALUE_BYTES, OBSTACLES,
  SAY_MAX_CHARS, SAY_SECONDS, SKILLS, SPAWN_RADIUS, SUDDEN_DEATH_AT,
  SUDDEN_DEATH_RAMP, THINK_EVERY, skillsOf,
} from './config.js';
import {
  clamp, dirOf, dist2, hasLos, headingOf, inCone, len2, norm2,
  pushOutOfBox, segBoxes, segCircle, turnToward,
} from './geom.js';
import { createNav } from './nav.js';
import { streamFrom } from './rng.js';

/** The arena walls, as boxes, so one routine handles every solid thing. */
const WALLS = [
  { id: 'w-north', x: 0, z: ARENA_HALF + 2, hx: ARENA_HALF + 4, hz: 2, h: 4, wall: true },
  { id: 'w-south', x: 0, z: -ARENA_HALF - 2, hx: ARENA_HALF + 4, hz: 2, h: 4, wall: true },
  { id: 'w-east', x: ARENA_HALF + 2, z: 0, hx: 2, hz: ARENA_HALF + 4, h: 4, wall: true },
  { id: 'w-west', x: -ARENA_HALF - 2, z: 0, hx: 2, hz: ARENA_HALF + 4, h: 4, wall: true },
];

/** Everything a segment can be stopped by. */
export const SOLIDS = [...OBSTACLES, ...WALLS];

/**
 * The phase script of every skill: what a fighter is doing, for how long, and
 * whether the effect lands on the way out of that phase.
 *
 * Written out per skill rather than inferred, because the three shapes really
 * are different — a beam strikes at the end of its wind-up, a dash strikes on
 * contact at any point during its travel, and a hop never strikes at all — and
 * a generic "windup/strike/recover" would have needed a special case for each
 * anyway, just further from the reader.
 */
function phasesOf(id) {
  const s = SKILLS[id];
  switch (id) {
    case 'laser': return [['windup', s.windup, true], ['recover', s.recover, false]];
    case 'blink': return [['strike', 0, true], ['recover', s.recover, false]];
    case 'smash': return [['windup', s.windup, true], ['recover', s.recover, false]];
    case 'charge': return [['windup', s.windup, false], ['dash', s.dashSeconds, false], ['recover', s.recover, false]];
    case 'jump': return [['windup', s.windup, false], ['air', s.airborne, false], ['recover', s.recover, false]];
    default: return [['recover', 0.1, false]];
  }
}

/**
 * Where the two of them start: opposite ends of a diameter whose angle comes
 * from the seed, rotated until both ends are clear of every block.
 */
function spawnPair(seed) {
  const draw = streamFrom(seed, 'spawn');
  const base = draw() * Math.PI * 2;
  for (let k = 0; k < 64; k++) {
    const a = base + (k * Math.PI * 2) / 64;
    const ax = Math.sin(a) * SPAWN_RADIUS, az = Math.cos(a) * SPAWN_RADIUS;
    const ok = (x, z, r) => {
      if (Math.abs(x) > ARENA_HALF - r - 0.2 || Math.abs(z) > ARENA_HALF - r - 0.2) return false;
      for (const o of OBSTACLES) {
        if (Math.abs(x - o.x) < o.hx + r + 0.6 && Math.abs(z - o.z) < o.hz + r + 0.6) return false;
      }
      return true;
    };
    if (ok(ax, az, FIGHTERS.octopus.radius) && ok(-ax, -az, FIGHTERS.gorilla.radius)) {
      return {
        octopus: { x: ax, z: az, heading: headingOf(-2 * ax, -2 * az) },
        gorilla: { x: -ax, z: -az, heading: headingOf(2 * ax, 2 * az) },
      };
    }
  }
  return {
    octopus: { x: 0, z: -SPAWN_RADIUS, heading: 0 },
    gorilla: { x: 0, z: SPAWN_RADIUS, heading: Math.PI },
  };
}

function makeFighter(id, sp, seed) {
  const def = FIGHTERS[id];
  const cooldowns = {};
  for (const k of skillsOf(id)) cooldowns[k] = 0;
  return {
    id,
    def,
    x: sp.x, z: sp.z, y: 0,
    vx: 0, vz: 0,
    kx: 0, kz: 0,
    /**
     * What everyone outside the solver is told this body's velocity is.
     *
     * `vx/vz` are the CONTROL velocity and they are deliberately zero during a
     * charge, so the acceleration integrator does not fight the dash. Reporting
     * them was a live defect: for the 0.8 s a gorilla spends crossing twelve
     * metres at 15 m/s, both the viewer and the opposing brain were told it was
     * standing still — so the most spectacular move in the game rendered as a
     * statue on a conveyor belt, and `V.lead` aimed at a stationary target.
     * Measured from the position delta instead, which is true by construction
     * whatever moved the body: control, knockback, dash or a collision push.
     */
    px: sp.x, pz: sp.z,
    rvx: 0, rvz: 0,
    heading: sp.heading,
    wantHeading: sp.heading,
    hp: def.hp,
    alive: true,
    /** A standing order: either a direction, or a point being walked to. */
    moveDirX: 0, moveDirZ: 0,
    moveTarget: null,
    cooldowns,
    act: null,
    stun: 0,
    iframes: 0,
    say: null,
    /** No prototype: see `api.remember` for the key cap this is half of. */
    mem: Object.create(null),
    rand: streamFrom(seed, id),
    /** Bookkeeping the reviewer's metrics are computed from. */
    stats: {
      thinks: 0, faults: 0, orders: 0, damageDealt: 0, damageTaken: 0,
      uses: {}, hits: {}, misses: {}, blocked: {}, verbs: {}, distanceTravelled: 0,
      thinkMicros: 0, evaded: 0, saidLines: 0,
    },
    faults: 0,
    disabled: false,
    /** Drained into perception once per thought. */
    events: [],
    /** What the viewer should draw. Set by the act machine, cleared on finish. */
    pose: { action: null, phase: 0 },
  };
}

/**
 * @param {number} seed
 * @param {object} opts
 *   curtainSeconds — how long the world keeps running after the match is
 *   decided. Zero for the headless runner, which has no eyes; a couple of
 *   seconds for anything with a viewer, because the instant the loop stopped on
 *   `world.over` the `die` pose froze at its first frame and every fight ended
 *   with a fighter standing bolt upright at 0 hp. The animation IS the ending.
 */
export function createWorld(seed = 1, { curtainSeconds = 0 } = {}) {
  const spawns = spawnPair(seed);
  const world = {
    seed,
    tick: 0,
    t: 0,
    dt: DT,
    obstacles: OBSTACLES,
    solids: SOLIDS,
    half: ARENA_HALF,
    spawns,
    fighters: {
      octopus: makeFighter('octopus', spawns.octopus, seed),
      gorilla: makeFighter('gorilla', spawns.gorilla, seed),
    },
    /** Transient things the viewer draws for one tick: beams, cones, flashes. */
    fx: [],
    /** Everything that happened, for the replay and the metrics. */
    log: [],
    over: false,
    done: false,
    curtain: 0,
    curtainSeconds,
    winner: null,
    reason: null,
  };
  world.order = ['octopus', 'gorilla'];
  /**
   * One navigation graph per body radius, built once. See `nav.js` for why a
   * navigator is part of the body rather than part of the brain's homework.
   */
  world.nav = {
    octopus: createNav(SOLIDS, ARENA_HALF, FIGHTERS.octopus.radius),
    gorilla: createNav(SOLIDS, ARENA_HALF, FIGHTERS.gorilla.radius),
  };
  return world;
}

const other = (id) => (id === 'octopus' ? 'gorilla' : 'octopus');

/**
 * A fault message, from a value of unknown shape and unknown realm.
 *
 * `String(v)` calls `toString` on whatever it is handed, and what it is handed
 * came out of a brain: a bare `String(res.error)` here is the same defect this
 * guards against one frame further out.
 */
function faultText(v) {
  try { return String(v).slice(0, 200); } catch { return 'a fault that could not be described'; }
}

// ---------------------------------------------------------------------------
// perception
// ---------------------------------------------------------------------------

function castView(f) {
  if (!f.act) return null;
  const s = SKILLS[f.act.id];
  const total = f.act.total;
  return {
    skill: f.act.id,
    phase: f.act.phase,
    elapsed: round3(f.act.elapsedTotal),
    remaining: round3(Math.max(0, total - f.act.elapsedTotal)),
    total: round3(total),
    /** True while the effect has not landed yet — the window counterplay lives in. */
    telegraph: !f.act.spent && (s.windup || 0) > 0,
  };
}

const round3 = (v) => Math.round(v * 1000) / 1000;

export function perceive(world, id) {
  const me = world.fighters[id];
  const you = world.fighters[other(id)];
  const cd = {};
  for (const k of Object.keys(me.cooldowns)) cd[k] = round3(me.cooldowns[k]);
  const dist = dist2(me.x, me.z, you.x, you.z);
  const events = me.events;
  me.events = [];
  return {
    t: round3(world.t),
    dt: round3(DT * THINK_EVERY),
    tick: world.tick,
    timeLeft: round3(MATCH_SECONDS - world.t),
    /** Fraction of maximum hp the arena is burning off both of you per second. */
    burn: round3(burnRate(world.t)),
    burnStartsIn: round3(Math.max(0, SUDDEN_DEATH_AT - world.t)),
    self: {
      id: me.id,
      x: round3(me.x), z: round3(me.z), y: round3(me.y),
      vx: round3(me.rvx), vz: round3(me.rvz),
      speed: round3(len2(me.rvx, me.rvz)),
      heading: round3(me.heading),
      hp: round3(me.hp), maxHp: me.def.hp,
      radius: me.def.radius,
      maxSpeed: me.def.maxSpeed,
      turnRate: me.def.turnRate,
      alive: me.alive,
      airborne: me.y > 0.01,
      stunned: me.stun > 0,
      invulnerable: me.iframes > 0,
      busy: me.act !== null,
      casting: castView(me),
      cooldowns: cd,
      skills: skillsOf(id),
    },
    enemy: {
      id: you.id,
      x: round3(you.x), z: round3(you.z), y: round3(you.y),
      vx: round3(you.rvx), vz: round3(you.rvz),
      speed: round3(len2(you.rvx, you.rvz)),
      heading: round3(you.heading),
      hp: round3(you.hp), maxHp: you.def.hp,
      radius: you.def.radius,
      maxSpeed: you.def.maxSpeed,
      dist: round3(dist),
      alive: you.alive,
      airborne: you.y > 0.01,
      stunned: you.stun > 0,
      invulnerable: you.iframes > 0,
      busy: you.act !== null,
      casting: castView(you),
      skills: skillsOf(you.id),
      /** Line of sight, centre to centre. What the beam actually tests. */
      visible: segBoxes(me.x, me.z, you.x, you.z, world.solids) === null,
    },
    arena: {
      half: ARENA_HALF,
      obstacles: world.obstacles.map((o) => ({ x: o.x, z: o.z, hx: o.hx, hz: o.hz })),
    },
    events,
    mem: me.mem,
  };
}

// ---------------------------------------------------------------------------
// the api the brain is handed
// ---------------------------------------------------------------------------

function fin(v) { return typeof v === 'number' && Number.isFinite(v); }

/**
 * A fresh api object per thought, closed over one fighter and one order queue.
 *
 * Orders queue rather than apply, so that a brain calling `move` then `use`
 * cannot observe half of its own turn, and so that the order cap can be
 * enforced in one place. Last order of a kind wins — the alternative, first
 * wins, punishes exactly the shape an LLM writes most often (a general default
 * at the top, refined by later branches).
 */
export function makeApi(world, id) {
  const me = world.fighters[id];
  const you = world.fighters[other(id)];
  const q = { move: null, face: null, use: null, say: null };
  /** A histogram of what the brain reached for, for the behaviour metrics. */
  const calls = {};
  let orders = 0;
  let queries = 0;
  const budget = () => (orders++ < MAX_ORDERS_PER_THINK);
  /**
   * Perception has its own, much larger allowance, and running out THROWS.
   *
   * Both halves of that matter. One shared cap was a live defect: a brain that
   * probes sixteen directions per thought — which the first generated octopus
   * does — exhausted the budget on `ray` and then had `los()` and `ready()`
   * start returning false. Its senses began lying to it precisely because it
   * was thinking carefully, and nothing anywhere said so. A query that cannot
   * be answered raises instead: a fault is visible in the report, a plausible
   * falsehood is not.
   */
  const ask = () => {
    if (queries++ >= MAX_QUERIES_PER_THINK) {
      throw new Error(`more than ${MAX_QUERIES_PER_THINK} perception calls in one thought`);
    }
    return true;
  };

  const api = {
    move(dx, dz) {
      if (!budget() || !fin(dx) || !fin(dz)) return;
      q.move = { kind: 'dir', dx, dz };
    },
    moveTo(x, z) {
      if (!budget() || !fin(x) || !fin(z)) return;
      q.move = { kind: 'point', x, z };
    },
    stop() { if (budget()) q.move = { kind: 'stop' }; },
    face(dx, dz) {
      if (!budget() || !fin(dx) || !fin(dz)) return;
      if (Math.abs(dx) + Math.abs(dz) < 1e-9) return;
      q.face = headingOf(dx, dz);
    },
    faceAt(x, z) {
      if (!budget() || !fin(x) || !fin(z)) return;
      const dx = x - me.x, dz = z - me.z;
      if (Math.abs(dx) + Math.abs(dz) < 1e-9) return;
      q.face = headingOf(dx, dz);
    },
    use(name, a, b) {
      if (!budget() || typeof name !== 'string') return false;
      if (!skillsOf(id).includes(name)) return false;
      q.use = { name, a: fin(a) ? a : null, b: fin(b) ? b : null };
      return true;
    },
    ready(name) {
      ask();
      if (typeof name !== 'string') return false;
      if (!skillsOf(id).includes(name)) return false;
      return me.cooldowns[name] <= 0 && me.act === null && me.stun <= 0 && me.alive;
    },
    cooldown(name) {
      ask();
      if (typeof name !== 'string') return 999;
      const v = me.cooldowns[name];
      return v === undefined ? 999 : round3(v);
    },
    /** Line of sight from this body's centre to a world point. */
    los(x, z) {
      ask();
      if (!fin(x) || !fin(z)) return false;
      return segBoxes(me.x, me.z, x, z, world.solids) === null;
    },
    /**
     * Cast a ray from this body along a direction and report the first solid.
     * The one perception verb that costs the brain nothing to reason about and
     * lets it feel out cover it was never told the shape of.
     */
    ray(dx, dz, maxDist) {
      ask();
      if (!fin(dx) || !fin(dz)) return null;
      const d = fin(maxDist) ? clamp(maxDist, 0, 60) : 30;
      const [ux, uz] = norm2(dx, dz);
      if (ux === 0 && uz === 0) return null;
      const ex = me.x + ux * d, ez = me.z + uz * d;
      const h = segBoxes(me.x, me.z, ex, ez, world.solids);
      if (!h) return { hit: false, dist: d, x: round3(ex), z: round3(ez) };
      return {
        hit: true,
        dist: round3(h.t * d),
        x: round3(me.x + ux * h.t * d),
        z: round3(me.z + uz * h.t * d),
      };
    },
    /**
     * A walkable route from here to a point: the waypoints and the true walking
     * distance, which is the number a fighter behind a wall actually needs and
     * which `enemy.dist` (a straight line) does not give.
     */
    pathTo(x, z) {
      ask();
      if (!fin(x) || !fin(z)) return null;
      const r = world.nav[id].path(me.x, me.z, x, z);
      if (!r) return null;
      return {
        dist: round3(r.dist),
        direct: r.direct,
        points: r.points.map((pt) => ({ x: round3(pt.x), z: round3(pt.z) })),
      };
    },
    rand() { ask(); return me.rand(); },
    remember(k, v) {
      if (!budget() || typeof k !== 'string' || k.length === 0) return;
      const key = k.slice(0, 32);
      /*
       * `hasOwn` against a null-prototype bag, and both halves are needed. `k in
       * me.mem` walks the prototype chain, so `remember('toString', …)` — or
       * `constructor`, or `valueOf` — answered "already present" and skipped the
       * key cap entirely, and `me.mem.__proto__ = v` set a prototype rather than
       * storing anything, which `recall` then read back as a whole Object.
       * Testing the same truncated key that is written closes the third gap: a
       * 40-character name used to fail the cap check against its own entry.
       */
      if (!Object.hasOwn(me.mem, key) && Object.keys(me.mem).length >= MEM_MAX_KEYS) return;
      let s;
      try { s = JSON.stringify(v); } catch { return; }
      if (s === undefined || s.length > MEM_MAX_VALUE_BYTES) return;
      me.mem[key] = JSON.parse(s);
    },
    recall(k, dflt) {
      ask();
      if (typeof k !== 'string') return dflt;
      const v = me.mem[k.slice(0, 32)];
      return v === undefined ? dflt : v;
    },
    forget(k) { if (budget() && typeof k === 'string') delete me.mem[k.slice(0, 32)]; },
    say(text) {
      if (!budget() || typeof text !== 'string' || text.length === 0) return;
      q.say = text.slice(0, SAY_MAX_CHARS);
    },
  };
  /*
   * The histogram is collected by wrapping rather than by a line inside each
   * verb: twenty hand-written counters is twenty chances to forget one, and a
   * metric that silently under-counts is worse than no metric.
   *
   * The wrappers and the bag holding them have their prototype cut, because a
   * host function carries `Function.prototype` with it and
   * `api.move.constructor('process.exit(3)')()` compiled a function in the HOST
   * realm and took the whole tournament down with exit code 3. With no
   * prototype there is no `.constructor` to reach through.
   *
   * That is all this file can do about it, and it is not enough on its own:
   * the plain objects these verbs RETURN carry the host realm just as surely —
   * `api.ray(1,0,10).constructor.constructor('return process')()` was measured
   * ending the process the same way. This file has no idea there are two
   * realms and should not learn: `step` takes `think` as an argument precisely
   * so that core never imports a `vm`. The wall is drawn where the realms are
   * known, in `brain/host.js`, which JSON round-trips everything these verbs
   * hand back into the brain's own realm before it reaches brain code.
   */
  const wrapped = Object.create(null);
  for (const [k, fn] of Object.entries(api)) {
    const w = (...a) => { calls[k] = (calls[k] || 0) + 1; return fn(...a); };
    Object.setPrototypeOf(w, null);
    wrapped[k] = w;
  }
  return { api: wrapped, q, calls, count: () => orders + queries, enemy: you };
}

/** Apply one thought's queued orders. Step 4 of the tick. */
export function applyOrders(world, id, q) {
  const me = world.fighters[id];
  if (!me.alive) return;
  if (q.move) {
    if (q.move.kind === 'stop') { me.moveDirX = 0; me.moveDirZ = 0; me.moveTarget = null; }
    else if (q.move.kind === 'dir') {
      const [ux, uz] = norm2(q.move.dx, q.move.dz);
      me.moveDirX = ux; me.moveDirZ = uz; me.moveTarget = null;
    } else {
      me.moveTarget = { x: q.move.x, z: q.move.z };
    }
  }
  if (q.face !== null && q.face !== undefined) me.wantHeading = q.face;
  /*
   * The line goes into the log as well as onto the body.
   *
   * F11 closes the brain source and names two things as its replacement proof
   * that a model wrote the behaviour: these lines, and the tactics card. A
   * line that only ever exists for three seconds above a head is proof nobody
   * can be shown afterwards — the fight ends, the bubble pops, and the only
   * evidence left is a number. So it is logged, and the log is what the
   * after-fight card is assembled from.
   */
  if (q.say) {
    me.say = { text: q.say, until: world.t + SAY_SECONDS };
    me.stats.saidLines++;
    world.log.push({ t: round3(world.t), type: 'say', who: id, text: q.say });
  }
  if (q.use) startSkill(world, id, q.use.name, q.use.a, q.use.b);
}

// ---------------------------------------------------------------------------
// skills
// ---------------------------------------------------------------------------

function startSkill(world, id, name, a, b) {
  const me = world.fighters[id];
  const s = SKILLS[name];
  /*
   * A refusal is reported. It used to be a silent no-op, and a silent no-op
   * reads to a model exactly like a broken engine: it ordered something,
   * nothing happened, and no field anywhere says why — so it orders it again,
   * and again, on camera, forever. One event is the difference between a brain
   * that adapts to the refusal and a brain that loops on it.
   */
  const refuse = (reason) => {
    emit(world, id, { type: 'refused', skill: name, reason });
    world.log.push({ t: round3(world.t), type: 'refused', who: id, skill: name, reason });
    return false;
  };
  if (!s) return refuse('unknown');
  if (!me.alive) return refuse('dead');
  if (me.y > 0.01) return refuse('airborne');
  if (me.stun > 0) return refuse('stunned');
  if (me.act !== null) return refuse('busy');
  if (me.cooldowns[name] > 0) return refuse('cooldown');

  const [hx, hz] = dirOf(me.heading);
  let dx = hx, dz = hz;
  if (name === 'blink' && a !== null && b !== null) {
    const [ux, uz] = norm2(a, b);
    if (ux !== 0 || uz !== 0) { dx = ux; dz = uz; }
  }

  me.cooldowns[name] = s.cooldown;
  const script = phasesOf(name);
  me.act = {
    id: name,
    script,
    step: 0,
    phase: script[0][0],
    tPhase: 0,
    elapsedTotal: 0,
    total: script.reduce((acc, p) => acc + p[1], 0),
    dx, dz,
    /*
     * `spent` means "no effect can land any more", which is not the same as
     * "an effect landed" — `casting.telegraph` is derived from it and the
     * prompt promises the field is true only while the hit is still coming. A
     * hop has no hit to come, so it is born spent; otherwise a jump advertised
     * a threat for all 0.81 s of itself and an enemy brain that respects the
     * telegraph backs away from a somersault.
     */
    spent: name === 'jump',
    startedAt: world.t,
  };
  me.stats.uses[name] = (me.stats.uses[name] || 0) + 1;
  world.log.push({ t: round3(world.t), type: 'use', who: id, skill: name });
  emit(world, other(id), { type: 'enemyStarted', skill: name, windup: round3(s.windup || 0) });
  // A zero-length first phase (blink) must resolve on the tick it was ordered.
  if (script[0][1] <= 0) resolveStrike(world, id);
  return true;
}

/** Push an event onto a fighter's feed. */
function emit(world, id, ev) {
  const f = world.fighters[id];
  if (f.events.length < 32) f.events.push(ev);
}

/**
 * Which strikes need a clear centre-to-centre line to land.
 *
 * This is the only place the sim reads `needsLos`; it was a field only
 * `tools/arena.mjs` looked at, so the beam's own trace was the whole of the
 * rule and the cone had no rule at all. A 5.15 m cone reaches across the 2.4 m
 * thickness of block 'c': the gorilla flush against its north face and the
 * octopus flush against its south, 4.65 m apart with line of sight FALSE, took
 * 35 damage and a knockback through solid stone. Over the l1..l6 grid it fires
 * 2 times in 708 smash hits (0.28%), at 4.25 m and 4.98 m — never at body
 * contact, which is why the gate costs nothing a viewer would miss.
 *
 * The prompt every brain is written from already says the opposite of the old
 * behaviour, at the top, about the whole world: "A block stops a body and stops
 * a line of sight. Nothing sees or shoots through one." So the cone was not
 * following an undocumented rule, it was breaking a documented one — which is
 * why the alternative (say melee reaches through cover) would have meant
 * contradicting that sentence rather than extending it.
 */
const strikeNeedsLos = (id) => SKILLS[id].needsLos === true;

/**
 * A knockback cancels a committed act — what `interruptible` has meant in
 * config.js since it was written, and what only the charge implemented.
 *
 * `grep interruptible src/core/sim.js` returned exactly one site, inside
 * `dashStep`, so the gorilla's 4.0 s cooldown could break a cast and its 1.3 s
 * one could not. Over the l1..l6 grid that was 0.18 interrupts per match
 * against 6.8 laser casts per match, 81% of which land: standing in melee to
 * finish a cast was free. With the smash counted it is 0.27 per match. It does
 * not cost the octopus the fight — over the whole change set in this file its
 * win rate went 43.8% -> 49.7%, because a blink that no longer cancels itself
 * is worth more to it than the cast it now has to protect.
 *
 * @returns {boolean} whether an act was actually cancelled
 */
function interruptCast(world, byId, bySkill) {
  const you = world.fighters[other(byId)];
  const act = you.act;
  if (!act || act.spent) return false;
  const s = SKILLS[act.id];
  if (!s || !s.interruptible) return false;
  world.log.push({ t: round3(world.t), type: 'interrupt', who: byId, target: you.id, skill: act.id });
  emit(world, you.id, { type: 'interrupted', skill: act.id, by: bySkill });
  emit(world, byId, { type: 'interruptedEnemy', skill: act.id });
  you.act = null;
  return true;
}

/**
 * The moment a skill's effect lands.
 *
 * Aim is read HERE, not when the order was given. That is what makes a wind-up
 * a real telegraph in both directions: the caster may keep tracking through it,
 * and the target may keep dodging through it, and the fight is decided by which
 * of the two was better at the last instant rather than by who clicked first.
 */
function resolveStrike(world, id) {
  const me = world.fighters[id];
  const you = world.fighters[other(id)];
  const act = me.act;
  if (!act || act.spent) return;
  act.spent = true;
  const s = SKILLS[act.id];

  if (act.id === 'laser') {
    const [ux, uz] = dirOf(me.heading);
    const ox = me.x + ux * (me.def.radius + 0.2), oz = me.z + uz * (me.def.radius + 0.2);
    const ex = ox + ux * s.range, ez = oz + uz * s.range;
    const solid = segBoxes(ox, oz, ex, ez, world.solids);
    const tSolid = solid ? solid.t : 1;
    const tHit = you.alive ? segCircle(ox, oz, ex, ez, you.x, you.z, you.def.radius + BEAM_RADIUS) : -1;
    const connected = tHit >= 0 && (!strikeNeedsLos('laser') || tHit < tSolid);
    /*
     * Drawn to where it stopped — except that `segCircle` reports contact at
     * the origin when the muzzle is already inside the hit disc, which is every
     * shot under 2.85 m and 5.5% of the casts this population fires. A
     * zero-length beam draws nothing at all and hands the viewer a zero vector
     * to normalise, so those run to the target's centre instead: the shortest
     * segment that still reads as a beam buried in a body. 85 of the 1 982
     * beams an l1..l6 grid fires would otherwise be drawn at zero length; 1
     * still is, the case where the target's centre is behind the muzzle too.
     */
    const tCentre = clamp(((you.x - ox) * ux + (you.z - oz) * uz) / s.range, 0, 1);
    const tEnd = connected ? (tHit > 0 ? tHit : tCentre) : tSolid;
    world.fx.push({
      kind: 'beam', who: id, t: world.t,
      x0: ox, z0: oz, x1: ox + ux * s.range * tEnd, z1: oz + uz * s.range * tEnd,
      hit: connected,
    });
    if (connected) {
      damage(world, id, other(id), s.damage, 'laser');
    } else {
      me.stats.misses.laser = (me.stats.misses.laser || 0) + 1;
      if (solid) me.stats.blocked.laser = (me.stats.blocked.laser || 0) + 1;
      emit(world, id, { type: 'missed', skill: 'laser', reason: solid ? 'cover' : 'aim' });
      world.log.push({ t: round3(world.t), type: 'miss', who: id, skill: 'laser', reason: solid ? 'cover' : 'aim' });
    }
    return;
  }

  if (act.id === 'blink') {
    const from = { x: me.x, z: me.z };
    const dest = blinkDestination(world, me, act.dx, act.dz, s.distance);
    me.x = dest.x; me.z = dest.z;
    me.iframes = Math.max(me.iframes, s.iframes);
    // A blink cancels nothing else because nothing else can be running: the
    // act slot is single-occupancy and `startSkill` refuses when it is full.
    world.fx.push({ kind: 'blink', who: id, t: world.t, x0: from.x, z0: from.z, x1: me.x, z1: me.z });
    emit(world, id, { type: 'blinked', from, to: { x: round3(me.x), z: round3(me.z) }, moved: round3(dist2(from.x, from.z, me.x, me.z)) });
    world.log.push({ t: round3(world.t), type: 'blink', who: id, dist: round3(dist2(from.x, from.z, me.x, me.z)) });
    me.vx *= 0.3; me.vz *= 0.3;
    return;
  }

  if (act.id === 'smash') {
    const clear = !strikeNeedsLos('smash') || hasLos(me.x, me.z, you.x, you.z, world.solids);
    const inReach = you.alive && you.y <= 0.35
      && inCone(me.x, me.z, me.heading, s.halfAngle, s.range + me.def.radius, you.x, you.z, you.def.radius);
    const hit = inReach && clear;
    /*
     * Read before `damage`, which reports the evade and leaves the hp alone.
     * i-frames stop the whole impact, knockback and interrupt included, and
     * `dashStep` now says the same — the two disagreed, so an octopus that
     * blinked into a charge came out stunned and interrupted while the same
     * blink against a smash came out clean. The cone still counts as landed for
     * the FX only when something actually landed, so an i-framed target still
     * draws the miss-coloured cone it always did.
     */
    const shielded = you.iframes > 0;
    world.fx.push({
      kind: 'cone', who: id, t: world.t, x: me.x, z: me.z,
      heading: me.heading, half: s.halfAngle, range: s.range + me.def.radius, hit: hit && !shielded,
    });
    if (hit) {
      damage(world, id, other(id), s.damage, 'smash');
      // Checked after the damage, because that call may have killed them and
      // `killFighter` zeroes the impulse. Putting it back sends the corpse
      // skating away under the death animation. `dashStep` guards the same way.
      if (you.alive && !shielded) {
        const [kx, kz] = norm2(you.x - me.x, you.z - me.z);
        you.kx += kx * s.knockback; you.kz += kz * s.knockback;
        interruptCast(world, id, 'smash');
      }
    } else {
      me.stats.misses.smash = (me.stats.misses.smash || 0) + 1;
      const why = you.y > 0.35 ? 'airborne' : !clear ? 'cover' : 'range';
      emit(world, id, { type: 'missed', skill: 'smash', reason: why });
      world.log.push({ t: round3(world.t), type: 'miss', who: id, skill: 'smash', reason: why });
    }
  }
}

/**
 * Where a blink lands.
 *
 * A teleport that refuses to cross a wall is a worse escape than a sprint, so
 * this one crosses. What it may not do is finish inside something: the
 * destination walks back toward the origin in 0.25 m steps until it is clear.
 *
 * ── why the arena edge clamps and no longer shortens ────────────────────────
 *
 * Shortening the ray to the edge is the truthful rule for a body in open floor
 * and it has no answer at all for a body against the wall, which is the one
 * that needs the verb. `collide` parks a pinned body at exactly ARENA_HALF - r,
 * so the reach along that axis came out 0 and the loop below never ran once:
 * from (19, 0) a blink 0.0 deg off north travelled 7.500 m and one 0.2 deg off
 * north travelled 0.000 m. Not a shortening — a cliff. Over 360 directions,
 * 49.7% of blinks off the east wall and 74.7% in the NE corner returned the
 * origin, and the cooldown and the i-frames were spent anyway. Over the l1..l6
 * grid it was 79 of 1 152 blinks (6.9%), every one at |x| or |z| = 19.
 *
 * So the landing clamps per axis instead, which is the same thing `collide`
 * does to a body that walks into a wall: the component into the wall is lost
 * and the one along it is kept. It bends the landing off the direction that was
 * asked for, and that was the reason the old rule was written — but the choice
 * is between arriving somewhere other than asked and not arriving at all, and
 * a cornered kiter with a 3.9 s cooldown would rather move. The trade, over
 * the 1 152 and 1 201 blinks the l1..l6 grid fires under the two rules:
 *
 *              0 m blinks   >1 deg off   worst error   mean travel
 *     shorten     6.9%          0%           0 deg        5.906 m
 *     clamp       0.5%       22.9%        82.6 deg        6.493 m
 *
 * 84.6 and not 180 because the clamp is to exactly ARENA_HALF - r, which is
 * where `collide` parks a body: clamping toward a limit a body is already on
 * cannot push it backwards, so the landing always keeps a non-negative
 * component along the direction asked for. A blink can be turned by a wall. It
 * can no longer be reversed by one, and it can no longer be cancelled.
 * (The old comment's 22.5%-off figure came from clamping to lim - 0.05, which
 * DOES shove a body parked at 19.0 backwards. That is the reversal, not the
 * clamp.)
 */
function blinkDestination(world, me, dx, dz, distance) {
  const r = me.def.radius;
  // Exactly where `collide` would put the body anyway, so a landing on the
  // line is stable rather than something the next tick shoves back.
  const lim = ARENA_HALF - r;
  for (let d = distance; d > 0; d -= 0.25) {
    const x = clamp(me.x + dx * d, -lim, lim);
    const z = clamp(me.z + dz * d, -lim, lim);
    let clear = true;
    for (const o of world.obstacles) {
      const qx = clamp(x, o.x - o.hx, o.x + o.hx), qz = clamp(z, o.z - o.hz, o.z + o.hz);
      if (dist2(x, z, qx, qz) < r + 0.05) { clear = false; break; }
    }
    if (clear) return { x, z };
  }
  return { x: me.x, z: me.z };
}

function damage(world, fromId, toId, amount, skill) {
  const src = world.fighters[fromId];
  const dst = world.fighters[toId];
  if (!dst.alive) return;
  if (dst.iframes > 0) {
    src.stats.misses[skill] = (src.stats.misses[skill] || 0) + 1;
    dst.stats.evaded++;
    emit(world, fromId, { type: 'missed', skill, reason: 'invulnerable' });
    emit(world, toId, { type: 'evaded', skill, by: fromId });
    world.log.push({ t: round3(world.t), type: 'evade', who: toId, skill });
    return;
  }
  dst.hp = Math.max(0, dst.hp - amount);
  src.stats.damageDealt += amount;
  dst.stats.damageTaken += amount;
  src.stats.hits[skill] = (src.stats.hits[skill] || 0) + 1;
  emit(world, fromId, { type: 'dealt', skill, amount, enemyHp: round3(dst.hp) });
  emit(world, toId, {
    type: 'damaged', skill, amount, hp: round3(dst.hp),
    from: { x: round3(src.x), z: round3(src.z) },
  });
  world.fx.push({ kind: 'hit', who: toId, t: world.t, x: dst.x, z: dst.z, amount, skill });
  world.log.push({ t: round3(world.t), type: 'damage', who: fromId, target: toId, skill, amount, hp: round3(dst.hp) });
  if (dst.hp <= 0) killFighter(world, toId);
}

/** Fraction of maximum hp per second the arena takes from both fighters. */
export function burnRate(t) {
  return t < SUDDEN_DEATH_AT ? 0 : SUDDEN_DEATH_RAMP * (t - SUDDEN_DEATH_AT);
}

/**
 * The arena's own damage. Not attributed to anyone: it is not a hit, nobody
 * aimed it, and crediting it to the other fighter would corrupt every hit-rate
 * and damage-dealt number in the report.
 */
function burn(world) {
  const rate = burnRate(world.t);
  if (rate <= 0) return;
  for (const id of world.order) {
    const f = world.fighters[id];
    if (!f.alive) continue;
    const before = f.hp;
    f.hp = Math.max(0, f.hp - f.def.hp * rate * DT);
    if (before > 0 && Math.floor(before / 10) !== Math.floor(f.hp / 10)) {
      emit(world, id, { type: 'burning', rate: round3(rate), hp: round3(f.hp) });
    }
    if (f.hp <= 0) {
      world.log.push({ t: round3(world.t), type: 'burned', who: id });
      killFighter(world, id);
    }
  }
}

function killFighter(world, id) {
  const f = world.fighters[id];
  f.alive = false;
  /*
   * The last way a charge can end, and the only one that does not go through
   * the act machine: the die act below overwrites the slot, so nothing
   * downstream ever learns the charge was there. It still spent a use, so it
   * still owes the breakdown a reason. `!spent` is what keeps this from
   * double-counting — a charge that connected, hit a wall or expired in empty
   * air is already marked and already recorded, and only one still owed an
   * outcome reaches this line. Measured at 54 of 2 028 charges on the o1..o6
   * 36-cell grid — the gorilla is killed mid-charge far more often than it
   * looks, because a wind-up it cannot cancel is 0.28 s of standing still.
   * With `range`, this is the rest of the residual: `unrecorded` reaches 0.
   */
  if (f.act && f.act.id === 'charge' && !f.act.spent) chargeMissed(world, id, 'died');
  // 1.5 s of falling, then the pose holds at phase 1 for as long as anyone is
  // still looking. `stepAct` never retires a `die`.
  f.act = { id: 'die', script: [['recover', 1.5, false]], step: 0, phase: 'recover', tPhase: 0, elapsedTotal: 0, total: 1.5, dx: 0, dz: 0, spent: true, startedAt: world.t };
  f.vx = 0; f.vz = 0; f.kx = 0; f.kz = 0;
  f.moveDirX = 0; f.moveDirZ = 0; f.moveTarget = null;
  world.log.push({ t: round3(world.t), type: 'death', who: id });
}

/** Advance one fighter's act machine. Step 5. */
function stepAct(world, id) {
  const me = world.fighters[id];
  const act = me.act;
  if (!act) return;
  if (act.id === 'die') { act.tPhase += DT; act.elapsedTotal += DT; return; }

  act.tPhase += DT;
  act.elapsedTotal += DT;

  const [name, dur, strikeAtEnd] = act.script[act.step];

  if (act.tPhase >= dur - 1e-9) {
    if (strikeAtEnd) resolveStrike(world, id);
    if (act.id === 'charge' && name === 'windup') {
      // Heading locks here, at the end of the telegraph, not when ordered.
      const [ux, uz] = dirOf(me.heading);
      act.dx = ux; act.dz = uz;
      emit(world, other(id), { type: 'enemyCommitted', skill: 'charge' });
    }
    /*
     * A dash that ran its full 0.8 s without touching anybody is over, and
     * `resolveStrike` was never reached to say so. Every other way out of a dash
     * goes through `endDash`, which agrees.
     *
     * Reaching this line with `name === 'dash'` IS the empty-air outcome:
     * contact with a body or with geometry calls `endDash`, which moves the
     * step to `recover`, so the dash phase can only expire on a charge that
     * touched nothing. That is 12 m of travel and a 4.0 s cooldown spent, and
     * until `chargeMissed` was added it was the one charge outcome the world
     * wrote nothing at all about.
     */
    if (name === 'dash') {
      act.spent = true;
      chargeMissed(world, id, 'range');
    }
    const carry = act.tPhase - dur;
    act.step++;
    if (act.step >= act.script.length) {
      if (act.id === 'jump') emit(world, id, { type: 'landed' });
      me.act = null;
      return;
    }
    act.phase = act.script[act.step][0];
    act.tPhase = carry;
  }

  /*
   * After the phase transition, not before it. Running the dash first left the
   * tick on which `dash` BEGINS with no travel at all — one frame in which the
   * gorilla was officially dashing and reported a speed of zero, which is the
   * same defect the reported-velocity fix exists to kill, one tick wide.
   */
  if (me.act && me.act.phase === 'dash') dashStep(world, id);
}

/**
 * A charge that ended without touching the enemy. One line type, one call site
 * per outcome, so "does the breakdown sum" is a single question.
 *
 * ── why this exists ─────────────────────────────────────────────────────────
 *
 * A charge can end five ways and only two of them used to be written down: the
 * hit (`damage`) and the i-frame dodge (`damage` again, as `evade`). The wall
 * stop logged `chargeWall`; the collision-pass stop and the dash that simply
 * ran out of clock logged nothing whatsoever. `tools/arena.mjs` prints the miss
 * breakdown directly under the charge hit rate, so the number that is supposed
 * to EXPLAIN that rate was silent about the largest share of it.
 *
 * Measured on the 36-cell grid, o1..o6 against o1..o6 at 12 seeds — 432
 * matches, 2 028 charges, 640 hits, 1 388 non-hits:
 *
 *                       named            unrecorded
 *     before      710 (51.2%)   706 wall, 4 invulnerable
 *                                    678 (48.8% of non-hits, 33.4% of charges)
 *     after     1 388 (100%)    706 wall, 624 range, 54 died, 4 invulnerable
 *                                                                           0
 *
 * Neither number in the defect report survives that census. The reviewer's
 * "silent about 78% of charges" is more than double the 33.4% measured, and the
 * follow-up's "32% of charge non-hits" is really a share of ALL charges — it is
 * config.js's own "32.4% run the full 12 m through empty air", which reads 624
 * of 2 028 = 30.8% here. The residual as a share of NON-hits is 48.8%, because
 * a third of all charges is nearly half of the ones that fail.
 *
 * Nothing here touches how a body moves: this function only writes, and the
 * call sites keep the control flow they had. Proof rather than assertion — the
 * same 432 matches, before and after, agree on every per-match trajectory hash,
 * length, winner and fault count, and on the grid totals: octopus win rate
 * 44.213% and mean match length 23.846 s both ways, at curtain 0 and at the
 * viewer's 2.6 s. (One earlier pair disagreed on 2 matches. Two runs of the
 * UNCHANGED tree disagree on the same 2, and the row says why: an octopus
 * `fault` that appears in one run and not the next. The brain host's think
 * budget is wall-clock, so a loaded machine can fault a brain that otherwise
 * survives. That is worth knowing before trusting any A/B on this grid.)
 *
 * The `stats.misses` bump makes charge agree with laser and smash, which have
 * counted every non-hit since they were written; the charge counter previously
 * only ever saw the i-frame case, reading 4 against 1 388 actual non-hits.
 */
function chargeMissed(world, id, reason) {
  /*
   * Nothing after the bell. `finish` marks every act spent so no strike can
   * resolve during the curtain — that fix holds, 0 post-bell `miss`, `evade`,
   * `damage` or `interrupt` lines across 1280 matches at the viewer's 2.6 s
   * curtain — but a dash keeps TRAVELLING, deliberately, so the animation does
   * not drop a frame. Its wall stop was outside that gate and wrote a
   * `charge:wall` miss into a match that was already decided: 4 lines in those
   * same 1280 matches, and 0 headless, which is why only the viewer path ever
   * saw it and the balance numbers never did. `range` and `died` would have
   * widened that hole rather than closed it, because a dash caught by the bell
   * goes on to expire in empty air 0.8 s into a match that is already over.
   * The charge caught mid-flight is recorded instead by `finish`, on the bell
   * tick, one line, before this gate closes.
   */
  if (world.over) return;
  const me = world.fighters[id];
  me.stats.misses.charge = (me.stats.misses.charge || 0) + 1;
  world.log.push({ t: round3(world.t), type: 'chargeMiss', who: id, reason });
}

/** One tick of a charge's travel: move at dash speed, stop on contact. */
function dashStep(world, id) {
  const me = world.fighters[id];
  const you = world.fighters[other(id)];
  const s = SKILLS.charge;
  const act = me.act;
  me.vx = 0; me.vz = 0;
  const step = s.dashSpeed * DT;
  const nx = me.x + act.dx * step, nz = me.z + act.dz * step;

  // contact with the enemy, tested along the swept segment so a 0.5 m step
  // cannot straddle a body
  if (you.alive && !act.spent) {
    const t = segCircle(me.x, me.z, nx, nz, you.x, you.z, you.def.radius + me.def.radius);
    if (t >= 0) {
      act.spent = true;
      me.x += act.dx * step * t; me.z += act.dz * step * t;
      /*
       * Read before `damage`. The charge used to stun, knock back and interrupt
       * a target inside its blink i-frames while the smash did not touch one at
       * all, so "invulnerable" meant two different things depending on which
       * gorilla skill arrived — a trap for a brain that blinks into a charge
       * expecting to come out clean. It now means the same one both times: no
       * damage, no impulse, no stun, no interrupt.
       *
       * The dash still STOPS here. Contact is not damage, and a 15 m/s body
       * passing through the one it just ran into would read as a dropped
       * collision rather than as a dodge.
       */
      const shielded = you.iframes > 0;
      damage(world, id, other(id), s.damage, 'charge');
      if (you.alive && !shielded) {
        you.kx += act.dx * s.knockback; you.kz += act.dz * s.knockback;
        you.stun = Math.max(you.stun, s.stun);
        interruptCast(world, id, 'charge');
        emit(world, other(id), { type: 'knockback', by: 'charge' });
      }
      endDash(me);
      return;
    }
  }

  // contact with the world: a charge that hits a wall stops there
  let blocked = false;
  for (const o of world.solids) {
    const [px, pz] = pushOutOfBox(nx, nz, me.def.radius, o);
    if (px !== 0 || pz !== 0) { blocked = true; break; }
  }
  if (blocked) {
    // The emit is left ungated on purpose: `step` runs no think once
    // `world.over` is set, so a post-bell `chargeStopped` reaches no brain, and
    // the event's shape is fixed by src/brain/prompt.js.
    emit(world, id, { type: 'chargeStopped', reason: 'wall' });
    chargeMissed(world, id, 'wall');
    endDash(me);
    return;
  }
  me.x = nx; me.z = nz;
  me.stats.distanceTravelled += step;
}

function endDash(me) {
  const act = me.act;
  if (!act) return;
  // Skip straight to the recover phase.
  const idx = act.script.findIndex((p) => p[0] === 'recover');
  act.step = idx;
  act.phase = 'recover';
  act.tPhase = 0;
  // Whether the dash ended on a body, on a wall or in a collision push, the
  // strike window is shut — and the recovery is exactly the window the opponent
  // is supposed to read as "safe, punish now".
  act.spent = true;
  /*
   * `total` is re-derived, because `casting.remaining` and the viewer's phase
   * bar are computed from it and both should describe the act that is going to
   * happen. A charge stopped by a wall three ticks into its dash otherwise went
   * on advertising the 0.7 s of travel it was never going to spend: measured on
   * a whiff into the north wall, `remaining` read 0.70 s at the instant the act
   * had 0.35 s of recovery left, so a brain waiting it out waited twice over.
   */
  act.total = act.elapsedTotal + act.script[idx][1];
  me.vx = 0; me.vz = 0;
}

// ---------------------------------------------------------------------------
// movement
// ---------------------------------------------------------------------------

function moveStep(world, id) {
  const me = world.fighters[id];
  const s = me.act ? SKILLS[me.act.id] : null;

  // turning — always allowed, at a scaled rate, because a body that cannot turn
  // during its own wind-up cannot track, and a body that cannot track makes
  // every ranged shot a lottery
  if (me.act && me.act.phase === 'dash') {
    /*
     * Pinned. The dash travels along the heading frozen at the end of the
     * wind-up, and the prompt tells every model it "cannot be changed after
     * that" — but the turn integrator kept running, so over an 0.8 s dash the
     * body could face up to 156 degrees away from where it was going. Making
     * the picture agree with the sentence costs no balance, because the travel
     * direction was already frozen. (Making the DASH steerable instead was
     * measured: charge hit rate 23% -> 38%, and the octopus loses 17 points of
     * win rate. That is a balance change wearing a bug fix's clothes.)
     */
    me.heading = headingOf(me.act.dx, me.act.dz);
    me.wantHeading = me.heading;
  } else if (me.alive && me.stun <= 0) {
    const scale = s ? (s.turnScale === undefined ? 1 : s.turnScale) : 1;
    me.heading = turnToward(me.heading, me.wantHeading, me.def.turnRate * scale * DT);
  }

  const dashing = me.act && me.act.phase === 'dash';
  const airborne = me.act && me.act.phase === 'air';

  if (airborne) {
    // Horizontal velocity is frozen at take-off; only the arc advances.
    const u = clamp(me.act.tPhase / SKILLS.jump.airborne, 0, 1);
    me.y = 4 * me.def.jumpHeight * u * (1 - u);
  } else {
    // Every phase that is not the hop itself is on the ground, the jump's own
    // wind-up and landing included. Excluding them left the body hovering 18 cm
    // up for the 0.16 s of the landing, which is exactly long enough to see.
    me.y = 0;
  }

  if (airborne) {
    /*
     * Frozen, not braked.
     *
     * The integrator used to see a zero desired velocity here and brake toward
     * it at 30 m/s^2, which stopped a hop dead in about a sixth of a second —
     * while the prompt told every model "your horizontal velocity is frozen at
     * take-off". So a brain that hopped sideways out of a cone, exactly as
     * documented, landed almost where it left. Leaving the velocity alone is
     * both the documented behaviour and the one that makes the verb worth
     * having.
     */
  } else if (!dashing) {
    let desX = 0, desZ = 0;
    if (me.alive && me.stun <= 0) {
      let dirX = me.moveDirX, dirZ = me.moveDirZ;
      if (me.moveTarget) {
        // Steered through the navigator, so a standing `moveTo` order walks
        // around a block instead of leaning on it.
        const w = world.nav[id].steer(me.x, me.z, me.moveTarget.x, me.moveTarget.z);
        /*
         * Arrival is measured against the last WAYPOINT, which `nav.path` nudges
         * out to somewhere a body of this radius can stand. Measuring it against
         * the raw order meant `moveTo` a point inside a block never arrived: the
         * gorilla stood at (0.00, -7.55) leaning on block 'c' from t=2 to t=12
         * with the order still standing, and the prompt promises the order
         * stands "until the point is reached".
         */
        const g = w && w.points.length ? w.points[w.points.length - 1] : me.moveTarget;
        if (dist2(me.x, me.z, g.x, g.z) < 0.35) { me.moveTarget = null; dirX = 0; dirZ = 0; }
        else {
          const tx = w ? w.x : g.x, tz = w ? w.z : g.z;
          const [ux, uz] = norm2(tx - me.x, tz - me.z);
          dirX = ux; dirZ = uz;
        }
      }
      const scale = s ? (s.moveScale === undefined ? 1 : s.moveScale) : 1;
      desX = dirX * me.def.maxSpeed * scale;
      desZ = dirZ * me.def.maxSpeed * scale;
    }
    const dvx = desX - me.vx, dvz = desZ - me.vz;
    const dl = len2(dvx, dvz);
    const rate = (desX === 0 && desZ === 0) ? BRAKE_ACCEL : me.def.accel;
    const step = rate * DT;
    if (dl > step && dl > 1e-9) { me.vx += (dvx / dl) * step; me.vz += (dvz / dl) * step; }
    else { me.vx = desX; me.vz = desZ; }
  }

  // knockback decays independently of control, so a knocked body still drifts
  // while its brain steers — which is what makes a charge feel like an impact
  const kl = len2(me.kx, me.kz);
  if (kl > 0) {
    const nk = Math.max(0, kl - KNOCKBACK_DRAG * DT);
    if (nk < KNOCKBACK_MIN) { me.kx = 0; me.kz = 0; }
    else { me.kx = (me.kx / kl) * nk; me.kz = (me.kz / kl) * nk; }
  }

  if (!dashing) {
    const px = me.x, pz = me.z;
    me.x += (me.vx + me.kx) * DT;
    me.z += (me.vz + me.kz) * DT;
    me.stats.distanceTravelled += dist2(px, pz, me.x, me.z);
  }
}

/**
 * Step 7 — nothing overlaps anything solid when this returns.
 *
 * ── why this iterates ───────────────────────────────────────────────────────
 *
 * The obvious single pass is: push each body out of every block, then push the
 * two bodies apart, then clamp both inside the arena. Each of those three is
 * correct on its own and any two of them can undo the third. The one that bit
 * was the last: a body pinned against a wall is clamped straight back into the
 * body that had just been separated from it, and the pair stays interpenetrated
 * for as long as the pin lasts. It went unnoticed until a tuning pass raised
 * the closing speed, at which point `tools/test.mjs` reported 109 overlapping
 * ticks in one match.
 *
 * The loop exits as soon as a round changes nothing, and a round that changes
 * nothing satisfies every constraint at once — that is the only clean exit.
 * Reporting — killing velocity into a surface, emitting `blocked` and
 * `contact`, ending a dash — happens on the first round only, so a body does
 * not read as having hit sixteen walls because the solver needed sixteen
 * passes.
 *
 * ── why sixteen rounds and not four ─────────────────────────────────────────
 *
 * Four was written down as "enough to converge". It is not: the two constraints
 * are each non-convex (outside a box, and at least rr apart), so alternating
 * projections can cycle instead of settling, and over 208k ticks of the full
 * brain population 1.8% of ticks ran out of rounds. What runs LAST when they do
 * is the body-body push, with no block pass behind it — so a body squeezed
 * against a block by the other one ended the tick inside it: 68 body-ticks more
 * than 3 cm in, deepest 5.06 cm, against the 3 cm `tools/test.mjs` asserts.
 *
 * The residual contracts by roughly 5x per four extra rounds — worst
 * penetration 5.06 cm at four rounds, 0.92 cm at eight, 0.04 cm at sixteen —
 * while the overlap count stays at zero throughout, because every round still
 * ENDS with the separation. Sixteen buys sub-millimetre at a cost paid on the
 * 1.4% of ticks that get past round four, on two circles and ten boxes.
 *
 * Appending a single block push after the loop — the obvious cheaper fix, and
 * the same shape as reordering the round to end on the blocks — was measured
 * and rejected: it trades the 68 block violations for 114 body-body overlaps up
 * to 5.05 cm, and `tools/test.mjs` asserts both at zero. Whichever constraint
 * runs last is the one that holds; the only real answer is to run until neither
 * moves.
 */
function collide(world) {
  const list = world.order.map((id) => world.fighters[id]);
  const [a, b] = list;
  const rr = a.def.radius + b.def.radius;

  // "In melee" is the reach of the only skill that defines it. Counted here so
  // every consumer reads the same number instead of each re-deriving it.
  if (dist2(a.x, a.z, b.x, b.z) < SKILLS.smash.range + rr) {
    world.meleeTicks = (world.meleeTicks || 0) + 1;
  }

  for (let iter = 0; iter < 16; iter++) {
    const first = iter === 0;
    let moved = false;

    for (const f of list) {
      let told = false;
      for (const o of world.solids) {
        const [px, pz] = pushOutOfBox(f.x, f.z, f.def.radius, o);
        if (px === 0 && pz === 0) continue;
        f.x += px; f.z += pz;
        moved = true;
        const [nx, nz] = norm2(px, pz);
        if (first) {
          // kill the velocity component heading into the surface, so a body
          // slides along a wall instead of grinding against it
          const vn = f.vx * nx + f.vz * nz;
          if (vn < 0) { f.vx -= vn * nx; f.vz -= vn * nz; }
          const kn = f.kx * nx + f.kz * nz;
          if (kn < 0) { f.kx -= kn * nx; f.kz -= kn * nz; }
          /*
           * `tools/arena.mjs` named this line as one of the two reasons its
           * charge breakdown did not sum. It is not one: measured across 5 222
           * charges (the o1..o6 36-cell grid at 12 seeds, and two probe grids),
           * it fired ZERO times, and all 678 unrecorded non-hits on the o-grid
           * were the empty-air dash (624) and the charger's own death (54).
           *
           * It cannot fire as the code stands. A dashing body is moved by
           * `dashStep` and by nothing else — `moveStep`'s translation is behind
           * `if (!dashing)` — and `dashStep` accepts a step only after testing
           * the DESTINATION with the same `pushOutOfBox(x, z, radius, o)` call
           * this loop uses. So a body in the dash phase always reaches `collide`
           * standing somewhere already known to be clear. The body-body push
           * below can still shove it into a block, but that happens after this
           * pass and is repaired on a later round, where `first` is false.
           *
           * The record stays anyway, because the reachability argument is a
           * property of `dashStep`'s destination test and not of this line: if
           * that test is ever loosened, the charge that gets stopped here needs
           * to arrive in the breakdown rather than vanish from it. Its own
           * reason, not merged into `wall`, so the day it does appear it is
           * legible as the new thing it is.
           */
          if (f.act && f.act.phase === 'dash') { chargeMissed(world, f.id, 'push'); endDash(f); }
          // Told, not inferred: a brain steering with raw `move` has no other
          // way to learn that the direction it chose ends in a wall.
          if (!told && len2(px, pz) > 0.02) {
            told = true;
            emit(world, f.id, { type: 'blocked', by: o.wall ? 'wall' : 'obstacle' });
          }
        }
      }
      const lim = ARENA_HALF - f.def.radius;
      const cx = clamp(f.x, -lim, lim), cz = clamp(f.z, -lim, lim);
      if (cx !== f.x || cz !== f.z) { f.x = cx; f.z = cz; moved = true; }
    }

    const d = dist2(a.x, a.z, b.x, b.z);
    if (d < rr - 1e-6) {
      const [nx, nz] = d < 1e-6 ? [1, 0] : [(b.x - a.x) / d, (b.z - a.z) / d];
      const overlap = rr - d;
      /*
       * Heavier body yields less — this is what makes the gorilla feel heavy
       * and stops the octopus body-blocking a charge. But a body already
       * against a wall cannot yield at all, so its share is handed to the
       * other one; without that the pair simply stays overlapped in a corner.
       */
      const pinned = (f) => Math.abs(f.x) >= ARENA_HALF - f.def.radius - 1e-6
        || Math.abs(f.z) >= ARENA_HALF - f.def.radius - 1e-6;
      const pa = pinned(a), pb = pinned(b);
      let sa = b.def.mass / (a.def.mass + b.def.mass);
      let sb = a.def.mass / (a.def.mass + b.def.mass);
      if (pa && !pb) { sa = 0; sb = 1; } else if (pb && !pa) { sa = 1; sb = 0; }
      a.x -= nx * overlap * sa; a.z -= nz * overlap * sa;
      b.x += nx * overlap * sb; b.z += nz * overlap * sb;
      moved = true;
      if (first) {
        emit(world, a.id, { type: 'contact' });
        emit(world, b.id, { type: 'contact' });
      }
    }

    if (!moved) break;
  }
}

// ---------------------------------------------------------------------------
// the tick
// ---------------------------------------------------------------------------

/**
 * One 1/30 s step.
 *
 * `think` is injected rather than imported so that `packages/core` never learns
 * what a `vm` is: the headless runner passes a plain function, the server passes
 * the sandbox, and a unit test passes a stub.
 */
export function step(world, think) {
  if (world.done) return world;
  world.fx.length = 0;
  world.tick++;
  world.t = world.tick * DT;

  for (const id of world.order) {
    const f = world.fighters[id];
    for (const k of Object.keys(f.cooldowns)) if (f.cooldowns[k] > 0) f.cooldowns[k] = Math.max(0, f.cooldowns[k] - DT);
    if (f.stun > 0) f.stun = Math.max(0, f.stun - DT);
    if (f.iframes > 0) f.iframes = Math.max(0, f.iframes - DT);
    if (f.say && world.t > f.say.until) f.say = null;
  }

  if (!world.over && world.tick % THINK_EVERY === 0 && think) {
    const snap = {};
    for (const id of world.order) snap[id] = world.fighters[id].alive ? perceive(world, id) : null;
    const queued = {};
    for (const id of world.order) {
      if (!snap[id]) continue;
      const f = world.fighters[id];
      if (f.disabled) continue;
      const { api, q, calls } = makeApi(world, id);
      f.stats.thinks++;
      /*
       * `think` is injected and every one of the three implementations can
       * throw: the vm host on a value it cannot describe, the server's sandbox,
       * a stub in a test. A brain must not be able to unwind past this line —
       * one that threw an object with a throwing `message` getter used to take
       * the whole runner down through `step` — so a throw here is a fault like
       * any other fault, which is a fact about the match.
       */
      let fault = null, micros = 0;
      try {
        const res = think(id, snap[id], api);
        if (res && res.fault) fault = faultText(res.error);
        else if (res && typeof res.micros === 'number') micros = res.micros;
      } catch (err) {
        fault = `the brain host threw: ${faultText(err)}`;
      }
      if (fault !== null) {
        f.faults++;
        f.stats.faults++;
        world.log.push({ t: round3(world.t), type: 'fault', who: id, error: fault });
        if (f.faults >= FAULT_LIMIT) {
          f.disabled = true;
          /*
           * The standing order deliberately survives, because the prompt tells
           * every model it will: "the mind is switched off for the rest of the
           * fight and the body coasts on whatever it was last told". Measured on
           * open floor with one standing order east, a brain that breaks for
           * good on its second thought — switched off at t=1.73 at x=8.0 —
           * walks on to x=18.86 by t=4 and stands against the wall at x=19.00
           * for the remaining ten seconds, which is not a good picture. It is
           * the documented one, and `moveTo` orders now terminate properly
           * (see `moveStep`), so the ugly case is the raw `move` direction.
           */
          world.log.push({ t: round3(world.t), type: 'brainDisabled', who: id });
        }
        continue;
      }
      /*
       * Cumulative, not consecutive: `f.faults` is deliberately NOT cleared by a
       * good thought. That was filed as a defect against the old config.js line
       * "Consecutive faults after which a brain is switched off", and the
       * measurement stands — a brain that throws on one thought in four, healthy
       * 75% of the time and visibly playing, is switched off at t=6.667 after 25
       * faults out of 100 thoughts, with 200 working thoughts left in the match.
       * config.js now documents the cumulative rule on purpose and argues for
       * it, so the divergence is closed there rather than here; the number to
       * revisit is FAULT_LIMIT, not this line.
       */
      f.stats.thinkMicros += micros;
      f.stats.orders += Object.values(q).filter((v) => v !== null && v !== undefined).length;
      for (const [k, c] of Object.entries(calls)) f.stats.verbs[k] = (f.stats.verbs[k] || 0) + c;
      queued[id] = q;
      if (world.observer) world.observer(id, snap[id], q, calls);
    }
    for (const id of world.order) if (queued[id]) applyOrders(world, id, queued[id]);
  }

  for (const id of world.order) {
    const f = world.fighters[id];
    f.px = f.x; f.pz = f.z;
  }
  if (!world.over) burn(world);
  for (const id of world.order) stepAct(world, id);
  for (const id of world.order) moveStep(world, id);
  collide(world);
  for (const id of world.order) {
    const f = world.fighters[id];
    // After collision, so a body pinned against a wall reports a speed of zero
    // rather than the speed it was trying to achieve.
    f.rvx = (f.x - f.px) / DT;
    f.rvz = (f.z - f.pz) / DT;
    // A blink is a translation, not a velocity; reporting 7.5 m in one tick as
    // 225 m/s would make every leading calculation in every brain nonsense.
    if (len2(f.rvx, f.rvz) > f.def.maxSpeed * 4) { f.rvx = f.vx + f.kx; f.rvz = f.vz + f.kz; }
  }

  const o = world.fighters.octopus, g = world.fighters.gorilla;
  if (!world.over) {
    if (!o.alive && !g.alive) finish(world, null, 'double-ko');
    else if (!o.alive) finish(world, 'gorilla', 'kill');
    else if (!g.alive) finish(world, 'octopus', 'kill');
    else if (world.t >= MATCH_SECONDS) {
      const fo = o.hp / o.def.hp, fg = g.hp / g.def.hp;
      if (Math.abs(fo - fg) < 1e-6) finish(world, null, 'timeout-draw');
      else finish(world, fo > fg ? 'octopus' : 'gorilla', 'timeout');
    }
  } else {
    world.curtain -= DT;
    if (world.curtain <= 0) world.done = true;
  }
  return world;
}

function finish(world, winner, reason) {
  world.winner = winner;
  world.reason = reason;
  world.curtain = world.curtainSeconds;
  if (world.curtain <= 0) world.done = true;
  /*
   * The survivor stops chasing a corpse. Its current act is allowed to finish,
   * because a charge that vanished mid-dash would look like a dropped frame —
   * but it is marked spent, so the animation plays and nothing lands. `step`
   * runs `stepAct` whether or not the match is over, so a laser already in
   * wind-up used to resolve during the curtain and push a miss into the log and
   * into the end-of-match panel: 3 entries across 288 matches at the viewer's
   * 2.6 s curtain, and 0 headless, which is why the balance numbers never saw
   * it and the only person who ever did was watching.
   *
   * That fix holds, and it is measured: 0 post-bell `miss`, `evade`, `damage`
   * or `interrupt` lines across 1 280 probe matches at the viewer's 2.6 s. What
   * it did not cover is the charge, the one act that keeps MOVING through the
   * curtain — marking it spent silences its STRIKE but not its travel, and its
   * wall stop was outside the gate, writing 4 `charge:wall` misses into those
   * same 1 280 already-decided matches (0 headless, which is why the balance
   * numbers never saw it and only the viewer path did).
   *
   * `chargeMissed` now refuses everything after `world.over`, which closes
   * that — but on its own it would have stranded the 7 charges still in flight
   * at the bell with no reason at all, and `uses` had already counted them. So
   * the reason is written HERE, on the bell tick, before the flag goes up.
   * That is why `world.over` is set at the bottom of this function and not the
   * top: nothing between the two reads it (the death checks in `step` test it
   * before calling in, and no think runs after), and the ordering is what lets
   * one gate mean "not during the curtain" and still leave the breakdown
   * summing to zero unrecorded. The o1..o6 grid shows 0 of these in 432
   * matches; the probe grid, which times out far more often, shows 7 in 1 280.
   */
  for (const id of world.order) {
    const f = world.fighters[id];
    f.moveDirX = 0; f.moveDirZ = 0; f.moveTarget = null;
    if (f.act && f.act.id === 'charge' && !f.act.spent) chargeMissed(world, id, 'bell');
    if (f.act) f.act.spent = true;
  }
  world.over = true;
  world.log.push({ t: round3(world.t), type: 'end', winner, reason });
}

/** What the viewer needs, and nothing else. */
export function snapshot(world) {
  const f = (x) => {
    const me = world.fighters[x];
    // Copied, like every other field. Handing out the live object made a
    // recorded replay show one number — the last frame's — on all 1350 of its
    // frames, because every frame held the same reference.
    const cd = {};
    for (const k of Object.keys(me.cooldowns)) cd[k] = round3(me.cooldowns[k]);
    return {
      id: me.id,
      x: round3(me.x), y: round3(me.y), z: round3(me.z),
      vx: round3(me.rvx), vz: round3(me.rvz),
      h: round3(me.heading),
      hp: round3(me.hp), maxHp: me.def.hp,
      alive: me.alive,
      act: me.act ? me.act.id : null,
      phase: me.act ? round3(clamp(me.act.elapsedTotal / Math.max(1e-6, me.act.total), 0, 1)) : 0,
      actPhase: me.act ? me.act.phase : null,
      inv: me.iframes > 0,
      stun: me.stun > 0,
      say: me.say ? me.say.text : null,
      cd,
      dis: me.disabled,
    };
  };
  return {
    t: round3(world.t),
    tick: world.tick,
    over: world.over,
    winner: world.winner,
    reason: world.reason,
    octopus: f('octopus'),
    gorilla: f('gorilla'),
    fx: world.fx.map((e) => ({ ...e, t: round3(e.t) })),
  };
}
