/**
 * Кит → то, что умеет исполнять симуляция.
 *
 * Грамматика §8 описывает умение пятью осями. Симуляция исполняет объекты
 * той же формы, что `SKILLS` в `config.js`: фазы, кулдаун, дальность,
 * множители движения. Этот файл — мост между ними, и он односторонний:
 * сервер компилирует кит в определения, симуляция их читает и никогда не
 * пишет обратно.
 *
 * Числа берутся из реестра, а не выдумываются здесь. Реестр — единственное
 * место, где живёт цена и сила атома (§8: сервер пересчитывает бюджет заново
 * перед матчем; если бы сила жила в двух местах, пересчитывать было бы
 * нечего).
 *
 * ЧТО ЭТОТ ФАЙЛ НЕ ДЕЛАЕТ. Он не трогает четыре захардкоженных умения
 * (`laser`, `blink`, `smash`, `charge`) и `jump`. Они — основание §1: шесть
 * эталонных мозгов написаны против них, все 2450 матчей турнира сыграны на
 * них, и любая правка там переписывает измерение задним числом. Умения из
 * грамматики живут рядом, под собственным резолвером.
 */

import { INTERRUPT_MIN_WINDUP, ZONE_PERIOD, ZONE_TOTAL_SHARE, tune } from '../core/config.js';
import {
  CHANNELS, DELIVERIES, EFFECTS, ELEMENTS, KIT_SIZE, costOf, validateKit, validateSkill,
} from './registry.js';

/*
 * The tuning overlay reaches the grammar here, not in the registry: the
 * registry is served to the browser and cannot read a file, this module is
 * server-only and is imported by every path that compiles a kit. The tables
 * are mutated in place, so the prompt, `costOf` and the instruments all see
 * the overlaid numbers (`AIRENA_TUNING`, sections `deliveries` and `effects`).
 */
tune(DELIVERIES, 'deliveries');
tune(EFFECTS, 'effects');

/*
 * THE COOLDOWN BELONGS TO THE DELIVERY, NOT TO THE PRICE (founder, 07.09).
 *
 * It used to be derived from the ability's cost — 0.9 s a point, 7 to 16 s —
 * and that put the whole balance into WAITING: the median fight was 22 s long
 * and every ability fired once or twice in it, so what a spectator watched was
 * two bodies walking while three tiles counted down. The founder's direction
 * is the opposite: every ability refreshes in about three seconds or less, and
 * balance lives in the WEIGHT of the pieces (their cost against the budget)
 * and in their magnitudes, measured by `tools/atombalance.mjs`.
 *
 * The derivation is GONE, not merely unused: `COOLDOWN_PER_POINT`,
 * `COOLDOWN_MIN`, `cooldownPoints()` and the `d.cooldown ?? …` fallback under
 * them were unreachable — every delivery in the registry carries a `cooldown`
 * — and three paragraphs went on describing them as the live rule. A dead
 * rule that reads as live is worse than no comment: the next reader prices a
 * piece against a formula the world stopped running.
 *
 * `fixedCooldown` stays, and only for the instruments: the atom league puts
 * the piece under test in the third slot, and a cooldown derived from
 * anything the piece changes would measure the piece divided by itself.
 */

/**
 * Скомпилировать одно умение.
 *
 * @param {object} skill  {delivery, effects[], channel?, element}
 * @param {string} id     имя в рантайме: `k1`, `k2`, `k3`
 */
export function compileSkill(skill, id, { fixedCooldown = null } = {}) {
  const bad = validateSkill(skill);
  if (bad.length) return { error: bad };

  const d = DELIVERIES[skill.delivery];
  const cost = costOf(skill);
  const effects = skill.effects.map((e) => ({ ...EFFECTS[e], id: e }));

  const def = {
    id,
    /* `generic` — метка для симуляции: это умение из грамматики, его
       исполняет общий резолвер, а не одна из четырёх ветвей `resolveStrike`. */
    generic: true,
    grammar: { ...skill },
    kind: d.id,
    element: skill.element || 'kinetic',
    palette: (ELEMENTS[skill.element] || ELEMENTS.kinetic).palette,
    channel: skill.channel || null,
    cost,

    windup: d.windup,
    recover: d.recover,
    /* The registry's number for the shape, or the instrument's constant while
       it is measuring. Nothing else can set it — see the header above. */
    cooldown: fixedCooldown ?? d.cooldown,
    needsLos: d.needsLos === true,
    interruptible: d.windup > INTERRUPT_MIN_WINDUP,

    /* Множители движения: чем длиннее замах, тем сильнее он приковывает.
       Мгновенные доставки (blink) не замедляют вовсе.

       Доставка может задать их ЯВНО, и тогда формула не работает: у прыжка
       подвижность — это его механика (скорость отрыва замораживается и
       становится дальностью), а не побочный результат короткого замаха. */
    moveScale: d.moveScale ?? (d.windup === 0 ? 1 : clamp(1 - d.windup * 0.8, 0.25, 1)),
    turnScale: d.turnScale ?? (d.windup === 0 ? 1 : clamp(1 - d.windup * 0.6, 0.3, 1)),

    effects: effects.map((e) => ({
      id: e.id, klass: e.klass, mag: e.mag ?? null,
      duration: e.duration ?? null, mind: !!e.mind, size: e.size ?? null,
      channel: e.needsChannel ? skill.channel : null,
      /* The immunity a control leaves behind once it expires (effects.js).
         Whole seconds of the registry, not divided by the effect count: the
         window protects the TARGET, and a half-strength stun still took a
         decision away. */
      ...(e.immune ? { immune: e.immune } : {}),
      /* The heal's floor and share travel whole; only its cap (`mag`) is
         divided by the effect count below. */
      ...(e.floor !== undefined ? { floor: e.floor } : {}),
      ...(e.share !== undefined ? { share: e.share } : {}),
    })),
  };

  /* Геометрия доставки — то, что резолвер обязан знать, чтобы построить
     форму: без range у конуса нет длины, без radius у зоны нет площади, без
     splash у навеса нет круга поражения в точке приземления. */
  for (const k of ['range', 'halfAngle', 'speed', 'radius', 'splash', 'duration', 'distance', 'iframes', 'arc', 'airborne', 'dashSpeed']) {
    if (d[k] !== undefined) def[k] = d[k];
  }
  /*
   * HOW THE ABILITY IS AIMED — a fact the mind reads from perception
   * (`kitView`) rather than re-derives from the prompt: `point` lands ON the
   * point named in `api.use(name, {x, z})` (mortar, field) or steps toward it
   * (blink); `facing` fires along the facing at the strike and a point only
   * turns the body (beam, bolt, fan, lunge); `none` takes no aim (aura, leap).
   */
  def.aim = (d.id === 'lob' || d.id === 'zone' || d.id === 'blink') ? 'point'
    : (d.id === 'self' || d.id === 'jump') ? 'none' : 'facing';

  /*
   * Сила эффекта делится на число эффектов.
   *
   * Иначе комбинация «урон + оглушение» бьёт как полный урон И оглушает,
   * то есть строго сильнее каждой из частей при цене всего на два очка
   * выше. Делитель делает выбор настоящим: один эффект в полную силу или
   * два по три четверти.
   */
  /*
   * THE SHARE IS GENTLER AND NO LONGER DIVIDES DURATIONS (07.09).
   *
   * At 1 / 0.75 / 0.6 on both magnitude and duration, a second effect on an
   * ability cost a quarter of the first one's damage AND arrived at three
   * quarters of its own length — a 0.8 s stun became 0.6, a 2.5 s shield
   * 1.9 — and the first panel pricing run valued every control atom below
   * zero: adding one to a kit lowered its win rate, because the damage it
   * displaced was worth more than the shortened control it bought. Durations
   * are already short at a three-second rhythm and capped by the immunity
   * windows, so they travel whole; magnitudes share 1 / 0.85 / 0.7.
   */
  /*
   * THE SHARE COUNTS MAGNITUDE-BEARING EFFECTS ONLY (fix round 1, 07.09).
   *
   * Counted by the number of effects, a duration-only atom — stun, root,
   * silence, blind, wall, cleanse — taxed the harm it rode on: bolt
   * damage+root dealt 0.85 of the damage for a root that has no magnitude to
   * share, so a control cost "its points plus 15% of your damage", and every
   * control read below zero on the panel (root −7.4 pp at cost 2; adding a
   * root to a bolt of damage lost 14 pp on every pilot). Now only the atoms
   * that HAVE a magnitude divide it: bolt damage+root keeps 24 damage and a
   * whole root; damage+burn still shares, heal+shield still shares. The
   * +2 / +5 point surcharge (`costOf`) stays as the price of one hit doing
   * two things.
   */
  const magBearing = def.effects.filter((e) => e.mag !== null).length;
  const share = [1, 0.85, 0.7][Math.max(0, Math.min(magBearing, 3) - 1)];
  /* Премия формы (см. `power` в registry.js): применяется к величине и не
     применяется к длительности и к множителям каналов. */
  const power = d.power ?? 1;
  for (const e of def.effects) {
    if (e.mag !== null) {
      /*
       * У усиления и ослабления `mag` — это МНОЖИТЕЛЬ, а не величина.
       * Усиление скорости это 1.35, ослабление это 0.7, и «поделить силу»
       * для них значит подвинуть множитель к единице, а не умножить его.
       *
       * Наивное умножение давало прямо противоположный эффект: усиление в
       * умении на три эффекта превращалось в 1.35 × 0.6 = 0.81, то есть
       * игрок платил десять очков за то, чтобы стать медленнее. А ослабление
       * становилось 0.7 × 0.6 = 0.42 — то есть ВДВОЕ сильнее, чем в
       * одиночном умении, хотя делить его собирались.
       */
      /* The shape's premium is a premium on HARM: damage and burn. An impulse,
         a shield or a heal carried by a fan is the same impulse, shield or
         heal — a knock of 6 m/s on a fan came out at 8.4 and threw a body
         twice as far as the card said. */
      const boost = (e.id === 'damage' || e.id === 'burn') ? power : 1;
      e.mag = e.id === 'boost' || e.id === 'weaken'
        ? round3(1 + (e.mag - 1) * share)
        : round3(e.mag * share * boost);
    }
  }
  /*
   * ДОЛЯ ЗОНЫ — ЗДЕСЬ, а не в резолвере.
   *
   * Зона применяет свои эффекты много раз за каст, и её величина обязана быть
   * поделена на число срабатываний (см. ZONE_TOTAL_SHARE в deliver.js). Делить
   * её в момент постановки зоны было ошибкой архитектуры, и она стоила двух
   * настоящих дефектов сразу:
   *
   *   — правило «множитель делится иначе, чем величина» пришлось написать
   *     дважды, и во втором экземпляре оно оказалось написано неправильно:
   *     `зона: ослабление по броне` давала множитель 0.19 вместо 0.7, то есть
   *     вчетверо больше входящего урона за 13 очков;
   *   — перцепция показывала мозгу `damage: 26` у зоны, которая наносит 6.93.
   *     F10 обещает ЖИВЫЕ параметры набора, и мозг, который верит промпту,
   *     считал зону вчетверо сильнее, чем она есть. Все замеры баланса сняты
   *     на мозге, читающем это поле.
   *
   * После переноса `def.effects` и `def.damage` описывают ОДНО СРАБАТЫВАНИЕ —
   * то, что и происходит, — и второго места, где это можно перепутать, нет.
   */
  if (d.id === 'zone' && d.duration) {
    const ticks = Math.max(1, Math.ceil(d.duration / ZONE_PERIOD));
    const zk = ZONE_TOTAL_SHARE / ticks;
    for (const e of def.effects) {
      /*
       * BURN IN A FIELD IS STANDING IN FIRE, not a sixth of a spark six times.
       *
       * Dividing both the rate and the duration by the tick count gave a
       * field of burn 1.87 hp/s for 1.07 s, renewed every half second — 6.7 hp
       * for standing in it the whole three seconds, against 42 for the same
       * field of plain damage (measured, reports/combat/verify-prompt-claims).
       * Burn does not stack, it renews, so the tick model has to be: while you
       * stand in it you burn at the field's rate, and for a short while after
       * you leave. Rate × ZONE_TOTAL_SHARE, duration one second: the whole
       * life of the field costs 1.6 hits of burn, the same total the damage
       * field is priced at, and it keeps burning a body that steps out.
       */
      if (e.id === 'burn') {
        e.mag = round3(e.mag * ZONE_TOTAL_SHARE);
        e.duration = 1.0;
        continue;
      }
      if (e.mag !== null) {
        e.mag = e.id === 'boost' || e.id === 'weaken'
          ? round3(1 + (e.mag - 1) * zk)
          : round3(e.mag * zk);
      }
      /*
       * A CONTROL IN A FIELD TRAVELS WHOLE, AND LANDS ONCE PER CAST.
       *
       * The share `zk` exists because a field applies its atoms six times a
       * cast; dividing a MAGNITUDE by the tick count is what keeps a disc of
       * damage worth the same as a bolt of it. A DURATION has no such
       * arithmetic. Divided, `zone:stun` came out at 0.28 s and `zone:root` at
       * 0.42 s — and then the first tick armed the class's immunity for
       * `duration + 3 s`, so ticks two to five of the SAME cast were refused
       * by the immunity the cast had just caused. Measured: one field cast on
       * a standing body wrote four `immune` lines and sent the caster four
       * `missed` events, and across the bake-off 17.4 of every 19.7 refusals a
       * game were a disc refusing itself. The prompt told a mind those refusals
       * meant "you are casting into a window"; they meant "the disc is working".
       *
       * So the control keeps the registry's whole duration and `tickZones`
       * applies it ONCE per cast per body, on that body's first contact tick.
       * Damage and burn still share per tick, which is what they are priced on.
       */
      if (e.duration !== null && !e.immune) e.duration = round3(e.duration * zk);
    }
    /* Сколько всего зона отдаст, если стоять в ней до конца — для промпта и
       HUD: одно срабатывание без этого числа читается как «зона слабая». */
    def.zoneTicks = ticks;
  }

  /* Урон — то, что читает HUD и лента; поднимаем его на верхний уровень. */
  const dmg = def.effects.find((e) => e.id === 'damage');
  if (dmg) def.damage = Math.round(dmg.mag);

  return { def };
}

/**
 * Скомпилировать весь кит. Возвращает объект `{ k1, k2, k3 }` в форме `SKILLS`
 * — и БОЛЬШЕ НИЧЕГО.
 *
 * Здесь было написано «плюс `jump` — прыжок есть у всех». С D160 это неверно:
 * прыжок — девятая доставка грамматики, и у сгенерированного существа он есть
 * ровно тогда, когда оно взяло его одним из трёх. `skillsOf` дописывает его
 * только двум захардкоженным эталонам, у которых кита нет вовсе.
 */
export function compileKit(kit, { size = KIT_SIZE, fixedCooldown = null } = {}) {
  const defs = {}; const problems = [];

  /*
   * Правила НАБОРА проверяются здесь, а не только на входе HTTP.
   *
   * Раньше `compileKit` проверял каждое умение по отдельности и ни разу —
   * набор целиком: ни размер, ни суммарный бюджет, ни запрет на два
   * одинаковых умения. Проверка жила на краю HTTP, то есть срабатывала на
   * пути «игрок прислал набор» и молчала на пути «набор прочитан из базы».
   * А второй путь — это ровно тот, по которому набор попадает в матч.
   *
   * Значит правило звучало не «набор стоит не больше 52», а «набор стоит не
   * больше 52 в тот момент, когда его прислали». Между этими двумя вещами —
   * любая правка цен (см. `tools/checkkits.mjs`) и любая запись в базу мимо
   * ручки. Компилятор — последний общий узел перед боем, и правило должно
   * стоять в нём.
   */
  const kitBad = validateKit(kit, { size });
  for (const b of kitBad) if (b.code === 'size' || b.code === 'kit_budget' || b.code === 'kit_dup') {
    problems.push({ slot: null, problems: [b] });
  }

  (kit || []).forEach((s, i) => {
    const out = compileSkill(s, `k${i + 1}`, { fixedCooldown });
    if (out.error) { problems.push({ slot: i, problems: out.error }); return; }
    defs[out.def.id] = out.def;
  });

  /*
   * D160 HOLDS: A COMPILED KIT IS EXACTLY THE ABILITIES THE CREATURE BOUGHT.
   *
   * No fourth verb is appended here. A creature has three skills and a jump
   * only if it bought one as one of the three (`delivery: 'jump'` — the leap).
   * A free universal hop was added and reverted the same day (DESIGN.md D195);
   * the invariant in `tools/test.mjs` holds `names.length === kit.length`, so
   * an append can never come back unnoticed.
   */
  return { defs, names: Object.keys(defs), problems };
}

/**
 * Как умение называется для игрока и для мозга.
 *
 * Мозг видит его в перцепции и вызывает по имени; имя обязано быть коротким
 * и стабильным, поэтому `k1..k3`. Читаемое имя идёт рядом отдельным полем —
 * промпт и HUD показывают его, а `api.use` принимает только короткое.
 */
export function readable(def) {
  const d = DELIVERIES[def.kind];
  const eff = def.effects.map((e) => EFFECTS[e.id]?.ru || e.id).join(' + ');
  const ch = def.channel ? ` through the ${CHANNELS[def.channel]?.ru || def.channel} channel` : '';
  return `${d?.ru || def.kind}: ${eff}${ch}`;
}

const clamp = (v, lo, hi) => (v < lo ? lo : (v > hi ? hi : v));
const round3 = (x) => Math.round(x * 1000) / 1000;
