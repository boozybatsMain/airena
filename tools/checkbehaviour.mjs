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
function agree(what, label, measured, tol, unit) {
  checked++;
  if (!said.has(label)) {
    console.error(`  ${what}: the prompt never states ${label} — measured ${measured.toFixed(3)} ${unit}`);
    bad++;
    return;
  }
  const want = said.get(label);
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
function agreeSum(what, labels, measured, unit) {
  checked++;
  const missing = labels.filter((l) => !said.has(l));
  if (missing.length) {
    console.error(`  ${what}: the prompt never states ${missing.join(', ')}`);
    bad++;
    return;
  }
  const want = labels.reduce((a, l) => a + said.get(l), 0);
  const off = Math.abs(measured - want);
  const tol = ROUND * labels.length;
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
  const hop = fire({
    shooter: 'blue', skill: 'jump', hold: false,
    from: { x: -10, z: 0 }, heading: EAST, target: { x: 10, z: 10 },
  });
  agree('jump wind-up', 'skills.jump.windup', windupOf(hop), ROUND, 's');
  agree('jump airborne', 'skills.jump.airborne', hop.airTicks * TICK, ROUND, 's');
  agreeSum('jump, crouch to landed',
    ['skills.jump.windup', 'skills.jump.airborne', 'skills.jump.recover'], totalOf(hop), 's');
  agree('jump cooldown', 'skills.jump.cooldown', hop.readyT - hop.startT, ROUND, 's');
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

if (bad === 0) console.log(`\n${checked} claims measured; the world does what the prompt says.`);
else { console.error(`\n${bad} of ${checked} claims do not match the world.`); process.exit(1); }
