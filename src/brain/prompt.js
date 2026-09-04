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
 * That promise is MECHANISED rather than trusted. Every number goes out through
 * `q(label, value)`, which formats it exactly as before and — while a trace is
 * running — records the pair and brackets the characters it produced. On that
 * record `tools/checkprompt.mjs` runs the guarantee in both directions:
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
  ARENA_HALF, BEAM_RADIUS, FAULT_LIMIT, KNOCKBACK_DRAG, MATCH_SECONDS, statsOf,
  MAX_ORDERS_PER_THINK, MAX_QUERIES_PER_THINK, MEM_MAX_KEYS, OBSTACLES, SAY_MAX_CHARS,
  SKILLS, SPAWN_RADIUS, SUDDEN_DEATH_AT, SUDDEN_DEATH_RAMP, THINK_EVERY,
  THINK_HZ, THINK_TIMEOUT_MS, TICK_HZ, skillsOf, referenceTagOf,
} from '../core/config.js';
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
  while (t > 0) { t = Math.max(0, t - TICK); ticks++; }
  return ticks * TICK;
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
ever leaves the ground. The arena runs from -${q('arena.half', ARENA_HALF)} to +${q('arena.half', ARENA_HALF)} on both X and Z, walled on
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
  if (kit) return `YOUR SKILLS\n\n${kitBlocks(kit, mine, theirs)}\n\n${KIT_IS_NOT_YOURS}`;
  return `YOUR SKILLS\n\n${skillsOf(referenceTagOf(tag)).map((nm) => skillBlock(nm, mine, theirs, 'body.enemy')).join('\n\n')}`;
}

/** Умения соперника. Применяющий — он, цель — я, поэтому пара перевёрнута. */
function enemySkillsFor(tag, enemyKit, theirs, mine) {
  const head = "YOUR OPPONENT'S SKILLS\n\nThe same numbers, disclosed to both sides.\n\n";
  if (enemyKit) return head + kitBlocks(enemyKit, theirs, mine);
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
const KIT_IS_NOT_YOURS = `These three are the skills you are holding as this is written. They can be
exchanged for three others between one match and the next, and you are NOT
rewritten when they are: the same program you are writing now runs with the new
set. So a range copied out of the table above and typed into your source as a
number describes a skill you may no longer have, and nothing will tell you it
has stopped being true.

The live figures are in perception, under p.self.kit, keyed by the same names
api.use takes; the opponent's are under p.enemy.kit. They are rebuilt for every
thought, from the set actually equipped.`;

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
const DELIVERY_LINE = {
  beam: 'a straight line from your muzzle. It stops at the first block, wall or body it meets',
  cone: 'a wedge ahead of you, close in. It needs a clear line to the body it hits, and it sweeps the FLOOR — a body that is off the ground when it lands takes nothing',
  bolt: 'a projectile that travels. It can be walked out of, and a block stops it',
  /*
   * НАВЕС — ЕДИНСТВЕННАЯ ДОСТАВКА, У КОТОРОЙ ДАЛЬНОСТЬ НАЗЫВАЕТ МОЗГ.
   *
   * Здесь стояло «It flies OVER blocks and lands where it was aimed». Первая
   * половина верна, вторая была неправдой в обе стороны сразу, и обе половины
   * этой неправды агент механики починил 04.09 в `src/core/deliver.js`
   * (`lobLanding`, `tickProjectiles`) и в `src/core/sim.js` (`startSkill`).
   * Своей формулировки он не прислал, поэтому строка ниже написана ПО КОДУ, и
   * вот по какому:
   *
   *   `startSkill`: `const reach = (s.kind === 'lob' && a !== null &&
   *   Number.isFinite(a)) ? a : null` — для навеса первый аргумент `api.use`
   *   это ЗАПРОШЕННАЯ ДАЛЬНОСТЬ В МЕТРАХ. Больше её не читает никто: у мигания
   *   `a, b` — направление, у остальных семи доставок аргументы не читаются.
   *
   *   `lobLanding`: `null` (аргумента не было) значит РАССТОЯНИЕ ДО ВРАГА, а
   *   не предел умения. Запрос зажимается `min(предел, max(свой радиус +
   *   splash, запрос))`, и поверх — край арены. Зажимается в момент
   *   приземления каста, а не приказа.
   *
   *   `tickProjectiles`, ветка `p.arc`: полёт не проверяет НИЧЕГО — ни тел, ни
   *   препятствий. Весь удар это круг `splash` вокруг точки падения, и тело
   *   попадает под него, когда его центр ближе `splash + его радиус`. Пустая
   *   точка — промах с причиной `aim`, и он приезжает мозгу событием.
   *
   * Почему это важно ИМЕННО ДЛЯ ДИСТАНЦИИ: у навеса теперь есть и ближняя
   * граница, а не только дальняя. Ближе `свой радиус + splash` он не ложится
   * вовсе — то есть это единственное умение в грамматике, которым нельзя
   * ударить в упор, и мозг, который об этом не знает, будет жать его вплотную
   * и получать промахи.
   */
  lob: 'a projectile on an arc. It flies OVER blocks and over bodies, touching nothing on the way, and everything happens where it lands: a circle of its splash radius, which catches a body whose centre is within that splash plus their own radius. WHERE it lands is yours to name — api.use(name, metres) takes the distance you want, and with no argument it lands at the enemy\'s distance as it stands when the cast finishes. What you asked for is clamped when the cast lands: never nearer than your own radius plus the splash, never past the range above, never past the edge of the arena. A landing that catches nobody is a miss with reason "aim"',
  zone: 'a disc on the ground that keeps working for a few seconds after it lands. It sits ON the floor, so a body that is in the air skips the ticks it spends up there — one or two of them, not the whole cast',
  dash: 'you travel forward and everything on the path is hit. A block stops the travel, and so does height: a body that is off the ground when you arrive takes nothing',
  blink: 'you are somewhere else immediately, untouchable while you move',
  self: 'it happens to you, where you stand',
  jump: 'you leave the ground. Three deliveries travel along the floor — cone, zone and dash — and they pass underneath you while you are up there. Your horizontal velocity is frozen at take-off, and you can order nothing until you land',
};

const EFFECT_LINE = {
  damage: 'takes hp off what it hits',
  burn: 'sets what it hits on fire: hp comes off over time, and a second hit renews rather than stacks',
  knock: 'pushes what it hits away from you',
  pull: 'drags what it hits toward you',
  stun: 'the target cannot act at all while it lasts',
  root: 'the target cannot move at all while it lasts; it can still act',
  shield: 'absorbs damage before hp does, until it is spent or its time runs out',
  heal: 'puts hp back, never above maximum',
  cleanse: 'removes fire, root, blindness, silence, stun and every weaken from you',
  blind: "the target's perception of you arrives late — it sees where you were, and it is told that it is blinded",
  silence: 'the target cannot start a skill while it lasts; its attempts are refused with reason "silenced"',
  wall: 'a temporary block grows in front of you and stops bodies and lines of sight like any other',
  boost: 'multiplies one of your own numbers up while it lasts',
  weaken: "multiplies one of the target's numbers down while it lasts",
};

const CHANNEL_LINE = {
  speed: 'top movement speed', turn: 'turn rate', damage: 'damage dealt',
  armor: 'damage taken', cooldown: 'how fast cooldowns run down',
  range: 'the reach of deliveries', vision: 'how far perception reaches',
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
function reachLine(d, me, you) {
  const at = (v, tail) => `${n(v)} m between the two centres, at the very most: ${tail}`;
  if (d.kind === 'beam') {
    const muzzle = me.radius + 0.2;
    return at(muzzle + d.range + you.radius + 0.4,
      `the beam starts ${n(muzzle)} m ahead of your centre along your facing, runs ${n(d.range)} m from there, `
      + `carries ${n(0.4)} m of margin, and connects on their SURFACE — so ${n(you.radius)} m of their radius counts too`);
  }
  if (d.kind === 'cone') {
    return at(d.range + you.radius,
      `the range is measured to their SURFACE, so ${n(you.radius)} m of their radius is added to it. Your own radius is NOT: `
      + 'the wedge is measured from your centre');
  }
  if (d.kind === 'bolt') {
    const muzzle = me.radius + 0.3;
    /* Сколько тиков живёт снаряд: мир вычитает по тику, пока `life > 0`. */
    const ticks = Math.ceil((d.range / d.speed) / TICK - 1e-9);
    const flight = ticks * d.speed * TICK;
    return at(muzzle + flight + you.radius + 0.35,
      `it leaves ${n(muzzle)} m ahead of your centre, flies ${n(flight)} m — its range rounded UP to whole steps of the world — `
      + `and touches them when it comes within ${n(you.radius + 0.35)} m of their centre`);
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
    return `${n(d.range + d.splash + you.radius)} m between the two centres at the very most — your range `
      + `${n(d.range)} m plus the ${n(d.splash)} m of splash plus their ${n(you.radius)} m of radius — and it will not land `
      + `nearer to you than ${n(near)} m, your own radius plus that splash, whatever distance you ask for`;
  }
  if (d.kind === 'zone') {
    return at(d.range + d.radius + you.radius,
      `the disc lands along your facing at your range or at their distance, whichever is SHORTER, and it works on a body whose `
      + `centre is within ${n(d.radius)} m of the disc plus their own ${n(you.radius)} m of radius`);
  }
  if (d.kind === 'dash') {
    return at(d.distance + me.radius + you.radius,
      `you sweep ${n(d.distance)} m and everything within ${n(me.radius + you.radius)} m of that line — your radius plus theirs — is hit`);
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
function kitBlocks(kit, me, you) {
  return Object.entries(kit).map(([name, d]) => {
    const L = [];
    const push = (k, v) => L.push(`  ${k.padEnd(20)}${v}`);
    push('cooldown', `${n(servedCountdown(d.cooldown))} s, counted from the moment it starts`);
    if (d.windup > 0) push('cast', `${n(servedCountdown(d.windup))} s of wind-up, then it lands, then ${n(servedCountdown(d.recover))} s of recovery`);
    else push('cast', `it lands immediately, then ${n(servedCountdown(d.recover))} s of recovery`);
    push('delivery', `${d.kind} — ${DELIVERY_LINE[d.kind] || ''}`);
    if (d.range !== undefined) push('range', `${n(d.range)} m`);
    if (d.radius !== undefined) push('radius', `${n(d.radius)} m`);
    if (d.distance !== undefined) push('distance', `${n(d.distance)} m`);
    if (d.speed !== undefined) push('speed', `${n(d.speed)} m/s`);
    /* Радиус поражения навеса в точке падения. Без него `reach` ниже — сумма,
       одно слагаемое которой нигде не названо, а ближняя граница броска
       (свой радиус + splash) вообще не выводима. */
    if (d.splash !== undefined) push('splash', `${n(d.splash)} m around the point it lands on`);
    if (d.duration !== undefined && d.kind === 'zone') push('lasts', `${n(d.duration)} s on the ground`);
    /* Досягаемость — ПОСЛЕ всех своих слагаемых, чтобы читалась как их сумма,
       а не как ещё одно независимое число. См. `reachLine`. */
    const reach = reachLine(d, me, you);
    if (reach) push('reach', reach);
    /*
     * D160: прыжок приезжает из грамматики, и его воздушная фаза — главное
     * число умения. Без этой строки модель видела бы доставку `jump` с
     * кулдауном и без единой цифры про то, СКОЛЬКО она будет в воздухе, —
     * то есть не могла бы решить, окупается ли уклонение простоем.
     */
    if (d.kind === 'jump') {
      push('airborne', `${n(servedCountdown(d.airborne))} s off the ground, above ${n(AIRBORNE_DODGE_MIN)} m for most of it`);
      push('landing', 'you get { type: \'landed\' } in p.events on the tick you touch down');
    }
    for (const e of d.effects) {
      const ch = e.channel ? ` (${CHANNEL_LINE[e.channel] || e.channel})` : '';
      const mag = e.id === 'damage' ? ` — ${n(e.mag)}` : '';
      const dur = e.duration ? `, ${n(e.duration)} s` : '';
      push(`effect ${e.id}`, `${EFFECT_LINE[e.id] || ''}${ch}${mag}${dur}`);
    }
    /* The name is what api.use takes. Nothing else is a legal argument. */
    return `${name}\n${L.join('\n')}`;
  }).join('\n\n');
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
  .kit          your three skills as LIVE numbers, under the same names api.use
                takes. Each carries { kind, element, effects, channel, windup,
                recover, cooldown } and whichever of range, radius, splash,
                distance, halfAngle, speed, damage, ticks, airborne, duration
                its delivery has. It is rebuilt for every thought from the set you are
                actually holding, which is not necessarily the set the tables
                above were printed from` : '';
  const enemyKitField = withKit ? `
  .kit          the same shape, for their three` : '';
  return `WHAT YOU PERCEIVE — the object p

p.t             seconds since the match began
p.dt            seconds between two of your thoughts
p.tick          simulation step count. The world steps before anyone is asked
                to think, so the first value you ever see is ${q('think.firstTick', THINK_EVERY)}, not zero
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
  .y            height above the ground; > 0 only during a hop
  .vx .vz       velocity, m/s, knockback included
  .speed        magnitude of that velocity
  .heading      radians, where you are pointing right now
  .hp .maxHp
  .radius .maxSpeed .turnRate
  .alive .airborne .stunned .invulnerable
  .busy         true while any skill of yours is running
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
                centre and theirs. This is the same test the beam performs

  That is the whole list. In particular there is no p.enemy.cooldowns: what
  they have ready is not given to you. Every use of a skill by either side is
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
  .obstacles    [{ x, z, hx, hz }] — the blocks, as half-extents

p.events        what happened to you since your last thought, oldest first.
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
  { type:'enemyCommitted', skill }                         their charge direction is now locked

p.mem           a read-only copy of everything you have stored. Writing to it
                does nothing; use api.remember.`;
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
function verbs(withLob = false) {
  /* Врезка идёт ВНУТРЬ описания `api.use`, а не отдельным абзацем: это второе
     значение того же аргумента, и абзац поодаль читался бы как другой глагол. */
  const lobArg = withLob ? `
                        For a lob, a is instead the DISTANCE in metres you want
                        it to come down at; with no argument it comes down at
                        whatever the enemy's distance is when the cast finishes.
                        The number is clamped as the cast lands, not as you ask.
                       `
    : '';
  return `WHAT YOU CAN DO — the object api

Movement orders STAND. One call keeps steering the body until you replace it,
including on the thoughts where you call nothing. There is no per-frame
re-issuing.

api.move(dx, dz)        Steer along a direction. Raw: it does not avoid
                        anything, so it will hold you against a block if that is
                        where you pointed. dx,dz need not be normalised.
                        {0,0} is a full stop.
api.moveTo(x, z)        Walk to a point, routed around the blocks. The order
                        stands until the point is reached or replaced.
api.stop()              Drop the movement order.
api.face(dx, dz)        Turn toward a direction. Stands until replaced.
api.faceAt(x, z)        Turn toward a point, measured when you call it.
api.use(name, a, b)     Order a skill. a,b are the direction argument blink
                        takes.${lobArg} The return value says only that the ORDER was
                        accepted, not that the skill started: orders are applied
                        after your thought finishes, and one can still be
                        refused there — on cooldown, already busy, stunned,
                        off the ground. A refusal arrives as a 'refused' event
                        on your next thought. api.ready(name) tells you in
                        advance.
api.ready(name)         true when api.use(name) would start.
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
api.remember(key, value) Store anything JSON can hold. ${q('mem.maxKeys', MEM_MAX_KEYS)} keys.
api.recall(key, fallback)
api.forget(key)
api.say(text)           Up to ${q('say.maxChars', SAY_MAX_CHARS)} characters, shown above your body to whoever is
                        watching. It has no effect on the fight.

move, face, use and say are QUEUED and applied together once your thought
returns, so calling one of them twice in one thought keeps the LAST call and
the earlier one never happens: no half of a thought can watch the other half
act. move, moveTo and stop share the one movement slot, and face and faceAt
share the one facing slot. remember and forget are the exception — they write
through the instant you call them, so one thought can store several keys and
read them back immediately.
${q('orders.perThink', MAX_ORDERS_PER_THINK)} orders are honoured per thought; the rest are dropped.
The perception verbs — ready, cooldown, los, ray, pathTo, rand, recall — have
their own separate allowance of ${q('queries.perThink', MAX_QUERIES_PER_THINK)}, so probing the world can never eat into
the orders you meant to give.`;
}

// ---------------------------------------------------------------------------
// 7. what is already in scope
// ---------------------------------------------------------------------------

const HELPERS = `WHAT IS ALREADY IN SCOPE

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
  V.lead(shooter, target, targetVel, speed)
                            where a target moving at constant velocity will be
                            when something travelling at "speed" reaches it.
                            Returns the target's own position when speed is 0.
                            Nothing in this world flies: the beam is
                            instantaneous and the charge is a body, so no skill
                            has a projectile speed to pass here.
  V.norm and V.toward return {x:0,z:0} for a zero-length input, and a zero
  vector passed to api.move is a full stop.

Math is available in full except Math.random. console.log works and goes to a
log nobody's fight depends on.`;

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
    perception(Boolean(kits?.own)),
    /* Условие — доставка, а не набор: аргумент-дальность есть только у навеса. */
    verbs(Object.values(kits?.own || {}).some((d) => d.kind === 'lob')),
    HELPERS,
    rules(),
    OBJECTIVE,
  ].join('\n\n---\n\n');
}

/**
 * The same prompt, rendered with every config-derived substring bracketed, plus
 * the (label, text) pairs that produced them.
 *
 * `marked` is what the checkers sweep; `plain` is byte-identical to
 * `brainPrompt(id)` and is asserted to be, so that nothing can be true of the
 * traced render and false of the one a model is handed.
 */
export function tracePrompt(id) {
  TRACE = [];
  try {
    const marked = brainPrompt(id);
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
