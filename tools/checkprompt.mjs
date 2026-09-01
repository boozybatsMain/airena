#!/usr/bin/env node
/**
 * The structural guarantee that the brain prompt cannot lie.
 *
 *   node tools/checkprompt.mjs
 *
 * `src/brain/prompt.js` promises that every number it emits is read from
 * `src/core/config.js`. A promise in a docstring is not a mechanism, and the
 * failure it guards against is silent — a constant moves, the prompt keeps
 * quoting the old one, and the next generated brain is written against a world
 * that no longer exists.
 *
 * ── why this is not a text search ───────────────────────────────────────────
 *
 * It used to be one: `prompt.includes(fmt(value))` for every whitelisted field.
 * That check cannot fail usefully and did not. With the laser's damage typed
 * into the prompt by hand and the config value moved to 3, then 4, then 24,
 * then 155, it passed all four times — the 17.6 kB of prose it searched was
 * about a world made of small numbers and contained "3" and "24" wherever you
 * looked. Finding a numeral somewhere in a document is no evidence that the
 * sentence you care about contains it.
 *
 * So the prompt reports what it emitted instead of being interrogated about it.
 * `tracePrompt` renders through the tagged emitter: every value arrives here as
 * a (label, text) pair AND is bracketed in place in the rendered text. That
 * gives both directions, and neither can be satisfied by coincidence:
 *
 *   config -> text   the emitted label set must equal the whitelist below, and
 *                    every emitted substring must equal the value this file
 *                    computes from live config. A hardcoded number either drops
 *                    a label (caught as missing) or disagrees (caught as
 *                    stale).
 *   text -> config   delete every bracketed character and sweep what remains
 *                    for numerals. Anything left is a number that reached the
 *                    model without passing through config.
 *
 * The whitelist stays a whitelist rather than "every field in config": a field
 * that is added and NOT disclosed is a design choice — `mass` is disclosed,
 * `pose` is not, and blink's moveScale of 1.0 is silence rather than a line
 * saying nothing changes — and a checker that forbade that would be enforcing
 * taste. What it will not allow is a listed field going stale, or a new number
 * appearing in the prose.
 *
 * ── the two checks that run from here ───────────────────────────────────────
 *
 * Numbers are the easy half. The prompt's other promise is that every LINE is a
 * capability, a constraint with its reason, a fact, or the objective — and that
 * one used to be six substrings (`'you should'`, `'it is usually'`, …), which
 * is the exact class of check the paragraphs above demolish, applied to the
 * harder problem. It never fired, and two real leaks sat past it for the life
 * of the project. `tools/checktactics.mjs` replaces it with a judge that reads,
 * and costs nothing while the prompt is unchanged.
 *
 * `tools/checkdocs.mjs` extends the same bidirectional treatment to README,
 * which was the last document in the repository quoting the config by hand — it
 * named a population that does not exist, a sudden-death constant that moved
 * two months ago, and a URL that silently does nothing.
 *
 * Both run from here rather than from their own lines in package.json, so that
 * `npm test` cannot pass without them. Both stand alone as commands too.
 *
 * What this file CANNOT check is whether a faithfully quoted number describes
 * the world correctly: "range 24 m" was read from config and was still wrong
 * about how far the beam reaches. That is `tools/checkbehaviour.mjs`.
 */

import {
  ARENA_HALF, BEAM_RADIUS, DEFAULT_BUILD, FAULT_LIMIT, KNOCKBACK_DRAG, MATCH_SECONDS,
  MAX_ORDERS_PER_THINK, MAX_QUERIES_PER_THINK, MEM_MAX_KEYS, OBSTACLES, SAY_MAX_CHARS,
  SKILLS, SPAWN_RADIUS, SUDDEN_DEATH_AT, SUDDEN_DEATH_RAMP, THINK_EVERY,
  THINK_HZ, THINK_TIMEOUT_MS, TICK_HZ, statsOf,
} from '../src/core/config.js';
import { brainPrompt, tracePrompt, TRACE_MARKS } from '../src/brain/prompt.js';
import { checkTactics } from './checktactics.mjs';
import { checkDocs } from './checkdocs.mjs';

import { FUEL_PER_THINK } from '../src/server/sandbox/instrument.js';

/** The same two formatters the prompt uses; computed here, never imported. */
const n = (v) => (Number.isInteger(v) ? String(v) : String(Math.round(v * 1000) / 1000));
const deg = (rad) => String(Math.round((rad * 180) / Math.PI));

/**
 * Every timing, as the WORLD serves it rather than as config declares it.
 *
 * The prompt emits the served figure — twelve of its eighteen timings are not
 * whole ticks and so are never the number a fighter experiences — and this is a
 * second, independent implementation of that arithmetic, for the same reason
 * the beam's reach is recomputed below rather than imported: a checker that
 * called the prompt's own helper would agree with it by construction.
 *
 * The phase clock carries: a phase ends on the first tick at or past its
 * length, and the overshoot starts the next phase, which is why smash's
 * recovery comes out SHORTER than its 0.28 while its wind-up comes out longer.
 * Countdowns (cooldown, i-frames, stun) are a different accumulator — one
 * subtraction per tick until it crosses zero — and float residue makes blink's
 * 3.9 and charge's 4.0 take one tick more than their exact multiple.
 *
 * What none of this can prove is that either implementation matches the sim.
 * That is `tools/checkbehaviour.mjs`, which fires each skill and counts ticks.
 */
const TICK = 1 / TICK_HZ;

const PHASE_FIELDS = {
  laser: ['windup', 'recover'],
  blink: [null, 'recover'],
  smash: ['windup', 'recover'],
  charge: ['windup', 'dashSeconds', 'recover'],
  jump: ['windup', 'airborne', 'recover'],
};

function servedPhases(name) {
  const s = SKILLS[name];
  const out = {};
  let clock = 0;
  for (const field of PHASE_FIELDS[name]) {
    const dur = field === null ? 0 : (s[field] || 0);
    let ticks = 0;
    while (clock < dur - 1e-9) { clock += TICK; ticks++; }
    if (field !== null) out[field] = ticks * TICK;
    clock -= dur;
  }
  return out;
}

function servedCountdown(seconds) {
  let left = seconds, ticks = 0;
  while (left > 0) { left = Math.max(0, left - TICK); ticks++; }
  return ticks * TICK;
}

/** Which of a skill's fields are timings, and which accumulator serves each. */
const COUNTDOWN_FIELDS = new Set(['cooldown', 'iframes', 'stun']);

/**
 * Per BODY, the fields the prompt must quote.
 *
 * Раньше это был «per fighter» список, и фигурировал он дважды — по разу на
 * каждую из двух литеральных записей. Записей нет: тело принадлежит существу,
 * и промпт печатает два тела, СВОЁ и ЧУЖОЕ, обоим бойцам. Поэтому и метки
 * теперь `body.own.*` / `body.enemy.*`, а не имя стороны арены: метка,
 * называющая сторону, врала бы о том, откуда взялись числа.
 *
 * `jumpHeight` в списке новый и появился не от щедрости: это ОСЬ
 * телосложения, за неё платят очками, и без неё нельзя посчитать, проходит ли
 * наземная доставка под прыгнувшим. Раскрывается она только тому, кому есть
 * чем прыгать, — см. `canHop` в `src/brain/prompt.js`, — и у эталонной
 * фикстуры §1 прыжок есть всегда, поэтому здесь она обязательна.
 */
const BODY_FIELDS = ['hp', 'radius', 'maxSpeed', 'accel', 'turnRate', 'mass', 'jumpHeight'];

/**
 * Per skill, the fields the prompt must quote — per skill and not one shared
 * list, because the omissions are deliberate. Blink has no `windup` line
 * because its wind-up is zero, and no `moveScale`/`turnScale` line because both
 * are 1.0; a shared list would demand sentences that say nothing, and the old
 * shared list only appeared to pass because "1" occurs in the prose.
 */
const SKILL_FIELDS = {
  laser: ['cooldown', 'windup', 'recover', 'damage', 'range', 'moveScale', 'turnScale'],
  blink: ['cooldown', 'recover', 'distance', 'iframes'],
  smash: ['cooldown', 'windup', 'recover', 'damage', 'range', 'knockback', 'moveScale', 'turnScale'],
  charge: ['cooldown', 'windup', 'recover', 'damage', 'dashSpeed', 'dashSeconds', 'knockback', 'stun', 'moveScale', 'turnScale'],
  jump: ['cooldown', 'windup', 'recover', 'airborne', 'moveScale', 'turnScale'],
};

/**
 * Label -> the text the prompt must have emitted under it.
 *
 * The derived entries are the ones worth reading. Each is a number the model
 * cannot get from any single config field and would otherwise have to infer:
 * how far the beam actually reaches, how wide the cone actually is. They are
 * recomputed here so that dropping a term in the prompt's own arithmetic — the
 * muzzle offset, say — is a mismatch rather than a matter of opinion.
 */
function expected() {
  const w = new Map();
  const put = (label, value, fmt = n) => w.set(label, fmt(value));

  /*
   * ОДНА боевая запись на оба тела — потому что это промпт ЭТАЛОНА.
   *
   * `brainPrompt(id)` зовётся без телосложений, а `statsOf(undefined)` отдаёт
   * телосложение по умолчанию: у эталонной фикстуры §1 своего тела нет, и оба
   * бойца в её промпте описаны одним и тем же телом. Это не «архетип обратно»
   * — от умолчания никто не наследуется, и существу игрока сюда приезжает его
   * собственная запись. Проверять её отсюда нечем: `tracePrompt` рендерит
   * ровно `brainPrompt(id)`, без второго и третьего аргумента.
   */
  const body = statsOf(DEFAULT_BUILD);
  for (const side of ['own', 'enemy']) {
    for (const k of BODY_FIELDS) put(`body.${side}.${k}`, body[k]);
    put(`body.${side}.timeToTopSpeed`, body.maxSpeed / body.accel);
    put(`body.${side}.halfTurnSeconds`, Math.PI / body.turnRate);
  }

  for (const [name, fields] of Object.entries(SKILL_FIELDS)) {
    const s = SKILLS[name];
    const phases = servedPhases(name);
    for (const k of fields) {
      if (COUNTDOWN_FIELDS.has(k)) put(`skills.${name}.${k}`, servedCountdown(s[k]));
      else if (k in phases) put(`skills.${name}.${k}`, phases[k]);
      else put(`skills.${name}.${k}`, s[k]);
    }
  }

  const laser = SKILLS.laser;
  /*
   * Стреляющее тело и то, по которому стреляют, — ОДНА И ТА ЖЕ запись.
   *
   * Здесь стояло `FIGHTERS[laser.owner]` и `FIGHTERS[opponentOf(...)]`, то
   * есть досягаемость считалась по двум разным литералам. Владелец умения в
   * `SKILLS` остался тегом фикстуры §1, а тело у обоих бойцов эталонного
   * промпта одно — то же самое `body` выше. Считать по нему честно, и это же
   * даёт `skills.laser.muzzle` одинаковым в обоих промптах, каким его и
   * печатает `src/brain/prompt.js`.
   */
  // The beam leaves `radius + 0.2` ahead of the centre; that 0.2 is a literal
  // in sim.js `resolveStrike` with no name in config, so it is written out in
  // both places rather than imported from one of them.
  const muzzle = body.radius + 0.2;
  put('skills.laser.muzzle', muzzle);
  put('skills.laser.maxHitDistance', muzzle + laser.range + body.radius + BEAM_RADIUS);
  put('beam.radius', BEAM_RADIUS);

  const smash = SKILLS.smash;
  /* То же самое, что у луча: бьющее тело и битое — одна запись. */
  const reach = smash.range + body.radius + body.radius;
  const touching = body.radius + body.radius;
  const widened = (d) => smash.halfAngle + Math.asin(body.radius / d);
  put('skills.smash.halfAngleDeg', smash.halfAngle, deg);
  put('skills.smash.maxHitDistance', reach);
  put('skills.smash.halfAngleAtReachDeg', widened(reach), deg);
  put('skills.smash.halfAngleAtContactDeg', widened(touching), deg);

  put('skills.charge.dashDistance', SKILLS.charge.dashSpeed * servedPhases('charge').dashSeconds);
  put('physics.knockbackDrag', KNOCKBACK_DRAG);

  for (const o of OBSTACLES) {
    for (const k of ['x', 'z', 'hx', 'hz']) put(`obstacles.${o.id}.${k}`, o[k]);
  }
  put('obstacles.count', OBSTACLES.length);
  put('obstacles.height', OBSTACLES[0].h);

  put('arena.half', ARENA_HALF);
  put('spawn.separation', SPAWN_RADIUS * 2);
  put('tick.hz', TICK_HZ);
  put('think.hz', THINK_HZ);
  // The world steps THINK_EVERY times before the first thought, so the first
  // `p.tick` a brain observes is that number and never 0.
  put('think.firstTick', THINK_EVERY);
  put('match.seconds', MATCH_SECONDS);
  put('suddenDeath.at', SUDDEN_DEATH_AT);
  put('suddenDeath.ramp', SUDDEN_DEATH_RAMP);
  put('suddenDeath.killsAt', SUDDEN_DEATH_AT + Math.sqrt(2 / SUDDEN_DEATH_RAMP));

  put('think.timeoutMs', THINK_TIMEOUT_MS);
  /* Настоящий предел мысли — топливо, а не часы: одинаковый бой обязан
     давать одинаковый лог на загруженной машине (A1/A2). Промпт называет
     именно его, значит и белый список обязан его знать. */
  put('think.fuel', FUEL_PER_THINK);
  put('orders.perThink', MAX_ORDERS_PER_THINK);
  put('queries.perThink', MAX_QUERIES_PER_THINK);
  put('faultLimit', FAULT_LIMIT);
  put('mem.maxKeys', MEM_MAX_KEYS);
  put('say.maxChars', SAY_MAX_CHARS);
  return w;
}

/**
 * The numerals the prompt may contain WITHOUT having read them from config,
 * each with the reason it is not a fact about the world.
 *
 * Every entry is a hole in the text->config direction, so the list is short on
 * purpose and each pattern is as narrow as it can be made. Note what is NOT
 * here: any decimal, and any integer above four that is not `api.ray`'s cap.
 * Those are the shapes a world constant takes, and one appearing in the prose
 * is the failure this direction exists to catch.
 */
const PROSE_NUMERALS = [
  [/^\s*\d+\.\s/gm, 'the numbering of the rules'],
  [/\^\d+/g, 'the exponent in a unit, "m/s^2"'],
  [/Math\.atan2/g, 'the name of a function'],
  [/capped at 60\b/g, 'api.ray clamps maxDist to 60 — a literal at sim.js `ray` with no name in config to import'],
  [/\b0\b/g, 'zero: heading 0, {0,0}, 0 hp, a cooldown of 0, the start of [0,1)'],
  [/\b1\b/g, 'one: the open end of [0,1)'],
];

let bad = 0;
const fail = (what) => { console.error(`  ${what}`); bad++; };

for (const id of ['octopus', 'gorilla']) {
  const { marked, plain, records } = tracePrompt(id);
  console.log(`checking the ${id} prompt (${plain.length} chars, ${records.length} emitted values)`);

  // A trace that rendered anything other than the real prompt would make every
  // assertion below true of a document nobody is ever handed.
  if (plain !== brainPrompt(id)) fail(`${id}: the traced render differs from brainPrompt(${id})`);

  // ── config -> text ───────────────────────────────────────────────────────
  const want = expected();
  const seen = new Map();
  for (const { label, text } of records) {
    if (!seen.has(label)) seen.set(label, new Set());
    seen.get(label).add(text);
  }
  for (const [label, texts] of seen) {
    if (!want.has(label)) { fail(`${id}: emitted "${label}" is not on the whitelist`); continue; }
    for (const t of texts) {
      if (t !== want.get(label)) fail(`${id}: ${label} emitted "${t}", config says "${want.get(label)}"`);
    }
  }
  for (const label of want.keys()) {
    if (!seen.has(label)) fail(`${id}: ${label} = ${want.get(label)} is never emitted`);
  }

  // ── text -> config ───────────────────────────────────────────────────────
  const bracket = new RegExp(`${TRACE_MARKS.in}[^${TRACE_MARKS.out}]*${TRACE_MARKS.out}`, 'g');
  let rest = marked.replace(bracket, '#');
  for (const [re] of PROSE_NUMERALS) rest = rest.replace(re, (m) => m.replace(/\d/g, '#'));
  for (const line of rest.split('\n')) {
    if (/\d/.test(line)) fail(`${id}: a numeral that did not come from config: ${line.trim()}`);
  }
}

if (bad === 0) console.log('prompt and config agree, in both directions.');

/*
 * ── ПРОМПТ СУЩЕСТВА С НАБОРОМ (D160) ──────────────────────────────────────
 *
 * Всё выше рендерит `brainPrompt(id)` БЕЗ второго аргумента, то есть промпт
 * захардкоженного эталона. Промпт существа с набором грамматики — а это все
 * существа игроков — не проверял ни один гейт, и в нём полгода жил дефект:
 * `bodyBlock` печатал мозгу `skills laser, blink, jump`, то есть четыре
 * имени, ни одного из которых у бойца нет. Модель писала `api.use('laser')`,
 * получала молчаливый отказ и не понимала, почему её умения не работают.
 *
 * Проверяется ровно то, что нельзя проверить глазами: в промпте существа с
 * набором не должно быть НИ ОДНОГО имени захардкоженного умения, и должны
 * быть все три имени из набора.
 */
{
  const { compileKit } = await import('../src/skills/compile.js');
  const KITS = [
    [{ delivery: 'jump', effects: ['shield'], element: 'frost' },
      { delivery: 'beam', effects: ['damage'], element: 'arc' },
      { delivery: 'zone', effects: ['burn'], element: 'ember' }],
    [{ delivery: 'cone', effects: ['damage', 'knock'], element: 'kinetic' },
      { delivery: 'bolt', effects: ['burn'], element: 'ember' },
      { delivery: 'self', effects: ['heal'], element: 'frost' }],
  ];
  const HARDCODED = ['laser', 'blink', 'smash', 'charge', 'jump'];
  for (const id of ['octopus', 'gorilla']) {
    for (const [i, kit] of KITS.entries()) {
      const built = compileKit(kit);
      if (built.problems.length) { fail(`kit ${i} does not compile: ${JSON.stringify(built.problems)}`); continue; }
      /* Третий аргумент — ТЕЛОСЛОЖЕНИЯ, а не множители размера: раньше здесь
         стояло `{ own: 1, enemy: 1 }`. Он опущен, потому что проверяется
         только строка `skills`, а тело обоим здесь и так достаётся по
         умолчанию. */
      const text = brainPrompt(id, { own: built.defs, enemy: built.defs });
      /* Строка `skills` — единственное место, где имена перечисляются списком;
         в остальном тексте слова вроде "blink" законно встречаются как проза. */
      for (const line of text.split('\n')) {
        if (!/^ {2}skills {2,}/.test(line)) continue;
        for (const name of HARDCODED) {
          if (new RegExp(`(^|[ ,])${name}([ ,]|$)`).test(line)) {
            fail(`${id}/kit${i}: строка «${line.trim()}» называет захардкоженное умение ${name}`);
          }
        }
        for (const k of Object.keys(built.defs)) {
          if (!line.includes(k)) fail(`${id}/kit${i}: строка «${line.trim()}» не называет ${k}`);
        }
      }
      for (const k of Object.keys(built.defs)) {
        if (!text.includes(`\n${k}\n`)) fail(`${id}/kit${i}: в промпте нет блока умения ${k}`);
      }
    }
  }
  if (bad === 0) console.log('a kit creature is told about its own three verbs and no others.');
}

// ── and the one thing that must NOT be there ───────────────────────────────
const tactics = await checkTactics({ log: (m) => console.log(m) });
for (const l of tactics.lines) console.log(l);
for (const f of tactics.failures) fail(f);
if (tactics.failures.length === 0) {
  console.log('every line of it is a capability, a constraint with its reason, a fact, or the objective.');
}

// ── and the document a reader meets first ──────────────────────────────────
const docs = checkDocs();
for (const l of docs.lines) console.log(l);
for (const f of docs.failures) fail(f);
if (docs.failures.length === 0) console.log('README and the repository agree.');

if (bad > 0) { console.error(`\n${bad} problem(s).`); process.exit(1); }
