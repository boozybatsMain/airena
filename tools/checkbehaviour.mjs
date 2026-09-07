#!/usr/bin/env node
/**
 * Does the world do what the prompt says it does?
 *
 *   node tools/checkbehaviour.mjs
 *
 * `tools/checkprompt.mjs` proves the prompt quotes config faithfully. That is
 * only half of the promise, and it is the easy half. A number can be read from
 * config, formatted correctly, checked in both directions, and still be a lie
 * about the world — because the sim does something with it that the sentence
 * around it does not mention.
 *
 * This exists because that happened twice, in the two disclosures a fighter's
 * whole positioning is built on:
 *
 *   the laser said "range 24 m". The beam leaves 1.2 m ahead of the shooter's
 *   centre, runs 24 m from there, carries 0.4 m of margin, and connects on the
 *   target's SURFACE — 26.85 m between centres. A brain that held station at
 *   25 m was standing inside a weapon it had been told could not reach it.
 *
 *   the smash said "a cone 55 degrees either side of your facing". `inCone`
 *   accepts a circular body whenever any part of it is inside the arc, so the
 *   half-angle is 66 degrees at full extension and 81 in contact, and the range
 *   is measured to the surface there too.
 *
 *   the timings said 0.28 s of smash wind-up for a phase the world serves in
 *   0.3 — the clock only turns over on ticks — and this file printed it as
 *   "ok" for the life of the project, because its tolerance was one whole
 *   tick and the error is two thirds of one. 0.02 s is 7% of the dodge window
 *   the model reasons against. The prompt now emits the SERVED duration and
 *   the tolerance here is `ROUND`, half of the last digit the prompt prints;
 *   nothing coarser is forgiven.
 *
 * Neither is a typo and no text checker could have found either one. So this
 * builds a controlled world, fires each skill, and MEASURES: the reach by
 * binary search, the cone by binary search, the wind-up, the recovery, the
 * i-frames, the stun and the cooldown by counting ticks. Nothing here is
 * computed from a formula — a probe that re-derived the geometry from config
 * would be the same mistake in a second file. The claims it measures against
 * are the ones the prompt actually emitted, taken from the tagged emitter, so
 * deleting a disclosure fails here as loudly as breaking one.
 *
 * ── and the half every player's creature reads ──────────────────────────────
 *
 * The five hardcoded skills are a measuring stand. Player creatures fight with
 * a compiled grammar kit, and until review r1 (F7) this file measured exactly
 * twelve numbers of that half — the reaches — and no timing, no schedule, no
 * window at all. It now also measures, per compiled ability: the served wind-up
 * and the order-to-recovered total, the cooldown, the mortar's splash by
 * binary search, the disc's tick count, period and whole-disc totals for damage
 * and for fire, the blink's i-frames and distance, how far a knock and a pull
 * actually move a body, how long an immunity window keeps a class in
 * `p.enemy.immune`, the heal's floor, cap and share each where it alone
 * decides, and the leap's three phases. Kit claims arrive by
 * the same route as the fixture's — `q(label, value)` from the emitter, under
 * `kit.<side>.<slot>.<field>` — so a card that stops printing one fails here
 * as "the prompt never states it" rather than passing unnoticed.
 */

import { SKILLS, TICK_HZ } from '../src/core/config.js';
import { createWorld, step } from '../src/core/sim.js';
import { tracePrompt } from '../src/brain/prompt.js';

const TICK = 1 / TICK_HZ;
/* Стороны арены — два цвета и больше ничего: ни вида, ни архетипа. */
const opponentOf = (id) => (id === 'blue' ? 'orange' : 'blue');

/**
 * What the prompt claims, by label.
 *
 * Read from the emitter rather than parsed out of the text: the label is what
 * ties "26.85" in a sentence about reach to the thing this file measures, and
 * a regex over the prose would break on the next rewording.
 */
function claims() {
  const m = new Map();
  for (const id of ['blue', 'orange']) {
    for (const { label, text } of tracePrompt(id).records) m.set(label, Number(text));
  }
  return m;
}

// ---------------------------------------------------------------------------
// the controlled world
// ---------------------------------------------------------------------------

/**
 * An empty arena.
 *
 * The blocks are removed rather than avoided. What is being measured is a
 * skill's own geometry; a probe that had to pick its way around cover would be
 * measuring the arena layout as well, and would start failing the day someone
 * moves a block. The walls stay, so the body clamp behaves as it does in a
 * match.
 */
function stage() {
  const w = createWorld(1);
  w.solids = w.solids.filter((s) => s.wall);
  w.obstacles = [];
  return w;
}

function place(f, x, z, heading) {
  f.x = x; f.z = z; f.px = x; f.pz = z;
  f.heading = heading; f.wantHeading = heading;
  f.vx = 0; f.vz = 0; f.kx = 0; f.kz = 0; f.y = 0;
}

/**
 * Fire one skill and watch every tick of it.
 *
 * `hold` re-pins both bodies at the top of each tick, before anything in the
 * sim runs. Without it the shooter drifts a few millimetres over a 0.65 s cast
 * and a binary search on distance converges on the drift instead of on the
 * geometry; with it, the reach probes measure exactly the configuration they
 * were asked about. It is off for the skills that are supposed to move
 * somebody — charge, blink, jump — where the movement IS the measurement.
 */
function fire({ shooter, skill, from, heading, target, hold = true, ticks = 220 }) {
  const w = stage();
  const me = w.fighters[shooter];
  const you = w.fighters[opponentOf(shooter)];
  const pin = () => {
    place(me, from.x, from.z, heading);
    place(you, target.x, target.z, heading + Math.PI);
  };
  pin();

  let ordered = false;
  const o = {
    startT: null, strikeT: null, hit: null, windupEndT: null, readyT: null, endT: null,
    airTicks: 0, iframeTicks: 0, stunTicks: 0, travelled: 0, damage: 0, blinked: 0,
  };
  const hpBefore = you.hp;

  const think = (id, p, api) => {
    if (id !== shooter || ordered) return;
    api.use(skill);
    ordered = true;
  };

  for (let k = 0; k < ticks; k++) {
    if (!ordered || hold) pin();
    step(w, think);
    if (!ordered) continue;
    /*
     * The world's clock, not `p.t`. Perception rounds the time to three
     * decimals (`round3` in `perceive`), which is invisible in a fight and was
     * worth 0.0005 s of error in every timing measured from here — enough on
     * its own to fail a comparison held to the prompt's own rounding. Nothing
     * here has to look at the world through the brain's eyes.
     */
    if (o.startT === null) o.startT = w.t;

    const act = me.act;
    if (act && act.phase === 'air') o.airTicks++;
    if (me.iframes > 0) o.iframeTicks++;
    if (you.stun > 0) o.stunTicks++;
    if (act && o.windupEndT === null && act.phase !== 'windup') o.windupEndT = w.t;
    if (!act && o.windupEndT === null) o.windupEndT = w.t;
    // The first tick on which the whole act is over. The act is torn down
    // inside `stepAct`, so this is the tick that finished it, not the one after.
    if (!act && o.endT === null) o.endT = w.t;
    o.travelled = Math.max(o.travelled, Math.hypot(me.x - from.x, me.z - from.z));

    for (const fx of w.fx) {
      if (fx.who !== shooter) continue;
      if (fx.kind === 'beam' || fx.kind === 'cone') { o.strikeT = w.t; o.hit = fx.hit; }
      if (fx.kind === 'blink') { o.strikeT = w.t; o.blinked = Math.hypot(fx.x1 - fx.x0, fx.z1 - fx.z0); }
    }
    if (o.readyT === null && me.cooldowns[skill] <= 0) o.readyT = w.t;
    if (o.readyT !== null && o.strikeT !== null) break;
  }
  o.damage = hpBefore - you.hp;
  return o;
}

/**
 * The largest value of `x` for which `probe(x)` still connects.
 *
 * Searched, never derived: this tool is only worth running if it does not know
 * the formula the prompt used. `lo` must hit and `hi` must miss, and both are
 * asserted — a bracket that was wrong at one end would otherwise return one of
 * its own endpoints and look like a measurement.
 */
function edgeOf(probe, lo, hi, eps) {
  if (!probe(lo)) throw new Error(`probe does not connect at ${lo}, so there is nothing to bracket`);
  if (probe(hi)) throw new Error(`probe still connects at ${hi}; widen the bracket`);
  while (hi - lo > eps) {
    const mid = (lo + hi) / 2;
    if (probe(mid)) lo = mid; else hi = mid;
  }
  return lo;
}

// ---------------------------------------------------------------------------
// the assertions
// ---------------------------------------------------------------------------

const said = claims();
let bad = 0;
let checked = 0;

/**
 * The wind-up a skill actually served, from the tick it was ordered on.
 *
 * The +TICK is not slop. `applyOrders` starts the act and `stepAct` runs later
 * in that SAME tick, so the tick carrying the order already advances the
 * wind-up by one step; the cooldown, decremented at the top of the next tick,
 * does not get that step and is measured without the term. Leaving it out
 * reported every wind-up one tick short, which is invisible on the laser's 20
 * ticks and a third of the jump's 3.
 */
const windupOf = (o) => (o.windupEndT - o.startT) + TICK;

/**
 * How far a timing may be off before it is wrong: half of the last digit the
 * prompt prints, and nothing else.
 *
 * It used to be one whole TICK — 0.0333 s — on the argument that the sim
 * resolves on tick boundaries and cannot be expected to hit a sub-tick figure.
 * That argument was true and it made this file blind: it printed
 * "smash wind-up measured 0.300 prompt says 0.28   ok" for a 7% error in the
 * dodge window the model reasons against, and the same for the charge wind-up,
 * the jump's airborne time and the laser's cast. The prompt now emits the
 * duration the world SERVES rather than the one config declares, so there is
 * no sub-tick figure left to forgive; all that survives is `n()` rounding to
 * three decimals. Anything larger than that is a disagreement again.
 */
const ROUND = 0.0005;

/**
 * @param tol the coarseness of this caller's own measurement and nothing more.
 *   A timing passes ROUND (or a small multiple, when the claim it is checked
 *   against is a sum of rounded numbers); a distance passes the width of its
 *   binary search.
 */
function agreeWith(map, what, label, measured, tol, unit) {
  checked++;
  if (!map.has(label)) {
    console.error(`  ${what}: the prompt never states ${label} — measured ${measured.toFixed(3)} ${unit}`);
    bad++;
    return;
  }
  const want = map.get(label);
  const off = Math.abs(measured - want);
  const line = `  ${what.padEnd(34)} measured ${measured.toFixed(3).padStart(7)} ${unit.padEnd(3)} prompt says ${String(want).padStart(6)}`;
  if (off <= tol) console.log(`${line}   ok`);
  else { console.error(`${line}   OFF BY ${off.toFixed(3)} (tolerance ${tol})`); bad++; }
}

/**
 * The same, against a claim the prompt only makes in pieces.
 *
 * A skill's total committed time is the one number that catches a phase this
 * file does not probe directly: recovery is not observable on its own — no
 * event fires when it starts — but wind-up plus recovery is exactly "how long
 * until the act is gone", and that is measurable to the tick. Each term is
 * separately rounded, so the tolerance is ROUND per term.
 */
function agreeSumWith(map, what, labels, measured, unit) {
  checked++;
  const missing = labels.filter((l) => !map.has(l));
  if (missing.length) {
    console.error(`  ${what}: the prompt never states ${missing.join(', ')}`);
    bad++;
    return;
  }
  const want = labels.reduce((a, l) => a + map.get(l), 0);
  const off = Math.abs(measured - want);
  const tol = ROUND * labels.length;
  const line = `  ${what.padEnd(34)} measured ${measured.toFixed(3).padStart(7)} ${unit.padEnd(3)} prompt says ${want.toFixed(3).padStart(6)}`;
  if (off <= tol) console.log(`${line}   ok`);
  else { console.error(`${line}   OFF BY ${off.toFixed(3)} (tolerance ${tol})`); bad++; }
}

/*
 * Обёртки над двумя утверждениями выше: у эталона §1 обещания читаются из
 * одной трассы на весь файл, у набора — из трассы ЭТОГО набора, потому что
 * метка `kit.own.<ячейка>.<поле>` описывает конкретное скомпилированное
 * умение, а наборов в этом файле несколько.
 */
const agree = (what, label, measured, tol, unit) => agreeWith(said, what, label, measured, tol, unit);
const agreeSum = (what, labels, measured, unit) => agreeSumWith(said, what, labels, measured, unit);

/** То же сравнение, но против величины, СЧИТАННОЙ здесь, а не названной меткой. */
function agreeNumber(what, want, measured, tol, unit) {
  checked++;
  const off = Math.abs(measured - want);
  const line = `  ${what.padEnd(34)} measured ${measured.toFixed(3).padStart(7)} ${unit.padEnd(3)} prompt says ${want.toFixed(3).padStart(6)}`;
  if (off <= tol) console.log(`${line}   ok`);
  else { console.error(`${line}   OFF BY ${off.toFixed(3)} (tolerance ${tol})`); bad++; }
}

/** How long the act existed, from the tick it was ordered on. Same +TICK as `windupOf`. */
const totalOf = (o) => (o.endT - o.startT) + TICK;

/**
 * ТЕЛА, ПО КОТОРЫМ ИДЁТ ЗАМЕР, БЕРУТСЯ СО СЦЕНЫ, А НЕ ИЗ КОНФИГА.
 *
 * Здесь стояло `FIGHTERS.octopus` / `FIGHTERS.gorilla` — две литеральные
 * записи, которые арена раздавала сторонам. Записей больше нет: числа бойца
 * приходят из его ТЕЛОСЛОЖЕНИЯ, и `stage()` — то есть `createWorld` без
 * `builds` — ставит на пол телосложение по умолчанию.
 *
 * Радиусы читаются прямо с этой сцены, а не пересчитываются из конфига, и это
 * не удобство: шапка файла запрещает второй экземпляр той же арифметики. Зонд
 * обязан мерить ровно то тело, по которому он стреляет, — иначе он однажды
 * будет искать границу конуса вокруг радиуса, которого на арене нет.
 */
const { blue: BLUE, orange: ORANGE } = (() => {
  const w = stage();
  return { blue: w.fighters.blue.def, orange: w.fighters.orange.def };
})();
const EAST = Math.PI / 2; // heading convention: 0 faces +Z, increasing toward +X
const touching = BLUE.radius + ORANGE.radius;

// ── laser ──────────────────────────────────────────────────────────────────
{
  const shoot = (d) => fire({
    shooter: 'blue', skill: 'laser',
    from: { x: -13.5, z: 0 }, heading: EAST, target: { x: -13.5 + d, z: 0 },
  });
  const reach = edgeOf((d) => shoot(d).hit, touching, 30, 1e-4);
  const near = shoot(touching + 1);
  agree('laser reach, centre to centre', 'skills.laser.maxHitDistance', reach, 0.01, 'm');
  agree('laser wind-up', 'skills.laser.windup', windupOf(near), ROUND, 's');
  agreeSum('laser cast + recovery', ['skills.laser.windup', 'skills.laser.recover'], totalOf(near), 's');
  agree('laser cooldown', 'skills.laser.cooldown', near.readyT - near.startT, ROUND, 's');
  agree('laser damage', 'skills.laser.damage', near.damage, 1e-6, 'hp');
}

// ── smash ──────────────────────────────────────────────────────────────────
{
  const swing = (d, bearing) => fire({
    shooter: 'orange', skill: 'smash',
    from: { x: 0, z: 0 }, heading: 0,
    target: { x: Math.sin(bearing) * d, z: Math.cos(bearing) * d },
  });
  const reach = edgeOf((d) => swing(d, 0).hit, touching, 20, 1e-4);
  const near = swing(touching + 0.5, 0);
  agree('smash reach, centre to centre', 'skills.smash.maxHitDistance', reach, 0.01, 'm');
  agree('smash wind-up', 'skills.smash.windup', windupOf(near), ROUND, 's');
  agreeSum('smash wind-up + recovery', ['skills.smash.windup', 'skills.smash.recover'], totalOf(near), 's');
  agree('smash cooldown', 'skills.smash.cooldown', near.readyT - near.startT, ROUND, 's');
  agree('smash damage', 'skills.smash.damage', near.damage, 1e-6, 'hp');

  /*
   * Half a millimetre inside the reach, because the range test is `d > range`
   * and a probe that sits exactly on an inclusive boundary is measuring the
   * float, not the cone. It costs 0.001 of a degree of widening.
   */
  const wide = (d) => (edgeOf((a) => swing(d, a).hit, 0, Math.PI, 1e-5) * 180) / Math.PI;
  agree('smash half-angle at full reach', 'skills.smash.halfAngleAtReachDeg', wide(reach - 5e-4), 0.55, 'deg');
  agree('smash half-angle in contact', 'skills.smash.halfAngleAtContactDeg', wide(touching), 0.55, 'deg');
}

// ── charge ─────────────────────────────────────────────────────────────────
{
  // Nothing in the lane: the dash has to run its full time to be measured, so
  // the target is parked off to one side rather than in front.
  const open = fire({
    shooter: 'orange', skill: 'charge', hold: false,
    from: { x: -16, z: 0 }, heading: EAST, target: { x: 0, z: 16 },
  });
  agree('charge wind-up', 'skills.charge.windup', windupOf(open), ROUND, 's');
  agreeSum('charge, wind-up to recovered',
    ['skills.charge.windup', 'skills.charge.dashSeconds', 'skills.charge.recover'], totalOf(open), 's');
  agree('charge cooldown', 'skills.charge.cooldown', open.readyT - open.startT, ROUND, 's');
  // One tick of travel is 0.5 m, and the dash phase can only end on a tick.
  agree('charge dash distance', 'skills.charge.dashDistance', open.travelled, SKILLS.charge.dashSpeed * TICK, 'm');

  const onto = fire({
    shooter: 'orange', skill: 'charge', hold: false,
    from: { x: -16, z: 0 }, heading: EAST, target: { x: -8, z: 0 },
  });
  agree('charge damage', 'skills.charge.damage', onto.damage, 1e-6, 'hp');
  agree('charge stun, on the target', 'skills.charge.stun', onto.stunTicks * TICK, ROUND, 's');
}

// ── blink ──────────────────────────────────────────────────────────────────
{
  const away = fire({
    shooter: 'blue', skill: 'blink', hold: false,
    from: { x: -10, z: 0 }, heading: EAST, target: { x: 10, z: 10 },
  });
  agree('blink distance', 'skills.blink.distance', away.blinked, 0.01, 'm');
  agree('blink i-frames', 'skills.blink.iframes', away.iframeTicks * TICK, ROUND, 's');
  agreeSum('blink recovery', ['skills.blink.recover'], totalOf(away), 's');
  agree('blink cooldown', 'skills.blink.cooldown', away.readyT - away.startT, ROUND, 's');
}

// ── jump ───────────────────────────────────────────────────────────────────
{
  const j = fire({
    shooter: 'blue', skill: 'jump', hold: false,
    from: { x: -10, z: 0 }, heading: EAST, target: { x: 10, z: 10 },
  });
  agree('jump wind-up', 'skills.jump.windup', windupOf(j), ROUND, 's');
  agree('jump airborne', 'skills.jump.airborne', j.airTicks * TICK, ROUND, 's');
  agreeSum('jump, crouch to landed',
    ['skills.jump.windup', 'skills.jump.airborne', 'skills.jump.recover'], totalOf(j), 's');
  agree('jump cooldown', 'skills.jump.cooldown', j.readyT - j.startT, ROUND, 's');
}


// ---------------------------------------------------------------------------
// ── ДОСЯГАЕМОСТЬ УМЕНИЙ НАБОРА ─────────────────────────────────────────────
// ---------------------------------------------------------------------------
/*
 * Всё выше меряет ПЯТЬ ЗАХАРДКОЖЕННЫХ УМЕНИЙ — стенд §1, на котором дерутся
 * шесть эталонных мозгов. Существа игроков дерутся не ими: у них набор
 * грамматики, и до сих пор его геометрию не мерил никто.
 *
 * Это ровно тот угол, из-за которого написан весь файл. Докстринг наверху
 * называет свой повод: луч объявлял «range 24 m» для оружия, достающего на
 * 26.85 м, и мозг, вставший на 25 м, стоял внутри него. Карточка набора
 * печатала ТОЛЬКО `range` — то есть повторяла ту же ошибку на пути, по
 * которому идут все игроки. Измерено двоичным поиском по факту урона:
 *
 *     конус  range 3.4  -> 4.9   м между центрами  (+44%)
 *     навес  range 15   -> 18.85 м                 (+26%)
 *     луч    range 24   -> 27.6  м                 (+15%)
 *
 * Занижение действует в одну сторону: боец, которому сказали «3.4», подходит
 * на 3.4 и ближе — то есть вплотную. `src/brain/prompt.js` теперь печатает
 * строку `reach`, а этот раздел её МЕРЯЕТ.
 *
 * Число берётся ИЗ ТЕКСТА промпта, а не пересчитывается по формуле: формула в
 * гейте — это та же ошибка во втором файле, о чём здесь сказано уже дважды.
 * `q()` тут не помощник — карточка набора рендерится через `n()` и в трассу не
 * попадает, поэтому строка разбирается по своей метке.
 *
 * Доставки без цели (`blink`, `self`, `jump`) не проверяются: у них нет
 * дальности попадания, и `reachLine` для них ничего не печатает.
 */
{
  const { compileKit } = await import('../src/skills/compile.js');
  const { brainPrompt } = await import('../src/brain/prompt.js');

  /* Два добивающих умения без геометрии: набор обязан быть из трёх, и грамматика
     не принимает двух одинаковых (`kit_dup`), поэтому они разные. Ни одно из них
     не участвует в замере — у обоих цели нет. */
  const FILLER = [
    { delivery: 'self', effects: ['heal'], element: 'frost' },
    { delivery: 'blink', effects: ['cleanse'], element: 'void' },
  ];
  /* Тела: одинаковые и РАЗНЫЕ. Разные — потому что в сумму входят радиусы
     двух конкретных тел, и на паре равных радиусов перепутанные местами
     слагаемые дали бы тот же ответ. */
  const BODIES = [null, { own: { radius: 1.2 }, enemy: { radius: 1.8 } }];

  /** Число из строки `reach` того блока набора, что описывает это умение. */
  function reachSaid(text, name) {
    const block = text.split('\n\n').find((b) => b.startsWith(`${name}\n`));
    if (!block) return null;
    const line = block.split('\n').find((l) => /^ {2}reach {2,}/.test(l));
    if (!line) return null;
    const m = line.match(/([\d.]+) m between the two centres/);
    return m ? Number(m[1]) : null;
  }

  /**
   * Один выстрел умения набора по цели, стоящей в `dist` метрах прямо по курсу.
   *
   * Тела пришпилены на каждом тике — по той же причине, что и в `fire` выше:
   * двоичный поиск иначе сходится к сносу кастера, а не к геометрии. Рывок
   * пришпиливать нельзя, он ею и движется.
   */
  function lands(defs, name, kind, dist, builds) {
    /* `brainPrompt` берёт телосложения как { own, enemy }, `createWorld` — по
       СТОРОНАМ. Перекладка здесь, чтобы обе стороны сравнения смотрели на одно
       и то же тело: замер по умолчанию против промпта с телосложением — это
       сравнение двух разных бойцов. */
    const w = createWorld(1, {
      kits: { blue: defs, orange: defs },
      builds: builds ? { blue: builds.own, orange: builds.enemy } : null,
    });
    w.solids = w.solids.filter((s) => s.wall);
    w.obstacles = [];
    const me = w.fighters.blue, you = w.fighters.orange;
    const put = (f, x, z, h) => { f.x = x; f.z = z; f.px = x; f.pz = z; f.heading = h; f.wantHeading = h; f.vx = 0; f.vz = 0; f.kx = 0; f.kz = 0; f.y = 0; };
    /* От -9 по +Z: самая длинная досягаемость здесь — луч, 27.6 м, и она
       обязана уместиться внутри арены, иначе меряется стена. */
    const pin = () => { put(me, 0, -9, 0); put(you, 0, -9 + dist, Math.PI); };
    pin();
    const hp0 = you.hp;
    let ordered = false;
    const think = (id, p, api) => { if (id === 'blue' && !ordered) { api.use(name); ordered = true; } };
    /* Зона живёт 3 с и бьёт раз в полсекунды; 200 шагов покрывают и её. */
    for (let k = 0; k < 200; k++) { if (kind !== 'dash') pin(); step(w, think); }
    return hp0 - you.hp > 0;
  }

  const KINDS = ['beam', 'cone', 'bolt', 'lob', 'zone', 'dash'];
  for (const builds of BODIES) {
    const tag = builds ? 'unequal bodies' : 'equal bodies';
    for (const kind of KINDS) {
      const built = compileKit([{ delivery: kind, effects: ['damage'], element: 'kinetic' }, ...FILLER]);
      if (built.problems.length) {
        console.error(`  kit ${kind}: does not compile — ${JSON.stringify(built.problems)}`);
        bad++; checked++;
        continue;
      }
      const name = Object.keys(built.defs).find((k) => built.defs[k].kind === kind);
      const text = brainPrompt('blue', { own: built.defs, enemy: built.defs }, builds);
      const want = reachSaid(text, name);
      checked++;
      if (want === null) {
        console.error(`  kit ${kind} reach (${tag}): the prompt prints no reach line for it`);
        bad++;
        continue;
      }
      /* Нижняя граница поиска — вплотную, верхняя — заведомо дальше любой
         досягаемости. Ширина поиска и есть допуск: своей ошибки у замера нет. */
      const got = edgeOf((d) => lands(built.defs, name, kind, d, builds), 0.6, 31, 1e-3);
      const off = Math.abs(got - want);
      const line = `  kit ${kind} reach (${tag})`.padEnd(36)
        + ` measured ${got.toFixed(3).padStart(7)} m   prompt says ${String(want).padStart(6)}`;
      if (off <= 2e-3) console.log(`${line}   ok`);
      else { console.error(`${line}   OFF BY ${off.toFixed(3)}`); bad++; }
    }
  }
}

// ---------------------------------------------------------------------------
// ── ПОЛЕ `kit` В ПЕРЦЕПЦИИ: ОБЕЩАНО СТОЛЬКО ЖЕ, СКОЛЬКО ОТДАНО ─────────────
// ---------------------------------------------------------------------------
/*
 * §5 промпта перечисляет поля `p.self.kit[имя]` поимённо, и это ОБЕЩАНИЕ. Оно
 * стоило дорого до того, как было дано: из 62 мозгов, написанных моделью, ни
 * один не прочитал `p.self.kit` — потому что промпт не произносил слова `kit`
 * ни разу, а `kitView` в `sim.js` отдавал это поле с самого появления F10.
 * 61 мозг из 77 вместо этого сравнивает `dist` с вписанным числом.
 *
 * Обещание, данное текстом, проверяется по живому объекту перцепции: каждое
 * названное поле обязано существовать, и ни одного НЕназванного там быть не
 * должно — иначе §5 снова описывает не тот объект, который приезжает.
 */
{
  const { compileKit } = await import('../src/skills/compile.js');
  const { brainPrompt } = await import('../src/brain/prompt.js');
  const { perceive } = await import('../src/core/sim.js');

  /* Набор, вытягивающий ВСЕ необязательные поля `kitView`: range/speed (навес),
     radius/duration/ticks (зона), distance (мигание), halfAngle (конус),
     airborne (прыжок), damage (везде, где есть урон). */
  /* Три набора, потому что в один все девять доставок не помещаются, а
     проверяется ОБЪЕДИНЕНИЕ полей: `splash` бывает только у навеса,
     `halfAngle` только у конуса, `ticks` и `duration` только у зоны,
     `airborne` только у прыжка, `distance` у мигания и рывка. */
  const KITS = [
    [{ delivery: 'zone', effects: ['damage'], element: 'acid' },
      { delivery: 'cone', effects: ['damage'], element: 'kinetic' },
      { delivery: 'jump', effects: ['shield'], element: 'frost' }],
    [{ delivery: 'lob', effects: ['burn'], element: 'ember' },
      { delivery: 'blink', effects: ['cleanse'], element: 'void' },
      { delivery: 'beam', effects: ['damage'], element: 'arc' }],
    [{ delivery: 'dash', effects: ['knock'], element: 'kinetic' },
      { delivery: 'bolt', effects: ['damage'], element: 'acid' },
      { delivery: 'self', effects: ['heal'], element: 'frost' }],
  ];
  const built = compileKit(KITS[0]);
  const w = createWorld(1, { kits: { blue: built.defs, orange: built.defs } });
  const p = perceive(w, 'blue');
  const text = brainPrompt('blue', { own: built.defs, enemy: built.defs });

  checked++;
  if (!p.self.kit || !p.enemy.kit) {
    console.error('  p.self.kit / p.enemy.kit: the sim does not serve them at all');
    bad++;
  } else {
    /* Имена полей выписаны из строки §5 — из ТЕКСТА, а не из второго списка
       рядом: список рядом согласился бы сам с собой. */
    const block = text.slice(text.indexOf('  .kit '), text.indexOf('\n\np.enemy')).replace(/\s+/g, ' ');
    const always = block.match(/\{([^}]*)\}/);
    const maybe = block.match(/whichever of ([^.]*?) its delivery/);
    const said2 = new Set([...(always ? always[1] : '').split(','), ...(maybe ? maybe[1] : '').split(',')]
      .map((w) => w.trim()).filter(Boolean));
    const served2 = new Set();
    for (const grammar of KITS) {
      const one = compileKit(grammar);
      const w2 = createWorld(1, { kits: { blue: one.defs, orange: one.defs } });
      for (const d of Object.values(perceive(w2, 'blue').self.kit)) for (const k of Object.keys(d)) served2.add(k);
    }
    const missing = [...served2].filter((k) => !said2.has(k));
    const invented = [...said2].filter((k) => !served2.has(k));
    if (missing.length) { console.error(`  p.self.kit serves fields the prompt does not name: ${missing.join(', ')}`); bad++; }
    else if (invented.length) { console.error(`  the prompt names fields p.self.kit does not serve: ${invented.join(', ')}`); bad++; }
    else console.log(`  p.self.kit fields                  measured ${String(served2.size).padStart(7)}     prompt names ${said2.size}   ok`);
  }

  /* И обратное: у бойца БЕЗ набора поле пустое, поэтому промпт без набора не
     смеет о нём говорить. Иначе это строка про null — тот же вред, что D160
     нашёл в строке `skills`. */
  checked++;
  const bare = createWorld(1);
  if (perceive(bare, 'blue').self.kit !== null) {
    console.error('  a fighter without a kit: p.self.kit is not null, so §1 would need the line after all');
    bad++;
  } else if (brainPrompt('blue').includes('.kit')) {
    console.error('  the kitless prompt talks about p.self.kit, which is null for its reader');
    bad++;
  } else {
    console.log('  a fighter without a kit                        p.self.kit null, and the prompt is silent   ok');
  }
}

// ---------------------------------------------------------------------------
// ── КАРТОЧКИ НАБОРА: ТАЙМИНГИ, ИМПУЛЬСЫ, ОКНА И РАСПИСАНИЯ ─────────────────
// ---------------------------------------------------------------------------
/*
 * Всё выше меряет ГЕОМЕТРИЮ набора — двенадцать досягаемостей — и ни одного
 * его тайминга. Это ровно та дыра, которую нашёл обзор r1 (F7): карточка
 * грамматики печатает замах, откат, кулдаун, неуязвимость, расписание диска,
 * дальность толчка, окно иммунитета и три числа лечения, и ни одно из них не
 * сверялось с миром. Числа при этом стали трассируемыми (`q()` с меткой
 * `kit.<сторона>.<ячейка>.<поле>`), поэтому здесь они читаются ПО МЕТКЕ, как
 * и у эталона §1, а не выкусываются регуляркой из прозы.
 *
 * Каждый набор ставится обеим сторонам, чтобы метка `kit.own.*` описывала то
 * самое тело, по которому идёт замер.
 */
{
  const { compileKit } = await import('../src/skills/compile.js');

  /** Что промпт обещает про ЭТОТ набор, по меткам. */
  function kitSaid(defs) {
    const m = new Map();
    for (const { label, text } of tracePrompt('blue', { own: defs, enemy: defs }).records) {
      m.set(label, Number(text));
    }
    return m;
  }

  /** Арена без блоков, с этим набором у обоих. */
  function kitStage(defs) {
    const w = createWorld(1, { kits: { blue: defs, orange: defs } });
    w.solids = w.solids.filter((s) => s.wall);
    w.obstacles = [];
    return w;
  }

  const put = (f, x, z, h) => {
    f.x = x; f.z = z; f.px = x; f.pz = z;
    f.heading = h; f.wantHeading = h;
    f.vx = 0; f.vz = 0; f.kx = 0; f.kz = 0; f.y = 0;
  };

  /**
   * Один каст умения набора, тик за тиком.
   *
   * `hold` пришпиливает оба тела в начале каждого тика — та же причина, что и
   * у `fire` выше: иначе замер сходится к сносу кастера. Отключается там, где
   * движение и ЕСТЬ измеряемое (рывок, прыжок, мигание, толчок).
   */
  function cast(defs, name, { at = null, dist = 6, hold = true, ticks = 260, holdFoe = false, foeAt = null } = {}) {
    const w = kitStage(defs);
    const me = w.fighters.blue, you = w.fighters.orange;
    const home = { x: 0, z: -9 };
    const foe = foeAt || { x: 0, z: -9 + dist };
    const pin = () => { put(me, home.x, home.z, 0); put(you, foe.x, foe.z, Math.PI); };
    pin();
    const hp0 = you.hp;
    const o = {
      startT: null, windupEndT: null, endT: null, readyT: null,
      airTicks: 0, iframeTicks: 0, damage: 0, hits: [], moved: 0, foeMoved: 0,
      events: [], foeEvents: [],
    };
    let ordered = false;
    const think = (id, p, api) => {
      if (id === 'blue') {
        for (const e of p.events) o.events.push({ t: w.t, ...e });
        if (!ordered) { if (at) api.use(name, at); else api.use(name); ordered = true; }
      } else for (const e of p.events) o.foeEvents.push({ t: w.t, ...e });
    };
    let hpWas = you.hp;
    for (let k = 0; k < ticks; k++) {
      if (!ordered || hold) pin();
      else if (holdFoe) put(you, foe.x, foe.z, Math.PI);
      step(w, think);
      if (!ordered) continue;
      if (o.startT === null) o.startT = w.t;
      const act = me.act;
      if (act && act.phase === 'air') o.airTicks++;
      if (me.iframes > 0) o.iframeTicks++;
      if (act && o.windupEndT === null && act.phase !== 'windup') o.windupEndT = w.t;
      if (!act && o.windupEndT === null) o.windupEndT = w.t;
      if (!act && o.endT === null) o.endT = w.t;
      if (o.readyT === null && me.cooldowns[name] <= 0) o.readyT = w.t;
      if (you.hp < hpWas - 1e-9) { o.hits.push({ t: w.t, amount: hpWas - you.hp }); hpWas = you.hp; }
      o.moved = Math.max(o.moved, Math.hypot(me.x - home.x, me.z - home.z));
      o.foeMoved = Math.max(o.foeMoved, Math.hypot(you.x - foe.x, you.z - foe.z));
    }
    o.damage = hp0 - you.hp;
    return o;
  }

  const windupOfKit = (o) => (o.windupEndT - o.startT) + TICK;
  const totalOfKit = (o) => (o.endT - o.startT) + TICK;

  /**
   * Каждый набор здесь существует ради одного-двух замеров, и в нём ровно те
   * доставки, которые эти замеры трогают. Три ячейки — потолок, поэтому
   * наборов несколько; лишние ячейки заполняются аурой и миганием, у которых
   * своей геометрии нет.
   */
  const SETS = {
    /* Замах/откат/кулдаун трёх разных форм, включая купленный прыжок. */
    timings: [{ delivery: 'beam', effects: ['damage'], element: 'arc' },
      { delivery: 'lob', effects: ['damage'], element: 'ember' },
      { delivery: 'jump', effects: ['shield'], element: 'frost' }],
    /* Диск: расписание тиков и сумма по всему диску. */
    field: [{ delivery: 'zone', effects: ['damage'], element: 'acid' },
      { delivery: 'self', effects: ['heal'], element: 'frost' },
      { delivery: 'blink', effects: ['cleanse'], element: 'void' }],
    /* Мигание: неуязвимость и откат. */
    blink: [{ delivery: 'blink', effects: ['cleanse'], element: 'void' },
      { delivery: 'self', effects: ['heal'], element: 'frost' },
      { delivery: 'beam', effects: ['damage'], element: 'arc' }],
    /* Толчок и рывок: дальность импульса. */
    impulse: [{ delivery: 'cone', effects: ['knock'], element: 'kinetic' },
      { delivery: 'bolt', effects: ['pull'], element: 'void' },
      { delivery: 'self', effects: ['heal'], element: 'frost' }],
    /* Диск с огнём: обновление вместо продления и итог по всему диску. */
    burnfield: [{ delivery: 'zone', effects: ['burn'], element: 'ember' },
      { delivery: 'self', effects: ['heal'], element: 'frost' },
      { delivery: 'blink', effects: ['cleanse'], element: 'void' }],
    /* Оглушение: длина окна иммунитета. */
    control: [{ delivery: 'bolt', effects: ['stun'], element: 'void' },
      { delivery: 'self', effects: ['heal'], element: 'frost' },
      { delivery: 'blink', effects: ['cleanse'], element: 'void' }],
  };
  const built = {};
  for (const [k, grammar] of Object.entries(SETS)) {
    const b = compileKit(grammar);
    if (b.problems.length) { console.error(`  kit set ${k} does not compile: ${JSON.stringify(b.problems)}`); bad++; checked++; }
    built[k] = b.defs;
  }
  const slotOf = (defs, kind) => Object.keys(defs).find((k2) => defs[k2].kind === kind);

  // ── замах, откат, кулдаун ────────────────────────────────────────────────
  {
    const defs = built.timings;
    for (const kind of ['beam', 'lob', 'jump']) {
      const name = slotOf(defs, kind);
      const said2 = kitSaid(defs);
      const o = cast(defs, name, { hold: kind !== 'jump', dist: 5 });
      const L = (f) => `kit.own.${name}.${f}`;
      agreeWith(said2, `kit ${kind} wind-up`, L('windup'), windupOfKit(o), ROUND, 's');
      agreeSumWith(said2, `kit ${kind}, order to recovered`,
        kind === 'jump' ? [L('windup'), L('airborne'), L('recover')] : [L('windup'), L('recover')],
        totalOfKit(o), 's');
      agreeWith(said2, `kit ${kind} cooldown`, L('cooldown'), o.readyT - o.startT, ROUND, 's');
      if (kind === 'jump') agreeWith(said2, 'kit leap airborne', L('airborne'), o.airTicks * TICK, ROUND, 's');
    }
  }

  // ── диск: сколько тиков, когда, и сколько всего ──────────────────────────
  {
    const defs = built.field;
    const name = slotOf(defs, 'zone');
    const said2 = kitSaid(defs);
    const o = cast(defs, name, { dist: 1.6, ticks: 300 });
    agreeWith(said2, 'field ticks', `kit.own.${name}.zoneTicks`, o.hits.length, 1e-9, '');
    agreeWith(said2, 'field, whole disc', `kit.own.${name}.wholeDisc`, o.damage, 0.01, 'hp');
    /* Период: расстояние между первым и последним тиком, делённое на число
       промежутков. Меряется как расписание, а не как одно число, потому что
       обещание карточки — «на шаге приземления и каждые полсекунды после». */
    checked++;
    const span = o.hits.length > 1 ? (o.hits[o.hits.length - 1].t - o.hits[0].t) / (o.hits.length - 1) : NaN;
    const wantPeriod = said2.get('zone.period');
    if (Math.abs(span - wantPeriod) <= TICK + ROUND) {
      console.log(`  field tick period                  measured ${span.toFixed(3).padStart(7)} s   prompt says ${String(wantPeriod).padStart(6)}   ok`);
    } else {
      console.error(`  field tick period                  measured ${span.toFixed(3)} s   prompt says ${wantPeriod}   OFF`);
      bad++;
    }
  }

  // ── навес: круг поражения в точке падения ────────────────────────────────
  /*
   * `splash` — единственное слагаемое досягаемости навеса, которое сама
   * досягаемость не проверяет: 15 + 1.8 + 1.5 даёт те же 18.3, если ошибиться
   * в двух числах в разные стороны. Меряется отдельно и по своей геометрии:
   * снаряд кладётся в НАЗВАННУЮ точку, а цель отодвигается вбок, пока не
   * перестанет получать урон. Граница — `splash` плюс радиус цели, ровно как
   * обещает карточка.
   */
  {
    const defs = built.timings;
    const name = slotOf(defs, 'lob');
    const said2 = kitSaid(defs);
    const foeR = kitStage(defs).fighters.orange.def.radius;
    const caught = (off) => cast(defs, name, {
      at: { x: 0, z: 0 }, foeAt: { x: off, z: 0 }, ticks: 140,
    }).damage > 0;
    const edge = edgeOf(caught, 0.1, 8, 1e-3);
    agreeNumber('lob splash, to their surface', said2.get(`kit.own.${name}.splash`) + foeR, edge, 2e-3, 'm');
  }

  // ── диск с огнём: сколько всего горит и сколько это стоит ────────────────
  /*
   * Тики диска ОБНОВЛЯЮТ пожар, а не удлиняют его, поэтому «весь диск» здесь —
   * это не rate × ticks, а rate × (от первого тика до последнего + одна
   * длительность огня). Карточка печатает обе половины, и обе меряются.
   */
  {
    const defs = built.burnfield;
    const name = slotOf(defs, 'zone');
    const said2 = kitSaid(defs);
    const o = cast(defs, name, { dist: 1.6, ticks: 400 });
    agreeWith(said2, 'burn field, whole disc', `kit.own.${name}.wholeDiscBurn`, o.damage, 0.4, 'hp');
    const first = o.hits[0].t, last = o.hits[o.hits.length - 1].t;
    agreeWith(said2, 'burn field, seconds alight', `kit.own.${name}.burnSeconds`, (last - first) + TICK, 2 * TICK, 's');
  }

  // ── мигание: неуязвимость ────────────────────────────────────────────────
  {
    const defs = built.blink;
    const name = slotOf(defs, 'blink');
    const said2 = kitSaid(defs);
    const o = cast(defs, name, { hold: false, dist: 14 });
    agreeWith(said2, 'kit blink i-frames', `kit.own.${name}.iframes`, o.iframeTicks * TICK, ROUND, 's');
    agreeWith(said2, 'kit blink distance', `kit.own.${name}.distance`, o.moved, 0.05, 'm');
  }

  // ── импульсы: дальность толчка и притяжения ──────────────────────────────
  /*
   * Карточка обещает ПОТОЛОК — «a shade under v²/2a» — и называет причину:
   * импульс обнуляется, как только падает ниже `KNOCKBACK_MIN`, а мир двигает
   * тело целыми шагами. Значит и проверять надо неравенство, а не равенство:
   * пройденное обязано быть НЕ БОЛЬШЕ обещанного и не сильно меньше. Нижняя
   * граница взята с запасом от измеренного (обе формы дают ~94% потолка) —
   * она ловит обещание, разошедшееся с миром вдвое, и не ловит тик округления.
   */
  {
    const defs = built.impulse;
    const said2 = kitSaid(defs);
    for (const kind of ['cone', 'bolt']) {
      const name = slotOf(defs, kind);
      /* Толчок меряется вплотную — конус иначе не достаёт, — а притяжение с
         десяти метров: цель тянет К кастеру, и с трёх метров она упирается в
         его тело раньше, чем импульс иссякнет, то есть замер упёрся бы в
         коллизию, а не в дальность. */
      const o = cast(defs, name, { hold: false, dist: kind === 'cone' ? 3.2 : 10, ticks: 160 });
      const want = said2.get(`kit.own.${name}.effect.${kind === 'cone' ? 'knock' : 'pull'}.travel`);
      checked++;
      const tag = `${kind === 'cone' ? 'knock' : 'pull'} travel`;
      const line = `  kit ${tag}`.padEnd(36) + ` measured ${o.foeMoved.toFixed(3).padStart(7)} m   prompt says ${String(want).padStart(6)}`;
      if (o.foeMoved <= want + 1e-6 && o.foeMoved >= want * 0.85) console.log(`${line}   ok`);
      else { console.error(`${line}   OUTSIDE "a shade under"`); bad++; }
    }
  }

  // ── окно иммунитета: пока p.enemy.immune называет класс ─────────────────
  /*
   * Обещание карточки и раздела «Nothing stacks» — «arms 'act' and 'move'
   * immunity FROM THE MOMENT IT LANDS until duration + immune later», и что
   * `p.self.immune`/`p.enemy.immune` перечисляют классы ВСЁ окно, а не после
   * контроля. Это и меряется: от тика, на котором в перцепции появился класс
   * 'act', до первого тика, на котором его там больше нет.
   *
   * Не повторным кастом. Повторный каст меряет кулдаун болта (2.2 с) вместе с
   * его полётом, а не окно: второе попадание ложится на сетку кулдауна и
   * выдаёт 4.4 с там, где окно равно 4.0.
   */
  {
    const { perceive } = await import('../src/core/sim.js');
    const defs = built.control;
    const name = slotOf(defs, 'bolt');
    const said2 = kitSaid(defs);
    const w = kitStage(defs);
    const me = w.fighters.blue, you = w.fighters.orange;
    let ordered = false;
    const think = (id, p, api) => { if (id === 'blue' && !ordered) { api.use(name); ordered = true; } };
    let armedT = null, clearT = null;
    for (let k = 0; k < 400 && clearT === null; k++) {
      put(me, 0, -9, 0); put(you, 0, -3, Math.PI);
      step(w, think);
      const has = perceive(w, 'blue').enemy.immune.includes('act');
      if (has && armedT === null) armedT = w.t;
      if (!has && armedT !== null) clearT = w.t;
    }
    checked++;
    const want = said2.get(`kit.own.${name}.effect.stun.window`);
    const got = (clearT !== null && armedT !== null) ? clearT - armedT : NaN;
    const line = "  kit stun 'act' immunity window".padEnd(36) + ` measured ${got.toFixed(3).padStart(7)} s   prompt says ${String(want).padStart(6)}`;
    /* Окно ставится на `t + duration + immune` и проверяется как `> t`, так
       что сниматься оно вправе на своём тике или на следующем — один шаг мира
       и ни секунды больше. */
    if (got >= want - ROUND && got <= want + TICK + ROUND) console.log(`${line}   ok`);
    else { console.error(`${line}   OFF`); bad++; }
  }

  // ── immuneLeft: seconds remaining, not just the class name (D191 §3) ─────
  /*
   * `.immune` names the class; it never said how much longer it holds, and
   * `review-r1-minds.md` measured 45–79 of ~100 immune lines per six games
   * ordered while the class was ALREADY listed — a mind reading only the
   * name cannot tell "just armed" from "about to drop out". Same scenario as
   * the window check above (a stun-carrying bolt on the same target), read
   * three times: at the tick 'act' first appears, `immuneLeft.act` is
   * claimed to equal duration + immune (elapsed ≈ 0); at the window's
   * half-way point it has counted down by exactly that much elapsed time;
   * on the tick the class drops out of `.immune`, it reads 0.
   */
  {
    const { perceive } = await import('../src/core/sim.js');
    const defs = built.control;
    const name = slotOf(defs, 'bolt');
    const said2 = kitSaid(defs);
    const w = kitStage(defs);
    const me = w.fighters.blue, you = w.fighters.orange;
    let ordered = false;
    const think = (id, p, api) => { if (id === 'blue' && !ordered) { api.use(name); ordered = true; } };
    const want = said2.get(`kit.own.${name}.effect.stun.window`);
    let armedT = null, armedLeft = null, midT = null, midLeft = null, clearLeft = null;
    for (let k = 0; k < 400 && clearLeft === null; k++) {
      put(me, 0, -9, 0); put(you, 0, -3, Math.PI);
      step(w, think);
      const enemy = perceive(w, 'blue').enemy;
      const has = enemy.immune.includes('act');
      if (has && armedT === null) { armedT = w.t; armedLeft = enemy.immuneLeft.act; }
      if (has && armedT !== null && midT === null && w.t - armedT >= want / 2) { midT = w.t; midLeft = enemy.immuneLeft.act; }
      if (!has && armedT !== null) clearLeft = enemy.immuneLeft.act;
    }
    checked++;
    const line1 = "  kit stun immuneLeft.act, at arming".padEnd(36) + ` measured ${armedLeft.toFixed(3).padStart(7)} s   prompt says ${String(want).padStart(6)}`;
    /* Замер снят на тике, когда класс УЖЕ появился, — то есть elapsed от нуля
       до одного тика, и допуск в его сторону тот же, что у окна выше. */
    if (armedLeft <= want + ROUND && armedLeft >= want - TICK - ROUND) console.log(`${line1}   ok`);
    else { console.error(`${line1}   OFF`); bad++; }
    checked++;
    const gotDrop = (midLeft !== null) ? (armedLeft - midLeft) : NaN;
    const wantDrop = (midT !== null) ? (midT - armedT) : NaN;
    const line2 = "  kit stun immuneLeft.act, half-way".padEnd(36) + ` counted down ${gotDrop.toFixed(3).padStart(7)} s   elapsed ${wantDrop.toFixed(3)} s`;
    if (midLeft !== null && Math.abs(gotDrop - wantDrop) <= ROUND + TICK) console.log(`${line2}   ok`);
    else { console.error(`${line2}   OFF`); bad++; }
    checked++;
    const line3 = "  kit stun immuneLeft.act, once cleared".padEnd(36) + ` measured ${(clearLeft ?? NaN).toFixed(3).padStart(7)} s   prompt says      0`;
    if (clearLeft === 0) console.log(`${line3}   ok`);
    else { console.error(`${line3}   OFF`); bad++; }
  }

  // ── лечение: доля, пол и потолок ─────────────────────────────────────────
  /*
   * Три числа на одной строке карточки, и каждое властвует в своей области:
   * доля — посередине, пол — у полного здоровья, потолок — у почти мёртвого.
   * Одним замером не отличить их друг от друга, поэтому замеров три.
   */
  {
    const defs = built.field;
    const name = slotOf(defs, 'self');
    const said2 = kitSaid(defs);
    const share = said2.get(`kit.own.${name}.effect.heal.sharePct`) / 100;
    const floor = said2.get(`kit.own.${name}.effect.heal.floor`);
    const cap = said2.get(`kit.own.${name}.effect.heal.mag`);
    const healFrom = (hp) => {
      const w = kitStage(defs);
      const me = w.fighters.blue;
      put(me, 0, -9, 0);
      me.hp = hp;
      let ordered = false;
      const think = (id, p, api) => { if (id === 'blue' && !ordered) { api.use(name); ordered = true; } };
      for (let k = 0; k < 40; k++) { const h = me.hp; step(w, think); if (me.hp > h + 1e-9) return me.hp - h; }
      return 0;
    };
    const max = createWorld(1, { kits: { blue: defs, orange: defs } }).fighters.blue.def.hp;
    /* Не «в одном hp от максимума»: пол лечения там больше недостающего, и
       `min(maxHp, hp + amount)` возвращает недостачу, а не пол. Замер берётся
       там, где недостаёт вдвое больше пола: доля от такой недостачи всё ещё
       меньше пола, а пол уже помещается под потолком здоровья. */
    agreeNumber('heal floor, barely hurt', floor, healFrom(max - floor * 2), 1e-6, 'hp');
    agreeNumber('heal cap, at one hp', cap, healFrom(1), 1e-6, 'hp');
    const mid = max / 2;
    agreeNumber('heal share, at half hp', Math.min(cap, Math.max(floor, (max - mid) * share)), healFrom(mid), 0.01, 'hp');
  }
}

// ---------------------------------------------------------------------------

if (bad === 0) console.log(`\n${checked} claims measured; the world does what the prompt says.`);
else { console.error(`\n${bad} of ${checked} claims do not match the world.`); process.exit(1); }
