/**
 * Грамматика скиллов — ЧЕТЫРЕ закрытых оси (§8 минус снятая, см. D102).
 *
 * Реестр, а не идея: у каждого атома есть цена в бюджете силы, требования к
 * доставке и — обязательно — **VFX-сигнатура**. Правило перенесено из Autoage
 * дословно вместе с его комментарием: *«variety the player cannot see is not
 * variety»*. Атом без сигнатуры не регистрируется; это проверяет `selfTest()`
 * и релизный гейт.
 *
 * Оси:
 *   DELIVERY (9)  каким силуэтом он летит
 *   EFFECT   (14) что он делает, 1–3 штуки
 *   CHANNEL  (7)  какое число крутит boost/weaken — обязателен при них
 *   ELEMENT  (5)  палитра и импакт. ТОЛЬКО ВИЗУАЛ, не трогает ни одного числа
 *
 * Единственное правило легальности — L1: доставка `self` допускает только
 * {shield, heal, cleanse, boost, wall}. SELF-атом на нацеленной доставке
 * применяется к КАСТЕРУ при попадании — это вампиризм, и он читается верно.
 * Больше исключений не нужно, и добавлять их нельзя без решения основателя.
 */

/*
 * THIS FILE IS SERVED TO THE BROWSER (`/skills/registry.js`, via
 * `describe.js` and the viewer's VFX modules) and therefore imports NOTHING
 * from `src/core/config.js`, which reads the tuning overlay with `node:fs`.
 * An import added here on 07.09 broke every screen of the client — the
 * module graph failed on `core/config.js` (404) and the live screen sat on
 * "connecting to the arena". The tuning overlay (`AIRENA_TUNING`, sections
 * `deliveries` and `effects`) is applied to these tables by the server-only
 * `src/skills/compile.js`, which every server path imports before a number
 * is read; the tables are mutated in place, so `costOf` and the prompt see
 * the overlaid values too.
 */

/** Классы атомов: кому применяется эффект. */
export const TARGETED = 'targeted';
export const SELF = 'self';
export const WORLD = 'world';

/**
 * Таблица без прототипа.
 *
 * ЗАЧЕМ. Все четыре оси грамматики — это словари, в которые лезут по ключу,
 * присланному снаружи: из JSON игрока, из ответа модели, из тела HTTP-запроса.
 * У обычного объекта есть прототип, а значит `EFFECTS['constructor']` — это
 * не `undefined`, а функция, и она истинна.
 *
 * Из этого следовал обход бюджета, доезжавший до рейтинговой лестницы.
 * `costOf` берёт `t.cost` у найденного «триггера»; у функции `cost` нет,
 * получается `NaN`, сумма становится `NaN`, а `NaN > SKILL_BUDGET` — ложь.
 * То есть проверка бюджета ПРОПУСКАЛА умение, у которого цену вычислить не
 * удалось, вместо того чтобы его отвергнуть. Дальше `compileSkill` читал
 * `d.windup` и `d.cooldown` у той же функции, получал `undefined`, и умение
 * получало кулдаун `NaN` — то есть было готово всегда.
 *
 * Чинить это по местам вызова нельзя: мест двадцать пять, и двадцать шестое
 * напишут завтра. Прототипа просто не должно быть — тогда «нет такого ключа»
 * значит `undefined` во всех двадцати пяти местах сразу и во всех будущих.
 */
function table(obj) { return Object.assign(Object.create(null), obj); }

/*
 * ── ОСИ «ТРИГГЕР» БОЛЬШЕ НЕТ, И ЭТО ВАЖНЕЕ, ЧЕМ МИНУС ОДНА ОСЬ ─────────────
 *
 * Здесь была пятая ось: умение могло срабатывать `on_hit_taken`,
 * `on_hit_dealt`, `on_low_hp`, `on_enemy_cast` — то есть САМО, мимо мозга.
 *
 * Проверка показала, что ось не давала ни одной новой возможности. Мозг уже
 * получает в `p.events` ровно эти события: `damaged`, `dealt`,
 * `enemyStarted`, — и своё здоровье он видит в перцепции. Всё, ради чего
 * триггеры существовали, ему было доступно и так.
 *
 * Значит ось не ДОБАВЛЯЛА возможность, а ОТНИМАЛА РЕШЕНИЕ. Умение с
 * `on_hit_taken` срабатывало без участия мозга: решала симуляция. В продукте,
 * чей тезис — «решения принимает нейросеть», это ровно наоборот, и хуже: чем
 * больше умений висело на триггерах, тем меньше в бою оставалось от мозга,
 * которым игрок хвастается.
 *
 * Решение основателя (30.08): умение просто СУЩЕСТВУЕТ. Когда его применить —
 * решает мозг, поймав событие. Нужно «в ответ на удар» — мозг ловит
 * `damaged` и зовёт `api.use`. Это и запись понятнее, и её видно в разборе
 * боя как решение, а не как автоматику.
 *
 * Что ушло вместе с осью: цена триггера в бюджете, множители кулдауна
 * (1.35 за реактивные, 1.6 за `on_enemy_cast`) и ветка `firePassives` в
 * симуляции. Что осталось: четыре оси — доставка, эффекты, канал, элемент.
 */


/**
 * Доставки. `silhouette` — то, что VFX обязан нарисовать; это неприкосновенная
 * часть READ KIT (§9.2): LLM может ДОБАВЛЯТЬ поверх, но не ЗАМЕНЯТЬ силуэт.
 */
/*
 * `power` — премия за форму, у которой в дуэли нет своего преимущества.
 *
 * Доставки стоят одинаково и бьют одинаково, но окупаются по-разному. Конус
 * и зона существуют ради площади: в бою нескольких они накрывают многих. В
 * Airena дерутся ДВОЕ, площади накрывать некого, и конус остаётся снарядом
 * с дальностью 6 вместо 18 за ту же цену — то есть строго худшим снарядом.
 * Замер это и показал: в лиге доставок конус брал 19% против 63% у снаряда,
 * и стартовый набор, чьим единственным источником урона был конус, не
 * выигрывал ничего вообще.
 *
 * Чинится это премией к величине эффектов, а не скидкой к цене: дешёвая
 * бесполезная форма остаётся бесполезной, просто дешевле. Тот, кто согласен
 * подойти на шесть метров, должен за это что-то получать.
 *
 * Длительности премия НЕ трогает: конус, который оглушает дольше луча, —
 * это другая механика, а не более сильная та же.
 */
/*
 * `cooldown` — THE RHYTHM OF A SHAPE, in seconds from the start of the cast.
 *
 * Founder's direction, 07.09: no ability waits longer than about three
 * seconds, and the cooldown is no longer a balance lever — it used to be
 * derived from the price (0.9 s a point, 7–16 s), and the result was a fight
 * spent waiting. The numbers below are per DELIVERY, because a shape has a
 * natural rhythm: the close fan swings fastest, the beam that crosses the
 * whole arena and the field that owns ground for seconds sit at the ceiling.
 * Everything that used to be paid for with cooldown is now paid for with
 * WEIGHT (`cost`) and with magnitude, and both are measured by
 * `tools/atombalance.mjs` rather than argued.
 */
export const DELIVERIES = table({
  beam: {
    id: 'beam', ru: 'Beam', klass: TARGETED, cost: 4, cooldown: 3.0,
    silhouette: 'a cylinder from the caster to the point of impact',
    windup: 0.5, recover: 0.10, range: 24, needsLos: true,
    doc: 'instant, along a straight line, stopped by the first obstacle',
  },
  cone: {
    /* ×1.4 at 2.0 s (was ×1.7 at 1.8 s): still the highest damage per second in
       the grammar — the approach is what it costs — without being a quarter
       of a default body per swing. */
    id: 'cone', ru: 'Fan', klass: TARGETED, cost: 2, power: 1.4, cooldown: 2.0,
    silhouette: 'a cone wedge spreading from the caster',
    windup: 0.28, recover: 0.28, range: 3.4, halfAngle: 0.96, needsLos: true,
    /* Слабость называется в том же `doc`, что и сила: D160 сделал три доставки
       уклоняемыми прыжком, и умолчать об этом на карточке умения значит
       продать игроку конус, не сказав, чем за него платят. */
    doc: 'close, wide and fast; it runs along the ground and misses anyone who has left it',
  },
  bolt: {
    id: 'bolt', ru: 'Bolt', klass: TARGETED, cost: 4, cooldown: 2.2,
    silhouette: 'a bolt sprite flying in a straight line',
    windup: 0.34, recover: 0.16, range: 18, speed: 22, needsLos: false,
    doc: 'it takes time to arrive and can be side-stepped',
  },
  lob: {
    /* ×1.4: the hardest shape to land — a second of flight, a point named
       ahead of a moving body — pays the most when it does (founder, 07.09).
       The comment read ×1.25 while the value beside it read 1.4, and
       `docs/COMBAT.md` repeated each of the two once. 1.4 is what the panel
       measured and what the sim applies; both documents now say so. */
    id: 'lob', ru: 'Mortar', klass: TARGETED, cost: 2, cooldown: 2.6, power: 1.4,
    silhouette: 'a lobbed arc with a landing marker',
    windup: 0.5, recover: 0.2, range: 15, speed: 18, needsLos: false, arc: true,
    /*
     * `splash` — РАДИУС ПОРАЖЕНИЯ В ТОЧКЕ ПРИЗЕМЛЕНИЯ, и до 04.09 у навеса
     * своей механики не было вовсе.
     *
     * Навес проверялся ТЕМ ЖЕ тестом близости, что и болт (`tickProjectiles`,
     * `dist2(...) <= radius + 0.35`), то есть засчитывался ПО ДОРОГЕ, пролетая
     * над целью, а долетев до конца жизни — засчитывался промахом и не
     * применял ничего. Замер до правки: три боя ГРОЗА × ПЕПЕЛ, 14 навесов,
     * 11 попаданий сквозных и НОЛЬ по приземлению. То есть строка `doc`
     * («приземляется с задержкой») описывала механику, которой не
     * существовало.
     *
     * ПОЧЕМУ 1.8, а не 3.0 (зона) и не 0.35 (касание болта). Сравнивать надо
     * по ЭФФЕКТИВНОМУ кругу — сим везде прибавляет радиус тела цели, а он
     * 1.2–1.8 при умолчании 1.5 (`BUILD_AXES.radius`; «около 0.5–0.9» в
     * заказе — не про эту величину):
     *
     *     болт, касание      0.35 + 1.5 = 1.85 м
     *     НАВЕС, splash 1.8  1.8  + 1.5 = 3.30 м
     *     зона, radius 3.0   3.0  + 1.5 = 4.50 м
     *
     * То есть навес прощает ошибку прицела в один корпус: вдвое щедрее болта
     * и на четверть скромнее зоны — которая за ту же ошибку берёт очко цены,
     * лежит три секунды и бьёт шесть раз.
     *
     * И ЭТО ЗАМЕР, А НЕ ВКУС. Доля попаданий навеса при разном splash, на
     * настоящих мозгах из базы (ГРОЗА×ПЕПЕЛ, КУРГАН OPUS×КОРШУН,
     * МОГИЛЬНИК×КУЗНЕЧИК-МЕХАНИК, по пять сидов; во второй колонке — тот же
     * замер на рукописном мозге, держащем дистанцию 6–9 м, 10 сидов):
     *
     *     splash 1.0   42.4%   67.5%
     *     splash 1.4   45.5%   72.5%
     *     splash 1.8   47.5%   72.5%   ← здесь
     *     splash 2.2   46.5%   72.5%
     *     splash 2.6   49.5%   75.0%
     *     splash 3.0   59.4%   72.5%
     *
     * Кривая ПЛОСКАЯ между 1.4 и 2.6 и ломается на 3.0. Плоская потому, что
     * попадания решает не площадь, а время полёта (15/12 = 1.25 с на пределе,
     * а тело за это время проходит до 8.6 × 1.25 = 10.75 м) — то есть
     * УПРЕЖДЕНИЕ. Ломается потому, что 3.0 — это радиус зоны: на нём навес
     * перестаёт быть навесом и начинает работать зоной, которая ещё и
     * мгновенная, и +12 пунктов попаданий он берёт именно оттуда. Снизу
     * платит: 1.0 стоит пяти пунктов и делает исход совпадением — та самая
     * «лотерея», от которой предостерегал заказ.
     *
     * 1.8 — середина плоского участка и самая далёкая от зоны его половина.
     */
    splash: 2.2,
    doc: 'it flies over obstacles and touches nobody on the way; it strikes in a circle where it lands',
  },
  zone: {
    id: 'zone', ru: 'Field', klass: WORLD, cost: 3, cooldown: 3.0,
    silhouette: 'a disc of the field lying on the floor',
    /* 2.4 s of life under a 3.0 s cooldown: a field is re-placed, never held. */
    windup: 0.45, recover: 0.25, range: 12, radius: 2.6, duration: 2.4, needsLos: false,
    doc: 'an area that keeps working for several seconds; it lies on the floor, so anyone off the ground misses a tick or two but not the whole cast',
  },
  dash: {
    id: 'dash', ru: 'Lunge', klass: TARGETED, cost: 2, cooldown: 3.0, power: 1.15,
    silhouette: 'a trail ribbon behind the body',
    /* `dashSpeed` — the lunge travels (sim.js `dashStepGeneric`): 8 m at 20 m/s
       is 0.4 s of a body crossing the floor with its heading locked, which a
       leap can pass over and a spectator can follow. The premium pays for a
       shape that has to reach its target and is stopped by the first block. */
    windup: 0.30, recover: 0.26, distance: 8.0, dashSpeed: 20, needsLos: true,
    doc: 'the caster charges forward and hits everything on the way; it runs along the ground and misses anyone who has left it',
  },
  blink: {
    id: 'blink', ru: 'Blink', klass: SELF, cost: 7, cooldown: 3.0,
    silhouette: 'two rings, one where it left and one where it arrived',
    /* 6.5 m and 0.25 s at a three-second rhythm: at 7.5 m and 0.28 s the blink
       answered every attack in the grammar every time it was ready. */
    windup: 0.0, recover: 0.18, distance: 6.5, iframes: 0.25, needsLos: false,
    doc: 'instant displacement with a moment of invulnerability',
  },
  self: {
    id: 'self', ru: 'Aura', klass: SELF, cost: 4, cooldown: 3.0,
    silhouette: 'a shell around the body',
    windup: 0.30, recover: 0.18, needsLos: false,
    doc: 'applied to the caster',
  },
  /*
   * ПРЫЖОК — ДОСТАВКА, А НЕ ПОДАРОК ВСЕМ. Решение основателя 01.09.
   *
   * Раньше `skillsOf` дописывал `jump` каждому бойцу, и у сгенерированного
   * существа было четыре глагола вместо трёх. Два измеренных факта показали,
   * что четвёртый глагол был не бесплатным, а мёртвым:
   *
   *  1. Ни одна ветвь `resolveDelivery` не читала `y`. Уклонение в прыжке
   *     существовало ровно для одного захардкоженного `smash`, то есть против
   *     100% умений грамматики прыжок не давал НИЧЕГО — только 0.81 с полной
   *     блокировки (`startSkill` отказывает всему, пока `y > 0.01`).
   *  2. `kitBlocks` в промпте про прыжок не рассказывал вовсе. Глагол стоял в
   *     `p.self.skills`, но в инструкции мозга его не было — модель платила за
   *     него местом в перцепции и не могла им пользоваться осознанно.
   *
   * Теперь прыжок стоит в одном ряду с остальными восемью: существо берёт его
   * ОДНИМ ИЗ ТРЁХ или не берёт. И у него появилась цена, которую видно, —
   * три доставки идут по земле (конус, зона, рывок) и проходят под тем, кто
   * в воздухе (`AIRBORNE_DODGE_MIN`). Это ровно то же правило, по которому
   * эталонный осьминог уклоняется от `smash`, просто теперь оно записано один
   * раз и действует на всю грамматику, а не на одну захардкоженную ветку.
   *
   * Класс — SELF, как у мигания: прыжок доставляется К СЕБЕ и по L1 не может
   * нести атаку. Атомы срабатывают на отрыве, то есть «прыжок со щитом» —
   * это прыжок, на котором щит уже стоит.
   *
   * ЦЕНУ НАЗНАЧАЕТ ПАНЕЛЬ (8 по проходу v9, 07.09) — А ВОТ ЧТО ОНА ПОКУПАЕТ. СТАРОЕ ОБОСНОВАНИЕ ССЫЛАЛОСЬ НА АРИФМЕТИКУ,
   * КОТОРОЙ БОЛЬШЕ НЕТ.
   *
   * Здесь стоял вывод через кулдаун, считавшийся из цены (`cooldownPoints ×
   * 0.9`: «прыжок·очищение 7 очков → 6.30 с против конус·урон 11 очков →
   * 9.90 с»). С 07.09 кулдаун принадлежит ДОСТАВКЕ, а не цене: у прыжка он
   * 3.0 с, как у луча, зоны, рывка, мигания и ауры, и никакая цена его не
   * двигает. Прежний довод — «контрмера перезаряжается в полтора раза быстрее
   * того, что она контрит» — на этих числах просто не существует.
   *
   * Цена — из прибора (см. таблицу цен выше), и вот на чём она стоит. Прыжок покупает 0.55 с вне
   * досягаемости ТРЁХ доставок из девяти (`GROUND_DELIVERIES`) — то есть
   * уклонение, а не перемещение, — и по SELF-классу может нести сверх этого
   * щит, лечение или очищение. Это то же, что покупает мигание (6: 0.25 с
   * неуязвимости ко ВСЕМУ и 6.5 м), на ступень дешевле: окно шире, но уходом
   * от луча или снаряда оно не является.
   *
   * D160: бесплатного прыжка ни у кого нет. Уклонение — покупка, и пять очков
   * платят именно за него; кто его не купил, уходит шагом в сторону. Верна ли
   * эта пятёрка, скажет панель `tools/atombalance.mjs`.
   */
  jump: {
    /* 3.0 like the other self deliveries: at 2.4 s the leap was the cheapest
       carrier of a heal or a shield in the grammar AND a dodge, and the first
       pricing pass put leap:heal and leap:shield in four of the top five kits. */
    id: 'jump', ru: 'Leap', klass: SELF, cost: 6, cooldown: 3.0,
    silhouette: 'a leap arc and a shadow circle under the body',
    /*
     * ЗАМАХ 0.06, А НЕ 0.10 У ЗАХАРДКОЖЕННОГО ПРЫЖКА, И ЭТО ЗАМЕР.
     *
     * Прыжок покупается ради уклонения, то есть он всегда РЕАКЦИЯ. Бюджет
     * реакции складывается так:
     *
     *   задержка мысли   до 0.067 с (мозг думает раз в 2 тика, THINK_EVERY)
     * + замах прыжка     столько, сколько здесь написано
     * + подъём до порога 0.033 с (дуга пересекает AIRBORNE_DODGE_MIN)
     *
     * При 0.10 худший случай — 0.20 с, а замах рывка 0.18. Прогон на 24 сидах:
     * рывок попадал 96 раз из 96 и с прыжком, и без него, то есть промпт
     * обещал модели уклонение, которого не существует. Обещание, которое не
     * исполняется, здесь дороже отсутствующей механики: по нему модель тратит
     * слот набора.
     *
     * При 0.06 худший случай 0.16 < 0.18 — рывок уклоняем на любой фазе мысли.
     * Конус (0.28) и зона (0.45) были уклоняемы и до правки.
     */
    windup: 0.06, airborne: 0.55, recover: 0.16, needsLos: false,
    /*
     * ПОДВИЖНОСТЬ ЗАДАНА ЯВНО, А НЕ ВЫВЕДЕНА ИЗ ЗАМАХА.
     *
     * Компилятор считает `moveScale` из замаха (чем длиннее замах, тем
     * сильнее он приковывает), и при 0.06 вышло бы 0.952 — то есть случайное
     * число, полученное из настройки, сделанной ради совсем другого.
     *
     * Прыжок обязан уносить: горизонтальная скорость на отрыве ЗАМОРАЖИВАЕТСЯ
     * (`sim.js`, и это же обещано модели в промпте), значит скорость в момент
     * отрыва — это и есть дальность прыжка. Замерено: осьминог отрывается на
     * 4.02 м/с и улетает на 2.28 м против 2.49 м/с и 1.30 м у захардкоженного
     * прыжка с его `moveScale: 0.35`. Разница в 1.75 раза — это разница между
     * «перепрыгнул через рывок» и «подпрыгнул на месте, пока по тебе едут».
     *
     * Единица, а не 0.952: округление вверх честнее случайной дроби, и его
     * видно как решение.
     */
    moveScale: 1, turnScale: 1,
    doc: 'the caster goes airborne for almost a second — the longest ability in the grammar, and for all of it no command can be issued while the speed stays frozen at take-off; in exchange the ground deliveries (Fan, Field, Lunge) pass underneath',
  },
});

/**
 * Эффекты. `klass` решает, к кому применяется атом, а L1 — где он допустим.
 * `vfx` — обязательная сигнатура импакта.
 *
 * Три атома специфичны для Airena и стоят больше, чем в Autoage, потому что
 * бьют по слою принятия решений — самое интересное, что может делать скилл
 * в игре, чей тезис «решения принимает LLM»:
 *   blind    портит объект перцепции цели (блок противника из кольцевого
 *            буфера с задержкой 30 тиков, при self.blinded = true)
 *   silence  заставляет startSkill цели отказывать с причиной 'silenced'
 *   wall     вставляет временный солид в world.obstacles
 *
 * ── откуда взялись цены ─────────────────────────────────────────────────────
 *
 * Не из головы. `tools/kitbalance.mjs` гоняет круговую лигу: четырнадцать
 * наборов, различающихся ровно третьим умением, каждый против каждого,
 * зеркально, на симметричной арене одним и тем же мозгом. Отдельным участником
 * стоит «ничего» — набор без третьего умения, — и он даёт абсолютную привязку.
 *
 * ТЕКУЩИЙ ЗАМЕР (07.09, проход v11): `tools/atombalance.mjs` на панели из
 * четырёх пилотов (kit-stub, rusher, kiter, controller), 480 случайных
 * законных наборов × 24 боя каждый (11 520 матчей), ридж-регрессия винрейта
 * на состав набора БЕЗ признака «цена» (D197), в мире после D201 (hp 210…360).
 * Столбец «лучший» — ценность атома (п.п. винрейта за единицу), отображённая
 * в 0…100 между худшим и лучшим; «панель» — сама ценность ± её ошибка. Цены —
 * те, при которых проход был сыгран (v10b, применённый с демпфированием ½),
 * плюс четыре сдвига на пол по его же вердикту: Stun, Blind, Pull, Boost 2 → 1.
 * `reports/combat/atombalance-panel-v11.md`.
 *
 *     атом            лучший   панель
 *     Damage           100%   +18.0 ± 1.2
 *     Burn              63%   +9.7 ± 1.2
 *     Heal              50%   +6.7 ± 1.0
 *     Shield            37%   +3.8 ± 0.9
 *     Cleanse           27%   +1.6 ± 0.8
 *     Silence           22%   +0.5 ± 1.0
 *     Knockback         20%   -0.1 ± 1.0
 *     Weaken            14%   -1.4 ± 1.4
 *     Root              13%   -1.5 ± 0.8
 *     Stun              11%   -2.0 ± 1.0
 *     Blind             10%   -2.4 ± 1.0
 *     Pull               8%   -2.7 ± 1.0
 *     Wall               7%   -2.9 ± 0.8
 *     Boost              0%   -4.5 ± 1.4
 *
 * ГЛАВНОЕ ЧИСЛО — ЦЕННОСТЬ НА ОЧКО, а не корреляция. Плоские цены значат, что
 * очко бюджета покупает одинаковый винрейт, где бы его ни потратили. По
 * четырнадцати эффектам разброс (sd) шёл 1.73 (v5) → 1.46 (v6) → 1.30 (v7)
 * → 1.21 (v8) → 1.11 (v9) в мире 180 hp и 1.27 (v10b) → 1.30 (v11) в мире
 * 240 hp (D201: панель пилотов там стоит дольше); `tools/checkprices.mjs`
 * держит его как храповик внутри одного мира.
 * Урон упирается в потолок цены 10 и всё ещё покупает +2.0 п.п. за очко —
 * это единственная сознательная неплоскость: урон — обязательная часть
 * любого набора (L2), и его цена ограничена бюджетом, а не прибором.
 * Корреляция «цена ↔ ценность» говорит только о ПОРЯДКЕ цен.
 *
 * ЧТО СДВИНУЛ ПЕРВЫЙ КРУГ ПРАВОК (compile.js: доля делится только между
 * атомами С ВЕЛИЧИНОЙ; контроль зоны кладётся один раз за каст целиком;
 * горение продлевается, а не обновляется; стена 5 с и прозрачна для своих
 * выстрелов) и ВЕЛИЧИНЫ (D200: корень 2.2 с, толчок 8, ослабление ×0.5,
 * усиление ×1.6 на 4 с, навес 18 м/с и круг 2.2 м, замах рывка 0.30 с, круг
 * поля 2.6 м, замах луча 0.5 с): ловушек v6 было пять (root, knock, weaken,
 * boost, lob), в v9 — две, обе на полу цены (knock, weaken). Население
 * панели по-прежнему доходит до 30-секундного пожара в 68 % боёв — четыре
 * пилота кайтят и уворачиваются; лестница живых умов — 5–8 % (spectate).
 *
 * ── ЦЕНЫ И ОДНО НАЗВАННОЕ ИСКЛЮЧЕНИЕ ──────────────────────────────────────
 *
 * По лучшему случаю (D72), ранги отображены в 1…10. Корреляция цены с лучшим случаем 0.88.
 *
 * Исключений больше нет (07.09): панель из четырёх пилотов строит планы —
 * controller держит контроль под чужой замах, kiter ставит стену под луч —
 * и цена ослепления, немоты и стены снята с их измеренной ценности, а не с
 * надбавки за «планы, которые можно построить».
 *
 * Как перепроверить — ОБЯЗАТЕЛЬНО после каждой правки цен И после любой правки
 * пилотов панели, потому что пилоты это часть прибора (D109):
 *   node tools/atombalance.mjs --n=240 --games=24 --pilots=stub,rusher,kiter,controller
 */
/*
 * ── MAGNITUDES AT A THREE-SECOND RHYTHM ─────────────────────────────────────
 *
 * Every ability is usable about ten times in a fight instead of twice, so every
 * per-cast number was re-scaled against a design pace rather than kept.
 *
 * WHAT FOLLOWS IS NOT A TABLE OF NUMBERS. The table is the code below, and a
 * second copy of it in prose is a second source of truth that goes stale on the
 * first tuning pass. It did: this comment listed "damage 26→14, burn 5×3, heal
 * 10, shield 20 for 5 s, boost ×1.3 / weaken ×0.75 for 2.5 s, wall 3 s" under
 * the heading "STARTING values", while the fields below read 24 / 7 for 3 s /
 * cap 16 / 12 for 2.5 s / ×1.4 and ×0.65 for 2.8 s / 5 s. A reader cannot tell
 * a stale list from a live one, so there is no list.
 *
 * What is worth writing down is the SHAPE of each rule, which does not move
 * when a magnitude does:
 *
 *   damage   the yardstick every other piece is measured against. The shape's
 *            premium (`power` on the delivery) multiplies this and burn, and
 *            nothing else — an impulse or a shield carried by a fan is the
 *            same impulse and the same shield.
 *   burn     one hit's worth of harm spread over its duration. It EXTENDS,
 *            never stacks: a second fire adds its own length to what is still
 *            burning, capped at twice that length (effects.js). A FIELD's
 *            ticks renew instead — standing in fire is one fire — and the
 *            field's rate is `ZONE_TOTAL_SHARE` of the atom's with one second
 *            of afterburn (compile.js).
 *   heal     a share of what is MISSING, floored and capped: self-limiting, so
 *            it rewards healing when hurt and gives almost nothing to a mind
 *            that heals on cooldown at full health.
 *   shield   expires before its own cooldown. A shield is re-cast, not held.
 *   stun/root/silence/blind  each arms its CLASS's immunity the moment it
 *            lands, for `duration + immune` seconds (effects.js): a control is
 *            a moment the caster chooses, never a rhythm it holds. In a field
 *            it lands once per cast per body, at whole duration.
 *   knock/pull  an impulse in m/s on the knockback slot, not a distance: the
 *            distance is mag² ÷ (2 · KNOCKBACK_DRAG) and follows from it.
 *   boost/weaken  shorter than the cooldown that carries them, or they stop
 *            being an ability and become a body stat.
 *   wall     one per caster, and it now outlives every cooldown that can build
 *            it — the only lever a piece already at the price floor has left.
 *
 * THE LIVE NUMBERS ARE THE FIELDS BELOW. The evidence behind them is
 * `reports/combat/atombalance-panel-v5.md` — the pass the current prices were
 * set from — the three passes before it, and `atombalance-panel-r1.md`, the
 * first pass after the round-1 fixes (same prices, the magnitudes above), which
 * is the one the price table in the comment before `EFFECTS` now quotes. A
 * magnitude no price can fix (a
 * piece with a significant negative value under every pilot) is re-scaled and
 * the run repeated: `docs/COMBAT.md` §5.
 */
export const EFFECTS = table({
  damage: { id: 'damage', ru: 'Damage', klass: TARGETED, cost: 10, vfx: 'a flash of impact on the target', mag: 24 },
  burn: { id: 'burn', ru: 'Burn', klass: TARGETED, cost: 10, vfx: 'a smouldering trail on the body of the target', mag: 8.0, duration: 3 },
  /* `mag` is an impulse in m/s on the knockback slot, decaying at
     KNOCKBACK_DRAG (config.js): it moves a body mag² ÷ (2 · drag) metres —
     2.0 m for the knock, 2.35 m for the pull — whatever the body weighs or wants. */
  knock: { id: 'knock', ru: 'Knockback', klass: TARGETED, cost: 1, vfx: 'a wave from the point of impact', mag: 10.0 },
  pull: { id: 'pull', ru: 'Pull', klass: TARGETED, cost: 1, vfx: 'lines converging on the caster', mag: 6.5 },
  /*
   * `immune` — seconds of immunity to the SAME control the target keeps
   * after it expires (effects.js). At cooldowns of three seconds and under a
   * control that could be re-applied on cooldown is a fighter who never
   * plays; the window makes every stun a MOMENT the caster has to choose,
   * not a rhythm it can hold. Sized so that the control plus its immunity is
   * longer than the fastest cooldown that can carry it.
   */
  stun: { id: 'stun', ru: 'Stun', klass: TARGETED, cost: 1, vfx: 'a ring above the head of the target', duration: 1.0, immune: 3.0 },
  root: { id: 'root', ru: 'Root', klass: TARGETED, cost: 2, vfx: 'clamps at the feet of the target', duration: 2.2, immune: 3.0 },
  shield: { id: 'shield', ru: 'Shield', klass: SELF, cost: 9, vfx: 'a shell tracing the silhouette of the body', mag: 12, duration: 2.5 },
  /* A heal gives `share` of the hp that is missing, never less than `floor`,
     never more than `mag` (effects.js): it rewards the mind that heals when
     it is hurt and gives almost nothing to one that heals on cooldown. */
  /* 9% of the missing hp, cap 12 (was 12% / 16, fix round 1): with the share
     rule no longer taxing controls, a heal+shield aura at 0.85 share still
     gave up to 13.6 + 10.2 hp per 3 s ≈ 7.9 hp/s — one sustain slot cancelled
     one bolt of damage (≈ 8.2 dps), and two sustain kits could not finish
     each other: the C-vs-D mirror reached the 30 s burn clock in 100 % of
     fights at a mean 42 s (`reports/combat/review-r1-balance.md` §3). A heal
     is still a share of what is missing; it is just a smaller one. */
  heal: { id: 'heal', ru: 'Heal', klass: SELF, cost: 10, vfx: 'rising sparks', mag: 12, floor: 4, share: 0.09 },
  cleanse: { id: 'cleanse', ru: 'Cleanse', klass: SELF, cost: 5, vfx: 'a shell shrugged off' },
  blind: { id: 'blind', ru: 'Blind', klass: TARGETED, cost: 1, mind: true, vfx: 'interference over the silhouette of the target', duration: 2.2, immune: 3.0 },
  silence: { id: 'silence', ru: 'Silence', klass: TARGETED, cost: 3, mind: true, vfx: 'a struck-through cast sign', duration: 1.8, immune: 3.0 },
  /* 5 s (was 4) and transparent to its own caster's beam, bolt and line of
     sight (deliver.js `shotSolids`, fix round 1): a wall grows in front of its
     caster, so on an attack ability it blocked the caster's own next shot —
     an atom that cancelled itself, −7.3 pp at cost 1, which no price could
     fix. Cover you shoot from behind, still a solid for every body. */
  wall: { id: 'wall', ru: 'Wall', klass: WORLD, cost: 1, vfx: 'a slab growing out of the floor', duration: 5, size: [4, 1] },
  boost: { id: 'boost', ru: 'Boost', klass: SELF, cost: 1, needsChannel: true, vfx: 'a glow along the channel', mag: 1.6, duration: 4.0 },
  weaken: { id: 'weaken', ru: 'Weaken', klass: TARGETED, cost: 1, needsChannel: true, vfx: 'a dimming along the channel', mag: 0.4, duration: 2.8 },
});

/**
 * Каналы. `mind`-класс дороже: канал, который бьёт по чувствам и решениям,
 * стоит больше канала, который двигает число.
 */
export const CHANNELS = table({
  speed: { id: 'speed', ru: 'Speed', cost: 3 },
  turn: { id: 'turn', ru: 'Turning', cost: 1 },
  damage: { id: 'damage', ru: 'Damage', cost: 3 },
  armor: { id: 'armor', ru: 'Armour', cost: 2 },
  cooldown: { id: 'cooldown', ru: 'Cooldown', cost: 10 },
  range: { id: 'range', ru: 'Range', cost: 1 },
  vision: { id: 'vision', ru: 'Vision', cost: 1, mind: true },
});

/**
 * Элементы. ТОЛЬКО ВИЗУАЛ (решение 28.08): механическая роль — профиль
 * сопротивлений — убрана вместе с резистами. Элемент задаёт палитру, силуэт
 * снаряда и импакт и **не трогает ни одного числа**, поэтому его цена — 0.
 *
 * Словарь обязан быть правдоподобным против РОБОТА: `venom` исключён — яд
 * машине ничто. `acid` — кандидат на замену, открытый вопрос §8.
 */
/* Все девять доставок: у пяти СТАРЫХ стихий формы не ограничены (правило E1
   появилось вместе с новыми и на старые не наводится задним числом). */
const ALL_FORMS = Object.keys(DELIVERIES);

export const ELEMENTS = table({
  kinetic: { id: 'kinetic', ru: 'Kinetic', cost: 0, palette: ['#d8e2ea', '#9fb4c4', '#5d7183'], read: 'a blunt strike', forms: ALL_FORMS },
  ember: { id: 'ember', ru: 'Ember', cost: 0, palette: ['#ffd9a0', '#ff9a4d', '#c8431c'], read: 'overheating', forms: ALL_FORMS },
  /* Мороз и дуга были двумя оттенками одного голубого: замер по пикселям
     давал между ними разницу меньше порога различимости, и «элемент владеет
     палитрой» (§9.2) превращалось в «элемент владеет подписью». Мороз уведён
     в бирюзу, дуга — в электрический синий. Измеряется в Lab: ни одна из
     десяти пар не должна сходиться ближе ΔE 10, порога, ниже которого цвета
     на движущейся частице уже неразличимы. Проверяет `tools/checkgrammar.mjs`. */
  frost: { id: 'frost', ru: 'Frost', cost: 0, palette: ['#e8fbff', '#7fe3e0', '#1f8f9d'], read: 'icing and brittleness', forms: ALL_FORMS },
  arc: { id: 'arc', ru: 'Arc', cost: 0, palette: ['#eef8ff', '#8ecbff', '#0a5cff'], read: 'electricity', forms: ALL_FORMS },
  void: { id: 'void', ru: 'Void', cost: 0, palette: ['#e6dcff', '#a98cf0', '#4b2f8c'], read: 'unearthly, but unmistakable', forms: ALL_FORMS },

  /*
   * ЧЕТЫРЕ НОВЫЕ СТИХИИ (решение основателя 03.09, docs/VFX-PLAN.md §6).
   * «Не каждой стихии нужны все формы. У времени может не быть ни луча, ни
   * снаряда, ни урона вовсе; гравитация может существовать только ради
   * притяжения. Подумайте, ЗАЧЕМ каждая: большинство из них — ради
   * разнообразия эффектов, а не ради урона.» Отсюда `forms` и правило E1.
   *
   * ВЫПУЩЕНЫ 04.09 (шаг 11 плана, §7.5) — ЧЕТЫРЕ: гравитация, кислота,
   * радиация и лазер. Заказ основателя был про то, «чтобы в следующий раз,
   * как бы я ни создавал существо, оно всегда генерировалось с правильными
   * скиллами»: пока флаг стоял, `grammar()` не показывал стихию модели
   * вовсе, то есть ни одно существо игрока не могло получить ни гравитацию,
   * ни кислоту — а именно ими и написаны модули вьювера. Механика при этом
   * не двигается ни на число: элемент стоит 0 и правит только вид (28.08).
   *
   * ВРЕМЯ ОСТАЁТСЯ ЗАКРЫТЫМ, И ЭТО ОТДЕЛЬНЫЙ ЗАКАЗ, А НЕ НЕДОСМОТР. 04.09 я
   * снял флаг заодно и с него — «чтобы существо всегда генерировалось с
   * правильными скиллами». Про время такого заказа не было, а основатель
   * просил обратного, и не в первый раз: «я просил отключить время — чтобы
   * времени вообще не было в скиллах, чтобы никто не мог создать время».
   * Флаг возвращён. `src/viewer/vfx/time.js` не тронут и не будет: стихия
   * остаётся в таблице, в сидах и на стенде (`data/vfx-stand.db`, существо
   * ХРОНОС), закрыта РОВНО выдача наружу — модели, клиенту и счёту
   * прочтений. Ради этого `unreleased` и заведён; кто соберётся снимать его
   * со времени — сначала письменное согласие основателя, как в §7.5.
   *
   * Что откат потянул за собой, всё в этом же коммите: счёт прочтений
   * 678 → 654 (перебор, а не умножение: у времени 24 законных прочтения из
   * 678 — E1 оставляет ему зону, себя и мигание), порог в `selfTest` и
   * `checkspec` 10 → 9, те же три строки `SPEC.md`, и четыре живых существа
   * со временем в `data/airena.db` списаны в `state = 'retired'` — как это
   * делает `tools/retire.mjs`, строкой, а не удалением. Механизм
   * `unreleased`/`releasedElements` НЕ удалён: он пригодился в тот же день,
   * когда им воспользовались в другую сторону.
   *
   * Палитры проверены формулой ΔE гейта `checkgrammar`: ни одна пара из
   * девяти стихий не сходится ближе 21.7 при пороге 10.
   */
  gravity: { id: 'gravity', ru: 'Gravity', cost: 0, palette: ['#eef0f4', '#6f7a8c', '#141821'], read: 'weight and attraction', forms: ['zone', 'self', 'lob'] },
  time: { id: 'time', ru: 'Time', cost: 0, palette: ['#fff4e4', '#d4b48a', '#4a2c10'], read: 'time slowing down', forms: ['zone', 'self', 'blink'], unreleased: true },
  acid: { id: 'acid', ru: 'Acid', cost: 0, palette: ['#f4ffb0', '#9ee83a', '#3d7a12'], read: 'corrosion', forms: ['cone', 'lob', 'zone', 'bolt'] },
  radiation: { id: 'radiation', ru: 'Radiation', cost: 0, palette: ['#fffbe0', '#ffe14a', '#4b4f18'], read: 'contamination', forms: ['zone', 'lob', 'cone'] },

  /*
   * ЛАЗЕР — простой красный луч (заказ основателя: «обычный базовый красный
   * лазер»). Нарочно противоположен штатному лучу Nova (`novabeam.js`) с его
   * лентами, кольцами и куполом: здесь прямая линия и выстрел, и вся работа —
   * в том, чтобы они читались на белом полу. Формы только две: луч и болт;
   * лазеру нечем ставить зону и незачем щит.
   *
   * Багровый выбран замером той же формулой, что и в гейте `checkgrammar`
   * (ΔE по Lab между `P[1]` и `P[2]` каждой пары): ближайший сосед — время,
   * ΔE 30.4 при пороге 10. Красный жара (`ember` #ff9a4d) держится в 24.6:
   * лазер холоднее и темнее в глубине, огонь теплее и светлее.
   */
  laser: { id: 'laser', ru: 'Laser', cost: 0, palette: ['#ffdede', '#e63030', '#6e0a12'], read: 'a laser burn', forms: ['beam', 'bolt'] },
});

/**
 * Стихии, отданные наружу. `unreleased: true` — стихия не выпущена: она есть
 * для сидов и стенда, но модели, клиенту и счёту прочтений не показывается.
 * Причины две и обе живые: модуль ещё не принят (docs/VFX-PLAN.md §7.5) или
 * основатель закрыл стихию отдельным заказом — так закрыто время.
 *
 * Порог в `selfTest` и в гейте ТЗ считается ПО ЭТОМУ СПИСКУ, а не по всей
 * таблице: выпущенных 9, в таблице 10. Сам порог оставлен числом нарочно —
 * это растяжка: снимут флаг мимо заказа, и `selfTest` скажет об этом вслух,
 * а не пересчитает молча под новую правду. Число же, которое УХОДИТ НАРУЖУ
 * (счёт прочтений), наоборот считается перебором — см. `readingCount`.
 */
export function releasedElements() {
  return table(Object.fromEntries(Object.entries(ELEMENTS).filter(([, e]) => !e.unreleased)));
}

/**
 * L2 — правило ЖИЗНЕСПОСОБНОСТИ. Не о законности, а о том, что бой можно
 * закончить.
 *
 * ЗАЧЕМ ОНО ПОЯВИЛОСЬ. Грамматика проверяла законность и бюджет и ни разу —
 * может ли набор победить. Модель, читая описание игрока, собирает набор по
 * СМЫСЛУ: «слепит и путает» превращается в ослепление, немоту и один рывок с
 * уроном. Он законен, он в бюджете, он точно описывает замысел — и он не
 * выигрывает никогда.
 *
 * Замерено дважды и независимо. Стартовый «диверсант» из трёх пресетов брал
 * 0 из 112 боёв (D30). Три существа, собранные моделью через продуктовый путь
 * и заселённые в библиотеку, взяли 0 из 86 на троих: у каждого ровно ОДИН
 * источник урона.
 *
 * Правило поэтому простое и грубое: в наборе должно быть не меньше двух
 * умений, способных снимать здоровье. Грубое намеренно — это не тонкая
 * оценка силы (её делает `tools/kitbalance.mjs`), а нижняя граница, ниже
 * которой набор не игра, а декорация.
 *
 * Оно НЕ запрещает характер: ослепляющий навес с уроном — и характер, и
 * источник урона сразу. Оно запрещает набор, у которого источника нет.
 */
export const DAMAGING = new Set(['damage', 'burn']);

/*
 * ПОЧЕМУ ОДИН, А НЕ ДВА.
 *
 * Первая версия требовала двух источников урона, и это выглядело разумно:
 * все три набора, собранные моделью и проигравшие всё, имели ровно один.
 * Замер, однако, правило не подтвердил. «Держит дистанцию» тоже имеет один
 * источник — снаряд с уроном — и берёт 57% в круговой лиге. А «бронекраб» с
 * одним источником не берёт ничего. Разница не в числе умений: у первого
 * дальний бой и живучесть, у второго ближний рывок, которым надо ещё дойти.
 *
 * То есть жизнеспособность СТАТИЧЕСКИМ правилом не предсказывается — её
 * меряют боями (`tools/kitbalance.mjs`). Правило поэтому оставлено ровно
 * настолько сильным, насколько оно доказуемо: набор без единого источника
 * урона не может закончить бой НИКОГДА, при любом теле и любом мозге. Это
 * арифметика, а не оценка.
 *
 * Всё, что тоньше, — работа замера и предупреждения на экране, а не запрета.
 */
export const MIN_DAMAGING_SKILLS = 1;

/** Сколько умений в наборе способны снимать здоровье. */
export function damagingCount(kit) {
  if (!Array.isArray(kit)) return 0;
  let n = 0;
  for (const s of kit) {
    const eff = Array.isArray(s?.effects) ? s.effects : [];
    if (eff.some((e) => DAMAGING.has(e))) n++;
  }
  return n;
}

/**
 * L1 — первое правило легальности: доставка К СЕБЕ не бьёт противника.
 * Второе — E1 (docs/VFX-PLAN.md §7.5, 03.09): `ELEMENTS[x].forms` — закрытый
 * список доставок стихии, и «не каждой стихии нужны все формы».
 */
export const SELF_ALLOWED = new Set(['shield', 'heal', 'cleanse', 'boost', 'wall']);

/**
 * Доставки, которые идут ПО ЗЕМЛЕ, — и потому проходят под тем, кто в воздухе.
 *
 * Список закрытый и живёт здесь, а не в резолвере, по той же причине, по
 * которой здесь живут цены: он — часть грамматики, его читают три места
 * (симуляция, промпт мозга, карточка умения), и три копии разошлись бы на
 * первой же правке.
 *
 * Почему именно эти три. Конус — это взмах на уровне пола, зона — диск НА
 * полу, рывок — тело, едущее по полу. Луч и снаряд идут на высоте груди,
 * навес падает сверху, а мигание, «на себя» и сам прыжок цели не касаются.
 * То есть правило не «уклоняйся от чего хочешь», а «уклоняйся от того, что
 * видно, что оно низкое».
 */
export const GROUND_DELIVERIES = new Set(['cone', 'zone', 'dash']);

/**
 * Бюджет силы одного скилла. Сервер пересчитывает его заново перед матчем.
 *
 * 22 — не круглое число, а результат перебора. §8 разрешает брать 1–3 эффекта;
 * вопрос в том, при каком потолке эта ось действительно доступна.
 *
 * ПЕРЕБОР ВСЕГО, ЧТО ЗАКОННО ПО ГРАММАТИКЕ (L1, L2, дубли, каналы; элемент
 * зафиксирован — он ничего не стоит и только умножает счёт на пять):
 *
 *     всего законных умений                              9 243
 *     самое дорогое: beam/damage+burn+boost/vision — 32 очка
 *
 * (Числа этого перебора — те, при которых бюджет выбирали. Живой перебор
 * сегодня даёт 8 691: см. таблицу ниже и `tools/checkgrammar.mjs`, который
 * его и повторяет.)
 *
 *     бюджет   допущено   из них трёхэффектных   доля
 *         16        559                      0    0%
 *         18      1 198                      0    0%
 *         20      1 696                     23    1%
 *         22      2 059                    322   16%   ← выбран
 *         24      3 488                  1 751   50%
 *         26      6 110                  4 373   72%
 *         30      9 195                  7 458   81%
 *
 * (Пересчитано 01.09 после D160: девятая доставка `jump` класса SELF даёт
 * +91 законное умение — она несёт только пять атомов из SELF_ALLOWED. Вывод
 * перебора не сдвинулся ни на шаг: доля трёхэффектных при 22 как была 16%,
 * так и осталась.)
 *
 * ── ВОПРОС, КОТОРЫЙ ВИСЕЛ ПОСЛЕ СНЯТИЯ ТРИГГЕРОВ, ЗАКРЫТ ───────────────────
 *
 * D102 отметил, что вместе с осью «триггер» ушла её цена, у каждого умения
 * освободилось до двух очков, и рассуждение, которым выбрали 22, стало
 * указывать на 20: трёхэффектных при 22 оказалось 33% вместо прежних 21%.
 * Бюджет тогда не трогали намеренно — это отдельное решение.
 *
 * Трогать и не пришлось. Перебор под текущими ценами (`tools/checkgrammar.mjs`,
 * он же это и проверяет) даёт 322 трёхэффектных умения из 2059 при бюджете 22
 * — 16%, — и 1751 из 3488 при 24 — 50%. То есть исходное рассуждение — «до 20
 * третий эффект недостижим, с 24 перестаёт быть редкостью, 22 оставляет их
 * дорогими и возможными» — снова даёт 22.
 *
 * (Здесь стояли 19% и 48%: числа из головы, разошедшиеся с гейтом, который
 * считает то же самое строкой ниже. Проза, пересказывающая соседнюю таблицу
 * по памяти, — это третий источник правды.)
 *
 * Мораль стоит записать: расхождение, которое не стали чинить сразу, а
 * записали и оставили, исчезло само, когда починили настоящую причину. Если
 * бы бюджет тогда опустили до 20, сейчас пришлось бы поднимать обратно, и
 * все существующие наборы пересчитались бы дважды.
 *
 * Числа держит `tools/checkgrammar.mjs`: он повторяет этот перебор на каждом
 * прогоне и падает, если они разъехались.
 */
/*
 * ── RE-DERIVED 07.09 UNDER THE NEW WEIGHTS ─────────────────────────────────
 *
 * The 07.09 re-pricing (measured by `tools/atombalance.mjs` on the four-pilot
 * panel) lowered most control atoms and raised damage, heal and shield. The
 * enumeration under the new prices:
 *
 *     всего законных умений                              8 691
 *     самое дорогое                                     31 очко
 *
 *     бюджет   допущено   из них трёхэффектных   доля
 *         20      6 520                  4 875   75%
 *         22      7 593                  5 940   78%   ← выбран
 *
 * (Пересчитано 07.09: `validateSkill` перестала пропускать ослабление по
 * каналу «откат» — оно держало плитку дольше трёх секунд, не показывая этого
 * ни одной цифрой на экране. Минус 552 законных умения; доли трёхэффектных,
 * на которых стоит выбор потолка, не сдвинулись ни на пункт.)
 *
 * The ceiling barely binds now: the measured prices put every control at
 * 1–3 points, so a third effect is cheap and its cost is paid in SHARE
 * (0.7 of each magnitude, compile.js), not in points. That is the intended
 * trade — the ceiling exists to stop the two dear pieces, damage (9) and
 * burn (7), from stacking with sustain on one ability.
 *
 * 18 would have kept the old "the third effect is rare" share, and it was
 * measured against the stored kits: 18 creatures out of 78 would have been
 * over the ceiling — a shield+heal aura costs 19, a fan of damage+burn 22.
 * The rule that decides is the founder's (07.09): an unbalanced set may
 * exist; a player's set must not silently stop working. 22 keeps every stored
 * ability legal under the measured prices (damage 9, burn 7 — the two pieces
 * the panel valued highest), and with the gentler effect share (compile.js) a
 * third effect at 0.7 is a choice, not a trap. `tools/checkgrammar.mjs`
 * re-runs this enumeration and fails when it drifts.
 */
export const SKILL_BUDGET = 28;
/**
 * Бюджет всего кита. Не 3 × SKILL_BUDGET: три максимальных скилла (66) — это
 * набор без единого выбора. 52 значит «три крепких по 17 или один дорогой и
 * два поскромнее», то есть решение, а не сложение.
 */
/* 56 holds every stored set under the measured prices (the dearest, a
   STONE GOLEM of three two-effect abilities, sits at 55), and 2.5 abilities
   at the ceiling is still not three. */
export const KIT_BUDGET = 60;
/** Каждое существо несёт ровно 3 скилла (зафиксировано 28.08). */
export const KIT_SIZE = 3;

/**
 * Цена скилла. Считается ТОЛЬКО здесь, и только на сервере: цифры, присланные
 * клиентом или LLM, не авторитетны (§8).
 */
export function costOf(skill) {
  const d = DELIVERIES[skill.delivery];
  if (!d) return Infinity;
  let sum = d.cost;
  for (const e of skill.effects || []) {
    const a = EFFECTS[e];
    if (!a) return Infinity;
    sum += a.cost;
  }
  if (skill.channel) {
    const c = CHANNELS[skill.channel];
    if (!c) return Infinity;
    sum += c.cost;
  }
  /* Два и три эффекта на одном скилле дорожают сверх суммы: комбинация стоит
     больше своих частей, потому что попадание одно, а срабатывает всё. */
  const n = (skill.effects || []).length;
  if (n === 2) sum += 2;
  if (n >= 3) sum += 5;
  return sum;
}

/**
 * Проверка легальности. Возвращает список нарушений — пустой значит «годен».
 * Список, а не первое нарушение: игроку показывается всё сразу, иначе он
 * чинит кит по одному сообщению за раз.
 */
export function validateSkill(skill) {
  const bad = [];
  if (!skill || typeof skill !== 'object') return [{ code: 'shape', ru: 'the ability is not an object' }];
  if (!DELIVERIES[skill.delivery]) bad.push({ code: 'delivery', ru: `no such delivery: ${skill.delivery}` });
  const eff = Array.isArray(skill.effects) ? skill.effects : [];
  if (eff.length < 1 || eff.length > 3) bad.push({ code: 'effects_count', ru: 'an ability carries from 1 to 3 effects' });
  if (new Set(eff).size !== eff.length) bad.push({ code: 'effects_dup', ru: 'the effects repeat' });
  for (const e of eff) if (!EFFECTS[e]) bad.push({ code: 'effect', ru: `no such effect: ${e}` });
  if (skill.element && !ELEMENTS[skill.element]) bad.push({ code: 'element', ru: `no such element: ${skill.element}` });

  const needsChannel = eff.some((e) => EFFECTS[e]?.needsChannel);
  if (needsChannel && !CHANNELS[skill.channel]) {
    bad.push({ code: 'channel', ru: 'Boost and Weaken have to name a channel' });
  }
  if (!needsChannel && skill.channel) bad.push({ code: 'channel_extra', ru: 'a channel is named, but nothing here turns it' });

  /*
   * WEAKEN CANNOT TURN THE COOLDOWN CHANNEL, AND BOOST STILL CAN.
   *
   * The founder's rule is absolute: no ability ever waits longer than three
   * seconds. Every chip in the game obeys it — and a weaken on the cooldown
   * channel broke it INVISIBLY. `sim.js` counts a cooldown down at
   * `DT × channelMul(f, 'cooldown')`, so ×0.65 for 2.8 s does not raise the
   * number on the tile, it makes the tile count slower: measured with a
   * bolt:weaken/cooldown against a plain kit over six seeds, a 3 s aura was
   * still on cooldown 4.60 s after the cast, and 1 587 of 11 687 cooling ticks
   * ran past cooldown + one tick. The chip never read above 3.000, so nothing
   * on screen and no gate could see the rule break.
   *
   * The alternative — apply the multiplier to the STARTING value of the next
   * cooldown and clamp to 3 s — keeps the piece at the cost of a second rule
   * about when a channel is read. Refused: a promise the player can check on
   * the tile is worth more than one weaken/channel pair, and the pair is worth
   * nothing anyway (weaken measured −4.7 in four passes running). Checked
   * against the database before the rule was written: 0 of 78 stored creatures
   * carry any ability on the cooldown channel at all, so nothing legal today
   * stops working.
   *
   * Boost keeps it. A cooldown that counts down FASTER cannot break a ceiling.
   */
  if (skill.channel === 'cooldown' && eff.includes('weaken')) {
    bad.push({
      code: 'channel_weaken_cooldown',
      ru: 'Weaken cannot turn the Cooldown channel: it would hold a tile past the three-second ceiling. Boost may.',
    });
  }

  /*
   * L1 — первое из двух исключений в грамматике (второе — E1 ниже).
   *
   * Правило написано про КЛАСС доставки, а не про её имя. Это не педантизм:
   * SELF-класс носят две доставки, `self` и `blink`, и проверка по имени
   * оставляла мигание открытым. `blink:damage` — это доставка, которая
   * применяет TARGETED-атом без проверки дальности, без линии взгляда и с
   * нулевым замахом, то есть неуклонимый удар на любую дистанцию без
   * телеграфа. В лиге доставок мигание с уроном шло первым (76.0%), и это
   * измеряло не силу формы, а дыру в правиле.
   *
   * Смысл L1 ровно один: то, что доставляется К СЕБЕ, не может бить
   * противника. Мигание доставляется к себе — оно переносит кастера.
   */
  if (DELIVERIES[skill.delivery]?.klass === 'self') {
    for (const e of eff) {
      if (!SELF_ALLOWED.has(e)) {
        /* Имя доставки берётся из таблицы, а не выбирается тернарником: с
           появлением прыжка SELF-класс носят три доставки, и захардкоженная
           развилка на две назвала бы прыжок «на себя». */
        bad.push({ code: 'L1', ru: `${EFFECTS[e]?.ru || e} cannot be delivered: ${DELIVERIES[skill.delivery].ru} applies to the caster` });
      }
    }
  }

  /*
   * E1 — стихия бывает не всякой доставкой (решение основателя 03.09: «не
   * каждой стихии нужны все формы»). У времени нет луча и снаряда, у
   * гравитации — только зона, себя и навес: см. `ELEMENTS[x].forms`.
   *
   * Только ПРИ ЗАКОННОЙ ДОСТАВКЕ: на злом входе (`delivery: '__proto__'`,
   * которым кормит `checkgrammar`) `DELIVERIES[...]` — undefined, и правило
   * молчит, чтобы не подменять сообщение о несуществующей доставке.
   */
  const d0 = DELIVERIES[skill.delivery];
  const el = ELEMENTS[skill.element];
  if (d0 && el && Array.isArray(el.forms) && !el.forms.includes(skill.delivery)) {
    bad.push({ code: 'E1', ru: `${el.ru} does not come as ${d0.ru}: this element only has ${el.forms.map((f) => DELIVERIES[f]?.ru || f).join(', ')}` });
  }

  const cost = costOf(skill);
  if (cost > SKILL_BUDGET) bad.push({ code: 'budget', ru: `the ability costs ${cost} points out of ${SKILL_BUDGET}` });
  return bad;
}

export function validateKit(kit, { size = KIT_SIZE } = {}) {
  const bad = [];
  if (!Array.isArray(kit)) return [{ code: 'shape', ru: 'the set of abilities is not an array' }];
  /* `size: null` — только для измерительных инструментов, которые сравнивают
     наборы из одного и двух умений. Бюджет и запрет дублей действуют всегда:
     ослабить их значило бы мерить не ту игру, которая выйдет. */
  if (size !== null && kit.length !== size) bad.push({ code: 'size', ru: `a set holds exactly ${size} abilities, got ${kit.length}` });
  kit.forEach((s, i) => {
    for (const b of validateSkill(s)) bad.push({ ...b, slot: i });
  });
  const total = kit.reduce((s, k) => s + costOf(k), 0);
  if (total > KIT_BUDGET) bad.push({ code: 'kit_budget', ru: `the set costs ${total} points out of ${KIT_BUDGET}` });
  /* Три одинаковых скилла — это один скилл с тремя кулдаунами. Читаемости
     ноль, а именно она — предмет §8. */
  const sig = kit.map((s) => `${s.delivery}:${(s.effects || []).join('+')}`);
  if (new Set(sig).size < sig.length) bad.push({ code: 'kit_dup', ru: 'two abilities in the set do the very same thing' });
  /*
   * НЕРЕЛИЗНАЯ СТИХИЯ (docs/VFX-PLAN.md §7.5) — правило НАБОРА, и это
   * намеренно. `compileKit` пробрасывает наружу только `size`, `kit_budget` и
   * `kit_dup`, так что сиды и чтение из базы продолжают компилироваться, а
   * игроку через HTTP (`api.js` зовёт `validateKit`) стихия без принятого
   * модуля не отдаётся. Сид, который её ставит, обязан сам отфильтровать
   * этот код — см. `tools/seedvfx.mjs`.
   */
  kit.forEach((s, i) => {
    const el = ELEMENTS[s?.element];
    /* «не выпущена», а не «ещё не выпущена»: у флага две причины, и вторая —
       не ожидание, а запрет. Время закрыто заказом основателя, и обещать
       игроку в тексте отказа скорую выдачу значит обещать за основателя. */
    if (el?.unreleased) bad.push({ code: 'element_unreleased', slot: i, ru: `the element ${el.ru} is not released` });
  });

  /* L2: набор обязан уметь закончить бой — см. комментарий к DAMAGING. */
  if (size !== null && damagingCount(kit) < MIN_DAMAGING_SKILLS) {
    bad.push({
      code: 'L2',
      ru: 'nothing in the set takes health away — a fight cannot be finished with it',
    });
  }
  return bad;
}

/** A readable name for one ability — for the card and for the "did not fit" list. */
export function describe(skill) {
  const d = DELIVERIES[skill.delivery];
  const eff = (skill.effects || []).map((e) => EFFECTS[e]?.ru || e).join(' + ');
  const el = ELEMENTS[skill.element];
  const ch = skill.channel ? CHANNELS[skill.channel] : null;
  const bits = [`${d?.ru || skill.delivery}: ${eff}`];
  if (ch) bits.push(`through the ${ch.ru} channel`);
  if (el) bits.push(`· ${el.ru}`);
  return bits.join(' ');
}

/**
 * Сколько различимых прочтений даёт грамматика — для отчёта и для промпта.
 *
 * СЧИТАЕТСЯ ПЕРЕБОРОМ ЧЕРЕЗ `validateSkill`, а не формулой.
 *
 * Формула была: доставка × эффект × элемент, минус запреты `self`. Она
 * повторяла правила своими словами — и отстала от них. `validateSkill`
 * запрещает не только `self` с уроном, но и `blink`: рывок переносит тело, а
 * не наносит удар, и девять боевых эффектов на нём незаконны. Формула про это
 * не знала и отдавала 515 прочтений там, где законных 470 — ровно на 45
 * больше (9 пар × 5 элементов). Число уезжало в отчёт, в README и в промпт
 * генерации: модели сообщали, что у неё богаче выбор, чем есть.
 *
 * Перебор не может отстать от правил, потому что спрашивает их напрямую.
 *
 * КАНАЛ НЕ УМНОЖАЕТ. С каналами законных сочетаний 890, но §9.2 отдаёт
 * внешний вид трём осям: доставка — силуэт, элемент — палитра, эффект —
 * удар. Канал меняет, ПО ЧЕМУ бьёт замедление, а не как оно выглядит; на
 * экране «медленнее ходит» и «медленнее откатывается» — один и тот же кадр.
 * Считать их за два прочтения значило бы обещать разнообразие, которого
 * игрок не увидит.
 */
export function readingCount() {
  /* Перебор ПО СТИХИЯМ, а не умножение на их число: с правилом E1 стихии
     перестали быть ортогональны доставкам — у времени нет луча, и умножение
     насчитало бы прочтения, которых грамматика не пропустит. Считаются
     только ВЫПУЩЕННЫЕ: нерелизная стихия игроку не предлагается. */
  let n = 0;
  for (const el of Object.keys(releasedElements())) {
    for (const d of Object.keys(DELIVERIES)) {
      for (const e of Object.keys(EFFECTS)) {
        const chs = EFFECTS[e].needsChannel ? Object.keys(CHANNELS) : [null];
        if (chs.some((ch) => !validateSkill({ delivery: d, effects: [e], element: el, ...(ch ? { channel: ch } : {}) }).length)) n++;
      }
    }
  }
  return n;
}

/**
 * Самопроверка реестра. Гоняется тестом и релизным гейтом: атом без
 * VFX-сигнатуры не должен доезжать до игрока, потому что разнообразие,
 * которого игрок не видит, разнообразием не является.
 */
export function selfTest() {
  const errs = [];
  for (const [id, a] of Object.entries(EFFECTS)) {
    if (!a.vfx) errs.push(`effect ${id} has no VFX signature`);
    if (!a.klass) errs.push(`effect ${id} has no class`);
    if (!Number.isFinite(a.cost)) errs.push(`effect ${id} has no cost`);
  }
  for (const [id, d] of Object.entries(DELIVERIES)) {
    if (!d.silhouette) errs.push(`delivery ${id} has no silhouette`);
    if (!Number.isFinite(d.cost)) errs.push(`delivery ${id} has no cost`);
  }
  for (const [id, e] of Object.entries(ELEMENTS)) {
    if (!Array.isArray(e.palette) || e.palette.length !== 3) errs.push(`element ${id} has no palette of three colours`);
    if (e.cost !== 0) errs.push(`element ${id} costs points — an element is visual only`);
  }
  if (Object.keys(DELIVERIES).length !== 9) errs.push('there must be 9 deliveries');
  if (Object.keys(EFFECTS).length !== 14) errs.push('there must be 14 effects');
  if (Object.keys(CHANNELS).length !== 7) errs.push('there must be 7 channels');
  if (Object.keys(releasedElements()).length !== 9) errs.push('there must be 9 released elements');
  for (const [id, e] of Object.entries(ELEMENTS)) {
    if (e.forms && e.forms.some((f) => !DELIVERIES[f])) errs.push(`element ${id}: forms names a delivery that does not exist`);
  }
  return errs;
}

/** Весь реестр одним объектом — для клиента и для промпта генерации. */
export function grammar() {
  return {
    deliveries: DELIVERIES,
    effects: EFFECTS,
    channels: CHANNELS,
    elements: releasedElements(),
    selfAllowed: [...SELF_ALLOWED],
    budgets: { skill: SKILL_BUDGET, kit: KIT_BUDGET, size: KIT_SIZE },
    readings: readingCount(),
  };
}
