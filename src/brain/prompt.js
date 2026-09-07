/**
 * The brain instruction, generated.
 *
 * ── the editing rule ────────────────────────────────────────────────────────
 *
 * Every line this file emits is exactly one of:
 *
 *   1. A CAPABILITY — a verb, a field, a helper. A model cannot call what it
 *      has not been told exists.
 *   2. A CONSTRAINT WITH ITS REASON. The reason is not decoration: measured on
 *      the prior project, "no Math" without a why produces ES3 — no `const`, no
 *      arrow functions — because the model infers an ancient runtime from an
 *      arbitrary-looking ban.
 *   3. A FACT ABOUT THE WORLD — a radius, a rate, a timing, a damage number.
 *   4. THE OBJECTIVE — what the creature is for, and nothing about how.
 *
 * What never goes in: tactics, priorities, rankings, worked strategies, "it is
 * usually better to…", "keep your distance", "interrupt the cast". If a
 * sentence does the model's thinking for it, it is not in one of the four
 * categories and it does not belong here. The whole experiment is whether a
 * model handed a dictionary writes a fighter; a prompt that whispers the answer
 * measures nothing.
 *
 * ── the one thing that is not negotiable ────────────────────────────────────
 *
 * Every number below is READ from `src/core/config.js`, never typed. A prompt
 * that lies is worse than no prompt: the model believes it, writes against it,
 * and the creature dies of the difference.
 *
 * Read from config, and for a duration rounded to what the world serves it in —
 * the sim's clock only turns over on ticks, so twelve of the eighteen declared
 * timings are not the ones a fighter ever experiences. `served` below does that
 * rounding and says why it happens here rather than in config.
 *
 * That promise is MECHANISED rather than trusted, and it covers BOTH forms of
 * the document: the reference fixture's prompt and the one every player's
 * creature is handed, whose skill cards are built from a compiled kit. The kit
 * half used to be outside it — 59 numbers rendered through the untraced `n()`,
 * so no card figure was checked against the def it came from and no stray
 * numeral in that prose could be caught (review r1, F7). Every number goes out
 * through `q(label, value)`, which formats it exactly as before and — while a
 * trace is running — records the pair and brackets the characters it produced.
 * Kit labels are `kit.<own|enemy>.<slot>.<field>`; the side is part of the
 * label because one document prints two different kits. On that record
 * `tools/checkprompt.mjs` runs the guarantee in both directions, over the
 * fixture render AND over a kit render:
 *
 *   config -> text   the set of labels emitted must equal its whitelist, and
 *                    each emitted substring must equal the live config value.
 *   text -> config   everything OUTSIDE the brackets is swept for numerals, so
 *                    a number typed into the prose can never reach the model.
 *
 * The first direction used to be a substring search over the finished prompt
 * and it false-passed silently: with the laser's damage hardcoded in the text,
 * moving the config value to 3, 4, 24 and 155 was not detected once: the 17.6 kB
 * prompt it searched already contained every one of those numerals somewhere
 * else. A grep cannot tell you what a document meant to say — only the emitter
 * knows that, so the emitter reports it.
 *
 * `tools/checkbehaviour.mjs` closes the half that no text check can reach: it
 * fires each skill in a controlled world and MEASURES what these lines claim.
 * A number can be quoted faithfully from config and still describe the geometry
 * wrongly, which is exactly how the laser came to advertise "range 24 m" for a
 * weapon that reaches 26.85 m between centres.
 */

import {
  AIRBORNE_DODGE_MIN,
  ARENA_HALF, BEAM_MUZZLE, BEAM_RADIUS, BLINK_VELOCITY_KEEP, BURN_EVENT_EVERY, EVENTS_MAX,
  FAULT_LIMIT,
  INTERRUPT_MIN_WINDUP, KNOCKBACK_DRAG, KNOCKBACK_MIN, MATCH_SECONDS, statsOf,
  MAX_ORDERS_PER_THINK, MAX_QUERIES_PER_THINK, MEM_MAX_KEYS, MEM_MAX_VALUE_BYTES,
  OBSTACLES, PROJECTILE_MUZZLE,
  PROJECTILE_TOUCH, SAY_EVERY, SAY_MAX_CHARS,
  SKILLS, SPAWN_RADIUS, SUDDEN_DEATH_AT, SUDDEN_DEATH_RAMP, THINK_EVERY,
  THINK_HZ, THINK_TIMEOUT_MS, TICK_HZ, WALL_AHEAD, WALL_RAISED_HEIGHT, ZONE_PERIOD,
  skillsOf, referenceTagOf,
} from '../core/config.js';
import { BLIND_LAG_TICKS } from '../core/effects.js';
import { DELIVERIES, EFFECTS } from '../skills/registry.js';
import { FUEL_PER_THINK } from '../server/sandbox/instrument.js';

const n = (v) => (Number.isInteger(v) ? String(v) : String(Math.round(v * 1000) / 1000));
const deg = (rad) => String(Math.round((rad * 180) / Math.PI));

/**
 * What the world SERVES for a declared duration, which is not what config says.
 *
 * `sim.js` `stepAct` adds one tick to a skill's phase clock per step and ends
 * the phase on the first step at or past its declared length, carrying the
 * overshoot into the next phase; cooldown, i-frames and stun are counted down
 * one tick per step until they cross zero. A declared duration that is not a
 * whole number of ticks is therefore never the one a fighter experiences.
 * Measured against config as it stood when this was written, twelve of the
 * eighteen disclosed timings differ:
 *
 *     laser  windup  0.65 -> 0.667     smash  windup   0.28 -> 0.3
 *     blink  recover 0.18 -> 0.2       smash  recover  0.28 -> 0.267
 *     blink  iframes 0.28 -> 0.3       charge windup   0.28 -> 0.3
 *     blink  cooldwn 3.9  -> 3.933     charge recover  0.35 -> 0.333
 *     jump   airborne 0.55 -> 0.567    charge stun     0.4  -> 0.433
 *     jump   recover 0.16 -> 0.167     charge cooldown 4    -> 4.033
 *
 * The two that go DOWN are the carry: smash's wind-up overruns its 0.28 by
 * 0.02 s and that 0.02 is taken off its recovery. 0.02 s is 7% of the smash
 * wind-up, and the wind-up is the dodge window the model reasons against — the
 * same class of error as advertising "range 24 m" for a beam that reaches
 * 26.85 m, which is what `tools/checkbehaviour.mjs` was built to catch.
 *
 * The rounding happens HERE and not in config, and that is deliberate: config's
 * numbers are the designer's knob and the balance search's coordinates, and
 * quantising them there would move nine constants and mark all twelve shipping
 * brains stale under `tools/checkstale.mjs` for a difference the world never
 * had. The prompt is where the world is described, so the prompt is where it is
 * described truthfully. Nothing below is trusted: `checkbehaviour` fires each
 * skill and measures every one of these against the sim.
 */
const TICK = 1 / TICK_HZ;

/** One phase of the clock: ticks until it reaches `dur`, starting from `carry`. */
function phaseClock(dur, carry) {
  let t = carry, ticks = 0;
  while (t < dur - 1e-9) { t += TICK; ticks++; }
  return { served: ticks * TICK, carry: t - dur };
}

/**
 * `sim.js` `phasesOf`, as config field names in order. `null` is blink's
 * zero-length strike phase: it resolves on the tick the order lands and has no
 * config field of its own, so the recovery clock starts from zero and the whole
 * act is the recovery.
 */
const PHASE_FIELDS = {
  laser: ['windup', 'recover'],
  blink: [null, 'recover'],
  smash: ['windup', 'recover'],
  charge: ['windup', 'dashSeconds', 'recover'],
  jump: ['windup', 'airborne', 'recover'],
};

/** Every phase duration of one skill as served, keyed by its config field. */
function served(name) {
  const s = SKILLS[name];
  const out = {};
  let carry = 0;
  for (const field of PHASE_FIELDS[name]) {
    const r = phaseClock(field === null ? 0 : (s[field] || 0), carry);
    if (field !== null) out[field] = r.served;
    carry = r.carry;
  }
  return out;
}

/** A countdown accumulator — cooldown, i-frames, stun — as served. */
function servedCountdown(seconds) {
  let t = seconds, ticks = 0;
  /* The same microsecond floor the sim's countdown applies (`step` in sim.js):
     a residue of floating-point dust is not a tick anybody waits. */
  while (t > 0) { t = t - TICK; if (t < 1e-6) t = 0; ticks++; }
  return ticks * TICK;
}

/**
 * The phases of a grammar ability as SERVED, the way `served` does it for the
 * hardcoded five: a phase ends on the first step at or past its length and the
 * overshoot comes off the next one. The kit block used to print countdown
 * rounding here — 0.667 s for a beam wind-up the world serves in 0.633 — which
 * is the one class of lie this file exists to prevent.
 */
function servedDef(d) {
  const fields = d.kind === 'jump' ? ['windup', 'airborne', 'recover']
    : (d.windup > 0 ? ['windup', 'recover'] : [null, 'recover']);
  const out = {};
  let carry = 0;
  for (const field of fields) {
    const r = phaseClock(field === null ? 0 : (d[field] || 0), carry);
    if (field !== null) out[field] = r.served;
    carry = r.carry;
  }
  return out;
}

/**
 * The tagged emitter — the mechanism the docstring above promises.
 *
 * `q('skills.laser.damage', SKILLS.laser.damage)` renders exactly what `n`
 * renders, and while `tracePrompt` is collecting it also records the label with
 * the text it produced and wraps that text in a pair of control characters.
 * The wrapping is what makes the text->config sweep exact: the checker deletes
 * every config-derived character BY POSITION and sweeps what is left, instead
 * of searching the finished prompt for numbers it hopes are there.
 *
 * U+0001/U+0002 because neither can occur in the prose. Nothing strips them —
 * an untraced render never produces them, so the text handed to a model is the
 * same text whether or not anyone is checking it.
 */
const MARK_IN = '\u0001';
const MARK_OUT = '\u0002';
let TRACE = null;

function q(label, value, fmt = n) {
  const text = fmt(value);
  if (!TRACE) return text;
  TRACE.push({ label, text });
  return MARK_IN + text + MARK_OUT;
}

// ---------------------------------------------------------------------------
// 1. the shape of the answer
// ---------------------------------------------------------------------------

function shape() {
  return `You are writing the entire mind of one fighter in a duel, as JavaScript.

Reply with code only. No prose, no explanation, no markdown fence. Exactly this shape:

function think(p, api) {
  // whatever you want
}

Helper functions and constants declared beside it are kept and are in scope for
every call. The function must be named think and must take exactly two
parameters; a different arity is a compile fault and the fighter is born
mindless.

think(p, api) is called ${q('think.hz', THINK_HZ)} times a second while you are alive. It returns
nothing. The only way it changes the world is by calling api verbs. Perception p
is rebuilt fresh for every call.`;
}

// ---------------------------------------------------------------------------
// 2. the world
// ---------------------------------------------------------------------------

function world() {
  const obs = OBSTACLES
    .map((o) => `    x ${q(`obstacles.${o.id}.x`, o.x)}, z ${q(`obstacles.${o.id}.z`, o.z)}, `
      + `half-width ${q(`obstacles.${o.id}.hx`, o.hx)}, half-depth ${q(`obstacles.${o.id}.hz`, o.hz)}`)
    .join('\n');
  return `THE WORLD

A flat square arena. The ground is the X/Z plane; +Y is up and nothing but a hop
or a leap ever leaves the ground. The arena runs from -${q('arena.half', ARENA_HALF)} to +${q('arena.half', ARENA_HALF)} on both X and Z, walled on
all four sides. Nothing can leave it.

Headings are radians. Heading 0 faces +Z; the angle increases toward +X, so
heading = Math.atan2(dx, dz) and the unit vector of a heading is
{ x: Math.sin(h), z: Math.cos(h) }.

${q('obstacles.count', OBSTACLES.length)} solid blocks stand on the floor, ${q('obstacles.height', OBSTACLES[0].h)} m tall, axis-aligned:

${obs}

A block stops a body and stops a line of sight. Nothing sees or shoots through
one, and nothing walks through one. The walls do the same.

The simulation advances ${q('tick.hz', TICK_HZ)} times a second. You think on every second step, so
${q('think.hz', THINK_HZ)} times a second, and the world moves twice between two of your thoughts.

A skill's phases are served on those same steps: a phase ends on the first step
at or past its length, and any overshoot comes off the phase after it. Every
duration in the tables below is the served one, so what you are told is what the
world runs.

The two fighters start ${q('spawn.separation', SPAWN_RADIUS * 2)} m apart on opposite ends of a diameter, at an angle
that changes from match to match, facing each other.

The match ends when one fighter reaches 0 hp.

From ${q('suddenDeath.at', SUDDEN_DEATH_AT)} seconds the arena itself starts burning both of you. The rate rises
with every second that passes: at time t you lose ${q('suddenDeath.ramp', SUDDEN_DEATH_RAMP)} * (t - ${q('suddenDeath.at', SUDDEN_DEATH_AT)}) of your MAXIMUM
hp per second, and so does your opponent. It is proportional, so whoever holds
the smaller fraction of their maximum burns to nothing first. From full health
the burn alone kills at ${q('suddenDeath.killsAt', SUDDEN_DEATH_AT + Math.sqrt(2 / SUDDEN_DEATH_RAMP))} seconds. p.burn is the current rate and
p.burnStartsIn counts down to it.

If ${q('match.seconds', MATCH_SECONDS)} seconds somehow pass with both alive, the larger hp fraction wins and
exactly equal fractions is a draw.`;
}

// ---------------------------------------------------------------------------
// 3. bodies
// ---------------------------------------------------------------------------

/**
 * Одно тело, своими числами.
 *
 * @param {boolean} mine       чьё тело описывается — своё или соперника
 * @param {object}  f          боевая запись из `statsOf(телосложение)`
 * @param {object}  [kit]      набор §8, если он есть
 * @param {string}  fixtureTag СТОРОНА арены; через `referenceTagOf` она
 *                             выбирает эталонную фикстуру §1 — но только
 *                             тогда, когда набора нет
 *
 * ── ЧИСЛА ПРИНАДЛЕЖАТ СУЩЕСТВУ, А НЕ ВИДУ (01.09) ──────────────────────────
 *
 * Здесь звался `statsFor(id, size)`: характеристики выдавала СТОРОНА арены, а
 * своей у существа была одна ось — множитель размера. Записей архетипов больше
 * нет и наследовать не от кого; телосложение приезжает вместе с бойцом, и
 * печатается ровно оно.
 *
 * Печатается и телосложение СОПЕРНИКА — оно тоже его собственное. Весь этот
 * файл построен на «каждое число — факт», и мозг планирует дистанции по этим
 * числам: ошибиться в чужом радиусе значит ошибиться в том, с какого
 * расстояния по нему достают.
 */
function bodyBlock(mine, f, kit, fixtureTag) {
  /*
   * ИМЕНА УМЕНИЙ БЕРУТСЯ ИЗ НАБОРА ЭТОГО БОЙЦА, А НЕ ИЗ ФИКСТУРЫ (D160).
   *
   * Здесь безусловно печаталось `skillsOf(id)`, то есть `laser, blink, jump`
   * или `smash, charge, jump`. Существу с набором из грамматики это называло
   * ЧЕТЫРЕ глагола, ни одного из которых у него нет: настоящие зовутся
   * `k1..k3` и стоят двумя блоками ниже, в YOUR SKILLS.
   *
   * Ровно та ошибка, ради которой в `skillsFor` уже стоит развилка по киту, —
   * и ровно тот вред, который она предотвращает: модель, прочитавшая про
   * `laser`, пишет `api.use('laser')`, получает молчаливый false и не
   * понимает, почему её умения не работают.
   */
  const who = mine ? 'YOUR BODY' : 'YOUR OPPONENT\'S BODY';
  /* Метка — «своё тело» или «чужое», а не имя стороны: числа больше не
     принадлежат стороне арены, и метка, называющая сторону, врала бы о том,
     откуда они взялись. */
  const lbl = (field) => `body.${mine ? 'own' : 'enemy'}.${field}`;
  /*
   * ВЫСОТА ПРЫЖКА — ТОЛЬКО ТОМУ, КОМУ ЕСТЬ ЧЕМ ПРЫГАТЬ.
   *
   * Это ось телосложения, за неё платят очками, и без неё нельзя посчитать,
   * проходит ли наземная доставка под тобой: дуга прыжка — `4·h·u·(1−u)`, и
   * без `h` порог `AIRBORNE_DODGE_MIN` не с чем сравнить.
   *
   * Но оторваться от земли может только доставка `jump`: у эталонной фикстуры
   * §1 она есть всегда, у набора — если куплена. Тому, у кого её нет, строка
   * называла бы число, которым нечего сделать, и подсказывала бы глагол,
   * которого у бойца нет, — ровно тот вред, что D160 нашёл в строке `skills`.
   */
  const canHop = kit
    ? Object.values(kit).some((d) => d.kind === 'jump')
    : skillsOf(referenceTagOf(fixtureTag)).some((nm) => SKILLS[nm]?.kind === 'hop');
  const hop = canHop
    ? `\n  hop height          ${q(lbl('jumpHeight'), f.jumpHeight)} m at the top of the arc`
    : '';
  return `${who}

  hp                  ${q(lbl('hp'), f.hp)}
  collision radius    ${q(lbl('radius'), f.radius)} m
  top speed           ${q(lbl('maxSpeed'), f.maxSpeed)} m/s
  acceleration        ${q(lbl('accel'), f.accel)} m/s^2   (so ${q(lbl('maxSpeed'), f.maxSpeed)} m/s is reached in ${q(lbl('timeToTopSpeed'), f.maxSpeed / f.accel)} s)
  turn rate           ${q(lbl('turnRate'), f.turnRate)} rad/s  (a half turn takes ${q(lbl('halfTurnSeconds'), Math.PI / f.turnRate)} s)
  mass                ${q(lbl('mass'), f.mass)}        (the heavier body yields less when they collide)${hop}
  skills              ${kit ? Object.keys(kit).join(', ') : skillsOf(referenceTagOf(fixtureTag)).join(', ')}

Movement direction and facing are independent: a body can walk in one direction
while pointing in another. Facing turns toward what you asked for at the turn
rate above; it never snaps.`;
}

// ---------------------------------------------------------------------------
// 4. skills
// ---------------------------------------------------------------------------

/**
 * Другая СТОРОНА арены. Только сторона — то есть цвет, под которым боец сидит
 * в матче.
 *
 * Раньше эта функция отвечала на вопрос «кто напротив» в смысле вида, и по
 * ответу брались чужие характеристики. Теперь она нужна ровно для двух вещей:
 * выбрать эталонную фикстуру §1 для той стороны, у которой нет набора, и
 * назвать `p.self.id`. Числа обоих тел приезжают телосложениями и к стороне
 * отношения не имеют.
 */
const opponentOf = (id) => (id === 'blue' ? 'orange' : 'blue');

/**
 * Одно умение эталонной фикстуры §1, с его настоящей геометрией.
 *
 * @param {string} name    имя умения в `SKILLS`
 * @param {object} me      боевая запись ТОГО, КТО ПРИМЕНЯЕТ
 * @param {object} you     боевая запись ТОГО, ПО КОМУ ПРИМЕНЯЮТ
 * @param {string} youLbl  префикс метки для чисел цели ('body.own' | 'body.enemy')
 *
 * `me`/`you` передаются, а не берутся по `s.owner`: досягаемость луча и ширина
 * конуса считаются от радиусов ДВУХ конкретных тел, и раньше на их месте
 * стояли две литеральные записи архетипов. В блоке чужих умений применяющий —
 * соперник, а цель — я, поэтому пара приходит перевёрнутой.
 */
function skillBlock(name, me, you, youLbl) {
  const s = SKILLS[name];
  // Every duration below goes through `p` (a phase) or `servedCountdown` (an
  // accumulator) rather than reading `s` directly, because config's figure and
  // the world's figure are not the same number. See `served` above.
  const p = served(name);
  const L = [];
  const push = (k, v) => L.push(`  ${k.padEnd(20)}${v}`);
  const lbl = (field) => `skills.${name}.${field}`;
  push('cooldown', `${q(lbl('cooldown'), servedCountdown(s.cooldown))} s, counted from the moment it starts`);

  if (name === 'laser') {
    /*
     * The muzzle offset, the beam's margin and the surface rule are disclosed
     * alongside the range because without them the range is a lie by omission.
     * The sim fires from `radius + 0.2` ahead of the centre and counts a hit
     * when the target's SURFACE enters the beam, which puts the last hitting
     * centre-to-centre distance well beyond the range field — by the muzzle
     * offset, the target's radius and the beam's margin, all three of which are
     * spelled out below — so a brain holding station just outside the range
     * number is standing inside the weapon. The 0.2 has no name in config; it
     * exists only at the call site in `sim.js` (resolveStrike), so it is
     * spelled out rather than imported.
     *
     * Оба радиуса — радиусы ДВУХ ЭТИХ ТЕЛ. Стояли записи архетипов, то есть
     * досягаемость считалась по чужому телу всегда, когда телосложение
     * отличалось от литерала.
     */
    const muzzle = me.radius + 0.2;
    push('cast', `${q(lbl('windup'), p.windup)} s, then the beam fires, then ${q(lbl('recover'), p.recover)} s of recovery`);
    push('damage', q(lbl('damage'), s.damage));
    push('muzzle', `the beam starts ${q(lbl('muzzle'), muzzle)} m ahead of your centre, along your facing, not at your centre`);
    push('range', `${q(lbl('range'), s.range)} m of beam, measured from the muzzle`);
    push('beam', `a straight line carrying ${q('beam.radius', BEAM_RADIUS)} m of margin around itself. A body is hit when its SURFACE enters that margin, so it is hit while its centre is still off the line. The beam stops at the first block, wall or body it meets`);
    push('reach', `${q(lbl('maxHitDistance'), muzzle + s.range + you.radius + BEAM_RADIUS)} m between the two centres, at the very most: ${q(lbl('muzzle'), muzzle)} of muzzle + ${q(lbl('range'), s.range)} of beam + the ${q(`${youLbl}.radius`, you.radius)} radius of the body it is aimed at + ${q('beam.radius', BEAM_RADIUS)} of margin`);
    push('aim', `the beam leaves along your facing AT THE INSTANT IT FIRES, not at the instant you ordered it. You keep turning through the cast, at the reduced rate below`);
    push('line of sight', 'required — a block between you and the target eats the beam');
    /*
     * Height is not a term in the beam's hit test at all, while it IS one in
     * the smash's, and the prompt used to state the smash's rule and stay
     * silent here. Two brains read that silence in opposite directions:
     * brains/l6/octopus.js withholds shots at an airborne target ("jump lasts
     * ~0.71s") and brains/l1/gorilla.js hops through the beam on purpose. Both
     * from the same text; one of them is wrong, and no measurement was open to
     * either of them.
     */
    push('height', 'not consulted — a body off the ground is hit exactly like one on it');
    push('while casting', `your top speed is multiplied by ${q(lbl('moveScale'), s.moveScale)} and your turn rate by ${q(lbl('turnScale'), s.turnScale)}`);
    push('interrupt', 'any impact that knocks you back — a charge or a smash — cancels it, and the cooldown is already spent');
  }
  if (name === 'blink') {
    push('effect', `you are instantly somewhere up to ${q(lbl('distance'), s.distance)} m away, along a direction you pass in`);
    push('walls', 'the teleport crosses blocks and walls; the landing point never ends inside one — it is pulled back along the line until it is clear');
    push('invulnerable', `${q(lbl('iframes'), servedCountdown(s.iframes))} s from the moment you land: all damage against you in that window does nothing`);
    push('recovery', `${q(lbl('recover'), p.recover)} s during which nothing else can be started`);
    push('argument', 'api.use("blink", dx, dz) — dx,dz is a direction and does not need to be normalised. With no argument it goes along your facing');
  }
  if (name === 'smash') {
    /*
     * Both of the cone's real edges are wider than its two config fields.
     * Range is tested against the target's SURFACE, and a circular body is
     * accepted whenever any part of it is inside the arc — `inCone` widens by
     * asin(targetR / d), which is worth another ten-odd degrees at full
     * extension and two to three times that with the bodies touching.
     * Disclosing the config half-angle alone described a cone nobody has, and
     * the difference is largest exactly where the fight is decided, in contact.
     *
     * НАСКОЛЬКО ШИРЕ — ЗАВИСИТ ОТ ТЕЛА ЦЕЛИ, поэтому обе величины считаются от
     * переданных телосложений. Прежде тут стояли две записи архетипов, и
     * существу с другим радиусом называлась чужая ширина конуса.
     */
    const reach = s.range + me.radius + you.radius;
    const touching = me.radius + you.radius;
    const widened = (d) => s.halfAngle + Math.asin(you.radius / d);
    push('wind-up', `${q(lbl('windup'), p.windup)} s, then it lands, then ${q(lbl('recover'), p.recover)} s of recovery`);
    push('damage', q(lbl('damage'), s.damage));
    push('shape', `a cone ${q(lbl('halfAngleDeg'), s.halfAngle, deg)} degrees either side of your facing, reaching ${q(lbl('range'), s.range)} m past your own radius`);
    push('reach', `that range is measured to their SURFACE, not to their centre, so the farthest centre-to-centre hit on the body it is aimed at is ${q(lbl('maxHitDistance'), reach)} m`);
    push('width', `a body counts as inside the cone when ANY PART of it is, so the accepted half-angle grows by asin(their radius / distance): against the body it is aimed at that is ${q(lbl('halfAngleAtReachDeg'), widened(reach), deg)} degrees at that farthest distance and ${q(lbl('halfAngleAtContactDeg'), widened(touching), deg)} degrees when the two of you are touching`);
    push('aim', 'the cone is measured from your facing AT THE INSTANT IT LANDS, not when you ordered it');
    push('knockback', `${q(lbl('knockback'), s.knockback)} m/s pushed away from you, decaying at ${q('physics.knockbackDrag', KNOCKBACK_DRAG)} m/s^2`);
    push('airborne', 'it sweeps the ground — a body that is off the ground when it lands takes nothing');
    push('while winding up', `your top speed is multiplied by ${q(lbl('moveScale'), s.moveScale)} and your turn rate by ${q(lbl('turnScale'), s.turnScale)}`);
    push('uninterruptible', 'nothing your opponent can do cancels it once it is ordered');
  }
  if (name === 'charge') {
    push('wind-up', `${q(lbl('windup'), p.windup)} s. Your facing at the END of the wind-up is the direction you will travel, and it cannot be changed after that`);
    push('dash', `${q(lbl('dashSpeed'), s.dashSpeed)} m/s for up to ${q(lbl('dashSeconds'), p.dashSeconds)} s, so up to ${q(lbl('dashDistance'), s.dashSpeed * p.dashSeconds)} m`);
    push('ends', 'on contact with the enemy, or on contact with a block or wall, or when the time runs out');
    push('damage', `${q(lbl('damage'), s.damage)} on contact`);
    push('impact', `${q(lbl('knockback'), s.knockback)} m/s of knockback (decaying at ${q('physics.knockbackDrag', KNOCKBACK_DRAG)} m/s^2) and ${q(lbl('stun'), servedCountdown(s.stun))} s of stun, and it cancels whatever the target was casting`);
    push('recovery', `${q(lbl('recover'), p.recover)} s after it ends, during which nothing else can be started`);
    push('while winding up', `your top speed is multiplied by ${q(lbl('moveScale'), s.moveScale)} and your turn rate by ${q(lbl('turnScale'), s.turnScale)}`);
    push('uninterruptible', 'nothing stops it once the wind-up has finished');
  }
  if (name === 'jump') {
    push('wind-up', `${q(lbl('windup'), p.windup)} s crouch, during which your top speed is multiplied by ${q(lbl('moveScale'), s.moveScale)} and your turn rate by ${q(lbl('turnScale'), s.turnScale)}`);
    push('airborne', `${q(lbl('airborne'), p.airborne)} s off the ground, then ${q(lbl('recover'), p.recover)} s landing`);
    push('control', `your horizontal velocity is frozen at take-off and carries you: whatever you were moving at when you left the ground is where you land. You cannot change it, and you cannot start anything, until you land. You can still turn, at ${q(lbl('turnScale'), s.turnScale)} of your turn rate`);
    push('effect', 'a ground sweep passes underneath you');
  }
  return `${name}\n${L.join('\n')}`;
}

/**
 * Свои умения: набор §8, если он есть, иначе эталонная фикстура §1 по тегу.
 *
 * Фикстура остаётся ради шести эталонных мозгов в `brains/`, написанных против
 * имён `laser/blink/smash/charge/jump`. Это стенд замера, а не архетип: она
 * ничего не даёт существу и выбирается по стороне (через мост
 * `referenceTagOf`) только тогда, когда набора нет вовсе.
 */
function skillsFor(tag, kit, mine, theirs) {
  if (kit) return `YOUR SKILLS\n\n${kitBlocks(kit, mine, theirs, 'own', 'body.enemy')}\n\n${KIT_IS_NOT_YOURS}`;
  return `YOUR SKILLS\n\n${skillsOf(referenceTagOf(tag)).map((nm) => skillBlock(nm, mine, theirs, 'body.enemy')).join('\n\n')}`;
}

/** Умения соперника. Применяющий — он, цель — я, поэтому пара перевёрнута. */
function enemySkillsFor(tag, enemyKit, theirs, mine) {
  const head = "YOUR OPPONENT'S SKILLS\n\nThe same numbers, disclosed to both sides.\n\n";
  if (enemyKit) return head + kitBlocks(enemyKit, theirs, mine, 'enemy', 'body.own');
  return head + skillsOf(referenceTagOf(tag)).map((nm) => skillBlock(nm, theirs, mine, 'body.own')).join('\n\n');
}

/**
 * ОГРАНИЧЕНИЕ С ЕГО ПРИЧИНОЙ: ДАЛЬНОСТЬ НЕ ВПИСЫВАЕТСЯ ЧИСЛОМ.
 *
 * ── что было измерено ───────────────────────────────────────────────────────
 *
 * 77 мозгов в `data/airena.db` с набором и исходником. 61 из них сравнивает
 * `dist` с ВПИСАННЫМ ЧИСЛОМ (`dist <= 4.616`, `dist >= 3.501` — это КУВАЛДА,
 * `c_3aa2bb0f-f14`). Читают `p.self.kit` пятнадцать, и все пятнадцать — наши:
 * одиннадцать `kit-stub` и четыре «рукописный эталон». Из 62 мозгов,
 * НАПИСАННЫХ МОДЕЛЬЮ, — НИ ОДИН.
 *
 * Причина не в модели. `brainPrompt` не произносил слова «kit» ни разу:
 * `grep -c kit` по отрендеренному промпту давал 0. Поле `p.self.kit` существует
 * в `sim.js` (`kitView`) с тех пор, как появилась F10, и мозгу о нём не
 * говорили — а правило №1 этого файла звучит так: «модель не может позвать то,
 * о существовании чего ей не сказали». Она и не звала: она переписывала числа
 * из таблицы умений в исходник, потому что другого места взять их не было.
 *
 * И тогда обещание F10 — «смена кита НИКОГДА не требует регенерации мозга» —
 * держалось только на том, что кит не меняли. Меняют — и `4.616` описывает
 * набор, которого у бойца больше нет.
 *
 * ── почему текст такой ──────────────────────────────────────────────────────
 *
 * Это ограничение (не вписывай) со своей причиной (набор меняют, тебя — нет),
 * то есть категория 2 правила редактирования. Ни слова о том, КАКУЮ дистанцию
 * держать: доктрина дистанции — это тактика, её пишет модель, и подсказка здесь
 * стоила бы ровно того замера, ради которого весь файл так устроен.
 *
 * Живёт только в промпте существа с набором — у эталонной фикстуры §1
 * `kitView` возвращает null, и абзац про поле, которого у неё нет, был бы
 * неправдой. Заодно `brainPrompt(id)` остаётся байт-в-байт прежним, а на нём
 * стоят и хеш провенанса в `tools/bracket.mjs`, и кэш вердиктов
 * `tools/tactics-verdicts.json`.
 */
const KIT_IS_NOT_YOURS = `The cards above are the verbs you are holding as this is written: the three
your creature bought, and there is no fourth. The three can be exchanged for
three others between one match and the next, and you are NOT rewritten when
they are: the same program you are writing now runs with the new set. So a
range copied out of the table above and typed into your source as a number
describes a skill you may no longer have, and nothing will tell you it has
stopped being true.

The live figures are in perception, under p.self.kit, keyed by the same names
api.use takes; the opponent's are under p.enemy.kit. They are rebuilt for every
thought, from the set actually equipped. Their windup, recover and cooldown are
the DECLARED figures — the ones the ability was compiled with — while the cards
above print the SERVED ones, which is what the world runs: a phase ends on the
first step at or past its length, and a countdown is subtracted one step at a
time until it crosses zero. The two never differ by a whole step of the world's
clock, and the served figure is the one a fighter experiences.`;

/**
 * A skill built out of the §8 grammar, described the way the four hardcoded
 * ones are: what it costs in time, what it does, and how far it reaches.
 *
 * The same four kinds of line the rest of this file is allowed (a capability,
 * a constraint with its reason, a fact about the world, the objective) —
 * `checktactics` sweeps this text too, and a tactical hint here would fail it
 * exactly as it would anywhere else.
 *
 * Durations are served through `servedCountdown` for the same reason as
 * everywhere else in this file: config's figure and the world's figure are
 * not the same number, and the model is told the world's.
 */
/*
 * THE CARDS ARE FUNCTIONS OF THE COMPILED ABILITY AND THE TWO BODIES (07.09).
 *
 * They were one-line glosses, and the audit of 07.09 found them false or
 * silent in twenty-six places: no angle for the fan, no invulnerability
 * figure for the blink, a lunge described as travel that was a teleport, a
 * mortar "you name where it lands" when only a distance along the facing was
 * taken, "nothing flies" printed next to a bolt at 22 m/s. Every number below
 * now comes from the def or from config through `n()`, and every sentence
 * describes what `deliver.js`, `effects.js` and `sim.js` do — measured by
 * `tools/checkbehaviour.mjs` where it can be measured.
 */
function deliveryLine(d, me, you, K) {
  /* A function, not a value: `q` records what it emits, so a constant computed
     eagerly here would be reported as emitted by every delivery — including the
     four whose text never mentions it, which would make the whitelist in
     `tools/checkprompt.mjs` a description of this file's control flow rather
     than of the document. */
  const air = () => q('airborne.dodgeMin', AIRBORNE_DODGE_MIN);
  switch (d.kind) {
    case 'beam':
      return `a straight line from your muzzle — ${q(K('muzzle'), me.radius + BEAM_MUZZLE)} m ahead of your centre — along your facing at the strike. It stops at the first block, wall or body it meets, and a body is hit when its surface enters the ${q('beam.radius', BEAM_RADIUS)} m of margin the line carries. A wall YOU raised does not stop it; a wall they raised does. Height is not consulted: a body in the air is hit like one on the ground`;
    case 'cone':
      return `a wedge from your centre, ${q(K('halfAngleDeg'), d.halfAngle, deg)} degrees either side of your facing at the strike, measured to the other body's CENTRE, reaching ${q(K('range'), d.range)} m to its surface. It needs a clear centre-to-centre line, and it sweeps the FLOOR: a body above ${air()} m when it lands takes nothing`;
    case 'bolt':
      return `a projectile released at the strike from ${q(K('muzzle'), me.radius + PROJECTILE_MUZZLE)} m ahead of your centre, along your facing at the strike, at ${q(K('speed'), d.speed)} m/s. It connects with a body whose centre comes within ${q(K('touch'), you.radius + PROJECTILE_TOUCH)} m of it, and a body inside its invulnerability window consumes the shot rather than letting it through. A block, an arena wall or a wall THEY raised ends it, and that ending announces nothing; a wall you raised yourself does not stop it. From the moment it is released it is listed in p.arena.projectiles, for both sides`;
    case 'lob':
      return `a projectile released at the strike from ${q(K('muzzle'), me.radius + PROJECTILE_MUZZLE)} m ahead of your centre, at ${q(K('speed'), d.speed)} m/s, toward a landing spot whose direction AND distance are both read at the strike, from where you stand then, whatever the wind-up took you through; it touches nothing on the way — bodies, blocks, walls. WHERE it lands is yours to name: the point you pass in api.use(name, {x, z}), or a lone number api.use(name, metres) as a distance along your facing, or, with neither, the enemy's distance along your facing at the strike. The spot is clamped at the strike: never nearer than ${q(K('nearBound'), me.radius + d.splash)} m, never past ${q(K('range'), d.range)} m, never nearer the arena's edge than ${q(K('splash'), d.splash)} m. On landing a circle of ${q(K('splash'), d.splash)} m catches a body whose centre is within that plus its own radius; an empty circle is a 'missed' with reason 'aim'. A PAIR of numbers is a direction, not a distance`;
    case 'zone':
      return `a disc of ${q(K('radius'), d.radius)} m placed where the strike reads it, from where you stand then and not where you ordered it — on the point you pass in api.use(name, {x, z}), clamped to ${q(K('range'), d.range)} m, or with no point along your facing at the enemy's distance or ${q(K('range'), d.range)} m, whichever is shorter. It works for ${q(K('duration'), d.duration)} s: on the step it lands and every ${q('zone.period', ZONE_PERIOD)} s after, ${q(K('zoneTicks'), d.zoneTicks)} ticks in all, each applying the per-tick figures on this card to a body whose centre is within the disc plus its own radius and which is not above ${air()} m. Damage and fire tick; a control the disc carries is applied ONCE per cast per body, on the first tick that body is inside it, for the whole duration on this card — the later ticks do not attempt it and announce nothing. A new cast of this ability removes your previous disc from it; a side has at most one disc per ability on the floor`;
    case 'dash':
      return `at the end of the wind-up your heading locks and your body travels ${q(K('distance'), d.distance)} m along it at ${q(K('dashSpeed'), d.dashSpeed)} m/s — ${q(K('travelSeconds'), d.distance / d.dashSpeed)} s of travel — and stops the moment it reaches a body, a block or a wall. A body whose centre is within ${q(K('sweepWidth'), me.radius + you.radius)} m of your path is hit on contact, unless it is above ${air()} m, in which case you pass underneath. You cannot turn or steer during the travel. A stun landing on you, or an impulse arriving on top of what you carried into the travel, ends the travel where you stand — and the impulse then moves you normally`;
    case 'blink':
      return `your body is moved up to ${q(K('distance'), d.distance)} m on the step you order it — toward the point you pass in api.use(name, {x, z}), stopping at it; or along the direction pair you pass; or along your facing — never ending inside a block. You are invulnerable for ${q(K('iframes'), servedCountdown(d.iframes))} s from the landing; your velocity is cut to ${q('blink.velocityKeep', BLINK_VELOCITY_KEEP)} of what it was. No wind-up, so nothing telegraphs it`;
    case 'self':
      return 'at the strike its effects happen to you, where you stand';
    case 'jump':
      return `a crouch, ${q(K('airborne'), servedDef(d).airborne)} s in the air, a landing. Its effects apply at take-off. Nothing can be ordered from the crouch to the end of the landing, and your horizontal velocity is frozen at take-off. Above ${air()} m — most of the airborne phase — a fan, a disc's tick and a lunge pass underneath you; a beam, a bolt and a mortar hit exactly as on the ground`;
    default:
      return '';
  }
}

/**
 * One effect as it is compiled on THIS ability: the magnitude and the duration
 * printed are the per-cast (or, for a disc, per-tick) figures the world will
 * apply, after the effect-count share and the shape's premium.
 */
function effectLine(e, d, K) {
  const E = (field) => K(`effect.${e.id}.${field}`);
  const dur = e.duration ? `${q(E('duration'), e.duration)} s` : '';
  const tick = d.kind === 'zone' ? ' per tick' : '';
  /* Lazy for the same reason `air` is in `deliveryLine`: a `q` call evaluated
     for every effect would report the drag as emitted by a heal. */
  const drag = () => q('physics.knockbackDrag', KNOCKBACK_DRAG);
  const travel = (mag) => `${q(E('travel'), Math.round(((mag * mag) / (2 * KNOCKBACK_DRAG)) * 100) / 100)} m`;
  /* The ceiling on an impulse's travel, and why the body stops short of it:
     the slot is zeroed the moment it decays under `KNOCKBACK_MIN`, and the
     world integrates position in whole steps. */
  const shade = () => `a shade under ${travel(e.mag)} of travel whatever the body weighs or wants — the impulse is dropped to zero the moment it decays below ${q('physics.knockbackMin', KNOCKBACK_MIN)} m/s, and the world moves the body in whole steps`;
  switch (e.id) {
    case 'damage': return `takes ${q(E('mag'), e.mag)} hp off what it hits${tick}`;
    case 'burn': return `sets what it hits on fire at ${q(E('mag'), e.mag)} hp per second for ${dur}; fire goes through a shield's absorption last of all and ignores both damage channels; a second fire on a burning body adds its length to the time still burning, up to twice its own length, and keeps the stronger rate; a disc's ticks keep its fire alive rather than lengthening it`;
    case 'knock': return `an impulse of ${q(E('mag'), e.mag)} m/s on what it hits, away from you, added to whatever impulse it already carries and decaying at ${drag()} m/s² — ${shade()}; a cancellable wind-up it lands on is cancelled, and a lunge it lands on stops travelling`;
    case 'pull': return `an impulse of ${q(E('mag'), e.mag)} m/s on what it hits, toward you, added to whatever impulse it already carries and decaying at ${drag()} m/s² — ${shade()}; a cancellable wind-up it lands on is cancelled, and a lunge it lands on stops travelling`;
    case 'stun': return `for ${dur} the target cannot move, turn or start an ability, a cancellable wind-up it lands on is cancelled with its cooldown spent, and a lunge it lands on stops travelling; it arms 'act' and 'move' immunity from the moment it lands until ${q(E('window'), (e.duration || 0) + e.immune)} s later — that is the ${dur} plus ${q(E('immune'), e.immune)} s — so a second stun inside it is refused, not added`;
    case 'root': return `for ${dur} the target cannot move; it can turn and act, and an impulse still moves it; it arms 'move' immunity from the moment it lands until ${q(E('window'), (e.duration || 0) + e.immune)} s later — the ${dur} plus ${q(E('immune'), e.immune)} s`;
    case 'shield': return `${q(E('mag'), e.mag)} hp of absorption before hp, for ${dur}, against ability damage and fire, not against the arena's burn; a second shield keeps the larger figure and the later time; visible as p.self.shield and p.enemy.shield`;
    case 'heal': return `puts back ${q(E('sharePct'), Math.round((e.share ?? 1) * 100))}% of the hp you are missing, never less than ${q(E('floor'), e.floor ?? 0)} and never more than ${q(E('mag'), e.mag)}, never above maximum`;
    case 'cleanse': return 'removes fire, root, blindness, silence, stun and every weaken from you; not a shield, not a boost, not an immunity';
    case 'blind': return `for ${dur} the target's p.enemy block — position, velocity, dist, visible, casting — is the one from ${q('blind.lagSeconds', BLIND_LAG_TICKS / TICK_HZ)} s ago, and its p.self.blinded is true; it arms 'sense' immunity from the moment it lands until ${q(E('window'), (e.duration || 0) + e.immune)} s later — the ${dur} plus ${q(E('immune'), e.immune)} s`;
    case 'silence': return `for ${dur} the target's api.use is refused with reason 'silenced' — except an aura, blink or leap of theirs that carries a cleanse — and a cancellable wind-up it lands on is cancelled; it arms 'act' immunity from the moment it lands until ${q(E('window'), (e.duration || 0) + e.immune)} s later — the ${dur} plus ${q(E('immune'), e.immune)} s`;
    case 'wall': {
      const [w, dd] = (e.size || EFFECTS.wall.size || [4, 1]);
      return `a block ${q('wall.ahead', WALL_AHEAD)} m ahead of you along your facing, ${q(E('width'), w)} m wide, ${q(E('thickness'), dd)} m thick and ${q('wall.height', WALL_RAISED_HEIGHT)} m tall, for ${dur}. The box is axis-aligned and does not rotate with you: it snaps to whichever of X and Z your facing is nearer, so the width lies across that axis and the thickness along it. It stops bodies, lunges, lines of sight and the ENEMY's beams and bolts; your own beam and your own bolt pass through it; a mortar and a disc pass over it. It is built whether or not the delivery carrying it connected — a bolt stopped by cover, a bolt that ran out of range and a mortar that landed on empty floor raise it as surely as a hit does. You keep at most one wall standing — a new one replaces it, whichever ability built it; it appears in p.arena.obstacles with 'until' and 'by'`;
    }
    case 'boost': return `multiplies your own ${CHANNEL_LINE[e.channel] || e.channel} by ${q(E('mag'), e.mag)} for ${dur}; a new boost on the same channel replaces it`;
    case 'weaken': return `multiplies the target's ${CHANNEL_LINE[e.channel] || e.channel} by ${q(E('mag'), e.mag)} for ${dur}; a new weaken on the same channel replaces it`;
    default: return '';
  }
}

const CHANNEL_LINE = {
  speed: 'top movement speed (shown live in p.self.maxSpeed)',
  turn: 'turn rate (shown live in p.self.turnRate)',
  damage: 'every hp figure your abilities deal, fire excepted',
  armor: 'a divisor on every hp figure dealt to you, fire excepted — above one means less gets through, below one more',
  cooldown: 'how fast your cooldowns count down',
  range: 'the range of your beam, fan, bolt, mortar and disc; not a lunge, not a blink',
  vision: 'above one, p.enemy.visible is true even through cover; below one, your p.enemy block lags behind the present',
};

/*
 * Строк про триггер больше нет: оси «триггер» нет.
 *
 * Каждое умение теперь начинается по решению мозга — `api.use(name)`. Если
 * нужно «в ответ на удар», мозг ловит `damaged` в `p.events` и зовёт умение
 * сам. Раньше это делала симуляция за него, и промпт объяснял мозгу, какие
 * из его умений он НЕ контролирует.
 */


/**
 * САМОЕ ДАЛЬНЕЕ ПОПАДАНИЕ ОТ ЦЕНТРА ДО ЦЕНТРА — то, чего в карточке набора не
 * было, и то единственное число, по которому выбирается дистанция.
 *
 * ── зачем оно здесь ─────────────────────────────────────────────────────────
 *
 * Захардкоженная пятёрка §1 получает эту строку с самого начала: у луча стоит
 * `reach`, у конуса `reach`, и докстринг наверху объясняет почему — «мозг,
 * держащийся сразу за числом дальности, стоит ВНУТРИ оружия». Карточка
 * грамматики печатала только `range`, то есть ровно ту ошибку, ради поимки
 * которой написан `tools/checkbehaviour.mjs`, — и печатала её на пути, по
 * которому идут ВСЕ существа игроков, а не на эталонном стенде.
 *
 * Насколько велика разница, замерено двоичным поиском по попаданию (три пары
 * тел, 18 замеров, все совпали с формулами ниже до третьего знака):
 *
 *     конус  range 3.4  -> 4.9  м между центрами   (+44%)
 *     навес  range 15   -> 18.85 м                 (+26%)
 *     луч    range 24   -> 27.6 м                  (+15%)
 *
 * Занижение бьёт ровно в ту сторону, на которую жалуется основатель: боец,
 * которому сказали «3.4», подходит на 3.4 и ближе, чтобы наверняка достать
 * конусом, который доставал уже с 4.9.
 *
 * ── почему числа считаются, а не берутся из `d` ────────────────────────────
 *
 * Слагаемые — радиусы ДВУХ КОНКРЕТНЫХ ТЕЛ и константы места вызова в
 * `deliver.js`, у которых нет имени в конфиге (0.2 и 0.4 у луча, 0.3 и 0.35 у
 * снаряда). Ровно та же развилка, что у `skillBlock` выше: там они тоже
 * выписаны, а не импортированы.
 *
 * Полёт снаряда квантуется теми же тиками, что и фазы: он живёт `range/speed`
 * секунд, а мир вычитает по тику, пока жизнь не уйдёт в ноль, — поэтому
 * пролетает он `ceil` тиков, а не ровно свою дальность. Та же поправка, что
 * `served` делает для длительностей, и по той же причине.
 *
 * @param {object} d    скомпилированное умение набора
 * @param {object} me   боевая запись ТОГО, КТО ПРИМЕНЯЕТ
 * @param {object} you  боевая запись ТОГО, ПО КОМУ ПРИМЕНЯЮТ
 * @returns {?string} строка карточки, либо null — у доставок без цели
 *   (`blink`, `self`, `jump`) дальности попадания не существует, и строка,
 *   называющая её, описывала бы геометрию, которой у умения нет.
 */
function reachLine(d, me, you, K, youLbl) {
  const at = (label, v, tail) => `${q(K(label), v)} m between the two centres, at the very most: ${tail}`;
  const theirR = q(`${youLbl}.radius`, you.radius);
  if (d.kind === 'beam') {
    const muzzle = me.radius + BEAM_MUZZLE;
    return at('reach', muzzle + d.range + you.radius + BEAM_RADIUS,
      `the beam starts ${q(K('muzzle'), muzzle)} m ahead of your centre along your facing, runs ${q(K('range'), d.range)} m from there, `
      + `carries ${q('beam.radius', BEAM_RADIUS)} m of margin, and connects on their SURFACE — so ${theirR} m of their radius counts too`);
  }
  if (d.kind === 'cone') {
    return at('reach', d.range + you.radius,
      `the range is measured to their SURFACE, so ${theirR} m of their radius is added to it. Your own radius is NOT: `
      + 'the wedge is measured from your centre');
  }
  if (d.kind === 'bolt') {
    const muzzle = me.radius + PROJECTILE_MUZZLE;
    /* Сколько тиков живёт снаряд: мир вычитает по тику, пока `life > 0`. */
    const ticks = Math.ceil((d.range / d.speed) / TICK - 1e-9);
    const flight = ticks * d.speed * TICK;
    return at('reach', muzzle + flight + you.radius + PROJECTILE_TOUCH,
      `it leaves ${q(K('muzzle'), muzzle)} m ahead of your centre, flies ${q(K('flight'), flight)} m — its range rounded UP to whole steps of the world — `
      + `and touches them when it comes within ${q(K('touch'), you.radius + PROJECTILE_TOUCH)} m of their centre`);
  }
  /*
   * У НАВЕСА ДВЕ ГРАНИЦЫ, И БЛИЖНЯЯ ВАЖНЕЕ ДАЛЬНЕЙ.
   *
   * Дальняя складывается так же, как у всех: предел умения плюс круг падения
   * плюс радиус цели. Ближняя — своя, и она есть ТОЛЬКО у навеса: `lobLanding`
   * не даёт положить его ближе `свой радиус + splash`, потому что иначе круг
   * накрыл бы кастера. Печатается вместе с дальней, одной строкой: порознь они
   * читаются как два независимых числа, а это один отрезок.
   */
  if (d.kind === 'lob') {
    const near = me.radius + d.splash;
    return `${q(K('reach'), d.range + d.splash + you.radius)} m between the two centres at the very most — your range `
      + `${q(K('range'), d.range)} m plus the ${q(K('splash'), d.splash)} m of splash plus their ${theirR} m of radius — and it will not land `
      + `nearer to you than ${q(K('nearBound'), near)} m, your own radius plus that splash, whatever distance you ask for`;
  }
  if (d.kind === 'zone') {
    return at('reach', d.range + d.radius + you.radius,
      `the disc lands on your aim point clamped to your range, or with no point along your facing at their distance or your range, whichever is SHORTER, and it works on a body whose `
      + `centre is within ${q(K('radius'), d.radius)} m of the disc plus their own ${theirR} m of radius`);
  }
  if (d.kind === 'dash') {
    return at('reach', d.distance + me.radius + you.radius,
      `you sweep ${q(K('distance'), d.distance)} m and everything within ${q(K('sweepWidth'), me.radius + you.radius)} m of that line — your radius plus theirs — is hit`);
  }
  return null;
}

/**
 * @param {object} kit  скомпилированный набор
 * @param {object} me   тело ТОГО, ЧЕЙ ЭТО НАБОР
 * @param {object} you  тело ТОГО, ПО КОМУ ОН ПРИМЕНЯЕТСЯ
 *
 * `me`/`you` приезжают, а не берутся из набора, по той же причине, что и в
 * `skillBlock`: досягаемость складывается из радиусов ДВУХ конкретных тел, и в
 * блоке чужих умений пара приходит перевёрнутой.
 */
function kitBlocks(kit, me, you, side, youLbl) {
  return Object.entries(kit).map(([name, d]) => {
    const K = (field) => `kit.${side}.${name}.${field}`;
    const L = [];
    const push = (k, v) => L.push(`  ${k.padEnd(20)}${v}`);
    const ph = servedDef(d);
    push('cooldown', `${q(K('cooldown'), servedCountdown(d.cooldown))} s, counted from the step the order is applied; the wind-up and the recovery run inside it`);
    if (d.kind === 'dash') push('cast', `${q(K('windup'), ph.windup)} s of wind-up, then ${q(K('travelSeconds'), d.distance / d.dashSpeed)} s of travel, then ${q(K('recover'), ph.recover)} s of recovery`);
    else if (d.windup > 0) push('cast', `${q(K('windup'), ph.windup)} s of wind-up, then it lands, then ${q(K('recover'), ph.recover)} s of recovery`);
    else push('cast', `it lands immediately, then ${q(K('recover'), ph.recover)} s of recovery`);
    /* THE RECOVERY IS SLOWED AS MUCH AS THE WIND-UP (review r1, F9). The sim
       scales speed and turn by the ability's figures for the WHOLE act
       (`moveStep`, `defOf(me, me.act.id)`), and this line named only the
       wind-up — so the committed time a mind reads off the card was half of
       the committed time it gets. */
    /* WHEN the scales apply, and it is not only the wind-up: `moveStep` reads
       the ability's figures for the WHOLE act, so the recovery is slowed as
       much as the cast is (review r1, F9). The two phases that drive the body
       themselves are named, because there the scale is not what decides. */
    const scaleWhen = d.kind === 'dash'
      ? 'through the wind-up and through the recovery; during the travel you neither steer nor turn'
      : (d.kind === 'jump'
        ? 'through the crouch and through the landing; in the air your velocity is the one you took off with'
        : 'for the whole act — the recovery is slowed as much as the wind-up');
    if (d.windup > 0) push('while casting', `your top speed is multiplied by ${q(K('moveScale'), d.moveScale)} and your turn rate by ${q(K('turnScale'), d.turnScale)} ${scaleWhen}; a stun, a silence or an impulse that lands during the wind-up ${d.interruptible ? 'cancels it, and the cooldown is already spent' : 'does not cancel it'}`);
    const held = d.windup > 0 ? ', and it holds for the whole wind-up' : '';
    push('aim', d.aim === 'point' ? `a point: api.use(name, {x, z}) — it lands on or goes toward the point${held}`
      : (d.aim === 'facing' ? `your facing at the strike: api.use(name, {x, z}) turns you toward the point at your turn rate${held}` : 'none — a point handed to it turns you not at all and changes nothing'));
    push('delivery', `${d.kind} — ${deliveryLine(d, me, you, K)}`);
    if (d.range !== undefined) push('range', `${q(K('range'), d.range)} m`);
    if (d.radius !== undefined) push('radius', `${q(K('radius'), d.radius)} m`);
    if (d.distance !== undefined) push('distance', `${q(K('distance'), d.distance)} m`);
    if (d.speed !== undefined) push('speed', `${q(K('speed'), d.speed)} m/s`);
    /* Радиус поражения навеса в точке падения. Без него `reach` ниже — сумма,
       одно слагаемое которой нигде не названо, а ближняя граница броска
       (свой радиус + splash) вообще не выводима. */
    if (d.splash !== undefined) push('splash', `${q(K('splash'), d.splash)} m around the point it lands on`);
    if (d.duration !== undefined && d.kind === 'zone') push('lasts', `${q(K('duration'), d.duration)} s on the ground`);
    /* Досягаемость — ПОСЛЕ всех своих слагаемых, чтобы читалась как их сумма,
       а не как ещё одно независимое число. См. `reachLine`. */
    const reach = reachLine(d, me, you, K, youLbl);
    if (reach) push('reach', reach);
    /*
     * D160: прыжок приезжает из грамматики, и его воздушная фаза — главное
     * число умения. Без этой строки модель видела бы доставку `jump` с
     * кулдауном и без единой цифры про то, СКОЛЬКО она будет в воздухе, —
     * то есть не могла бы решить, окупается ли уклонение простоем.
     */
    if (d.kind === 'jump') {
      push('airborne', `${q(K('airborne'), ph.airborne)} s off the ground, above ${q('airborne.dodgeMin', AIRBORNE_DODGE_MIN)} m for most of it`);
      push('landing', 'you get { type: \'landed\' } in p.events on the tick you touch down');
    }
    for (const e of d.effects) push(`effect ${e.id}`, effectLine(e, d, K));
    if (d.kind === 'zone') {
      const dmg = d.effects.find((e) => e.id === 'damage');
      if (dmg) push('whole disc', `a body that stands in it for every tick takes ${q(K('wholeDisc'), Math.round(dmg.mag * d.zoneTicks * 100) / 100)} hp`);
      /* The same total for a burn field, which was printed for damage only
         (review r1, F13). A field's ticks RENEW its fire rather than extending
         it, so what a body standing in it for the whole disc loses is the rate
         over the disc's life plus one fire's worth of afterburn. */
      const brn = d.effects.find((e) => e.id === 'burn');
      if (brn) {
        const secs = (d.zoneTicks - 1) * ZONE_PERIOD + brn.duration;
        push('whole disc', `a body that stands in it from the first tick to the last burns for ${q(K('burnSeconds'), Math.round(secs * 1000) / 1000)} s — ${q(K('tickSpan'), (d.zoneTicks - 1) * ZONE_PERIOD)} s from the first tick to the last, plus the ${q(K('effect.burn.duration'), brn.duration)} s that last tick renews — and loses ${q(K('wholeDiscBurn'), Math.round(brn.mag * secs * 100) / 100)} hp to the fire`);
      }
    }
    /* The name is what api.use takes. Nothing else is a legal argument. */
    return `${name}\n${L.join('\n')}`;
  }).join('\n\n');
}

// ---------------------------------------------------------------------------
// 4b. how the pieces interact (grammar kits only)
// ---------------------------------------------------------------------------

/**
 * The facts a mind was missing — every one of them a category-3 fact or a
 * category-1 capability, none a tactic. Written after the audit of 07.09
 * (`reports/combat/prompt-audit.md`), which found that the grammar half of
 * the prompt never said when the strike is read, that the wind-up is visible
 * to the other side, what a status stops, what stacks, or what is announced.
 * A mind handed a dictionary can only be as sharp as the dictionary.
 *
 * Only for kits: the reference fixture keeps its own prompt byte-identical.
 */
function interactions(me, you) {
  const ceiling = Math.max(...Object.values(DELIVERIES).map((d) => d.cooldown || 0));
  return `HOW THE PIECES INTERACT

One cast, in order. When your thought returns, the order is applied on that
same step, and the ability's cooldown starts on that step — the wind-up and
the recovery both run inside it. From the order to the end of the recovery your
body moves at the card's share of its top speed and turns at the card's share
of its turn rate: the recovery is slowed exactly as much as the wind-up. The
strike happens on the first step at or past the wind-up, and everything about
where it goes is read at THAT instant — your facing, your aim point, the
enemy's position for a disc or a mortar with no aim point — never at the
instant you ordered it. The recovery follows: nothing can be started until it
ends. No ability in this world, bought or free, has a cooldown longer than
${q('kit.cooldownCeiling', ceiling)} s.

The wind-up is visible to your opponent: their p.enemy.casting.telegraph is
true from their next thought until the strike, their casting.skill names the
ability, and their p.enemy.kit[skill] holds its numbers. Yours shows you the
same about them. casting.remaining counts down to the end of the RECOVERY; the
strike lands when casting.elapsed reaches the ability's wind-up.

What either of you does is seen by the other no earlier than the other's next
thought: perception is built for both sides before either side's orders are
applied, and one thought is ${q('think.every', THINK_EVERY)} steps.

Aiming. api.use(name, { x, z }) names a point on the ground. An aim point is a
LOCK for the whole wind-up: your body re-derives its heading from the point on
every step of the wind-up, and api.face or api.faceAt called on a later thought
is ignored until the strike. To aim somewhere else, order the ability again.
The lock ends at the strike. A beam, a bolt, a fan or a lunge goes where the
body points at the strike. A mortar and a disc land ON the point, clamped to
their range — the point is read at the strike, from where you stand then, so
walking through the wind-up does not move it. A blink goes toward the point and
stops there when it is nearer than the blink's distance. An ability whose aim
is 'none' — an aura, a leap — turns you not at all when a point is handed
to it. With no point, everything uses your facing at the strike, and a mortar
or a disc lands at the enemy's distance as it stands then.

Things in flight and on the floor. A bolt in p.arena.projectiles continues
along its vx, vz for 'left' seconds and connects with a body whose centre comes
within ${q('projectile.touchFromCentre', you.radius + PROJECTILE_TOUCH)} m of it — their radius plus the
touch margin, the same figure a bolt's card prints. A mortar (arc: true) comes down at
x + vx·left, z + vz·left, and its splash circle catches a body whose centre is
within the splash plus that body's radius. A disc in p.arena.zones does not say
which ability made it; the disc-shaped ability in that side's kit is the one,
and a side keeps at most one disc per ability on the floor. A raised wall is in
p.arena.obstacles with 'until' (seconds left) and 'by' (the side that raised
it), and api.los, api.ray and api.pathTo know it like any block.

What a hit does, in order. Damage passes through the attacker's damage
channel, then the defender's armor channel (a divisor), then the defender's
shield, then hp. A body inside its invulnerability window takes nothing: it is
told { type:'evaded', skill, by } once for that ability on that step — once,
not once per effect — and the attacker is told 'missed' with reason
'invulnerable', also once. A bolt is spent on such a body rather than passing
through it. A hit the shield ate whole is still a hit: both sides get their
event with amount 0 and the 'absorbed' figure, and a hit the shield ate PART of
carries 'absorbed' too. Fire takes hp every step at its rate, through the
shield's absorption and past both channels, and announces itself as
{ type:'burning', skill:'burn', hp } once every ${q('burn.eventEvery', BURN_EVENT_EVERY)} hp, never as 'damaged'.
The arena's burn from ${q('suddenDeath.at', SUDDEN_DEATH_AT)} s ignores shields and channels and takes a fraction
of MAXIMUM hp: a heal changes how long it takes, a shield does not.

An ability whose effects carry neither damage nor fire still tells you it
connected: { type:'dealt', skill, amount: 0, landed, enemyHp } arrives once per
body per step, and 'landed' lists the ids of the effects that actually took. A
control refused by an armed immunity is NOT in that list, so the event tells
"the root took" from "the root was refused" on its own. A damaging ability does
not send this one — its 'dealt' carries the real amount and no 'landed'.

Statuses. Stunned: no movement, no turning, no new ability, a cancellable
wind-up that is running is cancelled with its cooldown spent, and a lunge that
is travelling stops where it stands. Rooted: no movement; turning, abilities
and impulses all work. Silenced: no new ability, refused with reason
'silenced', except an aura, blink or leap of yours that carries a cleanse; a
cancellable wind-up is cancelled. Blinded: your p.enemy block — position,
velocity, dist, visible, casting — is the one from ${q('blind.lagSeconds', BLIND_LAG_TICKS / TICK_HZ)} s ago, and
p.self.blinded is true. None of these touches a projectile already in flight, a
disc already on the floor, or a wall.

Nothing stacks, and controls do not even queue. A second fire on a burning body
adds its own length to the time still burning, up to twice that length, and the
higher rate wins — except a disc's own ticks, which renew their fire rather
than lengthening it. A second shield keeps the larger figure and the later
time. A boost or a weaken on a channel replaces the one that was there.

The four controls — stun, root, silence, blind — are different. A control arms
an immunity the moment it LANDS, not when it ends: from that instant until its
duration plus the card's immune seconds have passed, no control of those
classes lands on that body at all. That includes a second copy of the same
control, and it includes a control from any other ability of either side. A
stun arms 'act' and 'move'; a root arms 'move'; a silence arms 'act'; a blind
arms 'sense'. p.self.immune and p.enemy.immune list the classes in force for
the WHOLE window, so a body that is stunned right now already lists 'act' and
'move' and will keep listing them after the stun has worn off. A control
refused this way is a 'missed' with reason 'immune' and the effect's name, and
it is always a different cast: a disc applies the control it carries once per
cast per body, on the first step that body is inside it, and its later ticks do
not try again. The rest of the ability is unaffected — damage, fire, an
impulse, a wall and every self effect on that same cast still land.

A wind-up longer than ${q('interrupt.minWindup', INTERRUPT_MIN_WINDUP)} s is cancellable; a stun, a silence, a knock or a pull
that lands during it cancels it, and you get { type:'interrupted', skill, by }
— or { type:'interruptedEnemy', skill } when it was theirs.

Impulses. A knock or a pull is a velocity on a slot of its own that decays at
${q('physics.knockbackDrag', KNOCKBACK_DRAG)} m/s² whatever the body is doing, and is dropped to zero the moment it
falls below ${q('physics.knockbackMin', KNOCKBACK_MIN)} m/s — so the travel is a shade under the impulse squared over
twice that drag. A body pushed into a wall or a block stops there. An impulse
that lands on a body in the middle of a lunge ends the lunge, and then moves
the body normally.

Leaving the ground. A leap is one shape in three parts: a crouch, an airborne
phase, a landing. Its own effects apply at take-off. From the crouch to the
end of the landing no ability can be started — refused with reason 'airborne'
while you are actually in the air, and with reason 'busy' during the crouch and
the landing, because on both of those you are still on the ground — and the
horizontal velocity is the one you had at take-off. Above ${q('airborne.dodgeMin', AIRBORNE_DODGE_MIN)} m — most of the
airborne phase — a fan, a disc's tick and a lunge pass underneath; a beam, a
bolt and a mortar hit exactly as on the ground. { type:'landed' } arrives on
the step you touch down. A blink has no wind-up, so nothing telegraphs it; it
is invulnerable for its card's seconds from the landing.

What is announced and what is not. p.events keeps at most ${q('events.max', EVENTS_MAX)} entries between
two thoughts, oldest first. A bolt that hits a block or flies out of range
announces nothing; a disc that catches nobody announces nothing; a mortar that
lands on nobody announces 'missed' with reason 'aim'. No event marks a status
landing on you: read p.self.stunned, rooted, silenced, blinded, burning,
shield, invulnerable, immune — and p.enemy.stunned, rooted, burning, shield,
invulnerable, immune. api.say is accepted at most once every ${q('say.every', SAY_EVERY)} s: a line
inside that window is dropped in silence, costs no order and raises no event.`;
}

// ---------------------------------------------------------------------------
// 5. perception
// ---------------------------------------------------------------------------

/**
 * @param {boolean} withKit  есть ли у бойцов набор грамматики.
 *
 * ПОЛЕ `kit` ОПИСЫВАЕТСЯ ТОЛЬКО ТОМУ, У КОГО ОНО НЕ NULL.
 *
 * `sim.js` `kitView` возвращает null бойцу без набора, то есть эталонной
 * фикстуре §1. Строка «здесь лежат живые числа твоих умений», под которой
 * лежит null, — это ровно тот вред, что D160 нашёл в строке `skills`: модель
 * читает поле, получает пустоту и не понимает, что сломалось.
 *
 * Второе следствие того же условия и вторая причина его соблюсти:
 * `brainPrompt(id)` без набора остаётся байт-в-байт прежним. На нём стоит §1 —
 * шесть эталонных мозгов, написанных ОДНИМ промптом, — и его хеш сверяет
 * `tools/bracket.mjs`.
 */
function perception(withKit = false) {
  /*
   * Поля перечислены ровно те, что кладёт `kitView`. `channel` и `element`
   * названы вместе с остальными, потому что без них список врал бы умолчанием:
   * усиление читается только по `channel`, а стихия — единственное, чем два
   * одинаковых по геометрии умения отличаются на экране.
   */
  const kitField = withKit ? `
  .kit          your skills as LIVE numbers, under the same names api.use
                takes: the three your creature holds, and there is no fourth.
                An entry carries { kind, element,
                effects, channel, windup, recover, cooldown, aim, magnitudes }
                and whichever of range,
                radius, splash, distance, halfAngle, speed, damage, ticks,
                airborne, duration, dashSpeed, iframes its delivery has. aim is
                'point' | 'facing' | 'none' — how api.use(name, {x, z}) is read.
                magnitudes is { effectId: { mag, duration, immune, channel } }
                as compiled on this ability. windup, recover and cooldown are
                the DECLARED figures, not the served ones the cards print. It is
                rebuilt for every thought from the set you are actually holding,
                which is not necessarily the set the tables above were printed
                from
  .blinded .silenced .rooted .burning
                true while the status holds
  .shield       hp of absorption left on you
  .immune       the control classes that cannot land on you right now:
                'act' | 'move' | 'sense'. A class appears the moment the
                control lands and stays for the control's duration plus its
                immune seconds, so it is listed while the control is still
                running
  .immuneLeft   { act, move, sense } — seconds left of that same window per
                class, 0 for a class not currently armed. A class still in
                .immune with a small number here is about to drop out of it` : '';
  const enemyKitField = withKit ? `
  .kit          the same shape, for their three, keyed by the
                names in their .skills. A creature of the arena's reference stock holds
                laser, blink and jump or smash, charge and jump instead of
                k1..k3; those are presented in this same shape (laser as a
                beam, smash as a fan, charge as a lunge), so .kit is never null
  .shield .rooted .burning .immune .immuneLeft
                the same meanings, for them` : '';
  /*
   * ЧУЖОЙ СКОРОСТИ ПОВОРОТА В ПЕРЦЕПЦИИ НЕТ, И ОБ ЭТОМ НАДО СКАЗАТЬ.
   *
   * `perceive` отдаёт `enemy.maxSpeed` живым — с каналом `speed`, — а
   * `turnRate` не отдаёт вовсе. Мозг, читающий один живой множитель, вправе
   * ждать и второго; статическое число из блока тела при этом всё, что у него
   * есть. Абзац только для набора: у эталонной фикстуры §1 каналов нет ни у
   * одного умения, и предложение про ослабление поворота описывало бы там
   * механику, которой в её мире не существует.
   */
  const turnNote = withKit
    ? ' There is no p.enemy.turnRate either: their maxSpeed is live and carries'
      + ' whatever boost or weaken is on their speed channel, but their turn rate'
      + ' reaches you only as the static figure in their body block above, so a'
      + ' weaken on their turn channel never shows in perception.'
    : '';
  return `WHAT YOU PERCEIVE — the object p

p.t             seconds since the match began
p.dt            seconds between two of your thoughts
p.tick          simulation step count. The world steps before anyone is asked
                to think, so the first value you ever see is ${q('think.firstTick', THINK_EVERY)}
                or one less — the match seed decides which — and never zero
p.timeLeft      seconds before the backstop clock decides on hp fraction
p.burn          fraction of your maximum hp the arena is burning off you per
                second right now, and off your opponent too. 0 before it starts
p.burnStartsIn  seconds until it does

p.self
  .id           'blue' or 'orange' — which of the two slots of the arena
                you are standing in. The two sides are told apart by colour
                and nothing else; neither carries a body, a skill set or a
                shape
  .x .z         position on the ground plane
  .y            height above the ground; > 0 only while you are off the ground
  .vx .vz       velocity, m/s, knockback included
  .speed        magnitude of that velocity
  .heading      radians, where you are pointing right now
  .hp .maxHp
  .radius .maxSpeed .turnRate
  .alive .airborne .stunned .invulnerable
  .busy         true while any skill of yours is running, the crouch and the
                landing of a jump included
  .casting      null, or { skill, phase, elapsed, remaining, total, telegraph }
                phase is 'windup' | 'strike' | 'dash' | 'air' | 'recover'
                telegraph is true while the effect has not landed yet
  .cooldowns    { skillName: seconds remaining, 0 means ready }
  .skills       the names you may pass to api.use${kitField}

p.enemy
  .id .x .z .y .vx .vz .speed .heading
  .hp .maxHp .radius .maxSpeed
  .alive .airborne .stunned .invulnerable .busy
  .casting      the same shape as p.self.casting, so you can see a wind-up
                while it is still winding up
  .skills       what they may use${enemyKitField}
  .dist         straight-line distance between the two centres
  .visible      true when nothing solid sits on the straight line between your
                centre and theirs, tested this instant. A beam or a bolt tests
                a DIFFERENT line, at the strike: from radius + muzzle ahead of
                the caster along its facing, not centre to centre and not now.
                api.ray tests a facing from your centre, api.los a point from
                your centre — those are the closest tests you can run yourself

  That is the whole list. In particular there is no p.enemy.cooldowns: what
  they have ready is not given to you.${turnNote} Every use of a skill by either side is
  announced — you get { type:'enemyStarted', skill } the moment they begin one.

p.arena
  .zones        discs on the ground that are still working: {x, z, r, mine, left}.
                mine is true for the ones you put there; left is seconds until
                it stops. Standing in one applies whatever it carries, again,
                every half second
  .projectiles  things in flight: {x, z, vx, vz, mine, arc, left}. An arc one
                passes over blocks; the others are stopped by them. left is
                seconds of flight remaining
  .half         ${q('arena.half', ARENA_HALF)}
  .obstacles    [{ x, z, hx, hz }] — the blocks, as half-extents${withKit ? `; a raised wall
                carries until (seconds left) and by (the side that raised it)` : ''}

${withKit ? eventsForKit() : eventsForFixture()}

p.mem           a read-only copy of everything you have stored. Writing to it
                does nothing; use api.remember.`;
}

/** The events section of the reference fixture, byte for byte as it was. */
function eventsForFixture() {
  return `p.events        what happened to you since your last thought, oldest first.
                Each is { type, ... }:
  { type:'damaged', skill, amount, hp, from:{x,z} }        you were hit
  { type:'dealt', skill, amount, enemyHp }                 you hit them
  { type:'missed', skill, reason }                         your skill landed on nothing.
                                                           reason: 'aim' | 'cover' | 'range' | 'airborne' | 'invulnerable'
  { type:'evaded', skill, by }                             something hit you during your i-frames
  { type:'blocked', by }                                   you walked into 'wall' or 'obstacle'
  { type:'contact' }                                       the two bodies are touching
  { type:'blinked', from, to, moved }
  { type:'landed' }                                        your hop finished
  { type:'knockback', by }
  { type:'interrupted', skill, by }                        your cast was cancelled
  { type:'interruptedEnemy', skill }                       you cancelled theirs
  { type:'chargeStopped', reason }
  { type:'burning', rate, hp }                             the arena is taking hp from you
  { type:'refused', skill, reason }                        api.use did not start it.
                                                           reason: 'cooldown' | 'busy' | 'stunned' | 'airborne' | 'dead' | 'unknown'
  { type:'enemyStarted', skill, windup }                   they began something
  { type:'enemyCommitted', skill }                         their charge direction is now locked`;
}

/**
 * The events section for a grammar kit: every event the sim emits on the
 * grammar path and nothing it does not (the audit found five fixture-only
 * events listed to every player creature, and 'silenced' and 'immune'
 * missing from the reasons).
 */
function eventsForKit() {
  return `p.events        what happened to you since your last thought, oldest first,
                at most ${q('events.max', EVENTS_MAX)} of them. Each is { type, ... }:
  { type:'damaged', skill, amount, hp, from:{x,z}, absorbed? }   you were hit; amount is what
                                                           reached hp, absorbed what a shield took
  { type:'dealt', skill, amount, enemyHp, absorbed? }      you hit them, same figures
  { type:'dealt', skill, amount:0, landed, enemyHp }       an ability of yours carrying neither
                                                           damage nor fire connected; landed lists
                                                           the effects that took, a refused control
                                                           is absent from it. Once per body per step
  { type:'missed', skill, reason, effect? }                your ability landed on nothing, or a
                                                           control of yours was refused.
                                                           reason: 'aim' | 'cover' | 'range' | 'airborne' | 'invulnerable' | 'immune'
  { type:'evaded', skill, by }                             an ability of theirs reached you inside
                                                           your invulnerability window and did
                                                           nothing. Once per ability per step, not
                                                           once per effect; by is the side that cast
  { type:'blocked', by }                                   you walked into 'wall' or 'obstacle'
  { type:'contact' }                                       the two bodies are touching
  { type:'blinked', from, to, moved }
  { type:'landed' }                                        your leap touched down
  { type:'knockback', by }                                 an impulse landed on you
  { type:'interrupted', skill, by }                        your wind-up was cancelled
  { type:'interruptedEnemy', skill }                       you cancelled theirs
  { type:'burning', rate, hp }                             the arena is taking hp from you
  { type:'burning', skill:'burn', hp }                     an enemy's fire is
  { type:'refused', skill, reason }                        api.use did not start it.
                                                           reason: 'cooldown' | 'busy' | 'stunned' | 'silenced' | 'airborne' | 'dead' | 'unknown'
  { type:'enemyStarted', skill, windup }                   they began something; windup as declared
  { type:'enemyCommitted', skill }                         their lunge direction is now locked`;
}

// ---------------------------------------------------------------------------
// 6. the verbs
// ---------------------------------------------------------------------------

/**
 * @param {boolean} withLob  есть ли в наборе доставка `lob`.
 *
 * ── ЧЕТВЁРТАЯ СЕКЦИЯ, КОТОРУЮ ДОБАВЛЯЕТ НАБОР, И ПОЧЕМУ ИМЕННО ТАК ──────────
 *
 * Строка про `api.use` говорила «a,b are the direction argument blink takes».
 * 04.09 это перестало быть всей правдой: агент механики сделал первый аргумент
 * ЗАПРОШЕННОЙ ДАЛЬНОСТЬЮ навеса (`sim.js`, `startSkill`: `const reach =
 * (s.kind === 'lob' && ...) ? a : null`). Умение, у которого мозг НАЗЫВАЕТ
 * дистанцию, и промпт, который об этом молчит, — это ровно правило №1 этого
 * файла наоборот: рычаг есть, о нём не сказано, им никто не пользуется.
 *
 * Условие — наличие навеса, а не наличие набора. У эталонной фикстуры §1
 * навеса нет ни у одной стороны, и предложение про метры было бы там правдой
 * ни о чём; заодно `brainPrompt(id)` остаётся байт-в-байт прежним.
 */
function verbs(withLob = false, withKit = false) {
  /* Врезка идёт ВНУТРЬ описания `api.use`, а не отдельным абзацем: это второе
     значение того же аргумента, и абзац поодаль читался бы как другой глагол. */
  const lobArg = withLob ? `
                        For a lob, a is instead the DISTANCE in metres you want
                        it to come down at; with no argument it comes down at
                        whatever the enemy's distance is when the cast finishes.
                        The number is clamped as the cast lands, not as you ask.
                       `
    : '';
  /*
   * THE KIT'S VERB, in its four forms. The audit of 07.09 found 76 of 222
   * api.use calls in the database passing a POINT as a pair — which the sim
   * read as a direction (blink) or ignored (everything else) — because the
   * one form that means a point did not exist and the text said "a,b are the
   * direction argument blink takes". Each form is a capability, stated once.
   */
  const useKit = `api.use(name)           Order an ability along your facing at the strike.
api.use(name, {x, z})   Order it AT a point on the ground: you turn toward the
                        point at your turn rate, and the point holds for the
                        whole wind-up — a later api.face or api.faceAt does not
                        replace it. A mortar and a disc land ON it, clamped to
                        range; a blink goes toward it and stops there; a beam,
                        fan, bolt or lunge goes where you point at the strike
                        (aim in p.self.kit says which of the three an ability
                        is, and 'none' means the point does nothing at all).
api.use(name, metres)   Mortar only: the landing distance along your facing.
api.use(name, dx, dz)   Blink only: a direction. For every other delivery a
                        pair is ignored and the ability goes along your facing.
                        The return value of every form says only that the
                        ORDER was accepted, not that the ability started:
                        orders are applied after your thought finishes, and one
                        can still be refused there — on cooldown, already busy,
                        stunned, silenced, off the ground. A refusal arrives as
                        a 'refused' event on your next thought. api.ready(name)
                        tells you in advance.
api.ready(name)         true when api.use(name) would start: cooldown over,
                        nothing of yours running, not stunned, not silenced
                        (a cleanse-carrying aura, blink or leap excepted), on
                        the ground, alive.`;
  const useFixture = `api.use(name, a, b)     Order a skill. a,b are the direction argument blink
                        takes.${lobArg} The return value says only that the ORDER was
                        accepted, not that the skill started: orders are applied
                        after your thought finishes, and one can still be
                        refused there — on cooldown, already busy, stunned,
                        off the ground. A refusal arrives as a 'refused' event
                        on your next thought. api.ready(name) tells you in
                        advance.
api.ready(name)         true when api.use(name) would start.`;
  return `WHAT YOU CAN DO — the object api

Movement orders STAND. One call keeps steering the body until you replace it,
including on the thoughts where you call nothing. There is no per-frame
re-issuing.

api.move(dx, dz)        Steer along a direction. Raw: it does not avoid
                        anything, so it will hold you against a block if that is
                        where you pointed. dx,dz need not be normalised.
                        {0,0} is a full stop.
api.moveTo(x, z)        Walk to a point, routed around the blocks. The order
                        stands until the point is reached or replaced; on
                        arrival you brake to a stop and stand there until your
                        next order.
api.stop()              Drop the movement order.
api.face(dx, dz)        Turn toward a direction. Stands until replaced.
api.faceAt(x, z)        Turn toward a point, measured when you call it.
${withKit ? useKit : useFixture}
api.cooldown(name)      seconds left, 0 when ready.
api.los(x, z)           true when nothing solid sits between your centre and
                        that point.
api.ray(dx, dz, maxDist) Cast a line from your centre. Returns
                        { hit, dist, x, z } — where the first solid thing is, or
                        the end of the line. maxDist is capped at 60.
api.pathTo(x, z)        { dist, direct, points:[{x,z}] } — a walkable route,
                        its true walking length, and whether the straight line
                        was already clear. null when there is no route.
api.rand()              a number in [0,1). Seeded per match.
api.remember(key, value) Store anything JSON can hold. ${q('mem.maxKeys', MEM_MAX_KEYS)} keys, and a key
                        longer than ${q('mem.maxKeyChars', 32)} characters is cut to its first ${q('mem.maxKeyChars', 32)}
                        — two long keys with the same opening are one key. A
                        value whose JSON runs past ${q('mem.maxValueBytes', MEM_MAX_VALUE_BYTES)} characters, or that
                        JSON cannot hold, is dropped in silence, and so is a
                        new key once the ${q('mem.maxKeys', MEM_MAX_KEYS)} are full.
api.recall(key, fallback)
api.forget(key)
api.say(text)           Up to ${q('say.maxChars', SAY_MAX_CHARS)} characters, shown above your body to whoever is
                        watching, and accepted at most once every ${q('say.every', SAY_EVERY)} s: a line
                        inside that window is dropped in silence — no fault, no
                        event, no order spent. It has no effect on the fight.

move, face, use and say are QUEUED and applied together once your thought
returns, so calling one of them twice in one thought keeps the LAST call and
the earlier one never happens: no half of a thought can watch the other half
act. move, moveTo and stop share the one movement slot, and face and faceAt
share the one facing slot. remember and forget are the exception to the queue —
they write through the instant you call them, so one thought can store several
keys and read them back immediately — but they are not an exception to the
count: each one spends an order like any other.
${q('orders.perThink', MAX_ORDERS_PER_THINK)} orders are honoured per thought; the rest are dropped. recall spends a
perception call, not an order.
The perception verbs — ready, cooldown, los, ray, pathTo, rand, recall — have
their own separate allowance of ${q('queries.perThink', MAX_QUERIES_PER_THINK)}, so probing the world can never eat into
the orders you meant to give.`;
}

// ---------------------------------------------------------------------------
// 7. what is already in scope
// ---------------------------------------------------------------------------

/**
 * @param {boolean} withKit  a grammar kit is being described.
 *
 * The `V.lead` paragraph used to end "Nothing in this world flies … no skill
 * has a projectile speed to pass here" — true of the reference fixture, and
 * printed to every creature holding a bolt at 22 m/s or a mortar at 12. The
 * two texts are kept apart: the fixture's stays byte-identical, the kit's
 * says what the helper is for.
 */
function helpers(withKit = false, me = null) {
  const lead = withKit
    ? `  V.lead(shooter, target, targetVel, speed)
                            where a target moving at constant velocity will be
                            when something released from shooter now and
                            travelling at "speed" reaches it. Returns the
                            target's own position when speed is 0. A bolt and
                            a mortar have a speed (p.self.kit[name].speed) and
                            are released at the strike, wind-up seconds after
                            the order, from ${q('projectile.muzzleFromCentre', me.radius + PROJECTILE_MUZZLE)} m ahead of your centre — your own
                            radius plus the muzzle offset, the same figure the
                            cards print; a beam has none.`
    : `  V.lead(shooter, target, targetVel, speed)
                            where a target moving at constant velocity will be
                            when something travelling at "speed" reaches it.
                            Returns the target's own position when speed is 0.
                            Nothing in this world flies: the beam is
                            instantaneous and the charge is a body, so no skill
                            has a projectile speed to pass here.`;
  return `WHAT IS ALREADY IN SCOPE

V — plane vectors as plain { x, z } objects.
  V.add(a,b)   V.sub(a,b)   V.scale(a,s)   V.lerp(a,b,t)
  V.len(a)     V.dist(a,b)  V.dot(a,b)     V.norm(a)
  V.toward(a,b)             unit vector from a to b
  V.away(a,b)               unit vector from b to a
  V.perp(a)                 rotated a quarter turn
  V.rot(a,radians)
  V.heading(a)              the heading of a direction
  V.fromHeading(h)          the direction of a heading
  V.angleTo(heading, dir)   signed shortest angle from a heading to a direction,
                            in (-PI, PI]
  V.clamp(v, lo, hi)
${lead}
  V.norm and V.toward return {x:0,z:0} for a zero-length input, and a zero
  vector passed to api.move is a full stop.

Math is available in full except Math.random. console.log works and goes to a
log nobody's fight depends on.`;
}

// ---------------------------------------------------------------------------
// 8. constraints, each with its reason
// ---------------------------------------------------------------------------

function rules() {
  return `THE RULES

1. NO Math.random AND NO Date.
   Both throw. The reason is not safety, it is replay: a match must be
   reproducible from the seed and the two brains, so that a hundred rounds can
   be run headless and mean something, and so a fight can be watched again
   exactly as it happened. Both of those read a clock this world does not have.
   api.rand() is the seeded replacement and is as random as you need.

2. TWO KINDS OF MEMORY, AND THE DIFFERENCE BETWEEN THEM.
   A variable declared beside think keeps its value from one thought to the
   next and is reset when a new match starts. It works; write to it freely.
   What it does not do is show up anywhere outside your own head: p.mem does
   not contain it and nothing recording the fight can see it.
   api.remember(key, value) / api.recall(key, fallback) do both — they persist
   for the match and they come back to you as p.mem, which is also what anyone
   watching can read. Neither is better. Use whichever you want for whatever
   reason you want.

3. A THOUGHT HAS ${q('think.fuel', FUEL_PER_THINK)} STEPS AND ${q('queries.perThink', MAX_QUERIES_PER_THINK)} PERCEPTION CALLS.
   A step is a loop iteration, a function call, a branch. The limit is counted
   in STEPS rather than in milliseconds on purpose: the same fight has to
   produce the same log on a quiet machine and on a busy one, and a clock
   cannot promise that. There is a wall clock behind it — ${q('think.timeoutMs', THINK_TIMEOUT_MS)} ms — but
   it is a backstop for the pathological, not the rule you are living under.
   Overrunning either aborts that thought: no orders are issued, your standing
   orders keep running, and the fault is counted. Both sit far above what even
   a thought that reasons carefully about the whole arena spends — they are
   guards against an accidental infinite loop, not budgets you have to husband.
   The perception cap RAISES rather than quietly returning false, because a
   sense that lies is worse than a sense that stops.

4. A THROWN ERROR COSTS YOU THAT THOUGHT, NOT THE MATCH.
   Your standing orders keep running and the next thought is attempted. After
   ${q('faultLimit', FAULT_LIMIT)} faults the mind is switched off for the rest of the fight and the body
   coasts on whatever it was last told.

DIALECT: modern JavaScript. const, let, arrow functions, template literals,
for-of, destructuring, classes, and the array methods all work. Rule 1 is about
two names, not about the language.`;
}

// ---------------------------------------------------------------------------
// 9. the objective
// ---------------------------------------------------------------------------

const OBJECTIVE = `THE OBJECTIVE

Kill your opponent. Stay alive.

That is the whole of it. Nothing above tells you how, and nothing above is a
recommendation: it is an inventory of what exists, what it costs and what the
world does. How you fight is yours.`;

// ---------------------------------------------------------------------------

/**
 * The system prompt: who is reading, and what an answer looks like.
 *
 * Kept separate from the body so that a repair turn can resend the same system
 * text and only change the user half.
 */
export const SYSTEM_PROMPT = `You write the minds of fighting creatures, as plain JavaScript.
You answer with source code and nothing else — no explanation before it, no
summary after it, no markdown fence around it. The first character of your reply
is the first character of the program.`;

/**
 * Вся инструкция для одного бойца.
 *
 * @param {string} id  СТОРОНА арены: 'blue' или 'orange'. Сторона — это ЦВЕТ,
 *   а не вид и не архетип: под этим именем боец сидит в матче, это же значение
 *   он прочитает в `p.self.id`, а эталонная фикстура §1 выбирается по нему
 *   через мост `referenceTagOf` — и только если набора нет. Никаких
 *   характеристик сторона не несёт.
 * @param {object} [kits]  { own, enemy } — compiled §8 kits. Passing them
 *   replaces the two skill sections and adds the two lines of §5 that describe
 *   `p.self.kit` / `p.enemy.kit` — and NOTHING else. §1 rests on six brains
 *   sharing one prompt, and a prompt that quietly changed shape would rewrite
 *   that measurement backwards.
 *
 *   Поэтому третья секция добавлена ПОД УСЛОВИЕМ, а не безусловно, и условие
 *   ровно то же, что у первых двух. `brainPrompt(id)` без набора обязан
 *   остаться байт-в-байт прежним: на нём стоит §1, его хеш сверяет
 *   `tools/bracket.mjs`, по нему кэшируются вердикты `checktactics`. Проверяется
 *   это не на слово — `tools/checkprompt.mjs` рендерит обе формы.
 *
 *   Что кит НЕ добавляет — ни одной строки о том, как драться. Поле `kit`
 *   существует, потому что F10 обещает смену набора без регенерации мозга, и
 *   мозг, который не может прочитать свою дальность, это обещание нарушает; на
 *   вопрос «какую дистанцию держать» промпт по-прежнему не отвечает.
 * @param {object} [builds]  { own, enemy } — ТЕЛОСЛОЖЕНИЯ двух бойцов. Здесь
 *   стояли `sizes` — два числа-множителя поверх записи архетипа. Записей нет,
 *   и множителю не к чему прикладываться: тело приезжает целиком, своими
 *   осями. Без него `statsOf` вернёт `DEFAULT_BUILD` — середину каждой оси, то
 *   есть ровно то тело, которое даст симуляция бойцу без своего телосложения.
 *   Это НЕ архетип: от него никто не наследуется, он просто значение по
 *   умолчанию по обе стороны.
 */
export function brainPrompt(id, kits = null, builds = null) {
  const me = statsOf(builds?.own);
  const foe = statsOf(builds?.enemy);
  const otherId = opponentOf(id);
  return [
    /*
     * Первой строкой стояло «ты осьминог, соперник — горилла». Это называло
     * ВИД, и вид тянул за собой всё, чего в мире больше нет: модель писала
     * мозг «под осьминога», хотя числа тела теперь у каждого свои. Сторона
     * названа отдельно и ровно как сторона — иначе `p.self.id` было бы нечем
     * объяснить.
     */
    `You are the mind of one creature in a duel.

Your body is yours alone. Every number in it was chosen for THIS creature and
describes nothing else: there are no kinds here, and no creature inherits
anything from another. Your opponent is another creature with its own numbers,
and both bodies are spelled out below — yours to you, theirs to you, and the
same disclosure the other way round.

You will find yourself in perception as p.self.id = '${id}'. That is the side
of the arena you were put on. It is a label for one of the two slots and says
nothing about a body, a skill or a shape.`,
    shape(),
    world(),
    bodyBlock(true, me, kits?.own, id),
    skillsFor(id, kits?.own, me, foe),
    bodyBlock(false, foe, kits?.enemy, otherId),
    enemySkillsFor(otherId, kits?.enemy, foe, me),
    kits?.own ? interactions(me, foe) : null,
    perception(Boolean(kits?.own)),
    /* Условие — доставка, а не набор: аргумент-дальность есть только у навеса. */
    verbs(Object.values(kits?.own || {}).some((d) => d.kind === 'lob'), Boolean(kits?.own)),
    helpers(Boolean(kits?.own), me),
    rules(),
    OBJECTIVE,
  ].filter(Boolean).join('\n\n---\n\n');
}

/**
 * The same prompt, rendered with every config-derived substring bracketed, plus
 * the (label, text) pairs that produced them.
 *
 * `marked` is what the checkers sweep; `plain` is byte-identical to
 * `brainPrompt(id, kits, builds)` and is asserted to be, so that nothing can be
 * true of the traced render and false of the one a model is handed.
 *
 * `kits` and `builds` are passed straight through, and they are the reason the
 * kit half of the document is inside the guarantee at all: the trace used to
 * take an id and nothing else, so the only form ever checked was the reference
 * fixture's, while every creature a player owns reads the kit form.
 */
export function tracePrompt(id, kits = null, builds = null) {
  TRACE = [];
  try {
    const marked = brainPrompt(id, kits, builds);
    return {
      marked,
      plain: marked.split(MARK_IN).join('').split(MARK_OUT).join(''),
      records: TRACE,
    };
  } finally {
    TRACE = null;
  }
}

/** The characters `tracePrompt` brackets emitted values with. */
export const TRACE_MARKS = { in: MARK_IN, out: MARK_OUT };

/**
 * The repair turn.
 *
 * It quotes back the failure and nothing else. Adding "and while you are there,
 * consider…" would be tactics arriving through the back door, and it would make
 * a repaired brain incomparable with a first-try one.
 */
export function repairPrompt(id, source, failure) {
  return `${brainPrompt(id)}

---

YOUR PREVIOUS ANSWER FAILED THIS CHECK:

${failure}

Here is what you sent:

${source}

Send the corrected program. Code only, same rules.`;
}
